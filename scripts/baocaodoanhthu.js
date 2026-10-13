// scripts/baocaodoanhthu.js
import { supabase } from "./supabaseClient.js";
import * as authModule from "./authModule.js";

window.supabase = supabase;

let hotInstance = null;
let currentPage = 1;
let pageSize = 100;
let totalRows = 0;
let currentRows = [];
let lastSummary = null;

const $ = (id) => document.getElementById(id);
const val = (id) => ($(id)?.value || "").trim();
const n = (v) => Number(v || 0);
const fmt = (v) => n(v).toLocaleString("vi-VN");
const fmtDate = (iso) => {
  if (!iso) return "";
  const [y,m,d] = String(iso).split("-");
  return `${d}/${m}/${y}`;
};
const toISO = (d) => {
  const pad = x => String(x).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
};

async function kiemTraQuyenXemTrang(pathTrang) {
  const nv = await authModule.getCurrentUserInfo();
  if (!nv?.manv) {
    document.body.innerHTML = '<div class="fatal">⛔ Bạn chưa đăng nhập.</div>';
    return false;
  }

  const { data, error } = await supabase.rpc("get_pages_for_manv", {
    p_manv: nv.manv
  });

  if (error) {
    document.body.innerHTML = `<div class="fatal">⛔ Lỗi kiểm tra quyền: ${error.message}</div>`;
    return false;
  }

  const dsTrang = (data || []).map(r => r.path);
  if (!nv.is_admin && !dsTrang.includes(pathTrang)) {
    document.body.innerHTML = `<div class="fatal">⛔ Không có quyền truy cập trang này.<br>Mã NV: ${nv.manv}</div>`;
    return false;
  }
  return true;
}
window.kiemTraQuyenXemTrang = kiemTraQuyenXemTrang;

function buildParams() {
  return {
    p_tu_ngay: val("tuNgay") || null,
    p_den_ngay: val("denNgay") || null,
    p_diadiem: val("diadiemSelect") || null,
    p_nhanvien: val("nhanvienInput") || null,
    p_khachhang: val("khachhangInput") || null,
    p_hinhthuctt: val("hinhthucttSelect") || null,
    p_limit: pageSize,
    p_offset: (currentPage - 1) * pageSize
  };
}

function moneyRenderer(instance, td, row, col, prop, value) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  td.textContent = n(value) === 0 ? "" : fmt(value);
  td.classList.add("htRight");
}

function intRenderer(instance, td, row, col, prop, value) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  td.textContent = n(value) === 0 ? "" : fmt(value);
  td.classList.add("htRight");
}

function dateRenderer(instance, td, row, col, prop, value) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  td.innerHTML = value
    ? `<button class="day-link" data-ngay="${value}" title="Xem chi tiết hóa đơn ngày ${fmtDate(value)}">${fmtDate(value)}</button>`
    : "";
}

