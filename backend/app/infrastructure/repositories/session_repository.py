from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from app.infrastructure.db.models import UserSession


class SessionRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_session_id(self, session_id: str) -> Optional[UserSession]:
        return (
            self.db.query(UserSession)
            .filter(
                UserSession.session_id == session_id,
                UserSession.revoked_at.is_(None)
            )
            .first()
        )

    def save(self, session: UserSession) -> UserSession:
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def revoke_all_by_user_id(self, user_id: str) -> None:
        sessions = (
            self.db.query(UserSession)
            .filter(
                UserSession.user_id == user_id,
                UserSession.revoked_at.is_(None)
            )
            .all()
        )
        now = datetime.utcnow()
        for sess in sessions:
            sess.revoked_at = now
        self.db.commit()
