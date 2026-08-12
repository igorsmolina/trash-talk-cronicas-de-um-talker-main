"""
auth.py
=======
Substitui a biblioteca "better-auth" (usada no projeto TypeScript original)
por uma implementação própria, simples e explícita, de autenticação por
sessão com cookie.

O que este módulo faz:
  1. Hash e verificação de senha (via werkzeug, que já vem com o Flask).
  2. Criação/leitura/destruição de sessões (tabela `sessions`), com um
     cookie httponly guardando o token da sessão.
  3. Geração e validação de tokens de "esqueci minha senha"
     (tabela `password_reset_tokens`, equivalente à tabela `verification`
     do better-auth).
  4. Um decorator `require_auth` para proteger rotas que só usuários
     logados podem acessar (equivalente a src/require-auth.ts).

Aviso de migração (leia isto!):
  O better-auth usa seu próprio algoritmo de hash de senha (scrypt com um
  formato específico) e sua própria tabela `account` para guardar esse
  hash. Não é possível reaproduzir esse formato de forma simples em Python
  sem reimplementar a biblioteca inteira. Por isso este projeto usa um
  esquema de banco de dados NOVO (ver schema.sql) com hash via
  werkzeug.security (PBKDF2-SHA256). Isso significa que contas criadas
  pela versão antiga (TypeScript) não vão funcionar aqui - é preciso
  recriar as contas depois de rodar schema.sql em um banco novo (ou
  limpo). Para um projeto de TCC ainda em desenvolvimento, isso é o
  caminho mais simples e seguro.
"""

import os
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from db import execute, query_one

SESSION_COOKIE_NAME = "session_token"
SESSION_DURATION = timedelta(days=30)
RESET_TOKEN_DURATION = timedelta(hours=1)


def hash_password(password):
    """Gera o hash de uma senha para salvar no banco."""
    return generate_password_hash(password)


def verify_password(password, password_hash):
    """Confere se `password` corresponde ao hash salvo no banco."""
    return check_password_hash(password_hash, password)


def create_session(user_id):
    """
    Cria uma nova sessão para o usuário e devolve o token (que vai para o
    cookie). Equivalente ao que o better-auth fazia internamente ao logar.
    """
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + SESSION_DURATION
    execute(
        "INSERT INTO sessions (id, user_id, expires_at) VALUES (%s, %s, %s)",
        (token, user_id, expires_at),
    )
    return token, expires_at


def destroy_session(token):
    """Remove a sessão do banco (usado no logout)."""
    if token:
        execute("DELETE FROM sessions WHERE id = %s", (token,))


def get_session_user(req):
    """
    Lê o cookie de sessão da requisição e devolve o usuário correspondente
    (ou None se não houver sessão válida). Equivalente a getSessionUser()
    em src/require-auth.ts.
    """
    token = req.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return None

    session = query_one(
        "SELECT * FROM sessions WHERE id = %s AND expires_at > now()",
        (token,),
    )
    if not session:
        return None

    user = query_one(
        "SELECT id, name, email, image FROM users WHERE id = %s",
        (session["user_id"],),
    )
    return user


def set_session_cookie(response, token, expires_at):
    """Anexa o cookie de sessão em uma resposta Flask."""
    is_production = os.environ.get("FLASK_ENV") == "production"
    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        httponly=True,
        samesite="Lax",
        secure=is_production,
        expires=expires_at,
        path="/",
    )
    return response


def clear_session_cookie(response):
    """Remove o cookie de sessão (usado no logout)."""
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return response


def require_auth(view_func):
    """
    Decorator usado em toda rota que exige usuário logado (equivalente ao
    middleware requireAuth do Express). Diferente da versão original (que
    redirecionava para /login), aqui devolvemos um JSON 401, já que estas
    rotas agora são uma API consumida via fetch() pelo JavaScript do
    frontend - é o próprio frontend que decide redirecionar para /login
    quando recebe esse 401 (ver frontend/js/layout.js).
    """

    @wraps(view_func)
    def wrapper(*args, **kwargs):
        user = get_session_user(request)
        if not user:
            return jsonify({"error": "Não autenticado"}), 401
        g.user = user
        return view_func(*args, **kwargs)

    return wrapper


def create_password_reset_token(user_id):
    """Gera um token de redefinição de senha válido por 1 hora."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + RESET_TOKEN_DURATION
    execute(
        "INSERT INTO password_reset_tokens (token, user_id, expires_at) "
        "VALUES (%s, %s, %s)",
        (token, user_id, expires_at),
    )
    return token


def consume_password_reset_token(token):
    """
    Valida um token de redefinição de senha e já marca como usado.
    Devolve o user_id se válido, ou None se inválido/expirado/já usado.
    """
    row = query_one(
        "SELECT * FROM password_reset_tokens "
        "WHERE token = %s AND used = false AND expires_at > now()",
        (token,),
    )
    if not row:
        return None
    execute(
        "UPDATE password_reset_tokens SET used = true WHERE token = %s",
        (token,),
    )
    return row["user_id"]
