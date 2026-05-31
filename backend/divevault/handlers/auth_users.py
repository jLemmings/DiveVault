from __future__ import annotations

import re


def handle_get(handler, path: str, query: dict[str, list[str]], *, deps) -> bool:
    if path == "/api/auth/status":
        invite_token = (handler._single_query_arg(query, "invite_token") or "").strip()
        conn = handler._open_db()
        if conn is None:
            return True
        try:
            settings = deps.get_auth_instance_settings(conn)
            invite = None
            if invite_token:
                invite = deps.get_auth_invite_by_token(conn, invite_token, now_timestamp=int(deps.time.time()))
        finally:
            conn.close()
        handler._send_json(
            200,
            {
                "initialized": settings.get("initialized", False),
                "user_count": settings.get("user_count", 0),
                "bootstrap_registration_open": settings.get("bootstrap_registration_open", False),
                "public_registration_enabled": settings.get("public_registration_enabled", False),
                "public_registration_open": settings.get("public_registration_open", False),
                "invite": invite,
            },
        )
        return True

    if path == "/api/auth/me":
        claims = handler._require_auth()
        if claims is None:
            return True
        conn = handler._open_db()
        if conn is None:
            return True
        try:
            auth_user = deps.get_auth_user_by_id(conn, claims.get("sub") or "")
            auth_settings = deps.get_auth_instance_settings(conn)
        finally:
            conn.close()
        handler._send_json(
            200,
            {
                "token_type": claims.get("token_type", "session_token"),
                "session_id": claims.get("sid"),
                "user_id": claims.get("sub"),
                "email": (auth_user or {}).get("email") or claims.get("email"),
                "first_name": (auth_user or {}).get("first_name", ""),
                "last_name": (auth_user or {}).get("last_name", ""),
                "role": (auth_user or {}).get("role") or claims.get("role", "user"),
                "is_active": bool((auth_user or {}).get("is_active", True)),
                "is_owner": handler._principal_id_from_claims(claims) == auth_settings.get("owner_user_id"),
            },
        )
        return True

    if path == "/api/auth/settings":
        claims = handler._require_owner_auth()
        if claims is None:
            return True
        conn = handler._open_db()
        if conn is None:
            return True
        try:
            settings = deps.get_auth_instance_settings(conn)
        finally:
            conn.close()
        handler._send_json(200, settings)
        return True

    if path == "/api/users":
        claims = handler._require_owner_auth()
        if claims is None:
            return True
        conn = handler._open_db()
        if conn is None:
            return True
        try:
            users = deps.list_auth_users(conn)
        finally:
            conn.close()
        handler._send_json(200, {"users": users})
        return True

    if path == "/api/cli-auth/request":
        if not handler._enforce_rate_limit("cli_auth_request_status"):
            return True
        code = handler._single_query_arg(query, "code")
        if not code:
            handler._send_json(400, {"error": "Missing code query parameter"})
            return True
        payload = handler.server.cli_auth_manager.get_request_status(code)
        if payload is None:
            handler._send_json(404, {"error": "CLI auth request not found or expired"})
            return True
        handler._send_json(200, payload)
        return True

    return False


def handle_post(handler, path: str, *, deps) -> bool:
    if path == "/api/auth/register":
        return _handle_register(handler, deps=deps)
    if path == "/api/auth/login":
        return _handle_login(handler, deps=deps)
    if path == "/api/cli-auth/request":
        if not handler._enforce_rate_limit("cli_auth_request_create"):
            return True
        payload = handler.server.cli_auth_manager.create_request()
        handler._send_json(201, payload)
        return True
    if path == "/api/auth/invitations":
        return _handle_create_invitation(handler, deps=deps)
    if path == "/api/users":
        return _handle_create_user(handler, deps=deps)
    if path == "/api/cli-auth/approve":
        return _handle_cli_auth_approve(handler)
    return False


