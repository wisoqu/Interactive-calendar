import secrets
from typing import List, Dict, Any
from sqlalchemy.orm import Session

from app.domain.exceptions import (
    EntityNotFoundException,
    PermissionDeniedException,
    DuplicateEntityException,
    InvalidDomainStateException
)
from app.domain.policies.permission_policy import PermissionPolicy
from app.infrastructure.db.models import ClassMember, User
from app.infrastructure.repositories.member_repository import MemberRepository
from app.infrastructure.repositories.classroom_repository import ClassroomRepository
from app.infrastructure.repositories.user_repository import UserRepository


class MemberService:
    def __init__(self, db: Session):
        self.db = db
        self.member_repo = MemberRepository(db)
        self.classroom_repo = ClassroomRepository(db)
        self.user_repo = UserRepository(db)

    def list_classroom_members(self, user_id: str, classroom_id: str) -> List[Dict[str, Any]]:
        # Verification that calling user belongs to classroom
        caller_mem = self.member_repo.get_by_user_and_classroom(user_id, classroom_id)
        if not caller_mem:
            raise PermissionDeniedException("You are not a member of this classroom")

        members = self.member_repo.list_by_classroom_id(classroom_id)
        result = []
        for m in members:
            u = self.user_repo.get_by_id(m.user_id)
            result.append({
                "id": m.id,
                "user_id": m.user_id,
                "username": u.username if u else "unknown",
                "role": m.role,
                "created_at": m.created_at,
            })
        return result

    def add_member_by_username(self, actor_id: str, classroom_id: str, username: str, role: str = "member") -> Dict[str, Any]:
        # Validate actor role
        actor_mem = self.member_repo.get_by_user_and_classroom(actor_id, classroom_id)
        if not actor_mem or not PermissionPolicy.can_manage_members(actor_mem.role):
            raise PermissionDeniedException("You do not have administrative permissions to add members")

        if role not in {"admin", "member"}:
            raise InvalidDomainStateException("Invalid role type requested")

        # Find user
        user = self.user_repo.get_by_username(username)
        if not user:
            raise EntityNotFoundException(f"User with username '{username}' does not exist")

        # Check existing membership
        existing_mem = self.member_repo.get_by_user_and_classroom(user.id, classroom_id)
        if existing_mem:
            raise DuplicateEntityException("User is already a member of this classroom")

        # Create member record
        new_mem = ClassMember(
            id="mem_" + secrets.token_hex(8),
            user_id=user.id,
            classroom_id=classroom_id,
            role=role
        )
        saved = self.member_repo.save(new_mem)

        return {
            "id": saved.id,
            "user_id": saved.user_id,
            "username": user.username,
            "role": saved.role,
            "created_at": saved.created_at
        }

    def update_member_role(self, actor_id: str, classroom_id: str, member_id: str, new_role: str) -> Dict[str, Any]:
        actor_mem = self.member_repo.get_by_user_and_classroom(actor_id, classroom_id)
        if not actor_mem:
            raise PermissionDeniedException("Access denied")

        target_mem = self.member_repo.get_by_id(member_id)
        if not target_mem or target_mem.classroom_id != classroom_id:
            raise EntityNotFoundException("Membership record not found")

        if target_mem.role == "owner":
            raise InvalidDomainStateException("The Owner role cannot be modified. Ownership transfer is out of scope.")

        if new_role not in {"admin", "member"}:
            raise InvalidDomainStateException("Role type must be either 'admin' or 'member'")

        if not PermissionPolicy.can_modify_member_role(actor_mem.role, target_mem.role, new_role):
            raise PermissionDeniedException("Only the classroom owner can update roles")

        target_mem.role = new_role
        saved = self.member_repo.save(target_mem)

        u = self.user_repo.get_by_id(saved.user_id)
        return {
            "id": saved.id,
            "user_id": saved.user_id,
            "username": u.username if u else "unknown",
            "role": saved.role,
            "created_at": saved.created_at
        }

    def remove_member(self, actor_id: str, classroom_id: str, member_id: str) -> None:
        actor_mem = self.member_repo.get_by_user_and_classroom(actor_id, classroom_id)
        if not actor_mem:
            raise PermissionDeniedException("Access denied")

        target_mem = self.member_repo.get_by_id(member_id)
        if not target_mem or target_mem.classroom_id != classroom_id:
            raise EntityNotFoundException("Membership record not found")

        if target_mem.role == "owner":
            raise InvalidDomainStateException("The classroom owner cannot be removed")

        # Check self-removal (a user can leave, which matches safety remove constraints)
        if actor_mem.user_id == target_mem.user_id:
            # User wants to leave group
            self.member_repo.delete(member_id)
            return

        # Else, administrator eviction
        if not PermissionPolicy.can_remove_member(actor_mem.role, target_mem.role):
            raise PermissionDeniedException("Insufficient roles to remove this member")

        self.member_repo.delete(member_id)

