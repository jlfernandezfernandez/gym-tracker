import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import APP_VERSION
from app.core.config import get_settings
from app.core.health import router as health_router
from app.router import api_router


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Gym Tracker API", version=APP_VERSION)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health_router)
    app.include_router(health_router, prefix="/api")
    app.include_router(api_router)
    app.mount(
        "/exercise-media",
        StaticFiles(directory=settings.exercise_dataset_dir, check_dir=False),
        name="exercise-media",
    )

    static_dir = next((path for path in ("static", "../miniapp/dist") if os.path.isdir(path)), None)
    if static_dir:

        @app.get("/", include_in_schema=False)
        @app.get("/demo", include_in_schema=False)
        @app.get("/session/share/{share_token}", include_in_schema=False)
        @app.get(
            "/session/share/{share_token}/exercise/{planned_exercise_id}",
            include_in_schema=False,
        )
        async def frontend_shell() -> FileResponse:
            return FileResponse(os.path.join(static_dir, "index.html"))

        app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")

    return app


# Lazy: `uvicorn app.main:app` builds the app on first attribute access, so
# importing this module (e.g. tests importing create_app) needs no settings.
def __getattr__(name):
    if name == "app":
        return create_app()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
