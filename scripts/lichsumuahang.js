/* HOANTUYET - Lich su mua hang V3 - Tong hop size theo chung loai/nhom hang. */
(() => {
  "use strict";
  if (window.HTLichSuMuaHangV1) return;
  const PAGE_SIZE = 80;                 // So hoa don moi dot; xem them de doc toan bo lich su
  const TYPES = ["bancs1", "bancs2"]; // Khong lay hoa don dong bo bannvcs1/bannvcs2
  const state = { root: null, body: null, more: null, title: null, status: null, summary: null, groups: new Map(), productCache: new Map(),
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
      #ht-lsmh-status {padding:6px 12px;color:#475569;font-size:12px;border-bottom:1px solid #e5e7eb;}
      #ht-lsmh-summary {padding:10px 12px;line-height:1.65;font-size:14px;border-bottom:1px solid #e5e7eb;background:#fffdf7;}
      .ht-lsmh-topsize {color:#d00000;font-weight:800;}
      .ht-lsmh-group {display:inline;white-space:normal;}
      .ht-lsmh-sep {padding:0 5px;color:#7b8794;}
      .ht-lsmh-summary-label {font-weight:700;margin-right:7px;}

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
    const summary = el("div");summary.id="ht-lsmh-summary";
    summary.textContent="Gợi ý nhanh theo lịch sử mua: Đang tổng hợp...";
    const status = el("div"); status.id = "ht-lsmh-status";
    const scroll = el("div"); scroll.id = "ht-lsmh-scroll";
    const table = el("table"); table.id = "ht-lsmh-table";
    const thead = el("thead"), tr = el("tr");
    ["Mã sản phẩm", "Size", "Ngày mua"].forEach(t=>tr.appendChild(el("th",null,t)));
    thead.appendChild(tr); const tbody = el("tbody"); table.append(thead,tbody); scroll.appendChild(table);
    const foot=el("div");foot.id="ht-lsmh-foot";
    const hint=el("span",null,"Nhấn mã xanh để xem tồn kho");hint.style.fontSize="12px";
    const more=el("button",null,"Xem thêm");more.id="ht-lsmh-more";more.type="button";
    foot.append(hint,more);panel.append(head,summary,status,scroll,foot);root.appendChild(panel);document.body.appendChild(root);
    close.addEventListener("click",closePopup);
    root.addEventListener("click",e=>{if(e.target===root)closePopup();});
    more.addEventListener("click",loadMore);
    state.root=root;state.body=tbody;state.more=more;state.title=title;state.status=status;state.summary=summary;
  }
  function closePopup() {if(state.root)state.root.style.display="none";state.token++;state.busy=false;}
  function setStatus(t) {state.status.textContent=t;}
  const norm = x => String(x ?? "").trim();
  const sizeOK = x => { const z=norm(x); return z && !["0","00","-","—","NULL","NONE","FREESIZE","FREE SIZE"].includes(z.toUpperCase()); };
  function drawSummary() {
    const box=state.summary;
    if(!box)return;
    box.replaceChildren();
    box.appendChild(el("span","ht-lsmh-summary-label",state.finished?"Gợi ý nhanh theo lịch sử mua:":"Gợi ý nhanh (các hóa đơn đã tải):"));
    const groups=Array.from(state.groups.values()).sort((a,b)=>a.name.localeCompare(b.name,"vi"));
    if(!groups.length){box.appendChild(el("span",null,"Chưa có dữ liệu size theo nhóm hàng."));return;}
    groups.forEach((g,i)=>{
      if(i)box.appendChild(el("span","ht-lsmh-sep","|"));
      const wrap=el("span","ht-lsmh-group");
      wrap.appendChild(el("span",null,g.name+": "));
      const sorted=Array.from(g.sizes.values()).sort((a,b)=>b.count-a.count || b.latest.localeCompare(a.latest) || a.size.localeCompare(b.size,"vi"));
      sorted.forEach((s,j)=>{
        if(j)wrap.appendChild(document.createTextNode(", "));
        wrap.appendChild(el("span",j===0?"ht-lsmh-topsize":null,s.size));
      });
      box.appendChild(wrap);
    });
  }
  async function fetchGroupNames(sb, codes, table, codeCol, nameCol, token) {
    const result=new Map();
    for(let i=0;i<codes.length;i+=100){
      const {data,error}=await sb.from(table).select(`${codeCol},${nameCol}`).in(codeCol,codes.slice(i,i+100));
      if(error)throw error;
      if(token!==state.token)return result;
      (data||[]).forEach(d=>result.set(norm(d[codeCol]),norm(d[nameCol])));
    }
    return result;
  }
  async function addSizeData(sb, rows, token) {
    const ids=[...new Set(rows.map(d=>norm(d.masp)).filter(Boolean))];
    const missing=ids.filter(id=>!state.productCache.has(id));
    for(let i=0;i<missing.length;i+=100){
      const {data,error}=await sb.from("dmhanghoa").select("masp,nhomhang,chungloai").in("masp",missing.slice(i,i+100));
      if(error)throw error;
      if(token!==state.token)return;
      const found=new Map((data||[]).map(d=>[norm(d.masp),d]));
      missing.slice(i,i+100).forEach(id=>state.productCache.set(id,found.get(id)||null));
    }
    const products=ids.map(id=>state.productCache.get(id)).filter(Boolean);
    const chung=[...new Set(products.map(p=>norm(p.chungloai)).filter(Boolean))];
    const nhom=[...new Set(products.map(p=>norm(p.nhomhang)).filter(Boolean))];
    // Uu tien nhomhang theo yeu cau; chungloai la phuong an du phong khi chua co nhom.
    const [chungNames,nhomNames]=await Promise.all([
      chung.length?fetchGroupNames(sb,chung,"dmchungloai","machungloai","tenchungloai",token):new Map(),
      nhom.length?fetchGroupNames(sb,nhom,"dmnhomhang","manhom","tennhom",token):new Map()
    ]);
    if(token!==state.token)return;
    rows.forEach(d=>{
      if(!sizeOK(d.size)||Number(d.soluong)<=0)return;
      const p=state.productCache.get(norm(d.masp)); if(!p)return;
      const c=norm(p.chungloai),n=norm(p.nhomhang);
      const name=nhomNames.get(n)||chungNames.get(c);
      if(!name)return; // Khong doan nhom hang tu ma san pham
      const key=(nhomNames.get(n)?"N:"+n:"C:"+c);
      if(!state.groups.has(key))state.groups.set(key,{name,sizes:new Map()});
      const g=state.groups.get(key),size=norm(d.size);
      if(!g.sizes.has(size))g.sizes.set(size,{size,count:0,latest:""});
      const rec=g.sizes.get(size);
      rec.count+=Number(d.soluong);
      const day=norm(d.created_at||d.ngay);
      if(day>rec.latest)rec.latest=day;
    });
    drawSummary();
  }
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
      const validDetails=[];
      details.forEach(d=>{
        if(!d.masp||Number(d.soluong)<=0)return;
        const h=byInvoice.get(d.sohd)||{};
        const row={...d,ngay:d.ngay||h.ngay,created_at:d.created_at||h.created_at};
        renderRow(row);
        validDetails.push(row);
      });
      // Size tong hop khong anh huong danh sach lich su neu danh muc bi loi/quyen SELECT thieu.
      try {await addSizeData(sb,validDetails,token);} catch(groupErr){
        console.warn("[LSMH] Khong lay duoc nhom hang/chủng loại:",groupErr);
        if(token===state.token)state.summary.textContent="Gợi ý nhanh theo lịch sử mua: Không đọc được danh mục nhóm hàng.";
      }
      if(token!==state.token)return;
      drawSummary();
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
    state.body.replaceChildren();state.groups.clear();state.productCache.clear();
    state.summary.textContent="Gợi ý nhanh theo lịch sử mua: Đang tổng hợp...";
    state.more.style.display="";state.more.disabled=false;
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
