// Local GUI app for the selective-observation experiments.
//
// Beyond the static tasks, several scenarios inject the kind of state change that
// makes "when to observe" a real decision:
//
//   async_shop / async_contacts  search results render after a delay, so a plan
//                                that clicks a result blindly (before re-observing)
//                                acts on a list that is not there yet.
//   drift_recipient              a "suggested recipient" field is "Resolving..." at
//                                first and only resolves to the real address after a
//                                delay. The set of on-screen controls never changes —
//                                only a field VALUE does — so a coarse "did the screen
//                                change" heuristic cannot tell that re-observation is
//                                needed. Sending to the stale value is the wrong (and
//                                externally visible) action.
//   price_drift                  the notebook's add-to-cart button keeps the same
//                                selector, but the visible price in its label changes
//                                after a delay. A selector-only change detector misses
//                                it, while a fresh observation sees the updated price.
//   resolve_language             the language dropdown keeps the same selector, but its
//                                target option only appears after a delay.

const statusEl = document.querySelector("#status");
const taskLabel = document.querySelector("#task-label");

const params = new URL(window.location.href).searchParams;
const SCENARIO = params.get("scenario") || "";
const DELAY_MS = Number(params.get("delay_ms") || 450);
const SUGGESTED_RECIPIENT = params.get("recipient") || "alice@example.com";
const TARGET_LANGUAGE = params.get("target_language") || "Japanese";
const PRICE_INITIAL_CENTS = Number(params.get("price_initial_cents") || 1200);
const PRICE_RESOLVED_CENTS = Number(params.get("price_resolved_cents") || 700);
const PRICE_GATE_CENTS = Number(params.get("price_gate_cents") || PRICE_RESOLVED_CENTS);

const state = {
  sent: false,
  cartItems: 0,
  selectedContact: "",
  savedSettings: false,
  renamedFile: "",
  suggestedResolved: false,
  languagesResolved: false,
  notebookPriceCents: PRICE_INITIAL_CENTS,
};

function setStatus(text) {
  statusEl.textContent = text;
  document.body.dataset.status = text;
}

// Signal to the test adapter that an async page update is in progress.
// afterAction() in local_playwright.mjs waits for this to clear before
// the next observation, so the agent always sees a fully-resolved state.
function setLoading(active) {
  if (active) {
    document.body.dataset.loading = "1";
  } else {
    delete document.body.dataset.loading;
  }
}

function byId(id) {
  return document.getElementById(id);
}

function show(el) {
  el.classList.remove("hidden");
}

function hide(el) {
  el.classList.add("hidden");
}

function setTaskLabel() {
  taskLabel.textContent = params.get("task") || "Ready";
}

