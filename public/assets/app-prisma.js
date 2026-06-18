const API_BASE = "/api";

class ApiClient {
  constructor() {
    this.token = getStoredAuthToken();
  }

  async request(endpoint, options = {}) {
    const config = {
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      },
      ...options
    };

    if (config.body && typeof config.body === "object") {
      config.body = JSON.stringify(config.body);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, config);
    const rawBody = await response.text();
    let payload = {};
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch (_error) {
        payload = {};
      }
    }
    if (!response.ok) {
      const fallbackMessage = payload.message || `Erro HTTP ${response.status} (${response.statusText || "Falha"})`;
      const err = new Error(fallbackMessage);
      err.status = response.status;
      err.rawBody = rawBody;
      throw err;
    }
    return payload;
  }

  getProfile() { return this.request("/provider/me"); }
  updateProfile(data) { return this.request("/provider/me", { method: "PATCH", body: data }); }
  getCatalog(search = "") { return this.request(`/catalog${search ? `?search=${encodeURIComponent(search)}` : ""}`); }
  getClients(search = "") { return this.request(`/clients${search ? `?search=${encodeURIComponent(search)}` : ""}`); }
  getClient(id) { return this.request(`/clients/${id}`); }
  createClient(data) { return this.request("/clients", { method: "POST", body: data }); }
  updateClient(id, data) { return this.request(`/clients/${id}`, { method: "PATCH", body: data }); }
  createCatalogItem(data) { return this.request("/catalog", { method: "POST", body: data }); }
  updateCatalogItem(id, data) { return this.request(`/catalog/${id}`, { method: "PATCH", body: data }); }
  getActiveQuote() { return this.request("/quotes/active"); }
  getQuote(id) { return this.request(`/quotes/${id}`); }
  reopenQuote(id) { return this.request(`/quotes/${id}/reopen`, { method: "POST" }); }
  deleteQuote(id) { return this.request(`/quotes/${id}`, { method: "DELETE" }); }
  resetActiveQuote() { return this.request("/quotes/active/reset", { method: "POST" }); }
  updateQuoteConfig(id, data) { return this.request(`/quotes/${id}/config`, { method: "PATCH", body: data }); }
  addQuoteItem(quoteId, catalogItemId, quantity = 1) { return this.request(`/quotes/${quoteId}/items`, { method: "POST", body: { catalogItemId, quantity } }); }
  updateQuoteItem(quoteId, itemId, updates = {}) { return this.request(`/quotes/${quoteId}/items/${itemId}`, { method: "PATCH", body: updates }); }
  deleteQuoteItem(quoteId, itemId) { return this.request(`/quotes/${quoteId}/items/${itemId}`, { method: "DELETE" }); }
  finalizeQuote(id, status = "SENT") { return this.request(`/quotes/${id}/finalize`, { method: "POST", body: { status } }); }
  getQuoteHistory() { return this.request("/quotes/history"); }
  getQuoteSummary() { return this.request("/summary/quotes"); }
  getManagementOverview() { return this.request("/management/overview"); }
  updateQuoteBilling(quoteId, data) { return this.request(`/management/quotes/${quoteId}/billing`, { method: "PATCH", body: data }); }
}

const api = new ApiClient();
const PROVIDER_FALLBACK = {
  displayName: "Joao Claudio Caleffi Pedroso",
  email: "joaoclaudiocaleffipedroso520@gmail.com",
  phone: "43 99687-7731",
  cnpj: "64.766.185/0001-22",
  address: "Endereco nao informado",
  city: "Cidade nao informada"
};
const TERMS_STORAGE_KEY = "quoteTermsOptionsV1";
const AVATAR_STORAGE_PREFIX = "providerAvatarDataUrl";
const AVATAR_MAX_IMAGE_SIZE = 512;
const DEFAULT_TERMS_OPTIONS = {
  monthlyPlanContracted: false,
  eventsPackContracted: false,
  backendSupportContracted: true,
  frontendSupportContracted: true
};
const CONTRACT_PHASES = [
  {
    title: "1ª fase",
    description: "Levantamento dos requisitos para o desenvolvimento do sistema.",
    durationPrefix: "Prazo previsto para 1ª fase",
    baseDays: 3
  },
  {
    title: "2º fase",
    description: "Criacao de imagens de layout para exemplificar como o sistema ficara quando pronto, bem como execucao de ajustes.",
    durationPrefix: "Prazo previsto para a 2ª fase",
    baseDays: 7
  },
  {
    title: "3ª fase",
    description: "Desenvolvimento do site acordado na 2ª fase.",
    durationPrefix: "Prazo previsto para a 3ª fase",
    baseDays: 14
  },
  {
    title: "4ª fase",
    description: "Testes finais do projeto desenvolvido.",
    durationPrefix: "Prazo previsto para a 4ª fase",
    baseDays: 7
  }
];

let currentUser = null;
let currentQuote = null;
let clients = [];
let services = [];
let termsOptions = { ...DEFAULT_TERMS_OPTIONS };
let activeClientHistory = [];
let historyQuotes = [];
let activeHistoryQuote = null;
let managementOverview = null;
let managementClockTimer = null;
let proposalClockTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const token = getStoredAuthToken();
    if (!token) {
      window.location.href = "/login.html";
      return;
    }

    currentUser = await api.getProfile();
    bindEvents();
    applySavedTheme();
    loadTermsOptions();
    syncTermsOptionsUI();
    updateUserInfo();
    await showTab("dashboard");
  } catch (error) {
    console.error(error);
    if (error.status === 401) {
      clearStoredAuth();
      window.location.href = "/login.html";
      return;
    }
    showToast(error.message || "Erro ao iniciar");
  }
});

function bindEvents() {
  document.querySelectorAll(".nav-btn[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });

  document.getElementById("toggleSidebar")?.addEventListener("click", () => {
    const sidebar = document.querySelector(".sidebar");
    sidebar?.classList.toggle("collapsed");
    sidebar?.classList.toggle("open");
  });

  document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);
  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    clearStoredAuth();
    window.location.href = "/login.html";
  });
  document.getElementById("avatarUploadBtn")?.addEventListener("click", openAvatarPicker);
  document.getElementById("avatarInput")?.addEventListener("change", handleAvatarInputChange);

  document.getElementById("editProfileBtn")?.addEventListener("click", openProfileModal);
  document.querySelector("#profileModal .close-btn")?.addEventListener("click", closeProfileModal);
  document.getElementById("profileModal")?.addEventListener("click", (e) => {
    if (e.target.id === "profileModal") closeProfileModal();
  });
  document.getElementById("profileForm")?.addEventListener("submit", saveProfile);
  document.getElementById("quoteMetaForm")?.addEventListener("submit", saveQuoteMeta);
  document.getElementById("quoteClientId")?.addEventListener("change", () => syncQuoteClientNameFromSelect(true));
  document.getElementById("quoteHasMachineFee")?.addEventListener("change", syncMachineFeeControlsState);

  document.getElementById("newQuoteBtn")?.addEventListener("click", async () => {
    await api.resetActiveQuote();
    customContractText = null;
    await loadCurrentQuote();
    showToast("Novo rascunho criado");
  });
  document.getElementById("finalizeQuoteBtn")?.addEventListener("click", finalizeCurrentQuote);
  document.getElementById("adjustQuoteFinanceBtn")?.addEventListener("click", openQuoteFinanceAdjustments);
  document.getElementById("copyQuoteBtn")?.addEventListener("click", copyQuoteText);
  document.getElementById("printQuoteBtn")?.addEventListener("click", printQuotePreview);

  document.getElementById("newServiceBtn")?.addEventListener("click", openCatalogServiceModalForCreate);
  document.getElementById("newClientBtn")?.addEventListener("click", openClientCreateModal);

  const monthlyPlanEl = document.getElementById("monthlyPlanContracted");
  const eventsPackEl = document.getElementById("eventsPackContracted");
  const backendSupportEl = document.getElementById("backendSupportContracted");
  const frontendSupportEl = document.getElementById("frontendSupportContracted");
  monthlyPlanEl?.addEventListener("change", handleTermsOptionsChange);
  eventsPackEl?.addEventListener("change", handleTermsOptionsChange);
  backendSupportEl?.addEventListener("change", handleTermsOptionsChange);
  frontendSupportEl?.addEventListener("change", handleTermsOptionsChange);

  document.getElementById("closeClientEditModalBtn")?.addEventListener("click", closeClientEditModal);
  document.getElementById("closeClientHistoryModalBtn")?.addEventListener("click", closeClientHistoryModal);
  document.getElementById("closeHistoryDetailModalBtn")?.addEventListener("click", closeHistoryDetailModal);
  document.getElementById("closeCatalogServiceModalBtn")?.addEventListener("click", closeCatalogServiceModal);
  document.getElementById("closeClientCreateModalBtn")?.addEventListener("click", closeClientCreateModal);
  document.getElementById("clientEditForm")?.addEventListener("submit", saveClientEdit);
  document.getElementById("catalogServiceForm")?.addEventListener("submit", saveCatalogServiceForm);
  document.getElementById("clientCreateForm")?.addEventListener("submit", saveClientCreateForm);
  document.getElementById("clientHistorySearch")?.addEventListener("input", debounce((e) => {
    renderClientHistory(e.target.value || "");
  }, 250));

  document.getElementById("clientEditModal")?.addEventListener("click", (e) => {
    if (e.target.id === "clientEditModal") closeClientEditModal();
  });
  document.getElementById("clientHistoryModal")?.addEventListener("click", (e) => {
    if (e.target.id === "clientHistoryModal") closeClientHistoryModal();
  });
  document.getElementById("catalogServiceModal")?.addEventListener("click", (e) => {
    if (e.target.id === "catalogServiceModal") closeCatalogServiceModal();
  });
  document.getElementById("clientCreateModal")?.addEventListener("click", (e) => {
    if (e.target.id === "clientCreateModal") closeClientCreateModal();
  });
  document.getElementById("historyDetailModal")?.addEventListener("click", (e) => {
    if (e.target.id === "historyDetailModal") closeHistoryDetailModal();
  });

  document.getElementById("catalogSearch")?.addEventListener("input", debounce(async (e) => {
    await loadCatalog((e.target.value || "").trim());
  }, 300));
  document.getElementById("clientSearch")?.addEventListener("input", debounce(async (e) => {
    await loadClients((e.target.value || "").trim());
  }, 300));

  document.getElementById("quoteItemEditCancelBtn")?.addEventListener("click", () => {
    document.getElementById("quoteItemEditModal")?.classList.add("hidden");
  });
  document.getElementById("quoteItemEditSaveBtn")?.addEventListener("click", saveQuoteItemEdit);
  document.getElementById("quoteItemEditModal")?.addEventListener("click", (e) => {
    if (e.target.id === "quoteItemEditModal") e.target.classList.add("hidden");
  });

  const items = document.getElementById("quoteItemsContainer");
  items?.addEventListener("change", handleItemsChange);
  items?.addEventListener("click", handleItemsClick);
  document.getElementById("historyList")?.addEventListener("click", handleHistoryCardClick);
  document.getElementById("historyStatusActions")?.addEventListener("click", handleHistoryStatusClick);
  document.getElementById("managementList")?.addEventListener("click", handleManagementListClick);
  document.getElementById("mgmtCompletedBtn")?.addEventListener("click", () => openManagementSection("completed"));
  document.getElementById("mgmtEventsBtn")?.addEventListener("click", () => openManagementSection("events"));
  document.getElementById("mgmtFrontendBtn")?.addEventListener("click", () => openManagementSection("frontend"));
  document.getElementById("mgmtFullstackBtn")?.addEventListener("click", () => openManagementSection("fullstack"));

  window.addServiceToQuote = addServiceToQuote;
  window.openClientEditModal = openClientEditModal;
  window.openClientHistoryModal = openClientHistoryModal;
  window.openCatalogServiceModalForEdit = openCatalogServiceModalForEdit;
}

