// settings.js
// ===========
// Tela de Configurações: liga o botão "Excluir Conta" (o resto da
// página - troca de tema - já é cuidado por js/theme.js em toda
// página).

document.addEventListener("DOMContentLoaded", function () {
  var deleteBtn = document.getElementById("delete-account-btn");
  if (!deleteBtn) return;

  deleteBtn.addEventListener("click", function () {
    var confirmed = confirm(
      "Tem certeza que deseja excluir sua conta? Essa ação não pode " +
        "ser desfeita e todas as suas conversas serão apagadas.",
    );
    if (!confirmed) return;

    var password = prompt("Digite sua senha para confirmar a exclusão:");
    if (!password) return;

    apiFetch("/api/account/delete", {
      method: "POST",
      body: { password: password },
    })
      .then(function () {
        window.location.href = "/";
      })
      .catch(function (err) {
        alert(err.message);
      });
  });
});
