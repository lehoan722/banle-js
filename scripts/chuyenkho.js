import { supabase, startSessionKeeper } from "./supabaseClient.js";
import { khoiTaoDangNhapDungChung, getCurrentUserInfo } from "./authModule.js";
import { capNhatSoHoaDonTuDong } from "./sohoadon.js";

/* =========================================================
   1) CẤU HÌNH TRANG
========================================================= */
const PATH = (window.location.pathname || "").toLowerCase();

const SALES_PREFIXES = ["bancs1", "bancs2", "bannvcs1", "bannvcs2"];

const PAGE_CFG = PATH.includes("chuyenkho2v1cs2")
  ? {
    pageKey: "chuyenkho2v1cs2",
    loaiCt: "ck2v1_cs2",
    tuCoso: "cs2",
    denCoso: "cs1",
    dir: "2v1",
    ccnTargetUrl: "https://banle-js.vercel.app/ccn2v1cs2.html",
    macDinhDiaDiem: "cs2",
  }
  : {
    pageKey: "chuyenkho1v2cs1",
    loaiCt: "ck1v2_cs1",
    tuCoso: "cs1",
    denCoso: "cs2",
    dir: "1v2",
    ccnTargetUrl: "https://banle-js.vercel.app/ccn1v2cs1.html",
    macDinhDiaDiem: "cs1",
  };

const STATE = {
  rows: [],
  oldHeader: null,
  oldRowsMap: new Map(),
  selectedIndex: -1,
};

/* =========================================================
   2) HELPER DOM
========================================================= */
const $ = (id) => document.getElementById(id);

function getTodayYmd() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function getYesterdayYmd() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getNowHm() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function normalizeMasp(v) {
  return String(v || "").trim().toUpperCase();
}

function normalizeSize(v) {
  return String(v || "").trim().toUpperCase();
}

function isInvalidTransferSize(size) {
  const s = String(size ?? "").trim().toUpperCase();
  return s === "" || s === "0" || s === "0.0" || s === "00";
}

