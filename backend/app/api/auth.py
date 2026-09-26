from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant_id, get_current_user, get_db, is_platform_admin
from app.core import ratelimit
from app.core.config import get_settings
from app.models.plan import Plan
from app.services import billing as billing_svc
from app.services import entitlements
from app.models.tenant import Tenant, TenantMembership, User
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    GoogleAuthRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    RotatePasswordRequest,
    WorkspaceOut,
)
from app.services import auth_service, mailer

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_meta(request: Request) -> tuple[str | None, str | None]:
    user_agent = request.headers.get("user-agent")
    ip_address = request.headers.get("x-forwarded-for") or (request.client.host if request.client else None)
    return user_agent, ip_address


def _set_access_cookie(response: Response, access_token: str, expires_in_minutes: int) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        # Cross-site (Vercel frontend → separate API host) needs SameSite=None, which requires Secure.
        samesite="none" if get_settings().is_production else "lax",
        secure=get_settings().is_production,
        max_age=expires_in_minutes * 60,
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    ratelimit.limit(request, "register", 10, 3600)
    user_agent, ip_address = _client_meta(request)
    user, tenant, membership, tokens = await auth_service.register_user(
        db,
        company_name=payload.company_name,
        full_name=payload.full_name,
        email=payload.email,
        password=payload.password,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    _set_access_cookie(response, tokens.access_token, tokens.expires_in_minutes)
    return AuthResponse(
        user_id=user.id,
        email=user.email,
        role=membership.role,
        workspace=WorkspaceOut(
            id=tenant.id,
            name=tenant.name,
            slug=tenant.slug,
            plan_id=tenant.plan_id,
            trial_ends_at=tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
        ),
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        expires_in_minutes=tokens.expires_in_minutes,
    )


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    # per-IP and per-account limits: slows password guessing without letting one attacker lock a victim out for long
    ratelimit.limit(request, "login-ip", 20, 60)
    ratelimit.limit(request, "login-acct", 8, 300, payload.email.lower())
    user_agent, ip_address = _client_meta(request)
    user, tenant, membership, tokens, must_rotate = await auth_service.login_user(
        db, email=payload.email, password=payload.password, user_agent=user_agent, ip_address=ip_address
    )
    _set_access_cookie(response, tokens.access_token, tokens.expires_in_minutes)
    return AuthResponse(
        user_id=user.id,
        email=user.email,
        role=membership.role,
        workspace=WorkspaceOut(
            id=tenant.id,
            name=tenant.name,
            slug=tenant.slug,
            plan_id=tenant.plan_id,
            trial_ends_at=tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
        ),
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        expires_in_minutes=tokens.expires_in_minutes,
        must_rotate_password=must_rotate,
    )


@router.post("/google", response_model=AuthResponse)
async def google(payload: GoogleAuthRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    ratelimit.limit(request, "google-ip", 20, 60)
    user_agent, ip_address = _client_meta(request)
    user, tenant, membership, tokens, created = await auth_service.google_sign_in(
        db, credential=payload.credential, company_name=payload.company_name, user_agent=user_agent, ip_address=ip_address
    )
    if created:
        response.status_code = status.HTTP_201_CREATED
    _set_access_cookie(response, tokens.access_token, tokens.expires_in_minutes)
    return AuthResponse(
        user_id=user.id,
        email=user.email,
        role=membership.role,
        workspace=WorkspaceOut(
            id=tenant.id,
            name=tenant.name,
            slug=tenant.slug,
            plan_id=tenant.plan_id,
            trial_ends_at=tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
        ),
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        expires_in_minutes=tokens.expires_in_minutes,
        must_rotate_password=user.must_rotate_password,
    )


@router.post("/refresh")
async def refresh(payload: RefreshRequest, response: Response, db: AsyncSession = Depends(get_db)):
    tokens = await auth_service.refresh_access_token(db, refresh_token=payload.refresh_token)
    _set_access_cookie(response, tokens.access_token, tokens.expires_in_minutes)
    return {
        "access_token": tokens.access_token,
        "refresh_token": tokens.refresh_token,
        "expires_in_minutes": tokens.expires_in_minutes,
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: LogoutRequest, response: Response, db: AsyncSession = Depends(get_db)):
    await auth_service.logout_user(db, refresh_token=payload.refresh_token)
    response.delete_cookie("access_token")


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(payload: ForgotPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ratelimit.limit(request, "forgot", 5, 3600)
    ratelimit.limit(request, "forgot-acct", 3, 3600, payload.email.lower())
    reset_token = await auth_service.request_password_reset(db, email=payload.email)
    if reset_token:
        link = f"{get_settings().frontend_url.rstrip('/')}/reset-password?token={reset_token}"
        await mailer.send(payload.email, "Reset your LeadForGrow password",
                          mailer.button_html("Reset your password", "We received a request to reset your password. This link expires in 1 hour. If this wasn't you, ignore this email.", "Choose a new password", link))
    # Always respond the same way regardless of whether the email existed,
    # so this endpoint can't be used to enumerate registered accounts.
    return {"success": True, "message": "If an account exists for that email, a reset link has been sent."}


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    await auth_service.reset_password(db, token=payload.token, new_password=payload.new_password)


@router.post("/rotate-password", status_code=status.HTTP_204_NO_CONTENT)
async def rotate_password(
    payload: RotatePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await auth_service.rotate_password(
        db, user=current_user, current_password=payload.current_password, new_password=payload.new_password
    )


@router.get("/me")
async def me(
    current_user: User = Depends(get_current_user),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Workspace not found."})

    membership = (
        await db.execute(
            select(TenantMembership).where(
                TenantMembership.tenant_id == tenant_id, TenantMembership.user_id == current_user.id
            )
        )
    ).scalar_one_or_none()

    plan = await db.get(Plan, tenant.plan_id)

    return {
        "user_id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "must_rotate_password": current_user.must_rotate_password,
        "role": membership.role if membership else None,
        "is_platform_admin": is_platform_admin(current_user),
        "workspace": {
            "id": tenant.id,
            "name": tenant.name,
            "slug": tenant.slug,
            "plan_id": tenant.plan_id,
            "plan_name": plan.name if plan else tenant.plan_id,
            "trial_ends_at": tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
            "plan_state": billing_svc.plan_state(tenant),
            "features": entitlements.features_of(plan),
        },
    }
