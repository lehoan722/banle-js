// scripts/goiyxahang.js
// Tầng 1: bảng toàn trang + StockQuickPopup + xem ảnh nhanh + tồn sau kiểm.

const $ = (sel, root = document) => root.querySelector(sel);

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

const toCsv = (rows) =>
  rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");

let hot = null;
let hotData = [];
let supabaseClient = null;
let lastPopupMasp = "";
let lastPopupAt = 0;

const hotCols = [
  { data: "stt", title: "STT", type: "numeric", width: 50 },
  { data: "masp", title: "MÃ SP", type: "text", width: 145 },
  { data: "tensp", title: "TÊN SP", type: "text", width: 210 },
  { data: "nhomhang", title: "NHÓM HÀNG", type: "text", width: 105 },
  { data: "chungloai", title: "CHỦNG LOẠI", type: "text", width: 95 },
  { data: "nhacc", title: "NHÀ CC", type: "text", width: 120 },
  { data: "tong_nhap", title: "TỔNG NHẬP", type: "numeric", width: 90 },
  { data: "tong_xuat", title: "TỔNG BÁN", type: "numeric", width: 90 },
  { data: "ton_may", title: "TỒN MÁY", type: "numeric", width: 80 },
  { data: "lech_kiem", title: "LỆCH KIỂM", type: "numeric", width: 85 },
  { data: "ton_hientai", title: "TỒN SAU KIỂM", type: "numeric", width: 105 },
  { data: "tyle_ton", title: "% TỒN/NHẬP", type: "numeric", width: 95 },
  { data: "so_ngay_khong_ban", title: "KHÔNG BÁN (NGÀY)", type: "numeric", width: 115 },
  { data: "ngay_ban_cuoi", title: "NGÀY BÁN CUỐI", type: "text", width: 105 },
];

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
  const h = Math.max(430, window.innerHeight - 315);

  if (hot) {
    hot.updateSettings({ data: hotData, height: h });
    hot.render();
    if (hotData.length) hot.scrollViewportTo(0, 0);
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
    readOnly: true,
    cells: (row, col) => {
      const props = {};
      const key = hotCols[col]?.data;
      if (["tong_nhap", "tong_xuat", "ton_may", "lech_kiem", "ton_hientai", "tyle_ton", "so_ngay_khong_ban", "stt"].includes(key)) {
        props.className = "htRight";
      }
      if (key === "lech_kiem") {
        props.renderer = (instance, td, r, c, prop, value, cellProps) => {
          Handsontable.renderers.NumericRenderer(instance, td, r, c, prop, value, cellProps);
          const n = Number(value || 0);
          if (n !== 0) {
            td.style.color = "#dc2626";
            td.style.fontWeight = "700";
          }
        };
      }
      if (key === "tyle_ton") {
        props.renderer = (instance, td, r, c, prop, value) => {
          td.textContent = value == null ? "" : `${formatNumber(Number(value) * 100, 1)} %`;
          td.className = "htRight";
        };
      }
      return props;
    },
    afterOnCellMouseDown: (_event, coords) => {
      if (coords.row == null || coords.row < 0) return;
      const physicalRow = hot.toPhysicalRow(coords.row);
      const rec = hot.getSourceDataAtRow(physicalRow);
      openStockQuick(rec).catch((err) => console.warn("[goiyxahang] mở StockQuick lỗi:", err));
    },
  });
}

function sumLechObject(obj) {
  if (!obj || typeof obj !== "object") return 0;
  return Object.values(obj).reduce((sum, value) => sum + Number(value || 0), 0);
}

async function fetchKiemTonDelta(masp) {
  try {
    const { data, error } = await supabaseClient.rpc("rpc_stockquick_kiemton", { p_masp: masp });
    if (error) throw error;
    return sumLechObject(data?.cs1?.lech) + sumLechObject(data?.cs2?.lech);
  } catch (err) {
    console.warn(`[goiyxahang] Không lấy được kiểm tồn ${masp}:`, err);
    return 0;
  }
}

async function mapWithConcurrency(items, limit, worker) {
  const result = new Array(items.length);
  let index = 0;
  async function runner() {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      result[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, runner));
  return result;
}

async function applyTonSauKiem(rows, tonMax, tyleMax) {
  const enriched = await mapWithConcurrency(rows, 8, async (r) => {
    const tonMay = Number(r.ton_hientai || 0);
    const lechKiem = await fetchKiemTonDelta(String(r.masp || "").trim().toUpperCase());
    const tonSauKiem = tonMay + lechKiem;
    const tongNhap = Number(r.tong_nhap || 0);
    return {
      ...r,
      ton_may: tonMay,
      lech_kiem: lechKiem,
      ton_hientai: tonSauKiem,
      tyle_ton: tongNhap > 0 ? tonSauKiem / tongNhap : null,
    };
  });

  return enriched.filter((r) =>
    Number(r.ton_hientai) > 0 &&
    Number(r.ton_hientai) <= tonMax &&
    r.tyle_ton != null &&
    Number(r.tyle_ton) <= tyleMax
  );
}

async function runXaHang() {
  const msg = $("#statusMsg");
  msg.textContent = "Đang lọc danh sách và đối chiếu tồn sau kiểm...";
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

    sessionStorage.setItem("XNT14_FILTERS", JSON.stringify({
      den_ngay: denNgay,
      source: "goiyxahang"
    }));

    const { data, error } = await supabaseClient.rpc("goiy_xahang", {
      p_den_ngay: denNgay,
      p_ngay_khong_ban: ngayKhongBan,
      p_ton_max: tonMax,
      p_tyle_max: tyleMax,
      p_nhomhang_filter: $("#nhomhangFilter").value.trim() || null,
      p_chungloai_filter: $("#chungloaiFilter").value.trim() || null,
      p_nhacc_filter: $("#nhaccFilter").value.trim() || null,
    });

    if (error) throw error;

    const rpcRows = data || [];
    const checkedRows = await applyTonSauKiem(rpcRows, tonMax, tyleMax);
    hotData = checkedRows.map((r, idx) => ({ ...r, stt: idx + 1 }));
    renderHOT();

    const removed = rpcRows.length - hotData.length;
    msg.textContent = hotData.length
      ? `Hoàn thành! Có ${hotData.length} mã sau khi áp dụng tồn sau kiểm${removed > 0 ? `; đã loại ${removed} mã không còn đúng ngưỡng` : ""}. Bấm một dòng để xem tồn nhanh.`
      : "Không có mã nào thỏa điều kiện sau khi áp dụng tồn sau kiểm.";
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
      };
    });

    sessionStorage.setItem("XNT14_MASP_LIST", JSON.stringify(list));
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
  const header = hotCols.map((c) => c.title);
  const body = rows.map((r) => hotCols.map((c) => r[c.data]));
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

  ["denNgay", "ngayKhongBan", "tonMax", "tyleMax", "nhomhangFilter", "chungloaiFilter", "nhaccFilter"].forEach((id) => {
    const el = $("#" + id);
    el?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") runXaHang();
    });
  });

  window.addEventListener("resize", () => {
    if (hot) hot.updateSettings({ height: Math.max(430, window.innerHeight - 315) });
  });
  renderHOT();
}

export function initGoiYXaHang() {
  supabaseClient = window.supabase || null;
  if (!supabaseClient) console.error("initGoiYXaHang: window.supabase chưa được khởi tạo bởi authModule");
  main();
}
