// stockQuickSimilar.js
// Module trung gian: tìm sản phẩm cùng nhóm + cùng size + còn tồn → mở trang ảnh nhanh

(function () {

  function getSupabaseClient() {
    const client = window.supabase;
    if (!client || typeof client.from !== "function") {
      alert("Supabase chưa sẵn sàng");
      return null;
    }
    return client;
  }

  function detectBranchFromPage() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("cs1")) return "cs1";
    if (path.includes("cs2")) return "cs2";
    return "";
  }

  function pickBranchIfNeeded() {
    return new Promise((resolve) => {
      const div = document.createElement("div");
      div.style = `
        position:fixed; inset:0; background:rgba(0,0,0,.5);
        display:flex; align-items:center; justify-content:center; z-index:99999;
      `;
      div.innerHTML = `
        <div style="background:#fff;padding:16px;border-radius:8px;text-align:center">
          <div style="margin-bottom:10px;font-weight:bold">
            Chọn cơ sở
          </div>
          <button id="pickCS1">CS1</button>
          <button id="pickCS2">CS2</button>
          <button id="pickCancel">Hủy</button>
        </div>
      `;
      document.body.appendChild(div);

      div.querySelector("#pickCS1").onclick = () => { div.remove(); resolve("cs1"); };
      div.querySelector("#pickCS2").onclick = () => { div.remove(); resolve("cs2"); };
      div.querySelector("#pickCancel").onclick = () => { div.remove(); resolve(null); };
    });
  }

  function normalizeSize(sizeRaw) {
    const s = String(sizeRaw || "").trim();
    const m = s.match(/(\d{1,2})/);
    return m ? m[1] : s;
  }

  async function fetchSimilar({ masp, size, branch, denNgay }) {
    const client = getSupabaseClient();
    if (!client) return [];

    const { data, error } = await client.rpc("rpc_stockquick_similar_by_group_size", {
      p_masp: masp,
      p_size: size,
      p_branch: branch,
      p_den_ngay: denNgay
    });

    if (error) {
      console.warn(error);
      alert("Lỗi tìm sản phẩm cùng nhóm: " + error.message);
      return [];
    }

    return data || [];
  }

  function buildList(rows, sourceMasp) {
    return rows
      .filter(r => r.masp && r.masp !== sourceMasp)
      .map(r => ({
        masp: r.masp,
        giale: r.giale || 0,
        toncs1: r.toncs1 || 0,
        toncs2: r.toncs2 || 0
      }));
  }

  function openViewer({ list, masp, size, branch }) {
    if (!list.length) {
      alert(`Không có sản phẩm cùng nhóm còn size ${size}`);
      return;
    }

    sessionStorage.setItem("XNT14_MASP_LIST", JSON.stringify(list));

    sessionStorage.setItem("XNT14_CONTEXT", JSON.stringify({
      source_masp: masp,
      source_size: size,
      branch
    }));

    window.open("xemanhxnt14.html", "_blank");
  }

  async function openFromPopup({ masp, size, denNgay }) {
    const sizeNorm = normalizeSize(size);

    let branch = detectBranchFromPage();

    if (!branch) {
      branch = await pickBranchIfNeeded();
      if (!branch) return;
    }

    const rows = await fetchSimilar({
      masp,
      size: sizeNorm,
      branch,
      denNgay
    });

    const list = buildList(rows, masp);

    openViewer({
      list,
      masp,
      size: sizeNorm,
      branch
    });
  }

  window.StockQuickSimilar = {
    openFromPopup
  };

})();