async function showTab(tabName) {
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.remove("active"));
  document.querySelector(`[data-tab="${tabName}"]`)?.classList.add("active");
  document.querySelectorAll(".tab-pane").forEach((pane) => pane.classList.remove("active"));
  document.getElementById(`${tabName}-tab`)?.classList.add("active");
  setText("pageTitle", ({
    dashboard: "Dashboard",
    orcamentos: "Orcamentos",
    catalogo: "Catalogo",
    clientes: "Clientes",
    historico: "Historico",
    gestao: "Gestao"
  })[tabName] || "Dashboard");

  if (tabName !== "gestao") {
    stopManagementClock();
  }
  if (tabName !== "orcamentos") {
    stopProposalClock();
  }

  if (tabName === "dashboard") await loadDashboard();
  if (tabName === "orcamentos") { await loadCurrentQuote(); await loadCatalog(); }
  if (tabName === "catalogo") await loadCatalog();
  if (tabName === "clientes") await loadClients();
  if (tabName === "historico") await loadHistory();
  if (tabName === "gestao") await loadGestao();
}

function providerData() {
  return {
    displayName: clean(currentUser?.displayName) || clean(currentUser?.username) || PROVIDER_FALLBACK.displayName,
    email: clean(currentUser?.email) || PROVIDER_FALLBACK.email,
    phone: clean(currentUser?.phone) || PROVIDER_FALLBACK.phone,
    cnpj: clean(currentUser?.cnpj) || PROVIDER_FALLBACK.cnpj,
    address: clean(currentUser?.address) || PROVIDER_FALLBACK.address,
    city: clean(currentUser?.city) || PROVIDER_FALLBACK.city
  };
}

function updateUserInfo() {
  const p = providerData();
  setText("userName", p.displayName);
  setText("userEmail", p.email);
  loadUserAvatar();
}

async function loadDashboard() {
  const [summary, allClients] = await Promise.all([api.getQuoteSummary(), api.getClients()]);
  clients = allClients;
  setText("totalQuotes", String(summary.totalQuotes || 0));
  setText("approvedQuotes", String(summary.approved || 0));
  setText("totalRevenue", money(summary.totalToCharge));
  setText("totalClients", String(allClients.length || 0));
  await loadClientSelect();
  await loadCurrentQuote();
}

async function loadClientSelect() {
  clients = await api.getClients();
  const select = document.getElementById("quoteClientId");
  if (!select) return;
  select.innerHTML = '<option value="">Selecione um cliente</option>';
  clients.forEach((client) => {
    const option = document.createElement("option");
    option.value = String(client.id);
    option.textContent = client.companyName || client.name;
    select.appendChild(option);
  });
  if (currentQuote?.clientId) select.value = String(currentQuote.clientId);
  syncQuoteClientNameFromSelect();
}

async function loadCurrentQuote() {
  currentQuote = await api.getActiveQuote();
  const effectiveClient = currentQuote?.client
    || clients.find((item) => String(item.id) === String(currentQuote?.clientId))
    || {};
  const resolvedClientName = resolveClientDisplayName(currentQuote?.clientName, effectiveClient);
  if (document.getElementById("quoteTitle")) document.getElementById("quoteTitle").value = currentQuote.title || "";
  if (document.getElementById("quoteClientId")) document.getElementById("quoteClientId").value = currentQuote.clientId ? String(currentQuote.clientId) : "";
  if (document.getElementById("quoteClientName")) document.getElementById("quoteClientName").value = resolvedClientName;
  if (document.getElementById("quotePaymentMethod")) document.getElementById("quotePaymentMethod").value = currentQuote.paymentMethod || "PIX";
  if (document.getElementById("quoteInstallments")) document.getElementById("quoteInstallments").value = String(Math.max(1, Number(currentQuote.installments || 1)));
  if (document.getElementById("quotePricingTier")) document.getElementById("quotePricingTier").value = currentQuote.pricingTier || "MVP";
  if (document.getElementById("quoteAdjustmentPercent")) document.getElementById("quoteAdjustmentPercent").value = formatPercent(currentQuote.adjustmentPercent || 0);
  if (document.getElementById("quoteDiscountPercent")) document.getElementById("quoteDiscountPercent").value = formatPercent(currentQuote.discountPercent || 0);
  if (document.getElementById("quoteHasMachineFee")) document.getElementById("quoteHasMachineFee").checked = Boolean(currentQuote.hasMachineFee);
  if (document.getElementById("quoteMachineFeePercent")) document.getElementById("quoteMachineFeePercent").value = formatPercent(currentQuote.machineFeePercent || 0);
  if (document.getElementById("quotePassMachineFeeToClient")) document.getElementById("quotePassMachineFeeToClient").checked = Boolean(currentQuote.passMachineFeeToClient);
  if (document.getElementById("quoteNotes")) document.getElementById("quoteNotes").value = currentQuote.notes || "";
  syncTermsOptionsFromQuote();
  syncTermsOptionsUI();
  setText("currentQuoteBadge", `#${currentQuote.id}`);
  syncMachineFeeControlsState();
  renderSummary();
  renderItems();
  renderQuotePreview();
}

function loadTermsOptions() {
  termsOptions = { ...DEFAULT_TERMS_OPTIONS };
}

function saveTermsOptions() {
  return;
}

function syncTermsOptionsFromQuote() {
  if (!currentQuote) {
    termsOptions = { ...DEFAULT_TERMS_OPTIONS };
    return;
  }
  termsOptions = {
    monthlyPlanContracted: Boolean(currentQuote.monthlyPlanContracted),
    eventsPackContracted: Boolean(currentQuote.eventsPackContracted),
    backendSupportContracted: Boolean(currentQuote.backendSupportContracted),
    frontendSupportContracted: Boolean(currentQuote.frontendSupportContracted)
  };
}

function syncTermsOptionsUI() {
  const monthlyPlanEl = document.getElementById("monthlyPlanContracted");
  const eventsPackEl = document.getElementById("eventsPackContracted");
  const backendSupportEl = document.getElementById("backendSupportContracted");
  const frontendSupportEl = document.getElementById("frontendSupportContracted");
  if (monthlyPlanEl) monthlyPlanEl.checked = termsOptions.monthlyPlanContracted;
  if (eventsPackEl) eventsPackEl.checked = termsOptions.eventsPackContracted;
  if (backendSupportEl) backendSupportEl.checked = termsOptions.backendSupportContracted;
  if (frontendSupportEl) frontendSupportEl.checked = termsOptions.frontendSupportContracted;
}

async function handleTermsOptionsChange() {
  termsOptions.monthlyPlanContracted = Boolean(document.getElementById("monthlyPlanContracted")?.checked);
  termsOptions.eventsPackContracted = Boolean(document.getElementById("eventsPackContracted")?.checked);
  termsOptions.backendSupportContracted = Boolean(document.getElementById("backendSupportContracted")?.checked);
  termsOptions.frontendSupportContracted = Boolean(document.getElementById("frontendSupportContracted")?.checked);
  saveTermsOptions();
  if (currentQuote?.id) {
    try {
      currentQuote = await api.updateQuoteConfig(currentQuote.id, {
        monthlyPlanContracted: termsOptions.monthlyPlanContracted,
        eventsPackContracted: termsOptions.eventsPackContracted,
        backendSupportContracted: termsOptions.backendSupportContracted,
        frontendSupportContracted: termsOptions.frontendSupportContracted
      });
    } catch (error) {
      console.error(error);
      showToast(error.message || "Erro ao salvar termos mensais");
    }
  }
  renderQuotePreview();
}

async function saveQuoteMeta(e) {
  e.preventDefault();
  if (!currentQuote) return;
  const selectedClientId = document.getElementById("quoteClientId")?.value || null;
  const clientNameField = clean(document.getElementById("quoteClientName")?.value);
  const selectedClient = clients.find((item) => String(item.id) === String(selectedClientId));
  const resolvedClientName = clientNameField || clean(selectedClient?.name) || "";
  const hasMachineFee = Boolean(document.getElementById("quoteHasMachineFee")?.checked);
  const machineFeePercent = hasMachineFee ? toNumber(document.getElementById("quoteMachineFeePercent")?.value) : 0;

  currentQuote = await api.updateQuoteConfig(currentQuote.id, {
    title: clean(document.getElementById("quoteTitle")?.value) || "Novo projeto",
    clientId: selectedClientId || null,
    clientName: resolvedClientName || null,
    notes: document.getElementById("quoteNotes")?.value || "",
    paymentMethod: clean(document.getElementById("quotePaymentMethod")?.value).toUpperCase() || "PIX",
    installments: Math.max(1, Math.min(24, Math.round(toNumber(document.getElementById("quoteInstallments")?.value, 1)))),
    pricingTier: clean(document.getElementById("quotePricingTier")?.value).toUpperCase() || "MVP",
    adjustmentPercent: clampNumber(parsePercent(document.getElementById("quoteAdjustmentPercent")?.value), -80, 200),
    discountPercent: clampNumber(parsePercent(document.getElementById("quoteDiscountPercent")?.value), 0, 80),
    hasMachineFee,
    machineFeePercent: clampNumber(parsePercent(document.getElementById("quoteMachineFeePercent")?.value), 0, 100),
    passMachineFeeToClient: hasMachineFee && Boolean(document.getElementById("quotePassMachineFeeToClient")?.checked),
    monthlyPlanContracted: Boolean(document.getElementById("monthlyPlanContracted")?.checked),
    eventsPackContracted: Boolean(document.getElementById("eventsPackContracted")?.checked),
    backendSupportContracted: Boolean(document.getElementById("backendSupportContracted")?.checked),
    frontendSupportContracted: Boolean(document.getElementById("frontendSupportContracted")?.checked)
  });
  const refreshedClient = currentQuote?.client
    || clients.find((item) => String(item.id) === String(currentQuote?.clientId))
    || {};
  if (document.getElementById("quoteClientName")) {
    document.getElementById("quoteClientName").value = resolveClientDisplayName(currentQuote?.clientName, refreshedClient);
  }
  syncMachineFeeControlsState();
  renderSummary();
  renderItems();
  renderQuotePreview();
  showToast("Dados do orcamento salvos");
  await showTab("catalogo");
}

function renderSummary() {
  if (!currentQuote?.totals) return;
  const t = currentQuote.totals;
  setText("tierImpactLabel", `Faixa de preco (${currentQuote.pricingTier || "MVP"})`);
  setText("rawSubtotal", money(t.rawSubtotal));
  setText("tierImpact", money(t.tierImpact));
  setText("adjustment", money(t.adjustmentValue));
  setText("discount", money(t.discountValue));
  setText("negotiatedSubtotal", money(t.negotiatedSubtotal));
  setText("machineFee", money(t.machineFee));
  setText("totalCharge", money(t.totalToCharge));
  setText("netAmount", money(t.netAmount));
  setText("paymentSummary", `${paymentMethodLabel(currentQuote.paymentMethod)} | ${currentQuote.installments || 1}x`);
}