function renderTable(rows) {
  currentRows = rows || [];

  const columns = [
    { data:"ngay", title:"Ngày", width:92, renderer:dateRenderer },

    { data:"sohd_cs1", title:"Số HĐ\nCS1", width:60, renderer:intRenderer },
    { data:"tongsl_cs1", title:"SL\nCS1", width:55, renderer:intRenderer },
    { data:"tienhang_cs1", title:"Tiền hàng\nCS1", width:95, renderer:moneyRenderer },
    { data:"tongkm_cs1", title:"KM\nCS1", width:82, renderer:moneyRenderer },
    { data:"chietkhau_cs1", title:"CK\nCS1", width:78, renderer:moneyRenderer },
    { data:"doanhthu_cs1", title:"DOANH THU\nCS1", width:110, renderer:moneyRenderer },

    { data:"sohd_cs2", title:"Số HĐ\nCS2", width:60, renderer:intRenderer },
    { data:"tongsl_cs2", title:"SL\nCS2", width:55, renderer:intRenderer },
    { data:"tienhang_cs2", title:"Tiền hàng\nCS2", width:95, renderer:moneyRenderer },
    { data:"tongkm_cs2", title:"KM\nCS2", width:82, renderer:moneyRenderer },
    { data:"chietkhau_cs2", title:"CK\nCS2", width:78, renderer:moneyRenderer },
    { data:"doanhthu_cs2", title:"DOANH THU\nCS2", width:110, renderer:moneyRenderer },

    { data:"sohd_tong", title:"Tổng\nHĐ", width:65, renderer:intRenderer },
    { data:"tongsl_tong", title:"Tổng\nSL", width:65, renderer:intRenderer },
    { data:"tienhang_tong", title:"Tiền hàng\nTỔNG", width:105, renderer:moneyRenderer },
    { data:"tongkm_tong", title:"KM\nTỔNG", width:90, renderer:moneyRenderer },
    { data:"chietkhau_tong", title:"CK\nTỔNG", width:86, renderer:moneyRenderer },
    { data:"doanhthu_tong", title:"DOANH THU\nTỔNG", width:125, renderer:moneyRenderer }
  ];

  const container = $("hot");
  if (!hotInstance) {
    hotInstance = new Handsontable(container, {
      data: currentRows,
      columns,
      colHeaders: columns.map(c => c.title),
      rowHeaders: true,
      stretchH: "none",
      width: "100%",
      height: "100%",
      fixedColumnsStart: 1,
      manualColumnResize: true,
      columnSorting: true,
      filters: true,
      dropdownMenu: true,
      licenseKey: "non-commercial-and-evaluation",
      renderAllRows: false,
      cells(row) {
        return { className: row % 2 === 0 ? "row-even" : "row-odd" };
      }
    });

    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".day-link");
      if (!btn) return;
      openDetail(btn.dataset.ngay, val("diadiemSelect") || "");
    });

    // Bấm trực tiếp ô doanh thu CS1/CS2 để drill-down đúng cơ sở.
    hotInstance.addHook("afterOnCellMouseDown", (event, coords) => {
      if (coords.row < 0 || coords.col < 0) return;
      const row = hotInstance.getSourceDataAtRow(hotInstance.toPhysicalRow(coords.row));
      if (!row?.ngay) return;

      // 6 = doanhthu_cs1, 12 = doanhthu_cs2, 18 = doanhthu_tong theo columns ở trên.
      if (coords.col === 6) openDetail(row.ngay, "cs1");
      if (coords.col === 12) openDetail(row.ngay, "cs2");
      if (coords.col === 18) openDetail(row.ngay, "");
    });
  } else {
    hotInstance.updateSettings({ data: currentRows, columns, colHeaders: columns.map(c=>c.title) });
  }
}

function renderSummary(s) {
  lastSummary = s || {};
  $("sumCS1").textContent = fmt(s?.doanhthu_cs1);
  $("sumCS2").textContent = fmt(s?.doanhthu_cs2);
  $("sumTong").textContent = fmt(s?.doanhthu_tong);

  $("subCS1").textContent =
    `${fmt(s?.sohd_cs1)} HĐ • ${fmt(s?.tongsl_cs1)} SP • KM ${fmt(s?.tongkm_cs1)}`;

  $("subCS2").textContent =
    `${fmt(s?.sohd_cs2)} HĐ • ${fmt(s?.tongsl_cs2)} SP • KM ${fmt(s?.tongkm_cs2)}`;

  $("subTong").textContent =
    `${fmt(s?.sohd_tong)} HĐ • ${fmt(s?.tongsl_tong)} SP • KM ${fmt(s?.tongkm_tong)}`;
}

function updatePaging() {
  const pages = Math.max(1, Math.ceil(totalRows / pageSize));
  $("pageInfo").textContent = `Trang ${currentPage}/${pages} • ${fmt(totalRows)} ngày`;
  $("btnPrev").disabled = currentPage <= 1;
  $("btnNext").disabled = currentPage >= pages;
}

window.xemBaoCaoDoanhThu = async function() {
  currentPage = 1;
  return await window.taiBaoCaoDoanhThu();
};