function isManagedSizeValue(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'co' || s === 'có';
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function uniq(arr) {
  return [...new Set(arr)];
}

function getPrevVoucherNo(soCt) {
  const s = String(soCt || "").trim();
  const m = s.match(/^([a-z0-9_]+)_(\d{5})$/i);
  if (!m) return "";

  const prefix = m[1];
  const num = Number(m[2]);
  if (!Number.isFinite(num) || num <= 1) return "";

  return `${prefix}_${String(num - 1).padStart(5, "0")}`;
}

function getOpenVoucherDefault() {
  return getPrevVoucherNo($("sohd")?.value || "");
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function showError(msg, err) {
  console.error(msg, err || "");
  alert(msg);
}

function setHeaderBasicInfo() {
  $("loai_ct").value = PAGE_CFG.loaiCt;
  $("tu_coso").value = PAGE_CFG.tuCoso;
  $("den_coso").value = PAGE_CFG.denCoso;
  $("diadiem").value = PAGE_CFG.macDinhDiaDiem;
}

function setDefaultDates() {
  $("tu_ngay").value = getYesterdayYmd();
  $("den_ngay").value = getTodayYmd();
}

function setCurrentDateTimeOnHeader() {
  $("ngay").value = getTodayYmd();
  $("gio").value = getNowHm();
}

function bindUserToHeader() {
  const u = getCurrentUserInfo();
  if ($("diadiem")) $("diadiem").value = u.diadiem || PAGE_CFG.macDinhDiaDiem;
  if ($("manv")) $("manv").value = u.manv || "";
  if ($("tennv")) $("tennv").value = u.tennv || "";
}

/* =========================================================
   3) LOGIN + KHỞI TẠO
========================================================= */
function initLogin() {
  khoiTaoDangNhapDungChung({
    loginContainerId: "login-container",
    appContainerId: "app-container",
    macDinhDiaDiem: PAGE_CFG.macDinhDiaDiem,
    tuDongKhoaCoSo: true,
    loginApiPath: {
      cs1: "/api/login-cs1",
      cs2: "/api/login-cs2",
    },
    onLoginSuccess: async () => {
      try {
        startSessionKeeper();
      } catch (e) {
        console.warn("startSessionKeeper error:", e);
      }

      bindUserToHeader();
      setHeaderBasicInfo();
      setCurrentDateTimeOnHeader();
      setDefaultDates();
      await taoPhieuMoi();
      ganSuKien();
      return true;
    },
  });
}

/* =========================================================
   4) TẠO PHIẾU MỚI
========================================================= */
async function taoPhieuMoi() {
  try {
    $("hd_state").value = "moi";
    $("trang_thai").value = "moi";
    $("ghi_chu_phieu").value = "";
    $("so_ct_ccn").value = "";
    $("history-box").textContent = "Chưa có lịch sử.";
    STATE.rows = [];
    STATE.oldHeader = null;
    STATE.oldRowsMap = new Map();
    STATE.selectedIndex = -1;
    renderBang();
    capNhatTong();

    setCurrentDateTimeOnHeader();
    bindUserToHeader();
    setHeaderBasicInfo();
    await capNhatSoHoaDonTuDong();
  } catch (e) {
    showError("Không tạo được phiếu mới.", e);
  }
}

/* =========================================================
   5) LẤY DANH SÁCH MÃ ƯU TIÊN TỪ TEXTAREA
========================================================= */
function getMaspsFromTextarea() {
  const text = $("textarea-masp").value || "";
  const list = text
    .split(/\r?\n/)
    .map(normalizeMasp)
    .filter(Boolean);
  return uniq(list);
}

/* =========================================================
   6) NẾU TEXTAREA RỖNG -> LẤY MÃ THEO KHOẢNG NGÀY
========================================================= */
async function fetchMaspsByDateRange() {
  const tuNgay = $("tu_ngay").value || getYesterdayYmd();
  const denNgay = $("den_ngay").value || getTodayYmd();

  const { data: headers, error: errHd } = await supabase
    .from("hoadon_banle")
    .select("sohd, ngay")
    .gte("ngay", tuNgay)
    .lte("ngay", denNgay);

  if (errHd) throw errHd;

  const sohds = uniq(
    (headers || [])
      .map((x) => String(x.sohd || "").trim())
      .filter((sohd) => {
        const s = sohd.toLowerCase();
        return SALES_PREFIXES.some((prefix) => s.startsWith(prefix));
      })
  );

  if (!sohds.length) return [];

  const { data: details, error: errCt } = await supabase
    .from("ct_hoadon_banle")
    .select("sohd, masp")
    .in("sohd", sohds);

  if (errCt) throw errCt;

  return uniq((details || []).map((x) => normalizeMasp(x.masp)).filter(Boolean));
}

/* =========================================================
   7) RPC TỒN KHO
========================================================= */
async function fetchXntRows(masps) {
  if (!masps?.length) return [];

  const { data, error } = await supabase.rpc("xntnhanh", {
    p_masps: masps,
    p_den_ngay: $("den_ngay").value || getTodayYmd(),
    p_tonghop_size: false
  });

  if (error) throw error;

  return (data || [])
    .map(r => ({
      masp: normalizeMasp(r.masp),
      size: normalizeSize(r.size),
      ton_cs1: Number(r.ton_cs1 || 0),
      ton_cs2: Number(r.ton_cs2 || 0)
    }))
    .filter(r => !isInvalidTransferSize(r.size));

}

/* =========================================================
   8) LẤY TÊN HÀNG
========================================================= */
async function fetchTenHangMap(masps) {
  if (!masps?.length) return new Map();

  const { data, error } = await supabase
    .from("dmhanghoa")
    .select("masp, tenhang")
    .in("masp", masps);

  if (error) {
    console.warn("fetchTenHangMap error:", error);
    return new Map();
  }

  const m = new Map();
  (data || []).forEach((r) => {
    m.set(normalizeMasp(r.masp), String(r.tenhang || ""));
  });
  return m;
}

/* =========================================================
   9) LOGIC GỢI Ý
========================================================= */
function getTargetStockByTotal(total) {
  const t = Number(total || 0);

  if (t <= 0) {
    return { cs1: 0, cs2: 0 };
  }

  // Quy tắc cố định từ 1 đến 5
  if (t === 1) return { cs1: 0, cs2: 1 };
  if (t === 2) return { cs1: 1, cs2: 1 };
  if (t === 3) return { cs1: 1, cs2: 2 };
  if (t === 4) return { cs1: 1, cs2: 3 };
  if (t === 5) return { cs1: 2, cs2: 3 };

  // Từ 6 trở lên:
  // CS1 = 1/3 tổng làm tròn xuống
  // CS2 = phần còn lại = 2/3 làm tròn lên
  const targetCs1 = Math.floor(t / 3);
  const targetCs2 = t - targetCs1;

  return {
    cs1: targetCs1,
    cs2: targetCs2
  };
}

function calcGoiy(cs1, cs2) {
  const n1 = Number(cs1 || 0);
  const n2 = Number(cs2 || 0);
  const total = n1 + n2;

  const target = getTargetStockByTotal(total);

  if (n1 > target.cs1) return "1v2";
  if (n1 < target.cs1) return "2v1";
  return "cân bằng";
}

function calcMoveQty(cs1, cs2, goiy) {
  const n1 = Number(cs1 || 0);
  const n2 = Number(cs2 || 0);
  const total = n1 + n2;

  const target = getTargetStockByTotal(total);

  if (goiy === "1v2") {
    return Math.max(0, n1 - target.cs1);
  }

  if (goiy === "2v1") {
    return Math.max(0, target.cs1 - n1);
  }

  return 0;
}

function buildSuggestionRows({ xntRows, tenHangMap }) {
  const out = [];

  for (const r of xntRows) {
    if (isInvalidTransferSize(r.size)) continue;

    const goiy = calcGoiy(r.ton_cs1, r.ton_cs2);
    const slGoiy = calcMoveQty(r.ton_cs1, r.ton_cs2, goiy);

    if (!goiy || goiy === "cân bằng" || goiy !== PAGE_CFG.dir) continue;
    if (slGoiy <= 0) continue;

    const tonNguon = PAGE_CFG.tuCoso === "cs1" ? r.ton_cs1 : r.ton_cs2;
    const tonDich = PAGE_CFG.denCoso === "cs1" ? r.ton_cs1 : r.ton_cs2;

    out.push({
      selected: false,
      done: false,
      masp: r.masp,
      tenhang: tenHangMap.get(r.masp) || "",
      size: r.size,
      ton_nguon: tonNguon,
      ton_dich: tonDich,
      huong_goiy: goiy,
      sl_goiy: slGoiy,
      sl_duyet: slGoiy,
      sl_thuc: 0,
      manv_phutrach: "",
      tennv_phutrach: "",
      trang_thai_dong: "",
      ghi_chu: "",
    });
  }

  out.sort((a, b) => {
    if (a.masp !== b.masp) return a.masp.localeCompare(b.masp, "vi");
    return a.size.localeCompare(b.size, "vi", { numeric: true });
  });

  return out;
}

/* =========================================================
   10) LẤY GỢI Ý
========================================================= */
async function layGoiY() {
  try {
    const textareaMasps = getMaspsFromTextarea();

    const masps = textareaMasps.length
      ? textareaMasps
      : await fetchMaspsByDateRange();

    if (!masps.length) {
      alert("Không có mã sản phẩm để gợi ý.");
      STATE.rows = [];
      renderBang();
      capNhatTong();
      return;
    }

    const [xntRows, tenHangMap] = await Promise.all([
      fetchXntRows(masps),
      fetchTenHangMap(masps),
    ]);

    STATE.rows = buildSuggestionRows({ xntRows, tenHangMap });
    renderBang();
    capNhatTong();
    $("hd_state").value = $("hd_state").value || "moi";
  } catch (e) {
    showError("Không lấy được dữ liệu gợi ý chuyển kho.", e);
  }
}

/* =========================================================
   11) RENDER BẢNG
========================================================= */
function renderBang() {
  const tbody = $("bangketqua").querySelector("tbody");
  tbody.innerHTML = "";

  STATE.rows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    if (row.done) tr.classList.add("done-row");
    if (idx === STATE.selectedIndex) tr.classList.add("highlight-row");

    tr.innerHTML = `
      <td><input type="checkbox" data-role="selected" data-idx="${idx}" ${row.selected ? "checked" : ""}></td>
      <td><input type="checkbox" data-role="done" data-idx="${idx}" ${row.done ? "checked" : ""}></td>
      <td class="col-masp" data-role="open-stock" data-idx="${idx}">${escapeHtml(row.masp)}</td>
      <td>${escapeHtml(row.tenhang)}</td>
      <td>${escapeHtml(row.size)}</td>
      <td>${row.ton_nguon}</td>
      <td>${row.ton_dich}</td>
      <td>${escapeHtml(row.huong_goiy)}</td>
      <td>${row.sl_goiy}</td>
      <td class="col-slduyet"><input data-role="sl_duyet" data-idx="${idx}" value="${row.sl_duyet}"></td>
      <td class="col-slthuc"><input data-role="sl_thuc" data-idx="${idx}" value="${row.sl_thuc}"></td>
      <td class="col-manv"><input data-role="manv_phutrach" data-idx="${idx}" value="${escapeAttr(row.manv_phutrach)}"></td>
      <td style="display:none;">${escapeHtml(row.tennv_phutrach)}</td>
      <td>${escapeHtml(row.trang_thai_dong)}</td>
      <td class="col-ghichu"><input data-role="ghi_chu" data-idx="${idx}" value="${escapeAttr(row.ghi_chu)}"></td>
    `;

    tr.addEventListener("click", (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea" || e.target?.closest("input") || e.target?.closest("select")) {
        return;
      }
      STATE.selectedIndex = idx;
      renderBang();
    });

    tbody.appendChild(tr);
  });

  ganSuKienBang();
}

