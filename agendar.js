// Página do motorista: escolher o que agendar, dia/horário, preencher dados, confirmar
(function () {
  const { cfg, sb, hojeSP, somarDias, fmtDataLonga, fmtHora, soDigitos,
          mascaraCPF, cpfValido, mascaraTelefone, normPlaca, placaValida, esc,
          msgErro, toast, textoOri, baixarICS } = window.App;

  const $ = (id) => document.getElementById(id);
  const CHAVE_LEMBRAR = "agenda_checklist_motorista";
  const CAMPOS_PESSOA = ["nome", "cpf", "telefone", "email", "transportadora", "companhia"];
  const CAMPOS_CAMINHAO = ["placa_cavalo", "placa_reboque1", "placa_reboque2", "placa_reboque3",
    "cnh_validade", "mopp_validade", "nr20_validade", "nr35_validade"];
  const CAMPOS_LEMBRAR = [...CAMPOS_PESSOA, ...CAMPOS_CAMINHAO];
  const NOME_TIPO = { checklist: "Checklist do caminhão", curso_osd: cfg.NOME_CURSO || "Curso Operação Sem Derrame" };

  let tipo = null;
  let diaSel = hojeSP();
  let slotSel = null;
  let datasCurso = [];

  // Orientações
  const preencherLista = (id, itens) =>
    ($(id).innerHTML = (itens || []).map((t) => `<li>${esc(textoOri(t))}</li>`).join(""));
  preencherLista("ori-checklist", cfg.ORIENTACOES_CHECKLIST);
  preencherLista("ori-curso", cfg.ORIENTACOES_CURSO);

  const mostrarPasso = (id) =>
    ["passo-tipo", "passo-horario", "passo-dados", "passo-ok"].forEach((p) => $(p).classList.toggle("oculto", p !== id));

  // ---------- Abas ----------
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.setAttribute("aria-selected", x === t));
      ["agendar", "consultar", "orientacoes"].forEach((a) =>
        $("aba-" + a).classList.toggle("oculto", t.dataset.aba !== a));
    })
  );

  // ---------- Tipo ----------
  document.querySelectorAll(".tipo-opcao").forEach((b) =>
    b.addEventListener("click", () => escolherTipo(b.dataset.tipo)));

  function escolherTipo(t) {
    tipo = t;
    const curso = t === "curso_osd";
    $("chip-tipo").textContent = NOME_TIPO[t];
    $("chip-tipo").className = "chip" + (curso ? " curso" : "");
    $("titulo-dia").textContent = curso ? "1. Escolha a turma (terça-feira)" : "1. Escolha o dia";
    $("bloco-caminhao").classList.toggle("oculto", curso);
    diaSel = hojeSP();
    mostrarPasso("passo-horario");
    renderDias();
  }

  $("btn-trocar-tipo").addEventListener("click", () => mostrarPasso("passo-tipo"));

  // ---------- Dias ----------
  function botaoDia(iso, rotuloTopo, extra) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    const mes = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(dt).replace(".", "");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dia";
    b.setAttribute("aria-pressed", iso === diaSel);
    b.innerHTML = `<span>${esc(rotuloTopo)}</span><b>${String(d).padStart(2, "0")}</b><span>${esc(extra || mes)}</span>`;
    b.addEventListener("click", () => {
      diaSel = iso;
      document.querySelectorAll("#lista-dias .dia").forEach((x) => x.setAttribute("aria-pressed", x === b));
      carregarSlots();
    });
    return b;
  }

  async function renderDias() {
    const wrap = $("lista-dias");
    wrap.innerHTML = "";
    const hoje = hojeSP();

    if (tipo === "curso_osd") {
      $("slots-msg").textContent = "Carregando turmas...";
      $("lista-slots").innerHTML = "";
      const ate = somarDias(hoje, 7 * (cfg.CURSO_SEMANAS || 12));
      const { data, error } = await sb.rpc("datas_disponiveis", { p_tipo: tipo, p_de: hoje, p_ate: ate });
      if (error) { $("slots-msg").textContent = "Não foi possível carregar as turmas: " + msgErro(error); return; }
      datasCurso = data || [];
      if (!datasCurso.length) { $("slots-msg").textContent = "Nenhuma turma aberta no momento."; return; }
      if (!datasCurso.some((d) => d.data === diaSel)) diaSel = datasCurso[0].data;
      datasCurso.forEach((d) => {
        const [y, m] = d.data.split("-").map(Number);
        const mes = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
          .format(new Date(Date.UTC(y, m - 1, 15))).replace(".", "");
        wrap.appendChild(botaoDia(d.data, "ter", d.vagas_livres > 0 ? mes : "lotado"));
      });
      carregarSlots();
      return;
    }

    for (let i = 0; i < (cfg.DIAS_ANTECEDENCIA || 15); i++) {
      const iso = somarDias(hoje, i);
      const [y, m, d] = iso.split("-").map(Number);
      const sem = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" })
        .format(new Date(Date.UTC(y, m - 1, d, 12))).replace(".", "");
      wrap.appendChild(botaoDia(iso, i === 0 ? "hoje" : sem));
    }
    carregarSlots();
  }

  // ---------- Horários ----------
  async function carregarSlots() {
    const wrap = $("lista-slots");
    const msg = $("slots-msg");
    wrap.innerHTML = "";
    msg.textContent = "Carregando horários...";

    const { data, error } = await sb.rpc("horarios_disponiveis", { p_data: diaSel, p_tipo: tipo });
    if (error) {
      msg.textContent = "Não foi possível carregar os horários: " + msgErro(error);
      return;
    }
    if (!data.length) {
      msg.textContent = tipo === "curso_osd" ? "Sem turma neste dia." : "Nenhum horário disponível neste dia.";
      return;
    }
    msg.textContent = "";

    data.forEach((h) => {
      const livres = h.vagas - h.ocupadas;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "slot";
      b.disabled = livres <= 0;
      b.innerHTML = `<b>${fmtHora(h.hora_inicio)} – ${fmtHora(h.hora_fim)}</b>
        <small>${livres <= 0 ? "Lotado" : livres === 1 ? "1 vaga" : livres + " vagas"}</small>`;
      b.addEventListener("click", () => selecionarSlot(h));
      wrap.appendChild(b);
    });
  }

  function textoResumo(t, data, h) {
    return `${NOME_TIPO[t]} · ${fmtDataLonga(data)} · ${fmtHora(h.hora_inicio)} às ${fmtHora(h.hora_fim)}`;
  }

  function selecionarSlot(h) {
    slotSel = h;
    $("resumo-horario").textContent = textoResumo(tipo, diaSel, h);
    $("form-erro").textContent = "";
    mostrarPasso("passo-dados");
    window.scrollTo({ top: 0, behavior: "smooth" });
    $("f-nome").focus({ preventScroll: true });
  }

  $("btn-trocar-horario").addEventListener("click", () => {
    mostrarPasso("passo-horario");
    carregarSlots();
  });

  // ---------- Máscaras ----------
  $("f-cpf").addEventListener("input", (e) => (e.target.value = mascaraCPF(e.target.value)));
  $("c-cpf").addEventListener("input", (e) => (e.target.value = mascaraCPF(e.target.value)));
  $("f-telefone").addEventListener("input", (e) => (e.target.value = mascaraTelefone(e.target.value)));
  $("c-codigo").addEventListener("input", (e) =>
    (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")));
  document.querySelectorAll("input.placa").forEach((el) =>
    el.addEventListener("input", (e) => (e.target.value = normPlaca(e.target.value))));

  const dl = $("lista-companhias");
  (cfg.COMPANHIAS || []).forEach((c) => {
    const o = document.createElement("option");
    o.value = c;
    dl.appendChild(o);
  });

  // ---------- Lembrar dados neste celular ----------
  function carregarLembrados() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_LEMBRAR) || "null");
      if (!salvo) return;
      CAMPOS_LEMBRAR.forEach((k) => {
        const el = $("f-" + k);
        if (el && salvo[k]) el.value = salvo[k];
      });
    } catch (_) { /* armazenamento indisponível */ }
  }

  function salvarLembrados() {
    try {
      if (!$("f-lembrar").checked) { localStorage.removeItem(CHAVE_LEMBRAR); return; }
      const dados = {};
      CAMPOS_LEMBRAR.forEach((k) => (dados[k] = $("f-" + k).value.trim()));
      localStorage.setItem(CHAVE_LEMBRAR, JSON.stringify(dados));
    } catch (_) { /* ignora */ }
  }

  // ---------- Enviar ----------
  $("passo-dados").addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = $("form-erro");
    erro.textContent = "";
    document.querySelectorAll("#passo-dados .invalido").forEach((el) => el.classList.remove("invalido"));

    const ehChecklist = tipo === "checklist";
    const campos = ehChecklist ? CAMPOS_LEMBRAR : CAMPOS_PESSOA;
    const dados = {};
    campos.forEach((k) => (dados[k] = $("f-" + k).value.trim()));

    const problemas = [];
    const marcar = (k, txt) => { $("f-" + k).classList.add("invalido"); problemas.push(txt); };

    if (!dados.nome) marcar("nome", "nome");
    if (!cpfValido(dados.cpf)) marcar("cpf", "CPF válido");
    if (!dados.transportadora) marcar("transportadora", "transportadora");
    if (!dados.companhia) marcar("companhia", "companhia");
    if (ehChecklist) {
      if (!placaValida(dados.placa_cavalo)) marcar("placa_cavalo", "placa do cavalo");
      ["placa_reboque1", "placa_reboque2", "placa_reboque3"].forEach((k) => {
        if (dados[k] && !placaValida(dados[k])) marcar(k, "placa do " + k.replace("placa_reboque", "reboque "));
      });
    }

    if (!problemas.length && !$("f-consentimento").checked) {
      erro.textContent = "Para agendar, marque a autorização de uso dos dados.";
      $("f-consentimento").focus();
      return;
    }

    if (problemas.length) {
      erro.textContent = "Confira: " + problemas.join(", ") + ".";
      document.querySelector("#passo-dados .invalido")?.focus();
      return;
    }

    const btn = $("btn-agendar");
    btn.disabled = true;
    btn.textContent = "Enviando...";

    const payload = { ...dados, cpf: soDigitos(dados.cpf), telefone: soDigitos(dados.telefone),
                      horario_id: slotSel.id, consentimento: true };
    const { data: codigo, error } = await sb.rpc("agendar", { p: payload });

    btn.disabled = false;
    btn.textContent = "Confirmar agendamento";

    if (error) {
      erro.textContent = msgErro(error);
      return;
    }

    salvarLembrados();
    mostrarConfirmacao(codigo);
  });

  function mostrarConfirmacao(codigo) {
    mostrarPasso("passo-ok");
    $("ok-resumo").textContent = textoResumo(tipo, diaSel, slotSel);
    $("ok-codigo").textContent = codigo;
    const qr = $("ok-qr");
    qr.innerHTML = "";
    // QR com o código: a portaria lê e busca no painel
    new QRCode(qr, { text: codigo, width: 160, height: 160, correctLevel: QRCode.CorrectLevel.M });

    const curso = tipo === "curso_osd";
    $("ok-orientacao").innerHTML = `<b>Antes de vir:</b> ${esc(textoOri(
      (curso ? cfg.ORIENTACOES_CURSO : cfg.ORIENTACOES_CHECKLIST)?.[0] || ""))}
      <a href="#" id="ver-orientacoes">Ver todas as orientações</a>`;
    $("ver-orientacoes").addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelector('.tab[data-aba="orientacoes"]').click();
      window.scrollTo({ top: 0 });
    });

    const mapa = $("btn-maps");
    mapa.classList.toggle("oculto", !cfg.MAPS_URL);
    mapa.href = cfg.MAPS_URL || "#";

    const ag = { data: diaSel, inicio: slotSel.hora_inicio, fim: slotSel.hora_fim };
    $("btn-ics").onclick = () => baixarICS({
      titulo: `${NOME_TIPO[tipo]} — ${cfg.NOME_LOCAL || ""}`,
      ...ag,
      local: cfg.ENDERECO || cfg.NOME_LOCAL || "",
      descricao: `Código de confirmação: ${codigo}. Chegue com ${cfg.CHEGAR_ANTES_MIN || 15} minutos de antecedência.`,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  $("btn-novo").addEventListener("click", () => {
    slotSel = null;
    mostrarPasso("passo-tipo");
  });

  // ---------- Consultar / cancelar ----------
  let ultimaConsulta = null;

  $("form-consulta").addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = $("consulta-erro");
    const res = $("consulta-res");
    erro.textContent = "";
    res.classList.add("oculto");

    const cpf = soDigitos($("c-cpf").value);
    const codigo = $("c-codigo").value.trim().toUpperCase();
    if (cpf.length !== 11 || codigo.length !== 6) {
      erro.textContent = "Informe o CPF e o código de 6 caracteres.";
      return;
    }

    const { data, error } = await sb.rpc("consultar_agendamento", { p_cpf: cpf, p_codigo: codigo });
    if (error) { erro.textContent = msgErro(error); return; }
    if (!data || !data.length) { erro.textContent = "Agendamento não encontrado."; return; }

    ultimaConsulta = { cpf, codigo };
    const a = data[0];
    const curso = a.tipo === "curso_osd";
    const rotulo = curso
      ? { fila: "Inscrito", concluido: "Concluído", pendencia: "Faltou", cancelado: "Cancelado" }
      : { fila: "Agendado", concluido: "Concluído", pendencia: "Pendência", cancelado: "Cancelado" };
    const agora = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T");
    const passou = `${a.data}T${a.hora_inicio}` <= agora;

    res.innerHTML = `
      <span class="chip${curso ? " curso" : ""}">${esc(NOME_TIPO[a.tipo] || a.tipo)}</span>
      <h2 style="margin-top:10px">${esc(a.nome)}</h2>
      <p><b>${esc(fmtDataLonga(a.data))}</b><br>${fmtHora(a.hora_inicio)} às ${fmtHora(a.hora_fim)}
         ${a.placa_cavalo ? `· placa <b>${esc(a.placa_cavalo)}</b>` : ""}</p>
      <p>Situação: <span class="status st-${esc(a.status)}">${esc(rotulo[a.status] || a.status)}</span></p>
      ${a.status === "fila" && !passou
        ? `<button class="btn-perigo btn-bloco" id="btn-cancelar">Cancelar ${curso ? "inscrição" : "agendamento"}</button>` : ""}`;
    res.classList.remove("oculto");

    $("btn-cancelar")?.addEventListener("click", async () => {
      if (!confirm("Cancelar? A vaga será liberada para outra pessoa.")) return;
      const { error: e2 } = await sb.rpc("cancelar_agendamento", {
        p_cpf: ultimaConsulta.cpf, p_codigo: ultimaConsulta.codigo,
      });
      if (e2) { toast(msgErro(e2), "erro"); return; }
      toast("Cancelado.", "ok");
      $("form-consulta").requestSubmit();
    });
  });

  // ---------- Início ----------
  carregarLembrados();
  // Link direto: index.html#curso abre já no curso; #checklist no checklist
  const atalho = (location.hash || "").replace("#", "");
  if (atalho === "orientacoes") document.querySelector('.tab[data-aba="orientacoes"]').click();
  if (atalho === "curso") escolherTipo("curso_osd");
  else if (atalho === "checklist") escolherTipo("checklist");
})();
