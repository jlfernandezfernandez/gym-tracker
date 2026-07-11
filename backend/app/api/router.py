from fastapi import APIRouter

from app.api.routes import coach, exercises, profile, sessions

api_router = APIRouter(prefix="/api")
api_router.include_router(sessions.router)
api_router.include_router(exercises.router)
api_router.include_router(coach.router)
api_router.include_router(profile.router)
