import { api, esc, download, toast, openDialog, statusText } from "../api.js";

const CLASSES = { open: "badge ok", closed: "badge" };

export async function render(content) {
  const data = await api("/api/sessions");
  const rows = data.sessions
    .map(
      (s) => `
      <tr>
        <td>${esc(s.course)}<br><span class="muted small">${esc(s.topic || "")}</span></td>
        <td>${esc(s.class_name)}</td>
        <td class="num">${esc(s.meeting)}</td>
        <td>${s.status === "open" ? '<span class="badge ok">Berlangsung</span>' : '<span class="badge">Ditutup</span>'}</td>
        <td class="num">${s.present}/${s.total}</td>
        <td class="muted small">${esc(s.opened_at)}${s.closed_at ? `<br>ditutup ${esc(s.closed_at)}` : ""}<br>${esc(s.created_by_name || "")}</td>
        <td>
          <a class="button small primary" href="#/attend/${s.id}">Buka absensi</a>
          <button class="small" data-csv="${s.id}" type="button">CSV</button>
          <button class="small danger" data-toggle="${s.id}" data-open="${s.closed_at ? "1" : ""}" type="button">${s.closed_at ? "Buka" : "Tutup"}</button>
          <button class="small danger" data-del="${s.id}" type="button">Hapus</button>
        </td>
      </tr>`
    )
    .join("");

  content.innerHTML = `
    <div class="toolbar">
      <h2>Sesi Absensi</h2><span class="spacer"></span>
      <button id="new-session" class="primary" type="button">+ Sesi baru</button>
    </div>
    ${data.sessions.length
      ? `<div class="table-wrap"><table>
          <thead><tr><th>Mata kuliah</th><th>Kelas</th><th class="num">Pertemuan</th><th>Status</th><th class="num">Hadir</th><th>Waktu</th><th>Aksi</th></tr></thead>
          <tbody>${rows}</tbody></table></div>`
      : '<div class="card empty">Belum ada sesi. Klik "+ Sesi baru" untuk membuat.</div>'}`;

  content.querySelector("#new-session").addEventListener("click", () =>
    openDialog({
      title: "Sesi absensi baru",
      html: `
        <label>Mata kuliah <input name="course" required maxlength="100" placeholder="cth: Kapita Selekta"></label>
        <label>Kelas <input name="class_name" required maxlength="20" placeholder="cth: SK7A"></label>
        <label>Pertemuan <input name="meeting" type="number" min="1" max="32" required></label>
        <label>Topik (opsional) <input name="topic" maxlength="200"></label>`,
      async onSubmit(data) {
        await api("/api/sessions", {
          method: "POST",
          json: {
            course: data.get("course"),
            class_name: data.get("class_name").trim().toUpperCase(),
            meeting: data.get("meeting"),
            topic: data.get("topic"),
          },
        });
        toast("Sesi dibuat.");
        render(content);
      },
    })
  );

  content.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const { csv, toggle, del } = button.dataset;
    try {
      if (csv) return download(`/api/sessions/${csv}/export.csv`);
      if (toggle) {
        await api(`/api/sessions/${toggle}/close`, { method: "POST", json: { reopen: !!button.dataset.open } });
        render(content);
      } else if (del && confirm("Hapus sesi ini beserta seluruh data absensinya?")) {
        await api(`/api/sessions/${del}`, { method: "DELETE" });
        toast("Sesi dihapus.");
        render(content);
      }
    } catch (err) { toast(err.message, true); }
  }, { once: true });
}
