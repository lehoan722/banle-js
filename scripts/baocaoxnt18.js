// scripts/baocaoxnt18.js
import { supabase } from "./supabaseClient.js";

let hotInstance;
let currentPage = 1;
let pageSize = 1000;
let totalRows = 0;

// ===== helpers giữ nguyên từ XNT17 (rút gọn ở đây cho ngắn) =====
function val(id){ return document.getElementById(id)?.value ?? ""; }
function bool(id){ return document.getElementById(id)?.checked ?? false; }
function getDSMasp(){
  const raw = document.getElementById("maspList")?.value || "";
  const list = raw.split(/\r?\n/).map(s => s.trim().toUpperCase()).filter(Boolean);
  const one = (document.getElementById("maspInput")?.value || "").trim().toUpperCase();
  return list.length ? list : (one ? [one] : null);
}

function buildParams(page=1){
  return {
    tu_ngay: val("tuNgay") || null,
    den_ngay: val("denNgay") || null,
    p_dsmsp: getDSMasp(),
    p_diadiem_filter: val("diadiemSelect") || null,
    p_nhomhang_filter: val("nhomhangInput") || null,
    p_chungloai_filter: val("chungloaiInput") || null,
    p_mausac_filter: val("mausacInput") || null,
    p_size_filter: val("sizeInput") || null,
    p_nhacc_filter: (bool("locNCCCheckbox") ? (val("khachhangInput").trim() || null) : null),
    p_khachhang_filter: (!bool("locNCCCheckbox") ? (val("khachhangInput").trim() || null) : null),
    p_nhanvien_filter: val("nhanvienInput") || null,
    p_tu_gia: val("tuGia") ? Number(val("tuGia")) : null,
    p_den_gia: val("denGia") ? Number(val("denGia")) : null,
    loc_duong: bool("locDuong"),
    loc_am: bool("locAm"),
    loc_het: bool("locHet"),
    loc_phatsinh_nhap: bool("locPhatSinhNhap"),   // không tác động ở 18
    loc_phatsinh_xuat: bool("locPhatSinhXuat"),   // không tác động ở 18
    p_tonghop_size: bool("tonghopSizeCheckbox"),
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize
  };
}

function buildCountParams(p){
  const { tu_ngay, den_ngay, p_dsmsp,
    p_diadiem_filter, p_nhomhang_filter, p_chungloai_filter,
    p_mausac_filter, p_size_filter, p_nhacc_filter,
    p_khachhang_filter, p_nhanvien_filter,
    p_tu_gia, p_den_gia,
    loc_duong, loc_am, loc_het,
    loc_phatsinh_nhap, loc_phatsinh_xuat,
    p_tonghop_size } = p;
  return { tu_ngay, den_ngay, p_dsmsp, p_diadiem_filter, p_nhomhang_filter, p_chungloai_filter,
    p_mausac_filter, p_size_filter, p_nhacc_filter, p_khachhang_filter, p_nhanvien_filter,
    p_tu_gia, p_den_gia, loc_duong, loc_am, loc_het, loc_phatsinh_nhap, loc_phatsinh_xuat, p_tonghop_size };
}

// ===== render table: giữ cột giống XNT17 để so sánh =====
function zeroBlankRenderer(instance, td, row, col, prop, value){
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  const v = Number(value||0);
  if (!v) { td.textContent = ""; }
  else { td.textContent = v.toLocaleString("vi-VN"); td.style.textAlign = "right"; }
}
function maspTextRenderer(instance, td, row, col, prop, value){
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  td.textContent = value ?? "";
}