def _handle_register(handler, *, deps) -> bool:
    payload = handler._read_json_body()
    if payload is None:
        return True
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "")
    invite_token = str(payload.get("invite_token") or "").strip()
    if not invite_token and (not email or "@" not in email):
        handler._send_json(400, {"error": "Valid email is required"})
        return True
    if len(password) < 8:
        handler._send_json(400, {"error": "Password must be at least 8 characters"})
        return True
    conn = handler._open_db()
    if conn is None:
        return True
    try:
        if invite_token:
            invite = deps.get_auth_invite_by_token(conn, invite_token, now_timestamp=int(deps.time.time()))
            if not invite:
                handler._send_json(400, {"error": "Invitation is invalid or expired"})
                return True
            invite_email = str(invite.get("email") or "").strip().lower()
            if email and email != invite_email:
                handler._send_json(400, {"error": "Invitation email does not match the submitted email"})
                return True
            try:
                user = deps.create_auth_user_from_invite(
                    conn,
                    invite_token=invite_token,
                    user_id=f"user_{deps.uuid.uuid4().hex}",
                    password_hash=deps.hash_password(password),
                )
            except ValueError as exc:
                message = str(exc)
                if message == "Email already registered":
                    handler._send_json(409, {"error": message})
                    return True
                handler._send_json(400, {"error": message})
                return True
        else:
            settings = deps.get_auth_instance_settings(conn)
            if deps.get_auth_user_by_email(conn, email):
                handler._send_json(409, {"error": "Email already registered"})
                return True
            if settings.get("bootstrap_registration_open"):
                try:
                    user = deps.create_bootstrap_auth_user(
                        conn,
                        user_id=f"user_{deps.uuid.uuid4().hex}",
                        email=email,
                        password_hash=deps.hash_password(password),
                        first_name=str(payload.get("first_name") or "").strip(),
                        last_name=str(payload.get("last_name") or "").strip(),
                    )
                except ValueError as exc:
                    message = str(exc)
                    if message == "Email already registered":
                        handler._send_json(409, {"error": message})
                        return True
                    handler._send_json(403, {"error": message})
                    return True
            elif settings.get("public_registration_enabled"):
                user = deps.create_auth_user(
                    conn,
                    user_id=f"user_{deps.uuid.uuid4().hex}",
                    email=email,
                    password_hash=deps.hash_password(password),
                    first_name=str(payload.get("first_name") or "").strip(),
                    last_name=str(payload.get("last_name") or "").strip(),
                    role="user",
                )
            else:
                handler._send_json(403, {"error": "Public registration is closed"})
                return True
    finally:
        conn.close()
    handler._send_json(
        201,
        {
            "user_id": user.get("id"),
            "email": user.get("email"),
            "role": user.get("role"),
            "is_owner": bool(invite_token) is False and user.get("role") == "admin",
        },
    )
    return True


def _handle_login(handler, *, deps) -> bool:
    payload = handler._read_json_body()
    if payload is None:
        return True
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "")
    conn = handler._open_db()
    if conn is None:
        return True
    try:
        user = deps.get_auth_user_by_email(conn, email)
        if not user or not deps.verify_password(password, user.get("password_hash") or ""):
            handler._send_json(401, {"error": "Invalid email or password"})
            return True
        if not bool(user.get("is_active", True)):
            handler._send_json(403, {"error": "User account is inactive"})
            return True
        deps.update_auth_user_last_login(conn, user.get("id"))
    finally:
        conn.close()
    token = deps.issue_session_token(
        user_id=user.get("id"),
        email=user.get("email"),
        role=user.get("role") or "user",
        jwt_secret=handler.server.auth_jwt_secret,
        issuer=handler.server.auth_jwt_issuer,
        audience=handler.server.auth_jwt_audience,
        ttl_seconds=handler.server.auth_token_ttl_seconds,
    )
    handler._send_json(200, {"token": token})
    return True


def _handle_create_invitation(handler, *, deps) -> bool:
    claims = handler._require_owner_auth()
    if claims is None:
        return True
    payload = handler._read_json_body()
    if payload is None:
        return True
    email = str(payload.get("email") or "").strip().lower()
    if not email or "@" not in email:
        handler._send_json(400, {"error": "Valid email is required"})
        return True
    role = handler._normalize_user_role(payload.get("role"))
    if role is None:
        handler._send_json(400, {"error": "Role must be either 'user' or 'admin'"})
        return True
    expires_in_days = handler._parse_int(str(payload.get("expires_in_days") or "7"), default=7, max_value=30)
    now_timestamp = int(deps.time.time())
    expires_at = now_timestamp + max(expires_in_days, 1) * 24 * 60 * 60
    invite_token = deps.secrets.token_urlsafe(24)
    conn = handler._open_db()
    if conn is None:
        return True
    try:
        if deps.get_auth_user_by_email(conn, email):
            handler._send_json(409, {"error": "Email already registered"})
            return True
        invite = deps.create_auth_invite(
            conn,
            token=invite_token,
            email=email,
            first_name=str(payload.get("first_name") or "").strip(),
            last_name=str(payload.get("last_name") or "").strip(),
            role=role,
            invited_by_user_id=handler._principal_id_from_claims(claims) or "",
            expires_at=expires_at,
            now_timestamp=now_timestamp,
        )
    finally:
        conn.close()
    invite_query = deps.urlencode({"invite_token": invite_token})
    handler._send_json(
        201,
        {
            "invite": invite,
            "invite_url": f"/?{invite_query}",
        },
    )
    return True


