"""
db.py
=====
Camada de acesso ao banco de dados (PostgreSQL).

Filosofia mantida do projeto original (ver AGENTS.md): SQL cru, sem ORM,
sem query builder. Aqui usamos `psycopg2` com um pool de conexões simples
e uma função `query()` que devolve sempre uma lista de dicionários
(uma linha = um dict), parecido com o helper `sql` tagged-template que
existia em TypeScript (src/db.ts).

Diferença importante em relação ao `sql` do TypeScript original: em Python
não temos "tagged template literals", então em vez de escrever

    sql`SELECT * FROM chat WHERE id = ${chatId}`

escrevemos

    query("SELECT * FROM chats WHERE id = %s", (chat_id,))

O psycopg2 substitui os `%s` pelos valores de forma segura (usando
parâmetros de verdade, não concatenação de string), o que evita SQL
Injection - a mesma proteção que o template tag original oferecia.
"""

import os
import secrets
from contextlib import contextmanager

import psycopg2
import psycopg2.pool
from psycopg2.extras import RealDictCursor

# Pool de conexões: em vez de abrir/fechar uma conexão nova a cada
# requisição (lento), mantemos algumas conexões abertas e "emprestadas"
# sob demanda. minconn=1 garante ao menos uma conexão pronta; maxconn=10
# é suficiente para uma aplicação pequena como esta.
_pool = None


def init_pool():
    """Cria o pool de conexões. Chamado uma vez, na inicialização do app.py."""
    global _pool
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("A variável de ambiente DATABASE_URL não foi definida")
    _pool = psycopg2.pool.SimpleConnectionPool(1, 10, dsn=database_url)


@contextmanager
def get_connection():
    """Context manager que pega uma conexão do pool e devolve ao final."""
    if _pool is None:
        raise RuntimeError("init_pool() precisa ser chamado antes de usar o banco")
    conn = _pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)


def query(sql_text, params=()):
    """
    Executa uma query e devolve todas as linhas como lista de dicts.
    Use para SELECT.
    """
    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql_text, params)
            return [dict(row) for row in cur.fetchall()]


def query_one(sql_text, params=()):
    """Como query(), mas devolve só a primeira linha (ou None)."""
    rows = query(sql_text, params)
    return rows[0] if rows else None


def execute(sql_text, params=()):
    """
    Executa um comando que não devolve linhas (INSERT/UPDATE/DELETE sem
    RETURNING). Use quando não precisar do resultado.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql_text, params)


def new_id():
    """
    Gera um id único em formato texto, usado como chave primária em todas
    as tabelas (equivalente ao @paralleldrive/cuid2 do projeto original,
    só que usando apenas a biblioteca padrão do Python).
    """
    return secrets.token_hex(12)


def get_owned_chat(chat_id, user_id):
    """
    Busca uma conversa (chat) garantindo que ela pertence ao usuário logado.
    Retorna None se não existir ou se pertencer a outro usuário - assim
    evitamos que um usuário acesse/edite a conversa de outra pessoa apenas
    adivinhando o id (equivalente a getOwnedChat() em src/db.ts).
    """
    return query_one(
        "SELECT * FROM chats WHERE id = %s AND user_id = %s",
        (chat_id, user_id),
    )
