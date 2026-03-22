import {
  byId,
  getState,
  CFG,
  normalizeMasp,
  normalizeSize,
  normalizeNumber,
  makeKey,
  splitKey,
  formatDateTimeVN,
  escapeHtml,
  phatAmThanhLoi,
  phatAmThanhThanhCong,
  capNhatThongKeDauTrang,
  buildOrderedMasps
} from "./kiem_nhapkho.core.js";

import {
  renderBangKetQua,
  setXuatData,
  parseClipboardToNhapMap
} from "./kiem_nhapkho.ui.js";

function getSupabase() {
  return window.supabase || window._supabase || null;
}

async function supabaseSelect(table, queryBuilder) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Chưa khởi tạo Supabase.");
  }
  let q = supabase.from(table).select("*");
  if (typeof queryBuilder === "function") {
    q = queryBuilder(q) || q;
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function supabaseInsert(table, rows) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Chưa khởi tạo Supabase.");
  }
  const { data, error } = await supabase.from(table).insert(rows).select();
  if (error) throw error;
  return data || [];
}

async function supabaseUpsert(table, rows, options = {}) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Chưa khởi tạo Supabase.");
  }
  const { data, error } = await supabase.from(table).upsert(rows, options).select();
  if (error) throw error;
  return data || [];
}

async function supabaseRpc(fnName, params = {}) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Chưa khởi tạo Supabase.");
  }
  const { data, error } = await supabase.rpc(fnName, params);
  if (error) throw error;
  return data;
}

export async function kiemTraMaspTrongDanhMuc(masp) {
  masp = normalizeMasp(masp);
  if (!masp) return false;

  try {
    const rows = await supabaseSelect("dmhanghoa", q =>
      q.eq("masp", masp).limit(1)
    );
    return rows.length > 0;
  } catch (err) {
    console.error("kiemTraMaspTrongDanhMuc error:", err);
    return false;
  }
}

export async function baoLoiNeuMaspKhongCoTrongDanhMuc(masp) {
  const ok = await kiemTraMaspTrongDanhMuc(masp);
  if (!ok) {
    phatAmThanhLoi();
    alert(`Mã sản phẩm không tồn tại trong danh mục: ${masp}`);
    const maspEl = byId("masp");
    if (maspEl) {
      maspEl.focus();
      setTimeout(() => {
        try {
          maspEl.select();
        } catch (err) {}
      }, 0);
    }
    return false;
  }
  return true;
}

export async function layMapHoaDonDaKiem() {
  try {
    const rows = await supabaseSelect("kiem_nhap_kho", q =>
      q.order("created_at", { ascending: false }).limit(500)
    );

    const map = new Map();

    (rows || []).forEach(r => {
      const sohdccn = String(r.sohdccn || "").trim();
      if (!sohdccn) return;

      const list = sohdccn
        .split(";")
        .map(x => String(x || "").trim())
        .filter(Boolean);

      list.forEach(sohd => {
        if (!map.has(sohd)) {
          map.set(sohd, {
            sohd,
            nhanvienkiem: r.nhanvienkiem || "",
            created_at: r.created_at || "",
            sophieu: r.sophieu || ""
          });
        }
      });
    });

    return map;
  } catch (err) {
    console.error("layMapHoaDonDaKiem error:", err);
    return new Map();
  }
}

async function layHoaDonNguonTuBangHoaDon(limit = 50) {
  const state = getState();
  const branch = state.branchInfo || {};

  const diaDiemNguon = branch.diaDiemXuat || branch.diaDiemNguon || "";
  const prefixNguon = branch.prefixXuat || branch.prefixNguon || "";

  if (!diaDiemNguon && !prefixNguon) return [];

  const rows = await supabaseSelect("hoadon_banle", q => {
    let qq = q.order("created_at", { ascending: false }).limit(limit);
    if (diaDiemNguon) qq = qq.eq("diadiem", diaDiemNguon);
    if (prefixNguon) qq = qq.ilike("sohd", `${prefixNguon}%`);
    return qq;
  });

  return rows || [];
}

