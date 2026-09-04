from typing import List, Optional
from sqlalchemy.orm import Session
from app.infrastructure.db.models import ClassMember, User


class MemberRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, member_id: str) -> Optional[ClassMember]:
        return self.db.query(ClassMember).filter(ClassMember.id == member_id).first()

    def get_by_user_and_classroom(self, user_id: str, classroom_id: str) -> Optional[ClassMember]:
        return (
            self.db.query(ClassMember)
            .filter(ClassMember.user_id == user_id, ClassMember.classroom_id == classroom_id)
            .first()
        )

    def list_by_classroom_id(self, classroom_id: str) -> List[ClassMember]:
        return (
            self.db.query(ClassMember)
            .filter(ClassMember.classroom_id == classroom_id)
            .all()
        )

    def save(self, member: ClassMember) -> ClassMember:
        self.db.add(member)
        self.db.commit()
        self.db.refresh(member)
        return member

    def delete(self, member_id: str) -> bool:
        member = self.get_by_id(member_id)
        if member:
            self.db.delete(member)
            self.db.commit()
            return True
        return False
