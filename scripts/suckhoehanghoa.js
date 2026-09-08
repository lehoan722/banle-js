import { supabase, startSessionKeeper } from './supabaseClient.js';

// Dùng đúng Supabase client chung của hệ thống Hoàn Tuyết.
window.supabase = supabase;
try { startSessionKeeper(); } catch (e) { console.warn('[SucKhoeHangHoa] session keeper:', e); }


  const $=s=>document.querySelector(s);
  const nf=new Intl.NumberFormat('vi-VN');
  const money=v=>nf.format(Math.round(Number(v||0)));
  const pct=v=>`${(Number(v||0)*100).toFixed(1)}%`;
  const num=(v,d=1)=>Number(v||0).toLocaleString('vi-VN',{maximumFractionDigits:d});
  const today=()=>new Date().toISOString().slice(0,10);
  let sb=null, hot=null, rows=[], total=0, page=1, currentMode='ALL', currentSnapshot=null, loading=false;

  const cols=[
    {data:'masp',title:'MÃ SP',width:150},
    {data:'tensp',title:'TÊN SP',width:170},
    {data:'main_group',title:'NHÓM CHÍNH',width:100},
    {data:'nhomhang',title:'NHÓM',width:75},
    {data:'nhacc',title:'NCC',width:100},
    {data:'giale',title:'GIÁ LẺ',width:90,type:'numeric',numericFormat:{pattern:'0,0'}},
    {data:'gia_von_uoc_tinh',title:'GIÁ VỐN',width:90,type:'numeric',numericFormat:{pattern:'0,0'}},
    {data:'giam_gia_pct',title:'% GIẢM',width:65},
    {data:'tuoi_ma_ngay',title:'TUỔI MÃ',width:70},
    {data:'so_ngay_khong_ban',title:'NGÀY KB',width:70},
    {data:'ban_7d',title:'B7',width:50},{data:'ban_14d',title:'B14',width:52},{data:'ban_30d',title:'B30',width:52},{data:'ban_31_60d',title:'B30 TRƯỚC',width:76},{data:'ban_90d',title:'B90',width:52},{data:'ban_365d',title:'B365',width:58},
    {data:'nhap_30d',title:'N30',width:52},{data:'nhap_90d',title:'N90',width:52},{data:'nhap_365d',title:'N365',width:58},
    {data:'ton_cs1_thuc',title:'TỒN CS1',width:70},{data:'ton_cs2_thuc',title:'TỒN CS2',width:70},{data:'ton_tong_thuc',title:'TỒN TỔNG',width:76},
    {data:'do_tin_cay_ton',title:'TIN CẬY TỒN',width:92},
    {data:'forecast_daily',title:'FORECAST/NGÀY',width:95},
    {data:'trend_30d_pct',title:'TREND %',width:72},
    {data:'sell_through_proxy_365',title:'ST 365',width:68,renderer:(i,td,r,c,p,v)=>{td.textContent=pct(v);return td}},
    {data:'days_of_stock',title:'DAYS STOCK',width:82},
    {data:'von_ton_uoc_tinh',title:'VỐN TỒN',width:105,type:'numeric',numericFormat:{pattern:'0,0'}},
    {data:'health_score',title:'ĐIỂM',width:55},
    {data:'phan_loai',title:'PHÂN LOẠI',width:105},
    {data:'action_code',title:'HÀNH ĐỘNG',width:120},
    {data:'action_reason',title:'LÝ DO',width:260}
  ];

  function ensureHot(){
    if(hot) return;
    hot=new Handsontable($('#hot'),{
      data:rows,columns:cols,colHeaders:cols.map(x=>x.title),rowHeaders:true,readOnly:true,
      height:Math.max(480,innerHeight-360),stretchH:'none',manualColumnResize:true,columnSorting:true,filters:true,dropdownMenu:true,
      licenseKey:'non-commercial-and-evaluation',
      cells:(r,c)=>{const rec=rows[r]||{};const p={}; if(rec.data_error_flag)p.className='flag-error';else if(rec.dead_flag)p.className='flag-dead';else if(rec.overstock_flag)p.className='flag-over';else if(rec.phan_loai==='MANH')p.className='flag-strong';return p;},
      afterOnCellDblClick:async(e,coords)=>{if(coords.row<0)return;const rec=rows[coords.row];if(!rec?.masp)return;try{if(window.StockQuick?.showFor)await window.StockQuick.showFor(document.body,rec.masp);else if(typeof window.stockQuickPopup==='function')await window.stockQuickPopup(rec.masp);}catch(err){console.warn(err)}}
    });
  }

  function modeParams(){
    if(['MANH','TRUNG_BINH','YEU','MOI_THEO_DOI'].includes(currentMode)) return {phan_loai:currentMode,flag:null};
    if(['DEAD','TAIL','OVERSTOCK','DATA_ERROR'].includes(currentMode)) return {phan_loai:null,flag:currentMode};
    return {phan_loai:null,flag:null};
  }

  let stockQuickLoadPromise = null;

  function ensureStockQuickLoaded(){
    if (window.StockQuick?.showFor || typeof window.stockQuickPopup === 'function') {
      return Promise.resolve(true);
    }
    if (stockQuickLoadPromise) return stockQuickLoadPromise;

    stockQuickLoadPromise = new Promise((resolve) => {
      const existed = document.querySelector('script[data-suckhoe-stockquick="1"]');
      if (existed) {
        existed.addEventListener('load', () => resolve(true), { once: true });
        existed.addEventListener('error', () => resolve(false), { once: true });
        setTimeout(() => resolve(!!(window.StockQuick?.showFor || window.stockQuickPopup)), 1200);
        return;
      }
      const sc = document.createElement('script');
      sc.src = '/scripts/stockQuickPopup.js?v=20260908b';
      sc.dataset.suckhoeStockquick = '1';
      sc.onload = () => resolve(true);
      sc.onerror = () => {
        console.warn('[SucKhoeHangHoa] Không tải được StockQuickPopup');
        stockQuickLoadPromise = null;
        resolve(false);
      };
      document.head.appendChild(sc);
    });
    return stockQuickLoadPromise;
  }

  async function loadSummary(){
    const {data,error}=await sb.rpc('rpc_suckhoe_hanghoa_summary_v1',{p_snapshot_date:currentSnapshot||null}); if(error)throw error;
    const s=data||{}; currentSnapshot=s.snapshot_date||currentSnapshot; if(currentSnapshot)$('#snapshotDate').value=currentSnapshot;
    const items=[['SKU',s.sku],['Tồn SL',s.ton_sl],['Vốn tồn',money(s.von_ton)],['Mạnh',s.manh],['Trung bình',s.trung_binh],['Yếu',s.yeu],['Dead',s.dead],['Overstock',s.overstock],['Đuôi',s.tail],['Lỗi tồn',s.data_error],['Bán 30d',s.ban_30d],['Bán 365d',s.ban_365d],['Nhập 365d',s.nhap_365d],['Vốn yếu',money(s.von_yeu)],['Vốn dead',money(s.von_dead)],['GT tồn mác',money(s.gia_tri_ton_mac)]];
    $('#summary').innerHTML=items.map(([l,v])=>`<div class="kpi"><div class="v">${v??0}</div><div class="l">${l}</div></div>`).join('');
  }

  async function loadPage(reset=false){
    if(loading)return;loading=true; $('#status').textContent='Đang tải...';
    try{
      if(reset)page=1; const size=Number($('#pageSize').value||300); const m=modeParams();
      const {data,error}=await sb.rpc('rpc_suckhoe_hanghoa_page_v1',{
        p_snapshot_date:currentSnapshot||null,p_search:$('#q').value.trim()||null,p_main_group:$('#mainGroup').value||null,p_phan_loai:m.phan_loai,p_nhacc:$('#nhacc').value.trim()||null,p_flag:m.flag,p_limit:size,p_offset:(page-1)*size
      }); if(error)throw error;
      rows=data||[]; total=Number(rows[0]?.total_rows||0); ensureHot(); hot.updateSettings({data:rows}); hot.render();
      const pages=Math.max(1,Math.ceil(total/size)); $('#pageText').textContent=`Trang ${page}/${pages} · ${nf.format(total)} mã`; $('#prev').disabled=page<=1; $('#next').disabled=page>=pages;
      $('#status').textContent=currentSnapshot?`Dữ liệu chốt đến ${currentSnapshot}`:'Chưa có snapshot. Hãy bấm Nạp lại dữ liệu.';
    }catch(e){console.error(e);$('#status').innerHTML=`<span class="warn">Lỗi: ${e.message||e}</span>`;}finally{loading=false;}
  }

  async function refresh(){
    const dt=$('#snapshotDate').value||today(); if(!confirm(`Nạp lại toàn bộ dữ liệu sức khỏe đến ngày ${dt}?`))return;
    $('#btnRefresh').disabled=true; $('#status').textContent='Đang tổng hợp dữ liệu toàn shop...';
    try{const {data,error}=await sb.rpc('refresh_suckhoe_hanghoa_v1',{p_den_ngay:dt});if(error)throw error;if(!data?.ok)throw new Error(data?.message||'Không refresh được');currentSnapshot=dt;await loadSummary();await loadPage(true);alert(`Đã nạp ${nf.format(data.rows||0)} mã.`);}catch(e){alert('Lỗi: '+(e.message||e));}finally{$('#btnRefresh').disabled=false;}
  }

  function exportSummarySheet(summary){
    const arr=Object.entries(summary||{}).map(([k,v])=>({chi_tieu:k,gia_tri:v}));return XLSX.utils.json_to_sheet(arr);
  }

  async function exportExcel(){
    if(!currentSnapshot){alert('Chưa có snapshot để xuất.');return;}
    const btn=$('#btnExport');btn.disabled=true;const old=btn.textContent;btn.textContent='Đang xuất...';
    try{
      // Dùng RPC JSON bundle để tránh giới hạn PostgREST/Supabase 1.000 rows mỗi response.
      // Mỗi lần RPC chỉ trả 1 JSON object, bên trong chứa tối đa 5.000 SKU.
      const batch=5000, all=[]; let offset=0, total=null;
      for(;;){
        $('#status').textContent=total==null
          ? `Đang lấy Excel: ${nf.format(all.length)} dòng...`
          : `Đang lấy Excel: ${nf.format(all.length)}/${nf.format(total)} dòng...`;
        const {data,error}=await sb.rpc('rpc_suckhoe_hanghoa_export_bundle_v1',{
          p_snapshot_date:currentSnapshot,p_limit:batch,p_offset:offset
        });
        if(error)throw error;
        const bundle=data||{};
        const part=Array.isArray(bundle.rows)?bundle.rows:[];
        total=Number(bundle.total_rows||0);
        all.push(...part);
        offset+=part.length;
        if(!part.length || offset>=total)break;
      }
      const {data:summary,error:se}=await sb.rpc('rpc_suckhoe_hanghoa_summary_v1',{p_snapshot_date:currentSnapshot}); if(se)throw se;
      const wb=XLSX.utils.book_new();
      const exportRows=all.map(x=>({...x,sell_through_proxy_365:Number(x.sell_through_proxy_365||0),forecast_daily:Number(x.forecast_daily||0),trend_30d_pct:Number(x.trend_30d_pct||0),days_of_stock:Number(x.days_of_stock||0)}));
      const ws=XLSX.utils.json_to_sheet(exportRows); XLSX.utils.book_append_sheet(wb,ws,'01_SKU_HEALTH');
      XLSX.utils.book_append_sheet(wb,exportSummarySheet(summary),'06_SUMMARY');
      XLSX.writeFile(wb,`SucKhoeHangHoa_${currentSnapshot}.xlsx`,{compression:true});
      $('#status').textContent=`Đã xuất ${nf.format(all.length)} mã.`;
    }catch(e){console.error(e);alert('Lỗi xuất Excel: '+(e.message||e));}finally{btn.disabled=false;btn.textContent=old;}
  }

  async function init(){
    $('#snapshotDate').value=today(); sb=supabase;
    // Chỉ nạp StockQuick sau khi Supabase global đã được tạo xong. Không chặn tải báo cáo nếu popup lỗi.
    ensureStockQuickLoaded().catch(()=>{});
    try{await loadSummary();}catch(e){console.warn(e)} await loadPage(true);
    $('#btnRefresh').onclick=refresh;$('#btnExport').onclick=exportExcel;$('#btnSearch').onclick=()=>loadPage(true);$('#pageSize').onchange=()=>loadPage(true);
    $('#q').addEventListener('keydown',e=>{if(e.key==='Enter')loadPage(true)});$('#nhacc').addEventListener('keydown',e=>{if(e.key==='Enter')loadPage(true)});
    $('#prev').onclick=()=>{if(page>1){page--;loadPage(false)}};$('#next').onclick=()=>{page++;loadPage(false)};
    $('#tabs').onclick=e=>{const b=e.target.closest('.tab');if(!b)return;document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');currentMode=b.dataset.mode;loadPage(true)};
    $('#snapshotDate').onchange=async()=>{currentSnapshot=$('#snapshotDate').value||null;await loadSummary();await loadPage(true)};
  }
  init().catch(e=>{$('#status').textContent='Lỗi khởi tạo: '+(e.message||e)});
