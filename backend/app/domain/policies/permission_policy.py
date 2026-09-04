from typing import List

class PermissionPolicy:
    @staticmethod
    def can_view_classroom(user_role: str) -> bool:
        return user_role in {"owner", "admin", "member"}

    @staticmethod
    def can_update_classroom(user_role: str) -> bool:
        return user_role == "owner"

    @staticmethod
    def can_delete_classroom(user_role: str) -> bool:
        return user_role == "owner"

    @staticmethod
    def can_manage_events(user_role: str) -> bool:
        return user_role in {"owner", "admin"}

    @staticmethod
    def can_manage_members(user_role: str) -> bool:
        return user_role in {"owner", "admin"}

    @staticmethod
    def can_modify_member_role(user_role: str, target_current_role: str, target_new_role: str) -> bool:
        # Only owners can change membership roles
        if user_role != "owner":
            return False
        # Cannot demote an owner unless ownership is transferred (handled in use-case)
        return True

    @staticmethod
    def can_remove_member(user_role: str, target_role: str) -> bool:
        if user_role == "owner":
            return True
        if user_role == "admin":
            # admin can only remove standard members, not other admins or the owner
            return target_role == "member"
        return False
