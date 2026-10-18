// scripts/salesCopilotBridgeBannv.js
// V5.5 ISOLATED-TAB - MINIMAL FAKE-ERROR FIX
// Giữ nguyên Direct API của V5 gốc.
// Chỉ sửa trường hợp hàng có quyền xả: API đã nạp đủ form nhưng chưa thêm dòng vì đang chờ xác nhận KM.
// Khi đó không báo lỗi giả; focus + select ô Mã sản phẩm để NV nhấn Enter và đi tiếp sang Khuyến mại.

(function(){
  "use strict";

  const PAGE_BRANCH = location.pathname.toLowerCase().includes("bannvcs2") ? "cs2" : "cs1";
  const tx = (()=>{
    try{return String(new URLSearchParams(location.search).get("copilot_tx")||"").trim()}catch{return ""}
  })();

  // Trang bán mở bình thường (không đi từ nút Sang bán) thì bridge đứng yên.
  if(!tx){
    window.SalesCopilotBridge={consume:async()=>false,version:"5.5-isolated-tab-minimal-fix-idle"};
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
      console.warn("[COPILOT BRIDGE V5.5] payload lỗi",e);
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

  function isClearancePendingAfterApi(maspRaw,sizeRaw,result){
    const masp=normMasp(maspRaw);
    const size=normSize(sizeRaw);
    const msg=text(result?.error||"");

    // Chỉ coi là lỗi giả khi đúng kiểu lỗi xác nhận state sau khi xuLyMaSanPham đã chạy.
    const looksLikeFakeStateError=
      msg.includes("Đã xử lý") &&
      msg.includes("chưa thấy sản phẩm trong dữ liệu bán");

    if(!looksLikeFakeStateError)return false;

    try{
      const maspEl=document.getElementById("masp");
      const sizeEl=document.getElementById("size");
      const kmEl=document.getElementById("khuyenmai");
      const ctx=window.__KM_XA_CTX;

      const formMasp=normMasp(maspEl?.value)
        .replace(/_(38|39|40|41|42|43|44|45|46|0)$/,"");
      const formSize=normSize(sizeEl?.value||"");
      const ctxMasp=normMasp(ctx?.masp||"");
      const ctxPendingSize=normSize(ctx?.pendingSize||"");

      const sameMasp=(formMasp===masp)||(ctxMasp===masp);
      const sameSize=!size || formSize===size || ctxPendingSize===size;

      // Quyền xả đang được arm trên ô KM/context.
      const clearanceArmed=
        kmEl?.dataset?.clearanceEnabled==="1" ||
        Number(ctx?.maxPct||0)>0 ||
        (text(kmEl?.value).includes("-") && Number(ctx?.maxPct||0)>0);

      return !!(sameMasp && sameSize && clearanceArmed);
    }catch(_){
      return false;
    }
  }

  function focusSelectMasp(){
    const maspEl=document.getElementById("masp");
    if(!maspEl)return;

    const doSelect=()=>{
      try{maspEl.focus({preventScroll:true})}catch(_){try{maspEl.focus()}catch(__){}}
      try{maspEl.select()}catch(_){}
      try{
        const len=String(maspEl.value||"").length;
        maspEl.setSelectionRange(0,len);
      }catch(_){}
    };

    doSelect();
    if(typeof requestAnimationFrame==="function"){
      requestAnimationFrame(()=>{
        doSelect();
        requestAnimationFrame(doSelect);
      });
    }
    setTimeout(doSelect,30);
    setTimeout(doSelect,100);
  }

  async function addOne(item){
    const masp=normMasp(item?.masp);
    const size=normSize(item?.size);
    const qty=Math.max(1,parseInt(item?.soluong||1,10)||1);
    if(!masp)throw new Error("Thiếu mã sản phẩm từ Tìm kiếm nhanh.");

    const api=await getDirectApi();
    if(!api)throw new Error("Module hóa đơn chưa sẵn sàng nhận dữ liệu trực tiếp. Hãy tải lại trang bán một lần.");

    const result=await api({masp,size,soluong:qty,source:"sales-copilot"});

    if(!result||result.ok!==true){
      // Hàng có quyền xả: hoadon.js có thể đã nạp đủ mã/size/giá/KM
      // nhưng cố ý chưa thêm dòng vì đang chờ NV xác nhận Khuyến mại.
      // Đây là trạng thái hợp lệ, không được alert lỗi giả.
      if(isClearancePendingAfterApi(masp,size,result)){
        console.info("[COPILOT BRIDGE V5.5] Hàng xả đã nạp form, chờ NV Enter lại ở Mã hàng:",{
          masp,size,error:result?.error
        });
        focusSelectMasp();
        return {
          ok:true,
          pending_clearance:true,
          masp,
          size:size||"0",
          soluong:qty
        };
      }

      // Các lỗi thật khác vẫn giữ nguyên hành vi V5 gốc.
      throw new Error(result?.error||`Không thêm được ${masp}/${size||"0"}.`);
    }

    const row=await waitUntil(()=>findSaleRow(masp,size),1800,45);
    if(!row)console.warn("[COPILOT BRIDGE V5.5] State đã xác nhận nhưng DOM chưa render kịp:",{masp,size,result});
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

      let pendingClearance=null;
      let processedCount=0;

      for(const item of payload.items){
        const result=await addOne(item);
        processedCount++;

        if(result?.pending_clearance===true){
          pendingClearance=result;
          // Form đang chờ NV nhấn Enter tại Mã hàng rồi xử lý KM;
          // không được đẩy item tiếp theo làm ghi đè form.
          break;
        }
      }

      finished=true;
      localStorage.removeItem(KEY);
      const ack={
        id:payload.id,
        transfer_id:tx,
        consumed_at:new Date().toISOString(),
        count:processedCount,
        ok:true,
        pending_clearance:!!pendingClearance,
        mode:"direct-api-v5.5-isolated-tab-minimal-fix"
      };
      localStorage.setItem(ACK_KEY,JSON.stringify(ack));
      cleanTxFromAddressBar();

      try{
        window.focus();
        // Hàng thường: giữ nguyên V5 gốc -> focus về Mã hàng.
        // Hàng xả: cũng focus/select Mã hàng để NV chỉ cần Enter 1 lần.
        const maspEl=document.getElementById("masp");
        if(maspEl){
          maspEl.focus();
          if(pendingClearance)focusSelectMasp();
        }
      }catch(_){}
      return true;
    }catch(e){
      console.error("[COPILOT BRIDGE V5.5] lỗi nhận dữ liệu:",e);
      finished=true;
      try{localStorage.removeItem(KEY)}catch(_){}
      const ack={id:tx,transfer_id:tx,consumed_at:new Date().toISOString(),count:0,ok:false,error:String(e?.message||e),mode:"direct-api-v5.5-isolated-tab-minimal-fix"};
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

  window.SalesCopilotBridge={consume,version:"5.5-isolated-tab-minimal-fix"};
})();
