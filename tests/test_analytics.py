import asyncio
import json
import sqlite3
import tempfile
import time
import unittest
from collections import OrderedDict, deque
from contextlib import closing
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

from server import analytics
from server.analytics_report import report


class AnalyticsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.temp.name) / "events.sqlite")
        self.patch = patch.object(analytics, "DB_PATH", self.path)
        self.patch.start()
        analytics._clients, analytics._global = OrderedDict(), deque()
        self.app = FastAPI()
        self.app.include_router(analytics.router)
        self.client = TestClient(self.app)
        self.headers = {"Origin": "http://testserver"}

    def tearDown(self):
        self.client.close()
        self.patch.stop()
        self.temp.cleanup()

    def payload(self):
        return {"session": str(uuid4()), "events": [{"seq": 1, "event": "page_view", "props": {"page": "home", "locale": "lv"}}]}

    def post(self, payload=None, **kwargs):
        return self.client.post("/api/analytics/events", json=payload or self.payload(), headers=self.headers, **kwargs)

    def test_disabled_and_invalid_paths_do_not_enable(self):
        for path in ("", "relative.sqlite", str(Path(self.temp.name) / "missing" / "db.sqlite"), str(Path(__file__).resolve().parents[1] / "public" / "analytics.sqlite")):
            with self.subTest(path=path), patch.object(analytics, "DB_PATH", path):
                self.assertEqual(self.client.get("/api/analytics/config").json(), {"enabled": False})

    def test_private_database_allowlisted_data_and_idempotency(self):
        self.assertTrue(self.client.get("/api/analytics/config").json()["enabled"])
        payload = self.payload()
        for _ in range(2):
            response = self.post(payload)
            self.assertEqual(response.status_code, 204)
            self.assertEqual(response.headers["cache-control"], "no-store")
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM events").fetchone()[0], 1)
            self.assertEqual([r[1] for r in db.execute("PRAGMA table_info(events)")], ["created", "session", "seq", "event", "props"])
        self.assertEqual(Path(self.path).stat().st_mode & 0o777, 0o600)

    def test_origin_content_type_query_and_size(self):
        for origin in ("https://evil.example", "null", ""):
            response = self.client.post("/api/analytics/events", json=self.payload(), headers={"Origin": origin})
            self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.post("/api/analytics/events", content="{}", headers=self.headers).status_code, 415)
        self.assertEqual(self.post(params={"token": "never-store"}).status_code, 415)
        self.assertEqual(self.client.post("/api/analytics/events", content="x" * 8193, headers={**self.headers, "Content-Type": "application/json"}).status_code, 413)
        self.assertEqual(self.client.post("/api/analytics/events", content="{", headers={**self.headers, "Content-Type": "application/json"}).status_code, 422)
        with patch.dict("os.environ", {"ANALYTICS_ALLOWED_ORIGINS": "https://shurp.example"}):
            self.assertEqual(self.client.post("/api/analytics/events", json=self.payload(), headers={"Origin": "https://shurp.example"}).status_code, 204)

    def test_rejects_unknown_fields_sensitive_values_and_forged_events(self):
        mutations = [
            lambda p: p.update(url="https://example/?token=secret"),
            lambda p: p.update(session="user@example.com"),
            lambda p: p["events"][0].update(event="signup_complete"),
            lambda p: p["events"][0].update(seq=True),
            lambda p: p["events"][0]["props"].update(token="secret"),
            lambda p: p["events"][0]["props"].update(page="auth/callback"),
            lambda p: p["events"][0]["props"].update(locale=["lv"]),
            lambda p: p.update(events=p["events"] * 21),
            lambda p: p["events"][0].update(event="app_redirect", props={"page": "home", "locale": "lv", "platform": "ios"}),
        ]
        for change in mutations:
            payload = self.payload(); change(payload)
            self.assertEqual(self.post(payload).status_code, 422)
        self.assertFalse(Path(self.path).exists())

    def test_rate_and_storage_limits(self):
        payload = self.payload()
        payload["events"] *= 20
        for _ in range(6):
            self.assertEqual(self.post(payload).status_code, 204)
        self.assertEqual(self.post(payload).status_code, 429)
        analytics._clients, analytics._global = OrderedDict(), deque()
        with patch.object(analytics, "MAX_ROWS", 1):
            self.assertEqual(self.post().status_code, 503)

    def test_retention_and_report_never_export_sessions(self):
        self.assertEqual(self.post().status_code, 204)
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("INSERT INTO events VALUES (?, ?, ?, ?, ?)", (int(time.time()) - 91 * 86400, "old-session", 1, "page_view", '{"page":"home","locale":"lv"}'))
        with patch("server.analytics_report.DB_PATH", self.path):
            result = report(7)
        self.assertEqual(result["events"], [{"event": "page_view", "count": 1, "sessions": 1}])
        self.assertNotIn("old-session", json.dumps(result))
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM events").fetchone()[0], 1)

    def test_invalid_requests_consume_budget_and_slow_bodies_time_out(self):
        for _ in range(120):
            self.assertEqual(self.client.post("/api/analytics/events", content="x", headers=self.headers).status_code, 415)
        self.assertEqual(self.post().status_code, 429)
        analytics._clients, analytics._global = OrderedDict(), deque()
        async def receive():
            await asyncio.sleep(0.1)
            return {"type": "http.request", "body": b"{}", "more_body": False}
        request = Request({"type": "http", "method": "POST", "scheme": "http", "server": ("testserver", 80), "client": ("testclient", 1), "path": "/api/analytics/events", "query_string": b"", "headers": [(b"origin", b"http://testserver"), (b"content-type", b"application/json")]}, receive)
        real_timeout = asyncio.timeout
        with patch.object(analytics.asyncio, "timeout", side_effect=lambda _: real_timeout(.001)):
            with self.assertRaises(HTTPException) as caught:
                asyncio.run(analytics.collect(request))
        self.assertEqual(caught.exception.status_code, 408)

    def test_store_funnel_uses_sequence_and_distinct_sessions(self):
        def events(items):
            return [{"seq": i + 1, "event": event, "props": {"page": "home", "locale": "en", **props}} for i, (event, props) in enumerate(items)]
        good = events([
            ("page_view", {}),
            ("store_click", {"platform": "ios", "placement": "footer"}),
        ])
        # Arrival order differs from sequence order, as with concurrent batches.
        self.assertEqual(self.post({"session": str(uuid4()), "events": list(reversed(good))}).status_code, 204)
        wrong_order = events([
            ("store_click", {"platform": "ios", "placement": "header"}), ("page_view", {}),
        ])
        self.assertEqual(self.post({"session": str(uuid4()), "events": wrong_order}).status_code, 204)
        navigation = events([("page_view", {}), ("navigation_click", {"target": "external_service", "placement": "body"})])
        self.assertEqual(self.post({"session": str(uuid4()), "events": navigation}).status_code, 204)
        with patch("server.analytics_report.DB_PATH", self.path):
            result = report(7)
        self.assertEqual([step["sessions"] for step in result["funnels"]["website_store"]], [3, 1])
        self.assertTrue(any(row["placement"] == "footer" for row in result["segments"]))
        self.assertTrue(any(row["target"] == "external_service" for row in result["segments"]))


if __name__ == "__main__":
    unittest.main()
