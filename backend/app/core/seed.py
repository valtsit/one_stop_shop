from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import hash_password
from .database import async_session
from ..models.orm import Role, User


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
        "description": "拥有大部分管理权限",
        "permissions": [
            "department:create", "department:read", "department:update", "department:delete",
            "user:read", "user:create", "user:update", "user:delete",
            "agent:create", "agent:read", "agent:update", "agent:delete",
            "skill:create", "skill:read", "skill:update", "skill:delete",
            "knowledge:create", "knowledge:read", "knowledge:update", "knowledge:delete",
            "knowledge:review",
            "wiki:create", "wiki:read", "wiki:update", "wiki:delete",
            "role:read", "role:create", "role:update", "role:delete",
            "settings:read", "settings:update",
            "conversation:read", "conversation:delete",
            "password:change",
        ],
        "created_at": "2026-05-01T00:00:00",
        "updated_at": "2026-05-01T00:00:00",
    },
    "role_user": {
        "id": "role_user",
        "name": "普通用户",
        "description": "仅可查看知识库和Wiki",
        "permissions": ["wiki:read", "knowledge:read"],
        "created_at": "2026-05-01T00:00:00",
        "updated_at": "2026-05-01T00:00:00",
    },
    # Custom roles
    "role_boss": {
        "id": "role_boss",
        "name": "老板",
        "description": "业务最高权限",
        "permissions": [
            "department:create", "department:read", "department:update", "department:delete",
            "user:read", "user:create", "user:update", "user:delete",
            "agent:create", "agent:read", "agent:update", "agent:delete",
            "skill:create", "skill:read", "skill:update", "skill:delete",
            "knowledge:create", "knowledge:read", "knowledge:update", "knowledge:delete",
            "knowledge:review",
            "wiki:create", "wiki:read", "wiki:update", "wiki:delete",
            "role:create", "role:read", "role:update", "role:delete",
            "settings:read", "settings:update",
            "conversation:read", "conversation:delete",
            "password:change",
        ],
        "created_at": "2026-05-01T00:00:00",
        "updated_at": "2026-05-01T00:00:00",
    },
    "role_store_manager": {
        "id": "role_store_manager",
        "name": "店长",
        "description": "可查看知识库和Wiki",
        "permissions": [
            "knowledge:read",
            "wiki:read",
        ],
        "created_at": "2026-05-01T00:00:00",
        "updated_at": "2026-05-01T00:00:00",
    },
    "role_assistant_manager": {
        "id": "role_assistant_manager",
        "name": "副店长",
        "description": "可查看知识库和Wiki",
        "permissions": [
            "knowledge:read",
            "wiki:read",
        ],
        "created_at": "2026-05-01T00:00:00",
        "updated_at": "2026-05-01T00:00:00",
    },
    "role_promotion": {
        "id": "role_promotion",
        "name": "推广运营",
        "description": "可查看知识库和Wiki",
        "permissions": [
            "knowledge:read",
            "wiki:read",
        ],
        "created_at": "2026-05-01T00:00:00",
        "updated_at": "2026-05-01T00:00:00",
    },
    "role_operation_assistant": {
        "id": "role_operation_assistant",
        "name": "运营助理",
        "description": "基础查看权限",
        "permissions": [
            "knowledge:read",
            "wiki:read",
        ],
        "created_at": "2026-05-01T00:00:00",
        "updated_at": "2026-05-01T00:00:00",
    },
}


async def ensure_seed_data():
    """Seed built-in roles and admin user if they don't exist."""
    async with async_session() as db:
        # Seed roles - check each individually for idempotency
        for role_id, role_data in DEFAULT_ROLES.items():
            result = await db.execute(select(Role).where(Role.id == role_id))
            if result.scalar_one_or_none() is None:
                db.add(Role(**role_data))
        await db.flush()

        # Seed admin user independently
        result = await db.execute(select(User).where(User.username == "admin"))
        if result.scalar_one_or_none() is None:
            admin_user = User(
                id="user_admin",
                username="admin",
                password_hash=hash_password("admin123"),
                display_name="管理员",
                email="",
                phone="",
                role_id="role_super_admin",
                department_id="",
                is_active=True,
                created_at="2026-05-01T00:00:00",
                updated_at="2026-05-01T00:00:00",
            )
            db.add(admin_user)
            await db.flush()

        await db.commit()
