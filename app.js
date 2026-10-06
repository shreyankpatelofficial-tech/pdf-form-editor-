// === pdf.js worker ===
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// === Coordinates for blank fields (measured on Page 1 & Page 2) ===
// PDF user units: origin bottom-left. We use top-left relative coords in the viewer.
// Page size for this IPO form ≈ 595 x 842 (A4) for page1, page2 similar.
// Adjust these values if needed after checking rendering.

const PDF_URL = "TEMPSENS_905554868.pdf";

// Field coordinates [pageIndex, x, y, width, height] in PDF points (top-left origin at render)
// These match the blank boxes in the scanned form.
const FIELD_COORDS = {
  name:              { page: 0, x: 358, y: 92,  w: 195, h: 12 },
  address:           { page: 0, x: 358, y: 108, w: 195, h: 22 },
  city:              { page: 0, x: 358, y: 130, w: 195, h: 12 },
  email:             { page: 0, x: 358, y: 142, w: 195, h: 12 },
  phone:             { page: 0, x: 358, y: 154, w: 195, h: 12 },
  pan:               { page: 0, x: 358, y: 166, w: 195, h: 12 },

  dpid:              { page: 0, x: 30,  y: 245, w: 500, h: 12 },
  depo_ac:           { page: 0, x: 30,  y: 258, w: 500, h: 12 },

  opt1_shares:       { page: 0, x: 175, y: 300, w: 60,  h: 14 },
  opt1_price:        { page: 0, x: 335, y: 300, w: 55,  h: 14 },

  amount_fig:        { page: 0, x: 30,  y: 360, w: 145, h: 14 },
  amount_words:      { page: 0, x: 200, y: 360, w: 330, h: 14 },
  asba_ac:           { page: 0, x: 85,  y: 382, w: 445, h: 14 },
  bank_name:         { page: 0, x: 85,  y: 400, w: 445, h: 14 },

  holder_name:       { page: 1, x: 95,  y: 405, w: 200, h: 12 }, // acknowledgement slip
};

// === State ===
let pdfDoc = null;
let pdfBytes = null;
let scale = 1.3;
let overlays = {}; // id -> HTMLInputElement

// === Init: Load PDF ===
async function loadPDF() {
  try {
    pdfBytes = await fetch(PDF_URL).then(r => r.arrayBuffer());
    pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
    renderAll();
    attachOverlays();
    document.getElementById("status").textContent =
      `✅ Loaded ${pdfDoc.numPages} pages`;
  } catch (e) {
    console.error(e);
    document.getElementById("status").textContent = "❌ PDF load failed";
  }
}

// === Render ===
async function renderAll() {
  const viewer = document.getElementById("pdfViewer");
  viewer.innerHTML = "";

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });

    const wrap = document.createElement("div");
    wrap.className = "pdf-page-wrap";
    wrap.style.width = viewport.width + "px";
    wrap.style.height = viewport.height + "px";
    wrap.dataset.page = i - 1;

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    wrap.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    viewer.appendChild(wrap);
  }
}

// === Overlay inputs on top of PDF ===
function attachOverlays() {
  overlays = {};
  const wraps = document.querySelectorAll(".pdf-page-wrap");

  Object.entries(FIELD_COORDS).forEach(([id, cfg]) => {
    const wrap = wraps[cfg.page];
    if (!wrap) return;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "overlay-input";
    input.id = "ov_" + id;

    // Scale coordinates
    input.style.left   = cfg.x * scale + "px";
    input.style.top    = cfg.y * scale + "px";
    input.style.width  = cfg.w * scale + "px";
    input.style.height = cfg.h * scale + "px";

    // Sync with sidebar
    const sidebar = document.getElementById(id);
    if (sidebar) {
      input.addEventListener("input", () => (sidebar.value = input.value));
      sidebar.addEventListener("input", () => (input.value = sidebar.value));
    }

    wrap.appendChild(input);
    overlays[id] = input;
  });
}

// === Fill PDF (draw text using pdf-lib) ===
async function fillPDF() {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;

  const pdf = await PDFDocument.load(pdfBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const values = {
    name:          v("name"),
    address:       v("address"),
    city:          v("city"),
    email:         v("email"),
    phone:         v("phone"),
    pan:           v("pan"),
    dpid:          v("dpid"),
    depo_ac:       v("depo_ac"),
    opt1_shares:   v("opt1_shares"),
    opt1_price:    v("opt1_price"),
    amount_fig:    v("amount_fig"),
    amount_words:  v("amount_words"),
    asba_ac:       v("asba_ac"),
    bank_name:     v("bank_name"),
    holder_name:   v("holder_name"),
  };

  Object.entries(FIELD_COORDS).forEach(([key, cfg]) => {
    const text = (values[key] || "").toString().trim();
    if (!text) return;

    const page = pdf.getPage(cfg.page);
    const { width, height } = page.getSize();
    // cfg.y is TOP-based; convert to PDF bottom-based
    const y = height - cfg.y - cfg.h + 2;

    page.drawText(text, {
      x: cfg.x + 2,
      y: y,
      size: Math.min(cfg.h - 2, 10),
      font: font,
      color: rgb(0, 0, 0),
    });
  });

  const bytes = await pdf.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  window.__filledBlob = blob;

  document.getElementById("saveBtn").disabled = false;
  document.getElementById("status").textContent = "✅ PDF filled — Save karein!";

  // Live preview refresh
  pdfBytes = bytes.buffer;
  pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
  await renderAll();
  attachOverlays();
}

function v(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}

// === Save ===
function savePDF() {
  if (!window.__filledBlob) return;
  const url = URL.createObjectURL(window.__filledBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Tempsens_Filled_" + Date.now() + ".pdf";
  a.click();
  URL.revokeObjectURL(url);
}

// === Reset ===
function resetAll() {
  document.querySelectorAll("input, textarea").forEach(el => (el.value = ""));
  loadPDF();
}

// === Zoom ===
function setZoom(delta) {
  scale = Math.min(2.5, Math.max(0.6, scale + delta));
  document.getElementById("zoomVal").textContent = Math.round(scale * 100 / 1.3) + "%";
  renderAll().then(attachOverlays);
}

// === Bind ===
document.getElementById("fillBtn").addEventListener("click", fillPDF);
document.getElementById("saveBtn").addEventListener("click", savePDF);
document.getElementById("resetBtn").addEventListener("click", resetAll);
document.getElementById("zoomIn").addEventListener("click", () => setZoom(0.15));
document.getElementById("zoomOut").addEventListener("click", () => setZoom(-0.15));

// Kick off
loadPDF();