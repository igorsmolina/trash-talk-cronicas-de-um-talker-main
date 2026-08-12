# Trash Talker — versão Python + HTML/CSS/JS puro

Esta pasta (`python-app/`) é uma reescrita completa do projeto **Trash
Talker**, originalmente em TypeScript (Express + EJS + better-auth),
usando apenas:

- **Front-end**: HTML5 + CSS3 + JavaScript puro (sem React/Next/Vue/Angular
  e sem nenhuma etapa de build).
- **Back-end**: Python (Flask), com SQL cru via `psycopg2` (sem ORM),
  falando com o mesmo banco PostgreSQL (Neon ou outro).

O projeto TypeScript original **não foi apagado** — ele continua na raiz
do repositório, fora desta pasta, para você comparar lado a lado enquanto
aprende a nova versão.

---

## 1. Análise do projeto original

Antes de converter, vale entender exatamente o que existia:

- **Não era um app React/Next.** O `AGENTS.md` do projeto original conta
  a história: a aplicação já tinha sido *simplificada* de uma versão
  antiga em Next.js/Drizzle/shadcn para uma versão bem mais simples em
  **Express + EJS** (HTML renderizado no servidor) + **JavaScript puro**
  no navegador. Ou seja, o trabalho de "sair do React" já tinha sido
  feito antes de eu começar - o que restava migrar era o **TypeScript no
  servidor** (Express, EJS, SQL cru via `pg`, autenticação via
  `better-auth`) e transformar os templates EJS em HTML estático puro.
- **Rotas / páginas**: `/`, `/login`, `/signup`, `/forgot-password`,
  `/reset-password`, `/privacy`, `/terms` (públicas) e
  `/dashboard`, `/dashboard/chat/:id`, `/dashboard/account`,
  `/dashboard/settings`, `/dashboard/information` (exigem login).
- **Autenticação**: e-mail/senha via `better-auth`, sessão por cookie.
- **Dados**: PostgreSQL com tabelas `user`, `session`, `account`,
  `verification`, `chat`, `message` (geradas pelo `better-auth`).
- **Funcionalidade incompleta no original** (marcada como TODO "Stage 3"
  no próprio código): o envio de mensagem no chat **não é persistido** -
  a mensagem do usuário só aparece localmente na tela, sem chamada ao
  servidor e sem resposta de IA de verdade. Essa limitação foi mantida
  de propósito nesta migração (ver seção 6 - "sem perdas" significa
  reproduzir o comportamento real, incluindo o que ainda não estava
  pronto).

---

## 2. Estratégia de migração

**O que muda de arquitetura (e por quê):**

O EJS renderizava HTML no servidor, misturando marcação com dados do
banco (`<% chats.forEach(...) %>` etc.). Isso não existe em HTML puro.
A troca foi:

1. Cada `view.ejs` virou um arquivo `.html` estático, com a mesma
   marcação e as mesmas classes CSS (para o `app.css` continuar
   funcionando sem nenhuma alteração).
2. Tudo que era dinâmico (lista de conversas na sidebar, nome/avatar do
   usuário, mensagens de uma conversa) passou a ser buscado do
   backend via `fetch()`, depois de a página já estar carregada, e
   desenhado no DOM por JavaScript. Esse é o papel principal de
   `frontend/js/layout.js` (sidebar/usuário) e `frontend/js/chat.js`
   (mensagens).
3. Os `<form method="post">` que antes causavam um recarregamento de
   página completo (padrão de app "old school" renderizado no
   servidor) foram trocados por chamadas `fetch()` que conversam com
   uma **API JSON** em Python (pasta `backend/`). A navegação entre
   páginas continua sendo "de verdade" (não é uma SPA com roteamento
   por JavaScript) - continuam existindo 12 arquivos `.html`
   separados, um por rota, exatamente como no original.
4. **Autenticação**: `better-auth` foi substituído por uma
   implementação própria e simples em `backend/auth.py` (sessão por
   cookie + hash de senha com `werkzeug.security`). Ver o aviso na
   seção 5.
5. **"Estado" sem React**: como não há framework de front-end, cada
   página HTML tem seu próprio script de inicialização que roda no
   `DOMContentLoaded`: busca os dados que precisa via `fetch`, preenche
   o DOM, e liga os `addEventListener` dos formulários/botões. Não há
   um "estado global" - cada página busca de novo o que precisa quando
   é carregada, o que é normal (e mais simples de entender) em uma
   aplicação multi-página como esta.

**Ordem em que a conversão foi feita:**

1. Banco de dados (`schema.sql`) e camada de acesso (`db.py`).
2. Autenticação (`auth.py`) - é a peça mais sensível (segurança).
3. Endpoints da API (`routes/auth_api.py`, `routes/chats_api.py`),
   mapeando 1:1 cada rota que existia em `src/routes/*.ts`.
4. `app.py` juntando tudo e servindo os arquivos estáticos do frontend.
5. CSS copiado sem nenhuma alteração (`frontend/css/app.css`).
6. JavaScript utilitário compartilhado (`api.js`, `avatar.js`,
   `theme.js`).
7. Uma página HTML por vez, com seu JS específico, comparando
   visualmente com o `.ejs` original até bater 1:1.

---

## 3. Estrutura de arquivos

