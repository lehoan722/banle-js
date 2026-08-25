// scripts/salesCopilotBridgeBannv.js
// Cầu nối V1: nhận masp + size + soluong từ Sales Copilot.
// KHÔNG lưu hóa đơn. Chỉ đưa hàng vào đúng luồng nhập mã hiện tại của bannv.

(function(){
  const KEY = "sales_copilot_pending_v1";
  const ACK_KEY = "sales_copilot_ack_v1";
  let running = false;
  let lastId = "";

  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

  function getPayload(){
    try{
      const raw=localStorage.getItem(KEY);
      if(!raw)return null;
      const p=JSON.parse(raw);
      if(!p || !Array.isArray(p.items) || !p.items.length)return null;
      return p;
    }catch(e){console.warn("[COPILOT BRIDGE] payload lỗi",e);return null;}
  }

  function ready(){
    return !!(
      document.getElementById("masp") &&
      document.getElementById("soluong") &&
      document.getElementById("size") &&
      window.sanPhamData &&
      Object.keys(window.sanPhamData).length
    );
  }

  async function prefillCustomer(payload){
    const makh=String(payload?.makh||"").trim();
    if(!makh)return;
    const el=document.getElementById("makh");
    if(!el)return;
    el.value=makh;
    el.dispatchEvent(new Event("input",{bubbles:true}));
    await sleep(250);
    el.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",bubbles:true,cancelable:true}));
    await sleep(350);
  }

  async function addOne(item){
    const masp=String(item?.masp||"").trim().toUpperCase();
    const size=String(item?.size||"").trim();
    const qty=Math.max(1,parseInt(item?.soluong||1,10)||1);
    if(!masp)return;

    const maspEl=document.getElementById("masp");
    const slEl=document.getElementById("soluong");
    const sizeEl=document.getElementById("size");

    if(!maspEl||!slEl||!sizeEl)throw new Error("Không tìm thấy ô mã/size/số lượng trên trang bán.");

    // Hàng có size: tận dụng chính cú pháp MASP_38...MASP_46 mà hoadon.js đang hỗ trợ.
    // Hàng không size: chỉ gửi MASP để luồng bán cũ tự quyết định size=0.
    maspEl.value = size ? `${masp}_${size}` : masp;
    slEl.value = String(qty);
    sizeEl.value = "";

    maspEl.focus();
    maspEl.dispatchEvent(new KeyboardEvent("keydown",{
      key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:true,cancelable:true
    }));

    // xuLyMaSanPham là async; chờ đủ để fetch/cache + thêm vào bảng.
    await sleep(650);
  }

  async function consume(){
    if(running || !ready())return;
    const payload=getPayload();
    if(!payload || payload.id===lastId)return;

    running=true;
    try{
      await prefillCustomer(payload);

      for(const item of payload.items){
        await addOne(item);
      }

      lastId=payload.id;
      localStorage.removeItem(KEY);
      localStorage.setItem(ACK_KEY, JSON.stringify({
        id: payload.id,
        consumed_at: new Date().toISOString(),
        count: payload.items.length
      }));

      try{
        window.focus();
        const masp=document.getElementById("masp");
        masp?.focus();
        masp?.select?.();
      }catch(_){}

      alert(`✅ Đã nhận ${payload.items.length} sản phẩm từ Trợ lý bán hàng.\nHãy kiểm tra bảng bán trước khi lưu hóa đơn.`);
    }catch(e){
      console.error("[COPILOT BRIDGE] lỗi nhận dữ liệu:",e);
      alert("❌ Không nhận được dữ liệu từ Trợ lý bán hàng: "+(e?.message||e));
      // Không xóa payload để người dùng có thể thử lại.
    }finally{
      running=false;
    }
  }

  window.addEventListener("storage",(e)=>{
    if(e.key===KEY && e.newValue) setTimeout(consume,200);
  });
  window.addEventListener("focus",()=>setTimeout(consume,200));
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible")setTimeout(consume,200);
  });

  setInterval(consume,1000);
  setTimeout(consume,1000);

  window.SalesCopilotBridge={consume};
})();
