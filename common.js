// Funções compartilhadas entre a página do motorista e o painel
(function () {
  const cfg = window.APP_CONFIG || {};
  const TZ = "America/Sao_Paulo";

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // Data de hoje (YYYY-MM-DD) no fuso de São Paulo
  function hojeSP(offsetDias = 0) {
    const d = new Date(Date.now() + offsetDias * 86400000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  }

  function somarDias(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return dt.toISOString().slice(0, 10);
  }

  function fmtData(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }

  function fmtDataLonga(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    return new Intl.DateTimeFormat("pt-BR", {
      weekday: "long", day: "2-digit", month: "long", timeZone: "UTC",
    }).format(dt);
  }

  const fmtHora = (t) => (t ? t.slice(0, 5) : "");

  const soDigitos = (s) => (s || "").replace(/\D/g, "");

  function mascaraCPF(v) {
    const d = soDigitos(v).slice(0, 11);
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }

  function cpfValido(v) {
    const c = soDigitos(v);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    for (let t = 9; t < 11; t++) {
      let s = 0;
      for (let i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i);
      const dv = ((s * 10) % 11) % 10;
      if (dv !== Number(c[t])) return false;
    }
    return true;
  }

  function mascaraTelefone(v) {
    const d = soDigitos(v).slice(0, 11);
    if (d.length <= 10)
      return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
    return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
  }

  const normPlaca = (v) => (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  const placaValida = (v) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normPlaca(v));

  // Escapa texto antes de jogar no HTML (dados vêm do motorista)
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  // Situação de um documento pela validade
  function situacaoDoc(iso) {
    if (!iso) return { cls: "doc-vazio", txt: "não informado" };
    const hoje = hojeSP();
    if (iso < hoje) return { cls: "doc-vencido", txt: `vencido ${fmtData(iso)}` };
    if (iso <= somarDias(hoje, cfg.ALERTA_DIAS || 60))
      return { cls: "doc-alerta", txt: `vence ${fmtData(iso)}` };
    return { cls: "doc-ok", txt: fmtData(iso) };
  }

  // Mensagem de erro amigável a partir do erro do Supabase
  function msgErro(err) {
    if (!err) return "Erro desconhecido.";
    if (err.message && /Failed to fetch|NetworkError/i.test(err.message))
      return "Sem conexão. Verifique a internet e tente de novo.";
    return err.message || String(err);
  }

  function toast(texto, tipo = "info") {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = texto;
    el.className = `toast toast-${tipo} show`;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 3500);
  }

  // Preenche nomes configuráveis
  document.querySelectorAll("[data-nome-local]").forEach((el) => {
    el.textContent = cfg.NOME_LOCAL || "";
  });
  document.querySelectorAll("[data-nome-app]").forEach((el) => {
    el.textContent = cfg.NOME_APP || "Agenda BPA";
  });
  document.querySelectorAll("[data-nome-curso]").forEach((el) => {
    el.textContent = cfg.NOME_CURSO || "Curso Operação Sem Derrame";
  });

  // Logo oficial (se configurado); se a imagem não carregar, volta para o ícone
  if (cfg.LOGO_ARQUIVO) {
    document.querySelectorAll(".marca img").forEach((img) => {
      const original = img.getAttribute("src");
      img.onerror = () => { img.onerror = null; img.src = original; img.classList.remove("logo-oficial"); };
      img.src = cfg.LOGO_ARQUIVO;
      img.alt = cfg.NOME_LOCAL || "Logo";
      img.classList.add("logo-oficial");
    });
  }

  // Texto das orientações (troca {CHEGAR} pelos minutos configurados)
  const textoOri = (t) => String(t).replace("{CHEGAR}", cfg.CHEGAR_ANTES_MIN || 15);

  // Rodapé com contato e endereço
  const rodape = document.getElementById("rodape");
  if (rodape) {
    const tel = (n) => `<a href="tel:+55${soDigitos(n)}">${esc(n)}</a>`;
    const zap = (n) => `<a href="https://wa.me/55${soDigitos(n)}" target="_blank" rel="noopener">${esc(n)}</a>`;
    const linhas = [
      `<b>${esc(cfg.NOME_APP || "Agenda BPA")}</b> · ${esc(cfg.NOME_LOCAL || "")}`,
      cfg.ENDERECO ? `${esc(cfg.ENDERECO)}${cfg.MAPS_URL ? ` · <a href="${esc(cfg.MAPS_URL)}" target="_blank" rel="noopener">ver no mapa</a>` : ""}` : "",
      cfg.TELEFONE_PORTARIA ? `Portaria: ${tel(cfg.TELEFONE_PORTARIA)}` : "",
      cfg.WHATSAPP_PORTARIA ? `Gate da portaria (WhatsApp): ${zap(cfg.WHATSAPP_PORTARIA)}` : "",
      cfg.HORARIO_ATENDIMENTO ? `Atendimento: ${esc(cfg.HORARIO_ATENDIMENTO)}` : "",
      `<a href="privacidade.html">Política de privacidade</a>`,
    ].filter(Boolean);
    rodape.innerHTML = linhas.map((l) => `<div>${l}</div>`).join("");
  }

  // Arquivo de calendário (.ics) para "Adicionar à minha agenda"
  function baixarICS({ titulo, data, inicio, fim, local, descricao }) {
    const dt = (d, h) => d.replace(/-/g, "") + "T" + h.slice(0, 5).replace(":", "") + "00";
    const limpa = (t) => String(t || "").replace(/[,;\\]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Agenda BPA//PT-BR", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${Date.now()}@agenda-bpa`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART;TZID=America/Sao_Paulo:${dt(data, inicio)}`,
      `DTEND;TZID=America/Sao_Paulo:${dt(data, fim)}`,
      `SUMMARY:${limpa(titulo)}`,
      `LOCATION:${limpa(local)}`,
      `DESCRIPTION:${limpa(descricao)}`,
      "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", `DESCRIPTION:${limpa(titulo)}`, "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "agendamento.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Permite instalar como app (ícone na tela inicial)
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  if (cfg.SUPABASE_URL.includes("SEU-PROJETO")) {
    console.warn("Configure SUPABASE_URL e SUPABASE_ANON_KEY em config.js");
  }

  window.App = {
    cfg, sb, hojeSP, somarDias, fmtData, fmtDataLonga, fmtHora, soDigitos,
    mascaraCPF, cpfValido, mascaraTelefone, normPlaca, placaValida, esc,
    situacaoDoc, msgErro, toast, textoOri, baixarICS,
  };
})();
