import hashlib
import os
import secrets


class PasswordHasher:
    @staticmethod
    def hash_password(password: str) -> str:
        salt = secrets.token_hex(16)
        # Hash using PBKDF2 HMAC SHA-256 with 100,000 iterations
        key = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            100000
        )
        return f"pbkdf2_sha256$100000${salt}${key.hex()}"

    @staticmethod
    def verify_password(password: str, hashed_password: str) -> bool:
        try:
            parts = hashed_password.split("$")
            if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
                return False
            iterations = int(parts[1])
            salt = parts[2]
            stored_hex = parts[3]
            calculated_key = hashlib.pbkdf2_hmac(
                "sha256",
                password.encode("utf-8"),
                salt.encode("utf-8"),
                iterations
            )
            return secrets.compare_digest(calculated_key.hex(), stored_hex)
        except Exception:
            return False
