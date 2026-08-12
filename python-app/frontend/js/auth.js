// auth.js
// =======
// Comportamentos de autenticação usados em várias páginas públicas:
//   1. Validação "as senhas coincidem" nos campos de confirmação de
//      senha (signup e reset-password).
//   2. Envio do formulário de "esqueci minha senha".
//   3. Envio do formulário de "redefinir senha".
//
// No original, os itens 2 e 3 chamavam a API do Better Auth diretamente
// do navegador (fetch("/api/auth/forget-password"), etc). Agora eles
// chamam os endpoints equivalentes do nosso backend Python
// (/api/forgot-password e /api/reset-password) - ver
// backend/routes/auth_api.py.

document.addEventListener("DOMContentLoaded", function () {
  wirePasswordConfirmValidation();
  wireForgotPasswordForm();
  wireResetPasswordForm();
});

function wirePasswordConfirmValidation() {
  var pass = document.getElementById("password");
  var confirmPass = document.getElementById("confirm-password");
  if (!pass || !confirmPass) return;

  confirmPass.addEventListener("input", function () {
    confirmPass.setCustomValidity(
      pass.value !== confirmPass.value ? "As senhas não coincidem" : "",
    );
  });
}

function wireForgotPasswordForm() {
  var form = document.getElementById("forgot-password-form");
  if (!form) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = document.getElementById("email").value;
    var errorBox = document.getElementById("forgot-error");
    var successBox = document.getElementById("forgot-success");
    var button = form.querySelector("button[type=submit]");
    errorBox.hidden = true;

    withLoadingState(button, "Enviando...", function () {
      return apiFetch("/api/forgot-password", {
        method: "POST",
        body: { email: email },
      });
    })
      .then(function () {
        form.hidden = true;
        successBox.hidden = false;
      })
      .catch(function (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      });
  });
}

function wireResetPasswordForm() {
  var form = document.getElementById("reset-password-form");
  var invalidLinkBox = document.getElementById("reset-invalid-link");
  if (!form) return;

  // O token vem na URL (?token=...), igual ao original
  // (pagesRouter.get("/reset-password", ...) lia req.query.token). Sem
  // servidor renderizando a página, é o próprio JS que decide se mostra
  // o formulário ou o aviso de link inválido.
  var token = new URLSearchParams(window.location.search).get("token");
  if (!token) {
    form.hidden = true;
    if (invalidLinkBox) invalidLinkBox.hidden = false;
    return;
  }
  form.dataset.token = token;
  form.hidden = false;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var token = form.dataset.token;
    var newPassword = document.getElementById("password").value;
    var errorBox = document.getElementById("reset-error");
    var button = form.querySelector("button[type=submit]");
    errorBox.hidden = true;

    withLoadingState(button, "Salvando...", function () {
      return apiFetch("/api/reset-password", {
        method: "POST",
        body: { newPassword: newPassword, token: token },
      });
    })
      .then(function () {
        window.location.href = "/login?reset=success";
      })
      .catch(function (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      });
  });
}