def _handle_create_user(handler, *, deps) -> bool:
    claims = handler._require_owner_auth()
    if claims is None:
        return True
    payload = handler._read_json_body()
    if payload is None:
        return True
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "")
    if not email or not password:
        handler._send_json(400, {"error": "email and password are required"})
        return True
    role = handler._normalize_user_role(payload.get("role"))
    if role is None:
        handler._send_json(400, {"error": "Role must be either 'user' or 'admin'"})
        return True
    conn = handler._open_db()
    if conn is None:
        return True
    try:
        if deps.get_auth_user_by_email(conn, email):
            handler._send_json(409, {"error": "Email already registered"})
            return True
        created = deps.create_auth_user(
            conn,
            user_id=f"user_{deps.uuid.uuid4().hex}",
            email=email,
            password_hash=deps.hash_password(password),
            first_name=str(payload.get("first_name") or "").strip(),
            last_name=str(payload.get("last_name") or "").strip(),
            role=role,
        )
    finally:
        conn.close()
    handler._send_json(201, {"user": created})
    return True


def _handle_cli_auth_approve(handler) -> bool:
    if not handler._enforce_rate_limit("cli_auth_approve"):
        return True
    claims = handler._require_browser_session_auth()
    if claims is None:
        return True
    payload = handler._read_json_body()
    if payload is None:
        return True
    code = (payload.get("code") or "").strip()
    if not code:
        handler._send_json(400, {"error": "Missing CLI auth code"})
        return True
    approval = handler.server.cli_auth_manager.approve_request(code, claims)
    if approval is None:
        handler._send_json(404, {"error": "CLI auth request not found or expired"})
        return True
    handler._send_json(
        200,
        {
            "status": approval["status"],
            "email": approval.get("email"),
            "token_expires_at": approval.get("token_expires_at"),
        },
    )
    return True


def handle_put(handler, path: str, *, deps) -> bool:
    if path == "/api/auth/settings":
        claims = handler._require_owner_auth()
        if claims is None:
            return True
        payload = handler._read_json_body()
        if payload is None:
            return True
        if "public_registration_enabled" not in payload:
            handler._send_json(400, {"error": "public_registration_enabled is required"})
            return True
        conn = handler._open_db()
        if conn is None:
            return True
        try:
            settings = deps.update_auth_instance_settings(
                conn,
                public_registration_enabled=bool(payload.get("public_registration_enabled")),
            )
        finally:
            conn.close()
        handler._send_json(200, settings)
        return True

    if path == "/api/auth/password":
        claims = handler._require_auth()
        if claims is None:
            return True
        payload = handler._read_json_body()
        if payload is None:
            return True
        current_password = str(payload.get("current_password") or "")
        new_password = str(payload.get("new_password") or "")
        if len(new_password) < 8:
            handler._send_json(400, {"error": "New password must be at least 8 characters"})
            return True
        conn = handler._open_db()
        if conn is None:
            return True
        try:
            user = deps.get_auth_user_by_id(conn, claims.get("sub") or "")
            if not user or not deps.verify_password(current_password, user.get("password_hash") or ""):
                handler._send_json(401, {"error": "Current password is incorrect"})
                return True
            deps.update_auth_user(conn, user.get("id"), {"password_hash": deps.hash_password(new_password)})
        finally:
            conn.close()
        handler._send_json(200, {"updated": True})
        return True

    match = re.fullmatch(r"/api/users/(user_[A-Za-z0-9]+)", path)
    if match:
        claims = handler._require_owner_auth()
        if claims is None:
            return True
        payload = handler._read_json_body()
        if payload is None:
            return True
        user_id = match.group(1)
        if "role" in payload:
            role = handler._normalize_user_role(payload.get("role"))
            if role is None:
                handler._send_json(400, {"error": "Role must be either 'user' or 'admin'"})
                return True
            payload = dict(payload)
            payload["role"] = role
        conn = handler._open_db()
        if conn is None:
            return True
        try:
            settings = deps.get_auth_instance_settings(conn)
            if user_id == settings.get("owner_user_id"):
                if "is_active" in payload and not bool(payload.get("is_active")):
                    handler._send_json(400, {"error": "The instance owner cannot be deactivated"})
                    return True
                if payload.get("role") == "user":
                    handler._send_json(400, {"error": "The instance owner must retain the admin role"})
                    return True
            updated = deps.update_auth_user(conn, user_id, payload)
        finally:
            conn.close()
        if not updated:
            handler._send_json(404, {"error": "User not found"})
            return True
        handler._send_json(200, {"user": updated})
        return True

    return False


def handle_delete(handler, path: str, *, deps) -> bool:
    match = re.fullmatch(r"/api/users/(user_[A-Za-z0-9]+)", path)
    if not match:
        return False
    claims = handler._require_owner_auth()
    if claims is None:
        return True
    target_user_id = match.group(1)
    conn = handler._open_db()
    if conn is None:
        return True
    try:
        settings = deps.get_auth_instance_settings(conn)
        if target_user_id == settings.get("owner_user_id"):
            handler._send_json(400, {"error": "The instance owner cannot be deleted"})
            return True
        deleted = deps.delete_auth_user(conn, target_user_id)
    finally:
        conn.close()
    if not deleted:
        handler._send_json(404, {"error": "User not found"})
        return True
    handler._send_json(200, {"deleted": True, "user_id": target_user_id})
    return True
