// stockQuickSimilar.js - JS FILTER THEO NHÓM (không dùng RPC riêng)

// stockQuickSimilar.js chỉ lo phần mở sản phẩm cùng nhóm theo size.

(function () {
  function getSupabaseClient() {
    const client = window.supabase;
    if (!client || typeof client.from !== "function" || typeof client.rpc !== "function") {
      alert("Supabase chưa sẵn sàng");
      return null;
    }
    return client;
  }

  function normalizeSize(sizeRaw) {
    const s = String(sizeRaw || "").trim();
    const m = s.match(/(\d{1,2})/);
    return m ? m[1] : s;
  }

  function normalizeSizeForCompare(v) {
    const raw = String(v || "").trim();
    const noPrefix = raw.replace(/^size\s+/i, "").trim();
    const m = noPrefix.match(/(\d{1,2})/);
    return m ? m[1] : noPrefix;
  }

  function detectBranch() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("cs1")) return "cs1";
    if (path.includes("cs2")) return "cs2";
    return "";
  }

  function pickBranchIfNeeded() {
    return new Promise((resolve) => {
      const div = document.createElement("div");
      div.style = `
        position:fixed; inset:0; background:rgba(0,0,0,.45);
        display:flex; align-items:center; justify-content:center; z-index:999999;
      `;
      div.innerHTML = `
        <div style="background:#fff;padding:16px 18px;border-radius:10px;text-align:center;min-width:220px">
          <div style="margin-bottom:12px;font-weight:700">Chọn cơ sở để lọc tồn</div>
          <div style="display:flex;gap:8px;justify-content:center">
            <button id="sqPickCS1" type="button">CS1</button>
            <button id="sqPickCS2" type="button">CS2</button>
            <button id="sqPickCancel" type="button">Hủy</button>
          </div>
        </div>
      `;
      document.body.appendChild(div);

      div.querySelector("#sqPickCS1").onclick = () => { div.remove(); resolve("cs1"); };
      div.querySelector("#sqPickCS2").onclick = () => { div.remove(); resolve("cs2"); };
      div.querySelector("#sqPickCancel").onclick = () => { div.remove(); resolve(null); };
    });
  }

  async function fetchGroupMasterProducts(nhomhang) {
    const client = getSupabaseClient();
    if (!client) return [];

    const { data, error } = await client
      .from("dmhanghoa")
      .select("masp, giale, nhomhang")
      .eq("nhomhang", nhomhang)
      .order("masp", { ascending: true });

    if (error) {
      console.warn("[StockQuickSimilar] Lỗi đọc dmhanghoa theo nhóm:", error);
      alert("Lỗi đọc danh mục nhóm hàng: " + error.message);
      return [];
    }

    return data || [];
  }

  async function fetchGroupStockRows(maspList, denNgay) {
    const client = getSupabaseClient();
    if (!client) return [];

    if (!Array.isArray(maspList) || !maspList.length) return [];

    const { data, error } = await client.rpc("xntnhanh", {
      p_masps: maspList,
      p_den_ngay: denNgay,
      p_tonghop_size: false,
    });

    if (error) {
      console.warn("[StockQuickSimilar] Lỗi xntnhanh nhóm:", error);
      alert("Lỗi đọc tồn nhóm hàng: " + error.message);
      return [];
    }

    return data || [];
  }

  function buildListFromGroupData({ sourceMasp, size, branch, masters, stockRows }) {
    const sizeNorm = normalizeSize(size);

    const masterMap = new Map();
    (masters || []).forEach((m) => {
      masterMap.set(String(m.masp || "").trim().toUpperCase(), {
        giale: Number(m.giale || 0),
        nhomhang: m.nhomhang || "",
      });
    });

    const byMasp = new Map();

    (stockRows || []).forEach((r) => {
      const masp = String(r.masp || "").trim().toUpperCase();
      if (!masp || masp === sourceMasp) return;

      const rowSize = normalizeSizeForCompare(r.size);
      if (rowSize !== sizeNorm) return;

      const toncs1 = Number(r.ton_cs1 || 0);
      const toncs2 = Number(r.ton_cs2 || 0);
      const tonTarget = branch === "cs2" ? toncs2 : toncs1;
      if (tonTarget <= 0) return;

      const existed = byMasp.get(masp) || {
        masp,
        giale: masterMap.get(masp)?.giale || 0,
        toncs1: 0,
        toncs2: 0,
      };

      existed.toncs1 += toncs1;
      existed.toncs2 += toncs2;
      byMasp.set(masp, existed);
    });

    return Array.from(byMasp.values()).sort((a, b) => {
      const ta = branch === "cs2" ? a.toncs2 : a.toncs1;
      const tb = branch === "cs2" ? b.toncs2 : b.toncs1;
      if (tb !== ta) return tb - ta;
      return (b.toncs1 + b.toncs2) - (a.toncs1 + a.toncs2);
    });
  }

  function openViewer({ list, masp, size, branch, nhomhang }) {
    if (!list.length) {
      alert(`Không có sản phẩm cùng nhóm còn size ${size}`);
      return;
    }

    sessionStorage.setItem("XNT14_MASP_LIST", JSON.stringify(list));
    sessionStorage.setItem("XNT14_CONTEXT", JSON.stringify({
      source_masp: masp,
      source_size: size,
      branch,
      nhomhang
    }));

    window.open("xemanhxnt14.html", "_blank");
  }

  async function openFromPopup({ masp, size, nhomhang, denNgay }) {
    const sourceMasp = String(masp || "").trim().toUpperCase();
    const sourceGroup = String(nhomhang || "").trim();
    const sizeNorm = normalizeSize(size);

    if (!sourceMasp || !sourceGroup || !sizeNorm) {
      alert("Thiếu dữ liệu để tìm sản phẩm cùng nhóm");
      return;
    }

    let branch = detectBranch();
    if (!branch) {
      branch = await pickBranchIfNeeded();
      if (!branch) return;
    }

    const masters = await fetchGroupMasterProducts(sourceGroup);
    if (!masters.length) {
      alert(`Không tìm thấy danh mục nhóm ${sourceGroup}`);
      return;
    }

    const maspList = masters
      .map(x => String(x.masp || "").trim().toUpperCase())
      .filter(Boolean);

    const stockRows = await fetchGroupStockRows(maspList, denNgay);
    const list = buildListFromGroupData({
      sourceMasp,
      size: sizeNorm,
      branch,
      masters,
      stockRows
    });

    openViewer({
      list,
      masp: sourceMasp,
      size: sizeNorm,
      branch,
      nhomhang: sourceGroup
    });
  }

  window.StockQuickSimilar = {
    openFromPopup
  };
})();
