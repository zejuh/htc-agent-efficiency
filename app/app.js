// 选择性观察实验使用的本地 GUI 应用。
//
// 除了静态任务外，下面几个场景会故意注入状态变化，让“什么时候重新观察”
// 变成一个真实决策：
//
//   async_shop / async_contacts  搜索结果会延迟出现。如果 agent 不重新观察就
//                                盲目点击结果，就会操作一个尚未渲染好的列表。
//   drift_recipient              “建议收件人”字段一开始是 "Resolving..."，
//                                延迟后才变成真实邮箱。页面控件集合不变，
//                                只改变字段值，所以粗粒度“页面是否变化”启发式
//                                无法判断是否需要重新观察。把邮件发给旧值就是
//                                错误且对外可见的动作。
//   price_drift                  notebook 的 add-to-cart 按钮 selector 不变，
//                                但按钮上的可见价格会延迟变化。只看 selector 的
//                                detector 会漏掉它，重新观察则能看到新价格。
//   resolve_language             语言下拉框 selector 不变，但目标选项会延迟出现。
//   stable profile               静态多字段表单。多数中间动作不会改变页面，
//                                用来给 gate 提供“沿用旧计划仍正确”的样本。

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
  profilePreviewed: false,
};

function setStatus(text) {
  statusEl.textContent = text;
  document.body.dataset.status = text;
}

// 告诉测试适配器：当前有异步 DOM 更新正在进行。
// local_playwright.mjs 里的 afterAction() 会等待这个标记清除后再观察，
// 这样 agent 看到的就是已经稳定下来的页面状态。
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

// ----- 邮件 -----------------------------------------------------------------

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

// ----- 商店 -----------------------------------------------------------------

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

// ----- 联系人 ---------------------------------------------------------------

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

// ----- 设置 -----------------------------------------------------------------

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

// ----- 文件 -----------------------------------------------------------------

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

// ----- 个人资料 -------------------------------------------------------------

byId("profile-preview").addEventListener("click", () => {
  const first = byId("profile-first").value.trim();
  const last = byId("profile-last").value.trim();
  const role = byId("profile-role").value.trim();
  const wantsDigest = byId("profile-newsletter").checked;
  const digest = byId("profile-digest").value;
  if (!first || !last || !role) {
    setStatus("Profile incomplete");
    return;
  }
  state.profilePreviewed = true;
  setStatus(`Profile preview ready: ${first} ${last} - ${role} - ${wantsDigest ? digest : "No digest"}`);
});

// 除非 drift 场景需要，否则隐藏 suggested-recipient 行。
hide(suggestedRow);
setNotebookPrice(PRICE_INITIAL_CENTS);
setLanguageOptions(["English", "Spanish", "Japanese"], "English");

window.soaDemo = {
  state,
  getStatus: () => statusEl.textContent,
};

setTaskLabel();
setStatus("Ready");
