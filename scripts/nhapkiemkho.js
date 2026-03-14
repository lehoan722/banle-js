// scripts/nhapkiemkho.js
(function () {
  "use strict";

  const CFG = window.KIEM_NHAP_CONFIG || {
    pageId: "kiemnhap_cs1",
    fromBranch: "cs2",
    toBranch: "cs1",
    soPhieuPrefix: "kiemnhap_",
    title: "KIỂM NHẬP KHO"
  };

  // =========================
  // STATE
  // =========================
  window.kiemNhapState = {
    nhap: {},      // { MASP: { masp, size, sl } }
    xuat: {},      // { MASP: { masp, size, sl } }
    ketQua: {},    // { MASP: { trangthai, chitiet } }
    dsHoaDonNguon: []
  };

  // =========================
  // HELPERS
  // =========================
  function byId(id) {
    return document.getElementById(id);
  }

  function normalizeMasp(v) {
    return String(v || "").trim().toUpperCase();
  }

  function normalizeSize(v) {
    return String(v || "").trim();
  }

  function makeKey(masp, size) {
    return `${normalizeMasp(masp)}@@${normalizeSize(size)}`;
  }

  function normalizeNumber(v) {
    const raw = String(v ?? "")
      .replace(/\./g, "")
      .replace(/,/g, ".")
      .replace(/[^\d.-]/g, "");
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getState() {
    return window.kiemNhapState;
  }

  function taoSoPhieuMoi() {
    const now = new Date();
    const stamp =
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0") +
      "_" +
      String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0") +
      String(now.getSeconds()).padStart(2, "0");

    return `${CFG.soPhieuPrefix}${stamp}`;
  }

  function updateTitle() {
    document.title = CFG.title || document.title;
  }

  function setDefaultBranchInfo() {
    const diadiem = byId("diadiem");
    if (diadiem && !diadiem.value) diadiem.value = CFG.toBranch || "";

    const hdState = byId("hd_state");
    if (hdState) {
      hdState.value = "moi";
      hdState.setAttribute("data-state", "moi");
    }

    const ngay = byId("ngay");
    if (ngay && !ngay.value) {
      const d = new Date();
      ngay.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    const gio = byId("gio");
    if (gio) {
      const tick = () => {
        const d = new Date();
        gio.value = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      };
      tick();
      setInterval(tick, 1000 * 15);
    }
  }

  // =========================
  // RENDER
  // =========================
  function groupByMasp(mapObj) {
    const out = {};

    for (const key of Object.keys(mapObj || {})) {
      const row = mapObj[key];
      if (!row || !row.masp) continue;

      const masp = normalizeMasp(row.masp);
      const size = normalizeSize(row.size);
      const sl = normalizeNumber(row.sl);

      if (!out[masp]) {
        out[masp] = {
          masp,
          items: []
        };
      }

      out[masp].items.push({
        key,
        size,
        sl
      });
    }

    // sắp xếp size tăng dần cho dễ nhìn
    Object.values(out).forEach(group => {
      group.items.sort((a, b) => {
        const na = Number(a.size);
        const nb = Number(b.size);

        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return String(a.size).localeCompare(String(b.size), "vi");
      });
    });

    return out;
  }

  function formatSizeSl(items) {
    if (!Array.isArray(items) || items.length === 0) return "";
    return items.map(x => `${x.size}/${x.sl}`).join("\n");
  }

  function tongSoLuong(items) {
    if (!Array.isArray(items)) return 0;
    return items.reduce((sum, x) => sum + normalizeNumber(x.sl), 0);
  }

  function buildKetQuaTheoMasp(nhapGroup, xuatGroup, ketQuaMap) {
    const allSizeKeys = new Set([
      ...((nhapGroup?.items || []).map(x => x.key)),
      ...((xuatGroup?.items || []).map(x => x.key))
    ]);

    let tongThieu = 0;
    let tongThua = 0;
    let hasOk = false;

    for (const key of allSizeKeys) {
      const kq = ketQuaMap[key];
      if (!kq) continue;

      const diff = normalizeNumber(kq.chitiet || 0);

      if (kq.trangthai === "THIEU") tongThieu += diff;
      else if (kq.trangthai === "THUA") tongThua += diff;
      else if (kq.trangthai === "OK") hasOk = true;
    }

    if (tongThieu > 0 && tongThua === 0) {
      return { trangthai: "THIEU", chitiet: String(tongThieu) };
    }

    if (tongThua > 0 && tongThieu === 0) {
      return { trangthai: "THUA", chitiet: String(tongThua) };
    }

    if (tongThieu === 0 && tongThua === 0 && hasOk) {
      return { trangthai: "OK", chitiet: "" };
    }

    if (tongThieu > 0 && tongThua > 0) {
      return {
        trangthai: "LECH",
        chitiet: `Thieu ${tongThieu} / Thua ${tongThua}`
      };
    }

    return { trangthai: "", chitiet: "" };
  }

  function renderBangKetQua() {
    const tbody = document.querySelector("#bangketqua tbody");
    if (!tbody) return;

    const state = getState();
    const nhapMap = state.nhap || {};
    const xuatMap = state.xuat || {};
    const ketQuaMap = state.ketQua || {};

    const nhapGroupMap = groupByMasp(nhapMap);
    const xuatGroupMap = groupByMasp(xuatMap);

    const allMasps = Array.from(
      new Set([
        ...Object.keys(nhapGroupMap),
        ...Object.keys(xuatGroupMap)
      ])
    ).sort();

    tbody.innerHTML = "";

    for (const masp of allMasps) {
      const nhapGroup = nhapGroupMap[masp];
      const xuatGroup = xuatGroupMap[masp];

      const nhapText = formatSizeSl(nhapGroup?.items || []);
      const xuatText = formatSizeSl(xuatGroup?.items || []);

      const kqTong = buildKetQuaTheoMasp(nhapGroup, xuatGroup, ketQuaMap);

      const tr = document.createElement("tr");
      tr.innerHTML = `
      <td>${escapeHtml(masp)}</td>
      <td style="white-space: pre-line; text-align:left;">${escapeHtml(nhapText)}</td>
      <td>${tongSoLuong(nhapGroup?.items || []) || ""}</td>

      <td>${escapeHtml(masp)}</td>
      <td style="white-space: pre-line; text-align:left;">${escapeHtml(xuatText)}</td>
      <td>${tongSoLuong(xuatGroup?.items || []) || ""}</td>

      <td>${escapeHtml(kqTong.trangthai || "")}</td>
      <td>${escapeHtml(kqTong.chitiet || "")}</td>
    `;
      tbody.appendChild(tr);
    }
  }

  // Expose để HTML cũ không lỗi nếu còn gọi
  window.renderBangKetQua = renderBangKetQua;
  window.capNhatTongTien = function () { return; };

  // =========================
  // NHẬP BÊN TRÁI
  // =========================
  function themDongNhapBenTrai() {
    const maspEl = byId("masp");
    const sizeEl = byId("size");
    const slEl = byId("soluong");

    if (!maspEl || !slEl) return;

    const masp = normalizeMasp(maspEl.value);
    const size = normalizeSize(sizeEl?.value);
    const sl = normalizeNumber(slEl.value || 1);

    if (!masp) {
      alert("Vui lòng nhập mã sản phẩm.");
      maspEl.focus();
      return;
    }

    if (!size) {
      alert("Vui lòng nhập size.");
      if (sizeEl) sizeEl.focus();
      return;
    }

    if (sl <= 0) {
      alert("Số lượng phải lớn hơn 0.");
      slEl.focus();
      return;
    }

    const key = makeKey(masp, size);
    const state = getState();

    if (!state.nhap[key]) {
      state.nhap[key] = {
        masp,
        size,
        sl
      };
    } else {
      state.nhap[key].sl = normalizeNumber(state.nhap[key].sl) + sl;
    }

    delete state.ketQua[key];

    renderBangKetQua();

    maspEl.value = "";
    if (sizeEl) sizeEl.value = "";
    slEl.value = "1";
    maspEl.focus();
  }

  function bindInputEvents() {
    const maspEl = byId("masp");
    const sizeEl = byId("size");
    const slEl = byId("soluong");

    [maspEl, sizeEl, slEl].forEach((el) => {
      if (!el) return;
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          themDongNhapBenTrai();
        }
      });
    });

    document.addEventListener("input", (e) => {
      const target = e.target;
      if (!target) return;

      const state = getState();

      if (target.classList.contains("cell-size-nhap")) {
        const key = target.dataset.key;
        if (key && state.nhap[key]) {
          state.nhap[key].size = normalizeSize(target.innerText);
        }
      }

      if (target.classList.contains("cell-sl-nhap")) {
        const key = target.dataset.key;
        if (key && state.nhap[key]) {
          state.nhap[key].sl = normalizeNumber(target.innerText);
        }
      }
    });
  }

  // =========================
  // RESET PHIẾU
  // =========================
  function resetPhieu() {
    window.kiemNhapState = {
      nhap: {},
      xuat: {},
      ketQua: {},
      dsHoaDonNguon: []
    };

    const maspEl = byId("masp");
    const sizeEl = byId("size");
    const slEl = byId("soluong");
    const sohdEl = byId("sohd");
    const ghichuEl = byId("ghichu_top");

    if (maspEl) maspEl.value = "";
    if (sizeEl) sizeEl.value = "";
    if (slEl) slEl.value = "1";
    if (sohdEl) sohdEl.value = taoSoPhieuMoi();
    if (ghichuEl) ghichuEl.value = "";

    const hdState = byId("hd_state");
    if (hdState) {
      hdState.value = "moi";
      hdState.setAttribute("data-state", "moi");
    }

    renderBangKetQua();

    if (maspEl) maspEl.focus();
  }

  // =========================
  // KIỂM TRA
  // Bản đầu: so tổng SL theo mã
  // =========================
  function kiemTraPhieu() {
    const state = getState();
    const nhapMap = state.nhap || {};
    const xuatMap = state.xuat || {};
    const ketQua = {};

    const allKeys = Array.from(
      new Set([...Object.keys(nhapMap), ...Object.keys(xuatMap)])
    );

    for (const key of allKeys) {
      const nhap = nhapMap[key];
      const xuat = xuatMap[key];

      const slNhap = normalizeNumber(nhap?.sl || 0);
      const slXuat = normalizeNumber(xuat?.sl || 0);

      if (slNhap === slXuat) {
        ketQua[key] = { trangthai: "OK", chitiet: "" };
      } else if (slNhap < slXuat) {
        ketQua[key] = { trangthai: "THIEU", chitiet: String(slXuat - slNhap) };
      } else {
        ketQua[key] = { trangthai: "THUA", chitiet: String(slNhap - slXuat) };
      }
    }

    state.ketQua = ketQua;
    renderBangKetQua();
  }

  // =========================
  // NẠP HÓA ĐƠN NGUỒN
  // Bản đầu: chưa query thật, chỉ placeholder
  // =========================
  async function napHoaDonNguonPlaceholder() {
  try {
    if (!window.supabase) {
      alert("Không tìm thấy kết nối Supabase.");
      return;
    }

    const prefixNguon = CFG.fromBranch === "cs2" ? "xcncs2_" : "xcncs1_";

    const { data: dsHd, error: errHd } = await window.supabase
      .from("hoadon_banle")
      .select("sohd, ngay, created_at, diadiem")
      .ilike("sohd", `${prefixNguon}%`)
      .order("created_at", { ascending: false })
      .limit(30);

    if (errHd) {
      console.error("[nhapkiemkho] load ds hoa don nguon error:", errHd);
      alert("Lỗi khi lấy danh sách hóa đơn nguồn.");
      return;
    }

    if (!dsHd || dsHd.length === 0) {
      alert("Không tìm thấy hóa đơn nguồn phù hợp.");
      return;
    }

    const dsSoHdChon = await moPopupChonHoaDonNguon(dsHd);
    if (!dsSoHdChon || dsSoHdChon.length === 0) return;

    const { data: ctRows, error: errCt } = await window.supabase
      .from("ct_hoadon_banle")
      .select("sohd, masp, size, soluong")
      .in("sohd", dsSoHdChon)
      .order("id", { ascending: true });

    if (errCt) {
      console.error("[nhapkiemkho] load ct_hoadon_banle error:", errCt);
      alert("Lỗi khi lấy chi tiết hóa đơn nguồn.");
      return;
    }

    if (!ctRows || ctRows.length === 0) {
      alert("Hóa đơn nguồn không có chi tiết.");
      return;
    }

    const xuatMap = {};

    for (const row of ctRows) {
      const masp = normalizeMasp(row.masp);
      const size = normalizeSize(row.size);
      const sl = normalizeNumber(row.soluong);

      if (!masp || !size || sl <= 0) continue;

      const key = makeKey(masp, size);

      if (!xuatMap[key]) {
        xuatMap[key] = {
          masp,
          size,
          sl
        };
      } else {
        xuatMap[key].sl = normalizeNumber(xuatMap[key].sl) + sl;
      }
    }

    const state = getState();
    state.dsHoaDonNguon = dsSoHdChon;

    const ghichuEl = byId("ghichu_top");
    if (ghichuEl) ghichuEl.value = dsSoHdChon.join(" ; ");

    window.NhapKiemKho.setXuatData(xuatMap);

    alert(`Đã nạp ${dsSoHdChon.length} hóa đơn nguồn.`);
  } catch (err) {
    console.error("[nhapkiemkho] napHoaDonNguonPlaceholder exception:", err);
    alert("Có lỗi khi nạp hóa đơn nguồn.");
  }
}

  function moPopupChonHoaDonNguon(dsHd) {
  return new Promise((resolve) => {
    const popup = byId("popupChonHoaDonNguon");
    const box = byId("dsHoaDonNguonPopup");
    const btnDong = byId("btnDongPopupHoaDonNguon");
    const btnOk = byId("btnXacNhanHoaDonNguon");

    if (!popup || !box || !btnDong || !btnOk) {
      resolve(null);
      return;
    }

    box.innerHTML = "";

    dsHd.forEach((hd, index) => {
      const sohd = String(hd.sohd || "").trim();
      const ngay = hd.ngay || "";
      const diadiem = hd.diadiem || "";

      const row = document.createElement("label");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.padding = "6px 4px";
      row.style.borderBottom = "1px solid #eee";
      row.style.cursor = "pointer";

      row.innerHTML = `
        <input type="checkbox" class="chk-hd-nguon" value="${escapeHtml(sohd)}" ${index === 0 ? "checked" : ""}>
        <span>${escapeHtml(sohd)} | ${escapeHtml(ngay)} | ${escapeHtml(diadiem)}</span>
      `;
      box.appendChild(row);
    });

    popup.style.display = "block";

    const closePopup = (result) => {
      popup.style.display = "none";
      btnDong.onclick = null;
      btnOk.onclick = null;
      resolve(result);
    };

    btnDong.onclick = () => closePopup(null);

    btnOk.onclick = () => {
      const checked = Array.from(
        box.querySelectorAll(".chk-hd-nguon:checked")
      ).map(x => x.value);

      if (!checked.length) {
        alert("Vui lòng chọn ít nhất 1 hóa đơn.");
        return;
      }

      closePopup(checked);
    };
  });
}

  // =========================
  // BUTTONS
  // =========================
  function bindButtons() {
    const btnThem = byId("them");
    if (btnThem) {
      btnThem.addEventListener("click", (e) => {
        e.preventDefault();
        resetPhieu();
      });
    }

    const btnNap1 = byId("btnNapHoaDonCCN");
    const btnNap2 = byId("btnNapHoaDonCCN_footer");
    [btnNap1, btnNap2].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        napHoaDonNguonPlaceholder();
      });
    });

    const btnKiem1 = byId("btnKiemTraPhieu");
    const btnKiem2 = byId("btnKiemTraPhieu_footer");
    [btnKiem1, btnKiem2].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        kiemTraPhieu();
      });
    });
  }

  // =========================
  // API công khai
  // =========================
  window.NhapKiemKho = {
    resetPhieu,
    renderBangKetQua,
    kiemTraPhieu,
    themDongNhapBenTrai,
    getState,
    setXuatData(dataMap) {
      window.kiemNhapState.xuat = dataMap || {};
      renderBangKetQua();
    }
  };

  // =========================
  // INIT
  // =========================
  function init() {
    updateTitle();
    setDefaultBranchInfo();
    bindInputEvents();
    bindButtons();
    resetPhieu();
    console.log("[nhapkiemkho] init OK", CFG);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
