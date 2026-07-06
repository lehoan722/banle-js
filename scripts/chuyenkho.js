import { supabase, startSessionKeeper } from "./supabaseClient.js";
import { khoiTaoDangNhapDungChung, getCurrentUserInfo } from "./authModule.js";
import { capNhatSoHoaDonTuDong } from "./sohoadon.js";

import {
  calcSuggestionsFromRows,
  normSize
} from "./services/luatChuyenKho.js";

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
    ccnTargetUrl: `${window.location.origin}/ccn2v1cs2.html`,
    macDinhDiaDiem: "cs2",
  }
  : {
    pageKey: "chuyenkho1v2cs1",
    loaiCt: "ck1v2_cs1",
    tuCoso: "cs1",
    denCoso: "cs2",
    dir: "1v2",
    ccnTargetUrl: `${window.location.origin}/ccn1v2cs1.html`,
    macDinhDiaDiem: "cs1",
  };

const STATE = {
  rows: [],
  oldHeader: null,
  oldRowsMap: new Map(),
  selectedIndex: -1,
  chungLoaiMap: new Map(),   // masp -> chungloai
  allChungLoaiSet: new Set() // tập tất cả mã chủng loại có trong DB
};

let NHOMHANG_OPTIONS = [];

/* =========================================================
   2) HELPER DOM
========================================================= */
const $ = (id) => document.getElementById(id);

function buildSoCtCandidates(soCt) {
  const s = String(soCt || "").trim();
  if (!s) return [];

  const out = [s];

  const m = s.match(/^(.+_)(\d+)$/);
  if (m) {
    const prefix = m[1];
    const num = Number(m[2]);

    if (Number.isFinite(num)) {
      out.push(prefix + String(num).padStart(6, "0"));
      out.push(prefix + String(num).padStart(5, "0"));
      out.push(prefix + String(num));
    }
  }

  return [...new Set(out)];
}

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

function isUseKiemTonEnabled() {
  const el = $("chk-use-kiemton");
  return el ? !!el.checked : true;
}

function uniq(arr) {
  return [...new Set(arr)];
}

function dedupeRowsByMaspSize(rows) {
  const map = new Map();

  (rows || []).forEach((r) => {
    const masp = normalizeMasp(r.masp);
    const size = normalizeSize(r.size);
    const key = `${masp}__${size}`;

    if (!masp || !size) return;

    if (!map.has(key)) {
      map.set(key, {
        ...r,
        masp,
        size,
      });
    } else {
      const old = map.get(key);

      map.set(key, {
        ...old,
        selected: old.selected || r.selected,
        done: old.done || r.done,
        sl_goiy: Math.max(toNumber(old.sl_goiy), toNumber(r.sl_goiy)),
        sl_duyet: Math.max(toNumber(old.sl_duyet), toNumber(r.sl_duyet)),
        sl_thuc: Math.max(toNumber(old.sl_thuc), toNumber(r.sl_thuc)),
        trang_thai_dong:
          old.trang_thai_dong === "dang_chuyen" || r.trang_thai_dong === "dang_chuyen"
            ? "dang_chuyen"
            : (old.trang_thai_dong || r.trang_thai_dong || "de_xuat"),
        ghi_chu: old.ghi_chu || r.ghi_chu || "",
        manv_phutrach: old.manv_phutrach || r.manv_phutrach || "",
        tennv_phutrach: old.tennv_phutrach || r.tennv_phutrach || "",
      });
    }
  });

  return Array.from(map.values());
}

