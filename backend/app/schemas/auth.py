from __future__ import annotations

import uuid

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    full_name: str | None = Field(default=None, max_length=200)
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    credential: str = Field(min_length=1, max_length=4096)  # the ID token Google Identity Services hands the browser
    company_name: str | None = Field(default=None, max_length=200)  # used only when this creates a new account


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=1, max_length=128)


class RotatePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=1, max_length=128)


class WorkspaceOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    plan_id: str
    trial_ends_at: str | None = None


class AuthResponse(BaseModel):
    user_id: uuid.UUID
    email: EmailStr
    role: str
    workspace: WorkspaceOut
    access_token: str
    refresh_token: str
    expires_in_minutes: int
    must_rotate_password: bool = False


class PasswordFailure(BaseModel):
    rule: str
    message: str


class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    password_failures: list[PasswordFailure] | None = None
