const STORAGE_KEY = "gestor-emprestimos-clientes-v2";
const SESSION_KEY = "gestor-emprestimos-sessao-v1";
const DEFAULT_STATE_ID = "main-v2";
const ADMIN_PASSWORD = "Isabella";

const state = {
  clients: [],
  session: null,
  storageMode: "local",
  storageReady: false,
  view: "dashboard",
  filter: "all",
  search: "",
  globalSearch: "",
  dateFilter: "",
  selectedClientId: null,
  selectedTab: "summary"
};

const $ = (selector) => document.querySelector(selector);
const mainContent = $("#mainContent");
const toast = $("#toast");
const ratingPopover = $("#ratingPopover");
let supabaseClient = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  await setupRemoteStorage();
  state.clients = await loadClients();
  state.session = loadSession();

  bindStaticEvents();

  if (state.session) {
    showApp();
  } else {
    showLogin();
  }
}

function bindStaticEvents() {
  $("#loginForm").addEventListener("submit", handleLogin);
  document.querySelectorAll("[data-viewer-login]").forEach((button) => {
    button.addEventListener("click", () => loginViewer(button.dataset.viewerLogin));
  });
  $("#logoutBtn").addEventListener("click", logout);
  $("#mobileNewClientBtn").addEventListener("click", () => openClientDialog());

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.dataset.closeDialog));
  });

  document.querySelectorAll(".nav-item, .bottom-nav-item").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.view));
  });

  $("#clientForm").addEventListener("submit", handleClientSubmit);
  $("#paymentForm").addEventListener("submit", handlePaymentSubmit);
  $("#documentForm").addEventListener("submit", handleDocumentSubmit);

  mainContent.addEventListener("click", handleMainClick);
  mainContent.addEventListener("input", handleMainInput);
  mainContent.addEventListener("mouseover", handleRatingHover);
  mainContent.addEventListener("mouseout", handleRatingOut);
  document.addEventListener("click", handleOutsideClick);
}

