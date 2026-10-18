// scripts/salesCopilotBridgeBannv.js
// Cầu nối V4.2 DIRECT API: nhận masp + size + soluong từ Tìm kiếm nhanh/Sales Copilot.
// KHÔNG giả lập Enter ở ô mã/size. Gọi trực tiếp API do hoadon.js cung cấp.
// Mục tiêu: loại bỏ race-condition, cảnh báo giả và retry trùng sản phẩm.

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

  async function waitUntil(check, timeout=8000, interval=50){
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
      console.warn("[COPILOT BRIDGE V4] payload lỗi", e);
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

  function pageBasicReady(){
    const { maspEl, slEl, sizeEl } = getControls();
    return !!(maspEl && slEl && sizeEl);
  }

  // Chỉ dùng để quan sát UI sau khi API đã xác nhận state; không dùng để quyết định retry.
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


  function clearancePendingState(maspRaw, sizeRaw){
    const masp = normMasp(maspRaw);
    const size = normSize(sizeRaw) || "0";
    const ctx = window.__KM_XA_CTX;
    const kmEl = document.getElementById("khuyenmai");
    const maspEl = document.getElementById("masp");
    const sizeEl = document.getElementById("size");

    if(!ctx || ctx.confirmed === true || Number(ctx.maxPct || 0) <= 0) return null;
    if(normMasp(ctx.masp) !== masp) return null;

    const pendingSize = normSize(ctx.pendingSize || size) || "0";
    if(pendingSize !== size) return null;

    const formMasp = normMasp(maspEl?.value || "");
    const formSize = normSize(sizeEl?.value || "") || "0";
    const formHasMasp = formMasp === masp || formMasp === `${masp}_${size}` || formMasp.startsWith(`${masp}_`);
    if(!formHasMasp || formSize !== size) return null;

    const hint = text(kmEl?.value || "");
    const clearanceEnabled = kmEl?.dataset?.clearanceEnabled === "1" || !!ctx.hintValue;
    if(!clearanceEnabled || !hint) return null;

    return {
      ok: true,
      pendingClearance: true,
      status: "clearance-pending",
      masp,
      size,
      maxPct: Number(ctx.maxPct || 0),
      defaultKm: Number(ctx.defaultKm || 0),
      hint
    };
  }

  async function prefillCustomer(payload){
    const makh = text(payload?.makh);
    if(!makh) return;

    const el = document.getElementById("makh");
    if(!el) return;

    // Phần khách hàng vẫn dùng luồng Enter hiện hữu của dmkhachhang_diem.js.
    // Nó tách biệt với luồng thêm sản phẩm và không được retry.
    el.value = makh;
    el.dispatchEvent(new Event("input", { bubbles:true }));
    el.focus();
    el.dispatchEvent(new KeyboardEvent("keydown", {
      key:"Enter", code:"Enter", keyCode:13, which:13,
      bubbles:true, cancelable:true
    }));
    await sleep(120);
  }

  async function getDirectApi(){
    return await waitUntil(
      () => typeof window.hoadonNhanTuSalesCopilot === "function"
        ? window.hoadonNhanTuSalesCopilot
        : null,
      12000,
      60
    );
  }

  async function addOne(item){
    const masp = normMasp(item?.masp);
    const size = normSize(item?.size);
    const qty = Math.max(1, parseInt(item?.soluong || 1, 10) || 1);

    if(!masp) throw new Error("Thiếu mã sản phẩm từ Trợ lý bán hàng.");

    const api = await getDirectApi();
    if(!api){
      throw new Error("Module hóa đơn chưa sẵn sàng nhận dữ liệu trực tiếp. Hãy tải lại trang bán một lần.");
    }

    // Chỉ gọi MỘT LẦN. Không Enter mã, không Enter size, không retry bằng bàn phím.
    const result = await api({
      masp,
      size,
      soluong: qty,
      source: "sales-copilot"
    });

    if(!result || result.ok !== true){
      // Hàng có quyền xả được hoadon.js CỐ Ý dừng trước khi thêm dòng,
      // để NV xác nhận mức KM ở ô #khuyenmai. Đây là trạng thái hợp lệ, không phải lỗi.
      const pending = clearancePendingState(masp, size);
      const errText = text(result?.error);
      if(pending && /chưa thấy sản phẩm trong dữ liệu bán/i.test(errText)){
        console.info("[COPILOT BRIDGE V4.2] Đã nạp mã/size/KM, chờ NV xác nhận KM:", pending);
        return pending;
      }
      throw new Error(result?.error || `Không thêm được ${masp}/${size || "0"}.`);
    }

    if(result?.pendingClearance === true || result?.status === "clearance-pending"){
      return result;
    }

    // API đã xác nhận trực tiếp trên state hóa đơn. Chờ DOM render rất ngắn chỉ để UI kịp hiện.
    const row = await waitUntil(() => findSaleRow(masp, size), 1800, 45);
    if(!row){
      console.warn(
        "[COPILOT BRIDGE V4.2] State đã xác nhận nhưng DOM chưa render kịp:",
        { masp, size, result }
      );
      // KHÔNG coi đây là lỗi và tuyệt đối KHÔNG gọi lại API, tránh cộng sản phẩm hai lần.
    }

    return result;
  }

  async function consume(){
    if(running) return;

    const payload = getPayload();
    if(!payload || payload.id === lastId) return;
    if(payload.diadiem && text(payload.diadiem).toLowerCase() !== PAGE_BRANCH) return;

    running = true;
    try{
      const basicReady = await waitUntil(() => pageBasicReady(), 10000, 60);
      if(!basicReady){
        throw new Error("Trang bán chưa tạo xong các ô mã/size/số lượng.");
      }

      // Chờ API hoadon.js trước khi đụng vào dữ liệu sản phẩm.
      const apiReady = await getDirectApi();
      if(!apiReady){
        throw new Error("Không tìm thấy API nhận dữ liệu của module hóa đơn. Kiểm tra đã cập nhật hoadon.js V4 hay chưa.");
      }

      await prefillCustomer(payload);

      const results = [];
      for(const item of payload.items){
        results.push(await addOne(item));
      }
      const hasPendingClearance = results.some(r => r?.pendingClearance === true || r?.status === "clearance-pending");

      // ACK cả hai trạng thái hợp lệ:
      // 1) đã thêm hẳn vào state bán;
      // 2) đã nạp mã/size/KM và đang chờ NV xác nhận KM.
      lastId = payload.id;
      localStorage.removeItem(KEY);

      const ack = {
        id: payload.id,
        consumed_at: new Date().toISOString(),
        count: payload.items.length,
        mode: hasPendingClearance ? "direct-api-v4.2-clearance-pending" : "direct-api-v4.2",
        pending_clearance: hasPendingClearance
      };

      localStorage.setItem(ACK_KEY, JSON.stringify(ack));
      try { bridgeChannel?.postMessage({ type:"ACK", ack }); } catch (_) {}

      try{
        window.focus();
        if(hasPendingClearance){
          // Giữ đúng workflow xả: NV đang cần xác nhận KM, không giật focus về mã hàng.
          const kmEl = document.getElementById("khuyenmai");
          kmEl?.focus();
          kmEl?.select?.();
        }else{
          document.getElementById("masp")?.focus();
        }
      }catch(_){}

    }catch(e){
      console.error("[COPILOT BRIDGE V4] lỗi nhận dữ liệu:", e);

      // Chặn vòng lặp focus/visibility/setInterval lặp lại cùng payload gây nhiều cảnh báo.
      lastId = payload.id || lastId;
      try { localStorage.removeItem(KEY); } catch (_) {}

      alert("❌ Không nhận được dữ liệu từ Trợ lý bán hàng: " + (e?.message || e));
    }finally{
      running = false;
    }
  }

  window.addEventListener("storage", (e) => {
    if(e.key === KEY && e.newValue) setTimeout(consume, 20);
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

  // iOS/Safari có thể ngủ tab nền. Khi quay lại, consume cùng payload chỉ chạy một lần.
  window.addEventListener("focus", () => setTimeout(consume, 20));
  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "visible") setTimeout(consume, 20);
  });

  setInterval(consume, 500);
  setTimeout(consume, 100);

  window.SalesCopilotBridge = {
    consume,
    version: "4.2-direct-api-clearance-pending-fix"
  };
})();
