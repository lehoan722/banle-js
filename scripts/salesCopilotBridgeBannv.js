// scripts/salesCopilotBridgeBannv.js
// Cầu nối V3: nhận masp + size + soluong từ Tìm kiếm nhanh/Sales Copilot.
// Tối ưu tốc độ + đảm bảo đúng SIZE bằng đúng luồng của trang bán:
// MASP -> Enter -> SIZE -> Enter -> xác nhận dòng đã xuất hiện trong bảng.
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

  // Giúp Tìm kiếm nhanh nhận diện/tái sử dụng đúng tab bán đã mở sẵn.
  try { window.name = WINDOW_NAME; } catch (_) {}

  let bridgeChannel = null;
  try { bridgeChannel = new BroadcastChannel(CHANNEL_NAME); } catch (_) {}

  function sleep(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function text(v){
    return String(v == null ? "" : v).trim();
  }

  function normMasp(v){
    return text(v).toUpperCase();
  }

  function normSize(v){
    return text(v).toUpperCase();
  }

  async function waitUntil(check, timeout=1500, interval=40){
    const started = Date.now();
    while(Date.now() - started < timeout){
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

  function getControls(){
    return {
      maspEl: document.getElementById("masp"),
      slEl: document.getElementById("soluong"),
      sizeEl: document.getElementById("size")
    };
  }

  function ready(){
    const { maspEl, slEl, sizeEl } = getControls();
    return !!(
      maspEl &&
      slEl &&
      sizeEl &&
      window.sanPhamData &&
      Object.keys(window.sanPhamData).length
    );
  }

  // Xác nhận bằng chính bảng bán, không chỉ dựa vào timer.
  function findSaleRow(maspRaw, sizeRaw){
    const masp = normMasp(maspRaw);
    const size = normSize(sizeRaw);
    const tbody = document.querySelector("#bangketqua tbody");
    if(!tbody || !masp) return null;

    const rows = Array.from(tbody.querySelectorAll("tr"));
    return rows.find(row => {
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
    el.dispatchEvent(new Event("input", { bubbles:true }));
    el.focus();
    el.dispatchEvent(new KeyboardEvent("keydown", {
      key:"Enter", code:"Enter", keyCode:13, which:13,
      bubbles:true, cancelable:true
    }));

    // Chỉ chờ ngắn để handler khách hàng kịp hoàn tất.
    await sleep(180);
  }

  async function waitStableReady(){
    // Nếu trang đã mở sẵn, thường trả về gần như ngay lập tức.
    const ok = await waitUntil(() => ready(), 5000, 60);
    if(!ok) return false;

    // Một nhịp nhỏ để các listener cuối cùng gắn xong; bỏ chờ cố định 700ms cũ.
    await sleep(80);
    return ready();
  }

  function dispatchEnter(el){
    el.dispatchEvent(new KeyboardEvent("keydown", {
      key:"Enter",
      code:"Enter",
      keyCode:13,
      which:13,
      bubbles:true,
      cancelable:true
    }));
  }

  async function addOne(item){
    const masp = normMasp(item?.masp);
    const size = normSize(item?.size);
    const qty = Math.max(1, parseInt(item?.soluong || 1, 10) || 1);
    if(!masp) return;

    const { maspEl, slEl, sizeEl } = getControls();
    if(!maspEl || !slEl || !sizeEl){
      throw new Error("Không tìm thấy ô mã/size/số lượng trên trang bán.");
    }

    // Nếu vì một tín hiệu lặp mà đúng dòng đã có sẵn, không thêm lần hai.
    if(findSaleRow(masp, size)) return;

    // 1) Số lượng trước.
    slEl.value = String(qty);
    slEl.dispatchEvent(new Event("input", { bubbles:true }));
    slEl.dispatchEvent(new Event("change", { bubbles:true }));

    // 2) Nhập MÃ GỐC, không ghép MASP_SIZE nữa.
    // Việc chọn size được thực hiện ở đúng ô #size sau khi trang bán xử lý mã.
    maspEl.value = masp;
    maspEl.dispatchEvent(new Event("input", { bubbles:true }));
    maspEl.dispatchEvent(new Event("change", { bubbles:true }));
    maspEl.focus();
    maspEl.select?.();
    dispatchEnter(maspEl);

    // 3) Chờ luồng bán xử lý mã và chuyển sang ô size.
    // Nếu tab/page rất nhanh thì chỉ mất vài chục ms; fallback tối đa 1.4s.
    await waitUntil(() => {
      if(findSaleRow(masp, size)) return "added";
      if(document.activeElement === sizeEl) return "size-focus";
      return null;
    }, 1400, 35);

    if(findSaleRow(masp, size)) return;

    // 4) Điền SIZE sau khi mã đã được xử lý, rồi Enter tại chính ô size.
    if(size){
      sizeEl.value = size;
      sizeEl.dispatchEvent(new Event("input", { bubbles:true }));
      sizeEl.dispatchEvent(new Event("change", { bubbles:true }));
      sizeEl.focus();
      sizeEl.select?.();
      dispatchEnter(sizeEl);
    }

    // 5) Chờ đúng MASP + SIZE xuất hiện trong bảng.
    // Đây là điều kiện xác nhận thực tế, thay cho sleep(900) cũ.
    const added = await waitUntil(
      () => findSaleRow(masp, size),
      2200,
      45
    );

    if(!added){
      // Một lần retry nhẹ cho trường hợp handler của trang bán vừa bận lúc Enter đầu.
      if(size){
        sizeEl.value = size;
        sizeEl.dispatchEvent(new Event("input", { bubbles:true }));
        sizeEl.dispatchEvent(new Event("change", { bubbles:true }));
        sizeEl.focus();
        dispatchEnter(sizeEl);
      }

      const retryAdded = await waitUntil(
        () => findSaleRow(masp, size),
        1200,
        50
      );

      if(!retryAdded){
        throw new Error(`Đã nhận mã ${masp} nhưng chưa xác nhận được size ${size || "-"} trong bảng bán.`);
      }
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

      // Chỉ ACK sau khi tất cả dòng đã thực sự được xác nhận trong bảng bán.
      lastId = payload.id;
      localStorage.removeItem(KEY);

      const ack = {
        id: payload.id,
        consumed_at: new Date().toISOString(),
        count: payload.items.length
      };

      localStorage.setItem(ACK_KEY, JSON.stringify(ack));
      try { bridgeChannel?.postMessage({ type:"ACK", ack }); } catch (_) {}

      try{
        window.focus();
        const masp = document.getElementById("masp");
        masp?.focus();
        masp?.select?.();
      }catch(_){}

      //alert(`✅ Đã nhận ${payload.items.length} sản phẩm từ Trợ lý bán hàng.\nĐã xác nhận mã + size trong bảng bán.`);
    }catch(e){
      console.error("[COPILOT BRIDGE] lỗi nhận dữ liệu:", e);
      alert("❌ Không nhận được dữ liệu từ Trợ lý bán hàng: " + (e?.message || e));
      // Không xóa payload để khi tab được focus/visible hoặc người dùng thử lại vẫn còn dữ liệu.
    }finally{
      running = false;
    }
  }

  // Tab khác ghi localStorage.
  window.addEventListener("storage", (e) => {
    if(e.key === KEY && e.newValue) setTimeout(consume, 40);
  });

  // BroadcastChannel: đường nhanh nhất khi tab bán vẫn đang hoạt động nền.
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

  // iOS/Safari có thể tạm dừng tab nền; khi tab được mở lại thì nhận ngay.
  window.addEventListener("focus", () => setTimeout(consume, 20));
  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "visible") setTimeout(consume, 20);
  });

  // Fallback nhẹ; giảm từ 1000ms xuống 350ms để tab desktop bắt nhanh hơn.
  setInterval(consume, 350);
  setTimeout(consume, 120);

  window.SalesCopilotBridge = { consume };
})();
