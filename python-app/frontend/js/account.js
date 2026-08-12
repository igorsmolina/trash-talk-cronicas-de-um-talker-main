// account.js
// ==========
// Tela "Minha Conta". Duas fontes de dados distintas, igual ao original:
//   - Nome, email e foto/avatar: vêm do banco de dados (via API), o
//     formulário salva com POST /api/account.
//   - "Apelido" e interesses: só existem no localStorage deste navegador
//     (nunca foram salvos no banco no projeto original - preservado
//     aqui exatamente igual).
//
// Diferença em relação ao original: como a página agora é HTML estático,
// os dados do usuário (nome/email/imagem) não chegam mais prontos via
// atributos EJS - este script busca em GET /api/dashboard ao carregar a
// página e preenche o formulário na mão.

document.addEventListener("DOMContentLoaded", async function () {
  var form = document.getElementById("account-form");
  if (!form) return;

  var data;
  try {
    data = await apiFetch("/api/dashboard");
  } catch (_err) {
    window.location.href = "/login";
    return;
  }

  var user = data.user;
  initAccountForm(form, user);
});

function initAccountForm(form, user) {
  var storageKey = "trash-talker-local-profile-" + user.id;

  function getLocalProfile() {
    try {
      var raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch (_e) {
      return {};
    }
  }

  function saveLocalProfile(profile) {
    localStorage.setItem(storageKey, JSON.stringify(profile));
    window.dispatchEvent(
      new CustomEvent("profile-updated-" + user.id, { detail: profile }),
    );
  }

  // --- Preenche os campos vindos do banco (nome, avatar) ---

  var nameInput = document.getElementById("name");
  nameInput.value = user.name;

  var avatarImageInput = document.getElementById("avatar-image-input");
  var avatarTrigger = document.getElementById("avatar-trigger");
  avatarImageInput.value = user.image || "";
  avatarTrigger.innerHTML = renderAvatarHTML(user.image, user.name, 96);

  // --- Apelido + interesses (só localStorage, igual ao original) ---

  var displayNameInput = document.getElementById("displayName");
  var tagsContainer = document.getElementById("interest-tags");
  var tagInput = document.getElementById("tag-input");
  var tagAddBtn = document.getElementById("tag-add-btn");

  var local = getLocalProfile();
  var interests = local.interests ? local.interests.slice() : [];
  displayNameInput.value = local.displayName || user.name;

  function renderTags() {
    tagsContainer.innerHTML = "";
    if (interests.length === 0) {
      var empty = document.createElement("span");
      empty.className = "tag-empty";
      empty.textContent =
        "Nenhum interesse adicionado. Selecione abaixo ou digite um novo.";
      tagsContainer.appendChild(empty);
      return;
    }
    interests.forEach(function (tag) {
      var chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.textContent = tag + " ";
      var remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.addEventListener("click", function () {
        interests = interests.filter(function (t) {
          return t !== tag;
        });
        renderTags();
        syncSuggestions();
      });
      chip.appendChild(remove);
      tagsContainer.appendChild(chip);
    });
  }

  function syncSuggestions() {
    document.querySelectorAll(".tag-suggestion").forEach(function (btn) {
      btn.classList.toggle("active", interests.indexOf(btn.dataset.tag) !== -1);
    });
  }

  document.querySelectorAll(".tag-suggestion").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tag = btn.dataset.tag;
      if (interests.indexOf(tag) === -1) {
        interests.push(tag);
      } else {
        interests = interests.filter(function (t) {
          return t !== tag;
        });
      }
      renderTags();
      syncSuggestions();
    });
  });

  function addCustomTag() {
    var value = tagInput.value.trim();
    if (value && interests.indexOf(value) === -1) {
      interests.push(value);
      tagInput.value = "";
      renderTags();
      syncSuggestions();
    }
  }

  tagAddBtn.addEventListener("click", addCustomTag);
  tagInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustomTag();
    }
  });

  renderTags();
  syncSuggestions();

  // --- Seletor de avatar (upload de arquivo ou avatar ilustrado) ---

  var avatarFileInput = document.getElementById("avatar-file-input");

  avatarTrigger.addEventListener("click", function () {
    avatarFileInput.click();
  });

  avatarFileInput.addEventListener("change", function () {
    var file = avatarFileInput.files && avatarFileInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onloadend = function () {
      avatarImageInput.value = reader.result;
      avatarTrigger.innerHTML = renderAvatarHTML(reader.result, user.name, 96);
    };
    reader.readAsDataURL(file);
  });

  document.querySelectorAll(".illustrated-avatar-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.dataset.avatarId;
      avatarImageInput.value = "avatar:" + id;
      avatarTrigger.innerHTML = renderAvatarHTML(avatarImageInput.value, user.name, 96);
      document.querySelectorAll(".illustrated-avatar-btn").forEach(function (b) {
        b.classList.toggle("selected", b === btn);
      });
    });
  });

  var cancelBtn = document.getElementById("account-cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", function () {
      window.location.reload();
    });
  }

  // --- Envio do formulário ---

  var errorBanner = document.getElementById("account-error");
  var successBanner = document.getElementById("account-success");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errorBanner.hidden = true;
    successBanner.hidden = true;
    var submitBtn = form.querySelector("button[type=submit]");

    withLoadingState(submitBtn, "Salvando...", function () {
      return apiFetch("/api/account", {
        method: "POST",
        body: {
          name: nameInput.value,
          image: avatarImageInput.value || "",
        },
      });
    })
      .then(function () {
        // O apelido e os interesses são só locais - salvos direto no
        // navegador, nunca enviados ao servidor (igual ao original).
        saveLocalProfile({
          displayName: displayNameInput.value || user.name,
          interests: interests,
        });
        successBanner.hidden = false;
      })
      .catch(function (err) {
        errorBanner.textContent = err.message;
        errorBanner.hidden = false;
      });
  });
}