function getPrevVoucherNo(soCt) {
  const s = String(soCt || "").trim();
  const m = s.match(/^(.+_)(\d+)$/i);
  if (!m) return "";

  const prefix = m[1];
  const numText = m[2];
  const num = Number(numText);

  if (!Number.isFinite(num) || num <= 1) return "";

  return `${prefix}${String(num - 1).padStart(numText.length, "0")}`;
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

function setGoiYStatus(msg, type = "") {
  const el = $("goiy-status");
  if (!el) return;

  el.className = "goiy-status";
  if (type) el.classList.add(type);

  el.textContent = msg || "";
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
      await loadNhomHangOptions();
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

    if ($("textarea-masp")) $("textarea-masp").value = "";
    if ($("input-nhomhang-search")) $("input-nhomhang-search").value = "";
    if ($("input-nhomhang-selected")) $("input-nhomhang-selected").value = "";
    if ($("nhomhang-dropdown")) $("nhomhang-dropdown").style.display = "none";
    if ($("goiy-status")) setGoiYStatus("");

    STATE.rows = [];
    STATE.oldHeader = null;
    STATE.oldRowsMap = new Map();
    STATE.selectedIndex = -1;
    STATE.chungLoaiMap = new Map();
    STATE.allChungLoaiSet = new Set();
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

function getSelectedNhomHangs() {
  const text = $("input-nhomhang-selected")?.value || "";

  return uniq(
    text
      .replaceAll("，", ",")
      .split(/[,\n\r;]+/)
      .map(v => String(v || "").trim().toUpperCase())
      .filter(Boolean)
  );
}

async function loadNhomHangOptions() {
  const { data, error } = await supabase
    .from("dmnhomhang")
    .select("manhom, tennhom, diadiem")
    .in("diadiem", ["ALL", PAGE_CFG.macDinhDiaDiem.toUpperCase()])
    .order("manhom", { ascending: true });

  if (error) {
    console.error("loadNhomHangOptions error:", error);
    return;
  }

  NHOMHANG_OPTIONS = (data || [])
    .map(r => ({
      manhom: String(r.manhom || "").trim().toUpperCase(),
      tennhom: String(r.tennhom || "").trim()
    }))
    .filter(r => r.manhom);

  bindNhomHangPicker();
}

function renderNhomHangDropdown(keyword = "") {
  const box = $("nhomhang-dropdown");
  if (!box) return;

  const kw = String(keyword || "").trim().toUpperCase();
  const selected = new Set(getSelectedNhomHangs());

  const list = NHOMHANG_OPTIONS
    .filter(x => !selected.has(x.manhom))
    .filter(x => !kw || x.manhom.includes(kw) || x.tennhom.toUpperCase().includes(kw))
    .slice(0, 80);

  box.innerHTML = list.length
    ? list.map(x => `
        <div class="nhomhang-option" data-manhom="${escapeAttr(x.manhom)}">
          <b>${escapeHtml(x.manhom)}</b>${x.tennhom ? " - " + escapeHtml(x.tennhom) : ""}
        </div>
      `).join("")
    : `<div class="nhomhang-option">Không có nhóm phù hợp</div>`;

  box.style.display = "block";
}

function addNhomHangSelected(manhom) {
  const el = $("input-nhomhang-selected");
  const search = $("input-nhomhang-search");
  if (!el) return;

  const current = getSelectedNhomHangs();
  const mh = String(manhom || "").trim().toUpperCase();

  if (!mh || current.includes(mh)) return;

  current.push(mh);
  el.value = current.join(",");

  if (search) search.value = "";
}

function bindNhomHangPicker() {
  const input = $("input-nhomhang-search");
  const box = $("nhomhang-dropdown");
  const selected = $("input-nhomhang-selected");

  if (!input || !box || input.dataset.bound === "1") return;
  input.dataset.bound = "1";

  input.addEventListener("focus", () => renderNhomHangDropdown(input.value));
  input.addEventListener("input", () => renderNhomHangDropdown(input.value));

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const first = box.querySelector(".nhomhang-option[data-manhom]");
      if (first) {
        addNhomHangSelected(first.dataset.manhom);
        box.style.display = "none";
      }
    }

    if (e.key === "Escape") {
      box.style.display = "none";
    }

    if (e.key === "Backspace" && !input.value && selected?.value) {
      const arr = getSelectedNhomHangs();
      arr.pop();
      selected.value = arr.join(",");
    }
  });

  box.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const row = e.target.closest(".nhomhang-option[data-manhom]");
    if (!row) return;

    addNhomHangSelected(row.dataset.manhom);
    box.style.display = "none";
  });

  selected?.addEventListener("dblclick", () => {
    selected.value = "";
  });

  document.addEventListener("mousedown", (e) => {
    if (!input.contains(e.target) && !box.contains(e.target)) {
      box.style.display = "none";
    }
  });
}

async function fetchMaspsByNhomHang(nhomHangs) {
  const list = (nhomHangs || [])
    .map(v => String(v || "").trim().toUpperCase())
    .filter(Boolean);

  if (!list.length) return [];

  console.log("Nhóm hàng đang tìm:", list);

  const { data, error } = await supabase
    .from("dmhanghoa")
    .select("masp, nhomhang")
    .in("nhomhang", list);

  if (error) throw error;

  console.log("Số mã tìm được theo nhóm:", data?.length || 0, data);

  return uniq(
    (data || [])
      .map(r => normalizeMasp(r.masp))
      .filter(Boolean)
  );
}

function getKeywordFiltersFromTextarea() {
  const text = $("textarea-masp").value || "";
  return uniq(
    text
      .split(/\r?\n/)
      .map(v => String(v || "").trim().toUpperCase())
      .filter(Boolean)
  );
}

