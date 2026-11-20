/* HOANTUYET - Lich su mua hang V1 - chi doc, dung chung bon trang ban. */
(() => {
  "use strict";
  if (window.HTLichSuMuaHangV1) return;
  const PAGE_SIZE = 80;                 // So hoa don moi dot; xem them de doc toan bo lich su
  const TYPES = ["bancs1", "bancs2", "bannvcs1", "bannvcs2"];
  const state = { root: null, body: null, more: null, title: null, status: null,
                  makh: "", offset: 0, finished: false, busy: false, token: 0, shown: 0 };

  const el = (tag, cls, text) => {
    const x = document.createElement(tag);
    if (cls) x.className = cls;
    if (text !== undefined) x.textContent = String(text);
    return x;
  };
  function client() {
    const s = window.supabase;
    if (!s || typeof s.from !== "function") throw new Error("Supabase chua san sang; vui long dang nhap va thu lai.");
    return s;
  }
  function customerKey() { return String(document.getElementById("makh")?.value || "").trim(); }
  function isValidCustomer() {
    const key = customerKey();
    const name = String(document.getElementById("khachhang")?.value || "").trim();
    return !!(key && name && key.toUpperCase() !== "KL" && name.toUpperCase() !== "KHACH LE" && name.toUpperCase() !== "KHÁCH LẺ");
  }
  function fmtDate(v) {
    if (!v) return "—";
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}-${m[2]}-${m[1].slice(-2)}`;
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (m) return `${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}-${m[3].slice(-2)}`;
    return s;
  }
  function installStyle() {
    if (document.getElementById("ht-lsmh-style")) return;
    const style = el("style"); style.id = "ht-lsmh-style";
    style.textContent = `
      #khachhang.ht-lsmh-name {color:#075bd9 !important;text-decoration:underline !important;
        -webkit-text-fill-color:#075bd9 !important;cursor:pointer !important;font-weight:600 !important;
        opacity:1 !important;}
      #ht-lsmh-root {position:fixed;inset:0;z-index:9000;display:none;
        background:rgba(0,0,0,.48);align-items:center;justify-content:center;padding:12px;box-sizing:border-box;}
      #ht-lsmh-root * {box-sizing:border-box;}
      #ht-lsmh-panel {width:min(740px,100%);max-height:min(85vh,850px);background:#fff;
        color:#111827;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;
        box-shadow:0 12px 35px #0004;font:15px Arial,sans-serif;}
      #ht-lsmh-head {background:#0879c9;color:#fff;padding:12px 14px;display:flex;
        justify-content:space-between;gap:12px;align-items:center;font-weight:bold;font-size:17px;}
      #ht-lsmh-close {background:#fff;color:#0065ae;border:0;border-radius:6px;padding:7px 12px;
        font-weight:bold;cursor:pointer;font-size:15px;}
      #ht-lsmh-status {padding:8px 12px;color:#475569;font-size:13px;border-bottom:1px solid #e5e7eb;}
      #ht-lsmh-scroll {overflow:auto;min-height:100px;overscroll-behavior:contain;}
      #ht-lsmh-table {width:100%;border-collapse:collapse;table-layout:fixed;}
      #ht-lsmh-table th {position:sticky;top:0;background:#edf4fc;color:#111827;text-align:left;}
      #ht-lsmh-table th,#ht-lsmh-table td {padding:10px 8px;border-bottom:1px solid #e5e7eb;
        vertical-align:middle;overflow-wrap:anywhere;}
      #ht-lsmh-table th:first-child,#ht-lsmh-table td:first-child {width:57%;}
      #ht-lsmh-table th:nth-child(2),#ht-lsmh-table td:nth-child(2){width:15%;text-align:center;}
      #ht-lsmh-table th:nth-child(3),#ht-lsmh-table td:nth-child(3){width:28%;text-align:center;}
      #ht-lsmh-table tr:nth-child(even) td {background:#fafcff;}
      .ht-lsmh-link {border:0;padding:0;background:transparent;color:#075bd9;text-decoration:underline;
        cursor:pointer;font:inherit;text-align:left;overflow-wrap:anywhere;}
      #ht-lsmh-foot {padding:9px 12px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;gap:8px;}
      #ht-lsmh-more {background:#0879c9;color:white;border:0;border-radius:6px;
        padding:9px 14px;cursor:pointer;font-size:14px;}
      #ht-lsmh-more:disabled {opacity:.45;cursor:default;}
      @media(max-width:560px) {#ht-lsmh-root {padding:5px;} #ht-lsmh-panel {max-height:82dvh;}
        #ht-lsmh-head {font-size:15px;} #ht-lsmh-table th,#ht-lsmh-table td {padding:10px 5px;font-size:14px;}}
    `;
    document.head.appendChild(style);
  }
  function ensurePopup() {
    if (state.root) return;
    installStyle();
    const root = el("div"); root.id = "ht-lsmh-root";
    const panel = el("div"); panel.id = "ht-lsmh-panel";
    const head = el("div"); head.id = "ht-lsmh-head";
    const title = el("span", null, "LỊCH SỬ MUA HÀNG");
    const close = el("button", null, "Đóng"); close.id = "ht-lsmh-close"; close.type = "button";
    head.append(title, close);
    const status = el("div"); status.id = "ht-lsmh-status";
    const scroll = el("div"); scroll.id = "ht-lsmh-scroll";
    const table = el("table"); table.id = "ht-lsmh-table";
    const thead = el("thead"), tr = el("tr");
    ["Mã sản phẩm", "Size", "Ngày mua"].forEach(t=>tr.appendChild(el("th",null,t)));
    thead.appendChild(tr); const tbody = el("tbody"); table.append(thead,tbody); scroll.appendChild(table);
    const foot=el("div");foot.id="ht-lsmh-foot";
    const hint=el("span",null,"Nhấn mã xanh để xem tồn kho");hint.style.fontSize="12px";
    const more=el("button",null,"Xem thêm");more.id="ht-lsmh-more";more.type="button";
    foot.append(hint,more);panel.append(head,status,scroll,foot);root.appendChild(panel);document.body.appendChild(root);
    close.addEventListener("click",closePopup);
    root.addEventListener("click",e=>{if(e.target===root)closePopup();});
    more.addEventListener("click",loadMore);
    state.root=root;state.body=tbody;state.more=more;state.title=title;state.status=status;
  }
  function closePopup() {if(state.root)state.root.style.display="none";state.token++;state.busy=false;}
  function setStatus(t) {state.status.textContent=t;}
  function renderRow(item) {
    const tr=el("tr"), td1=el("td"),td2=el("td",null,item.size||"—"),td3=el("td",null,fmtDate(item.ngay||item.created_at));
    const btn=el("button","ht-lsmh-link",item.masp||"—");btn.type="button";
    btn.title="Xem tồn kho mã "+item.masp;
    btn.addEventListener("click",()=>{
      if(typeof window.stockQuickPopup!=="function") {setStatus("Chức năng xem tồn kho chưa sẵn sàng.");return;}
      try {window.stockQuickPopup(item.masp);}catch(err){console.error("[LSMH] StockQuick",err);setStatus("Không mở được thông tin tồn kho.");}
    });
    td1.appendChild(btn);tr.append(td1,td2,td3);state.body.appendChild(tr);state.shown++;
  }
  async function loadMore() {
    if(state.busy||state.finished||!state.makh||state.root.style.display!=="flex")return;
    state.busy=true; state.more.disabled=true;
    const token=state.token;
    setStatus(`Đang tải lịch sử mua hàng... Đã hiển thị ${state.shown} dòng`);
    try {
      const sb=client();
      const {data:headers,error:hdErr}=await sb.from("hoadon_banle")
        .select("sohd,ngay,created_at")
        .eq("makh",state.makh)
        .in("loaihd",TYPES)
        .gt("thanhtoan",0)
        .order("created_at",{ascending:false})
        .range(state.offset,state.offset+PAGE_SIZE-1);
      if(hdErr)throw hdErr;
      if(token!==state.token)return;
      const list=(headers||[]).filter(h=>h.sohd);
      const details=[];
      for(let i=0;i<list.length;i+=40){
        const batch=list.slice(i,i+40).map(h=>h.sohd);
        const {data,error}=await sb.from("ct_hoadon_banle")
          .select("sohd,masp,size,soluong,ngay,created_at")
          .in("sohd",batch)
          .order("created_at",{ascending:false});
        if(error)throw error;
        if(token!==state.token)return;
        details.push(...(data||[]));
      }
      const byInvoice=new Map(list.map(h=>[h.sohd,h]));
      details.sort((a,b)=>{
        const ha=byInvoice.get(a.sohd),hb=byInvoice.get(b.sohd);
        return String(hb?.created_at||hb?.ngay||"").localeCompare(String(ha?.created_at||ha?.ngay||""));
      });
      state.offset+=list.length;
      if(list.length<PAGE_SIZE) state.finished=true;
      details.forEach(d=>{
        if(!d.masp||Number(d.soluong)<=0)return;
        const h=byInvoice.get(d.sohd)||{};
        renderRow({...d,ngay:d.ngay||h.ngay,created_at:d.created_at||h.created_at});
      });
      setStatus(state.shown?`Đã hiển thị ${state.shown} dòng sản phẩm đã mua${state.finished?" (đã hết lịch sử)":""}.`:
        state.finished?"Khách hàng chưa có lịch sử mua hàng hợp lệ.":"Chưa có sản phẩm trong đợt này, có thể chọn Xem thêm.");
    }catch(err){
      if(token!==state.token)return;
      console.error("[LSMH] Lỗi tải lịch sử",err);
      setStatus("Không đọc được lịch sử mua hàng. Kiểm tra quyền SELECT của hai bảng hóa đơn và kết nối mạng. Có thể bấm Xem thêm để thử lại.");
    }finally{
      if(token===state.token){state.busy=false;state.more.disabled=state.finished;state.more.style.display=state.finished?"none":"";}
    }
  }
  function openPopup() {
    if(!isValidCustomer())return;
    ensurePopup();
    state.token++;
    state.makh=customerKey();state.offset=0;state.finished=false;state.busy=false;state.shown=0;
    state.body.replaceChildren();state.more.style.display="";state.more.disabled=false;
    const name=String(document.getElementById("khachhang")?.value||"").trim();
    state.title.textContent="LỊCH SỬ MUA HÀNG – "+name;
    state.root.style.display="flex";
    setStatus("Khách hàng: "+state.makh);
    loadMore();
  }
  function mount() {
    const name=document.getElementById("khachhang");
    if(!name||name.dataset.htLsmhBound==="1")return;
    name.dataset.htLsmhBound="1";
    // Khong sua readonly, id, value, input/change va bat ky logic ban hang nao.
    name.classList.add("ht-lsmh-name");
    name.title="Nhấn vào tên khách hàng để xem lịch sử mua hàng";
    name.addEventListener("click",openPopup);
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&state.root?.style.display==="flex")closePopup();});
  }
  window.HTLichSuMuaHangV1={open:openPopup,close:closePopup};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});else mount();
})();