function ganSuKienBang() {
  document.querySelectorAll('#bangketqua input, #bangketqua select, #bangketqua textarea').forEach((el) => {
    el.addEventListener("click", (e) => e.stopPropagation());
    el.addEventListener("mousedown", (e) => e.stopPropagation());
  });

  document.querySelectorAll('[data-role="selected"]').forEach((el) => {
    el.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.idx);
      const checked = !!e.target.checked;
      const row = STATE.rows[idx];

      row.selected = checked;

      if (!row.done) {
        row.trang_thai_dong = checked ? "de_xuat" : "";
      }

      renderBang();
      capNhatTong();
    });
  });

  document.querySelectorAll('[data-role="done"]').forEach((el) => {
    el.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.idx);
      const checked = !!e.target.checked;
      const row = STATE.rows[idx];

      row.done = checked;

      if (checked) {
        row.selected = true;
        row.trang_thai_dong = "da_chuyen";
        if (!toNumber(row.sl_thuc)) row.sl_thuc = toNumber(row.sl_duyet);
      } else {
        row.trang_thai_dong = row.selected ? "de_xuat" : "";
      }

      renderBang();
      capNhatTong();
    });
  });

  document.querySelectorAll('[data-role="open-stock"]').forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Number(e.target.dataset.idx);
      openQuickStock(STATE.rows[idx].masp);
    });
  });

  document.querySelectorAll('[data-role="sl_duyet"]').forEach((el) => {
    el.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.idx);
      STATE.rows[idx].sl_duyet = toNumber(e.target.value);
      capNhatTong();
    });
  });

  document.querySelectorAll('[data-role="sl_thuc"]').forEach((el) => {
    el.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.idx);
      STATE.rows[idx].sl_thuc = toNumber(e.target.value);
      capNhatTong();
    });
  });

  document.querySelectorAll('[data-role="manv_phutrach"]').forEach((el) => {
    el.addEventListener("change", async (e) => {
      const idx = Number(e.target.dataset.idx);
      const manv = String(e.target.value || "").trim().toUpperCase();
      STATE.rows[idx].manv_phutrach = manv;
      STATE.rows[idx].tennv_phutrach = await fetchTenNhanVien(manv);
      renderBang();
    });
  });

  document.querySelectorAll('[data-role="ghi_chu"]').forEach((el) => {
    el.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.idx);
      STATE.rows[idx].ghi_chu = e.target.value || "";
    });
  });
}