export async function layHoaDonNguonUngVienTheoMasp(dsMasp = []) {
  const maspList = Array.from(
    new Set((dsMasp || []).map(normalizeMasp).filter(Boolean))
  );
  if (!maspList.length) return [];

  const state = getState();
  const branch = state.branchInfo || {};

  const diaDiemNguon = branch.diaDiemXuat || branch.diaDiemNguon || "";
  const prefixNguon = branch.prefixXuat || branch.prefixNguon || "";

  try {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Chưa khởi tạo Supabase.");

    let q = supabase
      .from("ct_hoadon_banle")
      .select("sohd, masp, size, soluong, created_at, diadiem")
      .in("masp", maspList)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (diaDiemNguon) q = q.eq("diadiem", diaDiemNguon);

    const { data, error } = await q;
    if (error) throw error;

    const details = (data || []).filter(r => {
      if (!prefixNguon) return true;
      return String(r.sohd || "").toLowerCase().startsWith(prefixNguon.toLowerCase());
    });

    const mapBySohd = new Map();

    details.forEach(r => {
      const sohd = String(r.sohd || "").trim();
      if (!sohd) return;

      if (!mapBySohd.has(sohd)) {
        mapBySohd.set(sohd, {
          sohd,
          created_at: r.created_at || "",
          diadiem: r.diadiem || "",
          items: []
        });
      }

      mapBySohd.get(sohd).items.push({
        masp: normalizeMasp(r.masp),
        size: normalizeSize(r.size),
        sl: normalizeNumber(r.soluong)
      });
    });

    return Array.from(mapBySohd.values()).sort((a, b) => {
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
  } catch (err) {
    console.error("layHoaDonNguonUngVienTheoMasp error:", err);
    return [];
  }
}

export function tinhDeXuatHoaDonTheoMasp(dsMasp = [], dsHoaDon = []) {
  const maspSet = new Set((dsMasp || []).map(normalizeMasp).filter(Boolean));

  return (dsHoaDon || []).map(hd => {
    const matchCount = (hd.items || []).reduce((sum, item) => {
      return sum + (maspSet.has(normalizeMasp(item.masp)) ? 1 : 0);
    }, 0);

    return {
      ...hd,
      matchCount
    };
  }).sort((a, b) => {
    if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
}

function ensurePopupHoaDonNguon() {
  let popup = byId("popup_chon_hoadon_nguon");
  if (popup) return popup;

  popup = document.createElement("div");
  popup.id = "popup_chon_hoadon_nguon";
  popup.style.position = "fixed";
  popup.style.left = "50%";
  popup.style.top = "50%";
  popup.style.transform = "translate(-50%, -50%)";
  popup.style.width = "600px";
  popup.style.maxWidth = "95vw";
  popup.style.maxHeight = "80vh";
  popup.style.overflow = "auto";
  popup.style.background = "#fff";
  popup.style.border = "1px solid #888";
  popup.style.boxShadow = "0 6px 24px rgba(0,0,0,.2)";
  popup.style.padding = "12px";
  popup.style.zIndex = "99999";
  popup.style.display = "none";

  document.body.appendChild(popup);
  return popup;
}

function hidePopupHoaDonNguon() {
  const popup = byId("popup_chon_hoadon_nguon");
  if (popup) popup.style.display = "none";
}

export async function moPopupChonHoaDonNguon(dsHoaDon = []) {
  const popup = ensurePopupHoaDonNguon();
  const mapDaKiem = await layMapHoaDonDaKiem();

  const rowsHtml = (dsHoaDon || []).map((hd, idx) => {
    const sohd = String(hd.sohd || "").trim();
    const daKiem = mapDaKiem.get(sohd);
    const statusHtml = daKiem
      ? `<span style="color:#d00;font-weight:700">[ĐÃ KIỂM]</span> <span>${escapeHtml(daKiem.nhanvienkiem || "")}</span>`
      : `<span style="color:#080;font-weight:700">[CHƯA KIỂM]</span>`;

    return `
      <label style="display:flex;gap:8px;align-items:flex-start;padding:6px 4px;border-bottom:1px solid #eee;">
        <input type="checkbox" class="chk-hdnguon" value="${escapeHtml(sohd)}" ${idx === 0 ? "checked" : ""}>
        <div style="flex:1">
          <div><b>${escapeHtml(sohd)}</b> | ${escapeHtml(formatDateTimeVN(hd.created_at || ""))} | ${escapeHtml(hd.diadiem || "")} ${statusHtml}</div>
          <div style="font-size:12px;color:#555;">Khớp ${normalizeNumber(hd.matchCount || 0)} mã</div>
        </div>
      </label>
    `;
  }).join("");

  popup.innerHTML = `
    <div style="font-size:22px;font-weight:700;margin-bottom:10px;">Chọn hóa đơn nguồn</div>
    <div style="border:1px solid #ddd;max-height:55vh;overflow:auto;margin-bottom:10px;">
      ${rowsHtml || '<div style="padding:12px;">Không có hóa đơn phù hợp.</div>'}
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;">
      <button id="btn_hdn_huy">Hủy</button>
      <button id="btn_hdn_nap">Nạp hóa đơn đã chọn</button>
    </div>
  `;

  popup.style.display = "block";

  byId("btn_hdn_huy")?.addEventListener("click", () => {
    hidePopupHoaDonNguon();
  });

  byId("btn_hdn_nap")?.addEventListener("click", async () => {
    const selected = Array.from(popup.querySelectorAll(".chk-hdnguon:checked"))
      .map(x => String(x.value || "").trim())
      .filter(Boolean);

    if (!selected.length) {
      alert("Chưa chọn hóa đơn nguồn.");
      return;
    }

    hidePopupHoaDonNguon();
    await napHoaDonNguonTheoDanhSachSoHd(selected);
  });
}

export async function moPopupChonHoaDonNguonTheoMasp() {
  const state = getState();
  const dsMasp = Array.from(new Set(Object.values(state.nhap || {}).map(r => normalizeMasp(r?.masp)).filter(Boolean)));

  if (!dsMasp.length) {
    alert("Chưa có dữ liệu nhập để tìm hóa đơn nguồn.");
    return;
  }

  const dsHoaDon = await layHoaDonNguonUngVienTheoMasp(dsMasp);
  const deXuat = tinhDeXuatHoaDonTheoMasp(dsMasp, dsHoaDon);
  await moPopupChonHoaDonNguon(deXuat);
}

async function napHoaDonNguonTheoDanhSachSoHd(dsSoHd = []) {
  const list = Array.from(new Set((dsSoHd || []).map(x => String(x || "").trim()).filter(Boolean)));
  if (!list.length) return;

  try {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Chưa khởi tạo Supabase.");

    const { data, error } = await supabase
      .from("ct_hoadon_banle")
      .select("sohd, masp, size, soluong, created_at, diadiem")
      .in("sohd", list)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const rows = (data || []).map(r => ({
      sohd: r.sohd,
      masp: normalizeMasp(r.masp),
      size: normalizeSize(r.size),
      sl: normalizeNumber(r.soluong),
      created_at: r.created_at,
      diadiem: r.diadiem
    }));

    setXuatData(rows);

    const state = getState();
    state.dsHoaDonNguon = list;

    const sohdEl = byId("sohdccn");
    if (sohdEl) {
      sohdEl.value = list.join("; ");
    }

    capNhatThongKeDauTrang();
    phatAmThanhThanhCong();
  } catch (err) {
    console.error("napHoaDonNguonTheoDanhSachSoHd error:", err);
    phatAmThanhLoi();
    alert(`Không nạp được hóa đơn nguồn.\n${err.message || err}`);
  }
}

export async function napHoaDonNguonTheoMasp() {
  await moPopupChonHoaDonNguonTheoMasp();
}

export async function napHoaDonNguonPlaceholder() {
  try {
    const dsHoaDon = await layHoaDonNguonTuBangHoaDon(30);
    await moPopupChonHoaDonNguon(dsHoaDon);
  } catch (err) {
    console.error("napHoaDonNguonPlaceholder error:", err);
  }
}

export async function taoSoPhieuMoi() {
  const state = getState();
  const branch = state.branchInfo || {};

  const prefix = branch.prefixPhieu || "kiemnhap";
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  const so = `${prefix}_${y}${m}${dd}_${hh}${mm}${ss}`;

  const sophieuEl = byId("sophieu");
  if (sophieuEl) sophieuEl.value = so;

  state.currentSoPhieu = so;
  return so;
}

export function resetPhieu() {
  const state = getState();

  state.nhap = {};
  state.xuat = {};
  state.ketQua = {};
  state.nhapOrder = [];
  state.xuatOrder = [];
  state.selectedMasp = "";
  state.dsHoaDonNguon = [];

  const maspEl = byId("masp");
  const sizeEl = byId("size");
  const slEl = byId("soluong");
  const sohdEl = byId("sohdccn");

  if (maspEl) maspEl.value = "";
  if (sizeEl) sizeEl.value = "";
  if (slEl) slEl.value = "1";
  if (sohdEl) sohdEl.value = "";

  taoSoPhieuMoi();
  renderBangKetQua();
}

export function kiemTraPhieu() {
  renderBangKetQua();
}

export function xayDungDuLieuTongVaChiTietLech() {
  const state = getState();
  const rows = buildOrderedMasps(
    state,
    {},
    {}
  );

  const ketquaRows = [];
  const chiTietRows = [];

  Object.keys(state.nhap || {}).forEach(key => {
    const row = state.nhap[key];
    if (!row) return;

    chiTietRows.push({
      sophieu: state.currentSoPhieu || "",
      masp: normalizeMasp(row.masp),
      size: normalizeSize(row.size),
      sl_nhap: normalizeNumber(row.sl)
    });
  });

  Object.keys(state.xuat || {}).forEach(key => {
    const row = state.xuat[key];
    if (!row) return;

    const existed = chiTietRows.find(x =>
      normalizeMasp(x.masp) === normalizeMasp(row.masp) &&
      normalizeSize(x.size) === normalizeSize(row.size)
    );

    if (existed) {
      existed.sl_xuat = normalizeNumber(row.sl);
    } else {
      chiTietRows.push({
        sophieu: state.currentSoPhieu || "",
        masp: normalizeMasp(row.masp),
        size: normalizeSize(row.size),
        sl_nhap: 0,
        sl_xuat: normalizeNumber(row.sl)
      });
    }
  });

  return { ketquaRows, chiTietRows };
}

export function buildChiTietHoaDonRows() {
  const state = getState();

  return Object.keys(state.nhap || {}).map(key => {
    const row = state.nhap[key];
    return {
      sophieu: state.currentSoPhieu || "",
      masp: normalizeMasp(row.masp),
      size: normalizeSize(row.size),
      soluong: normalizeNumber(row.sl)
    };
  });
}

export async function luuPhieuKiemNhapKho() {
  const state = getState();

  try {
    let sophieu = String(byId("sophieu")?.value || "").trim();
    if (!sophieu) sophieu = await taoSoPhieuMoi();

    const sohdccn = String(byId("sohdccn")?.value || "").trim();
    if (!sohdccn) {
      alert("Chưa có hóa đơn nguồn.");
      return;
    }

    const nhanvienkiem = String(byId("nhanvien")?.value || state.nhanVien || "").trim();

    const tongRows = [{
      sophieu,
      sohdccn,
      nhanvienkiem,
      created_at: new Date().toISOString()
    }];

    const detailRows = buildChiTietHoaDonRows().map(r => ({
      ...r,
      sohdccn,
      nhanvienkiem,
      created_at: new Date().toISOString()
    }));

    await supabaseUpsert("kiem_nhap_kho", tongRows, { onConflict: "sophieu" });

    if (detailRows.length) {
      await supabaseUpsert("kiem_nhap_kho_ct", detailRows, { onConflict: "sophieu,masp,size" });
    }

    state.currentSoPhieu = sophieu;
    phatAmThanhThanhCong();
    alert(`Đã lưu phiếu: ${sophieu}`);
  } catch (err) {
    console.error("luuPhieuKiemNhapKho error:", err);
    phatAmThanhLoi();
    alert(`Lưu phiếu thất bại.\n${err.message || err}`);
  }
}

export async function moLaiPhieuKiemNhapCu() {
  const so = prompt("Nhập số phiếu cần mở:");
  if (!so) return;

  try {
    const tong = await supabaseSelect("kiem_nhap_kho", q =>
      q.eq("sophieu", so).limit(1)
    );

    if (!tong.length) {
      alert("Không tìm thấy phiếu.");
      return;
    }

    const ct = await supabaseSelect("kiem_nhap_kho_ct", q =>
      q.eq("sophieu", so)
    );

    const state = getState();
    state.currentSoPhieu = so;
    state.nhap = {};
    state.nhapOrder = [];

    (ct || []).forEach(r => {
      const masp = normalizeMasp(r.masp);
      const size = normalizeSize(r.size);
      const sl = normalizeNumber(r.soluong);
      const key = makeKey(masp, size);

      state.nhap[key] = { masp, size, sl };
      if (!state.nhapOrder.includes(masp)) state.nhapOrder.push(masp);
    });

    const sohdEl = byId("sohdccn");
    const sophieuEl = byId("sophieu");

    if (sohdEl) sohdEl.value = tong[0].sohdccn || "";
    if (sophieuEl) sophieuEl.value = so;

    renderBangKetQua();
    phatAmThanhThanhCong();
  } catch (err) {
    console.error("moLaiPhieuKiemNhapCu error:", err);
    phatAmThanhLoi();
    alert(`Không mở được phiếu.\n${err.message || err}`);
  }
}

export function taoGhiChuPhieuChuyenTuKiemNhap(type = "thua") {
  const state = getState();
  const sophieu = state.currentSoPhieu || "";
  if (type === "thua") return `Tạo từ phiếu kiểm nhập ${sophieu} - hàng thừa`;
  return `Tạo từ phiếu kiểm nhập ${sophieu} - hàng thiếu`;
}

export function groupByMaspForTransfer(mapObj = {}) {
  const out = {};

  Object.keys(mapObj || {}).forEach(key => {
    const row = mapObj[key];
    if (!row) return;

    const masp = normalizeMasp(row.masp);
    const size = normalizeSize(row.size);
    const sl = normalizeNumber(row.sl);

    if (!masp || !size || !sl) return;

    if (!out[masp]) out[masp] = [];
    out[masp].push({ masp, size, sl });
  });

  return out;
}

export function layDanhSachHangThuaDeTaoCCN2V1() {
  const state = getState();
  const out = {};

  const allKeys = new Set([
    ...Object.keys(state.nhap || {}),
    ...Object.keys(state.xuat || {})
  ]);

  allKeys.forEach(key => {
    const n = state.nhap[key];
    const x = state.xuat[key];

    const masp = normalizeMasp(n?.masp || x?.masp);
    const size = normalizeSize(n?.size || x?.size);
    const slN = normalizeNumber(n?.sl);
    const slX = normalizeNumber(x?.sl);

    if (slN > slX) {
      out[key] = {
        masp,
        size,
        sl: slN - slX
      };
    }
  });

  return out;
}

export function layDanhSachHangThieuDeTaoCCN1V2() {
  const state = getState();
  const out = {};

  const allKeys = new Set([
    ...Object.keys(state.nhap || {}),
    ...Object.keys(state.xuat || {})
  ]);

  allKeys.forEach(key => {
    const n = state.nhap[key];
    const x = state.xuat[key];

    const masp = normalizeMasp(n?.masp || x?.masp);
    const size = normalizeSize(n?.size || x?.size);
    const slN = normalizeNumber(n?.sl);
    const slX = normalizeNumber(x?.sl);

    if (slN < slX) {
      out[key] = {
        masp,
        size,
        sl: slX - slN
      };
    }
  });

  return out;
}

export function taoPayloadCCN1V2TuKiemNhap() {
  const state = getState();
  const branch = state.branchInfo || {};
  const data = layDanhSachHangThieuDeTaoCCN1V2();

  return {
    type: "CCN1V2",
    from: branch.fromBranch || "",
    to: branch.toBranch || "",
    ghichu: taoGhiChuPhieuChuyenTuKiemNhap("thieu"),
    items: Object.values(data)
  };
}

export function taoPayloadCCN2V1TuKiemNhap() {
  const state = getState();
  const branch = state.branchInfo || {};
  const data = layDanhSachHangThuaDeTaoCCN2V1();

  return {
    type: "CCN2V1",
    from: branch.toBranch || "",
    to: branch.fromBranch || "",
    ghichu: taoGhiChuPhieuChuyenTuKiemNhap("thua"),
    items: Object.values(data)
  };
}

export function moTrangCCN1V2TuHangThieu() {
  const payload = taoPayloadCCN1V2TuKiemNhap();
  if (!payload.items.length) {
    alert("Không có hàng thiếu để tạo phiếu chuyển.");
    return;
  }

  sessionStorage.setItem("kiemnhap_ccn_payload", JSON.stringify(payload));
  const url = "./chuyenkho.html";
  window.open(url, "_blank");
}

export function moTrangCCN2V1TuHangThua() {
  const payload = taoPayloadCCN2V1TuKiemNhap();
  if (!payload.items.length) {
    alert("Không có hàng thừa để tạo phiếu chuyển.");
    return;
  }

  sessionStorage.setItem("kiemnhap_ccn_payload", JSON.stringify(payload));
  const url = "./chuyenkho.html";
  window.open(url, "_blank");
}
