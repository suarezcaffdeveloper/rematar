from pydantic import BaseModel, EmailStr, Field, model_validator


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordTokenValidation(BaseModel):
    token: str


class ResetPasswordRequest(BaseModel):
    token: str
    # Mismos límites que `UserCreate.password` (`app/modules/users/schemas.py`): es la
    # misma columna `hashed_password`, tiene que pasar por la misma validación.
    new_password: str = Field(min_length=8, max_length=128)
    confirm_new_password: str = Field(min_length=8, max_length=128)

    @model_validator(mode="after")
    def passwords_must_match(self) -> "ResetPasswordRequest":
        if self.new_password != self.confirm_new_password:
            raise ValueError("Las contraseñas no coinciden.")
        return self
