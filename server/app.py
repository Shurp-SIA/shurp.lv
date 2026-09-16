"""Shurp marketing pages and consent-based website analytics."""
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from .analytics import router as analytics_router

PUBLIC = Path(__file__).resolve().parents[1] / "public"
HEADERS = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

@app.get("/{locale}/help")
@app.get("/{locale}/privacy")
@app.get("/{locale}/terms")
@app.get("/{locale}/index")
@app.get("/{locale}/tutorial")
async def localized_page(locale: str, request: Request):
    page = request.url.path.rsplit("/", 1)[-1]
    if locale not in {"lv", "en"}:
        raise HTTPException(404, "Not found.")
    return FileResponse(PUBLIC / locale / f"{page}.html", headers=HEADERS)

@app.get("/get")
async def download_redirect():
    return FileResponse(PUBLIC / "get.html", headers=HEADERS)

app.include_router(analytics_router)
app.mount("/", StaticFiles(directory=PUBLIC, html=True), name="public")