function splitTextareaKeywords() {
  const keywords = getKeywordFiltersFromTextarea();

  const typeKeywords = [];
  const maspKeywords = [];

  keywords.forEach((kw) => {
    if (STATE.allChungLoaiSet.has(kw)) {
      typeKeywords.push(kw);
    } else {
      maspKeywords.push(kw);
    }
  });

  return {
    typeKeywords: uniq(typeKeywords),
    maspKeywords: uniq(maspKeywords)
  };
}

/* =========================================================
   6) NẾU TEXTAREA RỖNG -> LẤY MÃ THEO KHOẢNG NGÀY
========================================================= */
async function fetchMaspsByDateRange() {
  const tuNgay = $("tu_ngay").value || getYesterdayYmd();
  const denNgay = $("den_ngay").value || getTodayYmd();

  const PAGE_SIZE = 1000;

  // =====================================================
  // 1. LẤY TOÀN BỘ HEADER HÓA ĐƠN - CÓ PHÂN TRANG
  // =====================================================
  const headers = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("hoadon_banle")
      .select("sohd, ngay")
      .gte("ngay", tuNgay)
      .lte("ngay", denNgay)
      .order("sohd", { ascending: true })
      .range(from, to);

    if (error) throw error;

    headers.push(...(data || []));

    if (!data || data.length < PAGE_SIZE) {
      break;
    }
  }

  const sohds = uniq(
    headers
      .map((x) => String(x.sohd || "").trim())
      .filter((sohd) => {
        const s = sohd.toLowerCase();

        return SALES_PREFIXES.some((prefix) =>
          s.startsWith(prefix)
        );
      })
  );

  console.log("[ChuyenKho] Tổng header:", headers.length);
  console.log("[ChuyenKho] Tổng hóa đơn bán:", sohds.length);

  if (!sohds.length) return [];

  // =====================================================
  // 2. CHIA NHỎ DANH SÁCH SOHD
  // =====================================================
  const SOHD_BATCH_SIZE = 100;

  const allDetails = [];

  for (let i = 0; i < sohds.length; i += SOHD_BATCH_SIZE) {
    const sohdBatch = sohds.slice(i, i + SOHD_BATCH_SIZE);

    // ===================================================
    // 3. MỖI BATCH TIẾP TỤC PHÂN TRANG CHI TIẾT
    // ===================================================
    for (let from = 0; ; from += PAGE_SIZE) {
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from("ct_hoadon_banle")
        .select("sohd, masp")
        .in("sohd", sohdBatch)
        .order("sohd", { ascending: true })
        .range(from, to);

      if (error) throw error;

      allDetails.push(...(data || []));

      if (!data || data.length < PAGE_SIZE) {
        break;
      }
    }
  }

  const masps = uniq(
    allDetails
      .map((x) => normalizeMasp(x.masp))
      .filter(Boolean)
  );

  console.log("[ChuyenKho] Tổng dòng chi tiết:", allDetails.length);
  console.log("[ChuyenKho] Tổng mã SP duy nhất:", masps.length);

  return masps;
}

/* =========================================================
   7) RPC TỒN KHO
========================================================= */
async function fetchXntRows(masps) {
  if (!masps?.length) return [];

  const rpcParams = {
    p_masps: masps,
    p_den_ngay: $("den_ngay").value || getTodayYmd(),
    p_tonghop_size: false
  };

  const { data, error } = await supabase.rpc("xntnhanh", rpcParams);

  if (error) throw error;

  return (data || [])
    .map(r => {
      const tonCs1 = Number(r.ton_cs1 || 0);
      const tonCs2 = Number(r.ton_cs2 || 0);

      return {
        masp: normalizeMasp(r.masp),
        size: normalizeSize(r.size),

        ton_cs1: tonCs1,
        ton_cs2: tonCs2,

        lech_cs1: 0,
        lech_cs2: 0,

        ton_thuc_cs1: tonCs1,
        ton_thuc_cs2: tonCs2,

        ban_cs1: Number(r.ban_cs1 || 0),
        ban_cs2: Number(r.ban_cs2 || 0),
        tong_ban: Number(r.tong_ban || 0),
        tong_nhap: Number(r.tong_nhap || 0),
        tong_ton: Number(r.tong_ton || 0),

        co_kiemton: false
      };
    })
    .filter(r => !isInvalidTransferSize(r.size));
}

/* =========================================================
   8) LẤY TÊN HÀNG
========================================================= */

