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

      let tongSL = 0;
      const parts = [];

      sizes.forEach((sz, idx) => {
        const sl = parseInt(counts[idx] || 0, 10) || 0;
        if (!sz && !sl) return;
        tongSL += sl;
        parts.push(`${sz}/${sl}`);
      });

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
    // Chỉ chạy ở trang CCN (ccn1v2 / ccn2v1...), tránh ảnh hưởng trang khác
    const path = (window.location.pathname || "").toLowerCase();
    if (!path.includes("ccn1v2") && !path.includes("ccn2v1")) return;

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
