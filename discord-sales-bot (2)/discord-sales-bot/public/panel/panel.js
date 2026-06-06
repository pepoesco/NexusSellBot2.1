const state = {
  authenticated: false,
  configured: false
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const els = {
  loginPanel: document.querySelector("#login-panel"),
  panelGrid: document.querySelector("#panel-grid"),
  loginForm: document.querySelector("#login-form"),
  loginNote: document.querySelector("#login-note"),
  password: document.querySelector("#password"),
  logout: document.querySelector("#logout"),
  refresh: document.querySelector("#refresh"),
  toast: document.querySelector("#toast"),
  storeName: document.querySelector("#store-name"),
  grossRevenue: document.querySelector("#gross-revenue"),
  totalOrders: document.querySelector("#total-orders"),
  fulfilledOrders: document.querySelector("#fulfilled-orders"),
  manualOrders: document.querySelector("#manual-orders"),
  gatewayList: document.querySelector("#gateway-list"),
  stockList: document.querySelector("#stock-list"),
  ordersBody: document.querySelector("#orders-body"),
  productList: document.querySelector("#product-list"),
  productForm: document.querySelector("#product-form")
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
  const data = await response.json().catch(() => ({ ok: false, error: "Resposta invalida" }));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || "Falha na requisicao");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function formatMoney(cents, currency = "BRL") {
  if (currency !== "BRL") {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
  return money.format(cents / 100);
}

function statusLabel(status) {
  const labels = {
    created: "criado",
    pending_payment: "pendente",
    manual_review: "analise",
    paid: "pago",
    fulfilled: "entregue",
    canceled: "cancelado",
    expired: "expirado",
    payment_failed: "falhou",
    refunded: "estornado"
  };
  return labels[status] || status;
}

function pillClass(status) {
  if (["paid", "fulfilled"].includes(status)) return "ok";
  if (["manual_review", "pending_payment", "created"].includes(status)) return "warn";
  if (["payment_failed", "expired", "canceled"].includes(status)) return "bad";
  return "";
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.toast.hidden = true;
  }, 3200);
}

function setMode() {
  els.loginPanel.hidden = state.authenticated;
  els.panelGrid.hidden = !state.authenticated;
  els.logout.hidden = !state.authenticated;
  els.refresh.hidden = !state.authenticated;
}

async function loadSession() {
  const session = await api("/api/panel/session");
  state.authenticated = session.authenticated;
  state.configured = session.configured;
  els.storeName.textContent = session.storeName || "NexusSellBot";
  if (!session.configured) {
    els.loginNote.innerHTML = "Defina <code>PANEL_PASSWORD</code> no arquivo <code>.env</code> e reinicie o bot.";
    els.password.disabled = true;
    els.loginForm.querySelector("button").disabled = true;
  }
  setMode();
  if (state.authenticated) await refreshDashboard();
}

async function refreshDashboard() {
  const [overview, products] = await Promise.all([api("/api/panel/overview"), api("/api/panel/products")]);
  renderOverview(overview);
  renderProducts(products.products);
  window.lucide?.createIcons();
}

function renderOverview(data) {
  els.grossRevenue.textContent = formatMoney(data.summary.grossRevenueCents);
  els.totalOrders.textContent = String(data.summary.totalOrders);
  els.fulfilledOrders.textContent = String(data.summary.fulfilledOrders);
  els.manualOrders.textContent = String(data.summary.manualReviewOrders);

  els.gatewayList.innerHTML = data.providers
    .map(
      (provider) => `
        <div class="gateway-item">
          <div>
            <strong>${escapeHtml(provider.label)}</strong>
            <span>${escapeHtml(provider.id)}${provider.webhook ? " · webhook" : ""}</span>
          </div>
          <span class="pill ${provider.enabled ? "ok" : ""}">${provider.enabled ? "ativo" : "off"}</span>
        </div>
      `
    )
    .join("");

  els.stockList.innerHTML =
    data.lowStock.length === 0
      ? `<div class="gateway-item"><span>Nenhum alerta de estoque.</span><span class="pill ok">ok</span></div>`
      : data.lowStock
          .map(
            (product) => `
              <div class="gateway-item">
                <div>
                  <strong>${escapeHtml(product.name)}</strong>
                  <span>${escapeHtml(product.sku)} · ${escapeHtml(product.category)}</span>
                </div>
                <span class="pill ${product.stock <= 3 ? "warn" : ""}">${product.stock}</span>
              </div>
            `
          )
          .join("");

  els.ordersBody.innerHTML =
    data.recentOrders.length === 0
      ? `<tr><td colspan="6">Nenhum pedido ainda.</td></tr>`
      : data.recentOrders.map(renderOrderRow).join("");
}

