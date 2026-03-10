from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str = ""
    cors_origins: list[str] = ["http://localhost:3000"]
    host: str = "0.0.0.0"
    port: int = 8000

    model_config = {"env_file": ".env"}


settings = Settings()
