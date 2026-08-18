// layout.js
// =========
// Carregado em toda página do dashboard (dashboard.html, chat.html,
// account.html, settings.html). Monta as partes
// dinâmicas do layout que, no projeto original, o EJS renderizava no
// servidor a partir do banco de dados: a lista de conversas na sidebar
// e o "chip" do usuário (avatar + nome) no rodapé da sidebar.
//
// Também funciona como o "guarda de autenticação" do lado do cliente:
// como não existe mais uma sessão renderizada no servidor, cada página
// do dashboard pergunta ao backend "quem está logado?" via
// GET /api/dashboard; se a resposta for 401, redireciona para /login -
// exatamente o que o middleware requireAuth (src/require-auth.ts) fazia
// no Express.
//
// Substitui: public/js/sidebar.js e as partes dinâmicas de
// src/views/partials/{dashboard-head,sidebar}.ejs.

document.addEventListener("DOMContentLoaded", function () {
  loadDashboardShell();
  wireLogout();
  wireSidebarToggle();
});

// Dois botões (mesmo ícone, mesmo comportamento) - um dentro do
// cabeçalho da sidebar (ao lado do logo, estilo DeepSeek), outro na
// topbar (visível quando a sidebar está colapsada, pra reabrir - ver
// app.css). No mobile ele abre/fecha a gaveta sobreposta
// (.sidebar-open, já existia); no desktop minimiza a sidebar de vez
// (.sidebar-collapsed em <html>, não em .app-shell, porque essa classe
// também precisa ser lida cedo - ver o script inline no <head> de
// cada página - e nesse ponto .app-shell ainda não existe no DOM). O
// estado colapsado persiste entre páginas porque este é um app
// multi-página de verdade, sem isso a sidebar "voltaria" a cada
// navegação.
function wireSidebarToggle() {
  var toggles = document.querySelectorAll(".sidebar-toggle");
  var appShell = document.querySelector(".app-shell");
  if (!toggles.length || !appShell) return;

  toggles.forEach(function (toggle) {
    toggle.addEventListener("click", function () {
      appShell.classList.toggle("sidebar-open");
      var collapsed = document.documentElement.classList.toggle("sidebar-collapsed");
      localStorage.setItem("trash-talker-sidebar-collapsed", collapsed ? "1" : "0");
    });
  });
}

async function loadDashboardShell() {
  var data;
  try {
    data = await apiFetch("/api/dashboard");
  } catch (_err) {
    // Sem sessão válida (ou erro de rede tratado como "não autenticado"):
    // manda para o login, igual ao requireAuth original.
    window.location.href = "/login";
    return;
  }

  renderUserChip(data.user);
  renderChatList(data.chats);
  wireNewChatButton();
}

function renderUserChip(user) {
  var chip = document.querySelector(".user-chip");
  if (!chip) return;

  chip.dataset.userId = user.id;

  // O "apelido" salvo em localStorage sobrepõe o nome vindo do banco,
  // igual ao comportamento original (perfil local > nome da conta).
  var displayName = user.name;
  try {
    var raw = localStorage.getItem("trash-talker-local-profile-" + user.id);
    if (raw) {
      var profile = JSON.parse(raw);
      if (profile.displayName) displayName = profile.displayName;
    }
  } catch (_e) {
    // localStorage corrompido/indisponível: ignora e usa o nome do banco.
  }

  var avatarSlot = chip.querySelector(".avatar-slot");
  if (avatarSlot) {
    avatarSlot.innerHTML = renderAvatarHTML(user.image, user.name, 32);
  }
  var nameEl = chip.querySelector(".user-name");
  if (nameEl) nameEl.textContent = displayName;
}

function renderChatList(chats) {
  var list = document.querySelector(".chat-list");
  if (!list) return;

  list.innerHTML = "";
  chats.forEach(function (chat) {
    list.appendChild(buildChatListItem(chat));
  });
}

function buildChatListItem(chat) {
  var li = document.createElement("li");
  li.className = "chat-item";

  var link = document.createElement("a");
  link.href = "/dashboard/chat/" + chat.id;
  link.className = "chat-link";
  // O title (tooltip nativo) é quem identifica a conversa quando a
  // sidebar está colapsada e só o ícone aparece.
  link.title = chat.title;
  link.innerHTML =
    '<svg class="icon chat-link-icon" viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.3" y="4.3" width="13.4" height="9.4" rx="2.2"></rect><path d="M7.5 13.7v3l3.4-3"></path></svg><span class="chat-link-text"></span>';
  // Título vem do usuário (mensagem/renomeação) - por segurança, nunca
  // via innerHTML/interpolação de string, sempre textContent.
  link.querySelector(".chat-link-text").textContent = chat.title;
  li.appendChild(link);

  var actions = document.createElement("span");
  actions.className = "chat-actions";

  var renameBtn = document.createElement("button");
  renameBtn.type = "button";
  renameBtn.title = "Renomear";
  renameBtn.innerHTML =
    '<svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13.2 3.8 16.2 6.8 6.5 16.5H3.5v-3Z"></path></svg>';
  renameBtn.addEventListener("click", function () {
    renameChat(chat.id, chat.title);
  });

  var deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.title = "Excluir";
  deleteBtn.innerHTML =
    '<svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="16" y2="6"></line><path d="M8 6V4.2h4V6"></path><path d="M6 6l.8 9.8a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9L14 6"></path></svg>';
  deleteBtn.addEventListener("click", function () {
    deleteChat(chat.id, chat.title);
  });

  actions.appendChild(renameBtn);
  actions.appendChild(deleteBtn);
  li.appendChild(actions);

  return li;
}

function wireNewChatButton() {
  var form = document.querySelector(".sidebar-new-chat");
  if (!form) return;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var button = form.querySelector("button");
    withLoadingState(button, "Criando...", function () {
      return apiFetch("/api/chats", { method: "POST" }).then(function (
        result,
      ) {
        window.location.href = "/dashboard/chat/" + result.id;
      });
    }).catch(function (err) {
      alert(err.message);
    });
  });
}

// Renomear e excluir usam o mesmo prompt()/confirm() do original
// (renameChat/deleteChat em public/js/chat.js), só que chamando a API
// via fetch em vez de submeter um <form> escondido.

function renameChat(id, currentTitle) {
  var title = prompt("Novo nome da conversa:", currentTitle);
  if (!title || !title.trim() || title.trim() === currentTitle) return;

  apiFetch("/api/chats/" + id + "/title", {
    method: "POST",
    body: { title: title.trim() },
  })
    .then(function () {
      window.location.reload();
    })
    .catch(function (err) {
      alert(err.message);
    });
}

function deleteChat(id, title) {
  var confirmed = confirm(
    'Tem certeza que deseja excluir a conversa "' +
      title +
      '"? Esta ação não pode ser desfeita.',
  );
  if (!confirmed) return;

  apiFetch("/api/chats/" + id + "/delete", { method: "POST" })
    .then(function () {
      window.location.href = "/dashboard";
    })
    .catch(function (err) {
      alert(err.message);
    });
}

function wireLogout() {
  var form = document.querySelector(".sidebar-footer form");
  if (!form) return;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    apiFetch("/api/logout", { method: "POST" })
      .catch(function () {
        // Mesmo se der erro, segue para o login - não há nada mais
        // que o usuário possa fazer a partir desta tela.
      })
      .then(function () {
        window.location.href = "/login";
      });
  });
}