function renderOrderRow(order) {
  const actions =
    order.status === "manual_review"
      ? `
      <div class="order-actions">
        <button class="button" data-order-action="approve" data-id="${order.id}"><i data-lucide="check"></i><span>Aprovar</span></button>
        <button class="button danger" data-order-action="reject" data-id="${order.id}"><i data-lucide="x"></i><span>Rejeitar</span></button>
      </div>
    `
      : "";

  return `
    <tr>
      <td><strong>${escapeHtml(order.id.slice(0, 8))}</strong><br /><span>${new Date(order.createdAt).toLocaleString("pt-BR")}</span></td>
      <td>${escapeHtml(order.discordUsername)}</td>
      <td><strong>${escapeHtml(order.productName)}</strong><br /><span>${escapeHtml(order.productSku)} x${order.quantity}</span></td>
      <td>${formatMoney(order.totalCents, order.currency)}</td>
      <td><span class="pill ${pillClass(order.status)}">${statusLabel(order.status)}</span></td>
      <td>${actions}</td>
    </tr>
  `;
}

function renderProducts(products) {
  els.productList.innerHTML =
    products.length === 0
      ? `<div class="product-card"><span>Nenhum produto cadastrado.</span></div>`
      : products
          .map(
            (product) => `
              <div class="product-card">
                <div>
                  <strong>${escapeHtml(product.name)}</strong>
                  <span>${escapeHtml(product.sku)} · ${escapeHtml(product.category)} · ${formatMoney(product.priceCents, product.currency)}</span>
                </div>
                <span class="pill ${product.active ? "ok" : "bad"}">${product.active ? stockText(product.stock) : "off"}</span>
              </div>
            `
          )
          .join("");
}

function stockText(stock) {
  if (stock < 0) return "ilimitado";
  return `${stock} un.`;
}

function productPayload(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  return {
    sku: data.sku,
    name: data.name,
    description: data.description || "",
    category: data.category || "geral",
    priceCents: Math.round(Number(data.price || 0) * 100),
    currency: "BRL",
    stock: Number(data.stock),
    roleId: data.roleId || null,
    deliveryText: data.deliveryText || null,
    imageUrl: data.imageUrl || null
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/panel/login", {
      method: "POST",
      body: JSON.stringify({ password: els.password.value })
    });
    state.authenticated = true;
    setMode();
    await refreshDashboard();
    showToast("Painel desbloqueado.");
  } catch (error) {
    showToast(error.message);
  }
});

els.logout.addEventListener("click", async () => {
  await api("/api/panel/logout", { method: "POST" }).catch(() => undefined);
  state.authenticated = false;
  setMode();
  showToast("Sessao encerrada.");
});

els.refresh.addEventListener("click", async () => {
  await refreshDashboard();
  showToast("Painel atualizado.");
});

els.productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/panel/products", {
      method: "POST",
      body: JSON.stringify(productPayload(els.productForm))
    });
    els.productForm.reset();
    els.productForm.elements.category.value = "geral";
    els.productForm.elements.stock.value = "-1";
    await refreshDashboard();
    showToast("Produto salvo.");
  } catch (error) {
    showToast(error.message);
  }
});

els.ordersBody.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-order-action]");
  if (!button) return;
  const action = button.dataset.orderAction;
  const id = button.dataset.id;
  try {
    await api(`/api/panel/orders/${encodeURIComponent(id)}/${action}`, { method: "POST" });
    await refreshDashboard();
    showToast(action === "approve" ? "Pedido aprovado." : "Pedido rejeitado.");
  } catch (error) {
    showToast(error.message);
  }
});

window.lucide?.createIcons();
loadSession().catch((error) => {
  state.authenticated = false;
  state.configured = false;
  els.loginPanel.hidden = false;
  els.panelGrid.hidden = true;
  els.logout.hidden = true;
  els.refresh.hidden = true;
  els.loginNote.innerHTML = "Inicie o servidor do bot para carregar o painel em <code>/panel</code>.";
  showToast(error.message);
});