window.taiBaoCaoDoanhThu = async function() {
  const loading = $("loadingMsg");
  try {
    pageSize = Number(val("pageSize") || 100);
    if (!val("tuNgay") || !val("denNgay")) {
      alert("Vui lòng chọn Từ ngày và Đến ngày.");
      return;
    }
    if (val("tuNgay") > val("denNgay")) {
      alert("Từ ngày không được lớn hơn Đến ngày.");
      return;
    }

    loading.textContent = "Đang tổng hợp doanh thu...";
    const { data, error } = await supabase.rpc("baocaodoanhthu_bundle_v1", buildParams());
    if (error) throw error;

    const payload = Array.isArray(data) ? (data[0] || {}) : (data || {});
    const rows = Array.isArray(payload.rows) ? payload.rows : [];

    totalRows = Number(payload.total_rows || 0);
    renderTable(rows);
    renderSummary(payload.summary || {});
    updatePaging();
    loading.textContent = "";
  } catch (err) {
    console.error(err);
    loading.textContent = "Lỗi tải báo cáo: " + (err?.message || err);
  }
};

window.prevPage = async function() {
  if (currentPage <= 1) return;
  currentPage--;
  await window.taiBaoCaoDoanhThu();
};

window.nextPage = async function() {
  const max = Math.max(1, Math.ceil(totalRows / pageSize));
  if (currentPage >= max) return;
  currentPage++;
  await window.taiBaoCaoDoanhThu();
};

window.resetFilters = async function() {
  $("diadiemSelect").value = "";
  $("nhanvienInput").value = "";
  $("khachhangInput").value = "";
  $("hinhthucttSelect").value = "";
  currentPage = 1;
  await window.taiBaoCaoDoanhThu();
};

async function openDetail(ngay, coso = "") {
  const modal = $("detailModal");
  const title = $("detailTitle");
  const body = $("detailBody");
  modal.classList.add("show");
  title.textContent = `Chi tiết hóa đơn ${fmtDate(ngay)}${coso ? " - " + coso.toUpperCase() : ""}`;
  body.innerHTML = `<div class="detail-loading">Đang tải...</div>`;

  const { data, error } = await supabase.rpc("baocaodoanhthu_chitiet_v1", {
    p_ngay: ngay,
    p_diadiem: coso || null,
    p_nhanvien: val("nhanvienInput") || null,
    p_khachhang: val("khachhangInput") || null,
    p_hinhthuctt: val("hinhthucttSelect") || null
  });

  if (error) {
    body.innerHTML = `<div class="error">${error.message}</div>`;
    return;
  }

  const rows = data || [];
  const total = rows.reduce((a,r)=>a+n(r.doanhthu),0);

  body.innerHTML = `
    <div class="detail-total">Tổng ${fmt(rows.length)} hóa đơn • Doanh thu <b>${fmt(total)}</b></div>
    <div class="detail-table-wrap">
      <table class="detail-table">
        <thead>
          <tr>
            <th>Hóa đơn</th><th>CS</th><th>Nhân viên</th><th>Khách</th><th>TT</th>
            <th>SL</th><th>Tiền hàng</th><th>KM</th><th>CK</th><th>Doanh thu</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.sohd || ""}</td>
              <td>${String(r.coso || "").toUpperCase()}</td>
              <td>${r.tennv || ""}</td>
              <td>${r.khachhang || ""}</td>
              <td>${r.hinhthuctt || ""}</td>
              <td class="num">${fmt(r.tongsl)}</td>
              <td class="num">${fmt(r.tien_hang_truoc_giam)}</td>
              <td class="num">${fmt(r.tongkm)}</td>
              <td class="num">${fmt(r.chietkhau)}</td>
              <td class="num strong">${fmt(r.doanhthu)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`;
}

window.closeDetail = function() {
  $("detailModal").classList.remove("show");
};

async function loadPaymentMethods() {
  try {
    const { data, error } = await supabase.rpc("baocaodoanhthu_hinhthuctt_v1");
    if (error) throw error;
    const sel = $("hinhthucttSelect");
    (data || []).forEach(r => {
      const v = String(r.hinhthuctt || "").trim();
      if (!v) return;
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v.toUpperCase();
      sel.appendChild(o);
    });
  } catch (e) {
    console.warn("Không tải được hình thức TT:", e);
  }
}

