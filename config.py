# Copyright (c) 2026 Sushil Kumar. Licensed under BSL 1.1 — see LICENSE or https://devforgeai.in/license
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
    github_repo: str = ""          # "owner/repo" to push generated code to

    # Google OAuth (optional — enables Gmail SSO button)
    google_client_id: str = ""
    google_client_secret: str = ""
    app_base_url: str = "http://localhost:8000"

    # GitHub OAuth App (optional — enables GitHub SSO button)
    # Note: distinct from github_token (PAT used for deploy/PR creation)
    github_client_id: str = ""
    github_client_secret: str = ""

    # App
    app_env: str = "development"
    app_port: int = 8000

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
