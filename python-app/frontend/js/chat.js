// chat.js
// =======
// Comportamento das telas de conversa: tela de boas-vindas
// (dashboard.html) e tela de conversa em si (chat.html).
//
// Equivalente a public/js/chat.js do original, com um acréscimo: como
// chat.html agora é um arquivo estático (não recebe mais `messages` já
// prontas do servidor via EJS), este arquivo também busca as mensagens
// da conversa atual via GET /api/chats/<id> e as desenha na tela.

document.addEventListener("DOMContentLoaded", function () {
  wireComposer("welcome-form", "welcome-input", "welcome-submit", function (e) {
    // Tela de boas-vindas: cria a conversa e já manda a primeira
    // mensagem (Stage 3), em vez de descartar o texto digitado.
    e.preventDefault();
    var input = document.getElementById("welcome-input");
    var text = input.value.trim();
    if (!text) return;

    var button = document.getElementById("welcome-submit");
    withLoadingState(button, "...", function () {
      return apiFetch("/api/chats", { method: "POST" }).then(function (result) {
        return apiFetch("/api/chats/" + result.id + "/messages", {
          method: "POST",
          body: { content: text },
        })
          .catch(function () {
            // A conversa já foi criada e a mensagem do usuário já foi
            // salva antes de chamar a IA (ver chats_api.py) - se só a
            // IA falhar, ainda vale levar o usuário até a conversa em
            // vez de travar na tela de boas-vindas.
          })
          .then(function () {
            window.location.href = "/dashboard/chat/" + result.id;
          });
      });
    }).catch(function (err) {
      alert(err.message);
    });
  });

  wireComposer("chat-form", "chat-input", "chat-submit", function (e) {
    // Tela de conversa: desenha a mensagem do usuário na hora (otimista),
    // manda pro backend salvar e chamar a IA, e desenha a resposta
    // assim que ela chega (Stage 3).
    e.preventDefault();
    var input = document.getElementById("chat-input");
    var text = input.value.trim();
    if (!text) return;

    var messages = document.getElementById("chat-messages");
    var empty = messages.querySelector(".chat-empty");
    if (empty) empty.remove();

    messages.appendChild(buildMessageBubble("user", text));

    input.value = "";
    var submit = document.getElementById("chat-submit");
    submit.disabled = true;

    var typingBubble = buildTypingBubble();
    messages.appendChild(typingBubble);
    messages.scrollTop = messages.scrollHeight;

    var chatId = window.location.pathname.split("/").pop();

    withLoadingState(submit, "...", function () {
      return apiFetch("/api/chats/" + chatId + "/messages", {
        method: "POST",
        body: { content: text },
      });
    })
      .then(function (result) {
        typingBubble.remove();
        var assistantBubble = buildMessageBubble("assistant", "");
        messages.appendChild(assistantBubble);
        revealGradually(
          assistantBubble.querySelector(".msg-content"),
          result.assistantMessage.content,
          messages,
        );

        // Se essa foi a primeira mensagem, o backend já gerou um
        // título automático pra conversa - reflete na sidebar sem
        // precisar recarregar a página.
        if (result.chat) {
          var link = document.querySelector(
            '.chat-link[href="/dashboard/chat/' + chatId + '"]',
          );
          if (link) {
            link.textContent = result.chat.title;
            link.title = result.chat.title;
          }
        }
      })
      .catch(function (err) {
        typingBubble.remove();
        alert(err.message);
      })
      .finally(function () {
        input.focus();
      });
  });

  loadChatMessagesIfNeeded();
});

function wireComposer(formId, inputId, submitId, onSubmit) {
  var form = document.getElementById(formId);
  var input = document.getElementById(inputId);
  var submit = document.getElementById(submitId);
  if (!form || !input || !submit) return;

  function sync() {
    submit.disabled = !input.value.trim();
  }
  input.addEventListener("input", sync);
  sync();

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  if (onSubmit) form.addEventListener("submit", onSubmit);
}

// Equivalente ao partial src/views/partials/message-bubble.ejs.
function buildMessageBubble(role, content) {
  var bubble = document.createElement("div");
  bubble.className = "msg-bubble " + (role === "user" ? "msg-user" : "msg-assistant");
  var userIcon =
    '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="6.8" r="3.2"></circle><path d="M3.6 17c0-3.6 2.9-6 6.4-6s6.4 2.4 6.4 6"></path></svg>';
  var botIcon =
    '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="7.3" width="13" height="9.2" rx="2.4"></rect><line x1="10" y1="7.3" x2="10" y2="4.3"></line><circle cx="10" cy="3.2" r="1" fill="currentColor" stroke="none"></circle><circle cx="7.3" cy="11.7" r="1" fill="currentColor" stroke="none"></circle><circle cx="12.7" cy="11.7" r="1" fill="currentColor" stroke="none"></circle></svg>';
  bubble.innerHTML = '<div class="msg-avatar">' + (role === "user" ? userIcon : botIcon) + '</div><div class="msg-content"></div>';
  bubble.querySelector(".msg-content").textContent = content;
  return bubble;
}

// Bolha "digitando..." (3 pontinhos pulsando), mostrada no lugar da
// resposta enquanto a IA ainda não respondeu.
function buildTypingBubble() {
  var bubble = buildMessageBubble("assistant", "");
  bubble.classList.add("msg-typing");
  bubble.querySelector(".msg-content").innerHTML =
    '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  return bubble;
}

// Revela o texto aos poucos (efeito máquina de escrever) em vez de tudo
// de uma vez - só para respostas novas chegando ao vivo (mensagens
// carregadas do histórico continuam aparecendo na hora, ver
// loadChatMessagesIfNeeded). A quantidade de caracteres por "tick" cresce
// com o tamanho do texto para que a animação sempre dure ~1.8s, tanto
// pra uma resposta curta quanto pra uma longa.
function revealGradually(contentEl, text, scrollContainer) {
  var TICK_MS = 20;
  var TARGET_TICKS = 90;
  var charsPerTick = Math.max(1, Math.ceil(text.length / TARGET_TICKS));
  var shown = 0;

  var timer = setInterval(function () {
    shown = Math.min(text.length, shown + charsPerTick);
    contentEl.textContent = text.slice(0, shown);
    if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
    if (shown >= text.length) clearInterval(timer);
  }, TICK_MS);
}

async function loadChatMessagesIfNeeded() {
  var container = document.getElementById("chat-messages");
  if (!container) return;

  // O id da conversa vem da própria URL: /dashboard/chat/<id>, igual à
  // rota original em src/routes/pages.ts.
  var chatId = window.location.pathname.split("/").pop();

  var data;
  try {
    data = await apiFetch("/api/chats/" + chatId);
  } catch (_err) {
    // Conversa inexistente ou de outro usuário: volta para o dashboard,
    // igual ao redirect original quando getOwnedChat() não encontra nada.
    window.location.href = "/dashboard";
    return;
  }

  container.innerHTML = "";
  if (data.messages.length === 0) {
    var empty = document.createElement("div");
    empty.className = "chat-empty";
    empty.textContent = "Sem mensagens ainda. Comece a jogar conversa fora!";
    container.appendChild(empty);
    return;
  }

  data.messages.forEach(function (message) {
    container.appendChild(buildMessageBubble(message.role, message.content));
  });
  container.scrollTop = container.scrollHeight;
}