function renderItems() {
  const container = document.getElementById("quoteItemsContainer");
  if (!container) return;
  const items = currentQuote?.items || [];
  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Nenhum item no orcamento. Va em Catalogo e adicione servicos.</p></div>';
    return;
  }
  container.innerHTML = `
    <div class="quote-items-table-wrap">
      <table class="quote-items-table">
        <thead>
          <tr><th>Item</th><th>Categoria</th><th>Prazo</th><th>Unit.</th><th>Qtd</th><th>Total</th><th>Ações</th></tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td>${esc(item.name)}</td>
              <td>${esc(item.category)}</td>
              <td>${item.estimatedDays} dias</td>
              <td>${money(item.unitPrice)}</td>
              <td><input class="quote-qty-input" data-item-id="${item.id}" type="number" min="1" step="1" value="${item.quantity}" /></td>
              <td>${money(item.lineTotal)}</td>
              <td>
                <div class="quote-actions-cell">
                  <button type="button" class="icon-btn quote-item-edit" data-action="edit-item" data-item-id="${item.id}" title="Editar item">
                    <svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>
                  </button>
                  <button type="button" class="icon-btn quote-item-remove" data-item-id="${item.id}" data-action="remove-item" title="Remover item">
                    <svg viewBox="0 0 24 24"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6v14H5V6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
                  </button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function saveQuoteItemEdit() {
  try {
    const modal = document.getElementById("quoteItemEditModal");
    if (!modal || !currentQuote) return;
    const itemId = Number(modal.dataset.itemId);
    if (!itemId) return;
    const unitPrice = parseFloat(document.getElementById("quoteItemEditUnitPrice")?.value || "0");
    const estimatedDays = parseInt(document.getElementById("quoteItemEditDays")?.value || "0", 10);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) { showToast("Valor unitario invalido"); return; }
    if (!Number.isFinite(estimatedDays) || estimatedDays < 1) { showToast("Prazo invalido"); return; }
    currentQuote = await api.updateQuoteItem(currentQuote.id, itemId, { unitPrice, estimatedDays });
    modal.classList.add("hidden");
    renderSummary();
    renderItems();
    renderQuotePreview();
    showToast("Item atualizado");
  } catch (error) {
    showToast(error.message || "Erro ao salvar item.");
  }
}

async function handleItemsChange(e) {
  if (!e.target.classList.contains("quote-qty-input")) return;
  const itemId = Number(e.target.dataset.itemId);
  const qty = parseInt(e.target.value, 10);
  if (!currentQuote || !itemId || !Number.isInteger(qty) || qty < 1) return;
  try {
    currentQuote = await api.updateQuoteItem(currentQuote.id, itemId, { quantity: qty });
    renderSummary();
    renderItems();
    renderQuotePreview();
  } catch (error) {
    showToast(error.message || "Erro ao atualizar quantidade.");
  }
}

async function handleItemsClick(e) {
  const editBtn = e.target.closest("[data-action='edit-item']");
  if (editBtn) {
    const itemId = Number(editBtn.dataset.itemId);
    const item = currentQuote?.items?.find((it) => it.id === itemId);
    const modal = document.getElementById("quoteItemEditModal");
    if (!item || !modal) return;
    modal.dataset.itemId = String(itemId);
    document.getElementById("quoteItemEditUnitPrice").value = Number(item.unitPrice).toFixed(2);
    document.getElementById("quoteItemEditDays").value = String(item.estimatedDays);
    modal.classList.remove("hidden");
    return;
  }
  const removeBtn = e.target.closest("[data-action='remove-item']");
  if (!removeBtn) return;
  const itemId = Number(removeBtn.dataset.itemId);
  if (!currentQuote || !itemId) return;
  try {
    currentQuote = await api.deleteQuoteItem(currentQuote.id, itemId);
    renderSummary();
    renderItems();
    renderQuotePreview();
    showToast("Item removido");
  } catch (error) {
    showToast(error.message || "Erro ao remover item.");
  }
}

async function addServiceToQuote(serviceId) {
  if (!currentQuote) await loadCurrentQuote();
  currentQuote = await api.addQuoteItem(currentQuote.id, Number(serviceId), 1);
  renderSummary();
  renderItems();
  renderQuotePreview();
  showToast("Servico adicionado");
}

async function finalizeCurrentQuote() {
  if (!currentQuote) return;
  currentQuote = await api.finalizeQuote(currentQuote.id, "SENT");
  renderSummary();
  renderItems();
  renderQuotePreview();
  showToast("Orcamento marcado como enviado");
}

async function openQuoteFinanceAdjustments() {
  if (!currentQuote) await loadCurrentQuote();
  await showTab("dashboard");
  const discountInput = document.getElementById("quoteDiscountPercent");
  const metaForm = document.getElementById("quoteMetaForm");
  metaForm?.scrollIntoView({ behavior: "smooth", block: "start" });
  discountInput?.focus();
  showToast("Ajuste de desconto e nota aberto no painel financeiro.");
}

async function loadCatalog(search = "") {
  services = await api.getCatalog(search);
  const grid = document.getElementById("catalogGrid");
  if (!grid) return;
  if (!services.length) {
    grid.innerHTML = '<div class="empty-state"><p>Nenhum servico encontrado.</p></div>';
    return;
  }
  grid.innerHTML = services.map((service) => `
    <article class="service-card">
      <div class="service-header">
        <h3>${esc(service.name)}</h3>
        <span class="service-category">${esc(service.category)}</span>
      </div>
      <div class="service-body">
        <p>${esc(service.description)}</p>
        <div class="service-price">${money(service.price)}</div>
        <div class="service-days">${service.estimatedDays} dias de prazo</div>
        <div class="service-actions">
          <button class="btn-primary" onclick="addServiceToQuote(${service.id})">Adicionar</button>
          <button class="btn-secondary" onclick="openCatalogServiceModalForEdit(${service.id})">Editar</button>
        </div>
      </div>
    </article>
  `).join("");
}

async function loadClients(search = "") {
  clients = await api.getClients(search);
  const list = document.getElementById("clientList");
  if (!list) return;
  if (!clients.length) {
    list.innerHTML = '<div class="empty-state"><p>Nenhum cliente encontrado.</p></div>';
    return;
  }
  list.innerHTML = clients.map((client) => `
    <article class="client-card">
      <div class="client-info">
        <h3>${esc(client.companyName || client.name)}</h3>
        <p>Contato: ${esc(client.name || "-")}</p>
        <p>E-mail: ${esc(client.email || "-")}</p>
        <p>Telefone: ${esc(client.phone || "-")}</p>
        <p>${esc(client.documentType || "Documento")}: ${esc(client.documentNumber || "nao informado")}</p>
        <p>Endereco contrato: ${esc(client.contractAddress || "Nao informado")}</p>
      </div>
      <div class="client-actions">
        <button class="btn-secondary" onclick="openClientHistoryModal(${client.id})">Ver orcamentos</button>
        <button class="btn-primary" onclick="openClientEditModal(${client.id})">Alterar</button>
      </div>
    </article>
  `).join("");
}

async function openClientEditModal(clientId) {
  try {
    const id = Number(clientId);
    if (!id) return;
    const details = await api.getClient(id);

    document.getElementById("editClientId").value = String(details.id);
    document.getElementById("editClientName").value = details.name || "";
    document.getElementById("editClientCompanyName").value = details.companyName || "";
    document.getElementById("editClientEmail").value = details.email || "";
    document.getElementById("editClientPhone").value = details.phone || "";
    document.getElementById("editClientDocumentType").value = details.documentType || "CPF";
    document.getElementById("editClientDocumentNumber").value = details.documentNumber || "";
    document.getElementById("editClientAddressZipCode").value = details.addressZipCode || "";
    document.getElementById("editClientAddressState").value = details.addressState || "";
    document.getElementById("editClientAddressCity").value = details.addressCity || "";
    document.getElementById("editClientAddressDistrict").value = details.addressDistrict || "";
    document.getElementById("editClientAddressStreet").value = details.addressStreet || "";
    document.getElementById("editClientAddressNumber").value = details.addressNumber || "";
    document.getElementById("editClientAddressComplement").value = details.addressComplement || "";
    document.getElementById("editClientNotes").value = details.notes || "";

    document.getElementById("clientEditModal").classList.add("active");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Erro ao abrir cliente");
  }
}

function closeClientEditModal() {
  document.getElementById("clientEditModal").classList.remove("active");
}

async function saveClientEdit(e) {
  try {
    e.preventDefault();
    const id = Number(document.getElementById("editClientId").value);
    if (!id) return;

    const rawDocument = clean(document.getElementById("editClientDocumentNumber").value);
    const digits = rawDocument.replace(/\D/g, "");
    const payload = {
      name: clean(document.getElementById("editClientName").value),
      companyName: clean(document.getElementById("editClientCompanyName").value),
      email: clean(document.getElementById("editClientEmail").value),
      phone: clean(document.getElementById("editClientPhone").value),
      documentType: clean(document.getElementById("editClientDocumentType").value).toUpperCase() || (digits.length <= 11 ? "CPF" : "CNPJ"),
      documentNumber: digits,
      addressZipCode: clean(document.getElementById("editClientAddressZipCode").value),
      addressState: clean(document.getElementById("editClientAddressState").value).toUpperCase(),
      addressCity: clean(document.getElementById("editClientAddressCity").value),
      addressDistrict: clean(document.getElementById("editClientAddressDistrict").value),
      addressStreet: clean(document.getElementById("editClientAddressStreet").value),
      addressNumber: clean(document.getElementById("editClientAddressNumber").value),
      addressComplement: clean(document.getElementById("editClientAddressComplement").value),
      notes: clean(document.getElementById("editClientNotes").value)
    };

    if (
      !payload.name ||
      !payload.companyName ||
      !payload.email ||
      !payload.phone ||
      !payload.documentNumber ||
      !payload.addressZipCode ||
      !payload.addressState ||
      !payload.addressCity ||
      !payload.addressDistrict ||
      !payload.addressStreet ||
      !payload.addressNumber
    ) {
      showToast("Preencha os campos obrigatorios do cliente");
      return;
    }

    await api.updateClient(id, payload);
    closeClientEditModal();
    await loadClients((document.getElementById("clientSearch")?.value || "").trim());
    await loadClientSelect();
    if (currentQuote?.clientId === id) {
      await loadCurrentQuote();
    }
    showToast("Cliente atualizado com sucesso");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Erro ao atualizar cliente");
  }
}

async function openClientHistoryModal(clientId) {
  try {
    const id = Number(clientId);
    if (!id) return;
    const details = await api.getClient(id);
    activeClientHistory = Array.isArray(details.quoteHistory) ? details.quoteHistory : [];
    document.getElementById("clientHistorySearch").value = "";
    renderClientHistory("");
    document.getElementById("clientHistoryModal").classList.add("active");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Erro ao carregar historico do cliente");
  }
}

function closeClientHistoryModal() {
  document.getElementById("clientHistoryModal").classList.remove("active");
}

function renderClientHistory(filterText = "") {
  const list = document.getElementById("clientHistoryList");
  if (!list) return;

  const search = clean(filterText).toLowerCase();
  const filtered = search
    ? activeClientHistory.filter((q) => `${q.title} ${q.status} ${q.clientName}`.toLowerCase().includes(search))
    : activeClientHistory;

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state"><p>Nenhum orcamento encontrado para este cliente.</p></div>';
    return;
  }

  list.innerHTML = filtered.map((quote) => `
    <article class="quote-card">
      <div class="quote-header">
        <h3>${esc(quote.title || "Projeto")}</h3>
        <span class="badge ${statusBadgeClass(quote.status)}">${statusIconSvg(quote.status)} ${esc(statusLabel(quote.status))}</span>
      </div>
      <div class="quote-body">
        <p><strong>Valor:</strong> ${money(quote.totalToCharge || 0)}</p>
        <p><strong>Pagamento:</strong> ${paymentMethodLabel(quote.paymentMethod)} | ${quote.installments || 1}x</p>
        <p><strong>Itens:</strong> ${Number(quote.itemCount || (quote.items ? quote.items.length : 0))}</p>
        <p><strong>Atualizado:</strong> ${dateTime(quote.updatedAt)}</p>
      </div>
    </article>
  `).join("");
}

async function loadHistory() {
  historyQuotes = await api.getQuoteHistory();
  const list = document.getElementById("historyList");
  if (!list) return;
  if (!historyQuotes.length) {
    list.innerHTML = '<div class="empty-state"><p>Nenhum orcamento finalizado ainda.</p></div>';
  } else {
    list.innerHTML = historyQuotes.map((quote) => `
      <article class="quote-card clickable" data-quote-id="${quote.id}">
        <div class="quote-header">
          <h3>${esc(quote.title)}</h3>
          <div class="quote-header-actions">
            <span class="badge ${statusBadgeClass(quote.status)}">${statusIconSvg(quote.status)} ${esc(statusLabel(quote.status))}</span>
            <button class="icon-action-btn history-edit" data-history-action="edit" data-quote-id="${quote.id}" title="Editar orcamento">
              <svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"></path></svg>
            </button>
            <button class="icon-action-btn history-delete" data-history-action="delete" data-quote-id="${quote.id}" title="Excluir orcamento">
              <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
        </div>
        <div class="quote-body">
          <p><strong>Cliente:</strong> ${esc(quote.clientName || "Sem cliente")}</p>
          <p><strong>Valor:</strong> ${money(quote.totalToCharge)}</p>
          <p><strong>Pagamento:</strong> ${paymentMethodLabel(quote.paymentMethod)} | ${quote.installments || 1}x</p>
          <p><strong>Atualizado:</strong> ${dateTime(quote.updatedAt)}</p>
        </div>
      </article>
    `).join("");
  }
}

async function loadGestao() {
  await loadManagementOverview();
  openManagementSection("completed");
}

function statusBadgeClass(status) {
  if (status === "APPROVED") return "success";
  if (status === "SENT") return "warning";
  if (status === "COMPLETED") return "completed";
  if (status === "REJECTED") return "secondary";
  return "secondary";
}

function statusIconSvg(status) {
  if (status === "COMPLETED") return "✅";
  if (status === "APPROVED") return "✍️";
  if (status === "SENT") return "📤";
  if (status === "REJECTED") return "⛔";
  return "📄";
}

async function handleHistoryCardClick(e) {
  const actionBtn = e.target.closest("[data-history-action]");
  if (actionBtn) {
    const quoteIdFromAction = Number(actionBtn.dataset.quoteId);
    const action = clean(actionBtn.dataset.historyAction).toLowerCase();
    if (!quoteIdFromAction || !action) return;
    if (action === "edit") {
      await reopenQuoteForEditing(quoteIdFromAction);
      return;
    }
    if (action === "delete") {
      await deleteQuoteFromHistory(quoteIdFromAction);
      return;
    }
  }

  const card = e.target.closest("[data-quote-id]");
  if (!card) return;
  const quoteId = Number(card.dataset.quoteId);
  if (!quoteId) return;
  await openHistoryDetailModal(quoteId);
}

async function reopenQuoteForEditing(quoteId) {
  try {
    currentQuote = await api.reopenQuote(quoteId);
    customContractText = null;
    closeHistoryDetailModal();
    await showTab("orcamentos");
    showToast("Orcamento reaberto para edicao.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Erro ao reabrir orcamento para edicao");
  }
}

async function deleteQuoteFromHistory(quoteId) {
  try {
    await api.deleteQuote(quoteId);
    if (activeHistoryQuote?.id === quoteId) {
      closeHistoryDetailModal();
    }
    await loadHistory();
    showToast("Orcamento excluido com sucesso.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Erro ao excluir orcamento");
  }
}

async function openHistoryDetailModal(quoteId) {
  try {
    activeHistoryQuote = await api.getQuote(quoteId);
    renderHistoryDetailContent();
    document.getElementById("historyDetailModal")?.classList.add("active");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Erro ao abrir detalhes do orcamento");
  }
}

function closeHistoryDetailModal() {
  document.getElementById("historyDetailModal")?.classList.remove("active");
  activeHistoryQuote = null;
}

function renderHistoryDetailContent() {
  const root = document.getElementById("historyDetailContent");
  if (!root || !activeHistoryQuote) return;
  const quote = activeHistoryQuote;
  const t = quote.totals || {};
  const itemsRows = (quote.items || []).map((item) => `
    <tr>
      <td>${esc(item.name)}</td>
      <td>${item.quantity}</td>
      <td>${durationDaysLabel(item.estimatedDays)}</td>
      <td>${money(item.unitPrice)}</td>
      <td>${money(item.lineTotal)}</td>
    </tr>
  `).join("");

  root.innerHTML = `
    <h3>${esc(quote.title || "Projeto")}</h3>
    <p><strong>Status:</strong> ${statusIconSvg(quote.status)} ${esc(statusLabel(quote.status))}</p>
    <p><strong>Cliente:</strong> ${esc(quote.clientName || "Sem cliente")}</p>
    <p><strong>Pagamento:</strong> ${paymentMethodLabel(quote.paymentMethod)} | ${quote.installments || 1}x</p>
    <p><strong>Atualizado:</strong> ${dateTime(quote.updatedAt)}</p>
    <p><strong>Subtotal base:</strong> ${money(t.rawSubtotal)}</p>
    <p><strong>Subtotal negociado:</strong> ${money(t.negotiatedSubtotal)}</p>
    <p><strong>Total a cobrar:</strong> ${money(t.totalToCharge)}</p>
    <div class="history-detail-items">
      <table>
        <thead>
          <tr><th>Item</th><th>Qtd</th><th>Prazo</th><th>Unit.</th><th>Total</th></tr>
        </thead>
        <tbody>${itemsRows || '<tr><td colspan="5">Sem itens</td></tr>'}</tbody>
      </table>
    </div>
  `;

  document.querySelectorAll("#historyStatusActions .status-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.status === quote.status);
  });
}

async function handleHistoryStatusClick(e) {
  const btn = e.target.closest(".status-btn[data-status]");
  if (!btn || !activeHistoryQuote) return;
  const nextStatus = clean(btn.dataset.status).toUpperCase();
  if (!nextStatus || nextStatus === activeHistoryQuote.status) return;
  try {
    const updated = await api.updateQuoteConfig(activeHistoryQuote.id, { status: nextStatus });
    activeHistoryQuote = updated;
    renderHistoryDetailContent();
    showToast("Status do orcamento atualizado");
    await loadHistory();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Erro ao atualizar status");
  }
}

async function loadManagementOverview() {
  try {
    managementOverview = await api.getManagementOverview();
    startManagementClock(managementOverview?.serverTime);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Erro ao carregar painel de gestao");
  }
}

function startManagementClock(baseTime) {
  stopManagementClock();
  const startDate = new Date(baseTime || Date.now());
  const startedAt = Date.now();
  const tick = () => {
    const now = new Date(startDate.getTime() + (Date.now() - startedAt));
    setText("managementNow", dateTime(now));
    const nextEvent = managementOverview?.nextEvent;
    if (!nextEvent?.date) {
      setText("managementNextEvent", "Nenhum evento encontrado");
      return;
    }
    const eventDate = new Date(nextEvent.date);
    const diffMs = eventDate.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const diffHours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const diffMinutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
    setText(
      "managementNextEvent",
      `${nextEvent.label} em ${dateTime(eventDate)} (${Math.max(0, diffDays)}d ${Math.max(0, diffHours)}h ${Math.max(0, diffMinutes)}m)`
    );
  };
  tick();
  managementClockTimer = setInterval(tick, 1000);
}

function stopManagementClock() {
  if (managementClockTimer) {
    clearInterval(managementClockTimer);
    managementClockTimer = null;
  }
}

function startProposalClock() {
  stopProposalClock();
  const tick = () => {
    document.querySelectorAll("[data-proposal-now]").forEach((el) => {
      el.textContent = dateTime(new Date());
    });
  };
  tick();
  proposalClockTimer = setInterval(tick, 1000);
}

function stopProposalClock() {
  if (proposalClockTimer) {
    clearInterval(proposalClockTimer);
    proposalClockTimer = null;
  }
}

function openManagementSection(sectionKey) {
  if (!managementOverview) return;
  document.querySelectorAll(".management-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.id === `mgmt${sectionKey.charAt(0).toUpperCase()}${sectionKey.slice(1)}Btn`);
  });
  renderManagementSection(sectionKey);
}

function renderManagementSection(sectionKey) {
  const titleEl = document.getElementById("managementSectionTitle");
  const hintEl = document.getElementById("managementSectionHint");
  const listEl = document.getElementById("managementList");
  if (!titleEl || !hintEl || !listEl || !managementOverview) return;

  let title = "";
  let hint = "";
  let records = [];

  if (sectionKey === "completed") {
    title = "Clientes com projeto finalizado";
    hint = "Projetos concluidos com dados de contato e pagamento.";
    records = managementOverview.completedProjects || [];
  } else if (sectionKey === "events") {
    title = "Clientes com pacote de eventos";
    hint = "Clientes que contrataram o pacote para eventos sazonais.";
    records = managementOverview.eventsPack || [];
  } else if (sectionKey === "frontend") {
    title = "Cobranca mensal Front-End";
    hint = "Use WhatsApp, marque pago ou manter em cobranca.";
    records = managementOverview.frontendSupport || [];
  } else if (sectionKey === "fullstack") {
    title = "Cobranca mensal Full-Stack";
    hint = "Cobranca conjunta de Front-End e Back-End.";
    records = managementOverview.fullstackSupport || [];
  }

  titleEl.textContent = title;
  hintEl.textContent = hint;

  if (!records.length) {
    listEl.innerHTML = '<div class="empty-state"><p>Nenhum cliente nesta listagem.</p></div>';
    return;
  }

  listEl.innerHTML = records.map((record) => {
    const isFrontend = sectionKey === "frontend";
    const isFullstack = sectionKey === "fullstack";
    const billingStatus = isFullstack ? record.fullstackBillingStatus : record.frontendBillingStatus;
    const whatsappLink = buildManagementWhatsappLink(sectionKey, record);
    const canCharge = isFrontend || isFullstack;

    return `
      <article class="management-item">
        <div>
          <h4>${esc(record.companyName || "Empresa")}</h4>
          <p><strong>Cliente:</strong> ${esc(record.clientName || "-")}</p>
          <p><strong>Telefone:</strong> ${esc(record.phone || "-")}</p>
          <p><strong>Email:</strong> ${esc(record.email || "-")}</p>
          <p><strong>Pagamento:</strong> ${esc(record.payment || "-")}</p>
          <p><strong>Data:</strong> ${esc(dateTime(record.updatedAt))}</p>
          ${record.nextEvent?.label ? `<p><strong>Proximo evento:</strong> ${esc(record.nextEvent.label)} em ${esc(dateTime(record.nextEvent.date))}</p>` : ""}
        </div>
        <div class="management-actions-inline">
          ${canCharge ? `<span class="billing-status-pill ${esc(billingStatus)}">${esc(billingStatus)}</span>` : ""}
          ${canCharge ? `
            <a class="icon-action-btn whatsapp" href="${esc(whatsappLink)}" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.2A8.5 8.5 0 1 1 21 11.5z"></path></svg>
              WhatsApp
            </a>
            <button class="icon-action-btn charge" data-action="billing-status" data-mode="${isFullstack ? "fullstack" : "frontend"}" data-status="COBRAR" data-quote-id="${record.quoteId}">
              <svg viewBox="0 0 24 24"><path d="M12 1v22"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              Cobrar
            </button>
            <button class="icon-action-btn paid" data-action="billing-status" data-mode="${isFullstack ? "fullstack" : "frontend"}" data-status="PAGO" data-quote-id="${record.quoteId}">
              <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg>
              Pago
            </button>
          ` : ""}
        </div>
      </article>
    `;
  }).join("");
}

function buildManagementWhatsappLink(sectionKey, record) {
  const phone = clean(record.phoneDigits || "");
  const frontendMsg = "Oi, Vim falar que já está chengando o dia do pagamento do meu servico Front-End com o Valor R$100,00 Reais, caso já tenha efetuado o pagamento favor enviar o comprovante para dar baixa no sistema.";
  const fullstackMsg = "Oi, Vim fazer a cobranca referente ao servico Front-End e Back-End com o valor 200,00 Reais, caso ja tenha efetuado o pagamento favor enviar o comprovante para dar baixa no sistema.";
  const text = sectionKey === "fullstack" ? fullstackMsg : frontendMsg;
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : "#";
}

async function handleManagementListClick(e) {
  const btn = e.target.closest("[data-action='billing-status']");
  if (!btn) return;
  const quoteId = Number(btn.dataset.quoteId);
  const mode = clean(btn.dataset.mode);
  const status = clean(btn.dataset.status).toUpperCase();
  if (!quoteId || !status) return;
  try {
    const payload = mode === "fullstack"
      ? { fullstackBillingStatus: status }
      : { frontendBillingStatus: status };
    await api.updateQuoteBilling(quoteId, payload);
    showToast("Status de cobranca atualizado");
    await loadManagementOverview();
    renderManagementSection(mode === "fullstack" ? "fullstack" : "frontend");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Erro ao atualizar cobranca");
  }
}

function openCatalogServiceModalForCreate() {
  document.getElementById("catalogServiceModalTitle").textContent = "Novo Servico";
  document.getElementById("catalogServiceId").value = "";
  document.getElementById("catalogServiceName").value = "";
  document.getElementById("catalogServiceCategory").value = "";
  document.getElementById("catalogServiceDescription").value = "";
  document.getElementById("catalogServiceType").value = "MODULE";
  document.getElementById("catalogServicePrice").value = "";
  document.getElementById("catalogServiceEstimatedDays").value = "";
  document.getElementById("catalogServiceModal").classList.add("active");
}

function closeCatalogServiceModal() {
  document.getElementById("catalogServiceModal").classList.remove("active");
}

function openCatalogServiceModalForEdit(serviceId) {
  const id = Number(serviceId);
  if (!id) return;
  const service = services.find((item) => item.id === id);
  if (!service) {
    showToast("Servico nao encontrado");
    return;
  }
  document.getElementById("catalogServiceModalTitle").textContent = "Editar Servico";
  document.getElementById("catalogServiceId").value = String(service.id);
  document.getElementById("catalogServiceName").value = service.name || "";
  document.getElementById("catalogServiceCategory").value = service.category || "";
  document.getElementById("catalogServiceDescription").value = service.description || "";
  document.getElementById("catalogServiceType").value = service.type || "MODULE";
  document.getElementById("catalogServicePrice").value = String(service.price || "");
  document.getElementById("catalogServiceEstimatedDays").value = String(service.estimatedDays || "");
  document.getElementById("catalogServiceModal").classList.add("active");
}

async function saveCatalogServiceForm(e) {
  e.preventDefault();
  const id = Number(document.getElementById("catalogServiceId").value || 0);
  const payload = {
    name: clean(document.getElementById("catalogServiceName").value),
    category: clean(document.getElementById("catalogServiceCategory").value),
    description: clean(document.getElementById("catalogServiceDescription").value),
    type: clean(document.getElementById("catalogServiceType").value).toUpperCase(),
    price: Number(document.getElementById("catalogServicePrice").value),
    estimatedDays: Number(document.getElementById("catalogServiceEstimatedDays").value)
  };

  if (!payload.name || !payload.category || !payload.description) {
    showToast("Nome, categoria e descricao sao obrigatorios");
    return;
  }
  if (!Number.isFinite(payload.price) || payload.price <= 0) {
    showToast("Preco invalido");
    return;
  }
  if (!Number.isInteger(payload.estimatedDays) || payload.estimatedDays <= 0) {
    showToast("Prazo em dias invalido");
    return;
  }

  if (id > 0) {
    await api.updateCatalogItem(id, payload);
    showToast("Servico atualizado");
  } else {
    await api.createCatalogItem(payload);
    showToast("Servico criado");
  }

  closeCatalogServiceModal();
  await loadCatalog((document.getElementById("catalogSearch")?.value || "").trim());
}

function openClientCreateModal() {
  document.getElementById("clientCreateForm").reset();
  document.getElementById("createClientDocumentType").value = "CPF";
  document.getElementById("clientCreateModal").classList.add("active");
}

function closeClientCreateModal() {
  document.getElementById("clientCreateModal").classList.remove("active");
}

async function saveClientCreateForm(e) {
  e.preventDefault();
  const rawDocument = clean(document.getElementById("createClientDocumentNumber").value);
  const digits = rawDocument.replace(/\D/g, "");
  const payload = {
    name: clean(document.getElementById("createClientName").value),
    companyName: clean(document.getElementById("createClientCompanyName").value),
    email: clean(document.getElementById("createClientEmail").value),
    phone: clean(document.getElementById("createClientPhone").value),
    documentType: clean(document.getElementById("createClientDocumentType").value).toUpperCase() || (digits.length <= 11 ? "CPF" : "CNPJ"),
    documentNumber: digits,
    addressZipCode: clean(document.getElementById("createClientAddressZipCode").value),
    addressState: clean(document.getElementById("createClientAddressState").value).toUpperCase(),
    addressCity: clean(document.getElementById("createClientAddressCity").value),
    addressDistrict: clean(document.getElementById("createClientAddressDistrict").value),
    addressStreet: clean(document.getElementById("createClientAddressStreet").value),
    addressNumber: clean(document.getElementById("createClientAddressNumber").value),
    addressComplement: clean(document.getElementById("createClientAddressComplement").value),
    notes: ""
  };

  if (
    !payload.name ||
    !payload.companyName ||
    !payload.email ||
    !payload.phone ||
    !payload.documentNumber ||
    !payload.addressZipCode ||
    !payload.addressState ||
    !payload.addressCity ||
    !payload.addressDistrict ||
    !payload.addressStreet ||
    !payload.addressNumber
  ) {
    showToast("Preencha os campos obrigatorios do cliente");
    return;
  }

  await api.createClient(payload);
  closeClientCreateModal();
  await loadClients((document.getElementById("clientSearch")?.value || "").trim());
  await loadClientSelect();
  showToast("Cliente criado");
}

function resolveQuoteClient() {
  if (currentQuote?.client) return currentQuote.client;
  if (!currentQuote?.clientId) return {};
  return clients.find((c) => c.id === currentQuote.clientId) || {};
}

function sameNormalizedText(a, b) {
  const left = clean(a).toLowerCase();
  const right = clean(b).toLowerCase();
  if (!left || !right) return false;
  return left === right;
}

function resolveClientDisplayName(quoteClientName, client = {}) {
  const storedName = clean(quoteClientName);
  const personName = clean(client?.name);
  const companyName = clean(client?.companyName);

  if (personName && (!storedName || (companyName && sameNormalizedText(storedName, companyName)))) {
    return personName;
  }

  if (storedName && (!companyName || !sameNormalizedText(storedName, companyName))) {
    return storedName;
  }

  return personName || "";
}

function resolveCompanyDisplayName(quoteClientName, client = {}) {
  const companyName = clean(client?.companyName);
  const personName = clean(client?.name);
  const storedName = clean(quoteClientName);
  if (companyName) return companyName;
  if (storedName && (!personName || !sameNormalizedText(storedName, personName))) return storedName;
  return personName || "";
}

function resolveQuoteParties() {
  const client = resolveQuoteClient();
  const companyNameRaw = resolveCompanyDisplayName(currentQuote?.clientName, client);
  const clientNameRaw = resolveClientDisplayName(currentQuote?.clientName, client);
  return {
    client,
    clientName: clientNameRaw || "Cliente nao informado",
    companyName: companyNameRaw || clientNameRaw || "Empresa nao informada"
  };
}

function syncQuoteClientNameFromSelect(force = false) {
  const select = document.getElementById("quoteClientId");
  const input = document.getElementById("quoteClientName");
  if (!select || !input) return;
  const selected = clients.find((item) => String(item.id) === String(select.value));
  if (!force && clean(input.value)) return;
  const selectedClientName = clean(selected?.name);
  const selectedCompanyName = clean(selected?.companyName);
  input.value = selectedClientName && !sameNormalizedText(selectedClientName, selectedCompanyName)
    ? selectedClientName
    : "";
}

function syncMachineFeeControlsState() {
  const hasMachineFee = Boolean(document.getElementById("quoteHasMachineFee")?.checked);
  const machineFeeInput = document.getElementById("quoteMachineFeePercent");
  const passFeeCheck = document.getElementById("quotePassMachineFeeToClient");
  if (machineFeeInput) {
    machineFeeInput.disabled = !hasMachineFee;
    if (!hasMachineFee) machineFeeInput.value = "0";
  }
  if (passFeeCheck) {
    passFeeCheck.disabled = !hasMachineFee;
    if (!hasMachineFee) passFeeCheck.checked = false;
  }
}

function renderQuotePreview() {
  const root = document.getElementById("quotePreview");
  if (!root || !currentQuote) return;
  const provider = providerData();
  const { client, clientName, companyName } = resolveQuoteParties();
  const clientDoc = clean(client.documentNumber) || "00.000.000/0000-00";
  const clientAddress = client.contractAddress || "Endereco completo da contratante";
  const emissionDateTime = dateTime(new Date());
  const itemsRows = (currentQuote.items || []).map((item) => `
    <tr><td>${esc(item.name)}</td><td>${item.quantity}</td><td>${durationDaysLabel(item.estimatedDays)}</td><td>${money(item.unitPrice)}</td><td>${money(item.lineTotal)}</td></tr>
  `).join("");
  const t = currentQuote.totals || {};
  const totalEstimatedDays = sumEstimatedDays(currentQuote.items || []);
  const pricingTierLabel = currentQuote.pricingTier || "MVP";
  const installmentValue = Number(t.installmentValue || (Number(t.totalToCharge || 0) / Math.max(1, Number(currentQuote.installments || 1))));
  const scheduleLines = (currentQuote.items || []).map((item) => `<li>${esc(item.name)}: ${durationDaysLabel(item.estimatedDays)}</li>`).join("");
  const legalContractText = customContractText ?? buildLegalContractText({
    provider,
    clientCompanyName: companyName,
    clientName,
    clientDoc,
    clientAddress,
    totalEstimatedDays,
    totalToCharge: Number(t.totalToCharge || 0),
    netAmount: Number(t.netAmount || 0),
    machineFee: Number(t.machineFee || 0),
    machineFeePercent: Number(currentQuote.machineFeePercent || 0),
    hasMachineFee: Boolean(currentQuote.hasMachineFee),
    passMachineFeeToClient: Boolean(currentQuote.passMachineFeeToClient),
    paymentMethod: currentQuote.paymentMethod || "PIX",
    installments: Math.max(1, Number(currentQuote.installments || 1)),
    installmentValue,
    frontendSupportContracted: Boolean(currentQuote.frontendSupportContracted),
    backendSupportContracted: Boolean(currentQuote.backendSupportContracted)
  });

  root.innerHTML = `
    <article class="proposal-printable" id="proposalPrintable">
      <p class="proposal-view-title">Visualizacao do orcamento para cliente</p>
      <header class="proposal-header">
        <div class="proposal-brand">
          <div class="proposal-logo-wrap">
            <img src="/img/logo-jp.png" alt="Logo JP" class="proposal-logo" />
          </div>
          <div class="proposal-brand-info">
            <h2>Proposta Comercial</h2>
            <p>Planejamento, desenvolvimento e entrega profissional</p>
            <p><strong>${esc(provider.displayName)}</strong></p>
            <p>E-mail: ${esc(provider.email)}</p>
            <p>Telefone: ${esc(provider.phone)}</p>
            <p><strong>Data da emissao</strong><br><span class="proposal-emission-datetime" data-proposal-now>${esc(emissionDateTime)}</span></p>
          </div>
        </div>
        <div class="proposal-meta">
          <p><strong>${esc(currentQuote.title || "Projeto sem titulo")}</strong></p>
          <p>Empresa: ${esc(companyName)}</p>
          <p>Cliente: ${esc(clientName)}</p>
        </div>
      </header>

      <section class="proposal-client">
        <p><strong>${esc(currentQuote.title || "Projeto sem titulo")}</strong></p>
        <p>Empresa: ${esc(companyName)}</p>
        <p>Cliente: ${esc(clientName)}</p>
      </section>

      <section class="proposal-table-wrap">
        <table class="proposal-table">
          <thead><tr><th>Item</th><th>Qtd</th><th>Prazo</th><th>Unit.</th><th>Total</th></tr></thead>
          <tbody>${itemsRows || '<tr><td colspan="5">Nenhum item adicionado.</td></tr>'}</tbody>
        </table>
      </section>

      <section class="proposal-schedule">
        <h3>Cronograma estimado por servico contratado</h3>
        <ul>${scheduleLines || "<li>Nenhum servico contratado.</li>"}</ul>
      </section>

      <section class="proposal-totals">
        ${totalLine("Subtotal base", t.rawSubtotal)}
        ${totalLine(`Faixa de preco (${esc(pricingTierLabel)})`, t.tierImpact)}
        ${totalLine("Ajuste manual", t.adjustmentValue)}
        ${totalLine("Desconto", t.discountValue)}
        ${totalLine("Subtotal negociado", t.negotiatedSubtotal)}
        ${totalLine("Taxa maquininha", t.machineFee)}
        ${totalLine("Total a cobrar", t.totalToCharge, true)}
        ${totalLine("Liquido previsto", t.netAmount)}
        <div class="proposal-total-line"><span>Pagamento</span><strong>${paymentMethodLabel(currentQuote.paymentMethod)} | ${currentQuote.installments || 1}x de ${money(installmentValue)}</strong></div>
      </section>

      <section class="proposal-contract">
        <div class="contract-header">
          <button type="button" class="contract-edit-btn" id="contractEditBtn" title="Editar contrato">
            <svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>
          </button>
        </div>
        <pre class="contract-legal" id="contractLegalText">${esc(legalContractText)}</pre>
        <textarea class="contract-legal contract-edit-area hidden" id="contractEditArea"></textarea>
        <div class="contract-edit-actions hidden" id="contractEditActions">
          <button type="button" class="btn-secondary" id="contractCancelBtn">Cancelar</button>
          <button type="button" class="btn-primary" id="contractSaveBtn">Salvar</button>
        </div>
      </section>

      <section class="proposal-terms">
        <h3>Termos de suporte e atendimento</h3>
        <ul>${buildSupportTermsLines().map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
      </section>

      <section class="proposal-signature">
        <h3>Assinatura do cliente</h3>
        <p>Nome: __________________________________________</p>
        <p>Data: ____/____/______</p>
      </section>
    </article>
  `;
  const orcamentosTab = document.getElementById("orcamentos-tab");
  if (orcamentosTab?.classList.contains("active")) {
    startProposalClock();
  } else {
    stopProposalClock();
  }

  // Bind contrato edit
  document.getElementById("contractEditBtn")?.addEventListener("click", openContractEdit);
  document.getElementById("contractCancelBtn")?.addEventListener("click", cancelContractEdit);
  document.getElementById("contractSaveBtn")?.addEventListener("click", saveContractEdit);
}

let customContractText = null;

function openContractEdit() {
  const pre = document.getElementById("contractLegalText");
  const area = document.getElementById("contractEditArea");
  const actions = document.getElementById("contractEditActions");
  const btn = document.getElementById("contractEditBtn");
  if (!pre || !area || !actions) return;
  area.value = pre.textContent;
  pre.classList.add("hidden");
  area.classList.remove("hidden");
  actions.classList.remove("hidden");
  btn.classList.add("hidden");
  area.focus();
}

function cancelContractEdit() {
  const pre = document.getElementById("contractLegalText");
  const area = document.getElementById("contractEditArea");
  const actions = document.getElementById("contractEditActions");
  const btn = document.getElementById("contractEditBtn");
  if (!pre || !area || !actions) return;
  area.classList.add("hidden");
  actions.classList.add("hidden");
  pre.classList.remove("hidden");
  btn.classList.remove("hidden");
}

function saveContractEdit() {
  const pre = document.getElementById("contractLegalText");
  const area = document.getElementById("contractEditArea");
  const actions = document.getElementById("contractEditActions");
  const btn = document.getElementById("contractEditBtn");
  if (!pre || !area || !actions) return;
  customContractText = area.value;
  pre.textContent = customContractText;
  area.classList.add("hidden");
  actions.classList.add("hidden");
  pre.classList.remove("hidden");
  btn.classList.remove("hidden");
  showToast("Contrato atualizado");
}

function totalLine(label, value, highlight = false) {
  return `<div class="proposal-total-line${highlight ? " highlight" : ""}"><span>${esc(label)}</span><strong>${money(value)}</strong></div>`;
}

function buildSupportTermsLines() {
  const lines = [];
  lines.push(termsOptions.monthlyPlanContracted ? "Projeto com plano mensal contratado." : "Projeto sem plano mensal contratado.");
  lines.push("Todos os chamados serao atendidos com cobranca de R$ 250,00 por hora de atendimento tecnico.");
  lines.push("Chamados de duvida simples do site com ate 25 minutos nao possuem cobranca.");
  lines.push("Se a duvida passar de 25 minutos, aplica-se taxa adicional de R$ 50,00.");
  lines.push("Novas funcoes, novos botoes e qualquer evolucao fora do escopo terao orcamento separado por servico.");
  lines.push(
    termsOptions.eventsPackContracted
      ? "Pacote de eventos populares (Ano Novo, Carnaval, Pascoa, Dia das Maes, Dia dos Namorados, Dia dos Pais, Halloween e Natal) contratado: R$ 200,00 por mes."
      : "Pacote de eventos populares (Ano Novo, Carnaval, Pascoa, Dia das Maes, Dia dos Namorados, Dia dos Pais, Halloween e Natal) nao contratado."
  );
  lines.push(
    termsOptions.backendSupportContracted
      ? "Suporte mensal de back-end contratado: R$ 100,00 por mes."
      : "Suporte mensal de back-end nao contratado."
  );
  lines.push(
    termsOptions.frontendSupportContracted
      ? "Suporte mensal de front-end contratado: R$ 100,00 por mes."
      : "Suporte mensal de front-end nao contratado."
  );
  lines.push("Dominio e criacao/compra de logo sao de responsabilidade financeira da contratante.");
  return lines;
}

function normalizeEstimatedDays(value) {
  const parsed = Math.round(Number(value || 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
}

function durationDaysLabel(days) {
  const safeDays = normalizeEstimatedDays(days);
  const weeksRaw = safeDays / 7;
  if (safeDays < 7) {
    return `${safeDays} dia(s)`;
  }
  const weeksRounded = Number.isInteger(weeksRaw) ? weeksRaw : Math.round(weeksRaw * 10) / 10;
  const weekLabel = weeksRounded === 1 ? "semana" : "semanas";
  const weeksText = String(weeksRounded).replace(".", ",");
  return `${safeDays} dia(s) (~${weeksText} ${weekLabel})`;
}

function sumEstimatedDays(items) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items.reduce((acc, item) => {
    const recurringName = clean(item?.name).toLowerCase();
    const isRecurringService = recurringName.includes("mensal") || recurringName.includes("/mes") || recurringName.includes(" mes");
    if (isRecurringService) return acc;
    const days = normalizeEstimatedDays(item?.estimatedDays);
    const quantity = Math.max(1, Math.round(Number(item?.quantity || 1)));
    return acc + (days * quantity);
  }, 0);
}

function formatDateOnly(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR");
}

function formatTimeOnly(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("pt-BR", { hour12: false });
}

function buildCopyProposalText() {
  if (!currentQuote) return "";
  const t = currentQuote.totals || {};
  const { clientName, companyName } = resolveQuoteParties();
  const installmentCount = Math.max(1, Number(currentQuote.installments || 1));
  const installmentValue = Number(t.installmentValue || (Number(t.totalToCharge || 0) / installmentCount));
  const itemsLines = (currentQuote.items || []).map(
    (item, index) => `${index + 1}. ${item.name} | ${item.quantity}x ${money(item.unitPrice)} = ${money(item.lineTotal)}`
  );
  const observacoes = clean(currentQuote.notes) || "Esse seria o valor caso fossemos fechar o contrato.";
  const separator = "=".repeat(60);
  const separatorThin = "-".repeat(60);

  return [
    separator,
    "PROPOSTA COMERCIAL",
    separator,
    `Projeto: ${currentQuote.title || "Projeto sem titulo"}`,
    `Empresa: ${companyName}`,
    `Cliente: ${clientName}`,
    `Status: ${statusLabel(currentQuote.status)}`,
    `Atualizado em: ${dateTime(currentQuote.updatedAt)}`,
    separatorThin,
    "ESCOPO DO PROJETO",
    separatorThin,
    ...(itemsLines.length > 0 ? itemsLines : ["Nenhum item adicionado."]),
    separatorThin,
    "RESUMO FINANCEIRO",
    separatorThin,
    `Subtotal base: ${money(t.rawSubtotal)}`,
    `Impacto da faixa (${currentQuote.pricingTier || "MVP"}): ${money(t.tierImpact)}`,
    `Ajuste manual: ${money(t.adjustmentValue)}`,
    `Desconto: ${money(t.discountValue)}`,
    `Subtotal negociado: ${money(t.negotiatedSubtotal)}`,
    `Taxa maquininha: ${money(t.machineFee)}`,
    `Total a cobrar: ${money(t.totalToCharge)}`,
    `Liquido previsto: ${money(t.netAmount)}`,
    separatorThin,
    "PAGAMENTO",
    separatorThin,
    `Forma de pagamento: ${paymentMethodLabel(currentQuote.paymentMethod)}`,
    `Parcelamento: ${installmentCount}x de ${money(installmentValue)}`,
    Number(t.machineFee || 0) > 0 ? `Taxa maquininha aplicada: ${money(t.machineFee)}` : "Sem taxa de maquininha",
    separatorThin,
    `Observacoes: ${observacoes}`,
    separator
  ].join("\n");
}

function getContractBasePhaseTotalDays() {
  return CONTRACT_PHASES.reduce((acc, phase) => acc + Math.max(0, Number(phase.baseDays || 0)), 0);
}

function buildContractPhaseDurations(totalDays) {
  const baseDays = CONTRACT_PHASES.map((phase) => normalizeEstimatedDays(phase.baseDays));
  const baseTotal = baseDays.reduce((acc, day) => acc + day, 0);
  const targetDays = Math.max(baseTotal, normalizeEstimatedDays(totalDays || baseTotal));

  if (targetDays === baseTotal) {
    return baseDays;
  }

  const scaled = baseDays.map((day) => (day * targetDays) / baseTotal);
  const floored = scaled.map((value) => Math.floor(value));
  let remaining = targetDays - floored.reduce((acc, day) => acc + day, 0);
  const priority = scaled
    .map((value, index) => ({ index, fraction: value - floored[index] }))
    .sort((a, b) => b.fraction - a.fraction);

  let cursor = 0;
  while (remaining > 0) {
    const phase = priority[cursor % priority.length];
    floored[phase.index] += 1;
    remaining -= 1;
    cursor += 1;
  }

  return floored.map((day) => Math.max(1, day));
}

function buildContractPhasesText(phaseDurations) {
  return CONTRACT_PHASES.map((phase, index) => {
    const phaseDays = normalizeEstimatedDays(phaseDurations?.[index] || phase.baseDays);
    return `${phase.title} - ${phase.description}\n${phase.durationPrefix}: ${durationDaysLabel(phaseDays)}.`;
  }).join("\n\n");
}

function numPorExtenso(n) {
  const ext = ["zero","uma","duas","tres","quatro","cinco","seis","sete","oito","nove","dez",
    "onze","doze","treze","quatorze","quinze","dezesseis","dezessete","dezoito","dezenove","vinte",
    "vinte e uma","vinte e duas","vinte e tres","vinte e quatro"];
  return ext[n] || String(n);
}

function buildLegalContractText({ provider, clientCompanyName, clientName, clientDoc, clientAddress, totalEstimatedDays, totalToCharge, netAmount, machineFee, machineFeePercent, hasMachineFee, passMachineFeeToClient, paymentMethod, installments, installmentValue, frontendSupportContracted, backendSupportContracted }) {
  const pName = clean(provider?.displayName) || "SUA EMPRESA";
  const pCnpj = clean(provider?.cnpj) || "00.000.000/0000-00";
  const pAddress = clean(provider?.address) || "SEU ENDERECO COMPLETO";
  const pCity = clean(provider?.city) || "SUA CIDADE";
  const cCompanyName = clean(clientCompanyName) || "EMPRESA CONTRATANTE";
  const cClientName = clean(clientName) || "CLIENTE CONTRATANTE";
  const cDoc = clean(clientDoc) || "00.000.000/0000-00";
  const cAddress = clean(clientAddress) || "ENDERECO COMPLETO DA CONTRATANTE";
  const totalAmount = Number(totalToCharge || 0);
  const netAmt = Number(netAmount || 0);
  const machFee = Number(machineFee || 0);
  const installCount = Math.max(1, Number(installments || 1));
  const installVal = Number(installmentValue || (totalAmount / installCount));
  const projectEstimatedDays = Math.max(0, Number(totalEstimatedDays || 0));
  const contractBaseDays = getContractBasePhaseTotalDays();
  const totalContractDays = Math.max(contractBaseDays, projectEstimatedDays || contractBaseDays || 30);
  const phaseDurations = buildContractPhaseDurations(totalContractDays);
  const computedTotalDays = phaseDurations.reduce((acc, day) => acc + normalizeEstimatedDays(day), 0);
  const totalDaysLabel = durationDaysLabel(computedTotalDays);
  const phasesText = buildContractPhasesText(phaseDurations);

  const pmLabel = paymentMethodLabel(paymentMethod || "PIX");
  let paymentClauseFifth;
  if (installCount > 1) {
    paymentClauseFifth = `pagamento inicial de ${money(installVal)} e restante a ser pago ao fim da 3\u00aa fase, via ${pmLabel}`;
  } else {
    paymentClauseFifth = `pagamento unico de ${money(totalAmount)} via ${pmLabel}`;
  }

  const machineClause = hasMachineFee && machFee > 0
    ? (passMachineFeeToClient
      ? `\n   Obs.: O valor acima ja inclui a taxa de maquininha de ${formatPercent(machineFeePercent)}% (${money(machFee)}), repassada ao cliente. O valor liquido recebido pelo prestador sera de ${money(netAmt)}.`
      : `\n   Obs.: O valor cobrado e ${money(totalAmount)}. Sobre este valor incide taxa de maquininha de ${formatPercent(machineFeePercent)}% (${money(machFee)}), arcada pelo prestador. O valor liquido recebido sera de ${money(netAmt)}.`)
    : "";

  const hasFrontend = Boolean(frontendSupportContracted);
  const hasBackend = Boolean(backendSupportContracted);
  let supportClause = "";
  if (hasFrontend && hasBackend) {
    supportClause = `\n\nCLAUSULA DECIMA SEGUNDA: SUPORTE MENSAL\n\n1\u00ba - A CONTRATANTE contratou plano de suporte mensal Full-Stack (Front-End e Back-End), no valor de R$ 200,00 por mes, com vigencia mensal renovavel.\n2\u00ba - O suporte mensal abrange acompanhamento de interface, ajustes visuais, estabilidade de servidor, API e banco de dados, conforme escopo do plano contratado.\n3\u00ba - Chamados de duvida simples com ate 25 minutos nao possuem cobranca adicional. Acima desse limite, sera cobrada taxa adicional de R$ 50,00 por atendimento.\n4\u00ba - Novas funcionalidades, integracoes ou alteracoes fora do escopo do suporte serao orcadas separadamente.`;
  } else if (hasFrontend) {
    supportClause = `\n\nCLAUSULA DECIMA SEGUNDA: SUPORTE MENSAL\n\n1\u00ba - A CONTRATANTE contratou plano de suporte mensal de Front-End, no valor de R$ 100,00 por mes, com vigencia mensal renovavel.\n2\u00ba - O suporte mensal abrange acompanhamento de interface, ajustes visuais e comportamento das telas.\n3\u00ba - Chamados de duvida simples com ate 25 minutos nao possuem cobranca adicional. Acima desse limite, sera cobrada taxa adicional de R$ 50,00 por atendimento.\n4\u00ba - Novas funcionalidades ou alteracoes fora do escopo do suporte serao orcadas separadamente.`;
  } else if (hasBackend) {
    supportClause = `\n\nCLAUSULA DECIMA SEGUNDA: SUPORTE MENSAL\n\n1\u00ba - A CONTRATANTE contratou plano de suporte mensal de Back-End, no valor de R$ 100,00 por mes, com vigencia mensal renovavel.\n2\u00ba - O suporte mensal abrange acompanhamento de servidor, API e banco de dados.\n3\u00ba - Chamados de duvida simples com ate 25 minutos nao possuem cobranca adicional. Acima desse limite, sera cobrada taxa adicional de R$ 50,00 por atendimento.\n4\u00ba - Novas funcionalidades ou alteracoes fora do escopo do suporte serao orcadas separadamente.`;
  }

  return `CONTRATO DE PRESTACAO DE SERVICOS
DEFINICAO: Esse contrato visa documentar a proposta de prestacao de servicos, apresentada pela CONTRATADA e aceita previamente pela CONTRATANTE, contendo todas as informacoes acerca da metodologia de trabalho, do cronograma de atividades, dos recursos necessarios para a execucao do servico, bem como as descricoes das condicoes de pagamento e prazos previamente definidos.

CONTRATADA: ${pName}, de CNPJ: ${pCnpj}, endereco: ${pAddress}.
CONTRATANTE: ${cCompanyName}, de CPF/CNPJ: ${cDoc}, endereco: ${cAddress}.
REPRESENTANTE DA CONTRATANTE: ${cClientName}.

CLAUSULA PRIMEIRA: DA PRESTACAO DE SERVICOS

1º - O servico a ser prestado pela CONTRATADA e o projeto de desenvolvimento do site da CONTRATANTE, com o objetivo de aumentar o relacionamento on-line com seus clientes e parceiros de negocios, oferecendo os servicos e produtos da empresa, alem de divulgar a mesma atraves da internet.
2º - O desenvolvimento do projeto pela CONTRATADA, dar-se-a a partir de informacoes cedidas pela CONTRATANTE, tais como: conteudo, imagens, dados institucionais, etc.
3º - O servico preve a criacao de um sistema, website, e-commerce ou plataforma digital, bem como outro tipo de servico. Quaisquer detalhes adicionais a respeito dos servicos previstos, estao sob flexibilidade de comum acordo entre a CONTRATANTE e a CONTRATADA. Todas as funcionalidades previstas estao anexadas a este contrato.

CLAUSULA SEGUNDA: DAS CONDICOES DA PRESTACAO DOS SERVICOS

Item I - Obrigacoes da CONTRATADA

1º - Utilizar recursos que facilitem a navegacao entre as paginas, tratamento de imagens, codificacao e programacao visual, oferecendo ao projeto, usabilidade, tecnologia e design diferenciado.
2º - A CONTRATADA realizara servicos de manutencao, suporte ou monitoramento apenas mediante contratacao especifica e vigente para tais finalidades, nao sendo responsavel pela manutencao continua do sistema apos a entrega do projeto sem contratacao de plano de suporte correspondente.

Item II - Obrigacoes da CONTRATANTE

1º - Fornecimento a CONTRATADA, de todas as informacoes e elementos necessarios ao inicio e ao desenvolvimento do projeto, em suporte digital compativel com PCs, dentro de um periodo de 15 dias a partir da assinatura deste contrato, tempo razoavel para evitar atrasos ou interrupcoes dos prazos estabelecidos no cronograma.
2º - Fornecer a CONTRATADA, de acordo com a periodicidade necessaria, todos os textos de atualizacao, no caso de contrato de manutencao, a serem veiculados no site com antecedencia minima de 7 dias de sua data de publicacao solicitada, devidamente assinados por pessoa autorizada da CONTRATANTE, eximida a CONTRATADA de qualquer responsabilidade neste sentido;
3º - Cumprir os prazo estipulados, neste contrato, para pagamentos e entrega de material.
4º - Fornecer manual de identidade visual e todo o material complementar como textos e fotos que sejam necessarios a elaboracao do site;
5º - A CONTRATANTE e livre para sugerir todo e qualquer conteudo informativo de suas paginas, sendo ela integralmente responsavel pelos efeitos provenientes destas informacoes, respondendo civil e criminalmente por atos contrarios a lei, propaganda enganosa, atos obscenos e violacao de direitos autorais.

Item III - NAO CUMPRIMENTO DAS OBRIGACOES:

1º - O nao pagamento das parcelas acordadas, sujeitara a CONTRATANTE ao pagamento de multa moratoria e nao compensatoria no valor de 5% (cinco por cento) sobre o valor do debito, alem de juros de mora de 1% (um por cento) ao mes.
2º - O eventual atraso na execucao do projeto nao gera devolucao automatica dos valores pagos, devendo as partes buscar solucao amigavel para readequacao dos prazos, salvo comprovado abandono injustificado do projeto pela CONTRATADA.

CLAUSULA TERCEIRA: PRAZOS

1º - O prazo total de desenvolvimento do site esta estimado em ${totalDaysLabel} (contados a partir da assinatura deste contrato).
2º - O prazo maximo previsto para entrega dos materiais solicitados (textos, imagens ou graficos) sera de 15 dias apos a assinatura deste contrato. Quaisquer atrasos na entrega destes materiais, acarretarao em prorrogacao do prazo de entrega na mesma proporcao dos atrasos em questao.
3º - A vigencia do presente contrato esta estabelecida na proposta, previamente acordada, a se iniciar no momento de sua aceitacao pela CONTRATANTE, podendo ser modificado em decorrencia de imposicao legal, motivo de ordem tecnica ou de comum acordo entre as partes, por meio de termo aditivo, podendo implicar na alteracao de seu valor.

CLAUSULA QUARTA: CRONOGRAMA

1º - O cronograma proposto para a concretizacao deste projeto seguira o prazo definido para as seguintes fases:

${phasesText}

3º - Caso o cronograma se estenda por mais de um mes do prazo estabelecido, por motivos de atrasos de entrega de conteudo ou outro motivo por parte da CONTRATANTE, sera feito um novo orcamento, para aprovacao da CONTRATANTE do pagamento de horas adicionais, sendo R$ 100,00 o valor da hora tecnica.

4º - O inicio de cada etapa estara condicionado a aprovacao, por escrito, da etapa anterior. Ou seja: ao final de cada etapa do projeto, sera enviado um documento para que a CONTRATANTE assine, concordando com o trabalho executado na referida etapa. Para o caso de alteracoes apos a assinatura da aprovacao, horas tecnicas adicionais serao cobradas a parte, mediante a autorizacao da CONTRATANTE, sendo R$ 100,00 o valor da hora tecnica;
As aprovacoes das etapas poderao ocorrer por assinatura fisica, assinatura eletronica, e-mail, WhatsApp ou qualquer outro meio eletronico que permita comprovacao da manifestacao da CONTRATANTE.

5º - Caso a CONTRATANTE nao apresente manifestacao sobre a entrega da etapa em ate 7 (sete) dias corridos apos seu recebimento, a etapa sera considerada aprovada automaticamente para fins de continuidade do cronograma.

CLAUSULA QUINTA: VALORES E FORMAS DE PAGAMENTO:

1º - Pelos servicos prestados a CONTRATANTE pagara a CONTRATADA o valor total de ${money(totalAmount)}, com ${paymentClauseFifth}.${machineClause}
2º - Estao inclusos todos os encargos e impostos.
3º - Os valores pagos correspondem as etapas efetivamente executadas. Em caso de rescisao contratual, sera considerado o percentual do projeto ja desenvolvido para definicao das obrigacoes remanescentes entre as partes.
4º - A CONTRATADA podera extinguir o presente contrato, a qualquer tempo, mediante previa notificacao a CONTRATANTE sempre que, a seu criterio, considerar caracterizado algum tipo de infracao aos dispositivos constantes deste presente contrato.
5º - A CONTRATADA podera suspender imediatamente a execucao dos servicos em caso de atraso superior a 10 (dez) dias no pagamento de qualquer parcela prevista neste contrato.

OBS.: A CONTRATANTE devera estar ciente de que a CONTRATADA somente realizara os itens do sistema desejado pelo mesmo, que constarem na proposta em anexo. Qualquer pedido adicional sera cobrado separadamente do documento, mediante a previa autorizacao da CONTRATANTE.

CLAUSULA SEXTA: RESCISAO DE CONTRATO

1º - Em caso de rescisao por iniciativa da CONTRATANTE, os valores ja pagos nao serao devolvidos, sendo devido o pagamento proporcional as etapas ja executadas ate a data da rescisao.
2º - O presente contrato podera ser considerado rescindido de pleno direito, na ocorrencia de inadimplencia ou nao cumprimento de prazos por uma das partes;
3º - O presente contrato podera ser rescindido por extincao de qualquer das partes, decretacao de concordata ou falencia; decurso natural do prazo, caso nao seja renovado automaticamente; denuncia manifestada expressamente pela parte interessada a parte infratora, com antecedencia minima de 5 (cinco) dias, nos casos em que nao for respeitada, pela parte infratora, qualquer uma das clausulas anteriores.

CLAUSULA SETIMA: DISPOSICOES GERAIS

1º - Apos a quitacao integral dos valores contratados, a CONTRATANTE passara a possuir direito de utilizacao do sistema desenvolvido para suas atividades comerciais, permanecendo com a CONTRATADA os direitos intelectuais sobre metodologias, bibliotecas, componentes reutilizaveis, frameworks proprios e conhecimentos tecnicos empregados no desenvolvimento.
A CONTRATADA podera utilizar o projeto em portfolio, materiais promocionais e apresentacao comercial.
2º - A CONTRATADA nao podera, em hipotese alguma, transferir ou delegar as atribuicoes e responsabilidades que assume por forca deste contrato, a nao ser com previa concordancia da CONTRATANTE.
3º - A CONTRATANTE fica isento de toda e qualquer responsabilidade pelo nao cumprimento pela CONTRATADA de determinacoes administrativas e/ou legais relativas a execucao do objeto do presente instrumento.
4º - Os signatarios do presente contrato asseguram e afirmam que sao os representantes legais competentes para assumir em nome das partes as obrigacoes descritas neste contrato e representar de forma efetiva seus interesses.
5º - As partes sao contratantes totalmente independentes, sendo cada uma inteiramente responsavel por seus atos, obrigacoes e conteudo das informacoes prestadas, em toda e qualquer circunstancia, visto que o presente instrumento nao cria relacao de parceria, emprego e nem de representacao comercial entre elas, e nenhuma delas podera declarar que possui qualquer autoridade para assumir ou criar qualquer obrigacao, expressa ou implicita, em nome da outra, e nem representa-la sob nenhum pretexto e em nenhuma situacao.
6º - O nao exercicio por qualquer das partes de direitos ou faculdades que lhe assistam em decorrencia do presente contrato, ou a tolerancia com o atraso no cumprimento das obrigacoes da outra parte, nao afetara aqueles direitos ou faculdades, os quais poderao ser exercidos a qualquer tempo, a exclusivo criterio do interessado, nao alterando as condicoes neste instrumento estipuladas.
7º - A impossibilidade de prestacao do servico causada por incorrecao em informacao fornecida pela CONTRATANTE ou por omissao no provimento de informacao essencial a prestacao, nao caracterizara descumprimento de obrigacao contratual, isentando a CONTRATADA de toda e qualquer responsabilidade, ao tempo em que configurara o nao cumprimento de obrigacao por parte da CONTRATANTE.
8º - Sendo necessario digitalizacao de imagens em grandes formatos (maiores que oficio), producao de conteudo, conversao de arquivos, digitacao de textos e/ou outros servicos nao previstos nesta proposta, serao cobrados a parte, mediante previa autorizacao da CONTRATANTE, como servicos complementares;
9º - Nesta proposta encontra-se prevista a implementacao do site em um unico idioma (Portugues), outras versoes deverao ter orcamentos a parte.
10º - Fica eleito o foro da Cidade de ${pCity}, para decidir qualquer litigio decorrente do presente instrumento.

CLAUSULA OITAVA: SERVICOS DE TERCEIROS

1º - A CONTRATADA nao se responsabiliza por falhas, indisponibilidades, alteracoes de politicas, mudancas de API, limitacoes tecnicas ou interrupcoes causadas por servicos de terceiros, incluindo provedores de hospedagem, gateways de pagamento, servicos de e-mail, plataformas de mensagens, transportadoras, servicos governamentais e demais fornecedores externos.

CLAUSULA NONA: GARANTIA

1º - A CONTRATADA fornecera garantia de 30 (trinta) dias apos a entrega final para correcao de erros relacionados ao escopo originalmente contratado.
Nao estao incluidas na garantia alteracoes de layout, novas funcionalidades, mudancas de regra de negocio, integracoes adicionais ou solicitacoes que nao facam parte do escopo inicial aprovado.

CLAUSULA DECIMA: BACKUPS

1º - Apos a entrega final e encerramento do projeto, a CONTRATADA nao sera obrigada a manter copias, backups ou arquivos relacionados ao projeto, salvo quando houver contratacao especifica de hospedagem, monitoramento ou suporte continuo.

CLAUSULA DECIMA PRIMEIRA: ABANDONO

1º - Caso a CONTRATANTE permaneca sem responder solicitacoes, aprovacoes ou contatos relacionados ao projeto por periodo superior a 30 (trinta) dias corridos, o projeto sera considerado suspenso. Permanecendo a suspensao por mais de 90 (noventa) dias corridos, o projeto sera considerado encerrado por abandono da CONTRATANTE, sem devolucao dos valores pagos, podendo ser retomado mediante novo alinhamento de cronograma e disponibilidade da CONTRATADA.${supportClause}

Justo e acordado o presente instrumento de documentacao, CONTRATANTE e CONTRATADA assinam o presente instrumento em 02 (duas) vias de igual teor e forma.`;
}

async function copyQuoteText() {
  if (!currentQuote) {
    showToast("Nao ha texto para copiar");
    return;
  }
  const text = buildCopyProposalText();
  if (!text) { showToast("Nao ha texto para copiar"); return; }
  try {
    await navigator.clipboard.writeText(text);
    showToast("Texto copiado");
  } catch (_e) {
    showToast("Nao foi possivel copiar");
  }
}

function printQuotePreview() {
  const printable = document.getElementById("proposalPrintable");
  if (!printable) { showToast("Nao ha documento para imprimir"); return; }
  const printableClone = printable.cloneNode(true);
  const logoEl = printableClone.querySelector(".proposal-logo");
  if (logoEl) {
    logoEl.setAttribute("src", "/img/logo-jp-preta.png");
  }
  printableClone.querySelectorAll("[data-proposal-now]").forEach((el) => {
    el.textContent = dateTime(new Date());
  });
  const win = window.open("", "_blank", "width=980,height=700");
  if (!win) { showToast("Bloqueio de pop-up ativo"); return; }
  win.document.open();
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Impressao de Orcamento</title><style>
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    @page{size:auto;margin:14mm;}
    body{font-family:Arial,sans-serif;color:#111;line-height:1.45;margin:0;}
    .print-content{margin:0;}
    .proposal-header{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;border-bottom:1px solid #ddd;padding-bottom:8px;margin-bottom:8px;}
    .proposal-brand{display:flex;gap:10px;align-items:flex-start;}
    .proposal-logo-wrap{width:auto;height:auto;background:transparent !important;border:0;border-radius:0;padding:0;display:block;}
    .proposal-logo{width:56px;height:56px;object-fit:contain;display:block;}
    .proposal-brand-info{display:flex;flex-direction:column;gap:2px;}
    .proposal-brand-info h2{margin:0;font-size:20px;line-height:1.15;}
    .proposal-brand-info p{margin:0;line-height:1.2;}
    .proposal-meta{display:flex;flex-direction:column;gap:2px;}
    .proposal-meta p{margin:0;line-height:1.2;}
    .proposal-emission-datetime{white-space:nowrap;}
    .proposal-table{width:100%;border-collapse:collapse;margin:12px 0;}
    .proposal-table th,.proposal-table td{border:1px solid #ddd;padding:8px;text-align:left;}
    .proposal-totals{margin:12px 0;border:1px solid #ddd;padding:10px;}
    .proposal-total-line{display:flex;justify-content:space-between;padding:4px 0;}
    .proposal-total-line.highlight{border-top:1px solid #ddd;margin-top:4px;padding-top:8px;font-size:16px;}
    .proposal-schedule ul{margin:8px 0 12px 20px;}
    .proposal-contract{margin-top:14px;border-top:1px solid #ddd;padding-top:12px;}
    .contract-legal{white-space:pre-wrap;font-size:12px;line-height:1.45;font-family:Arial,sans-serif;}
    .contract-top{display:flex;justify-content:space-between;gap:12px;}
    .proposal-signature{margin-top:18px;}
  </style></head><body>
    <div class="print-content">${printableClone.outerHTML}</div>
  </body></html>`);
  win.document.close();
  win.focus();
  win.addEventListener("load", () => {
    setTimeout(() => win.print(), 400);
  });
}

