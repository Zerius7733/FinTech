const DEFAULT_API_BASE = "https://fintech-production-d308.up.railway.app";
const DEFAULT_MODEL = "gpt-4.1-mini";

const authViewEl = document.getElementById("authView");
const appViewEl = document.getElementById("appView");

const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginForm = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authStatusEl = document.getElementById("authStatus");
const apiBaseInput = document.getElementById("apiBase");
const saveApiBaseBtn = document.getElementById("saveApiBaseBtn");

const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");
const previewPlaceholderEl = document.getElementById("previewPlaceholder");
const holdingsListEl = document.getElementById("holdingsList");
const warningsBoxEl = document.getElementById("warningsBox");
const addRowBtn = document.getElementById("addRowBtn");
const captureBtn = document.getElementById("captureBtn");
const confirmBtn = document.getElementById("confirmBtn");

let screenshotDataUrl = "";
let authUser = null;
let currentImportId = "";
let apiBase = DEFAULT_API_BASE;

function normalizeApiBase(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getApiBase() {
  return normalizeApiBase(apiBase) || DEFAULT_API_BASE;
}

function toRawBase64(dataUrl) {
  const text = String(dataUrl || "");
  const marker = "base64,";
  const idx = text.indexOf(marker);
  return idx >= 0 ? text.slice(idx + marker.length) : text;
}

function renderPreviewState() {
  const hasPreview = Boolean(screenshotDataUrl);
  previewEl.style.display = hasPreview ? "block" : "none";
  previewPlaceholderEl.style.display = hasPreview ? "none" : "flex";
}

function setStatus(text, tone = "neutral") {
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
}

function setAuthStatus(text, tone = "neutral") {
  authStatusEl.textContent = text;
  authStatusEl.dataset.tone = tone;
}

function setWarnings(warnings = []) {
  if (!Array.isArray(warnings) || warnings.length === 0) {
    warningsBoxEl.style.display = "none";
    warningsBoxEl.textContent = "";
    return;
  }
  warningsBoxEl.style.display = "block";
  warningsBoxEl.textContent = warnings.join("\n");
}

function toNumberOrNull(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseLooseNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  const cleaned = raw.replace(/,/g, "");
  const direct = Number(cleaned);
  if (Number.isFinite(direct)) {
    return direct;
  }
  const match = cleaned.match(/[-+]?[0-9]*\.?[0-9]+/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function createHoldingCard(holding = {}) {
  const card = document.createElement("div");
  card.className = "holding-card";
  card.innerHTML = `
    <div class="holding-row">
      <select data-k="asset_class">
        <option value="stocks">stocks</option>
        <option value="cryptos">cryptos</option>
        <option value="commodities">commodities</option>
      </select>
      <input data-k="symbol" placeholder="Symbol (SPY / BTC / GC=F)" />
      <input class="qty" data-k="qty" type="number" step="any" placeholder="Qty" />
      <button class="remove-btn" type="button">X</button>
    </div>
    <div class="holding-row second">
      <input data-k="avg_price" type="number" step="any" placeholder="Avg Price" />
      <input data-k="current_price" type="number" step="any" placeholder="Current Price" />
      <input data-k="name" placeholder="Asset Name" />
    </div>
  `;

  card.querySelector(".remove-btn").addEventListener("click", () => card.remove());
  card.querySelector('[data-k="asset_class"]').value = holding.asset_class || "stocks";
  card.querySelector('[data-k="symbol"]').value = holding.symbol || "";
  card.querySelector('[data-k="qty"]').value = holding.qty ?? "";
  card.querySelector('[data-k="avg_price"]').value = holding.avg_price ?? "";
  card.querySelector('[data-k="current_price"]').value = holding.current_price ?? "";
  card.querySelector('[data-k="name"]').value = holding.name || "";

  return card;
}

function setHoldingsToUI(holdings = []) {
  holdingsListEl.innerHTML = "";
  if (!Array.isArray(holdings) || holdings.length === 0) {
    holdingsListEl.appendChild(createHoldingCard());
    return;
  }
  for (const holding of holdings) {
    holdingsListEl.appendChild(createHoldingCard(holding));
  }
}

function getHoldingsFromUI() {
  const cards = [...holdingsListEl.querySelectorAll(".holding-card")];
  const holdings = [];
  const warnings = [];

  for (const card of cards) {
    const assetClass = card.querySelector('[data-k="asset_class"]').value;
    const symbol = (card.querySelector('[data-k="symbol"]').value || "").trim();
    const qtyRaw = (card.querySelector('[data-k="qty"]').value || "").trim();
    const qtyParsed = parseLooseNumber(qtyRaw);

    if (!symbol) {
      warnings.push("One row has a missing symbol.");
      continue;
    }
    if (qtyParsed === null || qtyParsed <= 0) {
      warnings.push(`Qty missing or invalid for ${symbol}.`);
      continue;
    }

    holdings.push({
      asset_class: assetClass,
      symbol,
      qty: qtyRaw,
      avg_price: toNumberOrNull(card.querySelector('[data-k="avg_price"]').value),
      current_price: toNumberOrNull(card.querySelector('[data-k="current_price"]').value),
      name: (card.querySelector('[data-k="name"]').value || "").trim() || null,
      _client_debug_qty_parsed: qtyParsed,
    });
  }

  return { holdings, warnings };
}

async function saveSettings() {
  await chrome.storage.local.set({
    authUser,
    importId: currentImportId,
    apiBase: getApiBase(),
  });
}

function renderAuthState() {
  const signedIn = !!authUser?.user_id;
  authViewEl.classList.toggle("hidden", signedIn);
  appViewEl.classList.toggle("hidden", !signedIn);

  if (signedIn) {
    setStatus("Scroll your assets into view, then click Capture + Parse.", "neutral");
    setAuthStatus(`Signed in as ${authUser.username}.`, "success");
  } else {
    setAuthStatus("Sign in with your Unova account to unlock importing.", "neutral");
  }
}

async function loadSettings() {
  const saved = await chrome.storage.local.get(["importId", "authUser", "apiBase"]);
  currentImportId = saved.importId || "";
  authUser = saved.authUser || null;
  apiBase = normalizeApiBase(saved.apiBase) || DEFAULT_API_BASE;
  apiBaseInput.value = getApiBase();
  setHoldingsToUI([]);
  setWarnings([]);
  screenshotDataUrl = "";
  previewEl.removeAttribute("src");
  renderPreviewState();
  renderAuthState();
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length || !tabs[0].id) {
    throw new Error("No active tab found.");
  }
  return tabs[0];
}

async function executeInTab(tabId, func) {
  const results = await chrome.scripting.executeScript({ target: { tabId }, func });
  if (!results || !results.length) {
    throw new Error("Failed to execute script in tab.");
  }
  return results[0].result;
}

async function extractPageText() {
  const tab = await getActiveTab();
  const text = await executeInTab(tab.id, () => {
    return document.body && document.body.innerText ? document.body.innerText.slice(0, 50000) : "";
  });
  return typeof text === "string" ? text : "";
}

async function captureVisibleTab(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!dataUrl) {
        reject(new Error("No screenshot data returned."));
        return;
      }
      resolve(dataUrl);
    });
  });
}

