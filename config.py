from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Anthropic
    anthropic_api_key: str = ""

    # Slack
    slack_bot_token: str = ""
    slack_signing_secret: str = ""
    slack_prd_channel: str = "#devforge-prd"

    # Linear
    linear_api_key: str = ""
    linear_team_id: str = ""

    # GitHub
    github_token: str = ""
    github_org: str = ""

    # App
    app_env: str = "development"
    app_port: int = 8000

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
