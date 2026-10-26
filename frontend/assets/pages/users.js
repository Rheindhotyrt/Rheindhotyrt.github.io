import { api, esc, toast, openDialog } from "../api.js";

export async function render(content) {
  const me = await api("/api/auth/me");
  if (me.user.role !== "admin") {
    content.innerHTML = '<div class="card empty">Halaman ini hanya untuk admin.</div>';
    return;
  }

  async function load() {
    const data = await api("/api/users");
    content.querySelector("#users-body").innerHTML = data.users
      .map(
        (u) => `
        <tr>
          <td>${esc(u.username)}</td>
          <td>${esc(u.full_name)}</td>
          <td>${u.role === "admin" ? '<span class="badge ok">Admin</span>' : '<span class="badge">Dosen</span>'}</td>
          <td class="muted small">${esc(u.created_at)}</td>
          <td><button class="small danger" data-del="${u.id}" type="button" ${u.role === "admin" ? "disabled title='Akun admin awal tidak dihapus'" : ""}>Hapus</button></td>
        </tr>`
      )
      .join("");
  }

  content.innerHTML = `
    <div class="toolbar"><h2>Pengguna</h2><span class="spacer"></span>
      <button id="new-user" class="primary" type="button">+ Akun baru</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Username</th><th>Nama</th><th>Peran</th><th>Dibuat</th><th>Aksi</th></tr></thead>
      <tbody id="users-body"></tbody>
    </table></div>`;

  await load();

  content.querySelector("#new-user").addEventListener("click", () =>
    openDialog({
      title: "Akun baru",
      html: `
        <label>Username (huruf/angka/._, 3-50) <input name="username" required maxlength="50" pattern="[A-Za-z0-9_.]{3,50}"></label>
        <label>Nama lengkap <input name="full_name" required maxlength="100"></label>
        <label>Peran <select name="role"><option value="dosen">Dosen</option><option value="admin">Admin</option></select></label>
        <label>Password (min. 8) <input name="password" type="password" minlength="8" required autocomplete="new-password"></label>`,
      async onSubmit(data) {
        await api("/api/users", {
          method: "POST",
          json: {
            username: data.get("username"),
            full_name: data.get("full_name"),
            role: data.get("role"),
            password: data.get("password"),
          },
        });
        toast("Akun dibuat.");
        load();
      },
    })
  );

  content.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-del]");
    if (button?.dataset.del && confirm("Hapus akun ini?")) {
      try {
        await api(`/api/users/${button.dataset.del}`, { method: "DELETE" });
        toast("Akun dihapus.");
        load();
      } catch (err) { toast(err.message, true); }
    }
  });
}