function capNhatTong() {
  $("tong_dong").value = String(STATE.rows.length);
  $("tong_goiy").value = String(STATE.rows.reduce((s, r) => s + toNumber(r.sl_goiy), 0));
  $("tong_duyet").value = String(STATE.rows.reduce((s, r) => s + toNumber(r.sl_duyet), 0));
  $("tong_thuc").value = String(STATE.rows.reduce((s, r) => s + toNumber(r.sl_thuc), 0));
}

/* =========================================================
   12) NHÂN VIÊN
========================================================= */
async function fetchTenNhanVien(manv) {
  if (!manv) return "";
  try {
    const { data, error } = await supabase
      .from("dmnhanvien")
      .select("manv, tennv")
      .eq("manv", manv)
      .maybeSingle();

    if (error) return "";
    return String(data?.tennv || "");
  } catch {
    return "";
  }
}

/* =========================================================
   13) LƯU PHIẾU
========================================================= */
function getHeaderPayload() {
  return {
    so_ct: $("sohd").value.trim(),
    loai_ct: PAGE_CFG.loaiCt,
    tu_coso: PAGE_CFG.tuCoso,
    den_coso: PAGE_CFG.denCoso,
    trang_thai: $("trang_thai").value.trim() || "moi",
    ngay_ct: $("ngay").value || getTodayYmd(),
    gio_ct: $("gio").value || getNowHm(),
    created_by: $("manv").value || "",
    created_by_name: $("tennv").value || "",
    updated_by: $("manv").value || "",
    updated_by_name: $("tennv").value || "",
    so_ct_ccn: $("so_ct_ccn").value.trim() || null,
    ghi_chu: $("ghi_chu_phieu").value || "",
  };
}

