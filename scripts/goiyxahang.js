// scripts/goiyxahang.js
// Gợi ý xả hàng: tồn sau kiểm + lọc cơ sở + quản lý giảm giá hàng loạt.

const $ = (sel, root = document) => root.querySelector(sel);
const VALID_DISCOUNTS = new Set([10, 20, 30, 50]);

const formatNumber = (v, digits = 0) => {
  if (v === null || v === undefined || isNaN(v)) return "";
  return Number(v).toLocaleString("vi-VN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const toCsv = (rows) => rows
  .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
  .join("\r\n");

let hot = null;
let hotData = [];
let supabaseClient = null;
let lastPopupMasp = "";
let lastPopupAt = 0;
let isApplyingProgrammaticChange = false;

function normalizeDiscount(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const n = Number(raw.replace("%", ""));
  if (!VALID_DISCOUNTS.has(n)) {
    throw new Error("Chỉ cho phép mức giảm 10, 20, 30, 50 hoặc để trống.");
  }
  return n;
}

const hotCols = [
  { data: "stt", title: "STT", type: "numeric", width: 48, readOnly: true },
  { data: "chon_giam_gia", title: "CHỌN", type: "checkbox", width: 58 },
  { data: "giam_gia_pct", title: "% GIẢM", type: "dropdown", source: ["", "10", "20", "30", "50"], strict: true, allowInvalid: false, width: 78 },
  { data: "masp", title: "MÃ SP", type: "text", width: 145, readOnly: true },
  { data: "tensp", title: "TÊN SP", type: "text", width: 210, readOnly: true },
  { data: "nhomhang", title: "NHÓM HÀNG", type: "text", width: 105, readOnly: true },
  { data: "chungloai", title: "CHỦNG LOẠI", type: "text", width: 95, readOnly: true },
  { data: "nhacc", title: "NHÀ CC", type: "text", width: 120, readOnly: true },
  { data: "tong_nhap", title: "TỔNG NHẬP", type: "numeric", width: 90, readOnly: true },
  { data: "tong_xuat", title: "TỔNG BÁN", type: "numeric", width: 90, readOnly: true },
  { data: "ton_may", title: "TỒN MÁY", type: "numeric", width: 80, readOnly: true },
  { data: "lech_kiem", title: "LỆCH KIỂM", type: "numeric", width: 85, readOnly: true },
  { data: "ton_hientai", title: "TỒN SAU KIỂM", type: "numeric", width: 105, readOnly: true },
  { data: "ton_cs1_sau_kiem", title: "TỒN CS1 SAU KIỂM", type: "numeric", width: 110, readOnly: true },
  { data: "ton_cs2_sau_kiem", title: "TỒN CS2 SAU KIỂM", type: "numeric", width: 110, readOnly: true },
  { data: "tyle_ton", title: "% TỒN/NHẬP", type: "numeric", width: 95, readOnly: true },
  { data: "so_ngay_khong_ban", title: "KHÔNG BÁN (NGÀY)", type: "numeric", width: 115, readOnly: true },
  { data: "ngay_ban_cuoi", title: "NGÀY BÁN CUỐI", type: "text", width: 105, readOnly: true },
];

function isDirty(rec) {
  const a = rec?.giam_gia_pct == null || rec.giam_gia_pct === "" ? null : Number(rec.giam_gia_pct);
  const b = rec?.original_giam_gia_pct == null || rec.original_giam_gia_pct === "" ? null : Number(rec.original_giam_gia_pct);
  return a !== b;
}

function getDirtyRecords() {
  return hotData.filter(isDirty);
}

function updateDirtyStatus() {
  const dirty = getDirtyRecords();
  const el = $("#discountDirtyMsg");
  if (el) {
    el.textContent = dirty.length
      ? `Có ${dirty.length} thay đổi chưa lưu.`
      : "Không có thay đổi chưa lưu.";
  }
  const btn = $("#btnSaveDiscount");
  if (btn) btn.disabled = dirty.length === 0;
  hot?.render();
}

function getVisibleRecords() {
  if (!hot) return [];
  const rows = [];
  const seen = new Set();
  for (let visualRow = 0; visualRow < hot.countRows(); visualRow += 1) {
    const physicalRow = hot.toPhysicalRow(visualRow);
    if (physicalRow == null || physicalRow < 0) continue;
    const rec = hot.getSourceDataAtRow(physicalRow);
    const masp = String(rec?.masp || "").trim().toUpperCase();
    if (!masp || seen.has(masp)) continue;
    seen.add(masp);
    rows.push(rec);
  }
  return rows;
}

function confirmLoseUnsaved() {
  const count = getDirtyRecords().length;
  if (!count) return true;
  return confirm(`Bạn có ${count} thay đổi giảm giá chưa lưu. Tiếp tục sẽ mất các thay đổi này. Bạn có muốn tiếp tục không?`);
}

async function openStockQuick(rec) {
  const masp = String(rec?.masp || "").trim().toUpperCase();
  if (!masp) return;
  const now = Date.now();
  if (masp === lastPopupMasp && now - lastPopupAt < 350) return;
  lastPopupMasp = masp;
  lastPopupAt = now;

  if (window.StockQuick?.showFor) {
    await window.StockQuick.showFor(document.body, masp);
  } else if (typeof window.stockQuickPopup === "function") {
    await window.stockQuickPopup(masp);
  } else {
    alert("Module stockQuickPopup chưa sẵn sàng. Vui lòng tải lại trang.");
  }
}

function renderHOT() {
  const container = $("#hotXa");
  if (!container) return;
  const h = Math.max(430, window.innerHeight - 390);

  if (hot) {
    hot.updateSettings({ data: hotData, height: h });
    hot.render();
    if (hotData.length) hot.scrollViewportTo(0, 0);
    updateDirtyStatus();
    return;
  }

  hot = new Handsontable(container, {
    data: hotData,
    columns: hotCols,
    colHeaders: hotCols.map((c) => c.title),
    rowHeaders: true,
    stretchH: "all",
    autoColumnSize: false,
    manualColumnResize: true,
    manualColumnMove: true,
    height: h,
    licenseKey: "non-commercial-and-evaluation",
    columnSorting: true,
    filters: true,
    dropdownMenu: true,
    contextMenu: ["copy", "---------", "alignment"],
    cells: (row, col) => {
      const props = {};
      const key = hotCols[col]?.data;
      const rec = hotData[row];

      if (hotCols[col]?.readOnly) props.readOnly = true;
      if (["tong_nhap", "tong_xuat", "ton_may", "lech_kiem", "ton_hientai", "ton_cs1_sau_kiem", "ton_cs2_sau_kiem", "tyle_ton", "so_ngay_khong_ban", "stt"].includes(key)) {
        props.className = "htRight";
      }
      if (isDirty(rec) && key === "giam_gia_pct") {
        props.className = `${props.className || ""} discount-dirty-cell`.trim();
      } else if (key === "giam_gia_pct" && rec?.giam_gia_pct) {
        props.className = `${props.className || ""} discount-saved-cell`.trim();
      }
      if (key === "lech_kiem") {
        props.renderer = (instance, td, r, c, prop, value, cellProps) => {
          Handsontable.renderers.NumericRenderer(instance, td, r, c, prop, value, cellProps);
          if (Number(value || 0) !== 0) {
            td.style.color = "#dc2626";
            td.style.fontWeight = "700";
          }
        };
      }
      if (key === "tyle_ton") {
        props.renderer = (_instance, td, _r, _c, _prop, value) => {
          td.textContent = value == null ? "" : `${formatNumber(Number(value) * 100, 1)} %`;
          td.className = "htRight";
        };
      }
      return props;
    },
    beforeChange: (changes, source) => {
      if (!changes || source === "loadData" || isApplyingProgrammaticChange) return;
      for (const change of changes) {
        const prop = change[1];
        if (prop !== "giam_gia_pct") continue;
        try {
          const normalized = normalizeDiscount(change[3]);
          change[3] = normalized == null ? "" : String(normalized);
        } catch (err) {
          alert(err.message);
          return false;
        }
      }
    },
    afterChange: (changes, source) => {
      if (!changes || source === "loadData") return;
      updateDirtyStatus();
    },
    afterOnCellMouseDown: (event, coords) => {
      if (coords.row == null || coords.row < 0) return;
      const key = hotCols[coords.col]?.data;
      if (["chon_giam_gia", "giam_gia_pct"].includes(key)) return;
      const physicalRow = hot.toPhysicalRow(coords.row);
      const rec = hot.getSourceDataAtRow(physicalRow);
      openStockQuick(rec).catch((err) => console.warn("[goiyxahang] mở StockQuick lỗi:", err));
    },
  });
  updateDirtyStatus();
}

function setAllVisibleSelection(value) {
  const rows = getVisibleRecords();
  isApplyingProgrammaticChange = true;
  rows.forEach((rec) => { rec.chon_giam_gia = !!value; });
  isApplyingProgrammaticChange = false;
  hot?.render();
}

function toggleSelectAllVisible() {
  const rows = getVisibleRecords();
  if (!rows.length) return;
  const shouldSelect = !rows.every((r) => r.chon_giam_gia === true);
  setAllVisibleSelection(shouldSelect);
  $("#btnSelectAll").textContent = shouldSelect
    ? "☐ Bỏ chọn tất cả đang hiển thị"
    : "☑ Chọn tất cả đang hiển thị";
}

function applyBulkDiscount() {
  let pct;
  try {
    pct = normalizeDiscount($("#bulkDiscount").value);
  } catch (err) {
    alert(err.message);
    $("#bulkDiscount").focus();
    return;
  }

  const selected = getVisibleRecords().filter((r) => r.chon_giam_gia === true);
  if (!selected.length) {
    alert("Bạn chưa chọn dòng sản phẩm nào.");
    return;
  }

  const text = pct == null ? "xóa giảm giá" : `áp dụng giảm ${pct}%`;
  if (!confirm(`Bạn có muốn ${text} cho ${selected.length} sản phẩm đã chọn không? Dữ liệu mới chỉ được ghi vào bảng và chưa lưu vào cơ sở dữ liệu.`)) return;

  isApplyingProgrammaticChange = true;
  selected.forEach((rec) => { rec.giam_gia_pct = pct == null ? "" : String(pct); });
  isApplyingProgrammaticChange = false;
  hot?.render();
  updateDirtyStatus();
}

function summarizeDirty(dirty) {
  const counts = { addChange: 0, remove: 0, same: 0 };
  dirty.forEach((r) => {
    const now = r.giam_gia_pct == null || r.giam_gia_pct === "" ? null : Number(r.giam_gia_pct);
    if (now == null) counts.remove += 1;
    else counts.addChange += 1;
  });
  return counts;
}

async function saveDiscountChanges() {
  const dirty = getDirtyRecords();
  if (!dirty.length) {
    alert("Không có thay đổi giảm giá để lưu.");
    return;
  }

  const summary = summarizeDirty(dirty);
  const ok = confirm(
    `Bạn có muốn lưu thay đổi giảm giá cho ${dirty.length} sản phẩm không?\n\n` +
    `- Thêm hoặc đổi giảm giá: ${summary.addChange} mã\n` +
    `- Xóa giảm giá: ${summary.remove} mã`
  );
  if (!ok) return;

  const btn = $("#btnSaveDiscount");
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Đang lưu...";

  try {
    const items = dirty.map((r) => ({
      masp: String(r.masp || "").trim().toUpperCase(),
      giam_gia_pct: r.giam_gia_pct == null || r.giam_gia_pct === "" ? null : Number(r.giam_gia_pct),
    }));

    const { data, error } = await supabaseClient.rpc("rpc_save_giam_gia_sanpham_batch", {
      p_items: items,
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.message || "Không lưu được dữ liệu giảm giá");

    const savedMap = new Map((data.items || []).map((x) => [String(x.masp || "").toUpperCase(), x]));
    dirty.forEach((rec) => {
      const key = String(rec.masp || "").toUpperCase();
      const result = savedMap.get(key);
      if (result?.ok !== false) {
        rec.original_giam_gia_pct = rec.giam_gia_pct == null || rec.giam_gia_pct === "" ? null : Number(rec.giam_gia_pct);
        rec.chon_giam_gia = false;
      }
    });

    hot?.render();
    updateDirtyStatus();

    const byPct = { 10: 0, 20: 0, 30: 0, 50: 0, remove: 0 };
    items.forEach((x) => {
      if (x.giam_gia_pct == null) byPct.remove += 1;
      else byPct[x.giam_gia_pct] += 1;
    });
    alert(
      `Đã lưu thành công ${data.updated_count ?? dirty.length} sản phẩm.\n` +
      `10%: ${byPct[10]} | 20%: ${byPct[20]} | 30%: ${byPct[30]} | 50%: ${byPct[50]} | Xóa: ${byPct.remove}`
    );
  } catch (err) {
    console.error("[goiyxahang] Lưu giảm giá lỗi:", err);
    alert("Không lưu được dữ liệu giảm giá: " + (err.message || err));
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
    updateDirtyStatus();
  }
}

async function runXaHang() {
  if (!confirmLoseUnsaved()) return;
  const msg = $("#statusMsg");
  msg.textContent = "Đang lọc danh sách theo tồn sau kiểm...";
  $("#btnRun").disabled = true;
  $("#btnViewImages").disabled = true;

  try {
    if (!supabaseClient) {
      msg.textContent = "❌ Supabase chưa khởi tạo. Vui lòng tải lại trang.";
      return;
    }

    const denNgay = $("#denNgay").value || todayISO();
    const ngayKhongBan = parseInt($("#ngayKhongBan").value || "60", 10);
    const tonMax = parseInt($("#tonMax").value || "3", 10);
    const tyleMaxPercent = parseFloat($("#tyleMax").value || "10");
    const tyleMax = (tyleMaxPercent || 10) / 100;

    const { data, error } = await supabaseClient.rpc("goiy_xahang", {
      p_den_ngay: denNgay,
      p_ngay_khong_ban: ngayKhongBan,
      p_ton_max: tonMax,
      p_tyle_max: tyleMax,
      p_nhomhang_filter: $("#nhomhangFilter").value.trim() || null,
      p_chungloai_filter: $("#chungloaiFilter").value.trim() || null,
      p_nhacc_filter: $("#nhaccFilter").value.trim() || null,
      p_coso_filter: $("#cosoFilter").value || null,
    });
    if (error) throw error;

    hotData = (data || []).map((r, idx) => {
      const pct = r.giam_gia_pct == null ? null : Number(r.giam_gia_pct);
      return {
        ...r,
        stt: idx + 1,
        chon_giam_gia: false,
        giam_gia_pct: pct == null ? "" : String(pct),
        original_giam_gia_pct: pct,
      };
    });
    renderHOT();
    $("#btnSelectAll").textContent = "☑ Chọn tất cả đang hiển thị";

    const coso = $("#cosoFilter").value;
    const cosoLabel = coso === "cs1" ? " tại Cơ sở 1" : coso === "cs2" ? " tại Cơ sở 2" : " ở tất cả cơ sở";
    msg.textContent = hotData.length
      ? `Hoàn thành! Có ${hotData.length} mã gợi ý xả${cosoLabel}, đã tính theo tồn sau kiểm.`
      : `Không có mã nào thỏa điều kiện xả${cosoLabel} theo tồn sau kiểm.`;
  } catch (e) {
    console.error(e);
    msg.textContent = "❌ Lỗi khi chạy gợi ý xả hàng. Xem console để biết chi tiết.";
  } finally {
    $("#btnRun").disabled = false;
    $("#btnViewImages").disabled = false;
  }
}

async function openVisibleImages() {
  const rows = getVisibleRecords();
  if (!rows.length) {
    alert("Không có mã sản phẩm nào đang hiển thị để xem ảnh.");
    return;
  }

  const btn = $("#btnViewImages");
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Đang chuẩn bị ảnh...";

  try {
    const masps = rows.map((r) => String(r.masp || "").trim().toUpperCase()).filter(Boolean);
    let stockMap = {};
    try {
      const { data, error } = await supabaseClient.rpc("xntnhanh", {
        p_masps: masps,
        p_den_ngay: $("#denNgay").value || todayISO(),
        p_tonghop_size: true,
      });
      if (error) throw error;
      (data || []).forEach((r) => {
        const key = String(r.masp || "").trim().toUpperCase();
        if (!key) return;
        stockMap[key] = {
          toncs1: Number(r.ton_cs1 || 0),
          toncs2: Number(r.ton_cs2 || 0),
        };
      });
    } catch (err) {
      console.warn("[goiyxahang] Không lấy được tồn từng CS cho trang ảnh:", err);
    }

    const list = rows.map((r) => {
      const masp = String(r.masp || "").trim().toUpperCase();
      return {
        masp,
        giale: Number(r.giale || 0),
        toncs1: Number(stockMap[masp]?.toncs1 || 0),
        toncs2: Number(stockMap[masp]?.toncs2 || 0),
        giam_gia_pct: r.giam_gia_pct == null || r.giam_gia_pct === "" ? null : Number(r.giam_gia_pct),
      };
    });

    sessionStorage.setItem("XNT14_MASP_LIST", JSON.stringify(list));
    sessionStorage.setItem("XNT14_CONTEXT", JSON.stringify({
      mode: "discount",
      branch: $("#cosoFilter").value || "",
      source: "goiyxahang"
    }));
    sessionStorage.setItem("XNT14_FILTERS", JSON.stringify({
      den_ngay: $("#denNgay").value || todayISO(),
      source: "goiyxahang",
      visible_count: list.length,
    }));
    window.open("xemanhxnt14.html", "_blank");
  } catch (err) {
    console.error(err);
    alert("Không mở được trang xem ảnh: " + (err.message || err));
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

function exportCsv() {
  const rows = getVisibleRecords();
  if (!rows.length) {
    alert("Không có dữ liệu đang hiển thị để xuất.");
    return;
  }
  const exportCols = hotCols.filter((c) => c.data !== "chon_giam_gia");
  const header = exportCols.map((c) => c.title);
  const body = rows.map((r) => exportCols.map((c) => r[c.data]));
  const csv = toCsv([header, ...body]);
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `goi_y_xa_hang_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function main() {
  $("#denNgay").value = todayISO();
  $("#btnRun").addEventListener("click", runXaHang);
  $("#btnViewImages").addEventListener("click", openVisibleImages);
  $("#btnExport").addEventListener("click", exportCsv);
  $("#btnSelectAll").addEventListener("click", toggleSelectAllVisible);
  $("#btnApplyDiscount").addEventListener("click", applyBulkDiscount);
  $("#btnSaveDiscount").addEventListener("click", saveDiscountChanges);
  $("#cosoFilter").addEventListener("change", runXaHang);

  ["denNgay", "ngayKhongBan", "tonMax", "tyleMax", "nhomhangFilter", "chungloaiFilter", "nhaccFilter", "cosoFilter"].forEach((id) => {
    const el = $("#" + id);
    el?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") runXaHang();
    });
  });

  window.addEventListener("beforeunload", (e) => {
    if (!getDirtyRecords().length) return;
    e.preventDefault();
    e.returnValue = "";
  });

  window.addEventListener("resize", () => {
    if (hot) hot.updateSettings({ height: Math.max(430, window.innerHeight - 390) });
  });
  renderHOT();
}

export function initGoiYXaHang() {
  supabaseClient = window.supabase || null;
  if (!supabaseClient) console.error("initGoiYXaHang: window.supabase chưa được khởi tạo bởi authModule");
  main();
}
