// Escolha de tema (escuro / claro). Fica salva neste aparelho e vale para os sites da BPA.
(function () {
  var CHAVE = "tema_bpa";
  function atual() { return document.documentElement.getAttribute("data-tema") === "claro" ? "claro" : "escuro"; }
  function aplicar(t) {
    document.documentElement.setAttribute("data-tema", t);
    try { localStorage.setItem(CHAVE, t); } catch (e) {}
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "claro" ? "#0f5f33" : "#082a18");
    document.querySelectorAll(".btn-tema").forEach(function (b) {
      var claro = t === "claro";
      b.setAttribute("aria-pressed", String(claro));
      b.setAttribute("aria-label", claro ? "Usar tema escuro" : "Usar tema claro");
      b.title = claro ? "Usar tema escuro" : "Usar tema claro";
      b.innerHTML = claro ? '<span aria-hidden="true">🌙</span> Escuro' : '<span aria-hidden="true">☀️</span> Claro';
    });
  }
  function criarBotao(onde, classeExtra) {
    if (!onde) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn-tema" + (classeExtra ? " " + classeExtra : "");
    b.addEventListener("click", function () { aplicar(atual() === "claro" ? "escuro" : "claro"); });
    onde.appendChild(b);
  }
  window.TemaBPA = { aplicar: aplicar, criarBotao: criarBotao, atual: atual };
  document.addEventListener("DOMContentLoaded", function () {
    // Página do motorista / privacidade: no topo. Painel: ao lado do botão Sair.
    var sair = document.getElementById("btn-sair");
    if (sair && sair.parentElement) {
      var b = document.createElement("span");
      sair.parentElement.insertBefore(b, sair);
      criarBotao(b, "btn-tema-painel");
    } else {
      criarBotao(document.querySelector("header.topo"), "btn-tema-topo");
    }
    aplicar(atual());
  });
})();