function getDetailPayload() {
  return STATE.rows.map((r, idx) => ({
    so_ct: $("sohd").value.trim(),
    stt: idx + 1,
    masp: r.masp,
    tenhang: r.tenhang,
    size: r.size,
    ton_nguon: toNumber(r.ton_nguon),
    ton_dich: toNumber(r.ton_dich),
    huong_goiy: r.huong_goiy,
    sl_goiy: toNumber(r.sl_goiy),
    sl_duyet: toNumber(r.sl_duyet),
    sl_thuc: toNumber(r.sl_thuc),
    manv_phutrach: r.manv_phutrach || null,
    tennv_phutrach: r.tennv_phutrach || null,
    done: !!r.done,
    done_at: r.done ? new Date().toISOString() : null,
    done_by: r.done ? ($("manv").value || "") : null,
    done_by_name: r.done ? ($("tennv").value || "") : null,
    trang_thai_dong: r.trang_thai_dong || "de_xuat",
    ghi_chu: r.ghi_chu || "",
  }));
}

async function capNhatSoChungTuSauKhiLuuDauTien(soCt) {
  const m = String(soCt || "").match(/^([a-z0-9_]+)_(\d{5})$/i);
  if (!m) return;

  const loai = m[1];
  const so = Number(m[2]);
  if (!Number.isFinite(so)) return;

  const { data } = await supabase
    .from("sochungtu")
    .select("so_hientai")
    .eq("loai", loai)
    .maybeSingle();

  const current = Number(data?.so_hientai || 0);
  if (so > current) {
    await supabase
      .from("sochungtu")
      .update({ so_hientai: so })
      .eq("loai", loai);
  }
}

