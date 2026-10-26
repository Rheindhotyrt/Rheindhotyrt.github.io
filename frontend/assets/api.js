// Klien API + util UI bersama.
const BASE = (window.API_BASE || "").replace(/\/$/, "");
const TOKEN_KEY = "absensi_token";
const USER_KEY = "absensi_user";

export const auth = {
  get token() { return sessionStorage.getItem(TOKEN_KEY); },
  get user() { try { return JSON.parse(sessionStorage.getItem(USER_KEY)); } catch { return null; } },
  save(token, user) { sessionStorage.setItem(TOKEN_KEY, token); sessionStorage.setItem(USER_KEY, JSON.stringify(user)); },
  clear() { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY); },
  isAdmin() { return this.user?.role === "admin"; },
};

export async function api(path, { method = "GET", json, form, body, raw = false } = {}) {
  const headers = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  let payload = body;
  if (json !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(json); }
  if (form) payload = form;
  let response;
  try {
    response = await fetch(BASE + path, { method, headers, body: payload });
  } catch {
    throw new Error("Server tidak dapat dihubungi. Periksa koneksi atau tunggu server menyala.");
  }
  if (response.status === 401 && path !== "/api/auth/login") {
    auth.clear();
    location.hash = "#/login";
    throw new Error("Sesi login berakhir, silakan login ulang.");
  }
  if (raw) {
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`);
    return response;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

export async function download(path) {
  const response = await api(path, { raw: true });
  const disposition = response.headers.get("Content-Disposition") || "";
  const name = (disposition.match(/filename="([^"]+)"/) || [])[1] || "export.csv";
  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Escape semua data dari server sebelum dimasukkan ke HTML (mencegah XSS).
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

let toastTimer;
export function toast(message, isError = false) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = "toast" + (isError ? " error" : "");
  el.hidden = false;
  el.setAttribute("role", isError ? "alert" : "status");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 6000 : 3000);
}

/** Dialog form. `onSubmit(formData)` boleh melempar Error untuk menampilkan pesan. */
export function openDialog({ title, html, okText = "Simpan", onSubmit }) {
  const dialog = document.getElementById("dialog");
  const form = document.getElementById("dialog-form");
  const error = document.getElementById("dialog-error");
  const ok = document.getElementById("dialog-ok");
  document.getElementById("dialog-title").textContent = title;
  document.getElementById("dialog-body").innerHTML = html;
  ok.textContent = okText;
  error.hidden = true;
  document.getElementById("dialog-cancel").onclick = () => dialog.close();
  form.onsubmit = async (event) => {
    event.preventDefault();
    ok.disabled = true;
    try {
      await onSubmit(new FormData(form));
      dialog.close();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally {
      ok.disabled = false;
    }
  };
  dialog.showModal();
  dialog.querySelector("input, select, textarea")?.focus();
  return dialog;
}

export const STATUS_LABEL = { hadir: "Hadir", izin: "Izin", sakit: "Sakit", alpa: "Alpa" };
export const statusText = (s) => `<span class="status status-${esc(s)}">${esc(STATUS_LABEL[s] || s)}</span>`;
