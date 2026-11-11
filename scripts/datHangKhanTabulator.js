/* Hoan Tuyet - bang Dat Hang Khan / Tabulator 6.3.1.
 * Chi quan ly giao dien; ham ghi du lieu duoc cung cap boi module datHangChuyenKhoKhan.
 */
let loader = null;
const tableStates = new Map();
const instances = new Map();
export function loadUrgentTabulator() {
  if (window.Tabulator) return Promise.resolve(true);
  if (loader) return loader;
  loader = new Promise(resolve => {
    const cssId='dhkhan-tabulator-css';
    if (!document.getElementById(cssId)) {
      const link=document.createElement('link'); link.id=cssId; link.rel='stylesheet';
      link.href='https://cdn.jsdelivr.net/npm/tabulator-tables@6.6.1/dist/css/tabulator.min.css';
      document.head.appendChild(link);
    }
    const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tabulator-tables@6.6.1/dist/js/tabulator.min.js';
    script.onload=()=>resolve(Boolean(window.Tabulator));script.onerror=()=>resolve(false);
    document.head.appendChild(script);
  });
  return loader;
}
export function destroyUrgentTables() {
  for (const [key, table] of instances) {
    try {
      tableStates.set(key, { filters:table.getHeaderFilters(),sorters:table.getSorters().map(s=>({column:s.field||s.column?.getField?.(),dir:s.dir})) });
      table.destroy();
    } catch(e) {console.warn('[DHKhan] Destroy:',e);}
  }
  instances.clear();
}
const escapeHtml=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function createUrgentTable(element,rows,section,{isAdmin,currentCoso,statusOptions,statusText,effectiveStatus,fmtTime,onStatus,onNote,onProduct,onChecked,deleteIds,moveIds}) {
  if (!window.Tabulator) return null;
  const canMove=section==='canmove';
  const inputFilter={headerFilter:'input',headerFilterPlaceholder:'Tìm...',headerFilterFunc:'like',headerFilterLiveFilterDelay:250};
  const textColumn=(title,field,width=105,extra={})=>({title,field,width,headerSort:true,...inputFilter,...extra});
  const checkboxCol=(title,type,ids)=>({title,field:`${type}_ui`,width:60,hozAlign:'center',headerSort:false,
    formatter:cell=>{ const r=cell.getRow().getData();const ch=document.createElement('input');ch.type='checkbox';
      ch.className=type==='delete'?'dhkhan-delete-check':'dhkhan-move';ch.dataset.id=r.id;ch.checked=ids.has(Number(r.id));
      ch.disabled=type==='delete'?!isAdmin:!(canMove&&effectiveStatus(r)==='moi');
      ch.addEventListener('click',e=>e.stopPropagation());
      ch.addEventListener('change',()=>onChecked(type,Number(r.id),ch.checked));return ch;
    }});
  const columns=[
    checkboxCol('Xóa','delete',deleteIds),checkboxCol('Chuyển','move',moveIds),
    textColumn('Mã sản phẩm','masp',185,{frozen:true,formatter:cell=>`<span style="color:#9b1c1c;font-weight:800;text-decoration:underline;cursor:pointer">${escapeHtml(cell.getValue())}</span>`,cellClick:(e,cell)=>onProduct(cell.getRow().getData())}),
    {title:'SL',field:'soluong',width:65,hozAlign:'center',headerFilter:'input'},
    textColumn('Size','size',74),textColumn('Hướng','huong_chuyen',85),
    textColumn('NV đặt','manv_dat',110),
    textColumn('Giờ đặt','gio_dat_hienthi',132),
    textColumn('NV thực hiện','manv_thuc_hien',122),
    textColumn('Giờ thực hiện','gio_thuc_hien_hienthi',132),
    textColumn('Giao ca bởi','giao_ca_by',110),
    textColumn('Giờ giao ca','gio_giao_ca_hienthi',130),
    textColumn('Ghi chú','ghichu_dat',190,{editor:canMove?'input':false,cellEdited:cell=>onNote(cell.getRow().getData(),String(cell.getValue()||''))}),
    {title:'Trạng thái',field:'trang_thai_hienthi',width:138,
      headerFilter:'list',headerFilterParams:{values:{'':'Tất cả','moi':'Mới','giao_ca':'Giao ca','da_chuyen':'Đã chuyển','het':'Hết','huy':'Hủy'},clearable:true},
      formatter:cell=>{const r=cell.getRow().getData();const select=document.createElement('select');select.className='dhkhan-status-select';select.dataset.id=r.id;
        select.style.cssText='width:100%;font-size:12px;';select.disabled=!canMove;
        const real=effectiveStatus(r);select.innerHTML=statusOptions(real);
        select.addEventListener('click',e=>e.stopPropagation());
        select.addEventListener('change',()=>onStatus(r,select.value,select,section));return select;
      }}
  ];
  const table=new window.Tabulator(element,{
    index:'id',data:rows,layout:'fitDataStretch',height:'min(62vh,650px)',
    columns,placeholder:'Không có dữ liệu',pagination:true,paginationSize:50,
    movableColumns:true,resizableColumns:true,
    selectableRows:true,selectableRange:true,clipboard:"copy",clipboardCopyRowRange:'active',
    rowFormatter:row=>{let st=row.getData().trang_thai_hienthi;
      let bg=st==='giao_ca'?'#fff1bf':st==='da_chuyen'?'#e8f7ec':st==='het'?'#eee':st==='huy'?'#eee7ff':'#fff';
      row.getElement().style.background=bg;
    }
  });
  instances.set(section,table);
  table.on('tableBuilt',()=>{
    const prev=tableStates.get(section);
    if(prev){(prev.filters||[]).forEach(f=>{try{table.setHeaderFilterValue(f.field,f.value)}catch(_){}});
      if(prev.sorters?.length){try{table.setSort(prev.sorters.filter(s=>s.column))}catch(_){}}}
  });
  return table;
}
export function copyUrgentVisible(section) {
  const table=instances.get(section);
  if(!table) return false;
  table.copyToClipboard('active');return true;
}
