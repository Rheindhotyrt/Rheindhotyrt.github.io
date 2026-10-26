import { api, esc, toast, openDialog } from "../api.js";

export async function render(content) {
  let classes = [];
  try { classes = (await api("/api/classes")).classes; } catch { /* ditampilkan sebagai kosong */ }

  async function loadTable(classFilter = "") {
    const data = await api("/api/students" + (classFilter ? `?class_name=${encodeURIComponent(classFilter)}` : ""));
    const tbody = content.querySelector("#students-body");
    tbody.innerHTML = data.students
      .map(
        (s) => `
        <tr class="${s.active ? "" : "muted"}">
          <td>${esc(s.name)}</td>
          <td>${esc(s.nim || '—')}</td>
          <td>${esc(s.class_name)}</td>
          <td>${s.active ? '<span class="badge ok">Aktif</span>' : '<span class="badge">Nonaktif</span>'}</td>
          <td>
            <button class="small" data-edit="${s.id}" data-name="${esc(s.name)}" data-nim="${esc(s.nim)}" type="button">Edit</button>
            <button class="small danger" data-active="${s.id}" data-to="${s.active ? "0" : "1"}" type="button">${s.active ? "Nonaktifkan" : "Aktifkan"}</button>
          </td>
        </tr>`
      )
      .join("") || '<tr><td colspan="5" class="empty">Tidak ada data.</td></tr>';
    content.querySelector("#count").textContent = `${data.students.length} mahasiswa`;
  }

  content.innerHTML = `
    <div class="toolbar">
      <h2>Mahasiswa</h2>
      <span id="count" class="badge"></span><span class="spacer"></span>
      <select id="class-filter" style="width:auto" aria-label="Filter kelas">
        <option value="">Semua kelas</option>
        ${classes.map((c) => `<option value="${esc(c.class_name)}">${esc(c.class_name)} (${c.total})</option>`).join("")}
      </select>
      <button id="new-student" class="primary" type="button">+ Daftar wajah baru</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nama</th><th>NIM</th><th>Kelas</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody id="students-body"></tbody>
      </table>
    </div>
    <p class="muted small">NIM mahasiswa yang awalnya kosong berasal dari folder dataset yang tidak memuat NIM — perbaiki dengan tombol Edit lalu daftarkan wajahnya.</p>`;

  await loadTable();

  content.querySelector("#class-filter").addEventListener("change", (event) => loadTable(event.target.value));

  content.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const { edit, active, to } = button.dataset;
    try {
      if (edit) {
        openDialog({
          title: "Edit mahasiswa",
          html: `
            <label>Nama <input name="name" maxlength="100" required></label>
            <label>NIM (8-20 digit, kosongkan bila tidak ada) <input name="nim" maxlength="20" inputmode="numeric"></label>`,
          async onSubmit(data) {
            await api(`/api/students/${edit}`, {
              method: "PATCH",
              json: { name: data.get("name"), nim: data.get("nim") || "" },
            });
            toast("Data mahasiswa diperbarui.");
            await loadTable(content.querySelector("#class-filter").value);
          },
        });
        // isi nilai setelah dialog dibuat
        const dialogForm = document.querySelector("#dialog-form");
        dialogForm.querySelector('[name="name"]').value = button.dataset.name;
        dialogForm.querySelector('[name="nim"]').value = button.dataset.nim;
      } else if (active) {
        await api(`/api/students/${active}`, { method: "PATCH", json: { active: to === "1" } });
        toast(to === "1" ? "Mahasiswa diaktifkan." : "Mahasiswa dinonaktifkan (absensi kamera mengabaikan).");
        await loadTable(content.querySelector("#class-filter").value);
      }
    } catch (err) { toast(err.message, true); }
  });

  content.querySelector("#new-student").addEventListener("click", () => {
    openDialog({
      title: "Daftarkan wajah mahasiswa baru",
      okText: "Mulai latih",
      html: `
        <label>Nama lengkap <input name="name" maxlength="80" required pattern="[A-Za-z .'-]{2,80}"></label>
        <label>NIM (8-20 digit) <input name="nim" required maxlength="20" inputmode="numeric" pattern="\\d{8,20}"></label>
        <label>Kelas <input name="class_name" required maxlength="20" placeholder="cth: SK7A"></label>
        <label>Foto wajah (3-20 file .jpg/.png/.webp/.heic, variasikan pencahayaan dan ekspresi)
          <input id="edu-photos" name="photos" type="file" accept="image/*" multiple required>
        </label>
        <div class="preview-list" id="edu-previews" aria-live="polite"></div>
        <p id="edu-progress" class="progress" aria-live="polite"></p>
        <p class="muted small">Wajah pada tiap foto dipotong otomatis, diamplifikasi lalu SVM dilatih ulang (~1 menit untuk 75 kelas).</p>`,
      async onSubmit(data) {
        const input = document.getElementById("edu-photos");
        const files = [...input.files];
        if (files.length < 3 || files.length > 20) throw new Error("Unggah 3-20 foto.");
        const progress = document.getElementById("edu-progress");
        progress.textContent = "Mengunggah foto...";
        const form = new FormData();
        form.append("name", data.get("name"));
        form.append("nim", data.get("nim"));
        form.append("class_name", data.get("class_name").trim().toUpperCase());
        files.slice(0, 20).forEach((file) => form.append("photos", file));

        const started = await api("/api/students/enroll", { method: "POST", form });
        document.querySelector("#dialog-ok").disabled = true;
        // Polling job, dialog tetap terbuka
        await new Promise((resolve, reject) => {
          const poll = setInterval(async () => {
            try {
              const job = await api(`/api/jobs/${started.job_id}`);
              progress.textContent = `${job.step || "Memproses"}${job.faces_detected != null ? ` (${job.faces_detected}/${job.faces_total} foto terdeteksi)` : ""}`;
              if (job.state === "done") { clearInterval(poll); resolve(job.result); }
              else if (job.state === "error") { clearInterval(poll); reject(new Error(job.error)); }
            } catch (err) { clearInterval(poll); reject(err); }
          }, 1500);
        });
        toast("Wajah terdaftar dan model diperbarui.");
        await loadTable(content.querySelector("#class-filter").value);
      },
    });
  });
}