```
python-app/
├── backend/
│   ├── app.py              # cria o Flask app, registra rotas, serve o frontend
│   ├── db.py                # pool de conexões Postgres + helpers de query
│   ├── auth.py               # sessão por cookie, hash de senha, tokens de reset
│   ├── avatars.py            # lista fixa dos avatares ilustrados
│   ├── routes/
│   │   ├── auth_api.py       # /api/login, /api/signup, /api/logout, /api/me, ...
│   │   └── chats_api.py      # /api/dashboard, /api/chats, /api/account
│   ├── schema.sql            # esquema do banco (rode uma vez no Postgres)
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── index.html            # landing page ("/")
    ├── login.html
    ├── signup.html
    ├── forgot-password.html
    ├── reset-password.html
    ├── privacy.html
    ├── terms.html
    ├── dashboard.html        # tela de boas-vindas do dashboard
    ├── chat.html              # uma conversa (id vem da URL)
    ├── account.html
    ├── settings.html
    ├── css/app.css            # idêntico ao original, sem alterações
    ├── js/
    │   ├── api.js              # fetch() com tratamento de erro/loading
    │   ├── avatar.js            # desenha avatar (foto/ilustrado/iniciais)
    │   ├── theme.js             # tema claro/escuro
    │   ├── auth.js              # validação de senha + esqueci senha/redefinir
    │   ├── login.js / signup.js
    │   ├── landing.js            # landing page única, adapta nav/CTA à sessão
    │   ├── layout.js             # sidebar + guarda de autenticação
    │   ├── chat.js                # composer + mensagens
    │   └── account.js             # formulário de conta
    ├── avatars/*.svg
    ├── personalities/pizzaiolo.jpg
    └── logo-talker.svg
```

---

## 4. Como instalar e rodar

### Pré-requisitos

- Python 3.10+
- Um banco PostgreSQL (local, ou o mesmo Neon do projeto original)

### Passo 1 - Ambiente virtual e dependências

```bash
cd python-app/backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Passo 2 - Banco de dados

Crie as tabelas rodando o schema fornecido:

```bash
psql "postgres://usuario:senha@host/banco?sslmode=require" -f schema.sql
psql "postgresql://neondb_owner:npg_DFuZX7gUlY5f@ep-long-bar-ac8jpvzv-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require" -f schema.sql

```

> ⚠️ Este schema é **novo** (ver aviso de segurança na seção 5) - use um
> banco novo ou limpo, não o mesmo banco já populado pelo `better-auth`
> da versão TypeScript.

### Passo 3 - Variáveis de ambiente

```bash
cp .env.example .env
# edite o .env e preencha DATABASE_URL
```

### Passo 4 - Rodar o servidor

```bash
python app.py
```

Acesse [http://localhost:5000](http://localhost:5000). O Flask serve o
front-end e a API na mesma porta - não é preciso rodar dois servidores
separados.

---

## 5. Avisos de migração (leia antes de usar em produção)

- **Senhas antigas não funcionam aqui.** O `better-auth` usa seu próprio
  formato de hash (scrypt) guardado na tabela `account`. Reproduzir esse
  formato exatamente exigiria reimplementar detalhes internos da
  biblioteca. Em vez disso, este projeto usa `werkzeug.security`
  (PBKDF2-SHA256), um padrão simples e seguro, mas incompatível com
  hashes antigos. **Contas precisam ser recriadas** (cadastro de novo)
  depois de migrar para este backend.
- **Sem CSRF token.** O `better-auth` original incluía proteção CSRF nas
  suas rotas internas. Como os formulários agora são JSON via `fetch`
  com cookie `SameSite=Lax` (em vez de formulários HTML tradicionais
  entre origens), o risco principal de CSRF (um site malicioso
  enviando um POST em nome do usuário) já é bem reduzido, mas não é uma
  proteção formal equivalente. Se for expor este projeto publicamente,
  vale adicionar um token CSRF nas rotas que alteram dados.
- **E-mail de redefinição de senha só vai para o console.** Igual ao
  original (`sendResetPassword` só fazia `console.log`), este projeto
  também apenas imprime o link no terminal onde o `python app.py` está
  rodando - nenhum e-mail é enviado de verdade. Veja a seção 6 para uma
  sugestão de como integrar um provedor de e-mail depois.

---

## 6. Sugestões de melhorias futuras

Já implementados nesta migração (ver histórico do projeto):
envio de mensagens de verdade com resposta de IA via Groq
(`POST /api/chats/<id>/messages`, `ai.py`), e-mail de verdade no
"esqueci minha senha" via SMTP (`email_utils.py`), exclusão de conta
de verdade (`POST /api/account/delete`) e título automático da
conversa a partir da primeira mensagem. A ideia de múltiplas
"personalidades" selecionáveis foi descartada de propósito - o
TrashTalker é um personagem único e fixo.

O que ainda falta:

1. **Testes automatizados.** Nem o projeto original nem esta migração
   têm testes. Para uma API Flask pequena como esta, `pytest` +
   `pytest-flask` cobrem bem os endpoints de `routes/`.
2. **CSRF token e rate limiting no login/signup/forgot-password**,
   especialmente se o projeto for ficar acessível na internet (ver
   aviso na seção 5) - hoje não há limite de tentativas.
3. **Limitar o histórico enviado à IA.** `ai.py` manda a conversa
   inteira para a Groq a cada mensagem; em conversas muito longas isso
   aumenta custo/latência e pode estourar o limite de tokens do
   modelo - vale truncar para as últimas N mensagens.
4. **Indicador de "digitando..." e resposta em streaming** no chat,
   em vez de esperar a resposta inteira da IA chegar de uma vez.
