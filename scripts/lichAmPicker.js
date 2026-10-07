// scripts/lichAmPicker.js
// Dung o bat ky trang nao:
// import { moLichAmPicker } from './scripts/lichAmPicker.js'; 
// const kq = await moLichAmPicker({ ngayMacDinh:'2026-10-07', maDiaDiem:'THAI_NGUYEN' });
// if (kq) { input.value = kq.ngay_duong; }

import { getSupabaseClient } from "./authModule.js";
const sb=getSupabaseClient();

function localISO(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}

export function moLichAmPicker({ngayMacDinh=null,maDiaDiem="THAI_NGUYEN",tieuDe="Chọn ngày"}={}) {
  return new Promise(async resolve=>{
    let cur=ngayMacDinh?new Date(ngayMacDinh+"T12:00:00"):new Date();
    cur=new Date(cur.getFullYear(),cur.getMonth(),1);
    const wrap=document.createElement("div");
    wrap.innerHTML=`
    <div class="lap-backdrop">
      <div class="lap-modal">
        <div class="lap-head">
          <b>${tieuDe}</b><span class="lap-spacer"></span><button data-x>✕</button>
        </div>
        <div class="lap-nav"><button data-prev>◀</button><b data-title></b><button data-next>▶</button><button data-today>Hôm nay</button></div>
        <div class="lap-week"><span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span></div>
        <div class="lap-grid"></div>
      </div>
    </div>`;
    if(!document.getElementById("lap-style")){
      const st=document.createElement("style");st.id="lap-style";st.textContent=`
      .lap-backdrop{position:fixed;inset:0;background:#0008;z-index:99999;display:grid;place-items:center;padding:10px}
      .lap-modal{width:min(680px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:14px;padding:10px;font-family:system-ui}
      .lap-head,.lap-nav{display:flex;align-items:center;gap:7px;padding:5px}.lap-spacer{flex:1}
      .lap-modal button{border:1px solid #ddd;background:#fff;border-radius:8px;padding:7px 9px}
      .lap-week,.lap-grid{display:grid;grid-template-columns:repeat(7,1fr)}.lap-week span{text-align:center;font-weight:700;font-size:12px;padding:6px}
      .lap-day{min-height:72px;border:1px solid #eee;padding:5px;cursor:pointer}.lap-day:hover{background:#eff6ff}.lap-out{opacity:.35}
      .lap-solar{font-size:18px;font-weight:800}.lap-lunar{font-size:11px;color:#dc2626}.lap-temp{font-size:10px;color:#475569;margin-top:4px}`;
      document.head.appendChild(st);
    }
    document.body.appendChild(wrap);
    const q=s=>wrap.querySelector(s), grid=q(".lap-grid");
    function close(v){wrap.remove();resolve(v)}
    q("[data-x]").onclick=()=>close(null);
    wrap.querySelector(".lap-backdrop").onclick=e=>{if(e.target.classList.contains("lap-backdrop"))close(null)}

    async function render(){
      q("[data-title]").textContent=`Tháng ${cur.getMonth()+1}/${cur.getFullYear()}`;
      const first=new Date(cur.getFullYear(),cur.getMonth(),1);
      const start=addDays(first,-((first.getDay()+6)%7));
      const last=new Date(cur.getFullYear(),cur.getMonth()+1,0);
      const end=addDays(last,6-((last.getDay()+6)%7));
      const {data,error}=await sb.rpc("rpc_lich_thoitiet_khoang_v1",{p_tu:localISO(start),p_den:localISO(end),p_dia_diem:maDiaDiem});
      if(error){alert(error.message);return}
      const mp=new Map((data||[]).map(r=>[r.ngay_duong,r]));
      grid.innerHTML="";
      for(let d=new Date(start);d<=end;d=addDays(d,1)){
        const k=localISO(d),r=mp.get(k),el=document.createElement("div");
        el.className="lap-day"+(d.getMonth()!=cur.getMonth()?" lap-out":"");
        el.innerHTML=`<div class="lap-solar">${d.getDate()}</div><div class="lap-lunar">${r?`${r.ngay_am}/${r.thang_am}${r.thang_am_nhuan?" N":""}`:""}</div><div class="lap-temp">${r?.nhiet_do_min!=null?`${r.nhiet_do_min}–${r.nhiet_do_max}°`:""}</div>`;
        el.onclick=()=>close(r||{ngay_duong:k});
        grid.appendChild(el);
      }
    }
    q("[data-prev]").onclick=()=>{cur.setMonth(cur.getMonth()-1);render()}
    q("[data-next]").onclick=()=>{cur.setMonth(cur.getMonth()+1);render()}
    q("[data-today]").onclick=()=>{const d=new Date();cur=new Date(d.getFullYear(),d.getMonth(),1);render()}
    await render();
  });
}