async function luuPhieu() {
  try {
    const soCt = $("sohd").value.trim();
    if (!soCt) {
      alert("Chưa có số chứng từ.");
      return;
    }

    const header = getHeaderPayload();
    const details = getDetailPayload();

    const isMoi = $("hd_state").value === "moi";
    const oldHeader = STATE.oldHeader ? deepClone(STATE.oldHeader) : null;
    const oldRows = STATE.oldRowsMap.size ? Array.from(STATE.oldRowsMap.values()).map(deepClone) : [];

    const { error: upsertHeaderErr } = await supabase
      .from("yeucau_chuyenkho")
      .upsert([header], { onConflict: "so_ct" });

    if (upsertHeaderErr) throw upsertHeaderErr;

    const { error: delErr } = await supabase
      .from("yeucau_chuyenkho_ct")
      .delete()
      .eq("so_ct", soCt);

    if (delErr) throw delErr;

    if (details.length) {
      const { error: insCtErr } = await supabase
        .from("yeucau_chuyenkho_ct")
        .insert(details);

      if (insCtErr) throw insCtErr;
    }

    if (isMoi) {
      await capNhatSoChungTuSauKhiLuuDauTien(soCt);

      await supabase.from("yeucau_chuyenkho_log").insert([{
        so_ct: soCt,
        action_type: "create",
        old_data: null,
        new_data: header,
        changed_by: $("manv").value || "",
        changed_by_name: $("tennv").value || "",
      }]);
    } else {
      await supabase.from("yeucau_chuyenkho_log").insert([{
        so_ct: soCt,
        action_type: "update",
        old_data: oldHeader,
        new_data: header,
        changed_by: $("manv").value || "",
        changed_by_name: $("tennv").value || "",
      }]);
    }

    for (const row of details) {
      const oldRow = STATE.oldRowsMap.get(`${row.masp}__${row.size}`) || null;
      const changed = JSON.stringify(oldRow || null) !== JSON.stringify(row);
      if (!changed) continue;

      await supabase.from("yeucau_chuyenkho_ct_log").insert([{
        so_ct: soCt,
        ct_id: null,
        masp: row.masp,
        size: row.size,
        action_type: oldRow ? "update" : "insert",
        old_data: oldRow,
        new_data: row,
        changed_by: $("manv").value || "",
        changed_by_name: $("tennv").value || "",
      }]);
    }

    $("hd_state").value = "sua";
    await napPhieu(soCt);

    alert("Đã lưu phiếu chuyển kho.");
  } catch (e) {
    showError("Lưu phiếu thất bại.", e);
  }
}

/* =========================================================
   14) NẠP PHIẾU CŨ
========================================================= */
async function napPhieu(soCtParam = "") {
  try {
    const defaultSoCt = getOpenVoucherDefault();
    const soCtInput = soCtParam || prompt("Nhập số chứng từ cần mở:", defaultSoCt);
    const soCt = String(soCtInput || "").trim();
    if (!soCt) return;

    const { data: hd, error: errHd } = await supabase
      .from("yeucau_chuyenkho")
      .select("*")
      .eq("so_ct", soCt)
      .single();

    if (errHd) throw errHd;

    const { data: ct, error: errCt } = await supabase
      .from("yeucau_chuyenkho_ct")
      .select("*")
      .eq("so_ct", soCt)
      .order("stt", { ascending: true });

    if (errCt) throw errCt;

    $("sohd").value = hd.so_ct || "";
    $("trang_thai").value = hd.trang_thai || "moi";
    $("ngay").value = String(hd.ngay_ct || "").slice(0, 10);
    $("gio").value = hd.gio_ct || "";
    $("ghi_chu_phieu").value = hd.ghi_chu || "";
    $("so_ct_ccn").value = hd.so_ct_ccn || "";
    $("hd_state").value = "sua";

    STATE.oldHeader = deepClone(hd);
    STATE.oldRowsMap = new Map();

    STATE.rows = (ct || []).map((r) => {
      const row = {
        selected: true,
        done: !!r.done,
        masp: normalizeMasp(r.masp),
        tenhang: r.tenhang || "",
        size: normalizeSize(r.size),
        ton_nguon: toNumber(r.ton_nguon),
        ton_dich: toNumber(r.ton_dich),
        huong_goiy: r.huong_goiy || "",
        sl_goiy: toNumber(r.sl_goiy),
        sl_duyet: toNumber(r.sl_duyet),
        sl_thuc: toNumber(r.sl_thuc),
        manv_phutrach: r.manv_phutrach || "",
        tennv_phutrach: r.tennv_phutrach || "",
        trang_thai_dong: r.trang_thai_dong || "de_xuat",
        ghi_chu: r.ghi_chu || "",
      };
      STATE.oldRowsMap.set(`${row.masp}__${row.size}`, deepClone({
        so_ct: soCt,
        stt: r.stt,
        masp: row.masp,
        tenhang: row.tenhang,
        size: row.size,
        ton_nguon: row.ton_nguon,
        ton_dich: row.ton_dich,
        huong_goiy: row.huong_goiy,
        sl_goiy: row.sl_goiy,
        sl_duyet: row.sl_duyet,
        sl_thuc: row.sl_thuc,
        manv_phutrach: row.manv_phutrach,
        tennv_phutrach: row.tennv_phutrach,
        done: row.done,
        trang_thai_dong: row.trang_thai_dong,
        ghi_chu: row.ghi_chu,
      }));
      return row;
    });

    renderBang();
    capNhatTong();
    await napHistory(soCt);
  } catch (e) {
    showError("Không mở được phiếu.", e);
  }
}

