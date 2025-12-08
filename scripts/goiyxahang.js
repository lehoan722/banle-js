// scripts/goiyxahang.js
// Trang gợi ý xả hàng: gọi RPC goiy_xahang, hiển thị HOT, chi tiết + ảnh.

// ========== Helper chung ==========
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const formatNumber = (v, digits = 0) => {
  if (v === null || v === undefined || isNaN(v)) return "";
  return Number(v).toLocaleString("vi-VN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const formatDate = (dStr) => {
  if (!dStr) return "";
  const d = new Date(dStr);
  if (Number.isNaN(d.getTime())) return dStr;
  return d.toLocaleDateString("vi-VN");
};

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const toCsv = (rows) =>
  rows
    .map((r) =>
      r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")
    )
    .join("\r\n");

// ========== HOT cấu hình ==========
let hot = null;
let hotData = [];
let supabaseClient = null; // sẽ được gán trong initGoiYXaHang()

const hotCols = [
  { data: "stt", title: "STT", type: "numeric", width: 50 },
  { data: "masp", title: "MÃ SP", type: "text", width: 140 },
  { data: "tensp", title: "TÊN SP", type: "text", width: 200 },
  { data: "nhomhang", title: "NHÓM HÀNG", type: "text", width: 90 },
  { data: "chungloai", title: "CHỦNG LOẠI", type: "text", width: 90 },
  { data: "nhacc", title: "NHÀ CC", type: "text", width: 120 },
  { data: "tong_nhap", title: "TỔNG NHẬP", type: "numeric", width: 90 },
  { data: "tong_xuat", title: "TỔNG BÁN", type: "numeric", width: 90 },
  { data: "ton_hientai", title: "TỒN HIỆN TẠI", type: "numeric", width: 90 },
  { data: "tyle_ton", title: "% TỒN/NHẬP", type: "numeric", width: 90 },
  {
    data: "so_ngay_khong_ban",
    title: "KHÔNG BÁN (NGÀY)",
    type: "numeric",
    width: 110,
  },
  { data: "ngay_ban_cuoi", title: "NGÀY BÁN CUỐI", type: "text", width: 100 },
];

function renderHOT() {
  const container = $("#hotXa");
  if (!container) return;

  const h = Math.max(320, ($("#hotWrap")?.clientHeight || 0) - 10);

  if (hot) {
    hot.updateSettings({ data: hotData, height: h });
    hot.render();
    hot.scrollViewportTo(0, 0);
    return;
  }

  hot = new Handsontable(container, {
    data: hotData,
    columns: hotCols,
    colHeaders: hotCols.map((c) => c.title),
    rowHeaders: true,
    stretchH: "none",
    autoColumnSize: false,
    manualColumnResize: true,
    manualColumnMove: true,
    height: h,
    licenseKey: "non-commercial-and-evaluation",
    columnSorting: true,
    filters: true,
    dropdownMenu: true,
    contextMenu: ["copy", "cut", "---------", "alignment"],
    cells: (row, col) => {
      const props = {};
      const key = hotCols[col]?.data;
      if (
        [
          "tong_nhap",
          "tong_xuat",
          "ton_hientai",
          "tyle_ton",
          "so_ngay_khong_ban",
          "stt",
        ].includes(key)
      ) {
        props.className = "htRight";
      }
      return props;
    },
    afterSelection: (r1) => {
      if (r1 == null || r1 < 0) return;
      const phys = hot.toPhysicalRow(r1);
      const rec = hot.getSourceDataAtRow(phys);
      if (rec?.masp) {
        updateDetailPanel(rec);
      }
    },
  });
}

// ========== Detail panel ==========
function updateDetailPanel(rec) {
  $("#infoMasp").textContent = rec.masp || "-";
  $("#infoTensp").textContent = rec.tensp || "-";
  $("#infoNhom").textContent =
    `${rec.nhomhang || ""} / ${rec.chungloai || ""}`.trim() || "-";
  $("#infoMauNhacc").textContent =
    `${rec.mausac || ""} / ${rec.nhacc || ""}`.trim() || "-";
  $("#infoGia").textContent = formatNumber(rec.giale, 0);
  $("#infoTongNhap").textContent = formatNumber(rec.tong_nhap, 0);
  $("#infoTongXuat").textContent = formatNumber(rec.tong_xuat, 0);
  $("#infoTon").textContent = formatNumber(rec.ton_hientai, 0);
  $("#infoTyle").textContent =
    rec.tyle_ton != null ? formatNumber(rec.tyle_ton * 100, 1) + " %" : "-";
  $("#infoLastSale").textContent = formatDate(rec.ngay_ban_cuoi);
  $("#infoNoSale").textContent =
    rec.so_ngay_khong_ban != null ? `${rec.so_ngay_khong_ban} ngày` : "-";

  // Ảnh
  const box = $("#xaImgBox");
  box.innerHTML = "";
  const img = document.createElement("img");
  img.alt = rec.masp;
  const base =
    "https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/";
  // Nếu bucket ảnh khác thì anh chỉ cần đổi base
  img.src = `${base}${encodeURIComponent(rec.masp)}.JPG`;
  img.onerror = () => {
    img.onerror = null;
    img.src = `${base}${encodeURIComponent(rec.masp)}.png`;
  };
  box.appendChild(img);
}

// ========== Gọi RPC ==========
async function runXaHang() {
  const msg = $("#statusMsg");
  msg.textContent = "Đang lọc gợi ý xả hàng...";
  $("#btnRun").disabled = true;

  try {
    if (!supabaseClient) {
      console.error("Supabase client chưa sẵn sàng");
      msg.textContent = "❌ Supabase chưa khởi tạo. Vui lòng tải lại trang.";
      return;
    }

    const denNgay = $("#denNgay").value || todayISO();
    const ngayKhongBan = parseInt($("#ngayKhongBan").value || "60", 10);
    const tonMax = parseInt($("#tonMax").value || "3", 10);
    const tyleMaxPercent = parseFloat($("#tyleMax").value || "10");

    const nhomhangFilter = $("#nhomhangFilter").value.trim() || null;
    const chungloaiFilter = $("#chungloaiFilter").value.trim() || null;
    const nhaccFilter = $("#nhaccFilter").value.trim() || null;

    const { data, error } = await supabaseClient.rpc("goiy_xahang", {
      p_den_ngay: denNgay,
      p_ngay_khong_ban: ngayKhongBan,
      p_ton_max: tonMax,
      p_tyle_max: (tyleMaxPercent || 10) / 100.0,
      p_nhomhang_filter: nhomhangFilter,
      p_chungloai_filter: chungloaiFilter,
      p_nhacc_filter: nhaccFilter,
    });

    if (error) {
      console.error(error);
      msg.textContent = "❌ Lỗi RPC goiy_xahang. Xem console để biết chi tiết.";
      return;
    }

    hotData = (data || []).map((r, idx) => ({
      stt: idx + 1,
      masp: r.masp,
      tensp: r.tensp,
      nhomhang: r.nhomhang,
      chungloai: r.chungloai,
      mausac: r.mausac,
      nhacc: r.nhacc,
      giale: r.giale,
      tong_nhap: r.tong_nhap,
      tong_xuat: r.tong_xuat,
      ton_hientai: r.ton_hientai,
      tyle_ton: r.tyle_ton,
      ngay_ban_cuoi: r.ngay_ban_cuoi,
      so_ngay_khong_ban: r.so_ngay_khong_ban,
    }));

    renderHOT();

    if (hotData.length === 0) {
      msg.textContent = "Không có mã nào thỏa điều kiện xả hàng.";
      $("#infoTable")
        .querySelectorAll("td")
        .forEach((td) => (td.textContent = "-"));
      $("#xaImgBox").innerHTML =
        '<span style="font-size:12px; color:#9ca3af;">Không có dữ liệu.</span>';
    } else {
      msg.textContent = `Hoàn thành! Có ${hotData.length} mã gợi ý xả hàng.`;
      updateDetailPanel(hotData[0]);
    }
  } catch (e) {
    console.error(e);
    msg.textContent = "❌ Lỗi không xác định khi chạy gợi ý xả hàng.";
  } finally {
    $("#btnRun").disabled = false;
  }
}

// ========== Xuất CSV ==========
function exportCsv() {
  if (!hotData.length) {
    alert("Không có dữ liệu để xuất.");
    return;
  }
  const header = hotCols.map((c) => c.title);
  const body = hotData.map((r) => hotCols.map((c) => r[c.data]));
  const csv = toCsv([header, ...body]);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `goi_y_xa_hang_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ========== Khởi tạo sau khi đăng nhập thành công ==========
function main() {
  // Set default "Đến ngày" = hôm nay
  $("#denNgay").value = todayISO();

  $("#btnRun").addEventListener("click", () => runXaHang());
  $("#btnExport").addEventListener("click", () => exportCsv());

  // Cho phép bấm Enter trong input filter để chạy ngay
  [
    "denNgay",
    "ngayKhongBan",
    "tonMax",
    "tyleMax",
    "nhomhangFilter",
    "chungloaiFilter",
    "nhaccFilter",
  ].forEach((id) => {
    const el = $("#" + id);
    if (!el) return;
    el.addEventListener("keypress", (e) => {
      if (e.key === "Enter") runXaHang();
    });
  });

  // Render HOT rỗng lần đầu
  renderHOT();
}

/**
 * Hàm public được gọi từ HTML sau khi đăng nhập chuẩn auth thành công
 */
export function initGoiYXaHang() {
  supabaseClient = window.supabase || null;
  if (!supabaseClient) {
    console.error(
      "initGoiYXaHang: window.supabase chưa được khởi tạo bởi authModule"
    );
  }
  main();
}
