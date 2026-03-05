const apiBaseInput = document.getElementById("apiBase");
const userIdInput = document.getElementById("userId");
const modelInput = document.getElementById("model");
const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");
const importIdEl = document.getElementById("importId");
const holdingsListEl = document.getElementById("holdingsList");
const warningsBoxEl = document.getElementById("warningsBox");
const addRowBtn = document.getElementById("addRowBtn");

const captureBtn = document.getElementById("captureBtn");
const confirmBtn = document.getElementById("confirmBtn");

let screenshotDataUrl = "";

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#b00020" : "#1f2937";
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

function getApiBase() {
  const raw = (apiBaseInput.value || "").trim();
  return raw || "http://127.0.0.1:8000";
}

function getUserId() {
  return (userIdInput.value || "").trim();
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
  const match = cleaned.match(/[-+]?[0-9]*\\.?[0-9]+/);
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
      <input data-k="avg_price" type="number" step="any" placeholder="Avg Price (optional)" />
      <input data-k="current_price" type="number" step="any" placeholder="Current Price (optional)" />
      <input data-k="name" placeholder="Name (optional)" />
      <input data-k="confidence" type="number" step="any" placeholder="Confidence" />
    </div>
  `;

  card.querySelector(".remove-btn").addEventListener("click", () => card.remove());

  card.querySelector('[data-k="asset_class"]').value = holding.asset_class || "stocks";
  card.querySelector('[data-k="symbol"]').value = holding.symbol || "";
  card.querySelector('[data-k="qty"]').value = holding.qty ?? "";
  card.querySelector('[data-k="avg_price"]').value = holding.avg_price ?? "";
  card.querySelector('[data-k="current_price"]').value = holding.current_price ?? "";
  card.querySelector('[data-k="name"]').value = holding.name || "";
  card.querySelector('[data-k="confidence"]').value = holding.confidence ?? "";

  return card;
}

function setHoldingsToUI(holdings = []) {
  holdingsListEl.innerHTML = "";
  if (!Array.isArray(holdings) || holdings.length === 0) {
    holdingsListEl.appendChild(createHoldingCard());
    return;
  }
  for (const h of holdings) {
    holdingsListEl.appendChild(createHoldingCard(h));
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
      warnings.push("One row has missing symbol.");
      continue;
    }
    if (qtyParsed === null || qtyParsed <= 0) {
      warnings.push(`Qty missing/invalid for ${symbol}.`);
      continue;
    }

    holdings.push({
      asset_class: assetClass,
      symbol,
      // Send raw qty text; backend normalizes robustly.
      qty: qtyRaw,
      avg_price: toNumberOrNull(card.querySelector('[data-k="avg_price"]').value),
      current_price: toNumberOrNull(card.querySelector('[data-k="current_price"]').value),
      name: (card.querySelector('[data-k="name"]').value || "").trim() || null,
      confidence: toNumberOrNull(card.querySelector('[data-k="confidence"]').value),
      _client_debug_qty_parsed: qtyParsed
    });
  }

  return { holdings, warnings };
}

async function saveSettings() {
  await chrome.storage.local.set({
    apiBase: apiBaseInput.value,
    userId: userIdInput.value,
    model: modelInput.value,
    importId: importIdEl.value
  });
}

async function loadSettings() {
  const saved = await chrome.storage.local.get(["apiBase", "userId", "model", "importId"]);
  apiBaseInput.value = saved.apiBase || "http://127.0.0.1:8000";
  userIdInput.value = saved.userId || "";
  modelInput.value = saved.model || "gpt-4.1-mini";
  importIdEl.value = saved.importId || "";
  setHoldingsToUI([]);
  setWarnings([]);
  setStatus("Scroll your assets into view, then click Capture + Parse.");
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length || !tabs[0].id) {
    throw new Error("No active tab found");
  }
  return tabs[0];
}

async function executeInTab(tabId, func, args = []) {
  const results = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  if (!results || !results.length) {
    throw new Error("Failed to execute script in tab");
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
        reject(new Error("No screenshot data returned"));
        return;
      }
      resolve(dataUrl);
    });
  });
}

async function captureAndParse() {
  const userId = getUserId();
  if (!userId) {
    throw new Error("Please enter user ID.");
  }

  const tab = await getActiveTab();
  screenshotDataUrl = await captureVisibleTab(tab.windowId);
  previewEl.src = screenshotDataUrl;

  const res = await fetch(`${getApiBase()}/users/${encodeURIComponent(userId)}/imports/screenshot/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_base64: screenshotDataUrl,
      model: (modelInput.value || "gpt-4.1-mini").trim(),
      page_text: await extractPageText()
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Parse failed");
  }

  importIdEl.value = data.import_id;
  setHoldingsToUI(data.parsed.holdings || []);
  setWarnings(data.parsed.warnings || []);
  await saveSettings();
}

captureBtn.addEventListener("click", async () => {
  try {
    setStatus("Capturing and parsing current view...");
    await captureAndParse();
    setStatus("Captured + parsed. Review rows, then click Confirm.");
  } catch (err) {
    setStatus(err.message || `Capture/parse failed: ${err}`, true);
  }
});

confirmBtn.addEventListener("click", async () => {
  try {
    const userId = getUserId();
    const importId = (importIdEl.value || "").trim();
    if (!userId || !importId) {
      setStatus("Missing user ID or import ID.", true);
      return;
    }

    const collected = getHoldingsFromUI();
    if (collected.warnings.length > 0) {
      setWarnings(collected.warnings);
      setStatus("Please fix warnings before confirm.", true);
      return;
    }
    if (!collected.holdings.length) {
      setStatus("Please add at least one valid row (symbol + qty).", true);
      return;
    }

    setStatus("Confirming and merging into portfolio...");
    const res = await fetch(`${getApiBase()}/users/${encodeURIComponent(userId)}/imports/screenshot/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        import_id: importId,
        holdings: collected.holdings
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Confirm failed");
    }

    const skipped = Array.isArray(data.skipped) ? data.skipped : [];
    if (skipped.length > 0) {
      const lines = skipped.map((s) => `${s.symbol || "unknown"}: ${s.reason || "skipped"}`);
      setWarnings([`Some rows were skipped (${skipped.length}):`, ...lines]);
    } else {
      setWarnings([]);
    }
    setStatus(`Merged ${data.merged_count} holdings. Portfolio value: ${data.portfolio_value}`);
    await saveSettings();
  } catch (err) {
    setStatus(`Confirm error: ${err.message}`, true);
  }
});

addRowBtn.addEventListener("click", () => {
  holdingsListEl.appendChild(createHoldingCard());
});

apiBaseInput.addEventListener("change", saveSettings);
userIdInput.addEventListener("change", saveSettings);
modelInput.addEventListener("change", saveSettings);

loadSettings();