function openProfileModal() {
  const p = providerData();
  document.getElementById("profileName").value = p.displayName;
  document.getElementById("profileEmail").value = p.email;
  document.getElementById("profilePhone").value = p.phone;
  document.getElementById("profileCnpj").value = p.cnpj;
  document.getElementById("profileAddress").value = p.address;
  document.getElementById("profileCity").value = p.city;
  document.getElementById("profileModal").classList.add("active");
}

function closeProfileModal() {
  document.getElementById("profileModal").classList.remove("active");
}

async function saveProfile(e) {
  e.preventDefault();
  const payload = {
    displayName: clean(document.getElementById("profileName").value),
    email: clean(document.getElementById("profileEmail").value),
    phone: clean(document.getElementById("profilePhone").value),
    cnpj: clean(document.getElementById("profileCnpj").value),
    address: clean(document.getElementById("profileAddress").value),
    city: clean(document.getElementById("profileCity").value)
  };
  if (!payload.displayName || !payload.email || !payload.phone || !payload.cnpj || !payload.address || !payload.city) {
    showToast("Preencha todos os campos do perfil");
    return;
  }
  const res = await api.updateProfile(payload);
  currentUser = res.provider;
  updateUserInfo();
  closeProfileModal();
  renderQuotePreview();
  showToast("Perfil atualizado");
}

