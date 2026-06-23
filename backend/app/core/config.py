import secrets
from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    APP_NAME: str = "AI电商工具平台"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/app.db"

    # AI Model API Keys (optional, users can also provide their own)
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"

    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_BASE_URL: str = "https://api.anthropic.com"

    GEMINI_API_KEY: str = ""

    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"

    # JWT Auth
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24 hours

    # File upload
    MAX_UPLOAD_SIZE: int = 20 * 1024 * 1024  # 20MB
    UPLOAD_DIR: Path = Path("./data/uploads")
    SKILLS_DIR: Path = Path("./data/skills")

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

# Auto-generate JWT secret if not provided via .env
if not settings.JWT_SECRET_KEY:
    _key_file = Path("./data/.jwt_secret")
    if _key_file.exists():
        settings.JWT_SECRET_KEY = _key_file.read_text().strip()
    else:
        settings.JWT_SECRET_KEY = secrets.token_hex(32)
        _key_file.parent.mkdir(parents=True, exist_ok=True)
        _key_file.write_text(settings.JWT_SECRET_KEY)
        print("[CONFIG] Generated JWT secret key → data/.jwt_secret")

# Ensure directories exist
Path("./data").mkdir(exist_ok=True)
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.SKILLS_DIR.mkdir(parents=True, exist_ok=True)
