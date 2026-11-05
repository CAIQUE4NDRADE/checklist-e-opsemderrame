// Painel: aba "Entrada a pé" (lista do dia, chegada de cada pessoa, cancelar) e check-in pelo código
(function () {
  const { sb, hojeSP, fmtData, fmtDataLonga, mascaraCPF, mascaraTelefone, esc, msgErro, toast } = window.App;
  const $ = (id) => document.getElementById(id);
  const FUNCAO = { monitor: "Monitor", motorista: "Motorista" };
  const horaDe = (ts) => new Date(ts).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

  let pedidos = [];

  $("pe-data").value = hojeSP();
  $("pe-data").addEventListener("change", () => carregar());
  $("pe-hoje").addEventListener("click", () => { $("pe-data").value = hojeSP(); carregar(); });
  $("pe-atualizar").addEventListener("click", () => carregar());
  $("pe-imprimir").addEventListener("click", () => window.print());
  $("pe-busca").addEventListener("input", () => render());
  $("pe-mostrar-cancelados").addEventListener("change", () => render());

  async function buscar(filtro) {
    let q = sb.from("entradas_pe").select("*, entradas_pe_pessoas(*)").order("created_at");
    q = filtro(q);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map((e) => ({
      ...e,
      pessoas: (e.entradas_pe_pessoas || []).sort((a, b) =>
        (a.funcao === b.funcao ? 0 : a.funcao === "monitor" ? -1 : 1) || a.nome.localeCompare(b.nome, "pt-BR")),
    }));
  }

  async function carregar(silencioso = false) {
    const data = $("pe-data").value || hojeSP();
    $("pe-titulo").textContent = `Entrada a pé · ${fmtDataLonga(data)} · 08:00 às 17:00`;
    if (!silencioso) $("pe-lista").innerHTML = `<p class="muted">Carregando...</p>`;
    try { pedidos = await buscar((q) => q.eq("data", data)); }
    catch (err) { $("pe-lista").innerHTML = `<p class="erro">${esc(msgErro(err))}</p>`; return; }
    render();
  }

  function combina(e, termo) {
    if (!termo) return true;
    const t = termo.toUpperCase().replace(/[^A-Z0-9 ]/g, "");
    const alvo = [e.codigo, e.transportadora, e.responsavel, e.telefone,
      ...e.pessoas.flatMap((p) => [p.nome, p.cpf])].join(" ").toUpperCase();
    return t.split(" ").filter(Boolean).every((p) => alvo.includes(p));
  }

  function render() {
    const termo = $("pe-busca").value.trim();
    const verCanc = $("pe-mostrar-cancelados").checked;
    const ativos = pedidos.filter((e) => e.status === "agendado");
    const pessoas = ativos.flatMap((e) => e.pessoas);
    const chegaram = pessoas.filter((p) => p.checkin_em).length;
    $("pe-kpis").innerHTML = [["Pedidos", ativos.length], ["Pessoas", pessoas.length],
      ["Entraram", chegaram], ["Faltam", pessoas.length - chegaram]]
      .map(([t, n]) => `<div class="kpi"><b>${n}</b><span>${t}</span></div>`).join("");

    const lista = pedidos.filter((e) => (verCanc || e.status !== "cancelado") && combina(e, termo));
    if (!pedidos.length) {
      $("pe-lista").innerHTML = `<div class="card"><p class="muted" style="margin:0">Nenhuma entrada a pé agendada neste dia.</p></div>`;
      return;
    }
    $("pe-lista").innerHTML = lista.length ? lista.map(cardPedido).join("")
      : `<p class="muted">Nada encontrado${termo ? ` para "${esc(termo)}"` : ""}.</p>`;
  }

  function cardPedido(e, opcoes = {}) {
    const cancelado = e.status === "cancelado";
    const hoje = e.data === hojeSP();
    const faltam = e.pessoas.filter((p) => !p.checkin_em).length;
    const tel = String(e.telefone || "");
    return `
      <div class="bloco-hora pe-pedido ${cancelado ? "cancelado" : ""}" data-id="${e.id}">
        <header>
          <b>${esc(e.transportadora)} · código ${esc(e.codigo)}${cancelado ? " · CANCELADO" : ""}</b>
          <span class="muted">${e.pessoas.length - faltam}/${e.pessoas.length} entraram</span>
        </header>
        <div class="agend" style="border:0">
          <div class="agend-info">Responsável <b>${esc(e.responsavel)}</b> ·
            <a href="https://wa.me/55${esc(tel)}" target="_blank" rel="noopener">${esc(mascaraTelefone(tel))}</a>
            ${opcoes.comData ? ` · <b>${esc(fmtData(e.data))}</b>` : ""}</div>
        </div>
        <table class="pe-tabela"><tbody>
          ${e.pessoas.map((p) => `
            <tr data-pessoa="${p.id}">
              <td><span class="chip chip-${esc(p.funcao)}">${FUNCAO[p.funcao] || esc(p.funcao)}</span></td>
              <td><b>${esc(p.nome)}</b> <span class="cpf">${esc(mascaraCPF(p.cpf))}</span></td>
              <td>${p.checkin_em
                ? `<span class="chegou">Entrou ${esc(horaDe(p.checkin_em))}</span>
                   <button class="btn-peq nao-imprimir" data-acao="desfazer" title="Desfazer chegada">Desfazer</button>`
                : cancelado || !hoje ? `<span class="muted">—</span>`
                : `<button class="btn-peq btn-primario nao-imprimir" data-acao="chegou">Registrar entrada</button>`}</td>
            </tr>`).join("")}
        </tbody></table>
        <div class="pe-rodape nao-imprimir">
          <span class="muted">${e.pessoas.length} ${e.pessoas.length === 1 ? "pessoa" : "pessoas"}</span>
          ${!cancelado && hoje && faltam > 1 ? `<button class="btn-peq" data-acao="todos">Registrar entrada de todos (${faltam})</button>` : ""}
          ${cancelado ? `<button class="btn-peq" data-acao="reativar">Reativar</button>`
            : `<button class="btn-peq btn-perigo" data-acao="cancelar">Cancelar pedido</button>`}
        </div>
      </div>`;
  }

  // Ações (servem tanto para a aba quanto para o resultado do check-in)
  async function acao(ev, depois) {
    const b = ev.target.closest("button[data-acao]");
    if (!b) return;
    const card = b.closest(".pe-pedido");
    const id = Number(card.dataset.id);
    const pessoaId = Number(b.closest("tr")?.dataset.pessoa);
    let res;
    b.disabled = true;
    if (b.dataset.acao === "chegou") {
      res = await sb.from("entradas_pe_pessoas").update({ checkin_em: new Date().toISOString() }).eq("id", pessoaId);
    } else if (b.dataset.acao === "desfazer") {
      if (!confirm("Desfazer o registro de entrada desta pessoa?")) { b.disabled = false; return; }
      res = await sb.from("entradas_pe_pessoas").update({ checkin_em: null }).eq("id", pessoaId);
    } else if (b.dataset.acao === "todos") {
      res = await sb.from("entradas_pe_pessoas").update({ checkin_em: new Date().toISOString() })
        .eq("entrada_id", id).is("checkin_em", null);
    } else if (b.dataset.acao === "cancelar") {
      if (!confirm("Cancelar a entrada a pé de todas as pessoas deste pedido?")) { b.disabled = false; return; }
      res = await sb.from("entradas_pe").update({ status: "cancelado" }).eq("id", id);
    } else if (b.dataset.acao === "reativar") {
      res = await sb.from("entradas_pe").update({ status: "agendado" }).eq("id", id);
    }
    if (res?.error) { toast(msgErro(res.error), "erro"); b.disabled = false; return; }
    toast(b.dataset.acao === "cancelar" ? "Pedido cancelado." : b.dataset.acao === "reativar" ? "Pedido reativado." : "Registrado.", "ok");
    depois();
  }
  $("pe-lista").addEventListener("click", (ev) => acao(ev, () => carregar(true)));

  // Check-in: chamado pelo admin.js quando o código não é de checklist/curso
  async function checkin(cod) {
    let lista;
    try { lista = await buscar((q) => q.eq("codigo", cod).limit(1)); }
    catch (_) { return false; }
    if (!lista.length) return false;
    const e = lista[0];
    const hoje = hojeSP();
    const avisos = [];
    if (e.status === "cancelado") avisos.push(["erro", "Este pedido de entrada a pé foi cancelado."]);
    if (e.data < hoje) avisos.push(["erro", `Agendado para ${fmtData(e.data)}, já passou.`]);
    if (e.data > hoje) avisos.push(["alerta", `Agendado para ${fmtData(e.data)}, não para hoje.`]);
    const hora = new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    if (e.data === hoje && (hora < "08:00" || hora >= "17:00")) avisos.push(["alerta", "Fora do horário da entrada a pé (08:00 às 17:00)."]);
    if (e.pessoas.length && e.pessoas.every((p) => p.checkin_em)) avisos.push(["ok", "Todas as pessoas já entraram."]);
    $("ci-resultado").innerHTML = `
      <div class="card ci-card" style="padding:0;overflow:hidden">
        ${cardPedido(e, { comData: true })}
        ${avisos.length ? `<div style="padding:0 18px 14px">${avisos.map(([t, m]) => `<div class="ci-aviso ci-${t}">${esc(m)}</div>`).join("")}</div>` : ""}
        <div class="acoes" style="padding:0 18px 16px"><button id="ci-abrir-pe">Abrir na aba Entrada a pé</button></div>
      </div>`;
    $("ci-resultado").querySelector(".pe-pedido").addEventListener("click", (ev) => acao(ev, () => checkin(cod)));
    $("ci-abrir-pe").addEventListener("click", () => {
      $("pe-data").value = e.data;
      $("pe-busca").value = e.codigo;
      document.querySelector('.tab[data-aba="pe"]').click();
    });
    return true;
  }

  // Atualiza sozinho a cada 30 s enquanto a aba está aberta
  setInterval(() => {
    if ($("aba-pe").classList.contains("oculto")) return;
    if (document.activeElement?.matches("textarea, input, select")) return;
    carregar(true);
  }, 30000);

  window.EntradaPeAdmin = { carregar, checkin };
})();
