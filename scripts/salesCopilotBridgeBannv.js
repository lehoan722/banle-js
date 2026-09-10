// scripts/salesCopilotBridgeBannv.js
// Cầu nối V3.3 STABLE: nhận masp + size + soluong từ Tìm kiếm nhanh/Sales Copilot.
// Chờ DOM + catalog sản phẩm; KHÔNG chờ dm_size tải xong.
// Trước Enter, đảm bảo size hợp lệ đang gửi có trong window.danhMucSize để hoadon.js nhận chắc hậu tố MASP_SIZE.
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

  async function waitUntil(check, timeout=12000, interval=60){
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

  function baseDomReady(){
    return !!(
      document.getElementById("masp") &&
      document.getElementById("soluong") &&
      document.getElementById("size") &&
      document.querySelector("#bangketqua tbody")
    );
  }

  function productReady(maspRaw){
    const masp = normMasp(maspRaw);
    if(!masp) return false;
    return !!(
      window.sanPhamData &&
      typeof window.sanPhamData === "object" &&
      window.sanPhamData[masp]
    );
  }

  function ensureSizeForBridge(sizeRaw){
    const size = normSize(sizeRaw);
    if(!size) return true;

    // Trang Tìm kiếm nhanh hiện dùng dải size 38–46.
    // Chỉ bridge những size số hợp lệ này; không làm bẩn catalog bằng dữ liệu lạ.
    if(!/^(38|39|40|41|42|43|44|45|46)$/.test(size)) return false;

    // hoadon.js ưu tiên window.danhMucSize nếu biến này là Array.
    // Khi dm_size của main.js chưa tải xong, mảng có thể đang rỗng => hậu tố _40 bị coi là một phần MASP.
    // Chủ động thêm đúng size cần gửi để loại bỏ race-condition đó.
    if(!Array.isArray(window.danhMucSize)) window.danhMucSize = [];
    const current = window.danhMucSize.map(s => normSize(s));
    if(!current.includes(size)) window.danhMucSize.push(size);
    return true;
  }

  function itemReady(item){
    const masp = normMasp(item?.masp);
    return baseDomReady() && productReady(masp);
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

    // Chỉ chờ nhẹ cho luồng khách hàng; không ảnh hưởng hàng nếu payload không có khách.
    await sleep(180);
  }

  function dispatchEnter(el){
    el.dispatchEvent(new KeyboardEvent("keydown", {
      key:"Enter", code:"Enter", keyCode:13, which:13,
      bubbles:true, cancelable:true
    }));
  }

  function clearEntryInputs(){
    try{
      const maspEl = document.getElementById("masp");
      const sizeEl = document.getElementById("size");
      if(maspEl) maspEl.value = "";
      if(sizeEl) sizeEl.value = "";
    }catch(_){}
  }

  async function addOne(item){
    const masp = normMasp(item?.masp);
    const size = normSize(item?.size);
    const qty = Math.max(1, parseInt(item?.soluong || 1, 10) || 1);
    if(!masp) return;

    // Nếu tín hiệu storage + BroadcastChannel cùng tới, không thêm trùng.
    if(findSaleRow(masp, size)) return;

    // Chỉ chờ DOM + đúng mã SP trong catalog. Không phụ thuộc tiến độ tải dm_size.
    const ready = await waitUntil(() => itemReady(item), 15000, 60);
    if(!ready){
      throw new Error(`Trang bán chưa tải xong dữ liệu sản phẩm ${masp}. Hãy thử lại khi trang bán hiện đầy đủ.`);
    }

    // Đảm bảo hoadon.js chắc chắn nhận được hậu tố _SIZE ngay tại thời điểm Enter.
    if(size && !ensureSizeForBridge(size)){
      throw new Error(`Size ${size} không hợp lệ cho cầu nối (chỉ hỗ trợ 38–46).`);
    }

    const maspEl = document.getElementById("masp");
    const slEl = document.getElementById("soluong");
    const sizeEl = document.getElementById("size");
    if(!maspEl || !slEl || !sizeEl){
      throw new Error("Không tìm thấy ô mã/size/số lượng trên trang bán.");
    }

    // Dọn size cũ nhưng KHÔNG phát event ở ô size.
    sizeEl.value = "";

    slEl.value = String(qty);
    slEl.dispatchEvent(new Event("input", {bubbles:true}));
    slEl.dispatchEvent(new Event("change", {bubbles:true}));

    // hoadon.js hỗ trợ MASP_39: tự tách mã, tự xác nhận size, tự thêm bảng.
    const codeToSend = size ? `${masp}_${size}` : masp;
    maspEl.value = codeToSend;
    maspEl.dispatchEvent(new Event("input", {bubbles:true}));
    maspEl.focus();

    // Cho DOM/input handler nhận giá trị trước 1 nhịp ngắn, đặc biệt trên Safari/iOS.
    await sleep(40);

    // Enter DUY NHẤT tại ô mã.
    dispatchEnter(maspEl);

    // Chờ đúng dòng xuất hiện thật trong bảng. Mobile/Safari có thể chậm khi vừa chuyển tab.
    const added = await waitUntil(
      () => findSaleRow(masp, size),
      6000,
      60
    );

    if(!added){
      // Dọn mã hậu tố còn sót để người dùng không thấy trạng thái nửa chừng.
      if(normMasp(maspEl.value) === normMasp(codeToSend)) maspEl.value = "";
      throw new Error(`Đã gửi ${codeToSend} nhưng trang bán chưa xác nhận được dòng mã + size.`);
    }
  }

  async function consume(){
    if(running) return;

    const payload = getPayload();
    if(!payload || payload.id === lastId) return;
    if(payload.diadiem && text(payload.diadiem).toLowerCase() !== PAGE_BRANCH) return;

    running = true;
    try{
      // Chờ DOM cơ bản; item cụ thể sẽ tự chờ catalog mã + size của chính nó.
      const domReady = await waitUntil(() => baseDomReady(), 12000, 60);
      if(!domReady) throw new Error("Trang bán chưa sẵn sàng nhận dữ liệu.");

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

      // Dừng sạch payload lỗi, tránh focus/timer thử lại và tạo trạng thái một lần lỗi - một lần đúng.
      lastId = payload.id;
      try { localStorage.removeItem(KEY); } catch (_) {}
      clearEntryInputs();

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

  // Fallback chỉ để bắt payload bị lỡ event. lastId + xóa KEY ngăn chạy lặp payload lỗi.
  setInterval(consume, 1000);
  setTimeout(consume, 150);

  window.SalesCopilotBridge = { consume };
})();