function handleLogin(event) {
  event.preventDefault();
  const adminPassword = $("#loginPassword").value.trim();

  if (adminPassword !== ADMIN_PASSWORD) {
    $("#loginError").hidden = false;
    return;
  }

  state.session = {
    role: "admin",
    label: "Isabella"
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
  $("#loginPassword").value = "";
  $("#loginError").hidden = true;
  showApp();
  return;

  const role = $("#loginRole").value;
  const password = $("#loginPassword").value.trim();

  if (role === "admin" && password !== ADMIN_PASSWORD) {
    $("#loginError").hidden = false;
    return;
  }

  state.session = {
    role,
    label: role === "admin" ? "Admin" : "Visualização"
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
  $("#loginPassword").value = "";
  $("#loginError").hidden = true;
  showApp();
}

function loginViewer(name) {
  state.session = {
    role: "viewer",
    label: name
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
  $("#loginError").hidden = true;
  showApp();
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  state.session = null;
  state.view = "dashboard";
  state.selectedClientId = null;
  showLogin();
}

function showLogin() {
  $("#loginScreen").hidden = false;
  $("#appShell").hidden = true;
}

function showApp() {
  $("#loginScreen").hidden = true;
  $("#appShell").hidden = false;
  updateSessionUi();
  render();
}

function updateSessionUi() {
  const admin = isAdmin();
  const userName = state.session?.label || (admin ? "Isabella" : "Visualização");
  document.body.dataset.role = admin ? "admin" : "viewer";
  $("#sessionRole").textContent = admin ? "Perfil Editor" : "Perfil Visualização";
  $("#sessionMode").textContent = admin ? `${userName} - pode editar` : `${userName} - somente leitura`;
  $("#mobileSessionRole").textContent = admin ? userName : `${userName} (ver)`;
  document.querySelectorAll(".admin-only").forEach((item) => {
    item.hidden = !admin;
  });
  return;
  $("#sessionRole").textContent = admin ? "Perfil Admin" : "Perfil Visualização";
  $("#sessionMode").textContent = admin ? "Pode editar tudo" : "Somente leitura";
  $("#mobileSessionRole").textContent = admin ? "Admin" : "Somente leitura";
  document.querySelectorAll(".admin-only").forEach((item) => {
    item.hidden = !admin;
  });
}

function navigate(view) {
  state.view = view;
  state.selectedClientId = null;
  state.selectedTab = "summary";
  render();
}

function render() {
  updateNav();
  updateSessionUi();

  if (state.view === "documents") {
    renderDocumentsView();
    return;
  }

  if (state.view === "history") {
    renderHistoryView();
    return;
  }

  if (state.view === "detail") {
    renderClientDetail();
    return;
  }

  if (state.view === "dashboard") {
    renderDashboardView();
    return;
  }

  renderClientListView();
}

function updateNav() {
  document.querySelectorAll(".nav-item, .bottom-nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
}

function help(text, variant = "") {
  return `<span class="help-tip ${variant}" title="${escapeHtml(text)}">?</span>`;
}

function renderCommandBar() {
  return `
    <div class="command-bar">
      <label class="command-search">
        Busca rÃ¡pida ${help("Procure por nome, CPF, telefone, e-mail, endereÃ§o ou indicaÃ§Ã£o sem sair da tela atual.")}
        <input id="globalSearch" value="${escapeHtml(state.globalSearch)}" placeholder="Buscar cliente, CPF ou telefone">
      </label>
      <label class="command-date">
        Filtrar por mÃªs ${help("Filtra clientes, resumo financeiro, vencimentos e histÃ³rico pelo mÃªs escolhido.")}
        <input id="dateFilter" type="month" value="${escapeHtml(state.dateFilter)}">
      </label>
      <div class="command-actions">
        <button class="ghost-btn" type="button" data-action="clear-filters">Limpar</button>
        <button class="ghost-btn" type="button" data-action="export-all-csv">CSV geral</button>
        <button class="primary-btn" type="button" data-action="export-all-pdf">Backup PDF</button>
      </div>
    </div>
    ${renderGlobalSearchResults()}
  `;
}

function renderGlobalSearchResults() {
  const query = state.globalSearch.trim();
  if (!query) return "";

  const results = getGlobalSearchResults().slice(0, 6);
  return `
    <div class="global-results">
      <div class="section-headline">
        <h3>Resultado da busca ${help("Clique em abrir para ir direto ao cadastro completo do cliente.")}</h3>
        <span class="tag">${results.length} encontrado(s)</span>
      </div>
      ${results.length ? results.map((client) => `
        <article class="search-result-row">
          <div>
            <strong>${escapeHtml(client.fullName)}</strong>
            <span>${escapeHtml(client.cpf || "CPF nÃ£o informado")} - ${escapeHtml(client.phone || "Telefone nÃ£o informado")}</span>
          </div>
          <div class="inline-actions">
            <button class="ghost-btn" type="button" data-action="open-client" data-id="${client.id}">Abrir</button>
            <button class="ghost-btn" type="button" data-action="whatsapp-client" data-id="${client.id}">WhatsApp</button>
          </div>
        </article>
      `).join("") : `<div class="empty-state">Nenhum cliente encontrado para "${escapeHtml(query)}".</div>`}
    </div>
  `;
}

function renderDashboardView() {
  const stats = getStats();
  const scopedClients = getDateScopedClients();
  const finance = getFinancialSummary(scopedClients);
  const dueAlerts = getDueAlerts(scopedClients);
  const hasClients = state.clients.length > 0;
  const lateClients = scopedClients.filter((client) => getClientStatus(client).key === "late");
  const activeClients = scopedClients.filter((client) => ["late", "on-time"].includes(getClientStatus(client).key));
  const recentRows = scopedClients
    .flatMap((client) => getClientHistoryRows(client).map((row) => ({ ...row, clientName: client.fullName, clientId: client.id })))
    .filter((row) => matchesMonth(row.createdAt, state.dateFilter))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  mainContent.innerHTML = `
    <section>
      <div class="page-head">
        <div>
          <span class="eyebrow">Dashboard</span>
          <h1>Visão rápida do dia ${help("Resumo para bater o olho e saber onde agir primeiro.")}</h1>
          <p>Indicadores, atrasos e movimentações importantes sem misturar com a lista completa de clientes.</p>
        </div>
        <div class="page-actions">
          ${isAdmin() ? `<button class="primary-btn" type="button" data-action="new-client">Novo cliente</button>` : `<div class="viewer-lock">Modo somente leitura</div>`}
        </div>
      </div>

      ${renderStorageBanner()}
      ${renderCommandBar()}
      ${hasClients ? "" : renderStartGuide()}

      ${renderFinancialSummary(finance)}
      ${renderDueAlerts(dueAlerts)}

      <div class="stat-grid">
        <div class="stat-card"><span>Ativos ${help("Clientes com empréstimo em aberto, em dia ou devendo.")}</span><strong>${stats.active}</strong></div>
        <div class="stat-card"><span>Devendo ${help("Clientes com parcela atrasada ou pagamento parcial.")}</span><strong>${stats.late}</strong></div>
        <div class="stat-card"><span>Quitados ${help("Clientes que finalizaram o pagamento combinado.")}</span><strong>${stats.paid}</strong></div>
        <div class="stat-card"><span>Sem empréstimo ${help("Clientes cadastrados que não possuem empréstimo ativo agora.")}</span><strong>${stats.inactive}</strong></div>
      </div>

      <div class="dashboard-grid">
        <div class="panel">
          <div class="section-headline">
            <h3>Prioridade de cobrança ${help("Clientes que merecem atenção primeiro por atraso ou pagamento parcial.")}</h3>
            <span class="tag red">${lateClients.length} atenção</span>
          </div>
          ${lateClients.length ? lateClients.map((client) => renderPriorityRow(client)).join("") : `<div class="empty-state">Nenhum cliente devendo agora. Quando houver atraso ou pagamento parcial, ele aparece aqui primeiro.</div>`}
        </div>

        <div class="panel">
          <div class="section-headline">
            <h3>Carteira ativa ${help("Clientes que ainda possuem empréstimo em andamento.")}</h3>
            <span class="tag">${activeClients.length} ativos</span>
          </div>
          ${activeClients.slice(0, 5).map((client) => renderCompactClientRow(client)).join("") || `<div class="empty-state">Nenhum empréstimo ativo. Cadastre o primeiro cliente para começar a carteira.</div>`}
        </div>

        <div class="panel wide-panel">
          <div class="section-headline">
            <h3>Últimas movimentações ${help("Histórico recente de observações, pagamentos e documentos.")}</h3>
            <button class="ghost-btn" type="button" data-action="go-history">Ver histórico</button>
          </div>
          ${recentRows.length ? `<div class="history-list">${recentRows.map(renderHistoryRow).join("")}</div>` : `<div class="empty-state">Sem histórico registrado. Pagamentos, observações e documentos vão aparecer aqui automaticamente.</div>`}
        </div>
      </div>
    </section>
  `;
}

function renderStartGuide() {
  const adminAction = isAdmin()
    ? `<button class="primary-btn" type="button" data-action="new-client">Cadastrar primeiro cliente</button>`
    : `<div class="viewer-lock">Aguardando a Isabella cadastrar os clientes</div>`;

  return `
    <div class="onboarding-panel">
      <div>
        <span class="eyebrow">Sistema virgem</span>
        <h2>Comece pelo primeiro cliente ${help("Essa área some naturalmente quando houver clientes cadastrados.")}</h2>
        <p>O painel está zerado para a Isabella montar a carteira real do zero, sem clientes de exemplo misturados.</p>
      </div>
      <div class="step-list">
        <div><strong>1</strong><span>Cadastre dados pessoais: CPF, telefone, nascimento, endereço e referência.</span></div>
        <div><strong>2</strong><span>Preencha o acordo manual: valor emprestado, valor combinado, data e parcelas.</span></div>
        <div><strong>3</strong><span>Depois anexe documentos, comprovantes e registre cada pagamento no histórico.</span></div>
      </div>
      ${adminAction}
    </div>
  `;
}

function renderFinancialSummary(finance) {
  return `
    <div class="finance-grid">
      <div class="finance-card">
        <span>Total emprestado ${help("Soma dos valores que saÃ­ram para clientes no perÃ­odo filtrado.")}</span>
        <strong>${formatMoney(finance.borrowed)}</strong>
      </div>
      <div class="finance-card">
        <span>Total combinado ${help("Soma dos valores finais negociados manualmente com os clientes.")}</span>
        <strong>${formatMoney(finance.expected)}</strong>
      </div>
      <div class="finance-card">
        <span>Total recebido ${help("Soma dos valores pagos registrados nas parcelas.")}</span>
        <strong>${formatMoney(finance.received)}</strong>
      </div>
      <div class="finance-card">
        <span>Total pendente ${help("DiferenÃ§a entre o combinado e o que jÃ¡ foi marcado como pago.")}</span>
        <strong>${formatMoney(finance.pending)}</strong>
      </div>
    </div>
  `;
}

function renderDueAlerts(alerts) {
  const block = (title, rows, tone, empty) => `
    <div class="due-column ${tone}">
      <div class="section-headline">
        <h3>${title}</h3>
        <span class="tag ${tone === "overdue" ? "red" : tone === "today" ? "amber" : ""}">${rows.length}</span>
      </div>
      ${rows.length ? rows.slice(0, 6).map(renderDueAlertRow).join("") : `<div class="empty-state compact">${empty}</div>`}
    </div>
  `;

  return `
    <div class="due-alerts">
      ${block("Vence hoje", alerts.today, "today", "Nada vencendo hoje.")}
      ${block("Vence na semana", alerts.week, "week", "Nenhuma parcela vencendo nos prÃ³ximos 7 dias.")}
      ${block("Atrasado", alerts.overdue, "overdue", "Nenhuma parcela atrasada pelo prazo.")}
    </div>
  `;
}

function renderDueAlertRow(row) {
  return `
    <article class="due-row">
      <div>
        <strong>${escapeHtml(row.client.fullName)}</strong>
        <span>${escapeHtml(row.installment.label)} - ${formatDate(row.installment.dueDate)} - ${formatMoney(row.installment.expectedValue)}</span>
      </div>
      <div class="inline-actions">
        <button class="ghost-btn" type="button" data-action="open-client" data-id="${row.client.id}">Abrir</button>
        <button class="ghost-btn" type="button" data-action="whatsapp-client" data-id="${row.client.id}">WhatsApp</button>
      </div>
    </article>
  `;
}

function renderPriorityRow(client) {
  const counts = getInstallmentCounts(client);
  return `
    <article class="priority-row">
      <div>
        <strong>${escapeHtml(client.fullName)}</strong>
        <span>${counts.late} atraso(s), ${counts.partial} parcial(is), faltam ${counts.remaining}</span>
      </div>
      <button class="ghost-btn" type="button" data-action="open-client" data-id="${client.id}">Abrir</button>
    </article>
  `;
}

function renderCompactClientRow(client) {
  const counts = getInstallmentCounts(client);
  const status = getClientStatus(client);
  return `
    <article class="priority-row">
      <div>
        <strong>${escapeHtml(client.fullName)}</strong>
        <span>${status.label} - pagou ${counts.paid} de ${counts.total}</span>
      </div>
      ${renderRating(client)}
    </article>
  `;
}

function renderClientListView() {
  const stats = getStats(getFilteredClients());
  const clients = getFilteredClients();

  mainContent.innerHTML = `
    <section>
      <div class="page-head">
        <div>
          <span class="eyebrow">Clientes</span>
          <h1>Lista de clientes ${help("Área para buscar, filtrar e abrir o cadastro completo de cada cliente.")}</h1>
          <p>Busque, filtre e abra o histórico completo de cada cliente.</p>
        </div>
        <div class="page-actions">
          ${isAdmin() ? `<button class="primary-btn" type="button" data-action="new-client">Novo cliente</button>` : `<div class="viewer-lock">Você está em modo somente leitura</div>`}
        </div>
      </div>

      ${renderStorageBanner()}
      ${renderCommandBar()}

      <div class="stat-grid">
        <div class="stat-card"><span>Com empréstimo ativo</span><strong>${stats.active}</strong></div>
        <div class="stat-card"><span>Devendo / atrasados</span><strong>${stats.late}</strong></div>
        <div class="stat-card"><span>Quitados</span><strong>${stats.paid}</strong></div>
        <div class="stat-card"><span>Sem empréstimo agora</span><strong>${stats.inactive}</strong></div>
      </div>

      <div class="toolbar">
        <input id="searchClients" class="search-input" value="${escapeHtml(state.search)}" placeholder="Buscar por nome ou indicação">
        <div class="filter-row">
          ${filterButton("all", "Todos")}
          ${filterButton("paid", "Quem pagou")}
          ${filterButton("late", "Devendo")}
          ${filterButton("on-time", "Em dia")}
          ${filterButton("inactive", "Sem empréstimo")}
        </div>
      </div>

      ${clients.length ? `<div class="client-grid">${clients.map(renderClientCard).join("")}</div>` : renderClientsEmptyState()}
    </section>
  `;
}

function renderClientsEmptyState() {
  if (state.clients.length > 0) {
    return `<div class="empty-state">Nenhum cliente encontrado nesse filtro. Tente trocar o filtro ou buscar por outro nome.</div>`;
  }

  return `
    <div class="empty-state actionable">
      <h3>Nenhum cliente cadastrado ainda</h3>
      <p>Comece pelo cadastro da Isabella: dados pessoais, negociação, parcelas e observação inicial.</p>
      ${isAdmin() ? `<button class="primary-btn" type="button" data-action="new-client">Cadastrar cliente</button>` : `<span>Somente a Isabella consegue cadastrar.</span>`}
    </div>
  `;
}

function filterButton(filter, label) {
  return `<button class="filter-chip ${state.filter === filter ? "active" : ""}" type="button" data-filter="${filter}">${label}</button>`;
}

function renderStorageBanner() {
  if (state.storageMode === "online") {
    return `
      <div class="storage-banner online">
        <strong>Dados online ativos</strong>
        <span>Clientes, parcelas, histórico e documentos ficam compartilhados entre os aparelhos.</span>
      </div>
    `;
  }

  return `
    <div class="storage-banner local">
      <strong>Modo local</strong>
      <span>Configure o Supabase para as 3 pessoas verem os mesmos dados online.</span>
    </div>
  `;
}

function renderClientCard(client) {
  const status = getClientStatus(client);
  const counts = getInstallmentCounts(client);
  const referral = client.hasReferral ? `Indicado por ${escapeHtml(client.referralName || "não informado")}` : "Sem indicação";

  return `
    <article class="client-card">
      <div class="client-top">
        <div>
          <h3>${escapeHtml(client.fullName)}</h3>
          <div class="tag-row">
            <span class="tag ${status.color}">${status.label}</span>
            <span class="tag">${escapeHtml(client.frequency || "Manual")}</span>
          </div>
        </div>
        ${renderRating(client)}
      </div>

      <div class="client-data">
        <div class="data-box"><span>Telefone</span><strong>${escapeHtml(client.phone || "Não informado")}</strong></div>
        <div class="data-box"><span>CPF</span><strong>${escapeHtml(client.cpf || "Não informado")}</strong></div>
        <div class="data-box"><span>Valor emprestado</span><strong>${formatMoney(client.amountBorrowed)}</strong></div>
        <div class="data-box"><span>Valor combinado</span><strong>${formatMoney(client.amountWithInterest)}</strong></div>
        <div class="data-box"><span>Pagou</span><strong>${counts.paid} de ${counts.total}</strong></div>
        <div class="data-box"><span>Faltam pagar</span><strong>${counts.remaining}</strong></div>
      </div>

      <div class="tag-row">
        <span class="tag dark">${referral}</span>
        <span class="tag">Devolução: ${formatDate(client.returnDate)}</span>
      </div>

      <div class="client-actions">
        <button class="ghost-btn" type="button" data-action="open-client" data-id="${client.id}">Abrir</button>
        <button class="ghost-btn" type="button" data-action="whatsapp-client" data-id="${client.id}">WhatsApp</button>
        ${isAdmin() ? `<button class="ghost-btn" type="button" data-action="edit-client" data-id="${client.id}">Editar</button>` : ""}
        <button class="ghost-btn" type="button" data-action="export-client" data-id="${client.id}">Exportar ficha</button>
      </div>
    </article>
  `;
}

function renderClientDetail() {
  const client = findClient(state.selectedClientId);
  if (!client) {
    state.view = "clients";
    render();
    return;
  }

  const status = getClientStatus(client);
  const counts = getInstallmentCounts(client);

  mainContent.innerHTML = `
    <section>
      <div class="page-head">
        <div>
          <span class="eyebrow">Cliente</span>
          <h1>${escapeHtml(client.fullName)}</h1>
          <div class="tag-row">
            <span class="tag ${status.color}">${status.label}</span>
            <span class="tag">Pagou ${counts.paid} de ${counts.total}</span>
            <span class="tag">Faltam ${counts.remaining}</span>
            <span class="tag">${escapeHtml(client.frequency || "Manual")}</span>
          </div>
        </div>
        <div class="page-actions">
          <button class="ghost-btn" type="button" data-action="back-to-clients">Voltar</button>
          <button class="ghost-btn" type="button" data-action="whatsapp-client" data-id="${client.id}">WhatsApp</button>
          ${isAdmin() ? `<button class="primary-btn" type="button" data-action="edit-client" data-id="${client.id}">Editar</button>` : ""}
        </div>
      </div>

      <div class="detail-layout">
        <aside class="panel">
          <h3>Dados principais</h3>
          <div class="info-list">
            ${infoItem("Nota", renderRating(client))}
            ${infoItem("CPF", escapeHtml(client.cpf || "Não informado"))}
            ${infoItem("RG / Documento", escapeHtml(client.rg || "Não informado"))}
            ${infoItem("Telefone", escapeHtml(client.phone || "Não informado"))}
            ${infoItem("Nascimento", formatDate(client.birthDate))}
            ${infoItem("E-mail", escapeHtml(client.email || "Não informado"))}
            ${infoItem("Profissão", escapeHtml(client.occupation || "Não informado"))}
            ${infoItem("Endereço", escapeHtml(client.address || "Não informado"))}
            ${infoItem("Referência", escapeHtml(client.referenceContact || "Não informado"))}
            ${infoItem("Telefone referência", escapeHtml(client.referencePhone || "Não informado"))}
            ${infoItem("Indicação", client.hasReferral ? `Sim - ${escapeHtml(client.referralName || "não informado")}` : "Não")}
            ${infoItem("Data do empréstimo", formatDate(client.loanDate))}
            ${infoItem("Valor emprestado", formatMoney(client.amountBorrowed))}
            ${infoItem("Data de devolução", formatDate(client.returnDate))}
            ${infoItem("Valor com juros", formatMoney(client.amountWithInterest))}
            ${infoItem("Parcelamento", `${counts.total} vez(es)`)}
            ${infoItem("Frequência", escapeHtml(client.frequency || "Manual"))}
          </div>
        </aside>

        <div>
          <div class="tabs">
            ${tabButton("summary", "Resumo")}
            ${tabButton("installments", "Parcelas")}
            ${tabButton("documents", "Documentos")}
            ${tabButton("history", "Histórico")}
          </div>
          <div class="panel">
            ${renderClientTab(client)}
          </div>
        </div>
      </div>
    </section>
  `;
}

function infoItem(label, value) {
  return `<div class="info-item"><span>${label}</span><strong>${value}</strong></div>`;
}

function tabButton(tab, label) {
  return `<button class="tab-btn ${state.selectedTab === tab ? "active" : ""}" type="button" data-tab="${tab}">${label}</button>`;
}

function renderClientTab(client) {
  if (state.selectedTab === "installments") return renderInstallmentsTab(client);
  if (state.selectedTab === "documents") return renderDocumentsTab(client);
  if (state.selectedTab === "history") return renderClientHistoryTab(client);
  return renderSummaryTab(client);
}

function renderSummaryTab(client) {
  const notes = client.notes || [];
  return `
    <div class="notes-box">
      <div>
        <h3>Observações importantes</h3>
        <p class="muted">Tudo que for anotado aqui fica salvo no histórico do cliente.</p>
      </div>
      ${isAdmin() ? `
        <label>
          Nova observação
          <textarea id="quickNote" rows="3" placeholder="Ex: pagou só parte do combinado, prometeu pagar o restante sexta."></textarea>
        </label>
        <div class="inline-actions">
          <button class="primary-btn" type="button" data-action="save-note" data-id="${client.id}">Salvar observação</button>
        </div>
      ` : ""}
      ${notes.length ? notes.map((note) => `
        <div class="note-item">
          <strong>${formatDateTime(note.createdAt)}</strong>
          <p>${escapeHtml(note.text)}</p>
        </div>
      `).join("") : `<div class="empty-state">Nenhuma observação ainda.</div>`}
    </div>
  `;
}

function renderInstallmentsTab(client) {
  const installments = client.installments || [];
  return `
    <div class="page-head" style="margin-bottom:14px">
      <div>
        <h3>Parcelas e pagamentos</h3>
        <p class="muted">Cada parcela tem status, valor manual, histórico e anexo de comprovante.</p>
      </div>
    </div>
    ${installments.length ? `<div class="installment-grid">${installments.map((item, index) => renderInstallmentCard(client, item, index)).join("")}</div>` : `<div class="empty-state">Cliente sem parcelas cadastradas.</div>`}
  `;
}

function renderInstallmentCard(client, item, index) {
  const tag = installmentTag(item.status);
  const receipt = item.receipt ? `<button class="ghost-btn" type="button" data-action="download-receipt" data-client="${client.id}" data-installment="${item.id}">Ver comprovante</button>` : `<span class="tag">Sem comprovante</span>`;
  const lastPayment = (item.payments || []).slice(-2).reverse();

  return `
    <article class="installment-card">
      <div class="installment-head">
        <div>
          <h3>${escapeHtml(item.label || `Parcela ${index + 1}`)}</h3>
          <span class="muted">Prevista para ${formatDate(item.dueDate)}</span>
        </div>
        <span class="tag ${tag.color}">${tag.label}</span>
      </div>
      <div class="installment-values">
        <div class="data-box"><span>Combinado</span><strong>${formatMoney(item.expectedValue)}</strong></div>
        <div class="data-box"><span>Pagou</span><strong>${formatMoney(item.paidValue)}</strong></div>
        <div class="data-box"><span>Pago em</span><strong>${formatDate(item.paidDate)}</strong></div>
      </div>
      <div class="mini-history">
        ${lastPayment.length ? lastPayment.map((payment) => `<span>${formatDateTime(payment.createdAt)} - ${escapeHtml(payment.summary)}</span>`).join("") : `<span>Nenhum pagamento registrado nessa parcela.</span>`}
      </div>
      <div class="inline-actions">
        ${isAdmin() ? `<button class="primary-btn" type="button" data-action="open-payment" data-client="${client.id}" data-installment="${item.id}">Registrar / editar</button>` : ""}
        ${receipt}
      </div>
    </article>
  `;
}

function renderDocumentsTab(client) {
  const docs = client.documents || [];
  return `
    <div class="page-head" style="margin-bottom:14px">
      <div>
        <h3>Documentos do cliente</h3>
        <p class="muted">Arquivos ligados a este devedor: contrato, documento pessoal, comprovante de endereço e outros.</p>
      </div>
      <div class="page-actions">
        ${isAdmin() ? `<button class="primary-btn" type="button" data-action="add-document" data-id="${client.id}">Adicionar documento</button>` : ""}
        <button class="ghost-btn" type="button" data-action="export-client" data-id="${client.id}">Exportar ficha</button>
      </div>
    </div>
    ${docs.length ? `<div class="doc-list">${docs.map((doc) => renderDocumentCard(client, doc)).join("")}</div>` : `<div class="empty-state">Nenhum documento arquivado ainda. A Isabella pode anexar RG, CPF, contrato, comprovante de endereço e comprovantes combinados.</div>`}
  `;
}

function renderDocumentCard(client, doc) {
  return `
    <article class="doc-card">
      <div>
        <strong>${escapeHtml(doc.title)}</strong>
        <span>${escapeHtml(doc.type)} - ${escapeHtml(doc.fileName || "sem arquivo anexado")} - ${formatDateTime(doc.createdAt)}</span>
        ${doc.note ? `<span>${escapeHtml(doc.note)}</span>` : ""}
      </div>
      <div class="inline-actions">
        <button class="ghost-btn" type="button" data-action="download-document" data-client="${client.id}" data-doc="${doc.id}">Abrir</button>
      </div>
    </article>
  `;
}

function renderClientHistoryTab(client) {
  const rows = getClientHistoryRows(client);
  return `
    <h3>Histórico completo</h3>
    <p class="muted">Pagamentos, observações, documentos e alterações ficam registrados aqui.</p>
    ${rows.length ? `<div class="history-list">${rows.map(renderHistoryRow).join("")}</div>` : `<div class="empty-state">Sem histórico ainda. O sistema vai registrar automaticamente cadastro, observações, pagamentos e documentos.</div>`}
  `;
}

function renderDocumentsView() {
  const search = normalizeSearch(state.globalSearch);
  const rows = state.clients
    .filter((client) => clientMatchesSearch(client, search) && matchesClientMonth(client, state.dateFilter))
    .flatMap((client) => (client.documents || []).filter((doc) => matchesMonth(doc.createdAt, state.dateFilter)).map((doc) => ({ client, doc })));

  mainContent.innerHTML = `
    <section>
      <div class="page-head">
        <div>
          <span class="eyebrow">Documentos</span>
          <h1>Arquivos por cliente</h1>
          <p>Aba exclusiva para consultar documentos ligados a cada devedor e exportar a ficha completa.</p>
        </div>
      </div>

      ${renderCommandBar()}

      ${rows.length ? `<div class="doc-list">${rows.map(({ client, doc }) => `
        <article class="doc-card">
          <div>
            <strong>${escapeHtml(doc.title)}</strong>
            <span>${escapeHtml(client.fullName)} - ${escapeHtml(doc.type)} - ${escapeHtml(doc.fileName || "sem arquivo anexado")}</span>
            ${doc.note ? `<span>${escapeHtml(doc.note)}</span>` : ""}
          </div>
          <div class="inline-actions">
            <button class="ghost-btn" type="button" data-action="open-client" data-id="${client.id}">Abrir cliente</button>
            <button class="ghost-btn" type="button" data-action="download-document" data-client="${client.id}" data-doc="${doc.id}">Abrir doc</button>
            <button class="ghost-btn" type="button" data-action="export-client" data-id="${client.id}">Exportar ficha</button>
          </div>
        </article>
      `).join("")}</div>` : `<div class="empty-state actionable"><h3>Nenhum documento cadastrado</h3><p>Depois que a Isabella cadastrar um cliente, ela pode anexar documentos dentro da aba do próprio cliente.</p>${isAdmin() ? `<button class="primary-btn" type="button" data-action="new-client">Cadastrar cliente</button>` : `<span>Somente a Isabella consegue cadastrar e anexar.</span>`}</div>`}
    </section>
  `;
}

function renderHistoryView() {
  const search = normalizeSearch(state.globalSearch);
  const rows = state.clients
    .filter((client) => clientMatchesSearch(client, search) && matchesClientMonth(client, state.dateFilter))
    .flatMap((client) => getClientHistoryRows(client).map((row) => ({ ...row, clientName: client.fullName })))
    .filter((row) => matchesMonth(row.createdAt, state.dateFilter))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  mainContent.innerHTML = `
    <section>
      <div class="page-head">
        <div>
          <span class="eyebrow">Histórico geral</span>
          <h1>Movimentações do sistema</h1>
          <p>Veja pagamentos, observações e documentos de todos os clientes.</p>
        </div>
      </div>
      ${renderCommandBar()}
      ${rows.length ? `<div class="history-list">${rows.map(renderHistoryRow).join("")}</div>` : `<div class="empty-state">Sem histórico registrado. Quando a Isabella cadastrar clientes, notas, documentos ou pagamentos, tudo aparece aqui.</div>`}
    </section>
  `;
}

function renderHistoryRow(row) {
  const kind = getHistoryKind(row);
  return `
    <article class="history-row timeline-row ${kind}">
      <span class="timeline-dot"></span>
      <div>
        <div class="history-head">
          <strong>${row.clientName ? `${escapeHtml(row.clientName)} - ` : ""}${escapeHtml(row.title)}</strong>
          <span>${formatDateTime(row.createdAt)}</span>
        </div>
        <p>${escapeHtml(row.text || "")}</p>
      </div>
    </article>
  `;
}

function getHistoryKind(row) {
  const text = `${row.title || ""} ${row.text || ""}`.toLowerCase();
  if (text.includes("pagamento")) return "payment";
  if (text.includes("documento")) return "document";
  if (text.includes("atras") || text.includes("devendo") || text.includes("parcial")) return "risk";
  if (text.includes("observa")) return "note";
  return "default";
}

function handleMainClick(event) {
  const filter = event.target.closest("[data-filter]");
  if (filter) {
    state.filter = filter.dataset.filter;
    render();
    return;
  }

  const tab = event.target.closest("[data-tab]");
  if (tab) {
    state.selectedTab = tab.dataset.tab;
    render();
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;

  const action = actionButton.dataset.action;
  const id = actionButton.dataset.id;
  const adminActions = new Set(["new-client", "edit-client", "save-note", "open-payment", "add-document"]);

  if (adminActions.has(action) && !requireAdmin()) {
    return;
  }

  if (action === "new-client") openClientDialog();
  if (action === "edit-client") openClientDialog(id);
  if (action === "open-client") openClient(id);
  if (action === "back-to-clients") navigate("clients");
  if (action === "go-history") navigate("history");
  if (action === "save-note") saveQuickNote(id);
  if (action === "open-payment") openPaymentDialog(actionButton.dataset.client, actionButton.dataset.installment);
  if (action === "add-document") openDocumentDialog(id);
  if (action === "download-document") downloadDocument(actionButton.dataset.client, actionButton.dataset.doc);
  if (action === "download-receipt") downloadReceipt(actionButton.dataset.client, actionButton.dataset.installment);
  if (action === "export-client") exportClient(id);
  if (action === "export-all-csv") exportAllCsv();
  if (action === "export-all-pdf") exportAllPdf();
  if (action === "whatsapp-client") openWhatsApp(id);
  if (action === "clear-filters") {
    state.search = "";
    state.globalSearch = "";
    state.dateFilter = "";
    render();
  }
}

function handleMainInput(event) {
  if (event.target.id === "searchClients") {
    state.search = event.target.value;
    render();
  }
  if (event.target.id === "globalSearch") {
    state.globalSearch = event.target.value;
    render();
  }
  if (event.target.id === "dateFilter") {
    state.dateFilter = event.target.value;
    render();
  }
}

function requireAdmin() {
  if (isAdmin()) return true;
  showToast("Modo visualização: esse usuário só pode consultar dados.");
  return false;
}

function openClient(id) {
  state.selectedClientId = id;
  state.selectedTab = "summary";
  state.view = "detail";
  render();
  mainContent.focus();
}

function openClientDialog(id) {
  if (!isAdmin()) {
    showToast("Esse perfil é somente leitura.");
    return;
  }

  const client = id ? findClient(id) : null;
  $("#clientDialogTitle").textContent = client ? "Editar cliente" : "Novo cliente";
  $("#clientId").value = client?.id || "";
  $("#fullName").value = client?.fullName || "";
  $("#cpf").value = client?.cpf || "";
  $("#rg").value = client?.rg || "";
  $("#phone").value = client?.phone || "";
  $("#birthDate").value = client?.birthDate || "";
  $("#email").value = client?.email || "";
  $("#occupation").value = client?.occupation || "";
  $("#address").value = client?.address || "";
  $("#referenceContact").value = client?.referenceContact || "";
  $("#referencePhone").value = client?.referencePhone || "";
  $("#hasReferral").value = client?.hasReferral ? "sim" : "nao";
  $("#referralName").value = client?.referralName || "";
  $("#loanDate").value = client?.loanDate || today();
  $("#amountBorrowed").value = client?.amountBorrowed || "";
  $("#returnDate").value = client?.returnDate || today();
  $("#amountWithInterest").value = client?.amountWithInterest || "";
  $("#installmentEnabled").value = Number(client?.installmentsTotal || 1) > 1 ? "sim" : "nao";
  $("#installmentsTotal").value = client?.installmentsTotal || 1;
  $("#frequency").value = client?.frequency || "Mensal";
  $("#loanState").value = client?.loanState || "active";
  $("#clientNote").value = "";

  showDialog("clientDialog");
}

async function handleClientSubmit(event) {
  event.preventDefault();
  if (!isAdmin()) return;

  const id = $("#clientId").value || createId();
  const existing = findClient(id);
  const isNew = !existing;
  const total = $("#installmentEnabled").value === "nao" ? 1 : Math.max(1, Number($("#installmentsTotal").value || 1));

  const client = existing || {
    id,
    createdAt: nowIso(),
    documents: [],
    notes: [],
    history: [],
    installments: []
  };

  client.fullName = $("#fullName").value.trim();
  client.cpf = $("#cpf").value.trim();
  client.rg = $("#rg").value.trim();
  client.phone = $("#phone").value.trim();
  client.birthDate = $("#birthDate").value;
  client.email = $("#email").value.trim();
  client.occupation = $("#occupation").value.trim();
  client.address = $("#address").value.trim();
  client.referenceContact = $("#referenceContact").value.trim();
  client.referencePhone = $("#referencePhone").value.trim();
  client.hasReferral = $("#hasReferral").value === "sim";
  client.referralName = $("#referralName").value.trim();
  client.loanDate = $("#loanDate").value;
  client.amountBorrowed = $("#amountBorrowed").value.trim();
  client.returnDate = $("#returnDate").value;
  client.amountWithInterest = $("#amountWithInterest").value.trim();
  client.installmentsTotal = total;
  client.frequency = total === 1 ? "Pagamento único" : $("#frequency").value;
  client.loanState = $("#loanState").value;
  client.updatedAt = nowIso();
  client.installments = reconcileInstallments(client.installments, total, client.frequency, client.returnDate);

  const note = $("#clientNote").value.trim();
  if (note) addNote(client, note);

  addHistory(client, isNew ? "Cliente criado" : "Dados atualizados", isNew ? "Cadastro inicial do cliente." : "Informações principais do cliente foram alteradas.");

  if (isNew) {
    state.clients.unshift(client);
  }

  await saveClients();
  closeDialog("clientDialog");
  state.selectedClientId = client.id;
  state.view = "detail";
  render();
  showToast("Cliente salvo.");
}

function openPaymentDialog(clientId, installmentId) {
  if (!isAdmin()) {
    showToast("Esse perfil é somente leitura.");
    return;
  }

  const client = findClient(clientId);
  const installment = client?.installments?.find((item) => item.id === installmentId);
  if (!client || !installment) return;

  $("#paymentDialogTitle").textContent = `${installment.label} - ${client.fullName}`;
  $("#paymentClientId").value = clientId;
  $("#paymentInstallmentId").value = installmentId;
  $("#installmentDueDate").value = installment.dueDate || "";
  $("#installmentStatus").value = installment.status || "pending";
  $("#installmentExpected").value = installment.expectedValue || "";
  $("#installmentPaid").value = installment.paidValue || "";
  $("#installmentPaidDate").value = installment.paidDate || "";
  $("#receiptFile").value = "";
  $("#paymentNote").value = "";
  showDialog("paymentDialog");
}

async function handlePaymentSubmit(event) {
  event.preventDefault();
  if (!isAdmin()) return;

  const client = findClient($("#paymentClientId").value);
  const installment = client?.installments?.find((item) => item.id === $("#paymentInstallmentId").value);
  if (!client || !installment) return;

  installment.dueDate = $("#installmentDueDate").value;
  installment.status = $("#installmentStatus").value;
  installment.expectedValue = $("#installmentExpected").value.trim();
  installment.paidValue = $("#installmentPaid").value.trim();
  installment.paidDate = $("#installmentPaidDate").value;

  const file = $("#receiptFile").files[0];
  if (file) {
    installment.receipt = await fileToStoredFile(file, `${client.id}/receipts/${installment.id}`);
  }

  const note = $("#paymentNote").value.trim();
  const statusText = installmentTag(installment.status).label;
  const summary = `${statusText}. Pagou ${formatMoney(installment.paidValue)} de ${formatMoney(installment.expectedValue)}.${note ? ` ${note}` : ""}`;

  installment.payments = installment.payments || [];
  installment.payments.push({
    id: createId(),
    createdAt: nowIso(),
    paymentDate: installment.paidDate,
    status: installment.status,
    expectedValue: installment.expectedValue,
    paidValue: installment.paidValue,
    note,
    receiptName: installment.receipt?.fileName || "",
    summary
  });

  addHistory(client, `Pagamento atualizado - ${installment.label}`, summary);
  client.updatedAt = nowIso();
  await saveClients();
  closeDialog("paymentDialog");
  render();
  showToast("Pagamento salvo no histórico.");
}

function openDocumentDialog(clientId) {
  if (!isAdmin()) {
    showToast("Esse perfil é somente leitura.");
    return;
  }

  $("#documentClientId").value = clientId;
  $("#documentTitle").value = "";
  $("#documentType").value = "Documento pessoal";
  $("#documentFile").value = "";
  $("#documentNote").value = "";
  showDialog("documentDialog");
}

async function handleDocumentSubmit(event) {
  event.preventDefault();
  if (!isAdmin()) return;

  const client = findClient($("#documentClientId").value);
  if (!client) return;

  const file = $("#documentFile").files[0];
  const storedFile = file ? await fileToStoredFile(file, `${client.id}/documents`) : null;
  const doc = {
    id: createId(),
    title: $("#documentTitle").value.trim(),
    type: $("#documentType").value,
    note: $("#documentNote").value.trim(),
    createdAt: nowIso(),
    fileName: storedFile?.fileName || "",
    mime: storedFile?.mime || "",
    dataUrl: storedFile?.dataUrl || "",
    path: storedFile?.path || "",
    provider: storedFile?.provider || ""
  };

  client.documents = client.documents || [];
  client.documents.unshift(doc);
  addHistory(client, "Documento adicionado", `${doc.title} (${doc.type}) foi arquivado no cliente.`);
  await saveClients();
  closeDialog("documentDialog");
  render();
  showToast("Documento salvo.");
}

async function saveQuickNote(clientId) {
  if (!isAdmin()) return;
  const client = findClient(clientId);
  const textarea = $("#quickNote");
  const note = textarea?.value.trim();
  if (!client || !note) {
    showToast("Digite uma observação antes de salvar.");
    return;
  }

  addNote(client, note);
  addHistory(client, "Observação adicionada", note);
  client.updatedAt = nowIso();
  await saveClients();
  render();
  showToast("Observação salva.");
}

function addNote(client, text) {
  client.notes = client.notes || [];
  client.notes.unshift({
    id: createId(),
    text,
    createdAt: nowIso()
  });
}

function addHistory(client, title, text) {
  client.history = client.history || [];
  client.history.unshift({
    id: createId(),
    title,
    text,
    createdAt: nowIso()
  });
}

function getClientHistoryRows(client) {
  return (client.history || [])
    .map((row) => ({ ...row }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function reconcileInstallments(existing = [], total, frequency, firstDueDate) {
  const result = [];
  for (let index = 0; index < total; index += 1) {
    const old = existing[index] || {};
    result.push({
      id: old.id || createId(),
      label: total === 1 ? "Pagamento único" : `Parcela ${index + 1}`,
      dueDate: old.dueDate || getDueDate(firstDueDate, frequency, index),
      expectedValue: old.expectedValue || "",
      paidValue: old.paidValue || "",
      paidDate: old.paidDate || "",
      status: old.status || "pending",
      receipt: old.receipt || null,
      payments: old.payments || []
    });
  }
  return result;
}

function getDueDate(firstDueDate, frequency, index) {
  if (!firstDueDate) return "";
  const date = new Date(`${firstDueDate}T12:00:00`);

  if (frequency === "Diário") date.setDate(date.getDate() + index);
  if (frequency === "Semanal") date.setDate(date.getDate() + index * 7);
  if (frequency === "Quinzenal") date.setDate(date.getDate() + index * 15);
  if (frequency === "Mensal") date.setMonth(date.getMonth() + index);

  return date.toISOString().slice(0, 10);
}

function getGlobalSearchResults() {
  const search = normalizeSearch(state.globalSearch);
  if (!search) return [];
  return state.clients.filter((client) => clientMatchesSearch(client, search));
}

function getDateScopedClients() {
  return state.clients.filter((client) => matchesClientMonth(client, state.dateFilter));
}

function getFilteredClients() {
  const localSearch = normalizeSearch(state.search);
  const globalSearch = normalizeSearch(state.globalSearch);
  return state.clients.filter((client) => {
    const status = getClientStatus(client).key;
    const matchesFilter = state.filter === "all" || state.filter === status;
    return matchesFilter && clientMatchesSearch(client, localSearch) && clientMatchesSearch(client, globalSearch) && matchesClientMonth(client, state.dateFilter);
  });
}

function clientMatchesSearch(client, search) {
  if (!search) return true;
  return [
    client.fullName,
    client.referralName,
    client.cpf,
    client.rg,
    client.phone,
    client.email,
    client.address,
    client.occupation,
    client.referenceContact,
    client.referencePhone
  ].some((value) => normalizeSearch(value).includes(search));
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchesClientMonth(client, month) {
  if (!month) return true;
  if (matchesMonth(client.loanDate, month) || matchesMonth(client.returnDate, month) || matchesMonth(client.createdAt, month) || matchesMonth(client.updatedAt, month)) return true;
  if ((client.installments || []).some((item) => matchesMonth(item.dueDate, month) || matchesMonth(item.paidDate, month) || (item.payments || []).some((payment) => matchesMonth(payment.createdAt, month) || matchesMonth(payment.paymentDate, month)))) return true;
  if ((client.history || []).some((row) => matchesMonth(row.createdAt, month))) return true;
  return (client.documents || []).some((doc) => matchesMonth(doc.createdAt, month));
}

function matchesMonth(value, month) {
  if (!month) return true;
  if (!value) return false;
  return String(value).slice(0, 7) === month;
}

function getStats(clients = state.clients) {
  return clients.reduce((acc, client) => {
    const status = getClientStatus(client).key;
    if (status === "paid") acc.paid += 1;
    if (status === "late") acc.late += 1;
    if (status === "on-time" || status === "late") acc.active += 1;
    if (status === "inactive") acc.inactive += 1;
    return acc;
  }, { active: 0, late: 0, paid: 0, inactive: 0 });
}

function getClientStatus(client) {
  const counts = getInstallmentCounts(client);
  if (client.loanState === "none") return { key: "inactive", label: "Sem empréstimo", color: "" };
  if (client.loanState === "paid" || (counts.total > 0 && counts.paid >= counts.total)) return { key: "paid", label: "Quitado", color: "gold" };
  if (counts.late > 0 || counts.partial > 0) return { key: "late", label: "Devendo", color: "red" };
  return { key: "on-time", label: "Em dia", color: "dark" };
}

function getInstallmentCounts(client) {
  const installments = client.installments || [];
  const total = installments.length || Number(client.installmentsTotal || 0);
  const paid = installments.filter((item) => item.status === "paid").length;
  const partial = installments.filter((item) => item.status === "partial").length;
  const late = installments.filter((item) => item.status === "late").length;
  return {
    total,
    paid,
    partial,
    late,
    remaining: Math.max(0, total - paid)
  };
}

function getFinancialSummary(clients = state.clients) {
  return clients.reduce((acc, client) => {
    const borrowed = parseMoneyValue(client.amountBorrowed);
    const expected = parseMoneyValue(client.amountWithInterest);
    const received = getClientReceivedTotal(client);
    const pending = getClientPendingTotal(client);
    acc.borrowed += borrowed;
    acc.expected += expected;
    acc.received += received;
    acc.pending += pending;
    return acc;
  }, { borrowed: 0, expected: 0, received: 0, pending: 0 });
}

function getClientReceivedTotal(client) {
  return (client.installments || []).reduce((sum, item) => sum + parseMoneyValue(item.paidValue), 0);
}

function getClientPendingTotal(client) {
  if (client.loanState === "paid") return 0;
  const installments = client.installments || [];
  if (installments.length) {
    return installments.reduce((sum, item) => {
      const expected = parseMoneyValue(item.expectedValue);
      const paid = parseMoneyValue(item.paidValue);
      return sum + Math.max(0, expected - paid);
    }, 0);
  }
  return Math.max(0, parseMoneyValue(client.amountWithInterest) - getClientReceivedTotal(client));
}

function getDueAlerts(clients = state.clients) {
  const todayDate = startOfDay(new Date());
  const weekLimit = new Date(todayDate);
  weekLimit.setDate(weekLimit.getDate() + 7);
  const alerts = { today: [], week: [], overdue: [] };

  clients.forEach((client) => {
    (client.installments || []).forEach((installment) => {
      if (!installment.dueDate || installment.status === "paid") return;
      const dueDate = startOfDay(new Date(`${installment.dueDate}T12:00:00`));
      const row = { client, installment, dueDate };
      if (dueDate < todayDate) alerts.overdue.push(row);
      else if (dueDate.getTime() === todayDate.getTime()) alerts.today.push(row);
      else if (dueDate <= weekLimit) alerts.week.push(row);
    });
  });

  Object.values(alerts).forEach((rows) => rows.sort((a, b) => a.dueDate - b.dueDate));
  return alerts;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function installmentTag(status) {
  const map = {
    paid: { label: "Pago", color: "gold" },
    partial: { label: "Parcial", color: "amber" },
    late: { label: "Devendo", color: "red" },
    pending: { label: "Pendente", color: "" }
  };
  return map[status] || map.pending;
}

function renderRating(client) {
  const rating = getRating(client);
  const stars = Array.from({ length: 5 }, (_, index) => `<span class="${index < rating.score ? "filled" : ""}">★</span>`).join("");
  return `<button class="rating-button" type="button" data-rating-client="${client.id}" aria-label="Nota ${rating.score} de 5"><span class="rating">${stars}</span>${help("Nota calculada pelo histórico: bons pagamentos sobem a nota; atrasos e pagamentos parciais baixam.")}</button>`;
}

function getRating(client) {
  const installments = client.installments || [];
  const paid = installments.filter((item) => item.status === "paid").length;
  const partial = installments.filter((item) => item.status === "partial").length;
  const late = installments.filter((item) => item.status === "late").length;
  const pending = installments.filter((item) => item.status === "pending").length;
  let score = 3;

  score += Math.min(2, paid * 0.55);
  score -= late * 1.1;
  score -= partial * 0.7;
  if (client.loanState === "paid") score += 1;
  if (client.loanState === "none" && paid === 0) score = 3;

  score = Math.max(0, Math.min(5, Math.round(score)));

  const reasons = [];
  if (paid) reasons.push(`${paid} pagamento(s) marcado(s) como pago.`);
  if (late) reasons.push(`${late} parcela(s) em atraso/devendo.`);
  if (partial) reasons.push(`${partial} pagamento(s) parcial(is).`);
  if (pending) reasons.push(`${pending} parcela(s) pendente(s).`);
  if (client.loanState === "paid") reasons.push("Contrato marcado como quitado.");
  if (!reasons.length) reasons.push("Cliente ainda tem pouco histórico de pagamento.");

  return { score, reasons };
}

function handleRatingHover(event) {
  const button = event.target.closest("[data-rating-client]");
  if (!button) return;
  showRatingPopover(button, button.dataset.ratingClient);
}

function handleRatingOut(event) {
  const button = event.target.closest("[data-rating-client]");
  if (!button) return;
  if (event.relatedTarget && ratingPopover.contains(event.relatedTarget)) return;
  ratingPopover.hidden = true;
}

function handleOutsideClick(event) {
  const ratingButton = event.target.closest("[data-rating-client]");
  if (ratingButton) {
    showRatingPopover(ratingButton, ratingButton.dataset.ratingClient);
    return;
  }
  if (!ratingPopover.contains(event.target)) ratingPopover.hidden = true;
}

function showRatingPopover(anchor, clientId) {
  const client = findClient(clientId);
  if (!client) return;
  const rating = getRating(client);
  const rect = anchor.getBoundingClientRect();

  ratingPopover.innerHTML = `
    <strong>Nota ${rating.score} de 5</strong>
    <ul>${rating.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
  `;
  ratingPopover.style.left = `${Math.min(window.innerWidth - 332, Math.max(12, rect.left))}px`;
  ratingPopover.style.top = `${Math.min(window.innerHeight - 220, rect.bottom + 8)}px`;
  ratingPopover.hidden = false;
}

async function downloadDocument(clientId, docId) {
  const client = findClient(clientId);
  const doc = client?.documents?.find((item) => item.id === docId);
  await downloadStoredFile(doc, doc?.fileName || doc?.title || "documento");
}

async function downloadReceipt(clientId, installmentId) {
  const client = findClient(clientId);
  const installment = client?.installments?.find((item) => item.id === installmentId);
  await downloadStoredFile(installment?.receipt, installment?.receipt?.fileName || "comprovante");
  return;
  if (!installment?.receipt?.dataUrl) {
    showToast("Essa parcela não tem comprovante anexado.");
    return;
  }
  downloadDataUrl(installment.receipt.dataUrl, installment.receipt.fileName || "comprovante");
}

function downloadDataUrl(dataUrl, fileName) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function downloadStoredFile(file, fallbackName) {
  if (!file) {
    showToast("Esse registro não tem arquivo anexado.");
    return;
  }

  if (file.dataUrl) {
    downloadDataUrl(file.dataUrl, file.fileName || fallbackName);
    return;
  }

  if (!file.path || state.storageMode !== "online" || !supabaseClient) {
    showToast("Arquivo online indisponível neste momento.");
    return;
  }

  const { data, error } = await supabaseClient
    .storage
    .from(getSupabaseBucket())
    .download(file.path);

  if (error) {
    console.error("Erro ao baixar arquivo:", error);
    showToast("Não consegui baixar esse arquivo.");
    return;
  }

  const objectUrl = URL.createObjectURL(data);
  downloadDataUrl(objectUrl, file.fileName || fallbackName);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function getStoredFileHref(file) {
  if (!file) return "";
  if (file.dataUrl) return file.dataUrl;
  if (!file.path || state.storageMode !== "online" || !supabaseClient) return "";

  const { data, error } = await supabaseClient
    .storage
    .from(getSupabaseBucket())
    .createSignedUrl(file.path, 60 * 60);

  if (error) {
    console.error("Erro ao criar link temporário:", error);
    return "";
  }

  return data?.signedUrl || "";
}

async function exportClient(id) {
  const client = findClient(id);
  if (!client) return;
  const counts = getInstallmentCounts(client);
  const status = getClientStatus(client);
  const docs = await Promise.all((client.documents || []).map(async (doc) => ({
    ...doc,
    href: await getStoredFileHref(doc)
  })));
  const rows = getClientHistoryRows(client);

  const printHtml = `
    <!doctype html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Ficha - ${escapeHtml(client.fullName)}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #1d1b17; margin: 32px; }
        h1 { margin-bottom: 4px; }
        h2 { margin-top: 28px; border-bottom: 1px solid #ddd3c2; padding-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        td, th { border-bottom: 1px solid #ddd3c2; padding: 9px; text-align: left; vertical-align: top; }
        .tag { display: inline-block; border-radius: 999px; padding: 4px 8px; background: #f3e8cc; font-weight: bold; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
        .box { border: 1px solid #ddd3c2; border-radius: 8px; padding: 12px; }
        .muted { color: #746f62; }
        @media print { body { margin: 20px; } a { color: #1d1b17; } }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(client.fullName)}</h1>
      <div class="tag">${status.label}</div>
      <p class="muted">Ficha exportada com dados pessoais, parcelas, documentos e histórico.</p>

      <h2>Dados pessoais e empréstimo</h2>
      <div class="grid">
        <div class="box"><b>CPF:</b><br>${escapeHtml(client.cpf || "Não informado")}</div>
        <div class="box"><b>RG / Documento:</b><br>${escapeHtml(client.rg || "Não informado")}</div>
        <div class="box"><b>Telefone:</b><br>${escapeHtml(client.phone || "Não informado")}</div>
        <div class="box"><b>Data de nascimento:</b><br>${formatDate(client.birthDate)}</div>
        <div class="box"><b>E-mail:</b><br>${escapeHtml(client.email || "Não informado")}</div>
        <div class="box"><b>Profissão:</b><br>${escapeHtml(client.occupation || "Não informado")}</div>
        <div class="box"><b>Endereço:</b><br>${escapeHtml(client.address || "Não informado")}</div>
        <div class="box"><b>Referência:</b><br>${escapeHtml(client.referenceContact || "Não informado")} ${client.referencePhone ? `- ${escapeHtml(client.referencePhone)}` : ""}</div>
        <div class="box"><b>Indicação:</b><br>${client.hasReferral ? `Sim - ${escapeHtml(client.referralName || "não informado")}` : "Não"}</div>
        <div class="box"><b>Data do empréstimo:</b><br>${formatDate(client.loanDate)}</div>
        <div class="box"><b>Valor emprestado:</b><br>${formatMoney(client.amountBorrowed)}</div>
        <div class="box"><b>Valor com juros:</b><br>${formatMoney(client.amountWithInterest)}</div>
        <div class="box"><b>Data de devolução:</b><br>${formatDate(client.returnDate)}</div>
        <div class="box"><b>Parcelas:</b><br>${counts.paid} pagas, ${counts.remaining} faltando, ${counts.total} no total</div>
        <div class="box"><b>Frequência:</b><br>${escapeHtml(client.frequency || "Manual")}</div>
        <div class="box"><b>Nota do pagador:</b><br>${getRating(client).score} de 5 estrelas</div>
      </div>

      <h2>Parcelas</h2>
      <table>
        <thead><tr><th>Parcela</th><th>Data</th><th>Status</th><th>Combinado</th><th>Pago</th><th>Comprovante</th></tr></thead>
        <tbody>
          ${(client.installments || []).map((item) => `<tr><td>${escapeHtml(item.label)}</td><td>${formatDate(item.dueDate)}</td><td>${installmentTag(item.status).label}</td><td>${formatMoney(item.expectedValue)}</td><td>${formatMoney(item.paidValue)}</td><td>${item.receipt?.fileName || "Sem anexo"}</td></tr>`).join("")}
        </tbody>
      </table>

      <h2>Documentos</h2>
      ${docs.length ? `<table><thead><tr><th>Nome</th><th>Tipo</th><th>Arquivo</th><th>Observação</th></tr></thead><tbody>${docs.map((doc) => `<tr><td>${escapeHtml(doc.title)}</td><td>${escapeHtml(doc.type)}</td><td>${doc.href ? `<a href="${doc.href}" download="${escapeHtml(doc.fileName || doc.title)}">${escapeHtml(doc.fileName || "Abrir arquivo")}</a>` : escapeHtml(doc.fileName || "Sem arquivo")}</td><td>${escapeHtml(doc.note || "")}</td></tr>`).join("")}</tbody></table>` : `<p>Nenhum documento arquivado.</p>`}

      <h2>Observações</h2>
      ${(client.notes || []).length ? (client.notes || []).map((note) => `<p><b>${formatDateTime(note.createdAt)}</b><br>${escapeHtml(note.text)}</p>`).join("") : `<p>Nenhuma observação.</p>`}

      <h2>Histórico</h2>
      ${rows.length ? rows.map((row) => `<p><b>${formatDateTime(row.createdAt)} - ${escapeHtml(row.title)}</b><br>${escapeHtml(row.text || "")}</p>`).join("") : `<p>Sem histórico.</p>`}
    </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (!win) {
    showToast("Permita pop-ups para exportar a ficha.");
    return;
  }
  win.document.write(printHtml);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
}

function exportAllCsv() {
  const clients = getFilteredClients();
  const rows = [
    ["Nome", "CPF", "Telefone", "Status", "Valor emprestado", "Valor combinado", "Recebido", "Pendente", "Data emprestimo", "Data devolucao", "Parcelas pagas", "Parcelas faltando", "Frequencia", "Indicacao"]
  ];

  clients.forEach((client) => {
    const status = getClientStatus(client);
    const counts = getInstallmentCounts(client);
    rows.push([
      client.fullName || "",
      client.cpf || "",
      client.phone || "",
      status.label,
      parseMoneyValue(client.amountBorrowed),
      parseMoneyValue(client.amountWithInterest),
      getClientReceivedTotal(client),
      getClientPendingTotal(client),
      formatDate(client.loanDate),
      formatDate(client.returnDate),
      counts.paid,
      counts.remaining,
      client.frequency || "",
      client.hasReferral ? client.referralName || "Sim" : "NÃ£o"
    ]);
  });

  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\n");
  downloadTextFile(`backup-clientes-${today()}.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
}

function exportAllPdf() {
  const clients = getFilteredClients();
  const finance = getFinancialSummary(clients);
  const rows = clients.map((client) => {
    const status = getClientStatus(client);
    const counts = getInstallmentCounts(client);
    return `
      <tr>
        <td>${escapeHtml(client.fullName || "")}</td>
        <td>${escapeHtml(client.cpf || "")}</td>
        <td>${escapeHtml(client.phone || "")}</td>
        <td>${escapeHtml(status.label)}</td>
        <td>${formatMoney(client.amountBorrowed)}</td>
        <td>${formatMoney(client.amountWithInterest)}</td>
        <td>${formatMoney(getClientReceivedTotal(client))}</td>
        <td>${formatMoney(getClientPendingTotal(client))}</td>
        <td>${counts.paid} pagas / ${counts.remaining} faltando</td>
      </tr>
    `;
  }).join("");

  const printHtml = `
    <!doctype html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Backup geral - GestÃ£o Isabella & Romildo</title>
      <style>
        body { font-family: Arial, sans-serif; color: #1d1b17; margin: 28px; }
        h1 { margin-bottom: 6px; }
        .muted { color: #746f62; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
        .box { border: 1px solid #ddd3c2; border-radius: 8px; padding: 10px; background: #fffdf8; }
        .box span { display: block; color: #746f62; font-size: 12px; }
        .box strong { display: block; margin-top: 4px; font-size: 17px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
        th, td { border-bottom: 1px solid #ddd3c2; padding: 8px; text-align: left; vertical-align: top; }
        th { background: #f3e8cc; }
      </style>
    </head>
    <body>
      <h1>Backup geral - GestÃ£o Isabella & Romildo</h1>
      <p class="muted">Exportado em ${formatDateTime(nowIso())}. Filtro de mÃªs: ${state.dateFilter || "todos"}.</p>
      <div class="grid">
        <div class="box"><span>Total emprestado</span><strong>${formatMoney(finance.borrowed)}</strong></div>
        <div class="box"><span>Total combinado</span><strong>${formatMoney(finance.expected)}</strong></div>
        <div class="box"><span>Total recebido</span><strong>${formatMoney(finance.received)}</strong></div>
        <div class="box"><span>Total pendente</span><strong>${formatMoney(finance.pending)}</strong></div>
      </div>
      <table>
        <thead><tr><th>Cliente</th><th>CPF</th><th>Telefone</th><th>Status</th><th>Emprestado</th><th>Combinado</th><th>Recebido</th><th>Pendente</th><th>Parcelas</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="9">Nenhum cliente encontrado.</td></tr>`}</tbody>
      </table>
    </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (!win) {
    showToast("Permita pop-ups para gerar o backup em PDF.");
    return;
  }
  win.document.write(printHtml);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
}

function csvCell(value) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

function downloadTextFile(fileName, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openWhatsApp(id) {
  const client = findClient(id);
  if (!client) return;
  const phone = normalizePhone(client.phone);
  if (!phone) {
    showToast("Esse cliente nÃ£o tem telefone cadastrado.");
    return;
  }

  const next = getNextOpenInstallment(client);
  const pending = getClientPendingTotal(client);
  const message = [
    `OlÃ¡, ${client.fullName}.`,
    next ? `Passando para lembrar sobre ${next.label}, prevista para ${formatDate(next.dueDate)}.` : "Passando para falar sobre seu acordo.",
    pending > 0 ? `Valor pendente registrado: ${formatMoney(pending)}.` : "",
    "Qualquer coisa me chama por aqui."
  ].filter(Boolean).join(" ");

  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

function getNextOpenInstallment(client) {
  return (client.installments || [])
    .filter((item) => item.status !== "paid")
    .sort((a, b) => new Date(`${a.dueDate || "9999-12-31"}T12:00:00`) - new Date(`${b.dueDate || "9999-12-31"}T12:00:00`))[0] || null;
}

function showDialog(id) {
  const dialog = $(`#${id}`);
  if (dialog.showModal) dialog.showModal();
  else dialog.setAttribute("open", "open");
}

function closeDialog(id) {
  const dialog = $(`#${id}`);
  if (dialog.close) dialog.close();
  else dialog.removeAttribute("open");
}

async function setupRemoteStorage() {
  const config = window.SISTEMA_EMPRESTIMOS_CONFIG || {};
  const hasConfig = config.supabaseUrl &&
    config.supabaseAnonKey &&
    !config.supabaseUrl.includes("COLE_AQUI") &&
    !config.supabaseAnonKey.includes("COLE_AQUI") &&
    /^https?:\/\//.test(config.supabaseUrl);

  if (!hasConfig) {
    state.storageMode = "local";
    state.storageReady = false;
    return;
  }

  if (!window.supabase) {
    try {
      await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
    } catch (error) {
      console.error("Não consegui carregar o Supabase:", error);
      state.storageMode = "local";
      state.storageReady = false;
      return;
    }
  }

  try {
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    state.storageMode = "online";
    state.storageReady = true;
  } catch (error) {
    console.error("Configuração do Supabase inválida:", error);
    supabaseClient = null;
    state.storageMode = "local";
    state.storageReady = false;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function getSupabaseTable() {
  return window.SISTEMA_EMPRESTIMOS_CONFIG?.stateTable || "dashboard_state";
}

function getSupabaseBucket() {
  return window.SISTEMA_EMPRESTIMOS_CONFIG?.storageBucket || "client-files";
}

async function fileToStoredFile(file, folder = "files") {
  if (state.storageMode === "online" && supabaseClient) {
    const filePath = `${folder}/${createId()}-${sanitizeFileName(file.name)}`;
    const { error } = await supabaseClient
      .storage
      .from(getSupabaseBucket())
      .upload(filePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: true
      });

    if (error) {
      console.error("Erro ao enviar arquivo ao Supabase:", error);
      showToast("Não consegui enviar o arquivo ao armazenamento online.");
      throw error;
    }

    return {
      fileName: file.name,
      mime: file.type,
      path: filePath,
      provider: "supabase"
    };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      fileName: file.name,
      mime: file.type,
      dataUrl: reader.result,
      provider: "local"
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function loadClients() {
  if (state.storageMode === "online" && supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from(getSupabaseTable())
        .select("data")
        .eq("id", DEFAULT_STATE_ID)
        .maybeSingle();

      if (error) throw error;

      if (data?.data) {
        const onlineClients = Array.isArray(data.data) ? data.data : data.data.clients;
        if (Array.isArray(onlineClients)) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(onlineClients));
          return onlineClients;
        }
      }

      const initialClients = readLocalClients() || [];
      await writeOnlineClients(initialClients);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initialClients));
      return initialClients;
    } catch (error) {
      console.error("Erro ao carregar Supabase. Usando modo local:", error);
      state.storageMode = "local";
      state.storageReady = false;
    }
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (error) {
      console.warn("Dados locais inválidos, iniciando vazio.", error);
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
  return [];
}

async function saveClients(clients = state.clients) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));

  if (state.storageMode !== "online" || !supabaseClient) return;

  try {
    await writeOnlineClients(clients);
  } catch (error) {
    console.error("Erro ao salvar no Supabase:", error);
    showToast("Salvei neste navegador, mas não consegui sincronizar online.");
  }
}

function readLocalClients() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

async function writeOnlineClients(clients) {
  const payload = {
    clients,
    updatedAt: nowIso()
  };

  const { error } = await supabaseClient
    .from(getSupabaseTable())
    .upsert({
      id: DEFAULT_STATE_ID,
      data: payload,
      updated_at: nowIso()
    }, { onConflict: "id" });

  if (error) throw error;
}

function loadSession() {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

function legacyDemoClients() {
  const joao = {
    id: createId(),
    fullName: "João Pereira dos Santos",
    hasReferral: true,
    referralName: "Marcos Lima",
    loanDate: "2026-03-10",
    amountBorrowed: "1000",
    returnDate: "2026-06-10",
    amountWithInterest: "1300",
    installmentsTotal: 4,
    frequency: "Mensal",
    loanState: "active",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    documents: [],
    notes: [],
    history: [],
    installments: []
  };
  joao.installments = reconcileInstallments([], 4, "Mensal", "2026-04-10");
  joao.installments[0].status = "partial";
  joao.installments[0].expectedValue = "325";
  joao.installments[0].paidValue = "300";
  joao.installments[0].paidDate = "2026-04-10";
  joao.installments[0].payments.push({
    id: createId(),
    createdAt: "2026-04-10T15:00:00.000Z",
    status: "partial",
    expectedValue: "325",
    paidValue: "300",
    note: "Pagou parte e ficou de completar depois.",
    summary: "Parcial. Pagou R$ 300 de R$ 325."
  });
  joao.installments[1].status = "late";
  joao.installments[1].expectedValue = "325";
  joao.installments[2].expectedValue = "325";
  joao.installments[3].expectedValue = "325";
  addNote(joao, "Cliente pegou 1000 para pagar 1300, mas pagou só 300 até agora. Cobrar restante da primeira parcela e segunda parcela atrasada.");
  addHistory(joao, "Cliente criado", "Cadastro inicial de exemplo.");
  addHistory(joao, "Pagamento parcial", "Pagou R$ 300 e prometeu completar depois.");

  const marina = {
    id: createId(),
    fullName: "Marina Lopes",
    hasReferral: false,
    referralName: "",
    loanDate: "2026-05-01",
    amountBorrowed: "2500",
    returnDate: "2026-05-15",
    amountWithInterest: "3100",
    installmentsTotal: 4,
    frequency: "Quinzenal",
    loanState: "active",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    documents: [],
    notes: [],
    history: [],
    installments: []
  };
  marina.installments = reconcileInstallments([], 4, "Quinzenal", "2026-05-15");
  marina.installments[0].status = "paid";
  marina.installments[0].expectedValue = "775";
  marina.installments[0].paidValue = "775";
  marina.installments[0].paidDate = "2026-05-15";
  marina.installments[1].status = "paid";
  marina.installments[1].expectedValue = "775";
  marina.installments[1].paidValue = "775";
  marina.installments[1].paidDate = "2026-05-30";
  marina.installments[2].expectedValue = "775";
  marina.installments[3].expectedValue = "775";
  addHistory(marina, "Cliente criado", "Cliente sem indicação. Pagamentos quinzenais.");
  addHistory(marina, "Bom pagamento", "Pagou as duas primeiras parcelas no prazo.");

  const renata = {
    id: createId(),
    fullName: "Renata Silva",
    hasReferral: true,
    referralName: "Marina Lopes",
    loanDate: "2026-02-02",
    amountBorrowed: "1800",
    returnDate: "2026-03-02",
    amountWithInterest: "2200",
    installmentsTotal: 2,
    frequency: "Mensal",
    loanState: "paid",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    documents: [],
    notes: [],
    history: [],
    installments: []
  };
  renata.installments = reconcileInstallments([], 2, "Mensal", "2026-03-02");
  renata.installments.forEach((item, index) => {
    item.status = "paid";
    item.expectedValue = "1100";
    item.paidValue = "1100";
    item.paidDate = index === 0 ? "2026-03-02" : "2026-04-02";
  });
  addHistory(renata, "Contrato quitado", "Pagou tudo no combinado.");

  const eduardo = {
    id: createId(),
    fullName: "Eduardo Ramos",
    hasReferral: false,
    referralName: "",
    loanDate: "",
    amountBorrowed: "",
    returnDate: "",
    amountWithInterest: "",
    installmentsTotal: 0,
    frequency: "Manual",
    loanState: "none",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    documents: [],
    notes: [],
    history: [],
    installments: []
  };
  addHistory(eduardo, "Cliente cadastrado", "Sem empréstimo ativo no momento.");

  return [joao, marina, renata, eduardo];
}

function findClient(id) {
  return state.clients.find((client) => client.id === id);
}

function isAdmin() {
  return state.session?.role === "admin";
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeFileName(fileName) {
  return String(fileName || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function nowIso() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "Não informado";
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString("pt-BR");
}

function formatDateTime(value) {
  if (!value) return "Não informado";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "Manual";
  const number = parseMoneyValue(value);
  if (Number.isNaN(number)) return escapeHtml(String(value));
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseMoneyValue(value) {
  if (value === null || value === undefined || value === "") return 0;
  const normalized = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isNaN(number) ? 0 : number;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}
