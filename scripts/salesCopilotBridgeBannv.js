// scripts/salesCopilotBridgeBannv.js
// V5 ISOLATED-TAB: mỗi lần Sang bán gắn copilot_tx riêng vào tab mới.
// Chỉ tab có đúng copilot_tx mới được đọc payload tương ứng. Tab bán cũ hoàn toàn không tranh nhận dữ liệu.

(function(){
  "use strict";

  const PAGE_BRANCH = location.pathname.toLowerCase().includes("bannvcs2") ? "cs2" : "cs1";
  const tx = (()=>{
    try{return String(new URLSearchParams(location.search).get("copilot_tx")||"").trim()}catch{return ""}
  })();

  // Trang bán mở bình thường (không đi từ nút Sang bán) thì bridge đứng yên.
  if(!tx){
    window.SalesCopilotBridge={consume:async()=>false,version:"5.0-isolated-tab-idle"};
    return;
  }

  const safeTx = tx.replace(/[^A-Za-z0-9_-]/g,"_");
  const KEY = `sales_copilot_pending_v2_${safeTx}`;
  const ACK_KEY = `sales_copilot_ack_v2_${safeTx}`;

  let running=false;
  let finished=false;

  function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
  function text(v){return String(v==null?"":v).trim()}
  function normMasp(v){return text(v).toUpperCase()}
  function normSize(v){return text(v).toUpperCase()}

  async function waitUntil(check,timeout=12000,interval=60){
    const started=Date.now();
    while(Date.now()-started<timeout){
      try{const value=check();if(value)return value}catch(_){}
      await sleep(interval);
    }
    return null;
  }

  function getPayload(){
    try{
      const raw=localStorage.getItem(KEY);
      if(!raw)return null;
      const p=JSON.parse(raw);
      if(!p||p.id!==tx||!Array.isArray(p.items)||!p.items.length)return null;
      return p;
    }catch(e){
      console.warn("[COPILOT BRIDGE V5] payload lỗi",e);
      return null;
    }
  }

  function pageBasicReady(){
    return !!(document.getElementById("masp")&&document.getElementById("soluong")&&document.getElementById("size"));
  }

  function findSaleRow(maspRaw,sizeRaw){
    const masp=normMasp(maspRaw),size=normSize(sizeRaw);
    const tbody=document.querySelector("#bangketqua tbody");
    if(!tbody||!masp)return null;
    return Array.from(tbody.querySelectorAll("tr")).find(row=>{
      const cells=row.cells||[];
      const rowMasp=normMasp(cells[0]?.textContent||"");
      const rowSize=normSize(cells[2]?.textContent||"");
      return rowMasp===masp&&(size?rowSize===size:true);
    })||null;
  }

  async function prefillCustomer(payload){
    const makh=text(payload?.makh);
    if(!makh)return;
    const el=document.getElementById("makh");
    if(!el)return;
    el.value=makh;
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.focus();
    el.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:true,cancelable:true}));
    await sleep(120);
  }

  async function getDirectApi(){
    return await waitUntil(()=>typeof window.hoadonNhanTuSalesCopilot==="function"?window.hoadonNhanTuSalesCopilot:null,15000,60);
  }

  async function addOne(item){
    const masp=normMasp(item?.masp);
    const size=normSize(item?.size);
    const qty=Math.max(1,parseInt(item?.soluong||1,10)||1);
    if(!masp)throw new Error("Thiếu mã sản phẩm từ Tìm kiếm nhanh.");

    const api=await getDirectApi();
    if(!api)throw new Error("Module hóa đơn chưa sẵn sàng nhận dữ liệu trực tiếp. Hãy tải lại trang bán một lần.");

    const result=await api({masp,size,soluong:qty,source:"sales-copilot"});
    if(!result||result.ok!==true)throw new Error(result?.error||`Không thêm được ${masp}/${size||"0"}.`);

    const row=await waitUntil(()=>findSaleRow(masp,size),1800,45);
    if(!row)console.warn("[COPILOT BRIDGE V5] State đã xác nhận nhưng DOM chưa render kịp:",{masp,size,result});
    return result;
  }

  function cleanTxFromAddressBar(){
    try{
      const url=new URL(location.href);
      url.searchParams.delete("copilot_tx");
      const next=url.pathname+(url.searchParams.toString()?`?${url.searchParams.toString()}`:"")+url.hash;
      history.replaceState({},document.title,next);
    }catch(_){}
  }

  async function consume(){
    if(running||finished)return false;
    const payload=getPayload();
    if(!payload)return false;
    if(payload.diadiem&&text(payload.diadiem).toLowerCase()!==PAGE_BRANCH)return false;

    running=true;
    try{
      const basicReady=await waitUntil(()=>pageBasicReady(),12000,60);
      if(!basicReady)throw new Error("Trang bán chưa tạo xong các ô mã/size/số lượng.");

      const apiReady=await getDirectApi();
      if(!apiReady)throw new Error("Không tìm thấy API nhận dữ liệu của module hóa đơn.");

      await prefillCustomer(payload);
      for(const item of payload.items)await addOne(item);

      finished=true;
      localStorage.removeItem(KEY);
      const ack={id:payload.id,transfer_id:tx,consumed_at:new Date().toISOString(),count:payload.items.length,mode:"direct-api-v5-isolated-tab"};
      localStorage.setItem(ACK_KEY,JSON.stringify(ack));
      cleanTxFromAddressBar();

      try{window.focus();document.getElementById("masp")?.focus()}catch(_){}
      return true;
    }catch(e){
      console.error("[COPILOT BRIDGE V5] lỗi nhận dữ liệu:",e);
      finished=true;
      try{localStorage.removeItem(KEY)}catch(_){}
      const ack={id:tx,transfer_id:tx,consumed_at:new Date().toISOString(),count:0,ok:false,error:String(e?.message||e),mode:"direct-api-v5-isolated-tab"};
      try{localStorage.setItem(ACK_KEY,JSON.stringify(ack))}catch(_){}
      alert("❌ Không nhận được dữ liệu từ Tìm kiếm nhanh: "+(e?.message||e));
      return false;
    }finally{running=false}
  }

  // Payload thường đã có trước khi tab mở; polling nhẹ để chờ auth + main.js + hoadon.js sẵn sàng.
  const timer=setInterval(()=>{if(finished){clearInterval(timer);return}consume()},400);
  setTimeout(consume,80);
  window.addEventListener("focus",()=>{if(!finished)setTimeout(consume,20)});
  document.addEventListener("visibilitychange",()=>{if(!finished&&document.visibilityState==="visible")setTimeout(consume,20)});

  window.SalesCopilotBridge={consume,version:"5.0-isolated-tab"};
})();
