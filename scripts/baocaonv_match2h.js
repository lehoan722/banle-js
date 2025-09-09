// scripts/baocaonv_match2h.js
import { supabase } from "./supabaseClient.js";

let hotSummary = null, hotDetails = null, hotUnmatched = null;
let activeTab = "summary"; // summary | details | unmatched
let savedFilters = null;

// paging state cho details/unmatched
let pageSize = 1000;
let totalRowsDetails = 0, currentPageDetails = 1;
let totalRowsUnm = 0, currentPageUnm = 1;

const el = (id) => document.getElementById(id);
const show = (node, v=true) => node.style.display = v ? "" : "none";

function safeDestroy(hot) {
  if (!hot) return null;
  try {
    if (typeof hot.isDestroyed === "function") {
      if (!hot.isDestroyed()) hot.destroy();
    } else hot.destroy();
  } catch {}
  return null;
}

// ====== FORMAT RENDERERS ======
function formatNumberCell(instance, td, row, col, prop, value) {
  const v = (value==null || value==='') ? '' : Number(value).toLocaleString('vi-VN');
  td.textContent = v;
}
function formatPercentCell(instance, td, row, col, prop, value) {
  const num = Number(value || 0);
  td.textContent = (num*100).toFixed(1) + '%';
}
function formatDateVN(instance, td, row, col, prop, value) {
  if (!value) { td.textContent = ""; return; }
  try {
    const d = new Date(value); // UTC
    d.setHours(d.getHours() + 7); // Asia/Ho_Chi_Minh
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    const hh = String(d.getHours()).padStart(2,'0');
    const mi = String(d.getMinutes()).padStart(2,'0');
    td.textContent = `${yy}-${mm}-${dd} ${hh}-${mi}`;
  } catch { td.textContent = value; }
}

// ====== FILTERS ======
function collectFilters() {
  const tu_ngay = el("tuNgay").value;
  const den_ngay = el("denNgay").value;
  if (!tu_ngay || !den_ngay) {
    alert("Vui lòng chọn đủ Từ ngày và Đến ngày!");
    return null;
  }

  const manv = (el("manvInput").value || "").trim();
  const maspSingle = (el("maspInput").value || "").trim().toUpperCase();
  // maspList: cho phép nhập nhiều, phân tách bằng , hoặc khoảng trắng
  let maspList = (el("maspList").value || "").trim().toUpperCase();
  let list = maspList
    ? maspList.split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
    : (maspSingle ? [maspSingle] : null);
  if (list && list.length === 0) list = null;

  const size = (el("sizeInput").value || "").trim();
  const p_min_price = Number(el("minPrice").value || 160000);
  const p_diadiem = "cs1"; // khóa cứng

  const f = {
    tu_ngay, den_ngay,
    p_manv: manv || null,
    p_masp_list: list,
    p_size: size || null,
    p_min_price,
    p_diadiem
  };
  return f;
}

