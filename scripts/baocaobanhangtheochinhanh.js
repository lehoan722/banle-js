
// scripts/baocaobanhangtheochinhanh.js
import { supabase } from "./supabaseClient.js";
import * as authModule from "./authModule.js";

window.supabase = supabase;

let hotInstance = null;
let currentPage = 1;
let pageSize = 1000;
let totalRows = 0;
let currentRows = [];
let currentSummary = null;

const $ = id => document.getElementById(id);
const val = id => ($(id)?.value ?? "").trim();
const bool = id => !!$(id)?.checked;
const num = v => Number(v || 0);
const fmt = v => num(v).toLocaleString("vi-VN");

function toLocalISO(d) {
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function getDSMasp() {
  const raw = val("maspList");
  const list = raw.split(/\r?\n/).map(x => x.trim().toUpperCase()).filter(Boolean);
  if (list.length) return [...new Set(list)];
  const one = val("maspInput").toUpperCase();
  return one ? [one] : null;
}

async function kiemTraQuyenXemTrang(pathTrang) {
  const nv = await authModule.getCurrentUserInfo();
  if (!nv?.manv) {
    hienCamTruyCap("Bạn chưa đăng nhập.");
    return false;
  }
  const { data, error } = await supabase.rpc("get_pages_for_manv", { p_manv:nv.manv });
  if (error) {
    hienCamTruyCap("Lỗi kiểm tra quyền: " + error.message);
    return false;
  }
  const dsTrang = (data || []).map(r => r.path);
  if (!nv.is_admin && !dsTrang.includes(pathTrang)) {
    hienCamTruyCap(`Không có quyền truy cập trang này.<br>Mã NV: ${nv.manv} – ${nv.tennv || ""}`);
    return false;
  }
  return true;
}
window.kiemTraQuyenXemTrang = kiemTraQuyenXemTrang;

function hienCamTruyCap(msg) {
  document.body.innerHTML = `<div style="padding:24px;color:#b00020;font-size:20px;font-weight:bold">
    ⛔ Không có quyền truy cập<br><div style="font-size:16px;margin-top:8px;color:#444">${msg}</div>
  </div>`;
}

function buildParams(page=currentPage) {
  return {
    p_tu_ngay: val("tuNgay") || null,
    p_den_ngay: val("denNgay") || null,
    p_dsmsp: getDSMasp(),

    p_diadiem_filter: val("diadiemSelect") || null,
    p_nhomhang_filter: val("nhomhangInput") || null,
    p_chungloai_filter: val("chungloaiInput") || null,
    p_mausac_filter: val("mausacInput") || null,
    p_size_filter: val("sizeInput") || null,
    p_nhacc_filter: val("nhaccInput") || null,
    p_khachhang_filter: val("khachhangInput") || null,
    p_nhanvien_filter: val("nhanvienInput") || null,

    p_tu_gia: val("tuGia") ? Number(val("tuGia")) : null,
    p_den_gia: val("denGia") ? Number(val("denGia")) : null,

    p_tonghop_size: bool("tonghopSizeCheckbox"),
    p_sosanh_chinhanh: val("sosanhSelect") || null,
    p_sosanh_theo: val("sosanhTheoSelect") || "soluong",

    p_limit: pageSize,
    p_offset: (page-1)*pageSize
  };
}

function zeroRenderer(instance, td, row, col, prop, value) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  const v = num(value);
  td.textContent = v === 0 ? "" : fmt(v);
  td.style.textAlign = "right";
}

function moneyRenderer(instance, td, row, col, prop, value) {
  zeroRenderer.apply(this, arguments);
}

function textRenderer(instance, td, row, col, prop, value) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  td.textContent = value ?? "";
}

function maspRenderer(instance, td, row, col, prop, value) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  const m = String(value || "");
  td.innerHTML = m ? `<span class="masp-link" data-masp="${m}">${m}</span>` : "";
}

