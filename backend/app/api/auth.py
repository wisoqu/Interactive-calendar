from fastapi import APIRouter, Depends, Response, Request, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional

from app.application.services.auth_service import AuthService
from app.infrastructure.db.session import get_db
from app.schemas.auth import (
    UserRegisterRequest,
    UserLoginRequest,
    UserResponse,
    PasswordResetRequest,
    PasswordResetConfirm,
    LogoutResponse,
)
from app.core.config import settings
from app.domain.exceptions import CalendarException

router = APIRouter(prefix="/auth", tags=["auth"])


def get_current_user(request: Request, db: Session = Depends(get_db)):
    session_id = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Missing session cookie."
        )
    try:
        service = AuthService(db)
        return service.authenticate_session(session_id)
    except CalendarException as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=e.message or "Invalid or expired session"
        )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegisterRequest, db: Session = Depends(get_db)):
    try:
        service = AuthService(db)
        user = service.register(payload.username, payload.password, payload.email)
        return user
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)


@router.post("/login", response_model=UserResponse)
def login(payload: UserLoginRequest, response: Response, db: Session = Depends(get_db)):
    try:
        service = AuthService(db)
        user, session = service.login(payload.username, payload.password)

        # Set secure HTTP-only cookie
        response.set_cookie(
            key=settings.SESSION_COOKIE_NAME,
            value=session.session_id,
            httponly=True,
            samesite="lax",
            path="/",
            max_age=7 * 24 * 60 * 60,  # 7 days
            secure=settings.ENV == "production"
        )
        return user
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=e.message)


@router.get("/me", response_model=UserResponse)
def me(current_user=Depends(get_current_user)):
    return current_user


@router.post("/logout", response_model=LogoutResponse)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    session_id = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if session_id:
        service = AuthService(db)
        service.logout(session_id)

    # Clear cookie
    response.delete_cookie(key=settings.SESSION_COOKIE_NAME, path="/")
    return {"success": True, "message": "Logged out successfully"}


@router.post("/password-reset/request")
def password_reset_request(payload: PasswordResetRequest, db: Session = Depends(get_db)):
    try:
        service = AuthService(db)
        service.request_password_reset(payload.email)
        return {
            "success": True,
            "message": "If the email is registered, a 6-digit reset code has been sent."
        }
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)


@router.post("/password-reset/confirm")
def password_reset_confirm(payload: PasswordResetConfirm, response: Response, db: Session = Depends(get_db)):
    try:
        service = AuthService(db)
        service.confirm_password_reset(payload.email, payload.code, payload.new_password)

        # Revoking old sessions also means we should clear current user's session cookie
        response.delete_cookie(key=settings.SESSION_COOKIE_NAME, path="/")
        return {
            "success": True,
            "message": "Password updated successfully. All active sessions have been revoked."
        }
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)
