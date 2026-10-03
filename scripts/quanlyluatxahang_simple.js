
// scripts/quanlyluatxahang_simple.js - V2.1
// Cho phep NHAP TRUC TIEP + datalist goi y cho:
//   NHOM HANG, DK SIZE, % XA.
// Khong ep nguoi dung phai chon dropdown.

const $=s=>document.querySelector(s);
let sb=null;
let state={groups:[],rules:[],sizes:{}};
let selectedIndex=-1;
let lastCheckItems=[];

const DISCOUNTS=[10,20,30,40,50,60,70];
const SIZE_MODE_LABELS={
  KHONG_CHON:'KHÔNG CHỌN',
  CO_SIZE_KHO:'CÓ SIZE KHÓ',
  TAT_CA_KHO:'TẤT CẢ KHÓ'
};

const norm=v=>String(v??'').trim().toUpperCase();
const num=v=>v===''||v==null?null:Number(v);
const todayISO=()=>new Date().toISOString().slice(0,10);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function parseSizeList(v){
  return [...new Set(String(v||'').split(',').map(norm).filter(Boolean))];
}
function setStatus(t){ $('#status').textContent=t; }

function stripVietnamese(v){
  return String(v??'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/Đ/g,'D').replace(/đ/g,'d');
}

function normalizeSizeMode(v){
  const x=stripVietnamese(v).trim().toUpperCase().replace(/\s+/g,'_');
  if(['KHONG_CHON','KHONG','NONE'].includes(x)) return 'KHONG_CHON';
  if(['CO_SIZE_KHO','COSIZEKHO','CO_KHO'].includes(x)) return 'CO_SIZE_KHO';
  if(['TAT_CA_KHO','TATCAKHO','ALL_KHO'].includes(x)) return 'TAT_CA_KHO';
  if(['KHÔNG_CHỌN','CÓ_SIZE_KHÓ','TẤT_CẢ_KHÓ'].includes(String(v??'').trim().toUpperCase())) {
    return normalizeSizeMode(stripVietnamese(v));
  }
  return null;
}

function sizeModeLabel(code){
  return SIZE_MODE_LABELS[code] || 'KHÔNG CHỌN';
}

function buildSuggestionLists(){
  const dl=$('#nhomhangSuggestions');
  if(dl){
    dl.innerHTML='';
    state.groups.forEach(g=>{
      const op=document.createElement('option');
      op.value=String(g.manhom||'').trim();
      op.label=g.tennhom ? `${g.manhom} - ${g.tennhom}` : String(g.manhom||'');
      dl.appendChild(op);
    });
  }
}

async function load(){
  const {data,error}=await sb.rpc('rpc_xa_simple_get_v2');
  if(error) throw error;

  state.groups=data?.nhomhang||[];
  state.rules=(data?.rules||[]).map(x=>({...x}));
  state.sizes={};

  (data?.sizes||[]).forEach(s=>{
    state.sizes[norm(s.nhomhang)]={
      nhomhang:norm(s.nhomhang),
      size_kho_ds:Array.isArray(s.size_kho_ds)?s.size_kho_ds:[],
      size_kho_tu:s.size_kho_tu,
      size_kho_den:s.size_kho_den
    };
  });

  buildSuggestionLists();
  selectedIndex=state.rules.length?0:-1;
  render();
  setStatus(`Đã tải ${state.rules.length} luật.`);
}

function firstByGroup(){
  const m=new Map();
  state.rules.forEach((r,i)=>{
    const g=norm(r.nhomhang);
    if(g&&!m.has(g)) m.set(g,i);
  });
  return m;
}

function render(){
  const tb=$('#ruleBody');
  tb.innerHTML='';
  const first=firstByGroup();

  state.rules.forEach((r,i)=>{
    const g=norm(r.nhomhang);
    const isFirst=first.get(g)===i;
    const cfg=state.sizes[g]||{
      nhomhang:g,size_kho_ds:[],size_kho_tu:null,size_kho_den:null
    };

    const tr=document.createElement('tr');
    if(i===selectedIndex) tr.classList.add('selected');

    tr.innerHTML=`
      <td>
        <input data-k="nhomhang"
               list="nhomhangSuggestions"
               value="${esc(r.nhomhang||'')}"
               placeholder="Nhập mã nhóm...">
      </td>
      <td><input data-k="hieu_luc_tu" type="date" value="${esc(r.hieu_luc_tu||todayISO())}"></td>
      <td><input data-k="hieu_luc_den" type="date" value="${esc(r.hieu_luc_den||'')}"></td>
      <td><input data-k="tuoi_hang_thang" type="number" min="0" value="${r.tuoi_hang_thang??''}"></td>
      <td><input data-k="khong_nhap_thang" type="number" min="0" value="${r.khong_nhap_thang??''}"></td>
      <td><input data-k="khong_ban_ngay" type="number" min="0" value="${r.khong_ban_ngay??''}"></td>
      <td><input data-k="ton_toi_da" type="number" min="0" value="${r.ton_toi_da??''}"></td>
      <td><input data-k="tyle_ton_pct" type="number" min="0" max="100" step="0.1" value="${r.tyle_ton_toi_da==null?'':Number(r.tyle_ton_toi_da)*100}"></td>

      <td>
        ${isFirst
          ? `<input data-size="list" value="${esc((cfg.size_kho_ds||[]).join(','))}" placeholder="38,42,43">`
          : '<div class="shared">Dùng chung ↑</div>'}
      </td>
      <td>
        ${isFirst
          ? `<input data-size="tu" type="number" step="0.1" value="${cfg.size_kho_tu??''}">`
          : '<div class="shared">Dùng chung ↑</div>'}
      </td>
      <td>
        ${isFirst
          ? `<input data-size="den" type="number" step="0.1" value="${cfg.size_kho_den??''}">`
          : '<div class="shared">Dùng chung ↑</div>'}
      </td>

      <td>
        <input data-k="dieu_kien_size"
               list="sizeConditionSuggestions"
               value="${esc(sizeModeLabel(r.dieu_kien_size||'KHONG_CHON'))}"
               placeholder="Nhập / chọn gợi ý">
      </td>

      <td>
        <input data-k="muc_giam_pct"
               type="number"
               min="1" max="100"
               list="discountSuggestions"
               value="${r.muc_giam_pct??20}"
               placeholder="%">
      </td>

      <td style="text-align:center">
        <input data-k="dang_ap_dung" type="checkbox" ${r.dang_ap_dung!==false?'checked':''}>
      </td>
      <td style="text-align:center">
        <button class="btn secondary" data-del="1">×</button>
      </td>
    `;

    tr.onclick=e=>{
      if(e.target.closest('[data-del]')) return;
      selectedIndex=i;
      [...tb.querySelectorAll('tr')].forEach(x=>x.classList.remove('selected'));
      tr.classList.add('selected');
    };

    tr.querySelectorAll('[data-k]').forEach(el=>{
      const saveValue=()=>{
        const k=el.dataset.k;

        if(k==='dang_ap_dung'){
          r[k]=el.checked;
          return;
        }

        if(k==='tyle_ton_pct'){
          r.tyle_ton_toi_da=el.value===''?null:Number(el.value)/100;
          return;
        }

        if(['tuoi_hang_thang','khong_nhap_thang','khong_ban_ngay','ton_toi_da','muc_giam_pct'].includes(k)){
          r[k]=num(el.value);
          return;
        }

        if(k==='nhomhang'){
          const oldG=norm(r.nhomhang);
          r[k]=norm(el.value);
          el.value=r[k];

          const ng=norm(r[k]);
          if(ng&&!state.sizes[ng]){
            state.sizes[ng]={nhomhang:ng,size_kho_ds:[],size_kho_tu:null,size_kho_den:null};
          }

          // Neu doi nhom thi can render lai de xac dinh dong nao la dong dau nhom.
          if(oldG!==ng) render();
          return;
        }

        if(k==='dieu_kien_size'){
          const code=normalizeSizeMode(el.value);
          if(code){
            r[k]=code;
            el.value=sizeModeLabel(code);
          }else{
            r[k]=null;
          }
          return;
        }

        r[k]=el.value||null;
      };

      el.addEventListener('change',saveValue);
      el.addEventListener('blur',saveValue);
    });

    if(isFirst){
      tr.querySelector('[data-size="list"]')?.addEventListener('change',e=>{
        cfg.size_kho_ds=parseSizeList(e.target.value);
        e.target.value=(cfg.size_kho_ds||[]).join(',');
        state.sizes[g]=cfg;
      });

      tr.querySelector('[data-size="tu"]')?.addEventListener('change',e=>{
        cfg.size_kho_tu=num(e.target.value);
        state.sizes[g]=cfg;
      });

      tr.querySelector('[data-size="den"]')?.addEventListener('change',e=>{
        cfg.size_kho_den=num(e.target.value);
        state.sizes[g]=cfg;
      });
    }

    tr.querySelector('[data-del]')?.addEventListener('click',()=>{
      state.rules.splice(i,1);
      if(selectedIndex>=state.rules.length) selectedIndex=state.rules.length-1;
      render();
    });

    tb.appendChild(tr);
  });
}

function addRule(){
  state.rules.push({
    id:null,
    nhomhang:'',
    hieu_luc_tu:todayISO(),
    hieu_luc_den:null,
    tuoi_hang_thang:null,
    khong_nhap_thang:null,
    khong_ban_ngay:null,
    ton_toi_da:null,
    tyle_ton_toi_da:null,
    dieu_kien_size:'KHONG_CHON',
    muc_giam_pct:20,
    dang_ap_dung:true
  });

  selectedIndex=state.rules.length-1;
  render();

  requestAnimationFrame(()=>{
    const rows=$('#ruleBody').querySelectorAll('tr');
    rows[selectedIndex]?.querySelector('[data-k="nhomhang"]')?.focus();
  });
}

function validate(){
  const knownGroups=new Set(state.groups.map(g=>norm(g.manhom)));

  state.rules.forEach((r,i)=>{
    r.nhomhang=norm(r.nhomhang);

    if(!r.nhomhang) throw new Error(`Dòng ${i+1}: chưa nhập nhóm hàng.`);
    if(!knownGroups.has(r.nhomhang)) {
      throw new Error(`Dòng ${i+1}: nhóm "${r.nhomhang}" không có trong danh mục nhóm hàng.`);
    }

    if(!r.hieu_luc_tu) throw new Error(`Dòng ${i+1}: thiếu TỪ NGÀY.`);
    if(r.hieu_luc_den&&r.hieu_luc_den<r.hieu_luc_tu) {
      throw new Error(`Dòng ${i+1}: ĐẾN NGÀY nhỏ hơn TỪ NGÀY.`);
    }

    if(r.tyle_ton_toi_da!=null && (Number(r.tyle_ton_toi_da)<0 || Number(r.tyle_ton_toi_da)>1)) {
      throw new Error(`Dòng ${i+1}: Tồn/Nhập phải nằm trong 0–100%.`);
    }

    if(r.muc_giam_pct==null || Number(r.muc_giam_pct)<1 || Number(r.muc_giam_pct)>100) {
      throw new Error(`Dòng ${i+1}: % xả phải từ 1 đến 100.`);
    }

    const mode=normalizeSizeMode(r.dieu_kien_size||'KHONG_CHON');
    if(!mode) throw new Error(`Dòng ${i+1}: ĐK SIZE không hợp lệ.`);
    r.dieu_kien_size=mode;

    if(mode!=='KHONG_CHON'){
      const c=state.sizes[r.nhomhang]||{};
      if(!((c.size_kho_ds||[]).length||c.size_kho_tu!=null||c.size_kho_den!=null)) {
        throw new Error(`Dòng ${i+1}: nhóm ${r.nhomhang} chưa khai báo size khó.`);
      }
    }
  });

  Object.entries(state.sizes).forEach(([g,c])=>{
    if(c.size_kho_tu!=null&&c.size_kho_den!=null&&Number(c.size_kho_tu)>Number(c.size_kho_den)) {
      throw new Error(`Nhóm ${g}: Size TỪ lớn hơn ĐẾN.`);
    }
  });
}

function payload(){
  const used=new Set(state.rules.map(r=>norm(r.nhomhang)).filter(Boolean));

  return{
    rules:state.rules.map(r=>({
      ...r,
      nhomhang:norm(r.nhomhang),
      dieu_kien_size:normalizeSizeMode(r.dieu_kien_size)||'KHONG_CHON',
      hieu_luc_den:r.hieu_luc_den||null
    })),

    sizes:[...used].map(g=>{
      const x=state.sizes[g]||{
        nhomhang:g,size_kho_ds:[],size_kho_tu:null,size_kho_den:null
      };
      return{
        nhomhang:g,
        size_kho_ds:x.size_kho_ds||[],
        size_kho_tu:x.size_kho_tu??null,
        size_kho_den:x.size_kho_den??null
      };
    })
  };
}

async function save(){
  try{
    validate();
    if(!confirm(`Lưu ${state.rules.length} dòng luật?`)) return;

    setStatus('Đang lưu...');
    const {data,error}=await sb.rpc('rpc_xa_simple_save_v2',{p_payload:payload()});
    if(error) throw error;

    setStatus(`Đã lưu ${data?.rule_count??state.rules.length} luật.`);
    await load();
  }catch(e){
    console.error(e);
    alert('Không lưu được: '+(e.message||e));
    setStatus('Lỗi lưu.');
  }
}

async function checkSelected(){
  try{
    if(selectedIndex<0 || !state.rules[selectedIndex]){
      alert('Hãy chọn một dòng luật.');
      return;
    }

    validate();

    const r=state.rules[selectedIndex];
    const g=norm(r.nhomhang);
    const cfg=state.sizes[g]||{
      nhomhang:g,size_kho_ds:[],size_kho_tu:null,size_kho_den:null
    };

    setStatus('Đang kiểm tra...');

    const {data,error}=await sb.rpc('rpc_xa_rule_check_v2',{
      p_rule:{
        ...r,
        nhomhang:g,
        dieu_kien_size:normalizeSizeMode(r.dieu_kien_size)||'KHONG_CHON'
      },
      p_size_cfg:cfg,
      p_den_ngay:todayISO()
    });

    if(error) throw error;

    lastCheckItems=data?.items||[];
    $('#totalCount').textContent=Number(data?.total_products||0).toLocaleString('vi-VN');
    $('#matchCount').textContent=Number(data?.matched_count||0).toLocaleString('vi-VN');
    $('#checkSubtitle').textContent=`Nhóm ${g} · ${data?.ngay_kiem_tra||todayISO()} · dòng ${selectedIndex+1}`;

    const tb=$('#productBody');
    tb.innerHTML='';

    lastCheckItems.forEach(x=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td><button class="maspLink">${esc(x.masp)}</button></td>
        <td>${esc(x.tensp||'')}</td>
        <td>${Number(x.ton_hientai||0)}</td>
        <td>${x.tyle_ton==null?'':(Number(x.tyle_ton)*100).toFixed(1)+'%'}</td>
        <td>${esc(x.ngay_nhap_cuoi||'')}</td>
        <td>${esc(x.ngay_ban_cuoi||'')}</td>
        <td>${esc(x.sizes_con_lai||'')}</td>
      `;
      tr.querySelector('.maspLink').onclick=()=>openStock(x.masp);
      tb.appendChild(tr);
    });

    $('#checkOverlay').classList.add('show');
    setStatus(`Kiểm tra xong: ${data?.matched_count||0}/${data?.total_products||0} SP thỏa.`);
  }catch(e){
    console.error(e);
    alert('Không kiểm tra được: '+(e.message||e));
    setStatus('Lỗi kiểm tra.');
  }
}

async function openStock(masp){
  if(window.StockQuick?.showFor) await window.StockQuick.showFor(document.body,masp);
  else if(typeof window.stockQuickPopup==='function') await window.stockQuickPopup(masp);
  else alert('StockQuickPopup chưa sẵn sàng.');
}

async function copyMasps(){
  const text=lastCheckItems.map(x=>x.masp).filter(Boolean).join('\n');
  if(!text){ alert('Danh sách trống.'); return; }

  try{
    await navigator.clipboard.writeText(text);
    alert(`Đã copy ${lastCheckItems.length} mã.`);
  }catch{
    prompt('Copy danh sách mã:',text);
  }
}

function modal(id,show){ $(id).classList.toggle('show',show); }

export async function initQuanLyLuatXaSimple(){
  sb=window.supabase;
  if(!sb){ alert('Supabase chưa sẵn sàng.'); return; }

  $('#btnAdd').onclick=addRule;
  $('#btnSave').onclick=save;
  $('#btnCheck').onclick=checkSelected;
  $('#btnHelp').onclick=()=>modal('#helpOverlay',true);
  $('#btnCloseHelp').onclick=()=>modal('#helpOverlay',false);
  $('#btnCloseCheck').onclick=()=>modal('#checkOverlay',false);
  $('#btnCopyMasps').onclick=copyMasps;

  ['#helpOverlay','#checkOverlay'].forEach(id=>{
    $(id).addEventListener('click',e=>{
      if(e.target===$(id)) modal(id,false);
    });
  });

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      modal('#helpOverlay',false);
      modal('#checkOverlay',false);
    }
  });

  try{
    await load();
  }catch(e){
    console.error(e);
    alert('Không tải được dữ liệu: '+(e.message||e));
    setStatus('Lỗi tải.');
  }
}