// ====== SUMMARY ======
async function loadSummary() {
  const container = el("hotSummary");
  hotSummary = safeDestroy(hotSummary);
  container.innerHTML = "<div style='color:#888'>Đang tải tổng hợp...</div>";

  const { data, error } = await supabase.rpc("nv_match2h_summary", savedFilters);
  if (error) { console.error(error); alert("Lỗi tải tổng hợp!"); container.innerHTML=""; return; }

  const rows = (data || []).map((r, idx) => ({ stt: idx+1, ...r }));

  // KPI
  show(el("kpiRow"), true);
  const sumB = rows.reduce((s,r) => s + Number(r.doanh_thu_gia_b||0), 0);
  const sumSL = rows.reduce((s,r) => s + Number(r.tong_sl_ghep||0), 0);
  const sumUnm = rows.reduce((s,r) => s + Number(r.sl_khong_ghep||0), 0);
  const tyLe = (sumSL + sumUnm) ? (sumSL/(sumSL+sumUnm)) : 0;
  const sumGiaKhac = rows.reduce((s,r)=> s + Number(r.so_sp_gia_khac||0), 0);
  const avgDelta = rows.length ? (rows.reduce((s,r)=> s + Number(r.delta_tb_min||0),0) / rows.length) : 0;

  el("kpiDoanhThuB").textContent = sumB.toLocaleString('vi-VN');
  el("kpiSL").textContent = sumSL.toLocaleString('vi-VN');
  el("kpiTyLe").textContent = (tyLe*100).toFixed(1) + '%';
  el("kpiGiaKhac").textContent = rows.length ? ((sumGiaKhac/rows.length)*100).toFixed(1)+'%' : '0%';
  el("kpiDelta").textContent = (avgDelta||0).toFixed(1) + ' phút';

  // Bảng
  const columns = [
    { data:"stt", title:"STT", readOnly:true, width:45 },
    { data:"manv", title:"Mã NV", readOnly:true, width:90 },
    { data:"tennv", title:"Tên NV", readOnly:true, width:140 },
    { data:"tong_sl_ghep", title:"Tổng SL ghép", readOnly:true, type:"numeric" },
    { data:"doanh_thu_gia_b", title:"Doanh thu (giá B)", readOnly:true, type:"numeric", renderer:formatNumberCell },
    { data:"doanh_thu_gia_a", title:"Doanh thu tham chiếu (giá A)", readOnly:true, type:"numeric", renderer:formatNumberCell },
    { data:"so_dong_ghep", title:"Số dòng ghép", readOnly:true, type:"numeric" },
    { data:"sl_khong_ghep", title:"SL không ghép", readOnly:true, type:"numeric" },
    { data:"ty_le_ghep", title:"Tỷ lệ ghép", readOnly:true, renderer:formatPercentCell },
    { data:"so_sp_gia_khac", title:"Số SP khác giá", readOnly:true, type:"numeric" },
    { data:"delta_tb_min", title:"Δ TB (phút)", readOnly:true, type:"numeric" }
  ];

  hotSummary = new Handsontable(container, {
    data: rows,
    columns,
    colHeaders: columns.map(c => c.title || c.data),
    rowHeaders: true, stretchH:'all',
    height: Math.min(window.innerHeight - 280, 520),
    manualColumnResize:true, filters:true, dropdownMenu:true,
    licenseKey:'non-commercial-and-evaluation'
  });
}

// ====== DETAILS ======
async function refreshDetailsCount() {
  const priceMatch = el("priceMatchSelect").value || 'unmatched';
  const { data, error } = await supabase.rpc("nv_match2h_details_count", {
    ...savedFilters, p_price_match: priceMatch
  });
  if (error) { console.error(error); alert("Lỗi đếm details!"); return; }
  totalRowsDetails = Number(data||0);
  currentPageDetails = 1;
  updatePager(totalRowsDetails, "details");
}
async function loadDetailsPage(page=1) {
  const priceMatch = el("priceMatchSelect").value || 'unmatched';
  const offset = (page-1)*pageSize;
  const { data, error } = await supabase.rpc("nv_match2h_details_page", {
    ...savedFilters, p_price_match: priceMatch,
    p_limit: pageSize, p_offset: offset
  });
  if (error) { console.error(error); alert("Lỗi tải details!"); return; }
  const rows = (data||[]).map((r,idx)=>({ stt: offset+idx+1, ...r }));
  renderDetails(rows);
  currentPageDetails = page;
  updatePager(totalRowsDetails, "details");
}
function renderDetails(rows) {
  const container = el("hotDetails");
  hotDetails = safeDestroy(hotDetails);
  const columns = [
    { data:"stt", title:"STT", readOnly:true, width:45 },
    { data:"manv", title:"Mã NV", readOnly:true, width:90 },
    { data:"tennv", title:"Tên NV", readOnly:true, width:140 },
    { data:"sohd_nv", title:"HĐ NV", readOnly:true, width:120 },
    { data:"created_at_a", title:"Thời điểm NV (VN)", readOnly:true, width:150, renderer:formatDateVN },
    { data:"gia_a", title:"Giá A", readOnly:true, type:"numeric", renderer:formatNumberCell },
    { data:"sohd_cs1", title:"HĐ CS1", readOnly:true, width:120 },
    { data:"created_at_b", title:"Thời điểm CS1 (VN)", readOnly:true, width:150, renderer:formatDateVN },
    { data:"gia_b", title:"Giá B", readOnly:true, type:"numeric", renderer:formatNumberCell },
    { data:"delta_phut", title:"Δ (phút)", readOnly:true, type:"numeric" },
    { data:"masp", title:"Mã SP", readOnly:true, width:110 },
    { data:"size", title:"Size", readOnly:true, width:70 },
    { data:"sl_ghep", title:"SL ghép", readOnly:true, type:"numeric" },
    { data:"gia_khac", title:"Khác giá", readOnly:true, width:85 }
  ];
  hotDetails = new Handsontable(container, {
    data: rows,
    columns, colHeaders: columns.map(c=>c.title||c.data),
    rowHeaders: true, stretchH:'all',
    height: Math.min(window.innerHeight - 280, 520),
    manualColumnResize:true, filters:true, dropdownMenu:true,
    licenseKey:'non-commercial-and-evaluation'
  });
}

