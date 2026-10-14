// Painel do operador: checklist do dia, horários e QR code
(function () {
  const { sb, hojeSP, somarDias, fmtData, fmtDataLonga, fmtHora, mascaraCPF, esc,
          situacaoDoc, msgErro, toast } = window.App;

  const $ = (id) => document.getElementById(id);
  const ROTULOS = {
    checklist: { fila: "FILA", concluido: "CONCLUÍDO", pendencia: "PENDÊNCIA", cancelado: "CANCELADO" },
    curso_osd: { fila: "INSCRITO", concluido: "CONCLUÍDO", pendencia: "FALTOU", cancelado: "CANCELADO" },
  };
  const NOME_TIPO = { checklist: "Checklist do caminhão", curso_osd: "Curso Operação Sem Derrame" };
  const tipoDia = () => $("d-tipo").value;
  const rotulo = () => ROTULOS[tipoDia()];

  // Próxima terça (ou hoje, se for terça)
  function proximaTerca(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return somarDias(iso, (2 - dow + 7) % 7);
  }

  let horariosDia = [];
  let timerAuto = null;

  // ================= Login =================
  async function iniciar() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) await entrarApp();
    else mostrarLogin();
  }

  function mostrarLogin(msg = "") {
    $("tela-login").classList.remove("oculto");
    $("tela-app").classList.add("oculto");
    $("btn-sair").classList.add("oculto");
    $("login-erro").textContent = msg;
    clearInterval(timerAuto);
  }

  async function entrarApp() {
    const { data: ehOp, error } = await sb.rpc("eh_operador");
    if (error || !ehOp) {
      await sb.auth.signOut();
      mostrarLogin("Este usuário não está cadastrado como operador.");
      return;
    }
    $("tela-login").classList.add("oculto");
    $("tela-app").classList.remove("oculto");
    $("btn-sair").classList.remove("oculto");
    carregarDia();
    // Atualiza sozinho a cada 30 s (novos agendamentos aparecem)
    clearInterval(timerAuto);
    timerAuto = setInterval(() => {
      if (!$("aba-dia").classList.contains("oculto") && !document.activeElement?.matches("textarea, input, select"))
        carregarDia(true);
    }, 30000);
  }

  $("tela-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("login-erro").textContent = "";
    const { error } = await sb.auth.signInWithPassword({
      email: $("l-email").value.trim(),
      password: $("l-senha").value,
    });
    if (error) { $("login-erro").textContent = "E-mail ou senha inválidos."; return; }
    entrarApp();
  });

  $("btn-sair").addEventListener("click", async () => {
    await sb.auth.signOut();
    mostrarLogin();
  });

  // ================= Abas =================
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.setAttribute("aria-selected", x === t));
      ["dia", "horarios", "qr"].forEach((a) =>
        $("aba-" + a).classList.toggle("oculto", t.dataset.aba !== a));
      if (t.dataset.aba === "horarios") carregarHorarios();
      if (t.dataset.aba === "qr") montarQR();
      if (t.dataset.aba === "dia") carregarDia();
    })
  );

  // ================= Checklist do dia =================
  $("d-data").value = hojeSP();
  $("d-data").addEventListener("change", () => carregarDia());
  $("d-tipo").addEventListener("change", () => {
    if (tipoDia() === "curso_osd") $("d-data").value = proximaTerca(hojeSP());
    carregarDia();
  });
  $("d-hoje").addEventListener("click", () => {
    $("d-data").value = tipoDia() === "curso_osd" ? proximaTerca(hojeSP()) : hojeSP();
    carregarDia();
  });
  $("d-atualizar").addEventListener("click", () => carregarDia());
  $("d-imprimir").addEventListener("click", () => window.print());
  $("d-busca").addEventListener("input", () => renderDia());
  $("d-mostrar-cancelados").addEventListener("change", () => renderDia());

  async function carregarDia(silencioso = false) {
    const data = $("d-data").value || hojeSP();
    $("d-titulo").textContent = `${NOME_TIPO[tipoDia()]} · ${fmtDataLonga(data)}`;
    if (!silencioso) $("d-lista").innerHTML = `<p class="muted">Carregando...</p>`;

    const { data: rows, error } = await sb
      .from("horarios")
      .select("id, data, hora_inicio, hora_fim, vagas, ativo, agendamentos(*)")
      .eq("data", data)
      .eq("tipo", tipoDia())
      .order("hora_inicio");

    if (error) {
      $("d-lista").innerHTML = `<p class="erro">${esc(msgErro(error))}</p>`;
      return;
    }
    horariosDia = rows.map((h) => ({
      ...h,
      agendamentos: (h.agendamentos || []).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    }));
    renderDia();
  }

  function combinaBusca(a, termo) {
    if (!termo) return true;
    const t = termo.toUpperCase().replace(/[^A-Z0-9 ]/g, "");
    const alvo = [a.codigo, a.nome, a.cpf, a.placa_cavalo, a.placa_reboque1, a.placa_reboque2,
      a.placa_reboque3, a.transportadora].join(" ").toUpperCase();
    return t.split(" ").filter(Boolean).every((p) => alvo.includes(p));
  }

  function renderDia() {
    const termo = $("d-busca").value.trim();
    const verCanc = $("d-mostrar-cancelados").checked;
    const todos = horariosDia.flatMap((h) => h.agendamentos);
    const ativos = todos.filter((a) => a.status !== "cancelado");
    const conta = (s) => ativos.filter((a) => a.status === s).length;

    const curso = tipoDia() === "curso_osd";
    $("d-kpis").innerHTML = (curso
      ? [["Inscritos", ativos.length], ["Aguardando", conta("fila")], ["Concluíram", conta("concluido")], ["Faltas", conta("pendencia")]]
      : [["Agendados", ativos.length], ["Na fila", conta("fila")], ["Concluídos", conta("concluido")], ["Pendências", conta("pendencia")]]
    ).map(([t, n]) => `<div class="kpi"><b>${n}</b><span>${t}</span></div>`).join("");

    if (!horariosDia.length) {
      $("d-lista").innerHTML = `<div class="card"><p class="muted" style="margin:0">${curso
        ? "Não há turma do curso neste dia. As turmas são às terças; crie na aba <b>Horários</b>."
        : "Nenhum horário cadastrado para este dia. Crie na aba <b>Horários</b>."}</p></div>`;
      return;
    }

    const html = horariosDia.map((h) => {
      const lista = h.agendamentos
        .filter((a) => verCanc || a.status !== "cancelado")
        .filter((a) => combinaBusca(a, termo));
      if (termo && !lista.length) return "";
      const ocupadas = h.agendamentos.filter((a) => a.status !== "cancelado").length;
      return `
        <div class="bloco-hora">
          <header>
            <b>${fmtHora(h.hora_inicio)} às ${fmtHora(h.hora_fim)}${h.ativo ? "" : " · <span class='muted'>inativo</span>"}</b>
            <span class="muted">${ocupadas}/${h.vagas} vaga(s)</span>
          </header>
          ${lista.length ? lista.map(cardAgendamento).join("") : `<p class="muted">Sem agendamentos.</p>`}
        </div>`;
    }).join("");

    $("d-lista").innerHTML = html || `<p class="muted">Nada encontrado para "${esc(termo)}".</p>`;
  }

  function cardAgendamento(a) {
    const placas = [a.placa_cavalo, a.placa_reboque1, a.placa_reboque2, a.placa_reboque3]
      .filter(Boolean).map(esc).join(" / ");
    const docs = [["CNH", a.cnh_validade], ["MOPP", a.mopp_validade],
                  ["NR-20", a.nr20_validade], ["NR-35", a.nr35_validade]]
      .map(([n, d]) => { const s = situacaoDoc(d); return `<span class="doc ${s.cls}">${n}: ${esc(s.txt)}</span>`; })
      .join("");
    const contato = [a.telefone, a.email].filter(Boolean).map(esc).join(" · ");
    const R = rotulo();
    const curso = tipoDia() === "curso_osd";
    const opcoes = Object.keys(R)
      .map((s) => `<option value="${s}" ${s === a.status ? "selected" : ""}>${R[s]}</option>`).join("");

    return `
      <div class="agend ${a.status === "cancelado" ? "cancelado" : ""}" data-id="${a.id}">
        <div class="agend-topo">
          <div>
            <div class="agend-nome">${esc(a.nome)}</div>
            <div class="agend-info">CPF ${esc(mascaraCPF(a.cpf))} · ${esc(a.transportadora)} · ${esc(a.companhia)}
              · código <b>${esc(a.codigo)}</b></div>
            ${contato ? `<div class="agend-info">${contato}</div>` : ""}
            ${placas ? `<div class="placas">${placas}</div>` : ""}
          </div>
          <div>
            <select class="sel-status st-${esc(a.status)}" data-acao="status" aria-label="Status">${opcoes}</select>
          </div>
        </div>
        ${curso ? "" : `<div class="docs">${docs}</div>`}
        <div class="agend-obs nao-imprimir">
          <textarea rows="1" placeholder="Observação" data-acao="obs">${esc(a.obs || "")}</textarea>
          <button class="btn-peq" data-acao="gravar-obs">Gravar</button>
        </div>
        ${a.obs ? `<div class="agend-info" style="display:none" data-print-obs>Obs.: ${esc(a.obs)}</div>` : ""}
      </div>`;
  }

  // Ações nos cards (delegação de eventos)
  $("d-lista").addEventListener("change", async (e) => {
    if (e.target.dataset.acao !== "status") return;
    const card = e.target.closest(".agend");
    const id = Number(card.dataset.id);
    const status = e.target.value;
    const sel = e.target;
    sel.disabled = true;
    const { error } = await sb.from("agendamentos").update({ status }).eq("id", id);
    sel.disabled = false;
    if (error) { toast(msgErro(error), "erro"); carregarDia(true); return; }
    sel.className = `sel-status st-${status}`;
    const ag = horariosDia.flatMap((h) => h.agendamentos).find((a) => a.id === id);
    if (ag) ag.status = status;
    toast(`Status: ${rotulo()[status]}`, "ok");
    renderDia();
  });

  $("d-lista").addEventListener("click", async (e) => {
    if (e.target.dataset.acao !== "gravar-obs") return;
    const card = e.target.closest(".agend");
    const id = Number(card.dataset.id);
    const obs = card.querySelector("textarea").value.trim() || null;
    e.target.disabled = true;
    const { error } = await sb.from("agendamentos").update({ obs }).eq("id", id);
    e.target.disabled = false;
    if (error) { toast(msgErro(error), "erro"); return; }
    const ag = horariosDia.flatMap((h) => h.agendamentos).find((a) => a.id === id);
    if (ag) ag.obs = obs;
    toast("Observação gravada.", "ok");
  });

  // ================= Horários =================
  const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  $("g-dias").innerHTML = DIAS.map((d, i) =>
    `<label><input type="checkbox" value="${i}" ${i === 0 ? "" : "checked"}> ${d}</label>`).join("");
  $("g-inicio").value = hojeSP();
  $("g-fim").value = somarDias(hojeSP(), 30);
  $("h-data").value = hojeSP();
  $("h-data").addEventListener("change", carregarHorarios);
  $("h-tipo").addEventListener("change", () => {
    if ($("h-tipo").value === "curso_osd") $("h-data").value = proximaTerca(hojeSP());
    carregarHorarios();
  });

  // Ao escolher o tipo, preenche o padrão de cada um
  function presetGerar() {
    const curso = $("g-tipo").value === "curso_osd";
    $("g-inicio").value = hojeSP();
    $("g-fim").value = somarDias(hojeSP(), curso ? 365 : 30);
    $("g-horas").value = curso ? "08:00" : "04:00, 05:00, 08:00, 09:00, 10:00, 16:00, 17:00";
    $("g-duracao").value = curso ? 240 : 10;
    $("g-vagas").value = curso ? 20 : 1;
    $("g-dias").querySelectorAll("input").forEach((c) => {
      const d = Number(c.value);
      c.checked = curso ? d === 2 : d !== 0;
    });
  }
  $("g-tipo").addEventListener("change", presetGerar);

  $("form-gerar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = $("gerar-erro");
    erro.textContent = "";

    const horas = $("g-horas").value.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    const invalida = horas.find((h) => !/^([01]?\d|2[0-3]):[0-5]\d$/.test(h));
    if (!horas.length || invalida) {
      erro.textContent = invalida ? `Horário inválido: "${invalida}". Use HH:MM.` : "Informe ao menos um horário.";
      return;
    }
    const dias = [...$("g-dias").querySelectorAll("input:checked")].map((c) => Number(c.value));
    if (!dias.length) { erro.textContent = "Marque ao menos um dia da semana."; return; }

    const { data: n, error } = await sb.rpc("gerar_horarios", {
      p_inicio: $("g-inicio").value,
      p_fim: $("g-fim").value,
      p_horas: horas.map((h) => h.padStart(5, "0")),
      p_duracao_min: Number($("g-duracao").value) || 10,
      p_vagas: Number($("g-vagas").value) || 1,
      p_dias_semana: dias,
      p_tipo: $("g-tipo").value,
    });
    if (error) { erro.textContent = msgErro(error); return; }
    toast(`${n} horário(s) criado(s).`, "ok");
    $("h-tipo").value = $("g-tipo").value;
    carregarHorarios();
  });

  async function carregarHorarios() {
    const data = $("h-data").value || hojeSP();
    const tbody = $("h-lista");
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Carregando...</td></tr>`;
    const { data: rows, error } = await sb
      .from("horarios")
      .select("id, hora_inicio, hora_fim, vagas, ativo, agendamentos(status)")
      .eq("data", data)
      .eq("tipo", $("h-tipo").value)
      .order("hora_inicio");
    if (error) { tbody.innerHTML = `<tr><td colspan="5" class="erro">${esc(msgErro(error))}</td></tr>`; return; }
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="5" class="muted">Nenhum horário neste dia.</td></tr>`; return; }

    tbody.innerHTML = rows.map((h) => {
      const qtd = h.agendamentos.filter((a) => a.status !== "cancelado").length;
      const total = h.agendamentos.length;
      return `<tr data-id="${h.id}">
        <td><b>${fmtHora(h.hora_inicio)} – ${fmtHora(h.hora_fim)}</b></td>
        <td><input type="number" min="1" max="50" value="${h.vagas}" style="width:70px;padding:4px 6px" data-acao="vagas"></td>
        <td>${qtd}</td>
        <td>${h.ativo ? "Aberto" : "<span class='muted'>Fechado</span>"}</td>
        <td style="white-space:nowrap">
          <button class="btn-peq" data-acao="toggle" data-ativo="${h.ativo}">${h.ativo ? "Fechar" : "Abrir"}</button>
          ${total === 0 ? `<button class="btn-peq btn-perigo" data-acao="excluir">Excluir</button>` : ""}
        </td></tr>`;
    }).join("");
  }

  $("h-lista").addEventListener("click", async (e) => {
    const acao = e.target.dataset.acao;
    if (!acao || acao === "vagas") return;
    const id = Number(e.target.closest("tr").dataset.id);
    let res;
    if (acao === "toggle") {
      res = await sb.from("horarios").update({ ativo: e.target.dataset.ativo !== "true" }).eq("id", id);
    } else if (acao === "excluir") {
      if (!confirm("Excluir este horário?")) return;
      res = await sb.from("horarios").delete().eq("id", id);
    }
    if (res?.error) { toast(msgErro(res.error), "erro"); return; }
    carregarHorarios();
  });

  $("h-lista").addEventListener("change", async (e) => {
    if (e.target.dataset.acao !== "vagas") return;
    const id = Number(e.target.closest("tr").dataset.id);
    const vagas = Math.max(1, Number(e.target.value) || 1);
    const { error } = await sb.from("horarios").update({ vagas }).eq("id", id);
    if (error) { toast(msgErro(error), "erro"); return; }
    toast("Vagas atualizadas.", "ok");
  });

  // ================= QR Code =================
  function urlMotorista() {
    const alvo = $("qr-alvo").value;
    return new URL("index.html", window.location.href).href + (alvo ? "#" + alvo : "");
  }

  $("qr-alvo").addEventListener("change", montarQR);

  function montarQR() {
    const alvo = $("qr-alvo").value;
    $("qr-titulo").textContent = alvo === "curso" ? "Inscreva-se no Curso Operação Sem Derrame"
      : alvo === "checklist" ? "Agende seu checklist" : "Agende seu checklist ou curso";
    const url = urlMotorista();
    $("qr-url").textContent = url;
    $("qr-abrir").href = url;
    const box = $("qr-cartaz");
    box.innerHTML = "";
    new QRCode(box, { text: url, width: 280, height: 280, correctLevel: QRCode.CorrectLevel.M });
  }

  // Mostra observações na impressão
  window.addEventListener("beforeprint", () =>
    document.querySelectorAll("[data-print-obs]").forEach((el) => (el.style.display = "block")));
  window.addEventListener("afterprint", () =>
    document.querySelectorAll("[data-print-obs]").forEach((el) => (el.style.display = "none")));

  sb.auth.onAuthStateChange((evt) => { if (evt === "SIGNED_OUT") mostrarLogin(); });

  iniciar();
})();
