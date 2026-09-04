from typing import Optional
from sqlalchemy.orm import Session
from app.infrastructure.db.models import PasswordResetCode


class ResetRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_latest_by_user_id(self, user_id: str) -> Optional[PasswordResetCode]:
        return (
            self.db.query(PasswordResetCode)
            .filter(PasswordResetCode.user_id == user_id)
            .order_by(PasswordResetCode.created_at.desc())
            .first()
        )

    def save(self, code_record: PasswordResetCode) -> PasswordResetCode:
        self.db.add(code_record)
        self.db.commit()
        self.db.refresh(code_record)
        return code_record