// ====== UNMATCHED ======
async function refreshUnmCount() {
  const { data, error } = await supabase.rpc("nv_match2h_unmatched_count", savedFilters);
  if (error) { console.error(error); alert("Lỗi đếm unmatched!"); return; }
  totalRowsUnm = Number(data||0);
  currentPageUnm = 1;
  updatePager(totalRowsUnm, "unmatched");
}
async function loadUnmPage(page=1) {
  const offset = (page-1)*pageSize;
  const { data, error } = await supabase.rpc("nv_match2h_unmatched_page", {
    ...savedFilters, p_limit: pageSize, p_offset: offset
  });
  if (error) { console.error(error); alert("Lỗi tải unmatched!"); return; }
  const rows = (data||[]).map((r,idx)=>({ stt: offset+idx+1, ...r }));
  renderUnmatched(rows);
  currentPageUnm = page;
  updatePager(totalRowsUnm, "unmatched");
}
function renderUnmatched(rows) {
  const container = el("hotUnmatched");
  hotUnmatched = safeDestroy(hotUnmatched);
  const columns = [
    { data:"stt", title:"STT", readOnly:true, width:45 },
    { data:"manv", title:"Mã NV", readOnly:true, width:90 },
    { data:"tennv", title:"Tên NV", readOnly:true, width:140 },
    { data:"sohd_nv", title:"HĐ NV", readOnly:true, width:120 },
    { data:"created_at_a", title:"Thời điểm NV (VN)", readOnly:true, width:150, renderer:formatDateVN },
    { data:"masp", title:"Mã SP", readOnly:true, width:110 },
    { data:"size", title:"Size", readOnly:true, width:70 },
    { data:"sl_chua_ghep", title:"SL chưa ghép", readOnly:true, type:"numeric" },
    { data:"gia_a", title:"Giá A", readOnly:true, type:"numeric", renderer:formatNumberCell }
  ];
  hotUnmatched = new Handsontable(container, {
    data: rows,
    columns, colHeaders: columns.map(c=>c.title||c.data),
    rowHeaders: true, stretchH:'all',
    height: Math.min(window.innerHeight - 280, 520),
    manualColumnResize:true, filters:true, dropdownMenu:true,
    licenseKey:'non-commercial-and-evaluation'
  });
}

// ====== PAGER (dùng chung) ======
function updatePager(total, kind) {
  show(el("pager"), true);
  pageSize = Number(el("pageSize").value || 1000);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = (kind === "details") ? currentPageDetails : currentPageUnm;

  el("pageInfo").textContent = `Trang ${current}/${totalPages} (Tổng: ${total.toLocaleString('vi-VN')})`;
  el("btnPrev").disabled = current <= 1;
  el("btnNext").disabled = current >= totalPages;
}

// ====== TAB HANDLERS ======
function activateTab(name) {
  activeTab = name; // 'summary' | 'details' | 'unmatched'

  // toggle tab buttons
  ["tabSummaryBtn","tabDetailsBtn","tabUnmatchedBtn"].forEach(id => el(id).classList.remove("active"));
  if (name==="summary") el("tabSummaryBtn").classList.add("active");
  if (name==="details") el("tabDetailsBtn").classList.add("active");
  if (name==="unmatched") el("tabUnmatchedBtn").classList.add("active");

  // toggle tables
  const wraps = document.getElementsByClassName("table-wrap");
  wraps[0].style.display = (name==="summary") ? "" : "none";
  wraps[1].style.display = (name==="details") ? "" : "none";
  wraps[2].style.display = (name==="unmatched") ? "" : "none";

  // toggle subfilters & pager & KPI
  show(el("kpiRow"), name==="summary");
  show(el("subDetails"), name==="details");
  show(el("pager"), name!=="summary");

  // lazy load
  if (name==="summary") loadSummary();
  if (name==="details") { refreshDetailsCount().then(()=>loadDetailsPage(1)); }
  if (name==="unmatched") { refreshUnmCount().then(()=>loadUnmPage(1)); }
}

