import { api, esc, download, toast, STATUS_LABEL } from "../api.js";

const STATUS_COLORS = { recorded: "#1e7b3a", pending: "#e2a700", already: "#1f5fbf", unknown: "#b3261e", other_class: "#7a3fb3", inactive: "#8b8b8b" };
const STATUS_TEXT = {
  recorded: "Hadir tercatat", pending: "Tahan posisi sebentar...", already: "Sudah tercatat",
  unknown: "Tidak dikenali", other_class: "Bukan kelas ini", inactive: "Mahasiswa nonaktif",
};
const SEND_INTERVAL = 1200; // ms antar frame ke server (~0.8 FPS, server butuh ~0.4 s/frame)

export async function render(content, sessionId) {
  let detail;
  try {
    detail = await api(`/api/sessions/${sessionId}`);
  } catch (err) {
    content.innerHTML = `<div class="card empty"><p class="error">${esc(err.message)}</p> <a class="button" href="#/sessions">Kembali</a></div>`;
    return;
  }
  const session = detail.session;
  const open = !session.closed_at;
  document.title = `Absensi ${session.class_name} P${session.meeting}`;

  content.innerHTML = `
    <div class="toolbar">
      <div>
        <h2>${esc(session.course)} — ${esc(session.class_name)}, pertemuan ${esc(session.meeting)}</h2>
        <span class="muted small">${esc(session.topic || "")} | dibuka ${esc(session.opened_at)} oleh ${esc(session.created_by_name)}</span>
      </div><span class="spacer"></span>
      <button class="danger" id="close-btn" type="button">${open ? "Tutup sesi" : "Buka kembali"}</button>
      <button id="csv-btn" type="button">Unduh CSV</button>
      <a class="button" href="#/sessions">Kembali</a>
    </div>

    <div class="attend-grid">
      <section class="card" aria-label="Kamera absensi">
        <div class="video-wrap">
          <video id="video" playsinline muted></video>
          <canvas id="overlay" hidden></canvas>
          <div id="camera-placeholder" class="placeholder">${open
            ? '<p><strong>Kamera belum aktif.</strong><br>Klik "Mulai kamera" untuk mencatat kehadiran lewat wajah.</p>'
            : "<p><strong>Sesi sudah ditutup.</strong></p>"}</div>
        </div>
        <p>
          <button id="camera-btn" class="primary" type="button" ${open ? "" : "disabled"}>Mulai kamera</button>
          <span id="recog-status" class="muted small" aria-live="polite"></span>
        </p>
        <div class="summary" id="summary"></div>
        <ol class="log" id="log" aria-label="Log pengenalan"></ol>
      </section>

      <section class="card" aria-label="Daftar mahasiswa">
        <h3>Daftar absensi</h3>
        <div class="toolbar"><input id="search" type="search" placeholder="Cari nama / NIM..." aria-label="Cari mahasiswa"></div>
        <div class="table-wrap" style="max-height:60vh;overflow-y:auto">
          <table>
            <thead><tr><th>Nama</th><th>Status</th></tr></thead>
            <tbody id="roster"></tbody>
          </table>
        </div>
      </section>
    </div>`;

  const rosterBody = content.querySelector("#roster");
  const summary = content.querySelector("#summary");
  const log = content.querySelector("#log");
  let cameraStream = null;
  let sendTimer = null;
  let busy = false;

  function renderRoster(filter = "") {
    const needle = filter.trim().toLowerCase();
    rosterBody.innerHTML = detail.students
      .filter((s) => !needle || (s.name + " " + s.nim).toLowerCase().includes(needle))
      .map(
        (s) => `
        <tr data-name="${esc((s.name + " " + s.nim).toLowerCase())}">
          <td><strong>${esc(s.name)}</strong><br><span class="muted small">${esc(s.nim || "NIM belum diisi")}</span></td>
          <td><select data-student="${s.id}" aria-label="Status ${esc(s.name)}" ${open ? "" : "disabled"}>
            ${["hadir", "izin", "sakit", "alpa"].map((st) => `<option value="${st}" ${s.status === st ? "selected" : ""}>${STATUS_LABEL[st]}</option>`).join("")}
          </select></td>
        </tr>`
      )
      .join("");
  }

  function renderSummary() {
    const counts = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
    detail.students.forEach((s) => counts[s.status]++);
    const total = detail.students.length || 1;
    summary.innerHTML = [
      ["Hadir", counts.hadir, "ok"], ["Izin", counts.izin, "warn"], ["Sakit", counts.sakit, "warn"], ["Alpa", counts.alpa, "bad"],
    ].map(([label, value, cls]) => `<span class="badge ${cls}">${label} ${value} (${Math.round((100 * value) / total)}%)</span>`).join("");
  }

  renderRoster();
  renderSummary();

  rosterBody.addEventListener("change", async (event) => {
    const select = event.target.closest("select[data-student]");
    if (!select) return;
    const studentId = select.dataset.student;
    const status = select.value;
    try {
      await api(`/api/sessions/${sessionId}/attendance/${studentId}`, { method: "PUT", json: { status } });
      const student = detail.students.find((s) => String(s.id) === studentId);
      student.status = status;
      student.method = "manual";
      renderSummary();
      renderRoster(content.querySelector("#search").value);
      toast(`${student.name}: ${STATUS_LABEL[status]}`);
    } catch (err) {
      toast(err.message, true);
      renderRoster();
    }
  });

  content.querySelector("#search").addEventListener("input", (event) => renderRoster(event.target.value));

  content.querySelector("#csv-btn").addEventListener("click", () => download(`/api/sessions/${sessionId}/export.csv`));

  content.querySelector("#close-btn").addEventListener("click", async (event) => {
    const button = event.target.closest("#close-btn");
    const closing = open;
    if (closing && !confirm("Tutup sesi ini? Absensi via kamera akan berhenti.")) return;
    try {
      await api(`/api/sessions/${sessionId}/close`, { method: "POST", json: { reopen: !closing } });
      toast(closing ? "Sesi ditutup." : "Sesi dibuka kembali.");
      stopCamera();
      if (closing) location.reload();
      else render(content, sessionId);
    } catch (err) { toast(err.message, true); }
  });

  function stopCamera() {
    sendTimer && clearInterval(sendTimer);
    sendTimer = null;
    busy = false;
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    content.querySelector("#overlay").hidden = true;
    content.querySelector("#camera-placeholder").hidden = false;
    content.querySelector("#camera-btn").textContent = "Mulai kamera";
  }

  async function sendFrame() {
    if (busy) return;
    const video = content.querySelector("#video");
    const canvas = content.querySelector("#overlay");
    if (!video.videoWidth) return;
    busy = true;
    const width = Math.min(640, video.videoWidth);
    const canvasOut = document.createElement("canvas");
    canvasOut.width = width;
    canvasOut.height = Math.round((video.videoHeight / video.videoWidth) * width);
    canvasOut.getContext("2d").drawImage(video, 0, 0, canvasOut.width, canvasOut.height);
    try {
      const blob = await new Promise((resolve) => canvasOut.toBlob(resolve, "image/jpeg", 0.8));
      const form = new FormData();
      form.append("frame", blob, "frame.jpg");
      const result = await api(`/api/sessions/${sessionId}/recognize`, { method: "POST", form });
      drawBoxes(result, canvasOut, canvas, video);
      for (const face of result.faces) {
        if (face.student && ["recorded", "already"].includes(face.status)) {
          pushLog(face.student.name, face.student.nim, face.status);
        }
      }
      const fresh = result.faces.some((f) => f.status === "recorded");
      if (fresh) {
        detail = await api(`/api/sessions/${sessionId}`);
        renderRoster(content.querySelector("#search").value);
        renderSummary();
      }
    } catch (err) {
      content.querySelector("#recog-status").textContent = err.message;
    } finally {
      busy = false;
    }
  }

  function drawBoxes(result, source, canvas, video) {
    canvas.hidden = false;
    const scaleX = video.videoWidth / result.width;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const face of result.faces) {
      const [x1, y1, x2, y2] = face.box.map((v) => v * scaleX);
      const color = STATUS_COLORS[face.status] || "#555";
      context.strokeStyle = color;
      context.lineWidth = 3;
      context.strokeRect(x1, y1, x2 - x1, y2 - y1);
      const text = face.student ? `${face.student.name}` : STATUS_TEXT[face.status];
      context.font = "16px system-ui, sans-serif";
      const width = context.measureText(text).width;
      context.fillStyle = color;
      context.fillRect(x1, Math.max(0, y1 - 22), width + 8, 20);
      context.fillStyle = "#fff";
      context.fillText(text, x1 + 4, Math.max(14, y1 - 7));
    }
  }

  content.querySelector("#camera-btn").addEventListener("click", async (event) => {
    const button = event.target;
    if (cameraStream) { stopCamera(); return; }
    button.disabled = true;
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const video = content.querySelector("#video");
      video.srcObject = cameraStream;
      await video.play();
      content.querySelector("#camera-placeholder").hidden = true;
      button.textContent = "Hentikan kamera";
      content.querySelector("#recog-status").textContent = "mengirim frame...";
      sendTimer = setInterval(sendFrame, SEND_INTERVAL);
    } catch (err) {
      toast("Kamera gagal diakses: " + err.message + " (perlu HTTPS atau localhost)", true);
    } finally {
      button.disabled = false;
    }
  });

  myRoute = `#/attend/${sessionId}`;
  stopCameraRef = stopCamera;
}

// Hentikan kamera bila berpindah halaman (stream tetap hidup sekalipun DOM dibuang).
let stopCameraRef = null;
let myRoute = null;
window.addEventListener("hashchange", () => {
  if (stopCameraRef && myRoute && !location.hash.startsWith(myRoute)) stopCameraRef();
});
