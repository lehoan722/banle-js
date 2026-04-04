// stockQuickSimilar.js - JS FILTER (KHÔNG RPC)

(function () {

  function normalizeSize(sizeRaw) {
    const s = String(sizeRaw || "").trim();
    const m = s.match(/(\d{1,2})/);
    return m ? m[1] : s;
  }

  function detectBranch() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("cs1")) return "cs1";
    if (path.includes("cs2")) return "cs2";
    return "cs1"; // default
  }

  function buildListFromCache({ masp, size, nhomhang }) {

    console.log("CACHE DATA:", window.__SQ_DATA);
    const all = window.__SQ_DATA || {};
    const sizeNorm = normalizeSize(size);
    const branch = detectBranch();

    let result = [];

    Object.keys(all).forEach(m => {
      const item = all[m];

      // khác mã
      if (m === masp) return;

      // cùng nhóm
      if (item.nhomhang !== nhomhang) return;

      const row = item.rows.find(r => {
        const s = normalizeSize(r.size);
        return s === sizeNorm;
      });

      if (!row) return;

      // lọc tồn
      const ton = branch === "cs1" ? row.ton_cs1 : row.ton_cs2;
      if (ton <= 0) return;

      result.push({
        masp: m,
        giale: item.giale || 0,
        toncs1: row.ton_cs1 || 0,
        toncs2: row.ton_cs2 || 0
      });
    });

    return result.sort((a, b) =>
      (b.toncs1 + b.toncs2) - (a.toncs1 + a.toncs2)
    );
  }

  function openViewer({ list, masp, size }) {
    if (!list.length) {
      alert(`Không có sản phẩm cùng nhóm còn size ${size}`);
      return;
    }

    sessionStorage.setItem("XNT14_MASP_LIST", JSON.stringify(list));

    sessionStorage.setItem("XNT14_CONTEXT", JSON.stringify({
      source_masp: masp,
      source_size: size
    }));

    window.open("xemanhxnt14.html", "_blank");
  }

  function openFromPopup({ masp, size, nhomhang }) {
    const list = buildListFromCache({ masp, size, nhomhang });

    openViewer({
      list,
      masp,
      size
    });
  }

  window.StockQuickSimilar = {
    openFromPopup
  };

})();
