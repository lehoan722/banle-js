// scripts/copyDuLieu.js

let daKhoiTaoCopyDuLieu = false;

function laOInputDangNhap(el) {
  const tag = (el?.tagName || "").toUpperCase();
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el?.isContentEditable
  );
}

function taoToastCopy() {
  let toast = document.getElementById("copy-du-lieu-toast");
  if (toast) return toast;

  toast = document.createElement("div");
  toast.id = "copy-du-lieu-toast";
  toast.style.cssText = `
    position: fixed;
    right: 16px;
    bottom: 16px;
    background: #111827;
    color: #fff;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 999999;
    display: none;
    box-shadow: 0 2px 8px rgba(0,0,0,.25);
  `;
  document.body.appendChild(toast);
  return toast;
}

function hienToastCopy(text) {
  const toast = taoToastCopy();
  toast.textContent = text || "Đã copy";
  toast.style.display = "block";

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.display = "none";
  }, 1200);
}

async function copyText(text) {
  const value = String(text || "").trim();
  if (!value) return false;

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (e) {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  }
}

function getSelectedTextNative() {
  const sel = window.getSelection?.();
  const text = sel ? String(sel.toString() || "").trim() : "";
  return text;
}

function getCellValue(cell) {
  if (!cell) return "";

  const input = cell.querySelector?.("input, textarea, select");
  if (input) return String(input.value || "").trim();

  return String(cell.innerText || cell.textContent || "").trim();
}

function getTableSelectionText() {
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return "";

  const range = sel.getRangeAt(0);
  const startCell = range.startContainer?.parentElement?.closest?.("td,th");
  const endCell = range.endContainer?.parentElement?.closest?.("td,th");

  if (!startCell || !endCell) return "";

  const table = startCell.closest("table");
  if (!table || table !== endCell.closest("table")) return "";

  const startRow = startCell.parentElement;
  const endRow = endCell.parentElement;

  const rows = Array.from(table.querySelectorAll("tr"));
  const row1 = rows.indexOf(startRow);
  const row2 = rows.indexOf(endRow);

  if (row1 < 0 || row2 < 0) return "";

  const rMin = Math.min(row1, row2);
  const rMax = Math.max(row1, row2);

  const c1 = Array.from(startRow.children).indexOf(startCell);
  const c2 = Array.from(endRow.children).indexOf(endCell);

  const cMin = Math.min(c1, c2);
  const cMax = Math.max(c1, c2);

  const output = [];

  for (let r = rMin; r <= rMax; r++) {
    const row = rows[r];
    const cells = Array.from(row.children).slice(cMin, cMax + 1);
    output.push(cells.map(getCellValue).join("\t"));
  }

  return output.join("\n").trim();
}

function getHandsontableSelectionText() {
  const hotRoot = document.querySelector(".handsontable");
  if (!hotRoot || !window.Handsontable) return "";

  const hot = window.Handsontable.instances?.find?.(h => {
    try {
      return h?.rootElement && document.body.contains(h.rootElement);
    } catch {
      return false;
    }
  });

  if (!hot || typeof hot.getSelectedRangeLast !== "function") return "";

  const range = hot.getSelectedRangeLast();
  if (!range) return "";

  const fromRow = Math.min(range.from.row, range.to.row);
  const toRow = Math.max(range.from.row, range.to.row);
  const fromCol = Math.min(range.from.col, range.to.col);
  const toCol = Math.max(range.from.col, range.to.col);

  const output = [];

  for (let r = fromRow; r <= toRow; r++) {
    const row = [];
    for (let c = fromCol; c <= toCol; c++) {
      const val = hot.getDataAtCell(r, c);
      row.push(val == null ? "" : String(val));
    }
    output.push(row.join("\t"));
  }

  return output.join("\n").trim();
}

export function initCopyDuLieu(options = {}) {
  if (daKhoiTaoCopyDuLieu) return;
  daKhoiTaoCopyDuLieu = true;

  const {
    showToast = true
  } = options;

  document.addEventListener("keydown", async (e) => {
    const isCopyKey =
      (e.ctrlKey || e.metaKey) &&
      String(e.key || "").toLowerCase() === "c";

    if (!isCopyKey) return;

    // Không can thiệp khi người dùng đang copy trong input/textarea
    if (laOInputDangNhap(e.target)) return;

    let text =
      getHandsontableSelectionText() ||
      getTableSelectionText() ||
      getSelectedTextNative();

    if (!text) return;

    e.preventDefault();

    const ok = await copyText(text);

    if (ok && showToast) {
      const shortText = text.length > 40 ? text.slice(0, 40) + "..." : text;
      hienToastCopy("Đã copy: " + shortText);
    }
  }, true);

  console.log("✅ Đã khởi tạo module copy dữ liệu Ctrl+C");
}