function requireAuth() {
  if (!authUser?.user_id) {
    throw new Error("Sign in before using the importer.");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const username = (usernameInput.value || "").trim();
  const password = (passwordInput.value || "").trim();

  if (!username || !password) {
    setAuthStatus("Enter both username and password.", "error");
    return;
  }

  try {
    loginBtn.disabled = true;
    setAuthStatus("Signing in to Unova...", "busy");

    const res = await fetch(`${getApiBase()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || "Login failed.");
    }

    authUser = {
      user_id: data.user_id,
      username: data.username,
    };

    usernameInput.value = "";
    passwordInput.value = "";
    await saveSettings();
    renderAuthState();
    setStatus(`Signed in as ${authUser.username}.`, "success");
  } catch (error) {
    setAuthStatus(error.message || "Could not sign in.", "error");
  } finally {
    loginBtn.disabled = false;
  }
}

async function captureAndParse() {
  requireAuth();
  const tab = await getActiveTab();
  screenshotDataUrl = await captureVisibleTab(tab.windowId);
  previewEl.src = screenshotDataUrl;
  renderPreviewState();

  const res = await fetch(`${getApiBase()}/users/${encodeURIComponent(authUser.user_id)}/imports/screenshot/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_base64: toRawBase64(screenshotDataUrl),
      model: DEFAULT_MODEL,
      page_text: await extractPageText(),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || "Parse failed.");
  }

  currentImportId = data.import_id || "";
  setHoldingsToUI(data.parsed?.holdings || []);
  setWarnings(data.parsed?.warnings || []);
  await saveSettings();
}

async function confirmImport() {
  requireAuth();
  if (!currentImportId) {
    throw new Error("Missing import ID.");
  }

  const collected = getHoldingsFromUI();
  if (collected.warnings.length > 0) {
    setWarnings(collected.warnings);
    throw new Error("Please fix the warnings before confirming.");
  }
  if (!collected.holdings.length) {
    throw new Error("Add at least one valid holding row first.");
  }

  const res = await fetch(`${getApiBase()}/users/${encodeURIComponent(authUser.user_id)}/imports/screenshot/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      import_id: currentImportId,
      holdings: collected.holdings,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || "Confirm failed.");
  }

  const skipped = Array.isArray(data.skipped) ? data.skipped : [];
  if (skipped.length > 0) {
    const lines = skipped.map((item) => `${item.symbol || "unknown"}: ${item.reason || "skipped"}`);
    setWarnings([`Some rows were skipped (${skipped.length}):`, ...lines]);
  } else {
    setWarnings([]);
  }

  await saveSettings();
  setStatus(`Merged ${data.merged_count} holdings into ${authUser.username}'s portfolio.`, "success");
}

loginForm.addEventListener("submit", handleLogin);

saveApiBaseBtn.addEventListener("click", async () => {
  apiBase = normalizeApiBase(apiBaseInput.value) || DEFAULT_API_BASE;
  apiBaseInput.value = getApiBase();
  await saveSettings();
  setAuthStatus(`API endpoint saved: ${getApiBase()}`, "success");
});

logoutBtn.addEventListener("click", async () => {
  authUser = null;
  screenshotDataUrl = "";
  currentImportId = "";
  previewEl.removeAttribute("src");
  renderPreviewState();
  setHoldingsToUI([]);
  setWarnings([]);
  await saveSettings();
  renderAuthState();
  setStatus("Signed out. Sign in to unlock importing.", "neutral");
});

captureBtn.addEventListener("click", async () => {
  try {
    setStatus("Capturing and parsing the current broker view...", "busy");
    await captureAndParse();
    setStatus("Capture complete. Review the rows, then confirm the import.", "success");
  } catch (error) {
    setStatus(error.message || "Capture failed.", "error");
  }
});

confirmBtn.addEventListener("click", async () => {
  try {
    setStatus("Confirming holdings and merging into portfolio...", "busy");
    await confirmImport();
  } catch (error) {
    setStatus(error.message || "Confirm failed.", "error");
  }
});

addRowBtn.addEventListener("click", () => {
  holdingsListEl.appendChild(createHoldingCard());
});

renderPreviewState();
loadSettings();
