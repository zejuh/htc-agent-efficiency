const statusEl = document.querySelector("#status");
const taskLabel = document.querySelector("#task-label");

const state = {
  sent: false,
  cartItems: 0,
  selectedContact: "",
  savedSettings: false,
  renamedFile: "",
};

function setStatus(text) {
  statusEl.textContent = text;
  document.body.dataset.status = text;
}

function setTaskLabel() {
  const url = new URL(window.location.href);
  taskLabel.textContent = url.searchParams.get("task") || "Ready";
}

function show(el) {
  el.classList.remove("hidden");
}

function byId(id) {
  return document.getElementById(id);
}

byId("compose-btn").addEventListener("click", () => {
  show(byId("composer"));
  byId("to-field").focus();
  setStatus("Composer open");
});

byId("send-btn").addEventListener("click", () => {
  const ready = byId("to-field").value && byId("subject-field").value && byId("body-field").value;
  state.sent = Boolean(ready);
  setStatus(ready ? "Email sent" : "Email incomplete");
});

byId("shop-run-search").addEventListener("click", () => {
  const query = byId("shop-search").value.toLowerCase();
  const stockOnly = byId("stock-filter").checked;
  document.querySelectorAll(".product").forEach((product) => {
    const matchesQuery = product.dataset.name.toLowerCase().includes(query);
    const matchesStock = !stockOnly || product.dataset.stock === "true";
    product.hidden = !(matchesQuery && matchesStock);
  });
  setStatus("Products filtered");
});

byId("add-notebook").addEventListener("click", () => {
  state.cartItems += 1;
  byId("cart-count").textContent = `${state.cartItems} item${state.cartItems === 1 ? "" : "s"}`;
  setStatus("Notebook added");
});

byId("checkout-btn").addEventListener("click", () => {
  setStatus(state.cartItems > 0 ? "Checkout ready" : "Cart empty");
});

byId("contact-run-search").addEventListener("click", () => {
  const query = byId("contact-search").value.toLowerCase();
  document.querySelectorAll(".contact-row").forEach((row) => {
    row.hidden = !row.dataset.contact.toLowerCase().includes(query);
  });
  setStatus("Contacts filtered");
});

document.querySelectorAll(".contact-row").forEach((row) => {
  row.addEventListener("click", () => {
    state.selectedContact = row.dataset.contact;
    byId("contact-detail").innerHTML = `<h3>${row.dataset.contact}</h3><p>Role: Design Lead</p><p>Email: jordan@example.com</p>`;
    setStatus(`Contact opened: ${row.dataset.contact}`);
  });
});

byId("open-settings").addEventListener("click", () => {
  show(byId("settings-panel"));
  setStatus("Preferences open");
});

byId("save-settings").addEventListener("click", () => {
  state.savedSettings = true;
  setStatus(`Settings saved: ${byId("language-select").value}`);
});

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

window.htcDemo = {
  state,
  getStatus: () => statusEl.textContent,
};

setTaskLabel();
setStatus("Ready");

