// HOAN TUYET - nhaptamBangKetQuaAdapter.js V1
// Chỉ dành cho nhaptamcs1 / nhaptamcs2.
// Mục tiêu:
// - Trang bán giữ LINE MODEL mới.
// - Trang nhập tạm luôn quy về LEGACY GROUPED MODEL:
//     bangKetQua[MASP] = { masp, sizes:[], soluongs:[], ... }
// - Không parse ngược chuỗi hiển thị "39/3/40/3..." từ DOM.
// - Mọi thao tác Lưu / Kiểm tra / Gợi ý chuyển kho đọc state đã gom chuẩn.

(function () {
  "use strict";

  const U = v => String(v ?? "").trim().toUpperCase();

  function isNhapTamPage() {
    const p = String(location.pathname || "").toLowerCase();
    return p.includes("nhaptamcs1") || p.includes("nhaptamcs2");
  }

  function getVitriTheoKho(masp) {
    const sp = window.sanPhamData?.[masp] || window.sanPhamData?.[U(masp)] || null;
    const cs = String(
      document.getElementById("diadiem")?.value ||
      localStorage.getItem("diadiem") || ""
    ).toLowerCase();

    if (!sp) return "";
    if (cs === "cs1") return sp.vitrikho1 || "";
    if (cs === "cs2") return sp.vitrikho2 || "";
    return sp.vitrikho1 || sp.vitrikho2 || sp.vitrikho3 || "";
  }

  function parseMoney(v) {
    const s = String(v ?? "").trim();
    if (!s) return 0;
    const neg = s.startsWith("-");
    const digits = s.replace(/[^\d]/g, "");
    const n = Number(digits || 0);
    return neg ? -n : n;
  }

  function aggregateBang(rawBang) {
    const grouped = {};

    Object.values(rawBang || {}).forEach(item => {
      const masp = U(item?.masp);
      if (!masp) return;

      if (!grouped[masp]) {
        grouped[masp] = {
          masp,
          tensp: item?.tensp || window.sanPhamData?.[masp]?.tensp || "",
          dvt: item?.dvt || window.sanPhamData?.[masp]?.dvt || "sp",
          gia: Number(item?.gia ?? window.sanPhamData?.[masp]?.gianhap ?? 0) || 0,
          km: Number(item?.km || 0) || 0,
          sizes: [],
          soluongs: []
        };
      }

      const g = grouped[masp];
      if (!g.tensp && item?.tensp) g.tensp = item.tensp;
      if ((!g.dvt || g.dvt === "sp") && item?.dvt) g.dvt = item.dvt;
      if (!g.gia && Number(item?.gia || 0)) g.gia = Number(item.gia);

      const sizes = Array.isArray(item?.sizes) ? item.sizes : [];
      const sls = Array.isArray(item?.soluongs) ? item.soluongs : [];

      sizes.forEach((rawSize, i) => {
        const size = String(rawSize ?? "").trim() || "0";
        const sl = Number(sls[i] || 0);
        if (!sl) return;

        const idx = g.sizes.findIndex(x => String(x) === size);
        if (idx >= 0) {
          g.soluongs[idx] = Number(g.soluongs[idx] || 0) + sl;
        } else {
          g.sizes.push(size);
          g.soluongs.push(sl);
        }
      });
    });

    // sort size numeric/text stable
    Object.values(grouped).forEach(g => {
      const pairs = g.sizes.map((s, i) => ({ s, q: Number(g.soluongs[i] || 0) }));
      pairs.sort((a, b) => {
        const na = Number(a.s), nb = Number(b.s);
        const aa = Number.isFinite(na), bb = Number.isFinite(nb);
        if (aa && bb) return na - nb;
        if (aa) return -1;
        if (bb) return 1;
        return String(a.s).localeCompare(String(b.s), "vi");
      });
      g.sizes = pairs.map(x => x.s);
      g.soluongs = pairs.map(x => x.q);
      g.tong = g.soluongs.reduce((s, q) => s + Number(q || 0), 0);
    });

    return grouped;
  }

  function getGroupedBangKetQua() {
    const current = window.bangKetQua || {};
    const grouped = aggregateBang(current);
    window.bangKetQua = grouped;
    return grouped;
  }

  function renderGroupedTable(rawBang) {
    if (!isNhapTamPage()) return;

    const tbody = document.querySelector("#bangketqua tbody");
    if (!tbody) return;

    const grouped = aggregateBang(rawBang || window.bangKetQua || {});
    window.bangKetQua = grouped;

    tbody.innerHTML = "";

    Object.values(grouped).forEach(item => {
      const pairs = item.sizes
        .map((sz, i) => ({ size: String(sz), sl: Number(item.soluongs[i] || 0) }))
        .filter(x => x.sl > 0);

      const sizeText = pairs.map(x => `${x.size}/${x.sl}`).join(" / ");
      const tong = pairs.reduce((s, x) => s + x.sl, 0);
      const gia = Number(item.gia || 0);
      const km = Number(item.km || 0);
      const thanhtien = (gia - km) * tong;
      const vitri = getVitriTheoKho(item.masp);

      const tr = document.createElement("tr");
      tr.dataset.masp = item.masp;
      tr.innerHTML = `
        <td>${item.masp}</td>
        <td>${item.tensp || ""}</td>
        <td>${sizeText}</td>
        <td>${tong}</td>
        <td>${item.dvt || ""}</td>
        <td>${gia.toLocaleString("vi-VN")}</td>
        <td>${km.toLocaleString("vi-VN")}</td>
        <td>${thanhtien.toLocaleString("vi-VN")}</td>
        <td>${vitri}</td>
        <td></td>
        <td></td>
      `;
      tbody.appendChild(tr);
    });

    if (typeof window.capNhatThongTinTong === "function") {
      try { window.capNhatThongTinTong(grouped); } catch (_) {}
    }
  }

  // Rất quan trọng:
  // thay global parser của LINE MODEL bằng parser state-grouped riêng cho nhập tạm.
  // Không đọc lại DOM visual vì cột size visual là "39/3 / 40/3 / 41/2".
  window.capNhatBangKetQuaTuDOM = function () {
    return getGroupedBangKetQua();
  };

  window.getNhapTamBangKetQuaGrouped = getGroupedBangKetQua;

  window.initNhapTamBangKetQuaAdapter = function () {
    if (!isNhapTamPage()) return;

    window.ccnAfterRenderAdapter = function ({ bangKetQua }) {
      renderGroupedTable(bangKetQua);
    };

    // Nếu đã có state thì gom + render ngay.
    if (window.bangKetQua && Object.keys(window.bangKetQua).length) {
      renderGroupedTable(window.bangKetQua);
    }
  };
})();