function paymentMethodLabel(code) {
  return ({
    PIX: "PIX",
    BOLETO: "Boleto",
    CARTAO_CREDITO: "Cartao de credito",
    CARTAO_DEBITO: "Cartao de debito",
    DINHEIRO: "Dinheiro",
    TRANSFERENCIA: "Transferencia"
  })[code] || "PIX";
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePercent(value) {
  // Aceita virgula ou ponto como separador decimal (formato pt-BR e en-US)
  const s = String(value || "").trim().replace(/,/g, ".");
  // Se houver mais de um ponto (ex: "1.000.5"), pega apenas o ultimo
  const parts = s.split(".");
  const normalized = parts.length > 2 ? parts.slice(0, -1).join("") + "." + parts[parts.length - 1] : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "0";
  return String(n).replace(".", ",");
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function statusLabel(code) {
  return ({
    DRAFT: "Rascunho",
    SENT: "Enviado",
    APPROVED: "Aprovado",
    COMPLETED: "Projeto concluido",
    REJECTED: "Rejeitado"
  })[code] || (code || "Rascunho");
}

function money(v) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
}
function signedMoney(v) {
  const n = Number(v || 0);
  if (n > 0) return `+${money(n)}`;
  if (n < 0) return `-${money(Math.abs(n))}`;
  return money(0);
}
function dateTime(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR");
}
function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}
function clean(v) { return String(v || "").trim(); }
function esc(v) {
  return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}
