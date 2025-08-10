// baocaoxntmini.js (gọi RPC SQL mới)
import { supabase } from "./supabaseClient.js";

let hot;

const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));

function toUpper(v){ return (v||"").toString().trim().toUpperCase() || null; }
function num(v){ return v===""||v==null ? null : Number(v); }
function getMaspList(){
  const raw = $("#maspList")?.value || "";
  const arr = raw.split(/\r?\n/).map(s=>s.trim().toUpperCase()).filter(Boolean);
  return arr.length ? Array.from(new Set(arr)) : null;
}

function buildParams(){
  const tu_ngay = $("#tuNgay").value;
  const den_ngay = $("#denNgay").value;
  if(!tu_ngay || !den_ngay) throw new Error("Chọn đủ từ ngày/đến ngày!");

  return {
    tu_ngay, den_ngay,
    p_dsmsp: getMaspList(),
    p_diadiem: document.querySelector('#diadiem').value || 'all',
    p_nhacc_filter: toUpper($("#nhacc").value),
    p_khachhang_filter: toUpper($("#khach").value),
    p_nhanvien_filter: null, // nếu cần, thêm input riêng
    p_nhomhang_filter: toUpper($("#nhom").value),
    p_chungloai_filter: toUpper($("#chungloai").value),
    p_mausac_filter: toUpper($("#mausac").value),
    p_size_filter: toUpper($("#size").value),
    p_tu_gia: num($("#tuGia").value),
    p_den_gia: num($("#denGia").value),
    p_limit: 10000,
    p_offset: 0
  };
}

async function run(){
  $("#status").textContent = "⏳ Đang tải...";
  let params;
  try { params = buildParams(); }
  catch(e){ $("#status").textContent=""; return alert(e.message); }

  const { data, error } = await supabase.rpc("baocaoxntmini_paged", params);
  if (error){ $("#status").textContent=""; return alert("Lỗi: " + error.message); }

  const rows = (data||[]).map((r,i)=>({
    stt: i+1,
    tensp: r.tensp,
    masp: r.masp,
    size: r.size,
    ban_cs1: r.ban_cs1 || 0,
    ban_cs2: r.ban_cs2 || 0,
    ton_cs1: r.ton_cs1 || 0,
    ton_cs2: r.ton_cs2 || 0,
    cuoiky: r.cuoiky || 0,
    tongban: r.tongban || 0,
    dauky: r.dauky || 0,
    nhapmua: r.nhapmua || 0,
    giale: r.giale || 0
  }));

  // Mặc định sắp xếp: Tổng bán ↓ rồi Cuối kỳ ↓
  rows.sort((a,b)=> (b.tongban - a.tongban) || (b.cuoiky - a.cuoiky));

  renderHot(rows);
  $("#status").textContent = `Hoàn thành: ${rows.length.toLocaleString('vi-VN')} dòng.`;
}

function renderHot(rows){
  const container = $("#hot");
  if (hot){ hot.destroy(); hot=null; }

  const columns = [
    {data:'stt', title:'#', width:40, readOnly:true},
    {data:'tensp', title:'Tên hàng', readOnly:true},
    {data:'masp', title:'Mã hàng', readOnly:true},
    {data:'size', title:'Kích cỡ', width:70, readOnly:true},
    {data:'ban_cs1', title:'Bán cs1', type:'numeric', readOnly:true},
    {data:'ban_cs2', title:'Bán cs2', type:'numeric', readOnly:true},
    {data:'ton_cs1', title:'Tồn CS1', type:'numeric', readOnly:true},
    {data:'ton_cs2', title:'Tồn CS2', type:'numeric', readOnly:true},
    {data:'cuoiky', title:'Cuối kỳ', type:'numeric', readOnly:true},
    {data:'tongban', title:'Tổng bán', type:'numeric', readOnly:true},
    {data:'dauky', title:'Đầu kỳ', type:'numeric', readOnly:true},
    {data:'nhapmua', title:'Nhập mua', type:'numeric', readOnly:true},
    {data:'giale', title:'Giá lẻ', type:'numeric', readOnly:true}
  ];

  hot = new Handsontable(container, {
    data: rows,
    columns,
    colHeaders: columns.map(c=>c.title),
    rowHeaders: true,
    height: 560,
    stretchH: 'all',
    columnSorting: true,
    dropdownMenu: true,
    filters: true,
    copyPaste: { copyColumnHeaders: true },
    licenseKey: 'non-commercial-and-evaluation'
  });
}

function copyBang(){
  if (!hot) return alert("Chưa có dữ liệu!");
  const headers = hot.getColHeader();
  const data = hot.getData();
  const rows = [headers, ...data].map(r => r.map(v => (v==null?'':String(v).replace(/\t/g,' ').replace(/\r?\n/g,' '))).join('\t'));
  navigator.clipboard.writeText(rows.join('\n'))
    .then(()=> $("#status").textContent = "✅ Đã copy bảng vào clipboard.")
    .catch(()=> $("#status").textContent = "❌ Trình duyệt chặn copy.");
}

$("#btnRun") .addEventListener("click", run);
$("#btnCopy").addEventListener("click", copyBang);

// Ngày mặc định = hôm nay
(function initDates(){
  const today = new Date().toISOString().slice(0,10);
  if (!$("#tuNgay").value) $("#tuNgay").value = today;
  if (!$("#denNgay").value) $("#denNgay").value = today;
})();
