// scripts/salesCopilotBridgeBannv.js
// V5.4 ISOLATED-TAB PREFILL ONLY
// Mỗi lần Sang bán gắn copilot_tx riêng vào tab mới.
// Chỉ tab có đúng copilot_tx mới được đọc payload tương ứng.
// Bridge CHỈ nạp mã/size/số lượng vào form rồi focus + select ô Mã hàng.
// Người dùng nhấn Enter để chính luồng bán hiện tại xử lý và chuyển sang Khuyến mại nếu cần.

(function(){
  "use strict";

  const PAGE_BRANCH = location.pathname.toLowerCase().includes("bannvcs2") ? "cs2" : "cs1";
  const tx = (()=>{
    try{return String(new URLSearchParams(location.search).get("copilot_tx")||"").trim()}catch{return ""}
  })();

  // Trang bán mở bình thường (không đi từ nút Sang bán) thì bridge đứng yên.
  if(!tx){
    window.SalesCopilotBridge={consume:async()=>false,version:"5.4-isolated-tab-prefill-manual-enter-idle"};
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
      console.warn("[COPILOT BRIDGE V5.4] payload lỗi",e);
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

  async function prefillOne(item){
    const masp=normMasp(item?.masp);
    const size=normSize(item?.size);
    const qty=Math.max(1,parseInt(item?.soluong||1,10)||1);
    if(!masp)throw new Error("Thiếu mã sản phẩm từ Tìm kiếm nhanh.");

    const maspEl=document.getElementById("masp");
    const slEl=document.getElementById("soluong");
    const sizeEl=document.getElementById("size");

    if(!maspEl||!slEl||!sizeEl){
      throw new Error("Trang bán chưa sẵn sàng nhận mã/size/số lượng.");
    }

    // Dùng đúng cú pháp hậu tố size mà hoadon.js hiện có hỗ trợ.
    // Ví dụ: 1379-GHM_40
    maspEl.value=size?`${masp}_${size}`:masp;
    slEl.value=String(qty);

    // Để Enter tại #masp chạy lại toàn bộ luồng chuẩn của trang bán.
    // Không tự gọi Direct API, không tự thêm dòng, không phát sinh cảnh báo giả.
    sizeEl.value="";

    const selectMasp=()=>{
      try{maspEl.focus({preventScroll:true})}catch(_){try{maspEl.focus()}catch(__){}}
      try{maspEl.select()}catch(_){}
      try{
        const len=String(maspEl.value||"").length;
        maspEl.setSelectionRange(0,len);
      }catch(_){}
    };

    selectMasp();
    if(typeof requestAnimationFrame==="function"){
      requestAnimationFrame(()=>{
        selectMasp();
        requestAnimationFrame(selectMasp);
      });
    }
    setTimeout(selectMasp,30);
    setTimeout(selectMasp,100);

    return {ok:true,prefilled:true,masp,size:size||"0",soluong:qty};
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

      await prefillCustomer(payload);

      // Nút Sang bán hiện tại thực tế gửi từng sản phẩm.
      // Nếu payload có nhiều item, chỉ nạp item đầu vào form để tránh ghi đè liên tiếp.
      const item=payload.items[0];
      const result=await prefillOne(item);

      finished=true;
      localStorage.removeItem(KEY);
      const ack={
        id:payload.id,
        transfer_id:tx,
        consumed_at:new Date().toISOString(),
        count:1,
        ok:true,
        prefilled:true,
        masp:result.masp,
        size:result.size,
        mode:"prefill-manual-enter-v5.4-isolated-tab"
      };
      localStorage.setItem(ACK_KEY,JSON.stringify(ack));
      cleanTxFromAddressBar();

      // Sau khi tab thực sự active, gia cố focus/select ô Mã hàng.
      const refocus=()=>{
        const el=document.getElementById("masp");
        if(!el)return;
        try{el.focus({preventScroll:true})}catch(_){try{el.focus()}catch(__){}}
        try{el.select()}catch(_){}
        try{el.setSelectionRange(0,String(el.value||"").length)}catch(_){}
      };
      setTimeout(refocus,20);
      setTimeout(refocus,120);
      return true;
    }catch(e){
      console.error("[COPILOT BRIDGE V5.4] lỗi nhận dữ liệu:",e);
      finished=true;
      try{localStorage.removeItem(KEY)}catch(_){}
      const ack={id:tx,transfer_id:tx,consumed_at:new Date().toISOString(),count:0,ok:false,error:String(e?.message||e),mode:"prefill-manual-enter-v5.4-isolated-tab"};
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

  window.SalesCopilotBridge={consume,version:"5.4-isolated-tab-prefill-manual-enter"};
})();