function debounce(fn, wait) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
function getStoredAuthToken() {
  return localStorage.getItem("authToken") || sessionStorage.getItem("authToken") || "";
}
function clearStoredAuth() {
  localStorage.removeItem("authToken");
  sessionStorage.removeItem("authToken");
  localStorage.removeItem("providerAccount");
  sessionStorage.removeItem("providerAccount");
}
function avatarStorageKey() {
  const providerId = Number(currentUser?.id || 0);
  return `${AVATAR_STORAGE_PREFIX}:${providerId > 0 ? providerId : "anon"}`;
}
function loadStoredAvatarDataUrl() {
  if (!currentUser?.id) return "";
  try {
    return localStorage.getItem(avatarStorageKey()) || "";
  } catch (_error) {
    return "";
  }
}
function saveStoredAvatarDataUrl(dataUrl) {
  if (!currentUser?.id) return;
  try {
    if (clean(dataUrl)) {
      localStorage.setItem(avatarStorageKey(), dataUrl);
    } else {
      localStorage.removeItem(avatarStorageKey());
    }
  } catch (_error) {
    showToast("Nao foi possivel salvar a foto no navegador.");
  }
}
function renderUserAvatar(dataUrl) {
  const container = document.getElementById("userAvatarContainer");
  const image = document.getElementById("userAvatarImage");
  if (!container || !image) return;
  if (clean(dataUrl)) {
    image.src = dataUrl;
    container.classList.add("has-image");
    return;
  }
  image.removeAttribute("src");
  container.classList.remove("has-image");
}
function loadUserAvatar() {
  renderUserAvatar(loadStoredAvatarDataUrl());
}
function openAvatarPicker() {
  document.getElementById("avatarInput")?.click();
}
async function handleAvatarInputChange(e) {
  const input = e.target;
  const file = input?.files?.[0];
  if (!file) return;
  if (!file.type || !file.type.startsWith("image/")) {
    showToast("Selecione um arquivo de imagem valido.");
    input.value = "";
    return;
  }

  try {
    const optimized = await fileToSquareDataUrl(file, AVATAR_MAX_IMAGE_SIZE, 0.88);
    saveStoredAvatarDataUrl(optimized);
    renderUserAvatar(optimized);
    showToast("Foto de perfil atualizada.");
  } catch (error) {
    console.error(error);
    showToast("Nao foi possivel processar a foto selecionada.");
  } finally {
    input.value = "";
  }
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler imagem."));
    reader.readAsDataURL(file);
  });
}
async function fileToSquareDataUrl(file, size = 512, quality = 0.88) {
  const rawDataUrl = await fileToDataUrl(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = Math.floor((img.width - side) / 2);
      const sy = Math.floor((img.height - side) / 2);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas indisponivel."));
        return;
      }
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Falha ao carregar imagem."));
    img.src = rawDataUrl;
  });
}
function applySavedTheme() {
  const savedTheme = localStorage.getItem("theme");
  const theme = savedTheme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  refreshThemeToggleIcon();
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  refreshThemeToggleIcon();
}
function refreshThemeToggleIcon() {
  const button = document.getElementById("themeToggle");
  if (!button) return;
  const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const moonIcon = '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>';
  const sunIcon = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
  button.innerHTML = current === "dark" ? sunIcon : moonIcon;
  button.setAttribute("aria-label", current === "dark" ? "Ativar tema claro" : "Ativar tema escuro");
}
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}