function allColumns() {
  return [
    {data:"masp", title:"Mã hàng", width:135, renderer:maspRenderer},
    {data:"size", title:"Size", width:58, className:"htCenter"},
    {data:"tenhang", title:"Tên hàng", width:180, renderer:textRenderer},
    {data:"nhomhang", title:"Nhóm", width:82, renderer:textRenderer},
    {data:"chungloai", title:"Chủng loại", width:95, renderer:textRenderer},
    {data:"mausac", title:"Màu", width:75, renderer:textRenderer},
    {data:"nhacc", title:"Nhà cung cấp", width:110, renderer:textRenderer},
    {data:"giale", title:"Giá lẻ", width:85, renderer:moneyRenderer},

    {data:"sl_cs1", title:"SL bán\nCS1", width:72, renderer:zeroRenderer, metric:"sl"},
    {data:"doanhthu_cs1", title:"Doanh thu\nCS1", width:110, renderer:moneyRenderer, metric:"dt"},
    {data:"giabq_cs1", title:"Giá BQ\nCS1", width:90, renderer:moneyRenderer, metric:"dt"},

    {data:"sl_cs2", title:"SL bán\nCS2", width:72, renderer:zeroRenderer, metric:"sl"},
    {data:"doanhthu_cs2", title:"Doanh thu\nCS2", width:110, renderer:moneyRenderer, metric:"dt"},
    {data:"giabq_cs2", title:"Giá BQ\nCS2", width:90, renderer:moneyRenderer, metric:"dt"},

    {data:"sl_tong", title:"Tổng\nSL bán", width:80, renderer:zeroRenderer, metric:"sl"},
    {data:"doanhthu_tong", title:"Tổng\ndoanh thu", width:120, renderer:moneyRenderer, metric:"dt"},
    {data:"giabq_tong", title:"Giá BQ\nchung", width:95, renderer:moneyRenderer, metric:"dt"}
  ];
}

function visibleColumns() {
  const mode = val("viewMode") || "both";
  const cols = allColumns();
  if (mode === "qty") return cols.filter(c => !c.metric || c.metric === "sl");
  if (mode === "money") return cols.filter(c => !c.metric || c.metric === "dt");
  return cols;
}

function renderTable(rows) {
  currentRows = rows || [];
  const columns = visibleColumns();
  const container = $("hot");

  if (!hotInstance) {
    hotInstance = new Handsontable(container, {
      data: currentRows,
      columns,
      colHeaders: columns.map(c=>c.title),
      rowHeaders: true,
      stretchH: "none",
      width: "100%",
      height: "100%",
      fixedColumnsStart: 2,
      manualColumnResize: true,
      manualRowResize: true,
      filters: true,
      dropdownMenu: true,
      columnSorting: true,
      contextMenu: true,
      renderAllRows: false,
      licenseKey: "non-commercial-and-evaluation",
      cells(row) {
        return {className: row % 2 === 0 ? "row-even" : "row-odd"};
      }
    });

    container.addEventListener("click", e => {
      const el = e.target.closest(".masp-link");
      if (!el) return;
      const masp = el.dataset.masp;
      if (!masp) return;
      if (window.stockQuickPopup) window.stockQuickPopup(masp);
    });
  } else {
    hotInstance.updateSettings({
      data: currentRows,
      columns,
      colHeaders: columns.map(c=>c.title)
    });
  }
}

function renderSummary(s) {
  currentSummary = s || {};
  $("sumSLCS1").textContent = fmt(s?.sl_cs1);
  $("sumDTCS1").textContent = fmt(s?.doanhthu_cs1);
  $("sumSLCS2").textContent = fmt(s?.sl_cs2);
  $("sumDTCS2").textContent = fmt(s?.doanhthu_cs2);
  $("sumSLTong").textContent = fmt(s?.sl_tong);
  $("sumDTTong").textContent = fmt(s?.doanhthu_tong);
}

function updatePagingBar() {
  const pages = Math.max(1, Math.ceil((totalRows || 0)/pageSize));
  $("pageInfo").textContent = `Trang ${currentPage}/${pages} (Tổng: ${fmt(totalRows)} dòng)`;
  $("btnPrev").disabled = currentPage <= 1;
  $("btnNext").disabled = currentPage >= pages;
}