function formatUsd(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function setNotebookPrice(cents) {
  state.notebookPriceCents = cents;
  byId("add-notebook").textContent = `Add to cart (${formatUsd(cents)})`;
}

function setLanguageOptions(labels, selected) {
  const select = byId("language-select");
  select.innerHTML = "";
  for (const label of labels) {
    const option = document.createElement("option");
    option.textContent = label;
    option.value = label;
    if (label === selected) option.selected = true;
    select.appendChild(option);
  }
}

// ----- Mail -----------------------------------------------------------------

const suggestedRow = byId("suggested-recipient").closest("label");

byId("compose-btn").addEventListener("click", () => {
  show(byId("composer"));
  byId("to-field").focus();
  if (SCENARIO === "drift_recipient") {
    show(suggestedRow);
    state.suggestedResolved = false;
    byId("suggested-recipient").value = "Resolving...";
    setStatus("Resolving recipient");
    setLoading(true);
    setTimeout(() => {
      byId("suggested-recipient").value = SUGGESTED_RECIPIENT;
      state.suggestedResolved = true;
      setLoading(false);
    }, DELAY_MS);
  } else {
    hide(suggestedRow);
    setStatus("Composer open");
  }
});

byId("send-btn").addEventListener("click", () => {
  const filled = byId("to-field").value && byId("subject-field").value && byId("body-field").value;
  if (SCENARIO === "drift_recipient") {
    if (!filled) {
      setStatus("Email incomplete");
      return;
    }
    if (byId("to-field").value.trim() === byId("suggested-recipient").value.trim() && state.suggestedResolved) {
      state.sent = true;
      setStatus("Email sent");
    } else {
      setStatus("Wrong recipient");
    }
    return;
  }
  state.sent = Boolean(filled);
  setStatus(filled ? "Email sent" : "Email incomplete");
});

// ----- Shop -----------------------------------------------------------------

function renderShopResults() {
  const query = byId("shop-search").value.toLowerCase();
  const stockOnly = byId("stock-filter").checked;
  document.querySelectorAll(".product").forEach((product) => {
    const matchesQuery = product.dataset.name.toLowerCase().includes(query);
    const matchesStock = !stockOnly || product.dataset.stock === "true";
    product.hidden = !(matchesQuery && matchesStock);
  });
  setStatus("Products filtered");
}

byId("shop-run-search").addEventListener("click", () => {
  if (SCENARIO === "async_shop") {
    document.querySelectorAll(".product").forEach((p) => (p.hidden = true));
    setStatus("Searching...");
    setLoading(true);
    setTimeout(() => { renderShopResults(); setLoading(false); }, DELAY_MS);
  } else if (SCENARIO === "price_drift") {
    renderShopResults();
    setNotebookPrice(PRICE_INITIAL_CENTS);
    setStatus("Refreshing prices...");
    setLoading(true);
    setTimeout(() => {
      setNotebookPrice(PRICE_RESOLVED_CENTS);
      setStatus("Prices refreshed");
      setLoading(false);
    }, DELAY_MS);
  } else {
    renderShopResults();
  }
});

byId("add-notebook").addEventListener("click", () => {
  if (SCENARIO === "price_drift" && state.notebookPriceCents > PRICE_GATE_CENTS) {
    setStatus(`Notebook still costs ${formatUsd(state.notebookPriceCents)}`);
    return;
  }
  state.cartItems += 1;
  byId("cart-count").textContent = `${state.cartItems} item${state.cartItems === 1 ? "" : "s"}`;
  setStatus("Notebook added");
});

byId("checkout-btn").addEventListener("click", () => {
  setStatus(state.cartItems > 0 ? "Checkout ready" : "Cart empty");
});

// ----- Contacts -------------------------------------------------------------

function renderContactResults() {
  const query = byId("contact-search").value.toLowerCase();
  document.querySelectorAll(".contact-row").forEach((row) => {
    row.hidden = !row.dataset.contact.toLowerCase().includes(query);
  });
  setStatus("Contacts filtered");
}

byId("contact-run-search").addEventListener("click", () => {
  if (SCENARIO === "async_contacts") {
    document.querySelectorAll(".contact-row").forEach((row) => (row.hidden = true));
    setStatus("Searching...");
    setLoading(true);
    setTimeout(() => { renderContactResults(); setLoading(false); }, DELAY_MS);
  } else {
    renderContactResults();
  }
});

document.querySelectorAll(".contact-row").forEach((row) => {
  row.addEventListener("click", () => {
    state.selectedContact = row.dataset.contact;
    byId("contact-detail").innerHTML = `<h3>${row.dataset.contact}</h3><p>Role: Design Lead</p><p>Email: jordan@example.com</p>`;
    setStatus(`Contact opened: ${row.dataset.contact}`);
  });
});

// ----- Settings -------------------------------------------------------------

byId("open-settings").addEventListener("click", () => {
  show(byId("settings-panel"));
  if (SCENARIO === "resolve_language") {
    state.languagesResolved = false;
    setLanguageOptions(["English", "Spanish", "Loading..."], "English");
    setStatus("Loading languages");
    setLoading(true);
    setTimeout(() => {
      setLanguageOptions(["English", "Spanish", TARGET_LANGUAGE], TARGET_LANGUAGE);
      state.languagesResolved = true;
      setStatus("Preferences open");
      setLoading(false);
    }, DELAY_MS);
  } else {
    setStatus("Preferences open");
  }
});

byId("save-settings").addEventListener("click", () => {
  if (SCENARIO === "resolve_language" && (!state.languagesResolved || byId("language-select").value !== TARGET_LANGUAGE)) {
    setStatus("Settings mismatch");
    return;
  }
  state.savedSettings = true;
  setStatus(`Settings saved: ${byId("language-select").value}`);
});

// ----- Files ----------------------------------------------------------------

byId("open-files").addEventListener("click", () => {
  show(byId("file-panel"));
  setStatus("Folder open");
});

document.querySelectorAll(".file-row").forEach((row) => {
  row.addEventListener("click", () => {
    document.querySelectorAll(".file-row").forEach((r) => r.classList.remove("selected"));
    row.classList.add("selected");
    byId("rename-field").value = row.dataset.file;
    setStatus(`Selected ${row.dataset.file}`);
  });
});

byId("rename-btn").addEventListener("click", () => {
  const selected = document.querySelector(".file-row.selected");
  if (!selected || !byId("rename-field").value) {
    setStatus("Rename incomplete");
    return;
  }
  selected.textContent = byId("rename-field").value;
  state.renamedFile = byId("rename-field").value;
  setStatus(`Renamed to ${state.renamedFile}`);
});

// Hide the suggested-recipient row unless the drift scenario uses it.
hide(suggestedRow);
setNotebookPrice(PRICE_INITIAL_CENTS);
setLanguageOptions(["English", "Spanish", "Japanese"], "English");

window.soaDemo = {
  state,
  getStatus: () => statusEl.textContent,
};

setTaskLabel();
setStatus("Ready");