// Popup tìm nhanh nhân viên / khách hàng
window.openSearch = async function(type) {
  const modal = $("searchModal");
  const input = $("searchInput");
  modal.dataset.type = type;
  input.value = "";
  modal.classList.add("show");
  $("searchTitle").textContent = type === "nhanvien" ? "Chọn nhân viên" : "Chọn khách hàng";
  await searchPopup("");
  setTimeout(()=>input.focus(), 50);
};

window.closeSearch = function() {
  $("searchModal").classList.remove("show");
};

async function searchPopup(keyword) {
  const type = $("searchModal").dataset.type;
  const list = $("searchList");
  keyword = String(keyword || "").trim();

  if (type === "nhanvien") {
    let q = supabase.from("dmnhanvien").select("manv,tennv").limit(300);
    if (keyword) q = q.or(`manv.ilike.%${keyword}%,tennv.ilike.%${keyword}%`);
    const { data, error } = await q;
    if (error) { list.textContent = error.message; return; }
    list.innerHTML = (data || []).map(r =>
      `<button class="search-row" data-value="${escapeHtml(r.manv || "")}">
         <b>${escapeHtml(r.tennv || "")}</b><small>${escapeHtml(r.manv || "")}</small>
       </button>`
    ).join("");
  } else {
    let q = supabase.from("dmkhachhang").select("makh,tenkh").limit(300);
    if (keyword) q = q.or(`makh.ilike.%${keyword}%,tenkh.ilike.%${keyword}%`);
    const { data, error } = await q;
    if (error) { list.textContent = error.message; return; }
    list.innerHTML = (data || []).map(r =>
      `<button class="search-row" data-value="${escapeHtml(r.makh || "")}">
         <b>${escapeHtml(r.tenkh || "")}</b><small>${escapeHtml(r.makh || "")}</small>
       </button>`
    ).join("");
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

function exportExcel() {
  if (!currentRows.length) {
    alert("Chưa có dữ liệu để xuất.");
    return;
  }
  if (typeof XLSX === "undefined") {
    alert("Thiếu thư viện XLSX.");
    return;
  }

  const rows = currentRows.map((r,i)=>({
    STT: (currentPage-1)*pageSize+i+1,
    Ngay: fmtDate(r.ngay),

    SoHD_CS1: n(r.sohd_cs1),
    SL_CS1: n(r.tongsl_cs1),
    TienHang_CS1: n(r.tienhang_cs1),
    KM_CS1: n(r.tongkm_cs1),
    ChietKhau_CS1: n(r.chietkhau_cs1),
    DoanhThu_CS1: n(r.doanhthu_cs1),

    SoHD_CS2: n(r.sohd_cs2),
    SL_CS2: n(r.tongsl_cs2),
    TienHang_CS2: n(r.tienhang_cs2),
    KM_CS2: n(r.tongkm_cs2),
    ChietKhau_CS2: n(r.chietkhau_cs2),
    DoanhThu_CS2: n(r.doanhthu_cs2),

    SoHD_Tong: n(r.sohd_tong),
    SL_Tong: n(r.tongsl_tong),
    TienHang_Tong: n(r.tienhang_tong),
    KM_Tong: n(r.tongkm_tong),
    ChietKhau_Tong: n(r.chietkhau_tong),
    DoanhThu_Tong: n(r.doanhthu_tong)
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "DoanhThu");
  XLSX.writeFile(wb, `baocaodoanhthu_${val("tuNgay")}_${val("denNgay")}.xlsx`, { compression:true });
}
window.xuatExcelDoanhThu = exportExcel;

document.addEventListener("DOMContentLoaded", async () => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  $("tuNgay").value = toISO(first);
  $("denNgay").value = toISO(now);

  $("pageSize").addEventListener("change", async () => {
    currentPage = 1;
    await window.taiBaoCaoDoanhThu();
  });

  $("searchInput").addEventListener("input", e => searchPopup(e.target.value));
  $("searchList").addEventListener("click", e => {
    const row = e.target.closest(".search-row");
    if (!row) return;
    const type = $("searchModal").dataset.type;
    if (type === "nhanvien") $("nhanvienInput").value = row.dataset.value || "";
    else $("khachhangInput").value = row.dataset.value || "";
    window.closeSearch();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      window.closeDetail();
      window.closeSearch();
    }
  });

  await loadPaymentMethods();
});
