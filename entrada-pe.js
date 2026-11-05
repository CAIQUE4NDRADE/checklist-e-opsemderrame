// Página pública: a transportadora agenda a ENTRADA A PÉ do monitor e dos motoristas
// (segunda a sexta, entrada livre entre 08:00 e 17:00 do dia agendado)
(function () {
  const { cfg, sb, hojeSP, somarDias, fmtDataLonga, soDigitos, mascaraCPF, cpfValido,
          mascaraTelefone, esc, msgErro, toast, textoOri } = window.App;
  const $ = (id) => document.getElementById(id);
  const { mostrarPasso } = window.AgendaMotorista;

  const CHAVE = "agenda_entrada_pe";
  const MAX_PESSOAS = 30;
  const HORA_FIM = "17:00";
  const FUNCAO = { monitor: "Monitor", motorista: "Motorista" };
  const ORIENTACOES = cfg.ORIENTACOES_ENTRADA_PE || [
    "A entrada a pé é de segunda a sexta, das 08:00 às 17:00.",
    "Cada pessoa da lista apresenta documento com foto (RG ou CNH) e o código de confirmação na portaria.",
    "Use EPI completo: botina, calça, capacete e óculos.",
    "Só entram as pessoas que estão no agendamento. Para incluir alguém, faça um novo agendamento.",
    "Se a equipe não puder vir, cancele pelo site em Meu agendamento.",
  ];
  $("ori-pe").innerHTML = ORIENTACOES.map((t) => `<li>${esc(textoOri(t))}</li>`).join("");

  let diaSel = null;
  let ultimo = null;

  // ---------- Dias (segunda a sexta) ----------
  const agoraHHMM = () => new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  function diasDisponiveis() {
    const hoje = hojeSP(), out = [];
    for (let i = 0; out.length < 12 && i < 30; i++) {
      const iso = somarDias(hoje, i);
      const [y, m, d] = iso.split("-").map(Number);
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      if (i === 0 && agoraHHMM() >= HORA_FIM) continue;
      out.push(iso);
    }
    return out;
  }
  function renderDias() {
    const wrap = $("pe-dias");
    wrap.innerHTML = "";
    const dias = diasDisponiveis();
    if (!dias.includes(diaSel)) diaSel = dias[0];
    dias.forEach((iso, i) => {
      const [y, m, d] = iso.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d, 12));
      const sem = iso === hojeSP() ? "hoje" : new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" }).format(dt).replace(".", "");
      const mes = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(dt).replace(".", "");
      const b = document.createElement("button");
      b.type = "button"; b.className = "dia";
      b.setAttribute("aria-pressed", iso === diaSel);
      b.setAttribute("aria-label", fmtDataLonga(iso));
      b.innerHTML = `<span>${esc(sem)}</span><b>${String(d).padStart(2, "0")}</b><span>${esc(mes)}</span>`;
      b.addEventListener("click", () => {
        diaSel = iso;
        wrap.querySelectorAll(".dia").forEach((x) => x.setAttribute("aria-pressed", x === b));
      });
      wrap.appendChild(b);
    });
  }

  // ---------- Lista de pessoas ----------
  let seq = 0;
  function linhaPessoa(funcao = "motorista", nome = "", cpf = "") {
    const n = ++seq;
    const div = document.createElement("div");
    div.className = "pe-pessoa";
    div.innerHTML = `
      <div class="pe-pessoa-topo">
        <select aria-label="Função" data-campo="funcao">
          <option value="motorista">Motorista</option><option value="monitor">Monitor</option>
        </select>
        <button type="button" class="btn-peq pe-remover" aria-label="Remover pessoa">Remover</button>
      </div>
      <div>
        <label for="pe-nome-${n}">Nome completo</label>
        <input id="pe-nome-${n}" data-campo="nome" autocomplete="off">
      </div>
      <div>
        <label for="pe-cpf-${n}">CPF</label>
        <input id="pe-cpf-${n}" data-campo="cpf" inputmode="numeric" placeholder="000.000.000-00" autocomplete="off">
      </div>`;
    div.querySelector('[data-campo="funcao"]').value = funcao;
    div.querySelector('[data-campo="nome"]').value = nome;
    div.querySelector('[data-campo="cpf"]').value = mascaraCPF(cpf);
    div.querySelector('[data-campo="cpf"]').addEventListener("input", (e) => {
      e.target.value = mascaraCPF(e.target.value);
      e.target.classList.remove("invalido");
    });
    div.querySelector(".pe-remover").addEventListener("click", () => {
      div.remove();
      if (!$("pe-pessoas").children.length) adicionar("motorista");
      contar();
    });
    return div;
  }
  function adicionar(funcao, nome, cpf) {
    if ($("pe-pessoas").children.length >= MAX_PESSOAS) { toast(`Máximo de ${MAX_PESSOAS} pessoas por agendamento.`, "erro"); return; }
    const linha = linhaPessoa(funcao, nome, cpf);
    $("pe-pessoas").appendChild(linha);
    contar();
    return linha;
  }
  function contar() {
    const n = $("pe-pessoas").children.length;
    $("pe-contagem").textContent = `(${n} ${n === 1 ? "pessoa" : "pessoas"})`;
    $("pe-enviar").textContent = `Confirmar agendamento (${n} ${n === 1 ? "pessoa" : "pessoas"})`;
  }
  $("pe-add-motorista").addEventListener("click", () => adicionar("motorista")?.querySelector('[data-campo="nome"]').focus());
  $("pe-add-monitor").addEventListener("click", () => adicionar("monitor")?.querySelector('[data-campo="nome"]').focus());
  $("pe-telefone").addEventListener("input", (e) => (e.target.value = mascaraTelefone(e.target.value)));

  function lerPessoas() {
    return [...$("pe-pessoas").children].map((div) => ({
      el: div,
      funcao: div.querySelector('[data-campo="funcao"]').value,
      nome: div.querySelector('[data-campo="nome"]').value.trim(),
      cpf: soDigitos(div.querySelector('[data-campo="cpf"]').value),
    }));
  }

  // ---------- Lembrar neste aparelho ----------
  function carregarLembrados() {
    $("pe-pessoas").innerHTML = "";
    let salvo = null;
    try { salvo = JSON.parse(localStorage.getItem(CHAVE) || "null"); } catch (_) {}
    if (salvo) {
      $("pe-transportadora").value = salvo.transportadora || "";
      $("pe-responsavel").value = salvo.responsavel || "";
      $("pe-telefone").value = mascaraTelefone(salvo.telefone || "");
      (salvo.pessoas || []).slice(0, MAX_PESSOAS).forEach((p) => adicionar(p.funcao, p.nome, p.cpf));
    }
    if (!$("pe-pessoas").children.length) { adicionar("monitor"); adicionar("motorista"); }
  }
  function salvarLembrados(dados) {
    try {
      if ($("pe-lembrar").checked) localStorage.setItem(CHAVE, JSON.stringify(dados));
      else localStorage.removeItem(CHAVE);
    } catch (_) {}
  }

  // ---------- Abrir ----------
  function abrir() {
    $("pe-erro").textContent = "";
    if (!$("pe-pessoas").children.length) carregarLembrados();
    renderDias();
    mostrarPasso("passo-pe");
  }
  $("pe-trocar").addEventListener("click", () => mostrarPasso("passo-tipo"));

  // ---------- Enviar ----------
  $("passo-pe").addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = $("pe-erro");
    erro.textContent = "";
    document.querySelectorAll("#passo-pe .invalido").forEach((x) => x.classList.remove("invalido"));
    const falha = (msg, el) => { erro.textContent = msg; if (el) { el.classList.add("invalido"); el.focus(); } };

    const transportadora = $("pe-transportadora").value.trim();
    const responsavel = $("pe-responsavel").value.trim();
    const telefone = soDigitos($("pe-telefone").value);
    if (!diaSel) return falha("Escolha o dia.");
    if (!transportadora) return falha("Informe a transportadora.", $("pe-transportadora"));
    if (!responsavel) return falha("Informe o nome do responsável.", $("pe-responsavel"));
    if (telefone.length < 10 || telefone.length > 11) return falha("Telefone inválido. Informe com DDD.", $("pe-telefone"));

    const pessoas = lerPessoas();
    const vistos = new Set();
    for (const p of pessoas) {
      if (!p.nome) return falha("Preencha o nome de todas as pessoas.", p.el.querySelector('[data-campo="nome"]'));
      if (!cpfValido(p.cpf)) return falha(`CPF inválido para ${p.nome}.`, p.el.querySelector('[data-campo="cpf"]'));
      if (vistos.has(p.cpf)) return falha(`O CPF de ${p.nome} aparece duas vezes na lista.`, p.el.querySelector('[data-campo="cpf"]'));
      vistos.add(p.cpf);
    }
    if (!$("pe-consentimento").checked) return falha("Para agendar, marque a autorização de uso dos dados.");

    const btn = $("pe-enviar");
    btn.disabled = true;
    const lista = pessoas.map(({ funcao, nome, cpf }) => ({ funcao, nome, cpf }));
    const { data: codigo, error } = await sb.rpc("agendar_entrada_pe", {
      p: { data: diaSel, transportadora, responsavel, telefone, consentimento: true, pessoas: lista },
    });
    btn.disabled = false;
    if (error) return falha(msgErro(error));

    salvarLembrados({ transportadora, responsavel, telefone, pessoas: lista });
    ultimo = { codigo, data: diaSel, transportadora, pessoas: lista };
    mostrarConfirmacao();
  });

  function mostrarConfirmacao() {
    const u = ultimo;
    $("peok-resumo").textContent = `${u.transportadora.toUpperCase()} · ${fmtDataLonga(u.data)} · entrada das 08:00 às 17:00`;
    $("peok-codigo").textContent = u.codigo;
    const qr = $("peok-qr");
    qr.innerHTML = "";
    if (window.QRCode) new QRCode(qr, { text: u.codigo, width: 160, height: 160, correctLevel: QRCode.CorrectLevel.M });
    $("peok-pessoas").innerHTML = u.pessoas
      .map((p) => `<li><span class="chip">${FUNCAO[p.funcao]}</span> ${esc(p.nome.toUpperCase())}</li>`).join("");
    const local = [cfg.NOME_LOCAL, cfg.ENDERECO].filter(Boolean).join(" — ");
    const msg = `Entrada a pé agendada${local ? " no " + local : ""}.\n` +
      `Dia: ${fmtDataLonga(u.data)}, entre 08:00 e 17:00.\nCódigo: ${u.codigo}\n` +
      `Leve documento com foto e apresente o código na portaria.\n` +
      `Pessoas: ${u.pessoas.map((p) => p.nome.toUpperCase()).join(", ")}`;
    $("peok-whats").href = "https://wa.me/?text=" + encodeURIComponent(msg);
    $("peok-maps").href = cfg.MAPS_URL || "#";
    $("peok-maps").classList.toggle("oculto", !cfg.MAPS_URL);
    $("peok-orientacao").innerHTML = `<h3>Antes de vir</h3><ol class="orientacoes">${
      ORIENTACOES.map((t) => `<li>${esc(textoOri(t))}</li>`).join("")}</ol>`;
    mostrarPasso("passo-pe-ok");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  $("peok-novo").addEventListener("click", () => mostrarPasso("passo-tipo"));

  // ---------- Consultar / cancelar (aba Meu agendamento) ----------
  async function consultar(cpf, codigo) {
    const { data, error } = await sb.rpc("consultar_entrada_pe", { p_cpf: cpf, p_codigo: codigo });
    if (error || !data || !data.length) return false;
    const e = data[0];
    const res = $("consulta-res");
    const ninguemEntrou = (e.pessoas || []).every((p) => !p.chegou);
    const podeCancelar = e.status === "agendado" && e.data >= hojeSP() && ninguemEntrou;
    res.innerHTML = `
      <span class="chip chip-pe">Entrada a pé</span>
      <h2 style="margin-top:10px">${esc(e.transportadora)}</h2>
      <p><b>${esc(fmtDataLonga(e.data))}</b><br>Entrada das 08:00 às 17:00 · responsável ${esc(e.responsavel)}</p>
      <p>Situação: <span class="status ${e.status === "agendado" ? "st-fila" : "st-cancelado"}">${e.status === "agendado" ? "Agendado" : "Cancelado"}</span></p>
      <ul class="pe-lista-ok">${(e.pessoas || []).map((p) =>
        `<li><span class="chip">${FUNCAO[p.funcao] || esc(p.funcao)}</span> ${esc(p.nome)}${p.chegou ? ' <span class="chegou">Entrou</span>' : ""}</li>`).join("")}</ul>
      ${podeCancelar ? `<button class="btn-perigo btn-bloco" id="pe-cancelar">Cancelar entrada a pé</button>` : ""}`;
    res.classList.remove("oculto");
    $("pe-cancelar")?.addEventListener("click", async () => {
      if (!confirm("Cancelar a entrada a pé de todas as pessoas desta lista?")) return;
      const { error: e2 } = await sb.rpc("cancelar_entrada_pe", { p_cpf: cpf, p_codigo: codigo });
      if (e2) { toast(msgErro(e2), "erro"); return; }
      toast("Cancelado.", "ok");
      consultar(cpf, codigo);
    });
    return true;
  }

  window.EntradaPe = { abrir, consultar };

  // Link direto: index.html#entrada abre já na entrada a pé
  if ((location.hash || "").replace("#", "") === "entrada") abrir();
})();
