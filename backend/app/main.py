from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import auth, classrooms, members, events, health
from app.infrastructure.db.session import init_db

app = FastAPI(
    title="Interactive Calendar API",
    description="Clean Architecture school/group calendar API with cookie-based session auth.",
    version="1.0.0"
)

# CORS mapping setup for decoupled frontend environments
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust as needed for specific security levels
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Automated migration fallback for fast SQLite tests
@app.on_event("startup")
def on_startup():
    init_db()


# Include unified API sub-routers
app.include_router(auth.router)
app.include_router(classrooms.router)
app.include_router(members.router)
app.include_router(events.router)
app.include_router(health.router)


# Global fallbacks for exceptions
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": f"An unexpected server error occurred: {str(exc)}"},
    )