let loadPromise = null;
window.taiBaoCaoBanHang = function() {
  if (loadPromise) return loadPromise;

  loadPromise = (async()=>{
    const loading = $("loadingMsg");
    try {
      if (!val("tuNgay") || !val("denNgay")) {
        alert("Vui lòng chọn Từ ngày và Đến ngày.");
        return;
      }
      if (val("tuNgay") > val("denNgay")) {
        alert("Từ ngày không được lớn hơn Đến ngày.");
        return;
      }

      pageSize = Number(val("pageSize") || 1000);
      loading.textContent = "Đang tổng hợp bán hàng...";

      let params = buildParams(currentPage);
      let {data,error} = await supabase.rpc("baocaobanhang_chinhanh_bundle_v1", params);
      if (error) throw error;

      let payload = Array.isArray(data) ? (data[0] || {}) : (data || {});
      let rows = Array.isArray(payload.rows) ? payload.rows : [];

      if (!rows.length && currentPage > 1) {
        currentPage = 1;
        params = buildParams(1);
        const r = await supabase.rpc("baocaobanhang_chinhanh_bundle_v1", params);
        if (r.error) throw r.error;
        payload = Array.isArray(r.data) ? (r.data[0] || {}) : (r.data || {});
        rows = Array.isArray(payload.rows) ? payload.rows : [];
      }

      totalRows = Number(payload.total_rows || 0);
      renderTable(rows);
      renderSummary(payload.summary || {});
      updatePagingBar();
      loading.textContent = "";
    } catch(err) {
      console.error(err);
      loading.textContent = "Lỗi tải báo cáo: " + (err?.message || err);
    }
  })();

  return loadPromise.finally(()=>{loadPromise=null;});
};

window.prevPage = async function(){
  if (currentPage > 1) {
    currentPage--;
    await window.taiBaoCaoBanHang();
  }
};
window.nextPage = async function(){
  const max = Math.max(1, Math.ceil(totalRows/pageSize));
  if (currentPage < max) {
    currentPage++;
    await window.taiBaoCaoBanHang();
  }
};

window.resetFilters = async function(){
  ["nhomhangInput","chungloaiInput","mausacInput","sizeInput","nhaccInput",
   "khachhangInput","nhanvienInput","maspInput","maspList","tuGia","denGia"].forEach(id=>{
     const el=$(id); if(el) el.value="";
   });
  $("diadiemSelect").value="";
  $("sosanhSelect").value="";
  $("sosanhTheoSelect").value="soluong";
  $("tonghopSizeCheckbox").checked=false;
  currentPage=1;
  await window.taiBaoCaoBanHang();
};

window.changeViewMode = function(){
  renderTable(currentRows);
};

