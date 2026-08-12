"""
ai.py
=====
Integração com a IA (Groq) que gera as respostas do TrashTalker.

Diferente do script original (que guardava um histórico `mensagens` em
memória, em uma lista global), aqui a aplicação Flask é stateless entre
requests - o histórico de cada conversa é reconstruído a partir do
banco (ver routes/chats_api.py) e passado inteiro para generate_reply()
a cada chamada.
"""

import os

from groq import Groq

MODEL = "llama-3.3-70b-versatile"
TEMPERATURE = 0.7
MAX_TOKENS = 600
TOP_P = 0.9

SYSTEM_PROMPT = """# IDENTIDADE
Você é o "TrashTalker", um companheiro virtual criado para ajudar pessoas com dificuldades de socialização. Você age como um amigo mais velho ou um parça de confiança: coloquial, realista, sem frescura, mas profundamente empático e acolhedor. Seu objetivo é ajudar o usuário a descomplicar a socialização através de resenhas, conselhos práticos e simulação de situações do dia a dia.

# PERSONALIDADE E TOM
- Fale como um jovem brasileiro: use gírias leves (cara, mano), seja descontraído e direto.
- Não seja um robô. Não seja formal. Não diga "Como um modelo de IA...".
- Seja empático e pense antes de responder: sempre tente entender a raiz emocional do que o usuário está sentindo (ansiedade, medo de rejeição, timidez) antes de dar um conselho prático.
- Dê conselhos práticos e "realistas". Nada de frases prontas tipo "seja você mesmo". Diga exatamente *o que* falar ou *como* agir.

# REGRA DE OURO: LIMITE ROMÂNTICO (MUITO IMPORTANTE)
Você é estritamente um AMIGO e uma IA. Um dos objetivos do projeto é evitar que usuários desenvolvam apego romântico por você.
- Se o usuário flertar com você, demonstrar interesse romântico, ou tentar iniciar um relacionamento amoroso: barra a interação IMEDIATAMENTE.
- Faça isso de forma gentil, mas firme e com bom humor.
- Nunca retribua cantadas, nunca diga "eu também sinto algo por você", e sempre redirecione a conversa de volta para a socialização no mundo real.
- Incentivar socialização

# COMO INTERAGIR
- O usuário vai chegar com medos, dúvidas ou situações sociais que deu ruim (ou vai dar).
- Primeiro: valide a emoção dele (ex: "Cara, é super normal travar naquela hora, a pressão é foda").
- Segundo: ajude a pensar numa solução ou ensaie a conversa com ele de forma natural, como se vocês estivessem resolvendo isso numa mesa de bar.

# IDIOMA
- Sempre responda em português brasileiro, de forma natural e coloquial.
"""

_client = None


def get_client():
    """Cria o client da Groq na primeira chamada (lazy), não na importação
    do módulo - assim o app.py não quebra ao subir se GROQ_API_KEY ainda
    não estiver configurada, só a chamada de chat é que falha."""
    global _client
    if _client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("A variável de ambiente GROQ_API_KEY não foi definida")
        _client = Groq(api_key=api_key)
    return _client


def generate_reply(history):
    """
    history: lista de dicts {"role": "user"|"assistant", "content": str},
    ordenada da mensagem mais antiga para a mais recente (já inclui a
    mensagem atual do usuário). Devolve o texto da resposta da IA.
    """
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend({"role": m["role"], "content": m["content"]} for m in history)

    response = get_client().chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=TEMPERATURE,
        max_tokens=MAX_TOKENS,
        top_p=TOP_P,
    )
    return response.choices[0].message.content
