// scripts/ccnBangKetQuaAdapter.js
// Adapter chỉ sử dụng cho các trang CCN (ccn1v2, ccn2v1...)
// Nhiệm vụ: sau khi bangketqua.js render xong, gom size theo mã và vẽ lại 1 dòng / 1 mã.

(function () {
  function getVitriTheoKho(masp) {
    if (!masp) return "";
    const sp =
      (window.sanPhamData && (window.sanPhamData[masp] || window.sanPhamData[masp.toUpperCase()])) || null;

    const diadiem = (document.getElementById("diadiem")?.value ||
      localStorage.getItem("diadiem") ||
      "").toLowerCase();

    if (!sp) return "";
    if (diadiem === "cs1") return sp.vitrikho1 || "";
    if (diadiem === "cs2") return sp.vitrikho2 || "";
    if (diadiem === "cs3") return sp.vitrikho3 || "";
    return sp.vitrikho1 || sp.vitrikho2 || sp.vitrikho3 || "";
  }

  // ===== helper: xác định thứ tự size để sort =====
  function getSizeOrder(size) {
    const raw = String(size || "").trim();
    if (!raw) return 9999;

    // 1) Nếu có danhMucSize (0, 38, 39, 40... hoặc 0, S, M, L...)
    if (Array.isArray(window.danhMucSize) && window.danhMucSize.length) {
      const upperList = window.danhMucSize.map(s => String(s).trim().toUpperCase());
      const idx = upperList.indexOf(raw.toUpperCase());
      if (idx !== -1) return idx;
    }

    // 2) Thử coi như số (38, 39, 40...)
    const n = parseFloat(raw);
    if (!Number.isNaN(n)) return n;

    // 3) Còn lại (S, M, L... mà không có trong danhMucSize) cho xuống cuối
    return 9999;
  }

  function groupBangKetQua(bangKetQua) {
    const result = [];
    const maspList = Object.keys(bangKetQua || {});
    if (!maspList.length) return result;

    // Dùng lại thứ tự groupOrder nếu có, giống bangketqua.js
    let orderedMasps = [];
    if (Array.isArray(window.groupOrder) && window.groupOrder.length) {
      orderedMasps = window.groupOrder.filter(m => maspList.includes(m));
      orderedMasps.push(...maspList.filter(m => !orderedMasps.includes(m)));
    } else {
      orderedMasps = maspList.slice().reverse();
    }

    orderedMasps.forEach(masp => {
      const item = bangKetQua[masp];
      if (!item) return;

      const sizes = Array.isArray(item.sizes) ? item.sizes : [];
      const counts = Array.isArray(item.soluongs) ? item.soluongs : [];

      // Gom thành mảng cặp {size, sl}
      let pairs = [];
      let tongSL = 0;

      sizes.forEach((sz, idx) => {
        const sl = parseInt(counts[idx] || 0, 10) || 0;
        if (!sz && !sl) return;
        tongSL += sl;
        pairs.push({ size: String(sz).trim(), sl });
      });

      // 🔑 SẮP XẾP LẠI SIZE TỪ NHỎ → LỚN
      pairs.sort((a, b) => getSizeOrder(a.size) - getSizeOrder(b.size));

      const parts = pairs.map(p => `${p.size}/${p.sl}`);
      const sizeText = parts.join(" ");

      result.push({
        masp: item.masp,
        tensp: item.tensp,
        sizeText,
        tongSL,
        gia: item.gia || 0,
        km: item.km || 0,
        dvt: item.dvt || "",
      });
    });

    return result;
  }


  function renderGroupedTable(bangKetQua) {
    const table = document.getElementById("bangketqua");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    const grouped = groupBangKetQua(bangKetQua);
    tbody.innerHTML = "";

    // Trang CCN là xuất kho nên dùng logic giá/km mặc định (không phải isNhap)
    grouped.forEach(row => {
      const gia = row.gia || 0;
      const km = row.km || 0;
      const thanhtien = (gia - km) * (row.tongSL || 0);
      const vitri = getVitriTheoKho(row.masp);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.masp}</td>
        <td>${row.tensp}</td>
        <td>${row.sizeText}</td>
        <td>${row.tongSL}</td>
        <td>${row.dvt}</td>
        <td>${gia}</td>
        <td>${km}</td>
        <td>${thanhtien.toLocaleString()}</td>
        <td>${vitri}</td>
        <td></td>
        <td></td>
      `;

      // Chọn dòng theo MÃ (không theo size nữa) – xóa = xóa cả mã
      if (typeof window.setMaspspDangChon === "function") {
        tr.addEventListener("click", () => {
          window.setMaspspDangChon({ masp: row.masp, size: null });
          // highlight đơn giản
          document.querySelectorAll("#bangketqua tbody tr").forEach(r => {
            r.style.backgroundColor = r === tr ? "#e6f3ff" : "";
          });
        });
      }

      tbody.appendChild(tr);
    });
  }


  function afterRender({ bangKetQua }) {
    const path = (window.location.pathname || "").toLowerCase();

    // ===== DANH SÁCH TRANG ĐƯỢC ÁP DỤNG ADAPTER =====
    const allowedPages = [
      "ccn1v2",
      "ccn2v1",
      "banlemtcs1",
      "nhapmoimtcs1",
      "nhaptamcs1",
      "ccn2v1cs1",
      "nhapmoimtcs2",
      "nhaptamcs2",
      "ccn2v1cs2"
    ];

    const match = allowedPages.some(p => path.includes(p));
    if (!match) return;     // ❌ KHÔNG có trong danh sách → bỏ qua

    try {
      renderGroupedTable(bangKetQua);
    } catch (err) {
      console.error("[CCN Adapter] Lỗi renderGroupedTable:", err);
    }
  }


  // Hàm public để trang CCN gọi kích hoạt adapter
  window.initCCNAdapter = function () {
    window.ccnAfterRenderAdapter = afterRender;

    // Nếu đã có dữ liệu sẵn (prefill) thì gom luôn 1 lần
    if (window.bangKetQua && Object.keys(window.bangKetQua).length) {
      afterRender({ bangKetQua: window.bangKetQua });
    }
  };
})();
