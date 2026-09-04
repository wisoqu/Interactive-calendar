from datetime import datetime, timedelta
import hashlib
import secrets
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from app.domain.exceptions import (
    DuplicateEntityException,
    InvalidCredentialsException,
    EntityNotFoundException,
    InvalidDomainStateException
)
from app.infrastructure.db.models import User, UserSession, PasswordResetCode
from app.infrastructure.repositories.user_repository import UserRepository
from app.infrastructure.repositories.session_repository import SessionRepository
from app.infrastructure.repositories.reset_repository import ResetRepository
from app.infrastructure.security.password import PasswordHasher


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.user_repo = UserRepository(db)
        self.session_repo = SessionRepository(db)
        self.reset_repo = ResetRepository(db)

    def register(self, username: str, password: str, email: Optional[str] = None) -> User:
        if self.user_repo.get_by_username(username):
            raise DuplicateEntityException("Username is already taken")
        if email and self.user_repo.get_by_email(email):
            raise DuplicateEntityException("Email is already registered")

        # Create user
        user_id = "usr_" + secrets.token_hex(8)
        password_hash = PasswordHasher.hash_password(password)
        new_user = User(
            id=user_id,
            username=username,
            email=email,
            password_hash=password_hash,
            created_at=datetime.utcnow()
        )
        return self.user_repo.save(new_user)

    def login(self, username: str, password: str) -> Tuple[User, UserSession]:
        user = self.user_repo.get_by_username(username)
        if not user or not PasswordHasher.verify_password(password, user.password_hash):
            raise InvalidCredentialsException("Invalid username or password")

        # Create unguessable session cookie
        session_id = "sess_" + secrets.token_hex(32)
        sess_record = UserSession(
            id="sid_" + secrets.token_hex(8),
            session_id=session_id,
            user_id=user.id,
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=7)
        )
        saved_sess = self.session_repo.save(sess_record)
        return user, saved_sess

    def authenticate_session(self, session_id: str) -> User:
        sess = self.session_repo.get_by_session_id(session_id)
        if not sess:
            raise InvalidCredentialsException("Session is invalid or has been logged out")
        if sess.expires_at < datetime.utcnow():
            raise InvalidCredentialsException("Session has expired")

        user = self.user_repo.get_by_id(sess.user_id)
        if not user:
            raise EntityNotFoundException("User not found")
        return user

    def logout(self, session_id: str) -> None:
        sess = self.session_repo.get_by_session_id(session_id)
        if sess:
            sess.revoked_at = datetime.utcnow()
            self.session_repo.save(sess)

    def request_password_reset(self, email: str) -> str:
        user = self.user_repo.get_by_email(email)
        if not user:
            # Silence user existence testing per normal safety rules
            return ""

        # Generate 6-digit pin code
        code = "".join(secrets.choice("0123456789") for _ in range(6))
        code_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()

        reset_record = PasswordResetCode(
            id="rst_" + secrets.token_hex(8),
            user_id=user.id,
            code_hash=code_hash,
            expires_at=datetime.utcnow() + timedelta(minutes=15),
            created_at=datetime.utcnow()
        )
        self.reset_repo.save(reset_record)

        # Print code to terminal for sandbox inspection and helper logs
        print(f"PASSWORD RESET DISPATCH: User {user.username} (Email: {email}) -> Code: {code}")
        return code

    def confirm_password_reset(self, email: str, code: str, new_password: str) -> None:
        user = self.user_repo.get_by_email(email)
        if not user:
            raise EntityNotFoundException("User not found with this email")

        latest_reset = self.reset_repo.get_latest_by_user_id(user.id)
        if not latest_reset:
            raise InvalidDomainStateException("No password reset requested")
        if latest_reset.used_at:
            raise InvalidDomainStateException("Code has already been used")
        if latest_reset.expires_at < datetime.utcnow():
            raise InvalidDomainStateException("Code has expired")

        # Verify hashed code
        submitted_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()
        if not secrets.compare_digest(latest_reset.code_hash, submitted_hash):
            raise InvalidCredentialsException("Incorrect verification code")

        # Update password
        user.password_hash = PasswordHasher.hash_password(new_password)
        self.user_repo.save(user)

        # Mark code as consumed
        latest_reset.used_at = datetime.utcnow()
        self.reset_repo.save(latest_reset)

        # REVOKE ALL ACTIVE SESSIONS (security invariant!)
        self.session_repo.revoke_all_by_user_id(user.id)
