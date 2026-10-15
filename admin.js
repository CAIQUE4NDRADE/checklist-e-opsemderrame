// Painel do operador: checklist do dia, horários e QR code
(function () {
  const { sb, hojeSP, somarDias, fmtData, fmtDataLonga, fmtHora, mascaraCPF, esc,
          situacaoDoc, msgErro, toast, cfg } = window.App;

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
      ["dia", "checkin", "horarios", "relatorios", "qr"].forEach((a) =>
        $("aba-" + a).classList.toggle("oculto", t.dataset.aba !== a));
      if (t.dataset.aba !== "checkin") pararCamera();
      if (t.dataset.aba === "checkin") setTimeout(() => $("ci-codigo").focus(), 50);
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
    const alvo = [a.codigo, a.nome, a.cpf, a.telefone, a.placa_cavalo, a.placa_reboque1, a.placa_reboque2,
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
    $("d-presenca").classList.toggle("oculto", !curso || !ativos.length);
    $("d-certificados").classList.toggle("oculto", !curso || !conta("concluido"));
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
    const contato = a.email ? esc(a.email) : "";
    const R = rotulo();
    const curso = tipoDia() === "curso_osd";
    const opcoes = Object.keys(R)
      .map((s) => `<option value="${s}" ${s === a.status ? "selected" : ""}>${R[s]}</option>`).join("");

    return `
      <div class="agend ${a.status === "cancelado" ? "cancelado" : ""}" data-id="${a.id}">
        <div class="agend-topo">
          <div>
            <div class="agend-nome">${esc(a.nome)}</div>
            <div class="agend-info">${infoPessoa(a)} · código <b>${esc(a.codigo)}</b></div>
            ${contato ? `<div class="agend-info">${contato}</div>` : ""}
            ${placas ? `<div class="placas">${placas}</div>` : ""}
          </div>
          <div class="agend-lado">
            <select class="sel-status st-${esc(a.status)}" data-acao="status" aria-label="Status">${opcoes}</select>
            ${a.checkin_em
              ? `<span class="chegou">Chegou ${esc(horaDe(a.checkin_em))}</span>`
              : a.status === "fila" ? `<button class="btn-peq nao-imprimir" data-acao="checkin">Registrar chegada</button>` : ""}
            ${curso && a.status === "concluido"
              ? `<button class="btn-peq nao-imprimir" data-acao="certificado">Certificado</button>` : ""}
          </div>
        </div>
        ${curso || !temDocs(a) ? "" : `<div class="docs">${docs}</div>`}
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
    const acao = e.target.dataset.acao;
    if (acao === "checkin" || acao === "certificado") {
      const id = Number(e.target.closest(".agend").dataset.id);
      const ag = horariosDia.flatMap((h) => h.agendamentos).find((a) => a.id === id);
      if (!ag) return;
      if (acao === "checkin") {
        e.target.disabled = true;
        if (await registrarChegada(ag.id)) carregarDia(true);
        else e.target.disabled = false;
      } else {
        gerarCertificados([ag], $("d-data").value);
      }
      return;
    }
    if (acao !== "gravar-obs") return;
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

  // ================= Utilidades =================
  // Linha de identificação: só mostra o que foi informado
  function infoPessoa(a) {
    return [
      a.cpf ? `CPF ${esc(mascaraCPF(a.cpf))}` : "",
      esc(a.transportadora),
      a.companhia ? esc(a.companhia) : "",
      a.telefone ? `<a href="tel:+55${esc(a.telefone)}">${esc(fmtTel(a.telefone))}</a>` : "",
    ].filter(Boolean).join(" · ");
  }
  const fmtTel = (t) => String(t || "").replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");
  const temDocs = (a) => [a.cnh_validade, a.mopp_validade, a.nr20_validade, a.nr35_validade].some(Boolean);
  const horaDe = (iso) =>
    new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

  const scriptsCarregados = {};
  function carregarScript(url) {
    if (!scriptsCarregados[url]) {
      scriptsCarregados[url] = new Promise((ok, falha) => {
        const s = document.createElement("script");
        s.src = url;
        s.onload = ok;
        s.onerror = () => { delete scriptsCarregados[url]; falha(new Error("Não foi possível carregar um componente. Verifique a internet.")); };
        document.head.appendChild(s);
      });
    }
    return scriptsCarregados[url];
  }
  const LIB_QR_LEITOR = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
  const LIB_XLSX = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  const LIB_PDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

  async function registrarChegada(id) {
    const { error } = await sb.from("agendamentos").update({ checkin_em: new Date().toISOString() }).eq("id", id);
    if (error) { toast(msgErro(error), "erro"); return false; }
    toast("Chegada registrada.", "ok");
    return true;
  }

  // ================= Check-in =================
  let leitor = null;

  async function abrirCamera() {
    $("ci-erro").textContent = "";
    try {
      await carregarScript(LIB_QR_LEITOR);
      leitor = new Html5Qrcode("leitor");
      await leitor.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 230, height: 230 } },
        (texto) => {
          const cod = String(texto).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
          if (cod.length === 6) { pararCamera(); $("ci-codigo").value = cod; buscarCodigo(cod); }
        }, () => {});
      $("ci-camera").classList.add("oculto");
      $("ci-parar").classList.remove("oculto");
    } catch (err) {
      $("ci-erro").textContent = /Permission|NotAllowed/i.test(String(err))
        ? "O navegador bloqueou a câmera. Libere o acesso à câmera para este site e tente de novo."
        : "Não foi possível abrir a câmera: " + (err.message || err);
      leitor = null;
    }
  }

  function pararCamera() {
    if (leitor) { leitor.stop().catch(() => {}).finally(() => { try { leitor.clear(); } catch (_) {} leitor = null; }); }
    $("ci-camera").classList.remove("oculto");
    $("ci-parar").classList.add("oculto");
  }

  $("ci-camera").addEventListener("click", abrirCamera);
  $("ci-parar").addEventListener("click", pararCamera);
  $("ci-codigo").addEventListener("input", (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")));
  $("ci-form").addEventListener("submit", (e) => { e.preventDefault(); buscarCodigo($("ci-codigo").value.trim()); });

  async function buscarCodigo(cod) {
    const res = $("ci-resultado");
    $("ci-erro").textContent = "";
    res.innerHTML = "";
    if (cod.length !== 6) { $("ci-erro").textContent = "O código tem 6 caracteres."; return; }

    const { data, error } = await sb.from("agendamentos")
      .select("*, horarios!inner(tipo, data, hora_inicio, hora_fim)")
      .eq("codigo", cod)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) { $("ci-erro").textContent = msgErro(error); return; }
    if (!data.length) { $("ci-erro").textContent = `Nenhum agendamento com o código ${cod}.`; return; }

    const a = data[0];
    const h = a.horarios;
    const hoje = hojeSP();
    const R = ROTULOS[h.tipo];
    const avisos = [];
    if (a.status === "cancelado") avisos.push(["erro", "Este agendamento foi cancelado."]);
    if (h.data < hoje) avisos.push(["erro", `Agendamento de outro dia (${fmtData(h.data)}), já passou.`]);
    if (h.data > hoje) avisos.push(["alerta", `Agendado para ${fmtData(h.data)}, não para hoje.`]);
    if (a.checkin_em) avisos.push(["ok", `Chegada já registrada às ${horaDe(a.checkin_em)}.`]);
    if (h.tipo === "checklist") {
      [["CNH", a.cnh_validade], ["MOPP", a.mopp_validade], ["NR-20", a.nr20_validade], ["NR-35", a.nr35_validade]]
        .forEach(([n, d]) => { if (d && d < hoje) avisos.push(["erro", `${n} vencido em ${fmtData(d)}.`]); });
    }
    const podeRegistrar = !a.checkin_em && a.status !== "cancelado" && h.data === hoje;
    const placas = [a.placa_cavalo, a.placa_reboque1, a.placa_reboque2, a.placa_reboque3].filter(Boolean).map(esc).join(" / ");

    res.innerHTML = `
      <div class="card ci-card">
        <span class="chip${h.tipo === "curso_osd" ? " curso" : ""}">${esc(NOME_TIPO[h.tipo])}</span>
        <h2 style="margin:10px 0 2px">${esc(a.nome)}</h2>
        <div class="agend-info">${infoPessoa(a)}</div>
        <div class="agend-info"><b>${fmtData(h.data)}</b> · ${fmtHora(h.hora_inicio)} às ${fmtHora(h.hora_fim)}
          · status <span class="status st-${esc(a.status)}">${esc(R[a.status])}</span></div>
        ${placas ? `<div class="placas">${placas}</div>` : ""}
        ${avisos.map(([t, m]) => `<div class="ci-aviso ci-${t}">${esc(m)}</div>`).join("")}
        <div class="acoes">
          ${podeRegistrar ? `<button class="btn-primario" id="ci-registrar">Registrar chegada</button>` : ""}
          <button id="ci-abrir">Abrir na agenda do dia</button>
        </div>
      </div>`;

    $("ci-registrar")?.addEventListener("click", async (ev) => {
      ev.target.disabled = true;
      if (await registrarChegada(a.id)) buscarCodigo(cod);
      else ev.target.disabled = false;
    });
    $("ci-abrir").addEventListener("click", () => {
      $("d-tipo").value = h.tipo;
      $("d-data").value = h.data;
      $("d-busca").value = a.codigo;
      document.querySelector('.tab[data-aba="dia"]').click();
    });
  }

  // ================= Curso: lista de presença e certificados =================
  function participantesDoDia() {
    return horariosDia.flatMap((h) => h.agendamentos.map((a) => ({ ...a, _h: h })))
      .filter((a) => a.status !== "cancelado")
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  $("d-presenca").addEventListener("click", () => {
    const lista = participantesDoDia();
    const data = $("d-data").value;
    const h = horariosDia[0];
    const linhas = lista.map((a, i) => `<tr><td>${i + 1}</td><td>${esc(a.nome)}</td><td>${a.cpf ? esc(mascaraCPF(a.cpf)) : ""}</td>
      <td>${esc(a.transportadora)}</td><td></td></tr>`).join("");
    const vazias = Array.from({ length: 5 }, (_, i) =>
      `<tr><td>${lista.length + i + 1}</td><td></td><td></td><td></td><td></td></tr>`).join("");
    const w = window.open("", "_blank");
    if (!w) { toast("Libere pop-ups para este site para abrir a lista.", "erro"); return; }
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>Lista de presença ${fmtData(data)}</title>
      <style>
        body{font-family:system-ui,Segoe UI,Roboto,sans-serif;margin:24px;color:#000}
        h1{font-size:20px;margin:0 0 4px} p{margin:0 0 14px;font-size:13px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border:1px solid #444;padding:8px 6px;text-align:left;height:22px}
        th{background:#eee} td:first-child{width:28px;text-align:center} td:last-child{width:32%}
        .ass{margin-top:40px;display:flex;justify-content:space-between;gap:40px;font-size:13px}
        .ass div{flex:1;border-top:1px solid #000;padding-top:4px;text-align:center}
        @media print{body{margin:10mm}}
      </style></head><body>
      <h1>Lista de presença — ${esc(cfg.NOME_CURSO || "Curso Operação Sem Derrame")}</h1>
      <p>${esc(cfg.NOME_LOCAL || "")} · ${esc(fmtDataLonga(data))}${h ? ` · ${fmtHora(h.hora_inicio)} às ${fmtHora(h.hora_fim)}` : ""}
        · Carga horária: ${esc(cfg.CURSO_CARGA_HORARIA || "")}</p>
      <table><thead><tr><th>#</th><th>Nome</th><th>CPF</th><th>Transportadora</th><th>Assinatura</th></tr></thead>
      <tbody>${linhas}${vazias}</tbody></table>
      <div class="ass"><div>Instrutor</div><div>${esc(cfg.CERTIFICADO_RESPONSAVEL || "Responsável")}</div></div>
      <script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  });

  $("d-certificados").addEventListener("click", () => {
    const concl = participantesDoDia().filter((a) => a.status === "concluido");
    if (!concl.length) { toast("Ninguém com status CONCLUÍDO nesta turma.", "erro"); return; }
    gerarCertificados(concl, $("d-data").value);
  });

  async function gerarCertificados(lista, data) {
    try { await carregarScript(LIB_PDF); } catch (err) { toast(err.message, "erro"); return; }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = 297, H = 210;
    const roxo = [77, 109, 93], ouro = [96, 144, 62];   // verde institucional + verde destaque
    const curso = cfg.NOME_CURSO || "Curso Operação Sem Derrame";

    lista.forEach((a, i) => {
      if (i > 0) pdf.addPage();
      pdf.setDrawColor(...roxo); pdf.setLineWidth(2.2); pdf.rect(10, 10, W - 20, H - 20);
      pdf.setDrawColor(...ouro); pdf.setLineWidth(0.6); pdf.rect(14, 14, W - 28, H - 28);

      pdf.setTextColor(...roxo); pdf.setFont("helvetica", "bold"); pdf.setFontSize(34);
      pdf.text("CERTIFICADO", W / 2, 46, { align: "center" });
      pdf.setFontSize(13); pdf.setFont("helvetica", "normal"); pdf.setTextColor(80);
      pdf.text("DE CONCLUSÃO", W / 2, 55, { align: "center" });

      pdf.setTextColor(30); pdf.setFontSize(14);
      pdf.text("Certificamos que", W / 2, 78, { align: "center" });
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(24); pdf.setTextColor(...roxo);
      pdf.text(a.nome, W / 2, 92, { align: "center", maxWidth: W - 60 });

      pdf.setFont("helvetica", "normal"); pdf.setFontSize(13); pdf.setTextColor(30);
      const txt = `${a.cpf ? `portador(a) do CPF ${mascaraCPF(a.cpf)}, ` : ""}da transportadora ${a.transportadora}, ` +
        `concluiu o ${curso}, realizado em ${fmtData(data)} no ${cfg.NOME_LOCAL || "terminal"}, ` +
        `com carga horária de ${cfg.CURSO_CARGA_HORARIA || "—"}.`;
      pdf.text(pdf.splitTextToSize(txt, W - 80), W / 2, 108, { align: "center" });

      pdf.setDrawColor(60); pdf.setLineWidth(0.3);
      pdf.line(W / 2 - 55, 160, W / 2 + 55, 160);
      pdf.setFontSize(11);
      pdf.text(cfg.CERTIFICADO_RESPONSAVEL || "Responsável", W / 2, 166, { align: "center" });

      pdf.setFontSize(9); pdf.setTextColor(110);
      pdf.text(`Código de validação: ${a.codigo} · ${cfg.NOME_APP || "Agenda BPA"}`, W / 2, 185, { align: "center" });
    });

    const nome = lista.length === 1
      ? `certificado-${lista[0].nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`
      : `certificados-${data}.pdf`;
    pdf.save(nome);
    toast(lista.length === 1 ? "Certificado gerado." : `${lista.length} certificados gerados.`, "ok");
  }

  // ================= Relatórios =================
  $("r-de").value = hojeSP().slice(0, 8) + "01";
  $("r-ate").value = hojeSP();

  $("form-rel").addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = $("rel-erro");
    erro.textContent = "";
    const de = $("r-de").value, ate = $("r-ate").value, tipo = $("r-tipo").value;
    if (!de || !ate || ate < de) { erro.textContent = "Confira as datas: a data final não pode ser antes da inicial."; return; }

    const btn = e.submitter || $("form-rel").querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "Gerando...";
    try {
      await carregarScript(LIB_XLSX);
      let linhas = [], pagina = 0;
      while (true) {   // busca em páginas de 1000
        let q = sb.from("agendamentos")
          .select("*, horarios!inner(tipo, data, hora_inicio, hora_fim)")
          .gte("horarios.data", de).lte("horarios.data", ate)
          .range(pagina * 1000, pagina * 1000 + 999);
        if (tipo) q = q.eq("horarios.tipo", tipo);
        const { data, error } = await q;
        if (error) throw error;
        linhas = linhas.concat(data);
        if (data.length < 1000) break;
        pagina++;
      }
      linhas.sort((a, b) => (a.horarios.data + a.horarios.hora_inicio).localeCompare(b.horarios.data + b.horarios.hora_inicio));

      const conta = (s) => linhas.filter((a) => a.status === s).length;
      $("rel-kpis").innerHTML = [["Registros", linhas.length], ["Concluídos", conta("concluido")],
        ["Pendências/faltas", conta("pendencia")], ["Cancelados", conta("cancelado")]]
        .map(([t, n]) => `<div class="kpi"><b>${n}</b><span>${t}</span></div>`).join("");

      if (!linhas.length) { erro.textContent = "Nenhum agendamento nesse período."; return; }

      const dt = (d) => (d ? fmtData(d) : "");
      const tabela = linhas.map((a) => ({
        "Tipo": NOME_TIPO[a.horarios.tipo],
        "Data": dt(a.horarios.data),
        "Horário": `${fmtHora(a.horarios.hora_inicio)}–${fmtHora(a.horarios.hora_fim)}`,
        "Status": ROTULOS[a.horarios.tipo][a.status],
        "Chegada": a.checkin_em ? horaDe(a.checkin_em) : "",
        "Nome": a.nome,
        "CPF": a.cpf ? mascaraCPF(a.cpf) : "",
        "Telefone": a.telefone ? fmtTel(a.telefone) : "",
        "E-mail": a.email || "",
        "Transportadora": a.transportadora,
        "Companhia": a.companhia,
        "Placa cavalo": a.placa_cavalo || "",
        "Reboque 1": a.placa_reboque1 || "",
        "Reboque 2": a.placa_reboque2 || "",
        "Reboque 3": a.placa_reboque3 || "",
        "CNH validade": dt(a.cnh_validade),
        "MOPP validade": dt(a.mopp_validade),
        "NR-20 validade": dt(a.nr20_validade),
        "NR-35 validade": dt(a.nr35_validade),
        "Observação": a.obs || "",
        "Código": a.codigo,
      }));

      // Resumo por dia
      const porDia = {};
      linhas.forEach((a) => {
        const k = a.horarios.data + "|" + a.horarios.tipo;
        porDia[k] = porDia[k] || { "Data": dt(a.horarios.data), "Tipo": NOME_TIPO[a.horarios.tipo],
          "Agendados": 0, "Concluídos": 0, "Pendências/faltas": 0, "Cancelados": 0, "Chegaram": 0 };
        const r = porDia[k];
        if (a.status !== "cancelado") r["Agendados"]++;
        if (a.status === "concluido") r["Concluídos"]++;
        if (a.status === "pendencia") r["Pendências/faltas"]++;
        if (a.status === "cancelado") r["Cancelados"]++;
        if (a.checkin_em) r["Chegaram"]++;
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(tabela);
      ws["!cols"] = Object.keys(tabela[0]).map((k) => ({ wch: Math.min(40, Math.max(k.length + 2,
        ...tabela.slice(0, 200).map((r) => String(r[k]).length + 1))) }));
      ws["!autofilter"] = { ref: ws["!ref"] };
      XLSX.utils.book_append_sheet(wb, ws, "Agendamentos");
      const ws2 = XLSX.utils.json_to_sheet(Object.values(porDia));
      ws2["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 11 }, { wch: 11 }, { wch: 18 }, { wch: 11 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Resumo por dia");
      XLSX.writeFile(wb, `agenda-bpa_${de}_a_${ate}.xlsx`);
      toast("Planilha gerada.", "ok");
    } catch (err) {
      erro.textContent = msgErro(err);
    } finally {
      btn.disabled = false; btn.textContent = "Baixar Excel";
    }
  });

  // ================= LGPD =================
  $("lgpd-limpar").addEventListener("click", () => {
    $("lgpd-limpar").classList.add("oculto");
    $("lgpd-confirmar").classList.remove("oculto");
    setTimeout(() => { $("lgpd-confirmar").classList.add("oculto"); $("lgpd-limpar").classList.remove("oculto"); }, 8000);
  });
  $("lgpd-confirmar").addEventListener("click", async () => {
    $("lgpd-confirmar").classList.add("oculto");
    $("lgpd-limpar").classList.remove("oculto");
    const { data, error } = await sb.rpc("limpar_dados_antigos", { p_meses: 12 });
    if (error) { toast(msgErro(error), "erro"); return; }
    toast(`${data} horário(s) antigo(s) apagado(s), com seus agendamentos.`, "ok");
  });

  sb.auth.onAuthStateChange((evt) => { if (evt === "SIGNED_OUT") mostrarLogin(); });

  iniciar();
})();
