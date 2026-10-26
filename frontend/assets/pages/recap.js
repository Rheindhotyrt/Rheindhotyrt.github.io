import { api, esc, download, statusText, STATUS_LABEL } from "../api.js";

export async function render(content) {
  const classes = (await api("/api/classes")).classes;
  content.innerHTML = `
    <div class="toolbar">
      <h2>Rekap kehadiran</h2><span class="spacer"></span>
      <select id="class-filter" style="width:auto" aria-label="Kelas" required>
        <option value="">Pilih kelas...</option>
        ${classes.map((c) => `<option value="${esc(c.class_name)}">${esc(c.class_name)} (${c.total})</option>`).join("")}
      </select>
      <select id="course-filter" style="width:auto" hidden aria-label="Mata kuliah"></select>
      <button id="csv-btn" type="button" hidden>Unduh CSV</button>
    </div>
    <div id="recap-area"></div>`;

  const classFilter = content.querySelector("#class-filter");
  const courseFilter = content.querySelector("#course-filter");
  const area = content.querySelector("#recap-area");
  const csvButton = content.querySelector("#csv-btn");

  async function load() {
    const class_name = classFilter.value;
    if (!class_name) { area.innerHTML = '<div class="card empty">Pilih kelas untuk melihat rekap.</div>'; csvButton.hidden = true; return; }
    courseFilter.hidden = false;
    const data = await api(`/api/recap?class_name=${encodeURIComponent(class_name)}&course=${encodeURIComponent(courseFilter.value || "")}`);
    courseFilter.innerHTML = '<option value="">Semua mata kuliah</option>' +
      data.courses.map((course) => `<option value="${esc(course)}">${esc(course)}</option>`).join("");
    if (courseFilter.value && !data.courses.includes(courseFilter.value) && courseFilter.value !== "") { /* pilihan masih valid */ }

    if (!data.rows.length) {
      area.innerHTML = '<div class="card empty">Belum ada data rekap untuk kelas ini.</div>';
      csvButton.hidden = true;
      return;
    }
    csvButton.hidden = false;

    const body = data.rows
      .map(
        (row) => `
        <tr>
          <td>${esc(row.name)}</td>
          <td class="muted small">${esc(row.nim || "—")}</td>
          <td class="num">${row.statuses.map((s) => `<span title="${STATUS_LABEL[s]}" class="status status-${s}">${s === "hadir" ? "H" : s === "izin" ? "I" : s === "sakit" ? "S" : "A"}</span>`).join(" ")}</td>
          <td class="num status-hadir"><strong>${row.counts.hadir}</strong>/H</td>
          <td>${row.counts.izin}</td><td>${row.counts.sakit}</td><td>${row.counts.alpa}</td>
          <td class="num"><strong>${esc(row.percentage)}%</strong></td>
        </tr>`
      )
      .join("");

    area.innerHTML = `
      <p class="muted small">${data.sessions.length} pertemuan. H=Hadir, I=Izin, S=Sakit, A=Alpa.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Nama</th><th>NIM</th><th>Absen per pertemuan</th><th class="num">Hadir</th><th>Izin</th><th>Sakit</th><th>Alpa</th><th class="num">%</th></tr></thead>
        <tbody>${body}</tbody>
      </table></div>`;
  }

  classFilter.addEventListener("change", () => { courseFilter.value = ""; courseFilter.hidden = !classFilter.value; load(); });
  courseFilter.addEventListener("change", load);
  csvButton.addEventListener("click", () =>
    download(`/api/recap/export.csv?class_name=${encodeURIComponent(classFilter.value)}&course=${encodeURIComponent(courseFilter.value || "")}`)
  );
  load();
}