/* =========================================================
   15) HISTORY
========================================================= */
async function napHistory(soCt) {
  try {
    const { data, error } = await supabase
      .from("yeucau_chuyenkho_log")
      .select("action_type, changed_by, changed_by_name, changed_at")
      .eq("so_ct", soCt)
      .order("changed_at", { ascending: false });

    if (error) throw error;

    if (!data?.length) {
      $("history-box").textContent = "Chưa có lịch sử.";
      return;
    }

    $("history-box").textContent = data.map((x) => {
      return `[${new Date(x.changed_at).toLocaleString("vi-VN")}]
${x.action_type} - ${x.changed_by || ""} ${x.changed_by_name || ""}`;
    }).join("\n\n");
  } catch (e) {
    $("history-box").textContent = "Không tải được lịch sử.";
    console.warn("napHistory error:", e);
  }
}

/* =========================================================
   16) GIAO VIỆC / ĐÁNH DẤU XONG
========================================================= */
async function giaoViec() {
  try {
    const selectedRows = STATE.rows.filter((r) => r.selected);

    if (!selectedRows.length) {
      alert("Chưa chọn dòng nào để giao việc.");
      return;
    }

    const rowsToSave = selectedRows.map((r) => ({
      ...r,
      selected: true,
      done: !!r.done,
      trang_thai_dong: r.done ? "da_chuyen" : "de_xuat",
    }));

    STATE.rows = rowsToSave;
    STATE.selectedIndex = STATE.rows.length ? 0 : -1;

    $("trang_thai").value = "da_giao";

    renderBang();
    capNhatTong();
    await luuPhieu();
  } catch (e) {
    showError("Giao việc thất bại.", e);
  }
}

async function danhDauXong() {
  try {
    const rows = STATE.rows.filter((r) => r.selected);
    if (!rows.length) {
      alert("Chưa chọn dòng nào.");
      return;
    }

    rows.forEach((r) => {
      r.done = true;
      r.selected = true;
      r.trang_thai_dong = "da_chuyen";

      if (!toNumber(r.sl_thuc)) {
        r.sl_thuc = toNumber(r.sl_duyet);
      }
    });

    renderBang();
    capNhatTong();
    await luuPhieu();
  } catch (e) {
    showError("Không đánh dấu xong được.", e);
  }
}

/* =========================================================
   17) TẠO PHIẾU CCN TỪ CÁC DÒNG DONE
========================================================= */
function buildCcnPayloadFromDoneRows() {
  const rows = STATE.rows.filter((r) => r.done && toNumber(r.sl_thuc) > 0);
  if (!rows.length) return null;

  const grouped = new Map();

  for (const r of rows) {
    const masp = normalizeMasp(r.masp);
    const size = normalizeSize(r.size);
    const sl = toNumber(r.sl_thuc);

    if (!grouped.has(masp)) {
      grouped.set(masp, {
        masp,
        items: []
      });
    }

    grouped.get(masp).items.push({
      size,
      sl
    });
  }

  return {
    dir: PAGE_CFG.dir, // rất quan trọng để trang CCN chấp nhận payload
    source: PAGE_CFG.pageKey,
    so_ct_yeu_cau: $("sohd").value.trim(),
    from_diadiem: PAGE_CFG.tuCoso,
    to_diadiem: PAGE_CFG.denCoso,
    created_by: $("manv").value || "",
    created_by_name: $("tennv").value || "",
    note: `Tạo từ phiếu yêu cầu ${$("sohd").value.trim()}`,
    items: Array.from(grouped.values())
  };
}

