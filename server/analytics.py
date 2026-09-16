"""Opt-in website events. No identities, URLs, free text, or public reports."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from collections import OrderedDict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool

DB_PATH = os.getenv("ANALYTICS_DB_PATH", "")
MAX_ROWS = 200_000
MAX_BODY = 8192
RETENTION_SECONDS = 90 * 86400 - 3600
VALUES = {
    "page": {"home", "get", "help", "privacy", "terms", "tutorial"},
    "locale": {"lv", "en"},
    "platform": {"ios", "android", "other"},
    "placement": {"header", "hero", "footer", "result", "body"},
    "target": {"home", "download", "help", "privacy", "terms", "tutorial", "language", "faq", "safety", "features", "external_service"},
}
EVENTS = {
    "page_view": set(),
    "store_click": {"platform", "placement"},
    "navigation_click": {"target", "placement"},
    "app_redirect": {"platform"},
}
HEADERS = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
_salt = secrets.token_bytes(32)
_clients: OrderedDict[str, deque] = OrderedDict()
_global: deque = deque()
_lock = asyncio.Lock()


def database() -> sqlite3.Connection:
    if not DB_PATH:
        raise ValueError("disabled")
    path = Path(DB_PATH)
    public = Path(__file__).resolve().parents[1] / "public"
    if not path.is_absolute() or path.is_symlink() or path.resolve().is_relative_to(public):
        raise ValueError("private absolute database path required")
    # Provision the private parent directory as a durable volume; never create it here.
    if not path.parent.is_dir():
        raise ValueError("database directory missing")
    if not path.exists():
        try:
            descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(descriptor)
        except FileExistsError:
            # Another config/ingestion request may have created the same DB.
            if path.is_symlink() or not path.is_file():
                raise ValueError("private database file required") from None
    db = sqlite3.connect(path, timeout=2)
    try:
        db.execute("PRAGMA journal_mode=DELETE")
        db.execute("CREATE TABLE IF NOT EXISTS events (created INTEGER NOT NULL, session TEXT NOT NULL, seq INTEGER NOT NULL, event TEXT NOT NULL, props TEXT NOT NULL, UNIQUE(session, seq))")
        db.execute("CREATE INDEX IF NOT EXISTS events_created ON events(created)")
        db.commit()
        return db
    except Exception:
        db.close()
        raise


def purge() -> None:
    db = database()
    try:
        with db:
            db.execute("DELETE FROM events WHERE created < ?", (int(time.time()) - RETENTION_SECONDS,))
    finally:
        db.close()


async def maintenance():
    while True:
        try:
            await run_in_threadpool(purge)
        except (ValueError, OSError, sqlite3.Error):
            pass
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(_):
    task = asyncio.create_task(maintenance())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


router = APIRouter(lifespan=lifespan)


@router.get("/api/analytics/config")
def config():
    try:
        purge()
        enabled = True
    except (ValueError, OSError, sqlite3.Error):
        enabled = False
    return JSONResponse({"enabled": enabled}, headers=HEADERS)


def reject(status: int):
    raise HTTPException(status_code=status, detail="Analytics request rejected.", headers=HEADERS)


def validate(payload):
    if not isinstance(payload, dict) or set(payload) != {"session", "events"}:
        reject(422)
    session = payload["session"]
    try:
        if not isinstance(session, str) or str(UUID(session, version=4)) != session or UUID(session).version != 4:
            reject(422)
    except (ValueError, AttributeError):
        reject(422)
    events = payload["events"]
    if not isinstance(events, list) or not 1 <= len(events) <= 20:
        reject(422)
    rows = []
    for event in events:
        if not isinstance(event, dict) or set(event) != {"event", "seq", "props"}:
            reject(422)
        name, seq, props = event["event"], event["seq"], event["props"]
        if not isinstance(name, str) or name not in EVENTS or type(seq) is not int or not 1 <= seq <= 10000:
            reject(422)
        if not isinstance(props, dict) or set(props) != EVENTS[name] | {"page", "locale"}:
            reject(422)
        if any(not isinstance(v, str) or v not in VALUES[k] for k, v in props.items()):
            reject(422)
        if name == "app_redirect" and props["page"] != "get":
            reject(422)
        rows.append((int(time.time()), session, seq, name, json.dumps(props, separators=(",", ":"))))
    return rows


async def rate_limit(request, count):
    host = request.client.host if request.client else "unknown"
    key = hmac.new(_salt, host.encode(), hashlib.sha256).hexdigest()
    async with _lock:
        now = time.monotonic()
        for bucket in [_global]:
            while bucket and bucket[0] <= now - 60:
                bucket.popleft()
        bucket = _clients.pop(key, deque())
        while bucket and bucket[0] <= now - 60:
            bucket.popleft()
        _clients[key] = bucket
        while len(_clients) > 1024:
            _clients.popitem(last=False)
        if len(bucket) + count > 120 or len(_global) + count > 1200:
            reject(429)
        bucket.extend([now] * count)
        _global.extend([now] * count)


def persist(rows):
    db = database()
    try:
        with db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM events WHERE created < ?", (int(time.time()) - RETENTION_SECONDS,))
            if db.execute("SELECT count(*) FROM events").fetchone()[0] + len(rows) > MAX_ROWS:
                reject(503)
            db.executemany("INSERT OR IGNORE INTO events VALUES (?, ?, ?, ?, ?)", rows)
    finally:
        db.close()


@router.post("/api/analytics/events")
async def collect(request: Request):
    if not DB_PATH:
        reject(503)
    # Invalid attempts also consume budget, before reading an attacker-controlled body.
    await rate_limit(request, 1)
    origins = {item.strip().rstrip("/") for item in os.getenv("ANALYTICS_ALLOWED_ORIGINS", "").split(",") if item.strip()}
    if not origins:
        origins = {str(request.base_url).rstrip("/")}
    if request.headers.get("origin") not in origins or request.headers.get("sec-fetch-site") == "cross-site":
        reject(403)
    if request.url.query or request.headers.get("content-type", "").split(";")[0].strip() != "application/json":
        reject(415)
    if request.headers.get("content-encoding", "identity") != "identity":
        reject(415)
    data = bytearray()
    try:
        async with asyncio.timeout(3):
            async for chunk in request.stream():
                data.extend(chunk)
                if len(data) > MAX_BODY:
                    reject(413)
    except TimeoutError:
        reject(408)
    try:
        payload = json.loads(data)
    except (ValueError, UnicodeDecodeError, RecursionError):
        reject(422)
    rows = validate(payload)
    await rate_limit(request, len(rows) - 1)
    try:
        await run_in_threadpool(persist, rows)
    except (ValueError, OSError, sqlite3.Error):
        reject(503)
    return Response(status_code=204, headers=HEADERS)
