import json
from pathlib import Path

from .auth import hash_password

DATA_DIR = Path(__file__).parent.parent.parent / "data"

DEFAULT_ROLES = {
    "role_super_admin": {
        "id": "role_super_admin",
        "name": "超级管理员",
        "description": "拥有所有权限",
        "permissions": ["*"],
        "created_at": "2026-05-01T00:00:00",
        "updated_at": "2026-05-01T00:00:00",
    },
    "role_admin": {
        "id": "role_admin",
        "name": "管理员",
        "description": "拥有部门和用户管理权限",
        "permissions": [
            "department:create",
            "department:read",
            "department:update",
            "department:delete",
            "user:manage",
        ],
        "created_at": "2026-05-01T00:00:00",
        "updated_at": "2026-05-01T00:00:00",
    },
    "role_user": {
        "id": "role_user",
        "name": "普通用户",
        "description": "仅可查看",
        "permissions": ["department:read"],
        "created_at": "2026-05-01T00:00:00",
        "updated_at": "2026-05-01T00:00:00",
    },
}


def ensure_seed_data():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    roles_file = DATA_DIR / "roles.json"
    if not roles_file.exists():
        roles_file.write_text(
            json.dumps(DEFAULT_ROLES, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    users_file = DATA_DIR / "users.json"
    if not users_file.exists():
        admin_user = {
            "user_admin": {
                "id": "user_admin",
                "username": "admin",
                "password_hash": hash_password("admin123"),
                "display_name": "管理员",
                "email": "",
                "phone": "",
                "role_id": "role_super_admin",
                "department_id": "",
                "is_active": True,
                "created_at": "2026-05-01T00:00:00",
                "updated_at": "2026-05-01T00:00:00",
            }
        }
        users_file.write_text(
            json.dumps(admin_user, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    depts_file = DATA_DIR / "departments.json"
    if not depts_file.exists():
        depts_file.write_text("{}", encoding="utf-8")