function taoPhieuCCN() {
  const payload = buildCcnPayloadFromDoneRows();
  if (!payload) {
    alert("Không có dòng hoàn thành hợp lệ để tạo phiếu CCN.");
    return;
  }

  localStorage.setItem("ccn_prefill_payload", JSON.stringify(payload));
  window.open(PAGE_CFG.ccnTargetUrl, "_blank");
}

/* =========================================================
   18) XÓA DÒNG / TỒN NHANH
========================================================= */
function xoaDongDangChon() {
  if (STATE.selectedIndex < 0) {
    alert("Chưa chọn dòng.");
    return;
  }
  STATE.rows.splice(STATE.selectedIndex, 1);
  STATE.selectedIndex = -1;
  renderBang();
  capNhatTong();
}

function openQuickStock(masp) {
  try {
    if (typeof window.stockQuickPopup === "function") {
      window.stockQuickPopup(normalizeMasp(masp));
    }
  } catch (e) {
    console.error("openQuickStock error:", e);
  }
}

function xemTonDongDangChon() {
  if (STATE.selectedIndex < 0) {
    alert("Chưa chọn dòng.");
    return;
  }
  const row = STATE.rows[STATE.selectedIndex];
  openQuickStock(row.masp);
}

/* =========================================================
   19) THOÁT / ĐĂNG XUẤT
========================================================= */
async function dangXuatApp() {
  try {
    if (window.supabase?.auth) {
      await window.supabase.auth.signOut();
    }
  } catch (e) {
    console.warn("signOut error:", e);
  }

  localStorage.clear();
  sessionStorage.clear();
  window.location.reload();
}

/* =========================================================
   20) ESCAPE HTML
========================================================= */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(s) {
  return escapeHtml(s);
}

/* =========================================================
   21) BIND NÚT
========================================================= */
function ganSuKien() {
  if (window.__chuyenKhoBound) return;
  window.__chuyenKhoBound = true;

  $("btn-goi-y")?.addEventListener("click", layGoiY);
  $("btn-xoa-goi-y")?.addEventListener("click", async () => {
    STATE.rows = [];
    renderBang();
    capNhatTong();
  });

  $("btn-them-moi")?.addEventListener("click", taoPhieuMoi);
  $("btn-luu")?.addEventListener("click", luuPhieu);
  $("btn-open-old")?.addEventListener("click", () => napPhieu());
  $("btn-giao-viec")?.addEventListener("click", giaoViec);
  $("btn-danh-dau-xong")?.addEventListener("click", danhDauXong);
  $("btn-tao-ccn")?.addEventListener("click", taoPhieuCCN);
  $("btn-xoa-dong")?.addEventListener("click", xoaDongDangChon);
  $("btn-stock-selected")?.addEventListener("click", xemTonDongDangChon);

  $("btn-footer-them-moi")?.addEventListener("click", taoPhieuMoi);
  $("btn-footer-luu")?.addEventListener("click", luuPhieu);
  $("btn-footer-mo")?.addEventListener("click", () => napPhieu());
  $("btn-footer-giao")?.addEventListener("click", giaoViec);
  $("btn-footer-xong")?.addEventListener("click", danhDauXong);
  $("btn-footer-tao-ccn")?.addEventListener("click", taoPhieuCCN);
  $("btn-footer-xoa")?.addEventListener("click", xoaDongDangChon);
  $("btn-footer-thoat")?.addEventListener("click", dangXuatApp);

  $("btn-logout")?.addEventListener("click", dangXuatApp);
  $("btn-stock-selected")?.addEventListener("dblclick", xemTonDongDangChon);
  $("btnReloadSP")?.addEventListener("click", () => location.reload());

  document.addEventListener("keydown", (e) => {
    if (e.key === "F1") {
      e.preventDefault();
      taoPhieuMoi();
    }
    if (e.key === "F2") {
      e.preventDefault();
      luuPhieu();
    }
    if (e.key === "F3") {
      e.preventDefault();
      napPhieu();
    }
  });
}

/* =========================================================
   22) START
========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  setHeaderBasicInfo();
  setDefaultDates();
  setCurrentDateTimeOnHeader();
  initLogin();
});
