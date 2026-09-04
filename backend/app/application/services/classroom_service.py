import secrets
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session

from app.domain.exceptions import (
    EntityNotFoundException,
    PermissionDeniedException,
    DuplicateEntityException,
)
from app.domain.policies.permission_policy import PermissionPolicy
from app.infrastructure.db.models import Classroom, ClassMember, User
from app.infrastructure.repositories.classroom_repository import ClassroomRepository
from app.infrastructure.repositories.member_repository import MemberRepository
from app.infrastructure.repositories.user_repository import UserRepository


class ClassroomService:
    def __init__(self, db: Session):
        self.db = db
        self.classroom_repo = ClassroomRepository(db)
        self.member_repo = MemberRepository(db)
        self.user_repo = UserRepository(db)

    def _generate_invite_code(self) -> str:
        # Generate clean 6-character uppercase alphanumeric code
        chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        while True:
            code = "".join(secrets.choice(chars) for _ in range(6))
            if not self.classroom_repo.get_by_invite_code(code):
                return code

    def create_classroom(self, user_id: str, name: str, description: Optional[str] = None) -> Classroom:
        classroom_id = "cr_" + secrets.token_hex(8)
        invite_code = self._generate_invite_code()

        classroom = Classroom(
            id=classroom_id,
            name=name,
            description=description,
            owner_id=user_id,
            invite_code=invite_code,
        )
        saved_class = self.classroom_repo.save(classroom)

        # Creator automatically becomes the owner membership in ClassMember
        owner_member = ClassMember(
            id="mem_" + secrets.token_hex(8),
            user_id=user_id,
            classroom_id=classroom_id,
            role="owner",
        )
        self.member_repo.save(owner_member)
        return saved_class

    def join_by_code(self, user_id: str, invite_code: str) -> Classroom:
        classroom = self.classroom_repo.get_by_invite_code(invite_code.strip().upper())
        if not classroom:
            raise EntityNotFoundException("No classroom found with this invite code")

        existing = self.member_repo.get_by_user_and_classroom(user_id, classroom.id)
        if existing:
            # If already enrolled, return classroom but avoid duplicate entries
            return classroom

        # Create basic member role membership
        new_ref = ClassMember(
            id="mem_" + secrets.token_hex(8),
            user_id=user_id,
            classroom_id=classroom.id,
            role="member",
        )
        self.member_repo.save(new_ref)
        return classroom

    def get_classroom_details(self, user_id: str, classroom_id: str) -> Dict[str, Any]:
        classroom = self.classroom_repo.get_by_id(classroom_id)
        if not classroom:
            raise EntityNotFoundException("Classroom not found")

        membership = self.member_repo.get_by_user_and_classroom(user_id, classroom_id)
        if not membership:
            raise PermissionDeniedException("You are not a member of this classroom")

        owner_user = self.user_repo.get_by_id(classroom.owner_id)
        owner_username = owner_user.username if owner_user else "unknown"

        return {
            "id": classroom.id,
            "name": classroom.name,
            "description": classroom.description,
            "owner_id": classroom.owner_id,
            "owner_username": owner_username,
            "invite_code": classroom.invite_code,
            "user_role": membership.role,
            "created_at": classroom.created_at,
        }

    def list_user_classrooms(self, user_id: str) -> List[Dict[str, Any]]:
        classrooms = self.classroom_repo.list_by_user_id(user_id)
        results = []
        for cr in classrooms:
            mem = self.member_repo.get_by_user_and_classroom(user_id, cr.id)
            role = mem.role if mem else "member"
            owner_u = self.user_repo.get_by_id(cr.owner_id)
            results.append({
                "id": cr.id,
                "name": cr.name,
                "description": cr.description,
                "owner_id": cr.owner_id,
                "owner_username": owner_u.username if owner_u else "unknown",
                "invite_code": cr.invite_code,
                "user_role": role,
                "created_at": cr.created_at,
            })
        return results

    def update_classroom(self, user_id: str, classroom_id: str, name: str, description: Optional[str] = None) -> Classroom:
        classroom = self.classroom_repo.get_by_id(classroom_id)
        if not classroom:
            raise EntityNotFoundException("Classroom not found")

        mem = self.member_repo.get_by_user_and_classroom(user_id, classroom_id)
        if not mem or not PermissionPolicy.can_update_classroom(mem.role):
            raise PermissionDeniedException("Only the owner can modify classroom configurations")

        classroom.name = name
        if description is not None:
            classroom.description = description
        return self.classroom_repo.save(classroom)

    def delete_classroom(self, user_id: str, classroom_id: str) -> None:
        classroom = self.classroom_repo.get_by_id(classroom_id)
        if not classroom:
            raise EntityNotFoundException("Classroom not found")

        mem = self.member_repo.get_by_user_and_classroom(user_id, classroom_id)
        if not mem or not PermissionPolicy.can_delete_classroom(mem.role):
            raise PermissionDeniedException("Only the owner can delete the classroom")

        self.classroom_repo.delete(classroom_id)
