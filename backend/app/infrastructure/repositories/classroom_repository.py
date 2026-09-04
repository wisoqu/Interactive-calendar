from typing import List, Optional
from sqlalchemy.orm import Session
from app.infrastructure.db.models import Classroom, ClassMember


class ClassroomRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, classroom_id: str) -> Optional[Classroom]:
        return self.db.query(Classroom).filter(Classroom.id == classroom_id).first()

    def get_by_invite_code(self, invite_code: str) -> Optional[Classroom]:
        return self.db.query(Classroom).filter(Classroom.invite_code == invite_code).first()

    def list_by_user_id(self, user_id: str) -> List[Classroom]:
        return (
            self.db.query(Classroom)
            .join(ClassMember, ClassMember.classroom_id == Classroom.id)
            .filter(ClassMember.user_id == user_id)
            .all()
        )

    def save(self, classroom: Classroom) -> Classroom:
        self.db.add(classroom)
        self.db.commit()
        self.db.refresh(classroom)
        return classroom

    def delete(self, classroom_id: str) -> bool:
        classroom = self.get_by_id(classroom_id)
        if classroom:
            self.db.delete(classroom)
            self.db.commit()
            return True
        return False
