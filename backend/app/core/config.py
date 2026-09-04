import os

class Settings:
    ENV: str = os.getenv("ENV", "development")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "A_SECURE_RANDOM_SECRET_FOR_SESSION_COOKIES_190283")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./calendar.db")
    SESSION_COOKIE_NAME: str = "session_id"

settings = Settings()
