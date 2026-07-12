from fastapi import APIRouter

from app.features.coach import routes as coach
from app.features.exercises import media
from app.features.exercises import routes as exercises
from app.features.profile import routes as profile
from app.features.sessions import routes as sessions

api_router = APIRouter(prefix="/api")
api_router.include_router(sessions.router)
api_router.include_router(exercises.router)
api_router.include_router(coach.router)
api_router.include_router(profile.router)
api_router.include_router(media.router)