/* =========================================================
   8) LẤY CHỦNG LOẠI HÀNG
========================================================= */
async function fetchChungLoaiMap(masps) {
  if (!masps?.length) {
    return {
      chungLoaiMap: new Map(),
      allChungLoaiSet: new Set()
    };
  }

  const { data, error } = await supabase
    .from("dmhanghoa")
    .select("masp, chungloai")
    .in("masp", masps);

  if (error) throw error;

  const chungLoaiMap = new Map();
  const allChungLoaiSet = new Set();

  (data || []).forEach((r) => {
    const masp = normalizeMasp(r.masp);
    const chungloai = String(r.chungloai || "").trim().toUpperCase();

    if (masp) {
      chungLoaiMap.set(masp, chungloai);
    }
    if (chungloai) {
      allChungLoaiSet.add(chungloai);
    }
  });

  return { chungLoaiMap, allChungLoaiSet };
}

/* =========================================================
   9) LOGIC GỢI Ý
========================================================= */


function buildSuggestionRows({ xntRows }) {
  const useKiemTon = isUseKiemTonEnabled();

  const groupedByMasp = new Map();

  (xntRows || []).forEach(r => {
    const masp = normalizeMasp(r.masp);
    if (!masp) return;

    const tonTinhCs1 = r.ton_cs1;
    const tonTinhCs2 = r.ton_cs2;

    const rowForRule = {
      masp,
      size: r.size,
      ton_cs1: Number(tonTinhCs1 || 0),
      ton_cs2: Number(tonTinhCs2 || 0),
      lech_cs1: 0,
      lech_cs2: 0,
      ban_cs1: Number(r.ban_cs1 || 0),
      ban_cs2: Number(r.ban_cs2 || 0),
      tong_ban: Number(r.tong_ban || 0),
      tong_nhap: Number(r.tong_nhap || 0),
      tong_ton: Number(r.tong_ton || 0)
    };

    if (!groupedByMasp.has(masp)) groupedByMasp.set(masp, []);
    groupedByMasp.get(masp).push(rowForRule);
  });

  const suggestions = [];

  groupedByMasp.forEach((rows, masp) => {
    const arr = calcSuggestionsFromRows(rows, masp)
      .filter(x => x.huong_chuyen === PAGE_CFG.dir);

    suggestions.push(...arr);
  });

  const stockMap = new Map();
  (xntRows || []).forEach(r => {
    stockMap.set(`${normalizeMasp(r.masp)}__${normSize(r.size)}`, r);
  });

  const out = suggestions.map(s => {
    const key = `${normalizeMasp(s.masp)}__${normSize(s.size)}`;
    const old = stockMap.get(key) || {};

    const tonNguon = PAGE_CFG.tuCoso === "cs1"
      ? s.ton_sau_kiem_cs1
      : s.ton_sau_kiem_cs2;

    const tonDich = PAGE_CFG.denCoso === "cs1"
      ? s.ton_sau_kiem_cs1
      : s.ton_sau_kiem_cs2;

    return {
      selected: false,
      done: false,
      masp: s.masp,
      size: s.size,
      ton_nguon: tonNguon,
      ton_dich: tonDich,
      huong_goiy: s.huong_chuyen,
      sl_goiy: s.soluong,
      sl_duyet: 0,
      sl_thuc: 0,
      manv_phutrach: "",
      trang_thai_dong: "",
      ghi_chu: "",

      ton_may_cs1: old.ton_cs1,
      ton_may_cs2: old.ton_cs2,
      lech_cs1: old.lech_cs1,
      lech_cs2: old.lech_cs2,
      ton_thuc_cs1: old.ton_thuc_cs1,
      ton_thuc_cs2: old.ton_thuc_cs2,
      co_kiemton: !!old.co_kiemton,

      ban_cs1: s.ban_cs1,
      ban_cs2: s.ban_cs2
    };
  });

  out.sort((a, b) => {
    if (a.masp !== b.masp) return a.masp.localeCompare(b.masp, "vi");
    return String(a.size).localeCompare(String(b.size), "vi", { numeric: true });
  });

  return out;
}

function filterSuggestionRowsByTextarea(rows) {
  const { typeKeywords, maspKeywords } = splitTextareaKeywords();

  if (!typeKeywords.length && !maspKeywords.length) return rows;

  return rows.filter((row) => {
    const masp = normalizeMasp(row.masp);
    const chungloai = String(STATE.chungLoaiMap.get(masp) || "").trim().toUpperCase();

    const matchMasp = maspKeywords.some((kw) => masp.includes(kw));
    const matchType = typeKeywords.includes(chungloai);

    return matchMasp || matchType;
  });
}

