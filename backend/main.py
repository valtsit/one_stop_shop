from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.api import chat, upload, settings as settings_api, agents, conversations
from app.api import auth as auth_api, departments, users, roles
from app.api import profile
from app.api import admin_conversations
from app.core.config import settings
from app.core.database import init_db
from app.core.seed import ensure_seed_data

FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

app = FastAPI(title=settings.APP_NAME, debug=settings.DEBUG)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files
app.mount("/uploads", StaticFiles(directory=str(settings.UPLOAD_DIR)), name="uploads")

# Serve frontend static assets (built with Vite)
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="frontend-assets")

# Include routers
app.include_router(auth_api.router)
app.include_router(profile.router)
app.include_router(departments.router)
app.include_router(users.router)
app.include_router(roles.router)
app.include_router(chat.router)
app.include_router(upload.router)
app.include_router(settings_api.router)
app.include_router(agents.router)
app.include_router(conversations.router)
app.include_router(admin_conversations.router)


@app.on_event("startup")
async def startup():
    ensure_seed_data()
    await init_db()


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME}


# SPA fallback — serve index.html for all non-API, non-static routes
if FRONTEND_DIST.is_dir():
    @app.get("/{full_path:path}")
    async def spa_fallback(request: Request, full_path: str):
        # Try to serve the exact file (favicon.svg, icons.svg, etc.)
        file_path = FRONTEND_DIST / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIST / "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
