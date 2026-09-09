// scripts/salesCopilotBridgeBannv.js
// Cầu nối V3.1: nhận masp + size + soluong từ Tìm kiếm nhanh/Sales Copilot.
// Dùng đúng cơ chế hậu tố MASP_SIZE mà hoadon.js của trang bán đã hỗ trợ sẵn.
// Chỉ Enter MỘT LẦN tại ô mã; không giả lập Enter ở ô size để tránh kích hoạt validation lặp.
// KHÔNG lưu hóa đơn. Chỉ đưa hàng vào đúng luồng nhập mã hiện tại của bannv.

(function(){
  "use strict";

  const KEY = "sales_copilot_pending_v1";
  const ACK_KEY = "sales_copilot_ack_v1";
  const PAGE_BRANCH = location.pathname.toLowerCase().includes("bannvcs2") ? "cs2" : "cs1";
  const WINDOW_NAME = `BAN_NV_HOAN_TUYET_${PAGE_BRANCH.toUpperCase()}`;
  const CHANNEL_NAME = `sales_copilot_bridge_v2_${PAGE_BRANCH}`;

  let running = false;
  let lastId = "";

  try { window.name = WINDOW_NAME; } catch (_) {}

  let bridgeChannel = null;
  try { bridgeChannel = new BroadcastChannel(CHANNEL_NAME); } catch (_) {}

  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
  function text(v){ return String(v == null ? "" : v).trim(); }
  function normMasp(v){ return text(v).toUpperCase(); }
  function normSize(v){ return text(v).toUpperCase(); }

  async function waitUntil(check, timeout=2500, interval=50){
    const start = Date.now();
    while(Date.now() - start < timeout){
      try{
        const value = check();
        if(value) return value;
      }catch(_){}
      await sleep(interval);
    }
    return null;
  }

  function getPayload(){
    try{
      const raw = localStorage.getItem(KEY);
      if(!raw) return null;
      const p = JSON.parse(raw);
      if(!p || !Array.isArray(p.items) || !p.items.length) return null;
      return p;
    }catch(e){
      console.warn("[COPILOT BRIDGE] payload lỗi", e);
      return null;
    }
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

  function findSaleRow(maspRaw, sizeRaw){
    const masp = normMasp(maspRaw);
    const size = normSize(sizeRaw);
    const tbody = document.querySelector("#bangketqua tbody");
    if(!tbody || !masp) return null;

    return Array.from(tbody.querySelectorAll("tr")).find(row => {
      const cells = row.cells || [];
      const rowMasp = normMasp(cells[0]?.textContent || "");
      const rowSize = normSize(cells[2]?.textContent || "");
      if(rowMasp !== masp) return false;
      return size ? rowSize === size : true;
    }) || null;
  }

  async function prefillCustomer(payload){
    const makh = text(payload?.makh);
    if(!makh) return;
    const el = document.getElementById("makh");
    if(!el) return;

    el.value = makh;
    el.dispatchEvent(new Event("input", {bubbles:true}));
    el.focus();
    el.dispatchEvent(new KeyboardEvent("keydown", {
      key:"Enter", code:"Enter", keyCode:13, which:13,
      bubbles:true, cancelable:true
    }));
    await sleep(180);
  }

  async function waitStableReady(){
    const ok = await waitUntil(() => ready(), 5000, 60);
    if(!ok) return false;
    await sleep(80);
    return ready();
  }

  function dispatchEnter(el){
    el.dispatchEvent(new KeyboardEvent("keydown", {
      key:"Enter", code:"Enter", keyCode:13, which:13,
      bubbles:true, cancelable:true
    }));
  }

  async function addOne(item){
    const masp = normMasp(item?.masp);
    const size = normSize(item?.size);
    const qty = Math.max(1, parseInt(item?.soluong || 1, 10) || 1);
    if(!masp) return;

    const maspEl = document.getElementById("masp");
    const slEl = document.getElementById("soluong");
    const sizeEl = document.getElementById("size");
    if(!maspEl || !slEl || !sizeEl){
      throw new Error("Không tìm thấy ô mã/size/số lượng trên trang bán.");
    }

    // Tránh thêm trùng nếu cùng payload bị phát tín hiệu hai đường (storage + BroadcastChannel).
    if(findSaleRow(masp, size)) return;

    // Dọn giá trị size cũ trên form. KHÔNG dispatch sự kiện size.
    // hoadon.js sẽ tự điền size từ hậu tố _NN.
    sizeEl.value = "";

    slEl.value = String(qty);
    slEl.dispatchEvent(new Event("input", {bubbles:true}));
    slEl.dispatchEvent(new Event("change", {bubbles:true}));

    // CHỐT: hoadon.js hiện hỗ trợ cú pháp MASP_39 và sẽ tự thêm đúng size.
    const codeToSend = size ? `${masp}_${size}` : masp;
    maspEl.value = codeToSend;
    maspEl.dispatchEvent(new Event("input", {bubbles:true}));
    maspEl.focus();
    maspEl.select?.();

    // Chỉ Enter MỘT LẦN. Tuyệt đối không Enter #size lần nữa.
    dispatchEnter(maspEl);

    // Chờ bảng bán thực sự có đúng mã + size rồi mới coi là thành công.
    const added = await waitUntil(
      () => findSaleRow(masp, size),
      3000,
      50
    );

    if(!added){
      throw new Error(`Đã gửi ${codeToSend} nhưng chưa thấy đúng mã + size trong bảng bán.`);
    }
  }

  async function consume(){
    if(running || !ready()) return;

    const payload = getPayload();
    if(!payload || payload.id === lastId) return;
    if(payload.diadiem && text(payload.diadiem).toLowerCase() !== PAGE_BRANCH) return;

    running = true;
    try{
      const stable = await waitStableReady();
      if(!stable) throw new Error("Trang bán chưa sẵn sàng nhận dữ liệu.");

      await prefillCustomer(payload);

      for(const item of payload.items){
        await addOne(item);
      }

      lastId = payload.id;
      localStorage.removeItem(KEY);

      const ack = {
        id: payload.id,
        consumed_at: new Date().toISOString(),
        count: payload.items.length
      };
      localStorage.setItem(ACK_KEY, JSON.stringify(ack));
      try { bridgeChannel?.postMessage({type:"ACK", ack}); } catch (_) {}

      try{
        window.focus();
        const maspEl = document.getElementById("masp");
        maspEl?.focus();
        maspEl?.select?.();
      }catch(_){}

      alert(`✅ Đã nhận ${payload.items.length} sản phẩm từ Trợ lý bán hàng.\nĐã xác nhận đúng mã + size trong bảng bán.`);
    }catch(e){
      console.error("[COPILOT BRIDGE] lỗi nhận dữ liệu:", e);

      // QUAN TRỌNG: không giữ pending để timer/focus tự thử lặp và sinh nhiều alert.
      // Lần bấm “Sang bán” tiếp theo sẽ tạo payload ID mới và thử lại sạch sẽ.
      lastId = payload.id;
      try { localStorage.removeItem(KEY); } catch (_) {}

      alert("❌ Không nhận được dữ liệu từ Trợ lý bán hàng: " + (e?.message || e));
    }finally{
      running = false;
    }
  }

  window.addEventListener("storage", (e) => {
    if(e.key === KEY && e.newValue) setTimeout(consume, 40);
  });

  if(bridgeChannel){
    bridgeChannel.onmessage = (event) => {
      const message = event?.data;
      if(message?.type !== "PENDING" || !message.payload) return;
      const payload = message.payload;
      if(payload.diadiem && text(payload.diadiem).toLowerCase() !== PAGE_BRANCH) return;
      try { localStorage.setItem(KEY, JSON.stringify(payload)); } catch (_) {}
      setTimeout(consume, 0);
    };
  }

  window.addEventListener("focus", () => setTimeout(consume, 40));
  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "visible") setTimeout(consume, 40);
  });

  // Fallback nhẹ. Không gây thử lặp payload lỗi vì lỗi sẽ xóa KEY + ghi lastId.
  setInterval(consume, 1000);
  setTimeout(consume, 150);

  window.SalesCopilotBridge = { consume };
})();