function renderTable(rows){
  const container = document.getElementById("hot");
  const columns = [
    { data:'masp', title:'Mã hàng', width:120, renderer: maspTextRenderer },
    { data:'size', title:'Kích cỡ', width:60, className:'htCenter' },
    { data:'xuatban_cs1',      title:'Xuất bán CS1',       width:60, className:'htRight', renderer:zeroBlankRenderer },
    { data:'xuatchinhanh_cs2', title:'Xuất CN 2v1',        width:60, className:'htRight', renderer:zeroBlankRenderer },
    { data:'xuatban_cs2',      title:'Xuất bán CS2',       width:60, className:'htRight', renderer:zeroBlankRenderer },
    { data:'xuatchinhanh_cs1', title:'Xuất CN 1v2',        width:60, className:'htRight', renderer:zeroBlankRenderer },
    { data:'xuatban',          title:'Xuất bán (gộp)',     width:60, className:'htRight', renderer:zeroBlankRenderer },
    { data:'ton_cs1',          title:'Tồn CS1',            width:60, className:'htRight', renderer:zeroBlankRenderer },
    { data:'ton_cs2',          title:'Tồn CS2',            width:60, className:'htRight', renderer:zeroBlankRenderer },
    { data:'nhapmua',          title:'Nhập mua',           width:60, className:'htRight', renderer:zeroBlankRenderer },
    { data:'cuoiky',           title:'Cuối kỳ',            width:60, className:'htRight', renderer:zeroBlankRenderer },
    { data:'giale',            title:'Giá lẻ',             width:70, className:'htRight', renderer:zeroBlankRenderer },
  ];
  if (!hotInstance){
    hotInstance = new Handsontable(container, {
      data: rows, columns,
      rowHeaders:true, colHeaders: columns.map(c=>c.title),
      stretchH:'all', licenseKey:'non-commercial-and-evaluation',
      height: 'calc(100vh - 280px)', manualColumnResize:true, manualRowResize:true,
      contextMenu:true, columnSorting:true, renderAllRows:false, filters:true, dropdownMenu:true,
    });
  } else {
    hotInstance.updateSettings({ data: rows });
  }
}

// ===== paging & load =====
async function fetchCount(params){
  const { data, error } = await supabase.rpc("baocaoxnt18_count", buildCountParams(params));
  if (error) throw error; return data;
}
async function fetchPaged(params){
  const { data, error } = await supabase.rpc("baocaoxnt18_paged", params);
  if (error) throw error; return data||[];
}

function updatePagingBar(){
  pageSize = Number(document.getElementById("pageSize")?.value || 1000);
  const totalPages = Math.max(1, Math.ceil((totalRows||0)/pageSize));
  document.getElementById("pageInfo").textContent =
    `Trang ${currentPage}/${totalPages} (Tổng: ${totalRows.toLocaleString('vi-VN')})`;
  document.getElementById("btnPrev").disabled = currentPage<=1;
  document.getElementById("btnNext").disabled = currentPage>=totalPages;
}
window.prevPage = async function(){ if (currentPage>1){ currentPage--; await taiBaoCaoXNT18(); } };
window.nextPage = async function(){ const max = Math.max(1, Math.ceil(totalRows/pageSize)); if (currentPage<max){ currentPage++; await taiBaoCaoXNT18(); } };
window.gotoPage = async function(){
  const n = Number(document.getElementById("gotoPage").value||"1");
  const max = Math.max(1, Math.ceil(totalRows/pageSize));
  if (n>=1 && n<=max){ currentPage=n; await taiBaoCaoXNT18(); }
};

window.taiBaoCaoXNT18 = async function(){
  const loading = document.getElementById("loadingMsg");
  loading.textContent = "Đang tải dữ liệu (XNT18)...";
  try{
    pageSize = Number(document.getElementById("pageSize")?.value || 1000);
    const params = buildParams(currentPage);

    totalRows = await fetchCount(params);
    const rows = await fetchPaged(params);

    renderTable(rows);
    updatePagingBar();
    loading.textContent = "";
  } catch(err){
    console.error(err);
    loading.textContent = "Lỗi tải XNT18: " + (err?.message || err);
  }
};

// Auto set date like XNT17
function toLocalISO(d){ const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
window.addEventListener("DOMContentLoaded", ()=>{
  const now=new Date(), yesterday=new Date(); yesterday.setDate(now.getDate()-1);
  const den=document.getElementById("denNgay"); const tu=document.getElementById("tuNgay");
  if (den) den.value = toLocalISO(now);
  if (tu)  tu.value  = toLocalISO(yesterday);
  window.taiBaoCaoXNT18();
});