// ====== EXPORT (tab hiện tại) ======
function exportCurrentTab() {
  let hot = null, sheetName = "";
  if (activeTab==="summary") { hot = hotSummary; sheetName="Summary"; }
  if (activeTab==="details") { hot = hotDetails; sheetName="Details"; }
  if (activeTab==="unmatched") { hot = hotUnmatched; sheetName="Unmatched"; }
  if (!hot) return alert("Chưa có dữ liệu để xuất!");

  // Dựng table tạm từ Handsontable
  const headers = hot.getColHeader();
  const data = hot.getData();
  const table = document.createElement("table");
  const trHead = document.createElement("tr");
  headers.forEach(h => { const th=document.createElement("th"); th.innerText=h; trHead.appendChild(th); });
  table.appendChild(trHead);
  data.forEach(row => {
    const tr=document.createElement("tr");
    row.forEach(cell => { const td=document.createElement("td"); td.innerText=(cell==null?'':cell); tr.appendChild(td); });
    table.appendChild(tr);
  });
  const wb = XLSX.utils.table_to_book(table, { sheet: sheetName });
  const file = `nv_match2h_${sheetName}.xlsx`;
  XLSX.writeFile(wb, file);
}

// ====== EVENTS ======
window.addEventListener("load", () => {
  // mặc định ngày hôm nay
  const today = new Date().toISOString().slice(0,10);
  el("tuNgay").value = today;
  el("denNgay").value = today;

  el("btnView").addEventListener("click", () => {
    const f = collectFilters();
    if (!f) return;
    if (!el("chkMatch2h").checked) {
      alert("Báo cáo này thiết kế cho chế độ ghép 2 giờ. Hãy bật checkbox!");
      return;
    }
    savedFilters = f;
    activateTab("summary");
  });

  // tabs
  el("tabSummaryBtn").addEventListener("click", ()=> activateTab("summary"));
  el("tabDetailsBtn").addEventListener("click", ()=> activateTab("details"));
  el("tabUnmatchedBtn").addEventListener("click", ()=> activateTab("unmatched"));

  // subfilter ở tab details
  el("priceMatchSelect").addEventListener("change", ()=> {
    if (activeTab==="details") { refreshDetailsCount().then(()=>loadDetailsPage(1)); }
  });

  // pager
  el("pageSize").addEventListener("change", ()=>{
    if (activeTab==="details") { refreshDetailsCount().then(()=>loadDetailsPage(1)); }
    if (activeTab==="unmatched") { refreshUnmCount().then(()=>loadUnmPage(1)); }
  });
  el("btnPrev").addEventListener("click", ()=>{
    if (activeTab==="details" && currentPageDetails>1) loadDetailsPage(currentPageDetails-1);
    if (activeTab==="unmatched" && currentPageUnm>1) loadUnmPage(currentPageUnm-1);
  });
  el("btnNext").addEventListener("click", ()=>{
    const totalPagesD = Math.max(1, Math.ceil(totalRowsDetails / pageSize));
    const totalPagesU = Math.max(1, Math.ceil(totalRowsUnm / pageSize));
    if (activeTab==="details" && currentPageDetails < totalPagesD) loadDetailsPage(currentPageDetails+1);
    if (activeTab==="unmatched" && currentPageUnm < totalPagesU) loadUnmPage(currentPageUnm+1);
  });
  el("btnGo").addEventListener("click", ()=>{
    const n = Number(el("gotoPage").value);
    if (!n || n<1) return;
    if (activeTab==="details") {
      const totalPagesD = Math.max(1, Math.ceil(totalRowsDetails / pageSize));
      if (n>totalPagesD) return alert("Số trang không hợp lệ");
      loadDetailsPage(n);
    }
    if (activeTab==="unmatched") {
      const totalPagesU = Math.max(1, Math.ceil(totalRowsUnm / pageSize));
      if (n>totalPagesU) return alert("Số trang không hợp lệ");
      loadUnmPage(n);
    }
  });

  // export
  el("btnExport").addEventListener("click", exportCurrentTab);
});
