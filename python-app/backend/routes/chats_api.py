"""
routes/chats_api.py
====================
Endpoints protegidos por login: dados do dashboard (usuário + lista de
conversas), leitura/criação/renomeação/exclusão de conversas e
atualização do perfil da conta.

Equivalente a:
  - src/routes/pages.ts (as partes que buscavam `chats` e `messages` no
    banco para montar as páginas - aqui essa busca é exposta como JSON)
  - src/routes/chats.ts (criar/renomear/excluir chat, atualizar perfil)

Todas as rotas abaixo passam pelo decorator @require_auth, então
`g.user` sempre está preenchido dentro delas (equivalente ao
`req.user` do AuthedRequest em TypeScript).
"""

from flask import Blueprint, g, jsonify, request

from ai import generate_reply
from auth import clear_session_cookie, require_auth, verify_password
from avatars import ILLUSTRATED_AVATARS
from db import execute, get_owned_chat, new_id, query, query_one

chats_api = Blueprint("chats_api", __name__, url_prefix="/api")


@chats_api.route("/dashboard", methods=["GET"])
@require_auth
def dashboard():
    """
    Dados usados em TODA página do dashboard: usuário logado + lista de
    conversas (para montar a sidebar). Chamado por frontend/js/layout.js
    em toda página dashboard*.html.
    """
    chats = query(
        "SELECT * FROM chats WHERE user_id = %s ORDER BY updated_at DESC",
        (g.user["id"],),
    )
    return jsonify(
        {
            "user": g.user,
            "chats": chats,
            "illustratedAvatars": ILLUSTRATED_AVATARS,
        }
    )


@chats_api.route("/chats/<chat_id>", methods=["GET"])
@require_auth
def get_chat(chat_id):
    """Dados de uma conversa específica + suas mensagens (frontend/js/chat.js)."""
    chat = get_owned_chat(chat_id, g.user["id"])
    if not chat:
        return jsonify({"error": "Conversa não encontrada"}), 404

    messages = query(
        "SELECT * FROM messages WHERE chat_id = %s ORDER BY created_at ASC",
        (chat["id"],),
    )
    return jsonify({"chat": chat, "messages": messages})


@chats_api.route("/chats", methods=["POST"])
@require_auth
def create_chat():
    """Cria uma nova conversa vazia e devolve o id (o frontend navega até ela)."""
    chat_id = new_id()
    execute(
        "INSERT INTO chats (id, user_id, title) VALUES (%s, %s, %s)",
        (chat_id, g.user["id"], "New Chat"),
    )
    return jsonify({"id": chat_id}), 201


@chats_api.route("/chats/<chat_id>/messages", methods=["POST"])
@require_auth
def send_message(chat_id):
    """
    Completa o "Stage 3": salva a mensagem do usuário, chama a IA
    (Groq) com o histórico da conversa e salva/devolve a resposta.
    """
    chat = get_owned_chat(chat_id, g.user["id"])
    if not chat:
        return jsonify({"error": "Conversa não encontrada"}), 404

    body = request.get_json(silent=True) or {}
    content = (body.get("content") or "").strip()
    if not content:
        return jsonify({"error": "Mensagem vazia"}), 400

    user_message_id = new_id()
    execute(
        "INSERT INTO messages (id, chat_id, role, content) VALUES (%s, %s, %s, %s)",
        (user_message_id, chat_id, "user", content),
    )
    execute("UPDATE chats SET updated_at = now() WHERE id = %s", (chat_id,))

    history = query(
        "SELECT role, content FROM messages WHERE chat_id = %s ORDER BY created_at ASC",
        (chat_id,),
    )

    # Primeira mensagem da conversa: usa ela como título automático em
    # vez de deixar "New Chat" até o usuário renomear na mão.
    if len(history) == 1:
        title = content[:40] + ("…" if len(content) > 40 else "")
        execute("UPDATE chats SET title = %s WHERE id = %s", (title, chat_id))

    try:
        reply_text = generate_reply(history)
    except Exception:
        return jsonify(
            {"error": "Não foi possível falar com a IA agora. Tente de novo."}
        ), 502

    assistant_message_id = new_id()
    execute(
        "INSERT INTO messages (id, chat_id, role, content) VALUES (%s, %s, %s, %s)",
        (assistant_message_id, chat_id, "assistant", reply_text),
    )
    execute("UPDATE chats SET updated_at = now() WHERE id = %s", (chat_id,))

    user_message = query_one("SELECT * FROM messages WHERE id = %s", (user_message_id,))
    assistant_message = query_one(
        "SELECT * FROM messages WHERE id = %s", (assistant_message_id,)
    )
    chat = query_one("SELECT * FROM chats WHERE id = %s", (chat_id,))
    return jsonify(
        {"chat": chat, "userMessage": user_message, "assistantMessage": assistant_message}
    )


@chats_api.route("/chats/<chat_id>/delete", methods=["POST"])
@require_auth
def delete_chat(chat_id):
    execute(
        "DELETE FROM chats WHERE id = %s AND user_id = %s",
        (chat_id, g.user["id"]),
    )
    return jsonify({"ok": True})


@chats_api.route("/chats/<chat_id>/title", methods=["POST"])
@require_auth
def rename_chat(chat_id):
    body = request.get_json(silent=True) or {}
    title = (body.get("title") or "").strip()
    if len(title) < 1:
        return jsonify({"error": "Título inválido"}), 400

    execute(
        "UPDATE chats SET title = %s, updated_at = now() "
        "WHERE id = %s AND user_id = %s",
        (title, chat_id, g.user["id"]),
    )
    return jsonify({"ok": True})


@chats_api.route("/account", methods=["POST"])
@require_auth
def update_account():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    image = body.get("image") or None

    # Validação equivalente ao updateProfileSchema (zod) do original.
    if len(name) < 2:
        return jsonify({"error": "Nome precisa ter ao menos 2 caracteres"}), 400

    execute(
        "UPDATE users SET name = %s, image = %s, updated_at = now() WHERE id = %s",
        (name, image, g.user["id"]),
    )
    return jsonify({"ok": True, "user": {**g.user, "name": name, "image": image}})


@chats_api.route("/account/delete", methods=["POST"])
@require_auth
def delete_account():
    """
    Apaga a conta de vez (exige a senha atual como reconfirmação).
    schema.sql já tem ON DELETE CASCADE em sessions/chats/
    password_reset_tokens apontando para users, então apagar a linha
    do usuário já limpa tudo o mais.
    """
    body = request.get_json(silent=True) or {}
    password = body.get("password") or ""

    full_user = query_one("SELECT * FROM users WHERE id = %s", (g.user["id"],))
    if not full_user or not verify_password(password, full_user["password_hash"]):
        return jsonify({"error": "Senha incorreta"}), 401

    execute("DELETE FROM users WHERE id = %s", (g.user["id"],))
    response = jsonify({"ok": True})
    return clear_session_cookie(response)