/* =========================================================
   10) LẤY GỢI Ý
========================================================= */
async function layGoiY() {
  try {
    setGoiYStatus("Đang lấy dữ liệu gợi ý...", "loading");

    const maspsFromText = getMaspsFromTextarea();
    const nhomHangs = getSelectedNhomHangs();

    let masps = [];
    let sourceLabel = "";

    if (maspsFromText.length) {
      masps = maspsFromText;
      sourceLabel = `theo ${maspsFromText.length} mã sản phẩm nhập tay`;
    } else if (nhomHangs.length) {
      masps = await fetchMaspsByNhomHang(nhomHangs);
      sourceLabel = `theo nhóm hàng: ${nhomHangs.join(",")}`;

      if (!masps.length) {
        STATE.rows = [];
        renderBang();
        capNhatTong();
        setGoiYStatus(`Không tìm thấy mã sản phẩm nào thuộc nhóm: ${nhomHangs.join(",")}`, "warning");
        return;
      }
    } else {
      masps = await fetchMaspsByDateRange();
      sourceLabel = `theo khoảng ngày ${$("tu_ngay").value} đến ${$("den_ngay").value}`;
    }

    if (!masps.length) {
      STATE.rows = [];
      STATE.chungLoaiMap = new Map();
      STATE.allChungLoaiSet = new Set();
      renderBang();
      capNhatTong();
      setGoiYStatus("Không có mã sản phẩm để lấy gợi ý.", "warning");
      return;
    }

    const [xntRows, dmhhInfo] = await Promise.all([
      fetchXntRows(masps),
      fetchChungLoaiMap(masps)
    ]);

    STATE.chungLoaiMap = dmhhInfo.chungLoaiMap || new Map();
    STATE.allChungLoaiSet = dmhhInfo.allChungLoaiSet || new Set();

    STATE.rows = dedupeRowsByMaspSize(buildSuggestionRows({ xntRows }));

    renderBang();
    capNhatTong();
    $("hd_state").value = $("hd_state").value || "moi";

    if (!STATE.rows.length) {
      setGoiYStatus(
        `Đã kiểm tra ${masps.length} mã ${sourceLabel}, nhưng không có sản phẩm nào cần chuyển kho hướng ${PAGE_CFG.dir}.`,
        "warning"
      );
      return;
    }

    setGoiYStatus(
      `Đã tải thành công: ${STATE.rows.length} dòng gợi ý từ ${masps.length} mã ${sourceLabel}.`,
      "success"
    );

  } catch (e) {
    setGoiYStatus("Lỗi: không lấy được dữ liệu gợi ý chuyển kho.", "error");
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

    if (row.trang_thai_dong === "da_chuyen") {
      tr.style.background = "#fff3cd";
    }
    else if (row.co_kiemton) {
      tr.style.background = "#fff7cc";
    }
    else if (row.needReview) {
      tr.style.background = "#fff3cd";
    }

    if (row.done) tr.classList.add("done-row");
    if (idx === STATE.selectedIndex) tr.classList.add("highlight-row");

    tr.innerHTML = `
      <td><input type="checkbox" data-role="selected" data-idx="${idx}" ${row.selected ? "checked" : ""} ${row.trang_thai_dong === "da_chuyen" ? "disabled" : ""}></td>
      <td><input type="checkbox" data-role="done" data-idx="${idx}" ${row.done ? "checked" : ""} ${row.selected ? "" : "disabled"} ${row.trang_thai_dong === "da_chuyen" ? "disabled" : ""}></td>

      <td class="col-masp" data-role="open-stock" data-idx="${idx}">${escapeHtml(row.masp)}</td>
      
      <td>${escapeHtml(row.size)}</td>
      <td>${row.ton_nguon || ""}</td>
<td>${row.ton_dich || ""}</td>
      <td>${escapeHtml(row.huong_goiy)}</td>
      <td>${row.sl_goiy || ""}</td>
      <td class="col-slduyet"><input data-role="sl_duyet" data-idx="${idx}" value="${row.sl_duyet || ""}" ${row.trang_thai_dong === "da_chuyen" ? "disabled" : ""}></td>
      
            <td class="col-slthuc">
  <input data-role="sl_thuc"
    data-idx="${idx}"
    value="${row.sl_thuc || ""}"
    style="${row.needReview ? 'background:#ffeeba' : ''}"
    ${row.trang_thai_dong === "da_chuyen" ? "disabled" : ""}
  >
</td>
 <td class="col-manv"><input data-role="manv_phutrach" data-idx="${idx}" value="${escapeAttr(row.manv_phutrach)}" ${row.trang_thai_dong === "da_chuyen" ? "disabled" : ""}></td>
<td>${row.needReview ? "cần kiểm tra" : escapeHtml(row.trang_thai_dong)}</td>
<td class="col-ghichu"><input data-role="ghi_chu" data-idx="${idx}" value="${escapeAttr(row.ghi_chu)}" ${row.trang_thai_dong === "da_chuyen" ? "disabled" : ""}></td>
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
  updateHeaderCheckboxState();
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

      handleSelectedGroupLogic(idx, checked);

      renderBang();
      capNhatTong();
    });
  });

  document.querySelectorAll('[data-role="done"]').forEach((el) => {
    el.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.idx);
      const checked = !!e.target.checked;
      const row = STATE.rows[idx];

      // Không cho tích Xong nếu chưa tích Chọn
      if (checked && !row.selected) {
        alert("Phải tích chọn trước rồi mới được tích xong.");
        e.target.checked = false;
        return;
      }

      applyDoneState(row, checked);

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

  const chkAllSelected = $("check-all-selected");
  if (chkAllSelected && !chkAllSelected.dataset.bound) {
    chkAllSelected.dataset.bound = "1";
    chkAllSelected.addEventListener("click", (e) => e.stopPropagation());
    chkAllSelected.addEventListener("change", (e) => {
      setAllSelected(!!e.target.checked);
      renderBang();
      capNhatTong();
    });
  }

  const chkAllZeroTarget = $("check-all-zero-target");
  if (chkAllZeroTarget && !chkAllZeroTarget.dataset.bound) {
    chkAllZeroTarget.dataset.bound = "1";
    chkAllZeroTarget.addEventListener("click", (e) => e.stopPropagation());
    chkAllZeroTarget.addEventListener("change", (e) => {
      setSelectedZeroTargetOnly(!!e.target.checked);
      renderBang();
      capNhatTong();
    });
  }

  const chkAllDone = $("check-all-done");
  if (chkAllDone && !chkAllDone.dataset.bound) {
    chkAllDone.dataset.bound = "1";
    chkAllDone.addEventListener("click", (e) => e.stopPropagation());
    chkAllDone.addEventListener("change", (e) => {
      const checked = !!e.target.checked;

      const hasSelected = STATE.rows.some(r => !!r.selected);
      if (!hasSelected) {
        alert("Phải tích chọn ít nhất một dòng trước rồi mới được tích xong.");
        e.target.checked = false;
        e.target.indeterminate = false;
        return;
      }

      setAllDone(checked);
      renderBang();
      capNhatTong();
    });
  }
}

async function recheckAllRows() {
  try {
    if (!STATE.rows.length) return;

    const masps = uniq(STATE.rows.map(r => r.masp));
    const xntRows = await fetchXntRows(masps);

    const map = new Map();
    xntRows.forEach(r => {
      map.set(`${r.masp}__${r.size}`, r);
    });

    STATE.rows.forEach(row => {
      const key = `${row.masp}__${row.size}`;
      const x = map.get(key);
      if (!x) return;

      const goiy = calcGoiy(x.ton_cs1, x.ton_cs2);
      const newQty = calcMoveQty(x.ton_cs1, x.ton_cs2, goiy);

      const oldQty = toNumber(row.sl_duyet);

      if (goiy !== PAGE_CFG.dir || newQty <= 0) {
        row.needReview = true;
      } else if (newQty !== oldQty) {
        row.needReview = true;
      } else {
        row.needReview = false;
      }
    });

    renderBang();
    capNhatTong();

  } catch (err) {
    console.error("recheckAllRows error", err);
  }
}

function capNhatTong() {
  $("tong_dong").value = String(STATE.rows.length);
  $("tong_goiy").value = String(STATE.rows.reduce((s, r) => s + toNumber(r.sl_goiy), 0));
  $("tong_duyet").value = String(STATE.rows.reduce((s, r) => s + toNumber(r.sl_duyet), 0));
  $("tong_thuc").value = String(STATE.rows.reduce((s, r) => s + toNumber(r.sl_thuc), 0));
}

function updateHeaderCheckboxState() {
  const chkAllSelected = $("check-all-selected");
  const chkAllZeroTarget = $("check-all-zero-target");
  const chkAllDone = $("check-all-done");

  if (chkAllSelected) {
    if (!STATE.rows.length) {
      chkAllSelected.checked = false;
      chkAllSelected.indeterminate = false;
    } else {
      const selectedCount = STATE.rows.filter(r => !!r.selected).length;
      chkAllSelected.checked = selectedCount === STATE.rows.length;
      chkAllSelected.indeterminate = selectedCount > 0 && selectedCount < STATE.rows.length;
    }
  }

  if (chkAllZeroTarget) {
    const zeroTargetRows = STATE.rows.filter(r => toNumber(r.ton_dich) === 0);

    if (!zeroTargetRows.length) {
      chkAllZeroTarget.checked = false;
      chkAllZeroTarget.indeterminate = false;
    } else {
      const selectedZeroCount = zeroTargetRows.filter(r => !!r.selected).length;
      chkAllZeroTarget.checked = selectedZeroCount === zeroTargetRows.length;
      chkAllZeroTarget.indeterminate =
        selectedZeroCount > 0 && selectedZeroCount < zeroTargetRows.length;
    }
  }

  if (chkAllDone) {
    const selectedRows = STATE.rows.filter(r => !!r.selected);

    if (!selectedRows.length) {
      chkAllDone.checked = false;
      chkAllDone.indeterminate = false;
    } else {
      const doneCount = selectedRows.filter(r => !!r.done).length;
      chkAllDone.checked = doneCount === selectedRows.length;
      chkAllDone.indeterminate = doneCount > 0 && doneCount < selectedRows.length;
    }
  }
}

function updateTrangThaiPhieu() {
  if (!STATE.rows.length) return;

  const allDone = STATE.rows.every(r => r.done);

  if (allDone) {
    $("trang_thai").value = "dang_chuyen";
  } else {
    $("trang_thai").value = "da_giao";
  }
}


function applySelectedState(row, checked) {
  if (row.trang_thai_dong === "da_chuyen") return;

  row.selected = checked;

  if (checked) {
    row.sl_duyet = toNumber(row.sl_goiy);

    if (!row.done) {
      row.trang_thai_dong = "de_xuat";
    }
  } else {
    row.sl_duyet = 0;
    row.sl_thuc = 0;
    row.done = false;
    row.trang_thai_dong = "";
  }
}

function applyDoneState(row, checked) {
  if (row.trang_thai_dong === "da_chuyen") return;

  row.done = checked;
  row._dirty = true;

  const manvDangNhap = String($("manv")?.value || "").trim().toUpperCase();
  const tennvDangNhap = String($("tennv")?.value || "").trim();

  if (checked) {
    row.trang_thai_dong = "dang_chuyen";
    row.sl_thuc = toNumber(row.sl_duyet);
    row.manv_phutrach = manvDangNhap;
    row.tennv_phutrach = tennvDangNhap;
  } else {
    row.sl_thuc = 0;
    row.trang_thai_dong = row.selected ? "de_xuat" : "";
    row.manv_phutrach = "";
    row.tennv_phutrach = "";
  }

  updateTrangThaiPhieu();
}

function handleSelectedGroupLogic(idx, checked) {
  const row = STATE.rows[idx];
  if (!row) return;

  const masp = normalizeMasp(row.masp);

  // Luôn áp dụng cho dòng vừa thao tác trước
  applySelectedState(row, checked);

  // Chỉ có tick lên mới xét lan theo nhóm
  if (!checked) return;

  const sameRows = STATE.rows
    .map((r, i) => ({ r, i }))
    .filter(x => normalizeMasp(x.r.masp) === masp);

  const otherRows = sameRows.filter(x => x.i !== idx);

  // Nếu đã có ít nhất 1 dòng khác cùng mã đang check sẵn
  // thì không lan nữa, giữ nguyên trạng thái cũ
  const hasAnyOtherChecked = otherRows.some(x => !!x.r.selected);
  if (hasAnyOtherChecked) return;

  // Nếu tất cả dòng còn lại đều chưa check -> tick toàn bộ các dòng còn lại
  otherRows.forEach(x => applySelectedState(x.r, true));
}

function setAllSelected(checked) {
  STATE.rows.forEach(row => applySelectedState(row, checked));
}

function setSelectedZeroTargetOnly(checked) {
  STATE.rows.forEach((row) => {
    if (toNumber(row.ton_dich) === 0) {
      applySelectedState(row, checked);
    }
  });
}

function setAllDone(checked) {
  STATE.rows.forEach(row => {
    if (!row.selected) return; // chỉ xử lý các dòng đã chọn
    applyDoneState(row, checked);
  });
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
  const m = String(soCt || "").match(/^([a-z0-9_]+)_(\d{6})$/i);
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

async function luuPhieu(mode = "xong") {
  try {
    const soCt = $("sohd").value.trim();
    if (!soCt) {
      alert("Chưa có số chứng từ.");
      return;
    }

    const header = getHeaderPayload();

    // Chỉ giữ lại các dòng đã chọn
    const currentRows = dedupeRowsByMaspSize(
      mode === "giao"
        ? STATE.rows.filter(r => !!r.selected)
        : STATE.rows.filter(r =>
          r._dirty === true ||
          r.done === true ||
          r.trang_thai_dong === "dang_chuyen"
        )
    );

    if (!currentRows.length) {
      alert(
        mode === "giao"
          ? "Chưa có dòng nào được chọn để giao việc."
          : "Chưa có dòng nào được tích Xong để lưu."
      );
      return;
    }

    const details = currentRows.map((r, idx) => ({
      so_ct: soCt,
      stt: idx + 1,
      masp: r.masp,
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

    const isMoi = $("hd_state").value === "moi";
    const oldHeader = STATE.oldHeader ? deepClone(STATE.oldHeader) : null;
    const oldRows = STATE.oldRowsMap.size ? Array.from(STATE.oldRowsMap.values()).map(deepClone) : [];

    const { error: upsertHeaderErr } = await supabase
      .from("yeucau_chuyenkho")
      .upsert([header], { onConflict: "so_ct" });

    if (upsertHeaderErr) throw upsertHeaderErr;

    if (details.length) {
      const { error: upsertCtErr } = await supabase
        .from("yeucau_chuyenkho_ct")
        .upsert(details, { onConflict: "so_ct,masp,size" });

      if (upsertCtErr) throw upsertCtErr;
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

    alert("Đã lưu và mở lại phiếu chuyển kho.");

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

    const soCtCandidates = buildSoCtCandidates(soCt);

    const { data: hdList, error: errHd } = await supabase
      .from("yeucau_chuyenkho")
      .select("*")
      .in("so_ct", soCtCandidates)
      .limit(1);

    if (errHd) throw errHd;

    const hd = hdList?.[0];

    if (!hd) {
      alert(
        "Không tìm thấy phiếu: " + soCt +
        "\n\nĐã thử tìm các dạng:\n" + soCtCandidates.join("\n")
      );
      return;
    }

    const { data: ct, error: errCt } = await supabase
      .from("yeucau_chuyenkho_ct")
      .select("*")
      .eq("so_ct", hd.so_ct)
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

    const loadedRows = (ct || []).map((r) => {
      const row = {
        selected: true,
        done: !!r.done,
        needReview: false,
        masp: normalizeMasp(r.masp),
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

    STATE.rows = dedupeRowsByMaspSize(loadedRows);

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
      trang_thai_dong: r.done ? "dang_chuyen" : "de_xuat",
    }));

    STATE.rows = rowsToSave;
    STATE.selectedIndex = STATE.rows.length ? 0 : -1;

    $("trang_thai").value = "da_giao";

    renderBang();
    capNhatTong();
    await luuPhieu("giao");
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

      r.trang_thai_dong = "dang_chuyen";

      r.sl_thuc = toNumber(r.sl_duyet);
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
  const rows = STATE.rows.filter((r) =>
    r.trang_thai_dong === "dang_chuyen" && toNumber(r.sl_thuc) > 0
  );
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

async function taoPhieuCCN() {
  try {
    await luuPhieu();

    const payload = buildCcnPayloadFromDoneRows();
    if (!payload) {
      alert("Không có dòng đang chuyển hợp lệ để tạo phiếu CCN.");
      return;
    }

    const key = "ccn_prefill_payload";
    localStorage.setItem(key, JSON.stringify(payload));

    console.log("[ChuyenKho] Đã ghi payload CCN:", payload);

    window.open(PAGE_CFG.ccnTargetUrl, "_blank");
  } catch (e) {
    showError("Không tạo được phiếu CCN.", e);
  }
}

/* =========================================================
   18) XÓA DÒNG / TỒN NHANH
========================================================= */
function xoaDongDangChon() {
  // Trường hợp 1: đã click chọn 1 dòng trong bảng
  if (STATE.selectedIndex >= 0) {
    const row = STATE.rows[STATE.selectedIndex];

    if (row?.trang_thai_dong === "da_chuyen") {
      alert("Dòng đã chuyển không được phép xóa.");
      return;
    }

    STATE.rows.splice(STATE.selectedIndex, 1);
    STATE.selectedIndex = -1;
    renderBang();
    capNhatTong();
    return;
  }

  // Trường hợp 2: chưa click dòng nào, nhưng có tick checkbox ở cột Chọn
  const selectedCount = STATE.rows.filter(r => !!r.selected).length;

  if (selectedCount > 0) {
    const unselectedCount = STATE.rows.length - selectedCount;

    if (unselectedCount <= 0) {
      alert("Tất cả các dòng đều đã được chọn, không có dòng chưa chọn để xóa.");
      return;
    }

    const ok = confirm(
      `Bạn có muốn xóa ${unselectedCount} dòng chưa chọn không?\n\n` +
      `Hệ thống sẽ giữ lại ${selectedCount} dòng đã chọn.`
    );

    if (!ok) return;

    STATE.rows = STATE.rows.filter(r => !!r.selected);
    STATE.selectedIndex = -1;

    renderBang();
    capNhatTong();
    return;
  }

  // Trường hợp 3: chưa click dòng nào và cũng chưa tick dòng nào
  alert("Chưa chọn dòng nào để xóa.");
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
