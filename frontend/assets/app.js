// Router + login + kerangka aplikasi. Halaman ada di assets/pages/*.js
import { api, auth, esc, toast, openDialog } from "./api.js";

const content = document.getElementById("content");
const routes = {
  "#/sessions": () => import("./pages/sessions.js"),
  "#/students": () => import("./pages/students.js"),
  "#/recap": () => import("./pages/recap.js"),
  "#/users": () => import("./pages/users.js"),
  "#/attend/:id": () => import("./pages/attendance.js"),
};

function updateNav() {
  document.querySelectorAll(".topbar nav a").forEach((link) => {
    const route = link.getAttribute("href");
    const active = location.hash.startsWith(route) || (route === "#/sessions" && location.hash === "#/" || location.hash === "");
    link.toggleAttribute("aria-current", !!active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
    if (link.hasAttribute("data-admin")) link.hidden = !auth.isAdmin();
  });
}

function showLogin() {
  document.getElementById("app-view").hidden = true;
  document.getElementById("login-view").hidden = false;
  document.getElementById("login-form").elements.username.focus();
}

function showApp() {
  document.getElementById("login-view").hidden = true;
  document.getElementById("app-view").hidden = false;
  document.getElementById("account-button").textContent = auth.user?.full_name || auth.user?.username || "";
  updateNav();
}

async function router() {
  if (!auth.token || !auth.user) { showLogin(); return; }
  showApp();
  const match = (location.hash || "#/sessions").match(/^#\/([a-z-]+)(?:\/(\d+))?$/i);
  const name = match ? match[1] : "sessions";
  const id = match?.[2] ?? null;
  const loader = routes[`#/${name}${id ? "/:id" : ""}`] || routes["#/sessions"];
  content.replaceChildren();
  try {
    const page = await loader();
    await page.render(content, id);
    updateNav();
  } catch (err) {
    content.innerHTML = `<div class="card empty"><p class="error">${esc(err.message)}</p></div>`;
  }
}

async function refreshModelBadge() {
  const badge = document.getElementById("model-badge");
  try {
    const health = await api("/api/health");
    const model = health.model || {};
    const map = { ready: ["ok", `model siap (${model.classes ?? "?"} mhs)`], loading: ["warn", "model dimuat..."], error: ["bad", "model gagal"] };
    const [cls, text] = map[model.state] || ["warn", model.state];
    badge.textContent = text;
    badge.className = `badge ${cls}`;
  } catch {
    badge.textContent = "server terputus";
    badge.className = "badge bad";
  }
}

window.addEventListener("hashchange", router);

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const error = document.getElementById("login-error");
  error.hidden = true;
  form.querySelector("button").disabled = true;
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      json: { username: form.username.value.trim(), password: form.password.value },
    });
    auth.save(data.token, data.user);
    location.hash = "#/sessions";
    await router();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    form.querySelector("button").disabled = false;
  }
});

document.getElementById("logout-button").addEventListener("click", () => {
  auth.clear();
  location.hash = "";
  showLogin();
});

document.getElementById("account-button").addEventListener("click", () => {
  openDialog({
    title: "Ganti password",
    html: `
      <label>Password lama <input name="old_password" type="password" autocomplete="current-password" required></label>
      <label>Password baru (min. 8 karakter) <input name="new_password" type="password" minlength="8" autocomplete="new-password" required></label>`,
    async onSubmit(data) {
      await api("/api/auth/password", {
        method: "POST",
        json: { old_password: data.get("old_password"), new_password: data.get("new_password") },
      });
      auth.clear();
      location.hash = "";
      showLogin();
      toast("Password diganti. Silakan login ulang.");
    },
  });
});

// Mulai.
(async function init() {
  if (auth.token && auth.user) {
    try { await api("/api/auth/me"); } catch { /* token tidak valid: dialihkan ke login */ }
  }
  await router();
  refreshModelBadge();
  setInterval(refreshModelBadge, 15000);
})();
