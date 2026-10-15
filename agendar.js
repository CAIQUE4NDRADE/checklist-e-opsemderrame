// Página do motorista: escolher o que agendar, dia/horário, preencher dados, confirmar
(function () {
  const { cfg, sb, hojeSP, somarDias, fmtDataLonga, fmtHora, soDigitos,
          mascaraCPF, cpfValido, mascaraTelefone, normPlaca, placaValida, esc,
          msgErro, toast, textoOri, baixarICS } = window.App;

  const $ = (id) => document.getElementById(id);
  const CHAVE_LEMBRAR = "agenda_checklist_motorista";
  // Campos de cada tipo de agendamento
  const CAMPOS = {
    checklist: ["nome", "placa_cavalo", "transportadora", "telefone"],
    curso_osd: ["nome", "cpf", "transportadora"],
  };
  const CAMPOS_LEMBRAR = ["nome", "cpf", "placa_cavalo", "transportadora", "telefone"];
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

  const PASSOS = ["passo-tipo", "passo-horario", "passo-dados", "passo-ok", "passo-encaixe", "passo-encaixe-ok"];
  const ETAPA_DO_PASSO = { "passo-tipo": 0, "passo-horario": 1, "passo-dados": 2, "passo-encaixe": 2, "passo-ok": 3, "passo-encaixe-ok": 3 };
  const mostrarPasso = (id) => {
    PASSOS.forEach((p) => $(p).classList.toggle("oculto", p !== id));
    const atual = ETAPA_DO_PASSO[id] ?? 0;
    const fim = id === "passo-ok" || id === "passo-encaixe-ok";
    document.querySelectorAll("#etapas li").forEach((li, i) => {
      li.classList.toggle("feita", i < atual || fim);
      li.classList.toggle("atual", i === atual && !fim);
      li.toggleAttribute("aria-current", i === atual);
    });
    // Versão compacta para celular: "Passo 2 de 4 · Data e horário"
    const nomes = ["Serviço", "Data e horário", id === "passo-encaixe" ? "Pedido de encaixe" : "Seus dados",
                   id === "passo-encaixe-ok" ? "Pedido enviado" : "Confirmação"];
    const n = atual + 1;
    $("etapa-num").textContent = fim ? "Concluído" : `Passo ${n} de 4`;
    $("etapa-nome").textContent = nomes[n - 1];
    $("etapa-progresso").style.width = (fim ? 100 : n * 25) + "%";
    $("etapa-compacta").classList.toggle("completa", fim);
  };

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
    $("titulo-dia").textContent = curso ? "Escolha a turma (terça-feira)" : "Escolha o dia";
    document.querySelectorAll("[data-so]").forEach((el) => el.classList.toggle("oculto", el.dataset.so !== t));
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
      destacarEncaixe(true);
      return;
    }
    msg.textContent = "";

    const temVaga = data.some((h) => h.vagas - h.ocupadas > 0);
    destacarEncaixe(!temVaga);
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
  // Consulta aceita placa (letras no começo) ou CPF (só números)
  $("c-cpf").addEventListener("input", (e) => {
    const v = e.target.value;
    e.target.value = /^[0-9]/.test(v.trim()) ? mascaraCPF(v) : normPlaca(v);
  });
  $("f-telefone").addEventListener("input", (e) => (e.target.value = mascaraTelefone(e.target.value)));
  $("c-codigo").addEventListener("input", (e) =>
    (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")));
  document.querySelectorAll("input.placa").forEach((el) =>
    el.addEventListener("input", (e) => (e.target.value = normPlaca(e.target.value))));


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
    const dados = {};
    CAMPOS[tipo].forEach((k) => (dados[k] = $("f-" + k).value.trim()));

    const problemas = [];
    const marcar = (k, txt) => { $("f-" + k).classList.add("invalido"); problemas.push(txt); };

    if (!dados.nome) marcar("nome", "nome");
    if (ehChecklist) {
      if (!placaValida(dados.placa_cavalo)) marcar("placa_cavalo", "placa (ex.: ABC1D23)");
    } else if (!cpfValido(dados.cpf)) {
      marcar("cpf", "CPF válido");
    }
    if (!dados.transportadora) marcar("transportadora", "transportadora");
    if (ehChecklist && ![10, 11].includes(soDigitos(dados.telefone).length)) marcar("telefone", "telefone com DDD");

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

    const payload = { ...dados, horario_id: slotSel.id, consentimento: true };
    if (dados.cpf) payload.cpf = soDigitos(dados.cpf);
    if (dados.telefone) payload.telefone = soDigitos(dados.telefone);
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
    $("ok-ident").textContent = curso ? "o seu CPF" : "a placa do caminhão";
    // Instruções completas do serviço agendado, logo na confirmação
    const instrucoes = ((curso ? cfg.ORIENTACOES_CURSO : cfg.ORIENTACOES_CHECKLIST) || []).map(textoOri);
    $("ok-orientacao").innerHTML = instrucoes.length ? `
      <h3>Siga estas instruções no dia</h3>
      <p class="muted">Para não esquecer nada, tire um print desta tela.</p>
      <ol class="orientacoes">${instrucoes.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>` : "";

    const mapa = $("btn-maps");
    mapa.classList.toggle("oculto", !cfg.MAPS_URL);
    mapa.href = cfg.MAPS_URL || "#";

    const ag = { data: diaSel, inicio: slotSel.hora_inicio, fim: slotSel.hora_fim };
    $("btn-ics").onclick = () => baixarICS({
      titulo: `${NOME_TIPO[tipo]} — ${cfg.NOME_LOCAL || ""}`,
      ...ag,
      local: cfg.ENDERECO || cfg.NOME_LOCAL || "",
      descricao: `Código de confirmação: ${codigo}.\n\nInstruções:\n` + instrucoes.map((t, i) => `${i + 1}. ${t}`).join("\n"),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  $("btn-novo").addEventListener("click", () => {
    slotSel = null;
    mostrarPasso("passo-tipo");
  });

  // ---------- Encaixe ----------
  function destacarEncaixe(semVaga) {
    $("encaixe-cta").classList.toggle("destaque", !!semVaga);
    $("encaixe-cta-titulo").textContent = semVaga ? "Sem vaga neste dia?" : "Não encontrou horário?";
  }

  const PERIODOS = { qualquer: "qualquer horário", manha: "manhã", tarde: "tarde" };

  $("btn-encaixe").addEventListener("click", () => {
    const hoje = hojeSP();
    const campoData = $("e-data");
    campoData.min = hoje;
    campoData.max = somarDias(hoje, 30);
    campoData.value = diaSel >= hoje ? diaSel : hoje;
    // reaproveita o que o motorista já digitou ou salvou
    [["e-nome", "f-nome"], ["e-placa", "f-placa_cavalo"], ["e-transportadora", "f-transportadora"], ["e-telefone", "f-telefone"]]
      .forEach(([de, para]) => { if (!$(de).value) $(de).value = $(para).value; });
    $("encaixe-erro").textContent = "";
    mostrarPasso("passo-encaixe");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  $("btn-voltar-encaixe").addEventListener("click", () => { mostrarPasso("passo-horario"); carregarSlots(); });
  $("e-placa").addEventListener("input", (e) => (e.target.value = normPlaca(e.target.value)));
  $("e-telefone").addEventListener("input", (e) => (e.target.value = mascaraTelefone(e.target.value)));

  $("passo-encaixe").addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = $("encaixe-erro");
    erro.textContent = "";
    document.querySelectorAll("#passo-encaixe .invalido").forEach((el) => el.classList.remove("invalido"));
    const v = (id) => $(id).value.trim();
    const problemas = [];
    const marcar = (id, txt) => { $(id).classList.add("invalido"); problemas.push(txt); };
    if (!v("e-data")) marcar("e-data", "dia");
    if (!v("e-nome")) marcar("e-nome", "nome");
    if (!placaValida(v("e-placa"))) marcar("e-placa", "placa (ex.: ABC1D23)");
    if (!v("e-transportadora")) marcar("e-transportadora", "transportadora");
    if (![10, 11].includes(soDigitos(v("e-telefone")).length)) marcar("e-telefone", "telefone com DDD");
    if (problemas.length) {
      erro.textContent = "Confira: " + problemas.join(", ") + ".";
      document.querySelector("#passo-encaixe .invalido")?.focus();
      return;
    }
    if (!$("e-consentimento").checked) {
      erro.textContent = "Para enviar, marque a autorização de uso dos dados.";
      $("e-consentimento").focus();
      return;
    }
    const btn = $("btn-enviar-encaixe");
    btn.disabled = true; btn.textContent = "Enviando...";
    const pedido = {
      data: v("e-data"), periodo: $("e-periodo").value, nome: v("e-nome"), placa: v("e-placa"),
      transportadora: v("e-transportadora"), telefone: soDigitos(v("e-telefone")), motivo: v("e-motivo"),
      consentimento: true,
    };
    const { data: codigo, error } = await sb.rpc("solicitar_encaixe", { p: pedido });
    btn.disabled = false; btn.textContent = "Enviar pedido de encaixe";
    if (error) { erro.textContent = msgErro(error); return; }

    $("eok-resumo").textContent = `Checklist · ${fmtDataLonga(pedido.data)} · ${PERIODOS[pedido.periodo]}`;
    $("eok-codigo").textContent = codigo;
    $("eok-telefone").textContent = mascaraTelefone(pedido.telefone);
    $("eok-gate").textContent = cfg.WHATSAPP_PORTARIA || cfg.TELEFONE_PORTARIA || "";
    mostrarPasso("passo-encaixe-ok");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  $("btn-encaixe-novo").addEventListener("click", () => { $("passo-encaixe").reset(); mostrarPasso("passo-tipo"); });

  // ---------- Consultar / cancelar ----------
  let ultimaConsulta = null;

  $("form-consulta").addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = $("consulta-erro");
    const res = $("consulta-res");
    erro.textContent = "";
    res.classList.add("oculto");

    const bruto = $("c-cpf").value.trim();
    const cpf = /^[0-9]/.test(bruto) ? soDigitos(bruto) : normPlaca(bruto);   // CPF ou placa
    const codigo = $("c-codigo").value.trim().toUpperCase();
    if (!(cpf.length === 11 || placaValida(cpf)) || codigo.length !== 6) {
      erro.textContent = "Informe a placa (ou o CPF, no curso) e o código de 6 caracteres.";
      return;
    }

    const { data, error } = await sb.rpc("consultar_agendamento", { p_cpf: cpf, p_codigo: codigo });
    if (error) { erro.textContent = msgErro(error); return; }
    if (!data || !data.length) {
      if (placaValida(cpf)) {
        const { data: enc } = await sb.rpc("consultar_encaixe", { p_placa: cpf, p_codigo: codigo });
        if (enc && enc.length) { mostrarEncaixe(enc[0]); return; }
      }
      erro.textContent = "Agendamento não encontrado. Confira a placa (ou CPF) e o código.";
      return;
    }

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

  function mostrarEncaixe(e) {
    const res = $("consulta-res");
    const rot = { pendente: ["st-fila", "Aguardando análise"], aprovado: ["st-concluido", "Aprovado"], recusado: ["st-pendencia", "Não foi possível encaixar"] }[e.status];
    res.innerHTML = `
      <span class="chip chip-encaixe">Pedido de encaixe · Checklist</span>
      <h2 style="margin-top:10px">${esc(e.nome)}</h2>
      <p><b>${esc(fmtDataLonga(e.data))}</b> · ${esc(PERIODOS[e.periodo] || "")} · placa <b>${esc(e.placa)}</b></p>
      <p>Situação: <span class="status ${rot[0]}">${rot[1]}</span></p>
      ${e.status === "aprovado" && e.hora_inicio ? `<p class="aviso" style="background:var(--ok-soft)"><b>Horário confirmado:</b> ${fmtHora(e.hora_inicio)} às ${fmtHora(e.hora_fim)}.</p>` : ""}
      ${e.status === "pendente" ? `<p class="muted">Não venha antes da confirmação. A equipe vai entrar em contato pelo telefone.</p>` : ""}
      ${e.resposta ? `<p class="aviso"><b>Mensagem da equipe:</b> ${esc(e.resposta)}</p>` : ""}`;
    res.classList.remove("oculto");
  }

  // ---------- Início ----------
  carregarLembrados();
  // Link direto: index.html#curso abre já no curso; #checklist no checklist
  const atalho = (location.hash || "").replace("#", "");
  if (atalho === "orientacoes") document.querySelector('.tab[data-aba="orientacoes"]').click();
  if (atalho === "curso") escolherTipo("curso_osd");
  else if (atalho === "checklist") escolherTipo("checklist");
})();