window.xuatExcelToanBoBanHang = async function(){
  if (typeof XLSX === "undefined") {
    alert("Thiếu thư viện XLSX.");
    return;
  }

  const loading = $("loadingMsg");
  try {
    loading.textContent = "Đang tải toàn bộ dữ liệu để xuất Excel...";
    const base = buildParams(1);
    const batchSize = 5000;
    const first = await supabase.rpc("baocaobanhang_chinhanh_bundle_v1", {
      ...base, p_limit:batchSize, p_offset:0
    });
    if (first.error) throw first.error;

    const payload = Array.isArray(first.data) ? (first.data[0]||{}) : (first.data||{});
    const total = Number(payload.total_rows || 0);
    const batches = Math.max(1, Math.ceil(total/batchSize));
    const all = [];
    all.push(...(payload.rows || []));

    for (let b=1;b<batches;b++) {
      loading.textContent = `Đang tải Excel ${b+1}/${batches}...`;
      const r = await supabase.rpc("baocaobanhang_chinhanh_bundle_v1", {
        ...base, p_limit:batchSize, p_offset:b*batchSize
      });
      if (r.error) throw r.error;
      const p = Array.isArray(r.data) ? (r.data[0]||{}) : (r.data||{});
      all.push(...(p.rows || []));
    }

    if (!all.length) {
      alert("Không có dữ liệu để xuất.");
      return;
    }

    const rows = all.map((r,i)=>({
      STT:i+1,
      "Mã hàng":r.masp,
      "Size":r.size,
      "Tên hàng":r.tenhang,
      "Nhóm hàng":r.nhomhang,
      "Chủng loại":r.chungloai,
      "Màu sắc":r.mausac,
      "Nhà cung cấp":r.nhacc,
      "Giá lẻ":num(r.giale),
      "SL bán CS1":num(r.sl_cs1),
      "Doanh thu CS1":num(r.doanhthu_cs1),
      "Giá BQ CS1":num(r.giabq_cs1),
      "SL bán CS2":num(r.sl_cs2),
      "Doanh thu CS2":num(r.doanhthu_cs2),
      "Giá BQ CS2":num(r.giabq_cs2),
      "Tổng SL bán":num(r.sl_tong),
      "Tổng doanh thu":num(r.doanhthu_tong),
      "Giá BQ chung":num(r.giabq_tong)
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"BanHangTheoChiNhanh");
    XLSX.writeFile(
      wb,
      `baocaobanhangtheochinhanh_${val("tuNgay")}_${val("denNgay")}.xlsx`,
      {compression:true}
    );
    loading.textContent="";
  } catch(err) {
    console.error(err);
    loading.textContent="Lỗi xuất Excel: " + (err?.message || err);
  }
};


// ============================================================
// POPUP TIM KIEM DANH MUC
// ============================================================
let popupType = null;

window.openPopupSearch = function(type){
  popupType = type;
  $("popupSearch").classList.add("show");
  $("popupSearchInput").value="";
  $("popupSearchInput").focus();
  searchPopup("");
};

window.closePopupSearch = function(){
  $("popupSearch").classList.remove("show");
};

async function searchPopup(keyword){
  const list=$("popupSearchList");
  const k=String(keyword||"").trim();

  const cfg = {
    khachhang:{table:"dmkhachhang", field:"makh", name:"tenkh"},
    nhanvien:{table:"dmnhanvien", field:"manv", name:"tennv"},
    nhomhang:{table:"dmnhomhang", field:"manhom", name:"tennhom"},
    chungloai:{table:"dmchungloai", field:"machungloai", name:"tenchungloai"},
    mausac:{table:"dmmausac", field:"mamau", name:"tenmau"},
    size:{table:"dm_size", field:"size", name:"mota"},
    mahang:{table:"dmhanghoa", field:"masp", name:"tensp"}
  };

  if (popupType === "nhacc") {
    let q = supabase.from("dmhanghoa").select("nhacc").not("nhacc","is",null).limit(1000);
    if (k) q=q.ilike("nhacc",`%${k}%`);
    const {data,error}=await q;
    if(error){list.textContent=error.message;return;}
    const vals=[...new Set((data||[]).map(r=>String(r.nhacc||"").trim()).filter(Boolean))].sort();
    renderPopup(vals.map(v=>({value:v,label:v})));
    return;
  }

  const c=cfg[popupType];
  if(!c){list.textContent="Loại tìm kiếm chưa hỗ trợ";return;}

  let q=supabase.from(c.table).select(`${c.field},${c.name}`).limit(500);
  if(k) q=q.or(`${c.field}.ilike.%${k}%,${c.name}.ilike.%${k}%`);
  const {data,error}=await q;
  if(error){list.textContent=error.message;return;}

  renderPopup((data||[]).map(r=>({
    value:r[c.field] ?? "",
    label:`${r[c.field] ?? ""}${r[c.name] ? " - "+r[c.name] : ""}`
  })));
}

function renderPopup(rows){
  const list=$("popupSearchList");
  list.innerHTML=(rows||[]).map(r=>`
    <button class="popup-row" data-value="${escapeHtml(r.value)}">
      ${escapeHtml(r.label)}
    </button>
  `).join("") || "<i>Không có dữ liệu</i>";
}

function escapeHtml(s){
  return String(s??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

$("popupSearchInput")?.addEventListener("input",e=>searchPopup(e.target.value));
$("popupSearchList")?.addEventListener("click",e=>{
  const row=e.target.closest(".popup-row");
  if(!row)return;
  const map={
    khachhang:"khachhangInput",
    nhanvien:"nhanvienInput",
    nhomhang:"nhomhangInput",
    chungloai:"chungloaiInput",
    mausac:"mausacInput",
    size:"sizeInput",
    mahang:"maspInput",
    nhacc:"nhaccInput"
  };
  const id=map[popupType];
  if(id && $(id)) $(id).value=row.dataset.value||"";
  window.closePopupSearch();
});

document.addEventListener("keydown",e=>{
  if(e.key==="Escape") window.closePopupSearch();
});


// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded",()=>{
  const now=new Date();
  const from=new Date(now);
  from.setDate(now.getDate()-30);

  $("tuNgay").value=toLocalISO(from);
  $("denNgay").value=toLocalISO(now);

  $("pageSize").addEventListener("change",async()=>{
    currentPage=1;
    await window.taiBaoCaoBanHang();
  });

  $("viewMode").addEventListener("change",window.changeViewMode);

  $("sosanhSelect").addEventListener("change",()=>{
    const need = ["cs1_lon_hon","cs2_lon_hon"].includes(val("sosanhSelect"));
    $("sosanhTheoWrap").style.display = need ? "flex" : "none";
  });
});
