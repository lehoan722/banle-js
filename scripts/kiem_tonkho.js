import {
    playSuccessBeep,
    playWaitSizeBeep,
    playAlertBeep,
    setupBeepUnlockOnce
} from "./soundBeep.js";

import "./stockQuickPopup.js";

// scripts/nhapkiemkho.js 
(function () {
    "use strict";

    const CFG = {
        ...getBranchInfoFromPath(),
        ...(window.KIEM_TON_CONFIG || {})
    };

    function getBranchInfoFromPath() {
        const path = String(window.location.pathname || "").toLowerCase();
        const fileName = path.split("/").pop() || "";

        const isCs1 = /cs1(?=\.html?$|[_-]?)/.test(fileName);
        const isCs2 = /cs2(?=\.html?$|[_-]?)/.test(fileName);

        let branch = "cs1";
        if (isCs2) branch = "cs2";
        else if (isCs1) branch = "cs1";

        const pageId = `kiemton_${branch}`;
        const soPhieuPrefix = branch === "cs1" ? "ktkcs1_" : "ktkcs2_";

        return {
            branch,
            pageId,
            soPhieuPrefix,
            title: `KIỂM TỒN KHO ${branch.toUpperCase()}`
        };
    }


    // =========================
    // STATE
    // =========================

    window.kiemTonState = {
        nhap: {},          // kiểm kho thường
        bayMau: {},        // kiểm bày mẫu
        xuat: {},
        ketQua: {},
        nhapOrder: [],
        xuatOrder: [],
        selectedMasp: "",
        dmMaspCache: new Map(),
        daKiemTra: false,
        thoiDiemChotTon: null
    };

    let dangChonSizeTrongPopup = false;

    // =========================
    // GOOGLE SHEET KIỂM MẪU
    // =========================
    const BAY_MAU_SHEET_CONFIG = {
        cs1: {
            spreadsheetId: "1JI3BMl8jsc__bCTH_HA-6uNWtReBy0zpDMGkqsX1JpA",
            gid: "1239758850",
            sheetName: "BAYMAUCS1"
        },
        cs2: {
            spreadsheetId: "1VLsPb3yVtQzoc_rBm0f7bKRaaSt4Tq21A2j3ISgwWk8",
            gid: "1391280527",
            sheetName: "BAYMAUCS2"
        }
    };

    function getBayMauSheetConfig() {
        return BAY_MAU_SHEET_CONFIG[CFG.branch] || BAY_MAU_SHEET_CONFIG.cs1;
    }

    function getBayMauCsvUrl() {
        const cfg = getBayMauSheetConfig();
        return `https://docs.google.com/spreadsheets/d/${cfg.spreadsheetId}/gviz/tq?tqx=out:csv&gid=${cfg.gid}`;
    }

    const KIEM_KHO_SHEET_CONFIG = {
        cs1: {
            spreadsheetId: "1JI3BMl8jsc__bCTH_HA-6uNWtReBy0zpDMGkqsX1JpA",
            gid: "1596489919",
            sheetName: "KIEMKHOCS1"
        },
        cs2: {
            spreadsheetId: "1VLsPb3yVtQzoc_rBm0f7bKRaaSt4Tq21A2j3ISgwWk8",
            gid: "1009415488",
            sheetName: "KIEMKHOCS2"
        }
    };

    function getKiemKhoSheetConfig() {
        return KIEM_KHO_SHEET_CONFIG[CFG.branch] || KIEM_KHO_SHEET_CONFIG.cs1;
    }

    function getKiemKhoCsvUrl() {
        const cfg = getKiemKhoSheetConfig();
        return `https://docs.google.com/spreadsheets/d/${cfg.spreadsheetId}/gviz/tq?tqx=out:csv&gid=${cfg.gid}`;
    }

    const VALID_BAY_MAU_SIZES = new Set(["38", "39", "40", "41", "42", "43", "44", "45"]);

    function isValidBayMauSheetSize(v) {
        return VALID_BAY_MAU_SIZES.has(String(v || "").trim());
    }

    function parseCsvLineSimple(line) {
        const out = [];
        let cur = "";
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];

            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === "," && !inQuotes) {
                out.push(cur);
                cur = "";
            } else {
                cur += ch;
            }
        }

        out.push(cur);
        return out.map(x => String(x || "").trim());
    }

    async function docDanhSachBayMauTuGoogleSheet() {
        const cfg = getBayMauSheetConfig();
        const csvUrl = getBayMauCsvUrl();

        const res = await fetch(csvUrl, { cache: "no-store" });
        if (!res.ok) {
            throw new Error(
                `Không đọc được Google Sheet kiểm mẫu ${cfg.sheetName} (${res.status})`
            );
        }
        if (!res.ok) {
            throw new Error(`Không đọc được Google Sheet kiểm mẫu (${res.status})`);
        }

        const raw = await res.text();
        const csv = raw.replace(/^\uFEFF/, "");
        const lines = csv.split(/\r?\n/).filter(x => String(x || "").trim());

        if (!lines.length) return new Map();

        let start = 0;
        const first = String(lines[0] || "").toLowerCase();
        if (first.includes("mã") || first.includes("masp") || first.includes("size")) {
            start = 1;
        }

        const map = new Map();

        for (let i = start; i < lines.length; i++) {
            const cols = parseCsvLineSimple(lines[i]);
            const masp = normalizeMasp(cols[0] || "");
            const sizeRaw = String(cols[1] || "").trim();

            if (!masp) continue;

            if (!map.has(masp)) {
                map.set(masp, []);
            }

            map.get(masp).push(sizeRaw);
        }

        return map;
    }

    async function docDanhSachKiemKhoTuGoogleSheet() {
        const cfg = getKiemKhoSheetConfig();
        const csvUrl = getKiemKhoCsvUrl();

        const res = await fetch(csvUrl, { cache: "no-store" });
        if (!res.ok) {
            throw new Error(
                `Không đọc được Google Sheet kiểm kho ${cfg.sheetName} (${res.status})`
            );
        }

        const raw = await res.text();
        const csv = raw.replace(/^\uFEFF/, "");
        const lines = csv.split(/\r?\n/).filter(x => String(x || "").trim());

        if (!lines.length) return new Map();

        let start = 0;
        const first = String(lines[0] || "").toLowerCase();
        if (first.includes("mã") || first.includes("ma sp") || first.includes("masp") || first.includes("size")) {
            start = 1;
        }

        const map = new Map();

        for (let i = start; i < lines.length; i++) {
            const cols = parseCsvLineSimple(lines[i]);
            const masp = normalizeMasp(cols[0] || "");
            const sizeRaw = String(cols[1] || "").trim();

            if (!masp) continue;

            const sizeToSave = isValidSize(sizeRaw) ? normalizeSize(sizeRaw) : "0";

            if (!map.has(masp)) {
                map.set(masp, []);
            }

            map.get(masp).push(sizeToSave);
        }

        return map;
    }

    // =========================
    // AUDIO CẢNH BÁO
    // =========================
    // =========================
    // AUDIO (NEW - SOUND BEEP)
    // =========================
    function phatAmThanhLoi() {
        try { playAlertBeep(); } catch (e) { }
    }

    function phatAmThanhSize() {
        try { playWaitSizeBeep(); } catch (e) { }
    }

    function phatAmThanhThanhCong() {
        try { playSuccessBeep(); } catch (e) { }
    }



    // ========================= 
    // HELPERS
    // =========================
    function byId(id) {
        return document.getElementById(id);
    }

    // ✅ helper an toàn
    function safeEl(id) {
        return document.getElementById(id) || null;
    }

    function safeSetStyle(id, fn) {
        const el = document.getElementById(id);
        if (!el) return;
        fn(el);
    }

    function focusInputAtEnd(el) {
        if (!el) return;
        el.focus();

        try {
            const len = String(el.value || "").length;
            el.setSelectionRange(len, len);
        } catch (err) { }
    }

    function normalizeMasp(v) {
        let s = String(v || "").trim().toUpperCase();

        // Nếu mã có hậu tố sau dấu "_" như REDLEO-DEN_43
        // thì chỉ lấy phần trước dấu "_"
        const idx = s.indexOf("_");
        if (idx > -1) {
            s = s.slice(0, idx).trim();
        }

        return s;
    }

    function isPhieuDangXem() {
        const hdState = document.getElementById("hd_state");
        const v = String(hdState?.value || hdState?.getAttribute("data-state") || "")
            .trim()
            .toLowerCase();
        return v === "xem";
    }

    function getCurrentUserInfo() {
        return {
            manv: String(localStorage.getItem("manv") || byId("manv")?.value || "").trim(),
            tennv: String(localStorage.getItem("tennv") || byId("tennv")?.value || "").trim()
        };
    }

    function getNhapKiemPageUrl() {
        return CFG.branch === "cs2" ? "nhapkiemcs2.html" : "nhapkiemcs1.html";
    }

    function getXuatKiemPageUrl() {
        return CFG.branch === "cs2" ? "xuatkiemcs2.html" : "xuatkiemcs1.html";
    }

    function normalizeSize(v) {
        return String(v || "").trim();
    }
    const VALID_SIZES = new Set(["0", "38", "39", "40", "41", "42", "43", "44", "45"]);

    function isValidSize(size) {
        return VALID_SIZES.has(normalizeSize(size));
    }

    function makeKey(masp, size) {
        return `${normalizeMasp(masp)}@@${normalizeSize(size)}`;
    }

    function splitKey(key) {
        const [masp = "", size = ""] = String(key || "").split("@@");
        return {
            masp: normalizeMasp(masp),
            size: normalizeSize(size)
        };
    }

    function parseSizeSlText(text) {
        const raw = String(text || "").trim();
        if (!raw) return [];

        const parts = raw
            .split(/\s+/)
            .map(x => x.trim())
            .filter(Boolean);

        const out = [];

        for (const part of parts) {
            const m = part.match(/^(.+?)\/(-?\d+(?:[.,]\d+)?)$/);
            if (!m) continue;

            const size = normalizeSize(m[1]);
            const sl = normalizeNumber(m[2]);

            if (!size) continue;
            if (!isValidSize(size)) continue;
            if (sl <= 0) continue;

            out.push({ size, sl });
        }

        return out;
    }

    function hasRealSizeItems(items) {
        return (items || []).some(x => {
            const size = normalizeSize(x.size);
            return size && size !== "0";
        });
    }

    function getAvailableSizesForMasp(masp) {
        masp = normalizeMasp(masp);
        if (!masp) return [];

        const state = getState();
        const sizeMap = new Map();

        Object.keys(state.xuat || {}).forEach((key) => {
            const row = state.xuat[key];
            if (!row) return;
            if (normalizeMasp(row.masp) !== masp) return;

            const size = normalizeSize(row.size);
            const sl = normalizeNumber(row.sl);
            if (!size) return;

            sizeMap.set(size, {
                size,
                slXuat: sl,
                slNhap: 0
            });
        });

        Object.keys(state.nhap || {}).forEach((key) => {
            const row = state.nhap[key];
            if (!row) return;
            if (normalizeMasp(row.masp) !== masp) return;

            const size = normalizeSize(row.size);
            const sl = normalizeNumber(row.sl);
            if (!size) return;

            if (!sizeMap.has(size)) {
                sizeMap.set(size, {
                    size,
                    slXuat: 0,
                    slNhap: sl
                });
            } else {
                sizeMap.get(size).slNhap = sl;
            }
        });

        Object.keys(state.bayMau || {}).forEach((key) => {
            const row = state.bayMau[key];
            if (!row) return;
            if (normalizeMasp(row.masp) !== masp) return;

            const size = normalizeSize(row.size);
            const sl = normalizeNumber(row.sl);
            if (!size) return;

            if (!sizeMap.has(size)) {
                sizeMap.set(size, {
                    size,
                    slXuat: 0,
                    slNhap: sl
                });
            } else {
                sizeMap.get(size).slNhap += sl;
            }
        });

        const arr = Array.from(sizeMap.values());
        arr.sort((a, b) => {
            const na = Number(a.size);
            const nb = Number(b.size);
            if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
            return String(a.size).localeCompare(String(b.size), "vi");
        });

        return arr;
    }

    function hideSizePopup() {
        const popup = byId("popup_size");
        if (!popup) return;
        popup.style.display = "none";
        popup.innerHTML = "";
    }

    async function themNhanhTheoSize(size, giuPopup = true) {
        const maspEl = byId("masp");
        const sizeEl = byId("size");
        const slEl = byId("soluong");

        const masp = normalizeMasp(maspEl?.value);
        const sizeVal = normalizeSize(size);
        const sl = normalizeNumber(slEl?.value || 1) || 1;

        if (!masp) return;
        if (!(await baoLoiNeuMaspKhongCoTrongDanhMuc(masp))) return;

        if (!isValidSize(sizeVal)) {
            phatAmThanhLoi();
            alert("Size không hợp lệ. Chỉ được nhập: 0, 38, 39, 40, 41, 42, 43, 44, 45");
            return;
        }

        const key = makeKey(masp, sizeVal);
        const state = getState();
        const targetMapName = isKiemMauMode() ? "bayMau" : "nhap";
        const targetMap = state[targetMapName] || (state[targetMapName] = {});

        const isNewMasp =
            !Object.values(state.nhap || {}).some(r => normalizeMasp(r?.masp) === masp) &&
            !Object.values(state.bayMau || {}).some(r => normalizeMasp(r?.masp) === masp);

        if (!targetMap[key]) {
            targetMap[key] = { masp, size: sizeVal, sl };
        } else {
            targetMap[key].sl = normalizeNumber(targetMap[key].sl) + sl;
        }

        if (isNewMasp) {
            state.nhapOrder = ensureMaspAtTop(state.nhapOrder, masp);
        }

        delete state.ketQua[key];
        renderBangKetQua();
        phatAmThanhThanhCong();

        if (sizeEl) sizeEl.value = "";
        if (slEl) slEl.value = "1";

        if (giuPopup && sizeEl) {
            setTimeout(() => {
                sizeEl.focus();
                showSizePopup(masp, "");
            }, 0);
        }
    }

    async function themNhanhKhongCanSize() {
        const maspEl = byId("masp");
        const slEl = byId("soluong");

        const masp = normalizeMasp(maspEl?.value);
        const sl = normalizeNumber(slEl?.value || 1) || 1;

        if (!masp) return;
        if (!(await baoLoiNeuMaspKhongCoTrongDanhMuc(masp))) return;

        const key = makeKey(masp, "0");
        const state = getState();
        const targetMapName = isKiemMauMode() ? "bayMau" : "nhap";
        const targetMap = state[targetMapName] || (state[targetMapName] = {});

        const isNewMasp =
            !Object.values(state.nhap || {}).some(r => normalizeMasp(r?.masp) === masp) &&
            !Object.values(state.bayMau || {}).some(r => normalizeMasp(r?.masp) === masp);

        if (!targetMap[key]) {
            targetMap[key] = {
                masp,
                size: "0",
                sl
            };
        } else {
            targetMap[key].sl = normalizeNumber(targetMap[key].sl) + sl;
        }

        if (isNewMasp) {
            state.nhapOrder = ensureMaspAtTop(state.nhapOrder, masp);
        }

        delete state.ketQua[key];
        renderBangKetQua();
        phatAmThanhThanhCong();

        if (slEl) slEl.value = "1";

        if (maspEl) {
            maspEl.value = masp;
            maspEl.focus();

            setTimeout(() => {
                try {
                    maspEl.select();
                } catch (err) { }
            }, 0);
        }

        hideSizePopup();
    }

    function showSizePopup(masp, keyword = "") {
        const popup = byId("popup_size");
        const sizeEl = byId("size");

        if (!popup || !sizeEl) return;

        const list = getAvailableSizesForMasp(masp);
        const kw = normalizeSize(keyword).toLowerCase();

        const filtered = list.filter(item =>
            !kw || String(item.size).toLowerCase().includes(kw)
        );

        if (!filtered.length) {
            hideSizePopup();
            return;
        }

        popup.innerHTML = "";

        filtered.forEach(item => {
            const row = document.createElement("div");
            row.style.padding = "6px 8px";
            row.style.borderBottom = "1px solid #eee";
            row.style.cursor = "pointer";
            row.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:8px;">
        <b>${escapeHtml(item.size)}</b>
        <span>X:${item.slXuat} | N:${item.slNhap}</span>
      </div>
    `;

            row.addEventListener("mouseenter", () => {
                row.style.background = "#f2f2f2";
            });

            row.addEventListener("mouseleave", () => {
                row.style.background = "#fff";
            });

            row.addEventListener("mousedown", (e) => {
                e.preventDefault(); // tránh blur làm popup tắt trước
            });

            row.addEventListener("click", () => {
                dangChonSizeTrongPopup = true;
                themNhanhTheoSize(item.size, true);

                setTimeout(() => {
                    dangChonSizeTrongPopup = false;
                }, 0);
            });

            popup.appendChild(row);
        });

        popup.style.display = "block";
    }

    function splitKey(key) {
        const [masp = "", size = ""] = String(key || "").split("@@");
        return {
            masp: normalizeMasp(masp),
            size: normalizeSize(size)
        };
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

    function formatDateTimeVN(input) {
        if (!input) return "";

        const d = new Date(input);
        if (Number.isNaN(d.getTime())) return "";

        const vn = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));

        const yyyy = vn.getFullYear();
        const mm = String(vn.getMonth() + 1).padStart(2, "0");
        const dd = String(vn.getDate()).padStart(2, "0");
        const hh = String(vn.getHours()).padStart(2, "0");
        const mi = String(vn.getMinutes()).padStart(2, "0");

        return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    }

    function getState() {
        return window.kiemTonState;
    }

    function isKiemMauMode() {
        return !!document.getElementById("chkKiemMau")?.checked;
    }

    function getMapNhapTong() {
        const state = getState();
        const out = {};

        const addMap = (mapObj) => {
            Object.keys(mapObj || {}).forEach((key) => {
                const row = mapObj[key];
                if (!row) return;

                if (!out[key]) {
                    out[key] = {
                        masp: normalizeMasp(row.masp),
                        size: normalizeSize(row.size),
                        sl: normalizeNumber(row.sl)
                    };
                } else {
                    out[key].sl += normalizeNumber(row.sl);
                }
            });
        };

        addMap(state.nhap || {});
        addMap(state.bayMau || {});

        return out;
    }

    function capNhatUIKiemMau() {
        const lbl = document.getElementById("lblKiemMau");
        const checked = isKiemMauMode();
        if (!lbl) return;

        lbl.style.background = checked ? "#e8f7ff" : "#fff";
        lbl.style.borderColor = checked ? "#0b57d0" : "#999";
        lbl.style.color = checked ? "#0b57d0" : "#000";
        lbl.style.fontWeight = checked ? "700" : "400";
    }

    async function kiemTraMaspTrongDanhMuc(masp) {
        const m = normalizeMasp(masp);
        if (!m) return false;

        const state = getState();

        if (state.dmMaspCache instanceof Map && state.dmMaspCache.has(m)) {
            return state.dmMaspCache.get(m) === true;
        }

        if (!window.supabase) {
            console.warn("[KNK] Không có Supabase để kiểm tra mã sản phẩm.");
            return false;
        }

        const { data, error } = await window.supabase
            .from("dmhanghoa")
            .select("masp")
            .eq("masp", m)
            .limit(1);

        if (error) {
            console.error("[KNK] kiemTraMaspTrongDanhMuc error:", error);
            throw error;
        }

        const ok = Array.isArray(data) && data.length > 0;

        if (state.dmMaspCache instanceof Map) {
            state.dmMaspCache.set(m, ok);
        }

        return ok;
    }

    async function baoLoiNeuMaspKhongCoTrongDanhMuc(masp) {
        const m = normalizeMasp(masp);
        if (!m) return true;

        try {
            const ok = await kiemTraMaspTrongDanhMuc(m);
            if (ok) return true;

            phatAmThanhLoi();
            alert(`Mã sản phẩm (${m}) không có trong danh mục hàng hóa, không được nhập.`);
            focusVaBoiDenOmaSanPham();
            return false;
        } catch (err) {
            phatAmThanhLoi();
            console.error("[KNK] Lỗi kiểm tra mã sản phẩm:", err);
            alert("Lỗi khi kiểm tra mã sản phẩm trong danh mục hàng hóa.");
            focusVaBoiDenOmaSanPham();
            return false;
        }
    }


    async function layMapHoaDonDaKiem() {
        if (!window.supabase) return new Map();

        const { data, error } = await window.supabase
            .from("kiem_nhap_kho")
            .select("sohdccn, nhanvienkiem, created_at");

        if (error) {
            console.error("[KNK] layMapHoaDonDaKiem error:", error);
            return new Map();
        }

        const map = new Map();

        (data || []).forEach((row) => {
            const raw = String(row.sohdccn || "").trim();
            if (!raw) return;

            raw.split(";").forEach((item) => {
                const sohd = String(item || "").trim();
                if (!sohd) return;

                map.set(sohd, {
                    nhanvienkiem: String(row.nhanvienkiem || "").trim(),
                    created_at: row.created_at || null
                });
            });
        });

        return map;
    }

    async function taoSoPhieuMoi() {
        const prefix = String(CFG.soPhieuPrefix || "ktkcs1_").trim();

        if (!window.supabase) {
            return `${prefix}00001`;
        }

        const { data, error } = await window.supabase
            .from("kiem_ton_kho")
            .select("so_phieu")
            .ilike("so_phieu", `${prefix}%`);

        if (error) {
            console.error("[KTK] taoSoPhieuMoi error:", error);
            return `${prefix}00001`;
        }

        let maxSo = 0;

        (data || []).forEach((row) => {
            const so = String(row.so_phieu || "").trim();
            if (!so.startsWith(prefix)) return;

            const tail = so.slice(prefix.length);
            const n = Number(tail);

            if (Number.isFinite(n) && n > maxSo) {
                maxSo = n;
            }
        });

        const next = String(maxSo + 1).padStart(5, "0");
        return `${prefix}${next}`;
    }

    function updateTitle() {
        document.title = CFG.title || document.title;
    }

    function setDefaultBranchInfo() {
        const diadiem = byId("diadiem");
        if (diadiem && !diadiem.value) diadiem.value = CFG.branch || "";

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

    function ensureMaspAtTop(orderArr, masp) {
        const m = normalizeMasp(masp);
        if (!m) return Array.isArray(orderArr) ? orderArr : [];

        const arr = Array.isArray(orderArr) ? orderArr.filter(x => normalizeMasp(x) !== m) : [];
        arr.unshift(m);
        return arr;
    }

    function ensureMaspAtEnd(orderArr, masp) {
        const m = normalizeMasp(masp);
        if (!m) return Array.isArray(orderArr) ? orderArr : [];

        const arr = Array.isArray(orderArr) ? orderArr.filter(x => normalizeMasp(x) !== m) : [];
        arr.push(m);
        return arr;
    }

    function buildOrderedMasps(nhapGroupMap, xuatGroupMap, state) {
        const nhapOrder = Array.isArray(state.nhapOrder) ? state.nhapOrder.map(normalizeMasp).filter(Boolean) : [];
        const xuatOrder = Array.isArray(state.xuatOrder) ? state.xuatOrder.map(normalizeMasp).filter(Boolean) : [];

        const allSet = new Set([
            ...Object.keys(nhapGroupMap || {}),
            ...Object.keys(xuatGroupMap || {})
        ]);

        const result = [];
        const pushed = new Set();

        const pushOne = (masp) => {
            const m = normalizeMasp(masp);
            if (!m) return;
            if (!allSet.has(m)) return;
            if (pushed.has(m)) return;
            pushed.add(m);
            result.push(m);
        };

        nhapOrder.forEach(pushOne);
        xuatOrder.forEach(pushOne);

        Array.from(allSet).forEach(pushOne);

        return result;
    }

    function getSortWeightByTrangThai(trangthai) {
        const tt = String(trangthai || "").trim().toUpperCase();
        if (tt === "THUA") return 1;

        if (tt === "THIEU") return 2;

        if (tt === "LECH") return 3;
        if (tt === "OK") return 4;
        return 5;
    }

    function sapXepLaiThuTuMaspTheoKetQua() {
        const state = getState();
        const nhapGroupMap = groupByMasp(state.nhap || {});
        const xuatGroupMap = groupByMasp(state.xuat || {});
        const ketQuaMap = state.ketQua || {};

        const allMasps = buildOrderedMasps(nhapGroupMap, xuatGroupMap, state);

        allMasps.sort((a, b) => {
            const kqA = buildKetQuaTheoMasp(nhapGroupMap[a], xuatGroupMap[a], ketQuaMap);
            const kqB = buildKetQuaTheoMasp(nhapGroupMap[b], xuatGroupMap[b], ketQuaMap);

            const wA = getSortWeightByTrangThai(kqA?.trangthai);
            const wB = getSortWeightByTrangThai(kqB?.trangthai);

            if (wA !== wB) return wA - wB;

            return String(a || "").localeCompare(String(b || ""), "vi");
        });

        state.nhapOrder = [...allMasps];
    }

    function getSortWeightByTrangThai(trangthai) {
        const tt = String(trangthai || "").trim().toUpperCase();
        if (tt === "THUA") return 1;

        if (tt === "THIEU") return 2;

        if (tt === "LECH") return 3;
        if (tt === "OK") return 4;
        return 5;
    }

    function sapXepLaiThuTuMaspTheoKetQua() {
        const state = getState();
        const nhapGroupMap = groupByMasp(state.nhap || {});
        const xuatGroupMap = groupByMasp(state.xuat || {});
        const ketQuaMap = state.ketQua || {};

        const allMasps = buildOrderedMasps(nhapGroupMap, xuatGroupMap, state);

        allMasps.sort((a, b) => {
            const kqA = buildKetQuaTheoMasp(nhapGroupMap[a], xuatGroupMap[a], ketQuaMap);
            const kqB = buildKetQuaTheoMasp(nhapGroupMap[b], xuatGroupMap[b], ketQuaMap);

            const wA = getSortWeightByTrangThai(kqA?.trangthai);
            const wB = getSortWeightByTrangThai(kqB?.trangthai);

            if (wA !== wB) return wA - wB;

            return String(a || "").localeCompare(String(b || ""), "vi");
        });

        state.nhapOrder = [...allMasps];
    }

    function tinhThongKeTheoMap(mapObj) {
        const maspSet = new Set();
        let tongSl = 0;

        Object.values(mapObj || {}).forEach((row) => {
            const masp = normalizeMasp(row?.masp);
            const sl = normalizeNumber(row?.sl || 0);

            if (!masp || sl <= 0) return;

            maspSet.add(masp);
            tongSl += sl;
        });

        return {
            soMa: maspSet.size,
            tongSl
        };
    }

    function capNhatThongKeDauTrang() {
        const el = byId("thongke_dautrang");
        if (!el) return;

        const state = getState();
        const tkNhap = tinhThongKeTheoMap(getMapNhapTong());
        const tkXuat = tinhThongKeTheoMap(state.xuat || {});

        el.textContent = `Kiểm: ${tkNhap.soMa}/${tkNhap.tongSl} , Tồn máy: ${tkXuat.soMa}/${tkXuat.tongSl}`;
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
        const masp = normalizeMasp(nhapGroup?.masp || xuatGroup?.masp || "");

        const allSizeKeys = new Set([
            ...((nhapGroup?.items || []).map(x => x.key)),
            ...((xuatGroup?.items || []).map(x => x.key))
        ]);

        const thieuParts = [];
        const thuaParts = [];
        let tongThieu = 0;
        let tongThua = 0;
        let hasOk = false;
        let hasAnyKetQua = false;

        for (const key of allSizeKeys) {
            const kq = ketQuaMap[key];
            if (!kq) continue;

            hasAnyKetQua = true;

            const { size } = splitKey(key);
            const diff = normalizeNumber(kq.chitiet || 0);

            if (kq.trangthai === "THIEU") {
                tongThieu += diff;
                thieuParts.push(`${size}/${diff}`);
            } else if (kq.trangthai === "THUA") {
                tongThua += diff;
                thuaParts.push(`${size}/${diff}`);
            } else if (kq.trangthai === "OK") {
                hasOk = true;
            }
        }

        // Fallback cho trường hợp kiểm theo tổng hoặc nhập trống nhưng xuất có dữ liệu
        // Fallback cho trường hợp kiểm theo tổng hoặc nhập trống nhưng xuất có dữ liệu
        if (!hasAnyKetQua && masp) {
            const keyTong = makeKey(masp, "0");
            const kqTong = ketQuaMap[keyTong];

            if (kqTong) {
                const diff = normalizeNumber(kqTong.chitiet || 0);
                const tongNhap = tongSoLuong(nhapGroup?.items || []);
                const xuatItems = Array.isArray(xuatGroup?.items) ? xuatGroup.items : [];

                if (kqTong.trangthai === "THIEU") {
                    // Nếu bên nhập trống hoàn toàn thì hiện chi tiết đúng theo toàn bộ size/sl của bên xuất
                    if (tongNhap <= 0 && xuatItems.length > 0) {
                        return {
                            trangthai: "THIEU",
                            chitiet: xuatItems.map(x => `${x.size}/${x.sl}`).join(" ")
                        };
                    }

                    return {
                        trangthai: "THIEU",
                        chitiet: diff > 0 ? `0/${diff}` : ""
                    };
                }

                if (kqTong.trangthai === "THUA") {
                    return {
                        trangthai: "THUA",
                        chitiet: diff > 0 ? `0/${diff}` : ""
                    };
                }

                if (kqTong.trangthai === "OK") {
                    return { trangthai: "OK", chitiet: "" };
                }
            }
        }

        if (tongThieu > 0 && tongThua === 0) {
            return {
                trangthai: "THIEU",
                chitiet: thieuParts.join(" ")
            };
        }

        if (tongThua > 0 && tongThieu === 0) {
            return {
                trangthai: "THUA",
                chitiet: thuaParts.join(" ")
            };
        }

        if (tongThieu === 0 && tongThua === 0 && hasOk) {
            return { trangthai: "OK", chitiet: "" };
        }

        if (tongThieu > 0 && tongThua > 0) {
            return {
                trangthai: "LECH",
                chitiet: `Thiếu: ${thieuParts.join(" ")} | Thừa: ${thuaParts.join(" ")}`
            };
        }

        return { trangthai: "", chitiet: "" };
    }

    function buildGoiYDieuChinhCCN(nhapGroup, xuatGroup, ketQuaMap) {
        const masp = normalizeMasp(nhapGroup?.masp || xuatGroup?.masp || "");
        if (!masp) return "";

        const allSizeKeys = new Set([
            ...((nhapGroup?.items || []).map(x => x.key)),
            ...((xuatGroup?.items || []).map(x => x.key))
        ]);

        const dsThieu = [];
        const dsThua = [];

        let tongNhap = tongSoLuong(nhapGroup?.items || []);
        let tongXuat = tongSoLuong(xuatGroup?.items || []);

        // Chỉ gợi ý khi tổng bằng nhau
        if (tongNhap !== tongXuat) return "";

        for (const key of allSizeKeys) {
            const kq = ketQuaMap[key];
            if (!kq) continue;

            const { size } = splitKey(key);
            const diff = normalizeNumber(kq.chitiet || 0);
            const tt = String(kq.trangthai || "").toUpperCase();

            if (!size || size === "0" || diff <= 0) continue;

            if (tt === "THIEU") {
                dsThieu.push({ size, sl: diff });
            } else if (tt === "THUA") {
                dsThua.push({ size, sl: diff });
            }
        }

        if (!dsThieu.length || !dsThua.length) return "";

        dsThieu.sort((a, b) => Number(a.size) - Number(b.size));
        dsThua.sort((a, b) => Number(a.size) - Number(b.size));

        const goiY = [];
        let i = 0;
        let j = 0;

        while (i < dsThieu.length && j < dsThua.length) {
            const thieu = dsThieu[i];
            const thua = dsThua[j];

            const sl = Math.min(thieu.sl, thua.sl);
            if (sl > 0) {
                goiY.push(`Đổi ${thieu.size} -> ${thua.size} (${sl})`);
                thieu.sl -= sl;
                thua.sl -= sl;
            }

            if (thieu.sl <= 0) i++;
            if (thua.sl <= 0) j++;
        }

        if (!goiY.length) return "";

        return goiY.join(" | ");
    }

    function renderBangKetQua() {
        const tbody = document.querySelector("#bangketqua tbody");
        if (!tbody) return;

        const state = getState();
        const nhapKhoMap = state.nhap || {};
        const bayMauMap = state.bayMau || {};
        const nhapTongMap = getMapNhapTong();
        const xuatMap = state.xuat || {};
        const ketQuaMap = state.ketQua || {};

        const nhapKhoGroupMap = groupByMasp(nhapKhoMap);
        const bayMauGroupMap = groupByMasp(bayMauMap);
        const nhapTongGroupMap = groupByMasp(nhapTongMap);
        const xuatGroupMap = groupByMasp(xuatMap);

        const allMasps = buildOrderedMasps(nhapTongGroupMap, xuatGroupMap, state);

        tbody.innerHTML = "";

        for (const masp of allMasps) {
            const nhapKhoGroup = nhapKhoGroupMap[masp];
            const bayMauGroup = bayMauGroupMap[masp];
            const nhapTongGroup = nhapTongGroupMap[masp];
            const xuatGroup = xuatGroupMap[masp];

            const nhapKhoText = formatSizeSl(nhapKhoGroup?.items || []);
            const bayMauText = formatSizeSl(bayMauGroup?.items || []);
            const xuatText = formatSizeSl(xuatGroup?.items || []);

            const kqTong = buildKetQuaTheoMasp(nhapTongGroup, xuatGroup, ketQuaMap);
            const goiYCCN = buildGoiYDieuChinhCCN(nhapTongGroup, xuatGroup, ketQuaMap);

            const tr = document.createElement("tr");
            const selectedMasp = normalizeMasp(state.selectedMasp || "");
            tr.dataset.masp = masp;
            if (selectedMasp && selectedMasp === masp) {
                tr.classList.add("row-selected");
            }

            const tt = String(kqTong.trangthai || "").toUpperCase();

            if (tt === "THIEU") {
                tr.style.background = "#fff7cc"; // vàng nhạt
            } else if (tt === "THUA") {
                tr.style.background = "#e8f7ff"; // xanh nhạt
            } else if (tt === "LECH") {
                tr.style.background = "#fcefdc"; // vàng cam nhạt
            }

            tr.innerHTML = `
  <td class="cell-masp-click" data-masp="${escapeHtml(masp)}"
      style="cursor:pointer; color:#0b57d0; font-weight:600; text-decoration:underline;">
    ${escapeHtml(masp)}
  </td>

  <td contenteditable="true"
    class="cell-nhap-sizesl"
    data-masp="${escapeHtml(masp)}"
    style="white-space: pre-line; text-align:left; cursor:text;">${escapeHtml(nhapKhoText)}</td>

<td contenteditable="true"
    class="cell-baymau-sizesl"
    data-masp="${escapeHtml(masp)}"
    style="white-space: pre-line; text-align:left; background:#eef7ff; cursor:text;">${escapeHtml(bayMauText)}</td>

  <td data-masp="${escapeHtml(masp)}">${tongSoLuong(nhapTongGroup?.items || []) || ""}</td>

  <td class="cell-masp-click" data-masp="${escapeHtml(masp)}"
      style="cursor:pointer; color:#0b57d0; font-weight:600; text-decoration:underline;">
    ${escapeHtml(masp)}
  </td>

  <td style="white-space: pre-line; text-align:left;">${escapeHtml(xuatText)}</td>
  <td>${tongSoLuong(xuatGroup?.items || []) || ""}</td>

  <td>${escapeHtml(kqTong.trangthai || "")}</td>
  <td style="white-space: pre-line; text-align:left;">${escapeHtml(kqTong.chitiet || "")}</td>
  <td style="white-space: pre-line; text-align:left; color:#8a2b06; font-weight:600;">
    ${escapeHtml(goiYCCN || "")}
  </td>
`;
            tbody.appendChild(tr);
        }

        tbody.querySelectorAll(".cell-masp-click").forEach((el) => {
            const masp = String(el.dataset.masp || "").trim().toUpperCase();
            if (!masp) return;

            if (window.StockQuick && typeof window.StockQuick.attach === "function") {
                window.StockQuick.attach(el, masp);
            }
        });

        bindRowSelection();

        tbody.querySelectorAll(".cell-nhap-sizesl, .cell-baymau-sizesl").forEach((el) => {
            if (el.dataset.syncBound === "1") return;
            el.dataset.syncBound = "1";

            el.addEventListener("input", () => {
                docLaiNhapTuBangHTML();
            });

            el.addEventListener("blur", () => {
                docLaiNhapTuBangHTML();
                capNhatThongKeDauTrang();
            });
        });
        capNhatThongKeDauTrang();
    }

    function docLaiNhapTuBangHTML() {
        const tbody = document.querySelector("#bangketqua tbody");
        if (!tbody) return;

        const state = getState();
        const rows = Array.from(tbody.querySelectorAll("tr"));
        const nhapMoi = {};
        const bayMauMoi = {};
        const nhapOrderMoi = [];

        rows.forEach((tr) => {
            const tdMasp = tr.children[0];
            const tdKho = tr.querySelector(".cell-nhap-sizesl");
            const tdBayMau = tr.querySelector(".cell-baymau-sizesl");

            const masp = normalizeMasp(tdMasp?.innerText || "");
            if (!masp) return;

            if (!nhapOrderMoi.includes(masp)) {
                nhapOrderMoi.push(masp);
            }

            const khoText = String(tdKho?.innerText || "").trim();
            const bayMauText = String(tdBayMau?.innerText || "").trim();

            const khoItems = parseSizeSlText(khoText);
            const bayMauItems = parseSizeSlText(bayMauText);

            khoItems.forEach((item) => {
                const key = makeKey(masp, item.size);
                nhapMoi[key] = {
                    masp,
                    size: item.size,
                    sl: item.sl
                };
            });

            bayMauItems.forEach((item) => {
                const key = makeKey(masp, item.size);
                bayMauMoi[key] = {
                    masp,
                    size: item.size,
                    sl: item.sl
                };
            });
        });

        state.nhap = nhapMoi;
        state.bayMau = bayMauMoi;
        state.nhapOrder = nhapOrderMoi;
    }

    async function layBayMauTuGoogleSheet() {
        try {
            docLaiNhapTuBangHTML();

            const state = getState();
            const nhapGroupMap = groupByMasp(state.nhap || {});
            const xuatGroupMap = groupByMasp(state.xuat || {});
            const orderedMasps = buildOrderedMasps(nhapGroupMap, xuatGroupMap, state);

            if (!orderedMasps.length) {
                alert("Chưa có dữ liệu trên bảng để đối chiếu bày mẫu.");
                return;
            }

            const sheetMap = await docDanhSachBayMauTuGoogleSheet();

            let soMaKhop = 0;
            let soDongSheetKhop = 0;
            let soDongDungSize = 0;
            let soDongMacDinh0 = 0;

            // Xóa dữ liệu bày mẫu cũ của các mã đang có trên bảng
            Object.keys(state.bayMau || {}).forEach((key) => {
                const info = splitKey(key);
                if (orderedMasps.includes(normalizeMasp(info.masp))) {
                    delete state.bayMau[key];
                }
            });

            for (const masp of orderedMasps) {
                if (!sheetMap.has(masp)) {
                    continue; // không tìm thấy mã -> để trống
                }

                soMaKhop++;

                const sizeList = Array.isArray(sheetMap.get(masp)) ? sheetMap.get(masp) : [];
                if (!sizeList.length) continue;

                for (const raw of sizeList) {
                    const sizeRaw = String(raw || "").trim();
                    const sizeToSave = isValidBayMauSheetSize(sizeRaw) ? sizeRaw : "0";
                    const key = makeKey(masp, sizeToSave);

                    if (!state.bayMau[key]) {
                        state.bayMau[key] = {
                            masp,
                            size: sizeToSave,
                            sl: 1
                        };
                    } else {
                        state.bayMau[key].sl = normalizeNumber(state.bayMau[key].sl) + 1;
                    }

                    soDongSheetKhop++;

                    if (sizeToSave === "0") {
                        soDongMacDinh0++;
                    } else {
                        soDongDungSize++;
                    }
                }
            }

            state.ketQua = {};
            renderBangKetQua();
            capNhatThongKeDauTrang();

            const cfgSheet = getBayMauSheetConfig();

            alert(
                `Đã tải dữ liệu bày mẫu từ Google Sheet (${cfgSheet.sheetName}).\n` +
                `- Số mã khớp: ${soMaKhop}\n` +
                `- Số dòng sheet đã lấy: ${soDongSheetKhop}\n` +
                `- Dòng đúng size 38-45: ${soDongDungSize}\n` +
                `- Dòng mặc định 0/1: ${soDongMacDinh0}`
            );
        } catch (err) {
            console.error("[KTK] layBayMauTuGoogleSheet error:", err);
            const cfgSheet = getBayMauSheetConfig();
            alert(`Lỗi khi tải dữ liệu bày mẫu từ Google Sheet (${cfgSheet.sheetName}).`);
        }
    }

    async function layYeuCauKiemTonTuGoogleSheet() {
        try {
            docLaiNhapTuBangHTML();

            const state = getState();
            const sheetMap = await docDanhSachKiemKhoTuGoogleSheet();

            if (!sheetMap.size) {
                alert("Google Sheet yêu cầu kiểm tồn không có dữ liệu.");
                return;
            }

            let soMa = 0;

            // Xóa danh sách tồn máy cũ bên phải
            state.xuat = {};
            state.xuatOrder = [];

            for (const [masp] of sheetMap.entries()) {
                const maspNorm = normalizeMasp(masp);
                if (!maspNorm) continue;

                soMa++;

                if (!state.xuatOrder.includes(maspNorm)) {
                    state.xuatOrder.push(maspNorm);
                }

                const key = makeKey(maspNorm, "0");

                state.xuat[key] = {
                    masp: maspNorm,
                    size: "0",
                    sl: 0
                };
            }

            state.selectedMasp = "";
            state.ketQua = {};

            renderBangKetQua();
            capNhatThongKeDauTrang();

            const cfgSheet = getKiemKhoSheetConfig();

            alert(
                `Đã tải yêu cầu kiểm tồn từ Google Sheet (${cfgSheet.sheetName}).\n` +
                `- Số mã sản phẩm đã lấy: ${soMa}\n\n` +
                `Dữ liệu đã được đưa vào cột TỒN MÁY / Mã hàng.`
            );
        } catch (err) {
            console.error("[KTK] layYeuCauKiemTonTuGoogleSheet error:", err);
            const cfgSheet = getKiemKhoSheetConfig();
            alert(`Lỗi khi tải yêu cầu kiểm tồn từ Google Sheet (${cfgSheet.sheetName}).`);
        }
    }

    async function layKiemKhoTuGoogleSheet() {
        try {
            docLaiNhapTuBangHTML();

            const state = getState();
            const sheetMap = await docDanhSachKiemKhoTuGoogleSheet();

            if (!sheetMap.size) {
                alert("Google Sheet kiểm kho không có dữ liệu.");
                return;
            }

            let soMa = 0;
            let soDongSheet = 0;
            let soDongDungSize = 0;
            let soDongMacDinh0 = 0;

            // Xóa toàn bộ dữ liệu kiểm kho cũ bên cột kho
            state.nhap = {};
            state.nhapOrder = [];

            for (const [masp, sizeList] of sheetMap.entries()) {
                const maspNorm = normalizeMasp(masp);
                if (!maspNorm) continue;

                soMa++;
                state.nhapOrder.push(maspNorm);

                for (const rawSize of (sizeList || [])) {
                    const sizeToSave = isValidSize(rawSize) ? normalizeSize(rawSize) : "0";
                    const key = makeKey(maspNorm, sizeToSave);

                    if (!state.nhap[key]) {
                        state.nhap[key] = {
                            masp: maspNorm,
                            size: sizeToSave,
                            sl: 1
                        };
                    } else {
                        state.nhap[key].sl = normalizeNumber(state.nhap[key].sl) + 1;
                    }

                    soDongSheet++;

                    if (sizeToSave === "0") soDongMacDinh0++;
                    else soDongDungSize++;
                }
            }

            state.selectedMasp = "";
            state.ketQua = {};

            renderBangKetQua();
            capNhatThongKeDauTrang();

            const cfgSheet = getKiemKhoSheetConfig();

            alert(
                `Đã tải dữ liệu kiểm kho từ Google Sheet (${cfgSheet.sheetName}).\n` +
                `- Số mã đã lấy: ${soMa}\n` +
                `- Số dòng sheet đã lấy: ${soDongSheet}\n` +
                `- Dòng đúng size 38-45: ${soDongDungSize}\n` +
                `- Dòng mặc định 0/1: ${soDongMacDinh0}`
            );
        } catch (err) {
            console.error("[KTK] layKiemKhoTuGoogleSheet error:", err);
            const cfgSheet = getKiemKhoSheetConfig();
            alert(`Lỗi khi tải dữ liệu kiểm kho từ Google Sheet (${cfgSheet.sheetName}).`);
        }
    }

    // Expose để HTML cũ không lỗi nếu còn gọi
    window.renderBangKetQua = renderBangKetQua;
    window.capNhatTongTien = function () { return; };

    // =========================
    // NHẬP BÊN TRÁI
    // =========================
    async function themDongNhapBenTrai() {
        const maspEl = byId("masp");
        const sizeEl = byId("size");
        const slEl = byId("soluong");

        if (!maspEl || !slEl) return;

        const masp = normalizeMasp(maspEl.value);
        const size = normalizeSize(sizeEl?.value);
        const sl = normalizeNumber(slEl.value || 1);

        if (!masp) {
            phatAmThanhLoi();
            alert("Vui lòng nhập mã sản phẩm.");
            maspEl.focus();
            return;
        }

        if (!(await baoLoiNeuMaspKhongCoTrongDanhMuc(masp))) {
            return;
        }

        if (!size) {
            if (sizeEl) {
                sizeEl.focus();
                sizeEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
            }
            return;
        }

        if (!isValidSize(size)) {
            phatAmThanhLoi();
            alert("Size không hợp lệ. Chỉ được nhập: 0, 38, 39, 40, 41, 42, 43, 44, 45");
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
        const targetMapName = isKiemMauMode() ? "bayMau" : "nhap";
        const targetMap = state[targetMapName] || (state[targetMapName] = {});

        const isNewMasp =
            !Object.values(state.nhap || {}).some(r => normalizeMasp(r?.masp) === masp) &&
            !Object.values(state.bayMau || {}).some(r => normalizeMasp(r?.masp) === masp);

        if (!targetMap[key]) {
            targetMap[key] = {
                masp,
                size,
                sl
            };
        } else {
            targetMap[key].sl = normalizeNumber(targetMap[key].sl) + sl;
        }

        if (isNewMasp) {
            state.nhapOrder = ensureMaspAtTop(state.nhapOrder, masp);
        }


        delete state.ketQua[key];

        renderBangKetQua();

        if (sizeEl) sizeEl.value = "";
        slEl.value = "1";

        if (sizeEl) {
            sizeEl.focus();
            sizeEl.dispatchEvent(new Event("focus", { bubbles: true }));
            sizeEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        } else {
            maspEl.focus();
        }
    }

    async function chuyenSizeSaiThanhMaSanPhamMoi(rawValue) {
        const maspEl = byId("masp");
        const sizeEl = byId("size");
        const slEl = byId("soluong");

        const maspMoi = normalizeMasp(rawValue);
        if (!maspMoi || !maspEl) return false;

        // Đưa dữ liệu size sai sang ô mã sản phẩm
        maspEl.value = maspMoi;

        // Xóa ô size cũ để chuẩn bị nhập size cho mã mới
        if (sizeEl) sizeEl.value = "";

        if (!(await baoLoiNeuMaspKhongCoTrongDanhMuc(maspMoi))) {
            return true;
        }
        const chkNhapNhanh = byId("chkNhapNhanh");
        const isNhapNhanh = !!chkNhapNhanh?.checked;

        if (isNhapNhanh) {
            await themNhanhKhongCanSize();
            return true;
        }

        if (slEl && !normalizeNumber(slEl.value)) {
            slEl.value = "1";
        }

        if (sizeEl) {
            sizeEl.focus();
            sizeEl.value = "";
            showSizePopup(maspMoi, "");
            phatAmThanhSize();
        }

        return true;
    }

    function bindInputEvents() {
        const maspEl = byId("masp");
        const sizeEl = byId("size");
        const slEl = byId("soluong");

        if (maspEl) {
            maspEl.addEventListener("keydown", async (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();

                    const masp = normalizeMasp(maspEl.value);
                    if (!masp) {
                        phatAmThanhLoi();
                        alert("Vui lòng nhập mã sản phẩm.");
                        maspEl.focus();
                        return;
                    }

                    maspEl.value = masp;

                    if (!(await baoLoiNeuMaspKhongCoTrongDanhMuc(masp))) {
                        return;
                    }

                    const chkNhapNhanh = byId("chkNhapNhanh");
                    const isNhapNhanh = !!chkNhapNhanh?.checked;

                    if (isNhapNhanh) {
                        await themNhanhKhongCanSize();
                        return;
                    }

                    if (slEl && !normalizeNumber(slEl.value)) {
                        slEl.value = "1";
                    }

                    if (sizeEl) {
                        sizeEl.focus();
                        sizeEl.value = "";
                        showSizePopup(masp, "");
                        phatAmThanhSize();
                    }
                }
            });

            maspEl.addEventListener("blur", () => {
                maspEl.value = normalizeMasp(maspEl.value);
            });
        }

        if (sizeEl) {
            sizeEl.addEventListener("focus", () => {
                const masp = normalizeMasp(maspEl?.value);
                if (!masp) return;
                showSizePopup(masp, sizeEl.value);
            });

            sizeEl.addEventListener("input", () => {
                const masp = normalizeMasp(maspEl?.value);
                if (!masp) return;
                showSizePopup(masp, sizeEl.value);
            });

            sizeEl.addEventListener("keydown", async (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();

                    const masp = normalizeMasp(maspEl?.value);
                    if (!masp) {
                        phatAmThanhLoi();
                        alert("Vui lòng nhập mã sản phẩm.");
                        maspEl?.focus();
                        return;
                    }

                    const typedSize = normalizeSize(sizeEl.value);

                    if (!typedSize) {
                        showSizePopup(masp, "");
                        return;
                    }

                    // Nếu size không hợp lệ thì hiểu là người dùng đang nhập mã sản phẩm mới
                    if (!isValidSize(typedSize)) {
                        await chuyenSizeSaiThanhMaSanPhamMoi(typedSize);
                        return;
                    }

                    await themNhanhTheoSize(typedSize);
                }

                if (e.key === "Escape") {
                    hideSizePopup();
                    maspEl?.focus();
                }
            });
        }

        if (slEl) {
            slEl.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();

                    const masp = normalizeMasp(maspEl?.value);
                    if (!masp) {
                        phatAmThanhLoi();
                        alert("Vui lòng nhập mã sản phẩm.");
                        maspEl?.focus();
                        return;
                    }

                    if (sizeEl) {
                        sizeEl.focus();
                        showSizePopup(masp, sizeEl.value);
                    }
                }
            });
        }

        const chkKiemMau = document.getElementById("chkKiemMau");
        if (chkKiemMau) {
            chkKiemMau.addEventListener("change", () => {
                capNhatUIKiemMau();
                document.getElementById("masp")?.focus();
            });
        }

        document.addEventListener("click", (e) => {
            const popup = byId("popup_size");
            if (!popup) return;

            if (dangChonSizeTrongPopup) return;
            if (e.target === sizeEl || e.target === maspEl || popup.contains(e.target)) return;

            hideSizePopup();
        });
    }

    // =========================
    // RESET PHIẾU
    // =========================
    async function resetPhieu() {
        const oldState = getState();

        window.kiemTonState = {
            nhap: {},
            bayMau: {},
            xuat: {},
            ketQua: {},
            nhapOrder: [],
            xuatOrder: [],
            selectedMasp: "",
            dmMaspCache: oldState?.dmMaspCache instanceof Map ? oldState.dmMaspCache : new Map(),
            daKiemTra: false,
            thoiDiemChotTon: null
        };

        dangChonSizeTrongPopup = false;

        const maspEl = byId("masp");
        const sizeEl = byId("size");
        const slEl = byId("soluong");
        const sohdEl = byId("sohd");
        const ghichuEl = byId("ghichu_top");

        const thongkeEl = byId("thongke_dautrang");
        if (thongkeEl) {
            thongkeEl.title = "";
        }

        if (maspEl) maspEl.value = "";
        if (sizeEl) sizeEl.value = "";
        if (slEl) slEl.value = "1";
        if (sohdEl) sohdEl.value = await taoSoPhieuMoi();
        if (ghichuEl) ghichuEl.value = "";
        const diadiemEl = byId("diadiem");
        if (diadiemEl) diadiemEl.value = CFG.branch || "";

        const ngayEl = byId("ngay");
        if (ngayEl) {
            const d = new Date();
            ngayEl.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }

        const gioEl = byId("gio");
        if (gioEl) {
            const d = new Date();
            gioEl.value = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        }

        const manvEl = byId("manv");
        if (manvEl) manvEl.value = String(localStorage.getItem("manv") || "").trim();

        const tennvEl = byId("tennv");
        if (tennvEl) tennvEl.value = String(localStorage.getItem("tennv") || "").trim();

        const hdState = byId("hd_state");
        if (hdState) {
            hdState.value = "moi";
            hdState.setAttribute("data-state", "moi");
        }

        renderBangKetQua();
        capNhatThongKeDauTrang();
        hideSizePopup();
        if (maspEl) maspEl.focus();

        focusNhapMasp(true);
    }

    function focusNhapMasp(selectAll = true) {
        const el = byId("masp");
        if (!el) return;

        setTimeout(() => {
            try {
                el.focus();
                if (selectAll && typeof el.select === "function") {
                    el.select();
                }
            } catch (err) { }
        }, 0);
    }

    // =========================
    // KIỂM TRA
    // Bản đầu: so tổng SL theo mã
    // =========================
    function kiemTraPhieu() {
        // luôn đọc lại dữ liệu người dùng vừa sửa trực tiếp trên bảng
        docLaiNhapTuBangHTML();

        const state = getState();
        const nhapMap = getMapNhapTong();
        const xuatMap = state.xuat || {};
        const ketQua = {};

        // Gom xuat theo mã để dùng cho chế độ kiểm tổng
        const xuatTheoMasp = {};
        Object.keys(xuatMap).forEach((key) => {
            const row = xuatMap[key];
            if (!row) return;
            const masp = normalizeMasp(row.masp);
            const sl = normalizeNumber(row.sl);
            xuatTheoMasp[masp] = (xuatTheoMasp[masp] || 0) + sl;
        });

        // Gom nhap theo mã để biết mã nào đang ở chế độ tổng
        const nhapTheoMasp = {};
        Object.keys(nhapMap).forEach((key) => {
            const row = nhapMap[key];
            if (!row) return;
            const masp = normalizeMasp(row.masp);
            if (!nhapTheoMasp[masp]) nhapTheoMasp[masp] = [];
            nhapTheoMasp[masp].push(row);
        });

        const allMasps = new Set([
            ...Object.keys(nhapTheoMasp),
            ...Object.keys(xuatTheoMasp),
            ...Object.values(xuatMap).map(r => normalizeMasp(r.masp))
        ]);

        for (const masp of allMasps) {
            const nhapRows = nhapTheoMasp[masp] || [];
            const hasRealSize = nhapRows.some(r => normalizeSize(r.size) !== "0" && normalizeSize(r.size) !== "");

            // CHẾ ĐỘ 1: kiểm chi tiết theo size
            if (hasRealSize) {
                const xuatKeys = Object.keys(xuatMap).filter(k => normalizeMasp(xuatMap[k]?.masp) === masp);
                const nhapKeys = Object.keys(nhapMap).filter(k => normalizeMasp(nhapMap[k]?.masp) === masp);

                const allKeys = new Set([...xuatKeys, ...nhapKeys]);

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

                continue;
            }

            // CHẾ ĐỘ 2: kiểm tổng
            const tongNhap = nhapRows.reduce((sum, r) => sum + normalizeNumber(r.sl), 0);
            const tongXuat = xuatTheoMasp[masp] || 0;

            const keyTong = makeKey(masp, "0");

            if (tongNhap === tongXuat) {
                ketQua[keyTong] = { trangthai: "OK", chitiet: "" };
            } else if (tongNhap < tongXuat) {
                ketQua[keyTong] = { trangthai: "THIEU", chitiet: String(tongXuat - tongNhap) };
            } else {
                ketQua[keyTong] = { trangthai: "THUA", chitiet: String(tongNhap - tongXuat) };
            }
        }

        state.ketQua = ketQua;
        sapXepLaiThuTuMaspTheoKetQua();
        renderBangKetQua();
    }

    async function napTonMayTheoDanhSachMasp() {
        if (!window.supabase) {
            alert("Không tìm thấy kết nối Supabase.");
            return false;
        }

        docLaiNhapTuBangHTML();

        const state = getState();
        const nhapMap = getMapNhapTong();
        const xuatMap = state.xuat || {};

        const dsMasp = Array.from(
            new Set([
                ...Object.values(nhapMap)
                    .map(row => normalizeMasp(row?.masp))
                    .filter(Boolean),

                ...Object.values(xuatMap)
                    .map(row => normalizeMasp(row?.masp))
                    .filter(Boolean)
            ])
        );

        if (!dsMasp.length) {
            phatAmThanhLoi();
            alert("Chưa có mã sản phẩm nào để kiểm tồn.");
            return false;
        }

        const ngayDen = String(byId("ngay")?.value || "").trim();
        if (!ngayDen) {
            alert("Chưa có ngày kiểm.");
            return false;
        }

        const { data, error } = await window.supabase.rpc("xntnhanh", {
            p_masps: dsMasp,
            p_den_ngay: ngayDen,
            p_tonghop_size: false
        });

        if (error) {
            console.error("[KTK] rpc xntnhanh error:", error);
            alert("Lỗi khi lấy tồn máy từ xntnhanh.");
            return false;
        }

        const xuatMapMoi = {};
        const xuatOrder = [];
        (data || []).forEach((row) => {
            const masp = normalizeMasp(row.masp);
            const size = normalizeSize(row.size);
            const sl = normalizeNumber(CFG.branch === "cs1" ? row.ton_cs1 : row.ton_cs2);

            if (!masp || !size || sl === 0) return;

            if (!xuatOrder.includes(masp)) {
                xuatOrder.push(masp);
            }

            const key = makeKey(masp, size);
            if (!xuatMapMoi[key]) {
                xuatMapMoi[key] = { masp, size, sl };
            } else {
                xuatMapMoi[key].sl = normalizeNumber(xuatMapMoi[key].sl) + sl;
            }
        });

        state.xuat = xuatMapMoi;
        state.xuatOrder = xuatOrder;
        state.ketQua = {};
        state.daKiemTra = false;
        state.thoiDiemChotTon = new Date().toISOString();

        renderBangKetQua();
        capNhatThongKeDauTrang();

        const ghichuEl = byId("ghichu_top");
        if (ghichuEl && !String(ghichuEl.value || "").trim()) {
            ghichuEl.value = `Kiểm tồn ${CFG.branch?.toUpperCase?.() || ""}`;
        }

        return true;
    }

    async function napTonMayVaKiemTra() {
        const ok = await napTonMayTheoDanhSachMasp();
        if (!ok) return;

        kiemTraPhieu();

        const state = getState();
        state.daKiemTra = true;

        const nhapTongMap = getMapNhapTong();
        const tkNhap = tinhThongKeTheoMap(nhapTongMap);
        const tkXuat = tinhThongKeTheoMap(state.xuat || {});
        const allMasps = Array.from(new Set([
            ...Object.values(nhapTongMap || {}).map(x => normalizeMasp(x?.masp)).filter(Boolean),
            ...Object.values(state.xuat || {}).map(x => normalizeMasp(x?.masp)).filter(Boolean)
        ]));

        let soOk = 0;
        let soThieu = 0;
        let soThua = 0;
        let soLech = 0;

        const nhapGroupMap = groupByMasp(nhapTongMap);
        const xuatGroupMap = groupByMasp(state.xuat || {});
        const ketQuaMap = state.ketQua || {};

        allMasps.forEach((masp) => {
            const kq = buildKetQuaTheoMasp(nhapGroupMap[masp], xuatGroupMap[masp], ketQuaMap);
            const tt = String(kq?.trangthai || "").toUpperCase();
            if (tt === "OK") soOk++;
            else if (tt === "THIEU") soThieu++;
            else if (tt === "THUA") soThua++;
            else if (tt === "LECH") soLech++;
        });

        const thongkeEl = byId("thongke_dautrang");
        if (thongkeEl) {
            thongkeEl.textContent = `Kiểm: ${tkNhap.soMa}/${tkNhap.tongSl} , Tồn máy: ${tkXuat.soMa}/${tkXuat.tongSl}`;
            thongkeEl.title = `OK: ${soOk} | Thiếu: ${soThieu} | Thừa: ${soThua} | Lệch: ${soLech}`;
        }
    }

    function timDanhSachMaspXacNhanHetHangBangSize0() {
        docLaiNhapTuBangHTML();

        const state = getState();
        const nhapMap = getMapNhapTong();
        const xuatMap = state.xuat || {};

        const maspSet = new Set([
            ...Object.values(nhapMap).map(r => normalizeMasp(r?.masp)).filter(Boolean),
            ...Object.values(xuatMap).map(r => normalizeMasp(r?.masp)).filter(Boolean)
        ]);

        const result = [];

        for (const masp of maspSet) {
            const nhapRows = Object.values(nhapMap)
                .filter(r => normalizeMasp(r?.masp) === masp);

            const xuatRows = Object.values(xuatMap)
                .filter(r => normalizeMasp(r?.masp) === masp);

            const chiNhapSize0 =
                nhapRows.length === 1 &&
                normalizeSize(nhapRows[0].size) === "0" &&
                normalizeNumber(nhapRows[0].sl) === 1;

            if (!chiNhapSize0) continue;

            const tongTonMay = xuatRows.reduce((sum, r) => sum + normalizeNumber(r.sl), 0);
            const coDuong = xuatRows.some(r => normalizeNumber(r.sl) > 0);
            const coAm = xuatRows.some(r => normalizeNumber(r.sl) < 0);

            if (tongTonMay === 0 && coDuong && coAm) {
                result.push(masp);
            }
        }

        return result;
    }

    async function canDoiSizeKiemTon() {
        try {
            if (!window.supabase) {
                alert("Không tìm thấy kết nối Supabase.");
                return;
            }

            const state = getState();

            if (!state.daKiemTra) {
                alert("Phải bấm 'Kiểm tra' trước khi cân đối size.");
                return;
            }

            const hdStateEl = byId("hd_state");
            const hdStateValue = String(
                hdStateEl?.value || hdStateEl?.getAttribute("data-state") || ""
            ).trim().toLowerCase();

            if (hdStateValue !== "xem") {
                alert("Chỉ được cân đối size khi đang mở phiếu kiểm tồn cũ.");
                return;
            }

            const soPhieu = String(byId("sohd")?.value || "").trim();
            if (!soPhieu) {
                alert("Chưa có số phiếu kiểm tồn.");
                return;
            }

            const { manv, tennv } = getCurrentUserInfo();

            const dsHetHangSize0 = timDanhSachMaspXacNhanHetHangBangSize0();
            const isCanDoiHetHang = dsHetHangSize0.length > 0;

            const ok = confirm(
                isCanDoiHetHang
                    ? (
                        "Bạn có chắc muốn CÂN ĐỐI HẾT HÀNG cho mã nhập 0/1?\n\n" +
                        "- Quy ước: 0/1 = xác nhận mã này thực tế hết hàng.\n" +
                        "- Chỉ xử lý mã có tổng tồn máy = 0, có size âm và size dương.\n" +
                        "- Hệ thống sẽ bù trừ âm/dương để tồn kho về 0.\n\n" +
                        "Số mã xử lý: " + dsHetHangSize0.length + "\n" +
                        dsHetHangSize0.slice(0, 10).join(", ")
                    )
                    : (
                        "Bạn có chắc muốn CÂN ĐỐI SIZE theo phiếu này?\n\n" +
                        "- Chỉ admin mới được phép chạy.\n" +
                        "- Hệ thống sẽ sửa size trên hóa đơn bán cơ sở.\n" +
                        "- Sau khi chạy xong sẽ nạp lại tồn máy và kiểm tra lại."
                    )
            );
            if (!ok) return;

            phatAmThanhSize();

            const rpcName = isCanDoiHetHang
                ? "rpc_can_doi_size_kiem_ton_het_hang"
                : "rpc_can_doi_size_kiem_ton";

            const rpcParams = isCanDoiHetHang
                ? {
                    p_so_phieu: soPhieu,
                    p_ds_masp: dsHetHangSize0,
                    p_nguoi_thuc_hien: manv || null,
                    p_ten_nguoi_thuc_hien: tennv || null
                }
                : {
                    p_so_phieu: soPhieu,
                    p_nguoi_thuc_hien: manv || null,
                    p_ten_nguoi_thuc_hien: tennv || null
                };

            const { data, error } = await window.supabase.rpc(rpcName, rpcParams);

            if (error) {
                console.error("[KTK] rpc_can_doi_size_kiem_ton error:", error);
                phatAmThanhLoi();
                alert("Lỗi cân đối size: " + (error.message || error));
                return;
            }

            console.log("[KTK] rpc_can_doi_size_kiem_ton result:", data);

            phatAmThanhThanhCong();

            const logs = Array.isArray(data?.logs) ? data.logs : [];
            const skipReasons = logs
                .filter(x => x && (x.status === "skip" || x.status === "warning"))
                .map(x => {
                    const masp = x.masp || "";
                    const reason = x.reason || x.mode || "Không rõ lý do";
                    return `${masp}: ${reason}`;
                })
                .slice(0, 8);

            alert(
                "Đã chạy cân đối size xong.\n\n" +
                "- Mã xử lý: " + normalizeNumber(data?.masp_done || 0) + "\n" +
                "- Mã bỏ qua: " + normalizeNumber(data?.masp_skip || 0) + "\n" +
                "- Số dòng đã sửa: " + normalizeNumber(data?.rows_updated || 0) +
                (skipReasons.length
                    ? "\n\nChi tiết:\n- " + skipReasons.join("\n- ")
                    : "")
            );

            // Nạp lại tồn máy theo dữ liệu hiện tại rồi kiểm tra lại
            await napTonMayVaKiemTra();

        } catch (err) {
            console.error("[KTK] canDoiSizeKiemTon exception:", err);
            phatAmThanhLoi();
            alert("Lỗi hệ thống khi cân đối size.");
        }
    }

    // =========================
    // NẠP HÓA ĐƠN NGUỒN
    // Bản đầu: chưa query thật, chỉ placeholder
    // =========================


    function layDanhSachMaspDangNhap() {
        const ds = Object.values(getMapNhapTong() || {})
            .map(r => normalizeMasp(r.masp))
            .filter(Boolean);

        return [...new Set(ds)];
    }

    function focusVaBoiDenOmaSanPham() {
        const maspEl = byId("masp");
        if (!maspEl) return;

        maspEl.focus();
        setTimeout(() => {
            try {
                maspEl.select();
            } catch (err) { }
        }, 0);
    }

    function batDauNgay(dateObj) {
        const d = new Date(dateObj);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function truNgay(dateObj, soNgay) {
        const d = new Date(dateObj);
        d.setDate(d.getDate() - soNgay);
        return d;
    }

    function toIsoLocal(dateObj) {
        const d = new Date(dateObj);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const hh = String(d.getHours()).padStart(2, "0");
        const mi = String(d.getMinutes()).padStart(2, "0");
        const ss = String(d.getSeconds()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
    }



    function tinhDeXuatHoaDonTheoMasp(dsHd, ctRows, dsMaspNhap, mapDaKiem = new Map()) {
        const setNhap = new Set((dsMaspNhap || []).map(normalizeMasp).filter(Boolean));
        const nhomCtTheoSoHd = {};

        (ctRows || []).forEach((row) => {
            const sohd = String(row.sohd || "").trim();
            if (!sohd) return;
            if (!nhomCtTheoSoHd[sohd]) nhomCtTheoSoHd[sohd] = [];
            nhomCtTheoSoHd[sohd].push(row);
        });

        const ketQua = [];

        (dsHd || []).forEach((hd) => {
            const sohd = String(hd.sohd || "").trim();
            if (!sohd) return;

            const infoDaKiem = mapDaKiem.get(sohd);
            if (infoDaKiem) return; // bỏ qua hóa đơn đã kiểm

            const rows = nhomCtTheoSoHd[sohd] || [];
            if (!rows.length) return;

            const maspTrongHoaDon = [...new Set(
                rows.map(r => normalizeMasp(r.masp)).filter(Boolean)
            )];

            const dsMaspTrung = maspTrongHoaDon.filter(masp => setNhap.has(masp));
            const soMaTrung = dsMaspTrung.length;
            if (soMaTrung <= 0) return;

            const tongMaNhap = setNhap.size || 1;
            const tongMaHoaDon = maspTrongHoaDon.length || 1;

            const tyLeTheoNhap = soMaTrung / tongMaNhap;
            const tyLeTheoHoaDon = soMaTrung / tongMaHoaDon;

            const createdAt = hd.created_at || hd.ngay || null;
            let diemThoiGian = 0;
            if (createdAt) {
                const t = new Date(createdAt).getTime();
                if (Number.isFinite(t)) {
                    const ageHours = Math.max(0, (Date.now() - t) / 3600000);
                    diemThoiGian = Math.max(0, 10 - Math.min(10, ageHours / 3));
                }
            }

            const score =
                soMaTrung * 10 +
                tyLeTheoNhap * 40 +
                tyLeTheoHoaDon * 40 +
                diemThoiGian;

            ketQua.push({
                sohd,
                ngay: hd.ngay || null,
                created_at: hd.created_at || null,
                diadiem: String(hd.diadiem || "").trim(),
                manv: String(hd.manv || "").trim(),
                tennv: String(hd.tennv || "").trim(),
                soMaTrung,
                tongMaNhap,
                tongMaHoaDon,
                tyLeTheoNhap,
                tyLeTheoHoaDon,
                score,
                dsMaspTrung,
                autoChecked:
                    soMaTrung >= 2 ||
                    tyLeTheoNhap >= 0.3 ||
                    tyLeTheoHoaDon >= 0.5
            });
        });

        ketQua.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return String(b.created_at || "").localeCompare(String(a.created_at || ""));
        });

        return ketQua;
    }


    function taoGhiChuPhieuChuyenTuKiemNhap() {
        const state = getState();
        const soHdKiemNhap = String(byId("sohd")?.value || "").trim();
        const dsNguon = (state.dsHoaDonNguon || []).join(" ; ");

        let note = `Phiếu được tạo từ nhập kiểm kho`;
        if (soHdKiemNhap) note += ` - ${soHdKiemNhap}`;
        if (dsNguon) note += ` | HĐ nguồn: ${dsNguon}`;

        return note;
    }

    // =========================
    // TAO PHIEU CCN2V1 TU HANG THUA
    // =========================
    function groupByMaspForTransfer(items) {
        const out = {};

        (items || []).forEach((row) => {
            const masp = normalizeMasp(row.masp);
            const size = normalizeSize(row.size);
            const sl = normalizeNumber(row.sl);

            if (!masp || !size || sl <= 0) return;

            if (!out[masp]) {
                out[masp] = {
                    masp,
                    items: []
                };
            }

            out[masp].items.push({
                size,
                sl
            });
        });

        return Object.values(out);
    }

    function layDanhSachHangThuaDeTaoCCN2V1() {
        const thongTinTong = xayDungDuLieuTongVaChiTietLech();
        const chiTietLech = thongTinTong?.chiTietLech || [];

        const rowsThua = chiTietLech
            .filter(row => String(row.trangthai_nhan || "").trim().toLowerCase() === "thua")
            .map(row => ({
                masp: normalizeMasp(row.masp),
                size: normalizeSize(row.size || "0"),
                sl: normalizeNumber(row.sl_lech || 0)
            }))
            .filter(row => row.masp && row.size && row.sl > 0);

        return groupByMaspForTransfer(rowsThua);
    }

    function layDanhSachHangThieuDeTaoCCN1V2() {
        const thongTinTong = xayDungDuLieuTongVaChiTietLech();
        const chiTietLech = thongTinTong?.chiTietLech || [];
        const state = getState();
        const xuatMap = state.xuat || {};

        const rowsThieu = [];

        chiTietLech.forEach((row) => {
            const trangthai = String(row.trangthai_nhan || "").trim().toLowerCase();
            if (trangthai !== "thieu") return;

            const masp = normalizeMasp(row.masp);
            const size = normalizeSize(row.size || "0");
            const sl = normalizeNumber(row.sl_lech || 0);

            if (!masp || sl <= 0) return;

            // Nếu đã có size thật thì dùng luôn
            if (size && size !== "0") {
                rowsThieu.push({
                    masp,
                    size,
                    sl
                });
                return;
            }

            // Nếu size = 0, nghĩa là trường hợp nhập trống / kiểm tổng
            // -> bung ra toàn bộ size thật từ dữ liệu xuất nguồn của mã đó
            const xuatRowsTheoMasp = Object.values(xuatMap)
                .filter(r => normalizeMasp(r?.masp) === masp)
                .map(r => ({
                    masp,
                    size: normalizeSize(r?.size || "0"),
                    sl: normalizeNumber(r?.sl || 0)
                }))
                .filter(r => r.masp && r.size && r.size !== "0" && r.sl > 0);

            if (xuatRowsTheoMasp.length > 0) {
                xuatRowsTheoMasp.forEach(r => rowsThieu.push(r));
                return;
            }

            // Nếu vẫn không có size thật thì mới giữ 0 như cũ
            rowsThieu.push({
                masp,
                size,
                sl
            });
        });

        return groupByMaspForTransfer(rowsThieu);
    }

    function taoPayloadCCN1V2TuKiemNhap() {
        const state = getState();
        const items = layDanhSachHangThieuDeTaoCCN1V2();

        if (!items || items.length === 0) return null;

        return {
            dir: "1v2",
            source: "kiem_nhap_kho",
            created_at: new Date().toISOString(),
            so_hd_kiemnhap: String(byId("sohd")?.value || "").trim(),
            ds_hoa_don_nguon: state.dsHoaDonNguon || [],
            note: taoGhiChuPhieuChuyenTuKiemNhap(),
            items
        };
    }

    function moTrangCCN1V2TuHangThieu() {
        docLaiNhapTuBangHTML();
        kiemTraPhieu();

        const payload = taoPayloadCCN1V2TuKiemNhap();

        if (!payload) {
            phatAmThanhLoi();
            alert("Không có mã sản phẩm thiếu để tạo phiếu CCN1V2.");
            return;
        }

        try {
            localStorage.setItem("ccn_prefill_payload", JSON.stringify(payload));
        } catch (err) {
            console.error("[KNK] Lỗi lưu ccn_prefill_payload:", err);
            alert("Không lưu được dữ liệu tạm để chuyển sang trang CCN1V2.");
            return;
        }

        const url = "https://app.hoantuyet.vn/ccn1v2cs1.html";
        const newTab = window.open(url);

        if (!newTab || newTab.closed || typeof newTab.closed === "undefined") {
            // mobile bị chặn popup → chuyển luôn
            window.location.href = url;
        }

        // alert(`Đã tạo dữ liệu chuyển cho ${payload.items.length} mã hàng thiếu.`);
    }

    function taoPayloadCCN2V1TuKiemNhap() {
        const state = getState();
        const items = layDanhSachHangThuaDeTaoCCN2V1();

        if (!items || items.length === 0) return null;

        return {
            dir: "2v1",
            source: "kiem_nhap_kho",
            created_at: new Date().toISOString(),
            so_hd_kiemnhap: String(byId("sohd")?.value || "").trim(),
            ds_hoa_don_nguon: state.dsHoaDonNguon || [],
            note: taoGhiChuPhieuChuyenTuKiemNhap(),
            items
        };
    }

    function moTrangCCN2V1TuHangThua() {
        docLaiNhapTuBangHTML();
        kiemTraPhieu();

        const payload = taoPayloadCCN2V1TuKiemNhap();
        console.log("[KNK] payload CCN2V1 =", payload);

        if (!payload) {
            phatAmThanhLoi();
            alert("Không có mã sản phẩm thừa để tạo phiếu CCN2V1.");
            return;
        }

        try {
            localStorage.setItem("ccn_prefill_payload", JSON.stringify(payload));
        } catch (err) {
            console.error("[KNK] Lỗi lưu ccn_prefill_payload:", err);
            alert("Không lưu được dữ liệu tạm để chuyển sang trang CCN2V1.");
            return;
        }

        const url = "https://app.hoantuyet.vn/ccn2v1cs2.html";

        const newTab = window.open(url);

        if (!newTab || newTab.closed || typeof newTab.closed === "undefined") {
            // mobile bị chặn popup → chuyển luôn
            window.location.href = url;
        }

        // alert(`Đã tạo dữ liệu chuyển cho ${payload.items.length} mã hàng thừa.`);
    }

    // =========================
    // CHON DONG / COPY / PASTE / XOA DONG
    // =========================
    function chonDongTheoMasp(masp) {
        const state = getState();
        state.selectedMasp = normalizeMasp(masp);
        renderBangKetQua();
    }

    function bindRowSelection() {
        const tbody = document.querySelector("#bangketqua tbody");
        if (!tbody || tbody.dataset.rowSelectBound === "1") return;

        tbody.dataset.rowSelectBound = "1";

        tbody.addEventListener("click", (e) => {
            const tr = e.target.closest("tr");
            if (!tr) return;

            // Nếu click vào ô cho phép sửa trực tiếp thì KHÔNG render lại
            if (
                e.target.closest(".cell-nhap-sizesl") ||
                e.target.closest(".cell-baymau-sizesl")
            ) {
                return;
            }

            // Trước khi chọn dòng khác, luôn đồng bộ dữ liệu đang sửa từ DOM vào state
            docLaiNhapTuBangHTML();

            const masp = normalizeMasp(tr.dataset.masp || "");
            if (!masp) return;

            chonDongTheoMasp(masp);
        });
    }

    function suaDongDangChon() {
        docLaiNhapTuBangHTML();

        const state = getState();
        const masp = normalizeMasp(state.selectedMasp || "");

        if (!masp) {
            alert("Bạn chưa chọn dòng cần sửa.");
            return;
        }

        // Xóa toàn bộ dữ liệu kiểm bên trái của mã đang chọn
        Object.keys(state.nhap || {}).forEach((key) => {
            const row = state.nhap[key];
            if (normalizeMasp(row?.masp) === masp) {
                delete state.nhap[key];
            }
        });

        Object.keys(state.bayMau || {}).forEach((key) => {
            const row = state.bayMau[key];
            if (normalizeMasp(row?.masp) === masp) {
                delete state.bayMau[key];
            }
        });

        // Xóa kết quả kiểm liên quan đến mã đó
        Object.keys(state.ketQua || {}).forEach((key) => {
            const info = splitKey(key);
            if (normalizeMasp(info.masp) === masp) {
                delete state.ketQua[key];
            }
        });

        // Giữ mã đó lên ô nhập để nhập lại nhanh
        const maspEl = byId("masp");
        const sizeEl = byId("size");
        const slEl = byId("soluong");

        if (maspEl) maspEl.value = masp;
        if (sizeEl) sizeEl.value = "";
        if (slEl) slEl.value = "1";

        state.selectedMasp = "";
        renderBangKetQua();

        if (maspEl) {
            maspEl.focus();
            setTimeout(() => {
                try {
                    maspEl.select();
                } catch (err) { }
            }, 0);
        }
    }

    async function copyDuLieuNhap() {
        try {
            docLaiNhapTuBangHTML();

            const tbody = document.querySelector("#bangketqua tbody");
            if (!tbody) {
                alert("Không tìm thấy bảng kết quả.");
                return;
            }

            const rows = Array.from(tbody.querySelectorAll("tr"));
            if (rows.length === 0) {
                alert("Không có dữ liệu để copy.");
                return;
            }

            const lines = rows.map((tr) => {
                const col1 = String(tr.children[0]?.innerText || "").trim(); // mã hàng

                const col2 = String(tr.children[1]?.innerText || "")         // kho
                    .replace(/\r/g, "")
                    .replace(/\n+/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();

                const col3 = String(tr.children[2]?.innerText || "")         // mẫu
                    .replace(/\r/g, "")
                    .replace(/\n+/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();

                const col4 = String(tr.children[3]?.innerText || "").trim(); // tổng SL

                return [col1, col2, col3, col4].join("\t");
            }).filter(Boolean);

            const text = lines.join("\n");
            await navigator.clipboard.writeText(text);

            alert(`Đã copy ${lines.length} dòng dữ liệu phần nhập.`);
        } catch (err) {
            console.error("[KNK] copyDuLieuNhap error:", err);
            alert("Không copy được dữ liệu.");
        }
    }

    function parseClipboardToNhapMap(text) {
        const lines = String(text || "")
            .replace(/\r/g, "")
            .split("\n")
            .map(x => x.trim())
            .filter(Boolean);

        const nhapMoi = {};
        const bayMauMoi = {};

        for (const line of lines) {
            const cols = line.split("\t");

            const masp = normalizeMasp(cols[0] || "");
            const khoText = String(cols[1] || "").trim();
            const bayMauText = String(cols[2] || "").trim();
            const tongSlText = String(cols[3] || "").trim();

            if (!masp) continue;

            const khoItems = parseSizeSlText(khoText);
            const bayMauItems = parseSizeSlText(bayMauText);
            const tongSl = normalizeNumber(tongSlText);

            // 1) nạp kho
            if (hasRealSizeItems(khoItems)) {
                khoItems.forEach((item) => {
                    const key = makeKey(masp, item.size);
                    nhapMoi[key] = {
                        masp,
                        size: item.size,
                        sl: item.sl
                    };
                });
            }

            // 2) nạp mẫu
            if (hasRealSizeItems(bayMauItems)) {
                bayMauItems.forEach((item) => {
                    const key = makeKey(masp, item.size);
                    bayMauMoi[key] = {
                        masp,
                        size: item.size,
                        sl: item.sl
                    };
                });
            }

            // 3) fallback cho kiểu cũ: chỉ có mã + kho + tổng, chưa có mẫu
            if (!hasRealSizeItems(khoItems) && !hasRealSizeItems(bayMauItems) && tongSl > 0) {
                const key = makeKey(masp, "0");
                nhapMoi[key] = {
                    masp,
                    size: "0",
                    sl: tongSl
                };
            }
        }

        return { nhapMoi, bayMauMoi };
    }

    async function pasteDuLieuNhap() {
        try {
            const text = await navigator.clipboard.readText();
            if (!String(text || "").trim()) {
                alert("Clipboard đang trống.");
                return;
            }

            const { nhapMoi, bayMauMoi } = parseClipboardToNhapMap(text);

            const soDong =
                new Set([
                    ...Object.values(nhapMoi).map(x => normalizeMasp(x.masp)),
                    ...Object.values(bayMauMoi).map(x => normalizeMasp(x.masp))
                ]).size;

            if (soDong === 0) {
                alert("Dữ liệu dán không hợp lệ.");
                return;
            }

            const ok = confirm("Dán dữ liệu sẽ thay toàn bộ phần nhập hiện tại. Bạn có muốn tiếp tục không?");
            if (!ok) return;

            const state = getState();
            state.nhap = nhapMoi;
            state.bayMau = bayMauMoi;
            state.ketQua = {};
            state.selectedMasp = "";

            state.nhapOrder = [...new Set([
                ...Object.values(nhapMoi).map(x => normalizeMasp(x.masp)),
                ...Object.values(bayMauMoi).map(x => normalizeMasp(x.masp))
            ])];

            renderBangKetQua();
            alert(`Đã dán ${soDong} dòng dữ liệu nhập.`);
        } catch (err) {
            console.error("[KNK] pasteDuLieuNhap error:", err);
            alert("Không đọc được dữ liệu từ clipboard.");
        }
    }

    function xoaDongDangChon() {
        docLaiNhapTuBangHTML();

        const state = getState();
        const masp = normalizeMasp(state.selectedMasp || "");

        if (!masp) {
            alert("Bạn chưa chọn dòng cần xóa.");
            return;
        }

        // const ok = confirm(`Bạn có chắc muốn xóa dòng mã hàng: ${masp} ?`); 
        // if (!ok) return;

        Object.keys(state.nhap || {}).forEach((key) => {
            const row = state.nhap[key];
            if (normalizeMasp(row?.masp) === masp) {
                delete state.nhap[key];
            }
        });

        Object.keys(state.bayMau || {}).forEach((key) => {
            const row = state.bayMau[key];
            if (normalizeMasp(row?.masp) === masp) {
                delete state.bayMau[key];
            }
        });

        Object.keys(state.ketQua || {}).forEach((key) => {
            const info = splitKey(key);
            if (normalizeMasp(info.masp) === masp) {
                delete state.ketQua[key];
            }
        });

        state.selectedMasp = "";
        renderBangKetQua();

        const maspEl = byId("masp");
        const sizeEl = byId("size");
        const slEl = byId("soluong");

        if (maspEl) {
            maspEl.value = masp;
            maspEl.focus();

            setTimeout(() => {
                try {
                    maspEl.select();
                } catch (err) { }
            }, 0);
        }

        if (sizeEl) sizeEl.value = "";
        if (slEl) slEl.value = "1";

        hideSizePopup();
    }

    // =========================
    // BUTTONS
    // =========================

    // =========================
    // SAVE KIEM NHAP KHO
    // =========================

    function tinhTongSoLuongTheoMap(mapObj) {
        return Object.values(mapObj || {}).reduce((sum, row) => {
            return sum + normalizeNumber(row?.sl || 0);
        }, 0);
    }

    function groupRowsByMasp(mapObj) {
        const out = {};

        Object.keys(mapObj || {}).forEach((key) => {
            const row = mapObj[key];
            if (!row) return;

            const masp = normalizeMasp(row.masp);
            const size = normalizeSize(row.size);
            const sl = normalizeNumber(row.sl);

            if (!masp) return;

            if (!out[masp]) {
                out[masp] = [];
            }

            out[masp].push({
                masp,
                size,
                sl,
                key
            });
        });

        return out;
    }

    function tinhTongTheoMasp(groupMap) {
        const out = {};
        Object.keys(groupMap || {}).forEach((masp) => {
            out[masp] = (groupMap[masp] || []).reduce((sum, row) => sum + normalizeNumber(row.sl), 0);
        });
        return out;
    }

    function xayDungDuLieuTongVaChiTietLech() {
        const state = getState();
        const nhapMap = getMapNhapTong();
        const xuatMap = state.xuat || {};
        const ketQuaMap = state.ketQua || {};

        const nhapGroup = groupRowsByMasp(nhapMap);
        const xuatGroup = groupRowsByMasp(xuatMap);

        const tongNhapTheoMasp = tinhTongTheoMasp(nhapGroup);
        const tongXuatTheoMasp = tinhTongTheoMasp(xuatGroup);

        const allMasps = Array.from(new Set([
            ...Object.keys(nhapGroup),
            ...Object.keys(xuatGroup)
        ])).sort();

        const chiTietLech = [];
        let tongSlLechThieu = 0;
        let tongSlLechThua = 0;

        for (const masp of allMasps) {
            const nhapRows = nhapGroup[masp] || [];
            const xuatRows = xuatGroup[masp] || [];

            const hasRealSizeNhap = nhapRows.some(r => {
                const s = normalizeSize(r.size);
                return s && s !== "0";
            });

            if (hasRealSizeNhap) {
                const allKeys = new Set([
                    ...nhapRows.map(r => r.key),
                    ...xuatRows.map(r => r.key)
                ]);

                for (const key of allKeys) {
                    const kq = ketQuaMap[key];
                    if (!kq || kq.trangthai === "OK") continue;

                    const nhap = nhapMap[key];
                    const xuat = xuatMap[key];

                    const slNhap = normalizeNumber(nhap?.sl || 0);
                    const slXuat = normalizeNumber(xuat?.sl || 0);
                    const slLech = Math.abs(slNhap - slXuat);
                    const size = splitKey(key).size || "0";

                    let trangthai_nhan = "lech";
                    if (kq.trangthai === "THIEU") {
                        trangthai_nhan = "thieu";
                        tongSlLechThieu += slLech;
                    } else if (kq.trangthai === "THUA") {
                        trangthai_nhan = "thua";
                        tongSlLechThua += slLech;
                    }

                    chiTietLech.push({
                        masp,
                        size,
                        trangthai_nhan,
                        sl_xuat: slXuat,
                        sl_nhan: slNhap,
                        sl_lech: slLech,
                        chi_tiet: `${slNhap}/${slXuat}`
                    });
                }
            } else {
                const keyTong = makeKey(masp, "0");
                const kq = ketQuaMap[keyTong];
                if (!kq || kq.trangthai === "OK") continue;

                const slNhap = normalizeNumber(tongNhapTheoMasp[masp] || 0);
                const slXuat = normalizeNumber(tongXuatTheoMasp[masp] || 0);
                const slLech = Math.abs(slNhap - slXuat);

                let trangthai_nhan = "lech";
                if (kq.trangthai === "THIEU") {
                    trangthai_nhan = "thieu";
                    tongSlLechThieu += slLech;
                } else if (kq.trangthai === "THUA") {
                    trangthai_nhan = "thua";
                    tongSlLechThua += slLech;
                }

                chiTietLech.push({
                    masp,
                    size: "0",
                    trangthai_nhan,
                    sl_xuat: slXuat,
                    sl_nhan: slNhap,
                    sl_lech: slLech,
                    chi_tiet: `${slNhap}/${slXuat}`
                });
            }
        }

        return {
            tong_so_mat_hang: allMasps.length,
            tong_so_luong_xuat: tinhTongSoLuongTheoMap(xuatMap),
            tong_so_luong_nhan: tinhTongSoLuongTheoMap(nhapMap),
            so_ma_lech: chiTietLech.length,
            tong_sl_lech_thieu: tongSlLechThieu,
            tong_sl_lech_thua: tongSlLechThua,
            ket_qua_chung: chiTietLech.length > 0 ? "lech" : "ok",
            chiTietLech
        };
    }

    function buildChiTietKiemTonRows(so_phieu, diadiem) {
        const state = getState();
        const nhapKhoMap = state.nhap || {};
        const bayMauMap = state.bayMau || {};
        const nhapTongMap = getMapNhapTong();
        const xuatMap = state.xuat || {};
        const ketQuaMap = state.ketQua || {};

        const nhapKhoGroupMap = groupByMasp(nhapKhoMap);
        const bayMauGroupMap = groupByMasp(bayMauMap);
        const nhapTongGroupMap = groupByMasp(nhapTongMap);
        const xuatGroupMap = groupByMasp(xuatMap);

        const allMasps = Array.from(
            new Set([
                ...Object.keys(nhapTongGroupMap),
                ...Object.keys(xuatGroupMap)
            ])
        );

        const orderedMasps = buildOrderedMasps(nhapTongGroupMap, xuatGroupMap, state);

        return orderedMasps.map((masp, index) => {
            const nhapKhoGroup = nhapKhoGroupMap[masp];
            const bayMauGroup = bayMauGroupMap[masp];
            const nhapTongGroup = nhapTongGroupMap[masp];
            const xuatGroup = xuatGroupMap[masp];
            const kqTong = buildKetQuaTheoMasp(nhapTongGroup, xuatGroup, ketQuaMap);

            return {
                so_phieu,
                stt: index + 1,
                diadiem,
                masp,
                tensp: "",
                size_kiem: formatSizeSl(nhapTongGroup?.items || []) || "",
                tong_sl_kiem: tongSoLuong(nhapTongGroup?.items || []) || 0,

                size_kiem_kho: formatSizeSl(nhapKhoGroup?.items || []) || "",
                tong_sl_kiem_kho: tongSoLuong(nhapKhoGroup?.items || []) || 0,

                size_kiem_bay_mau: formatSizeSl(bayMauGroup?.items || []) || "",
                tong_sl_kiem_bay_mau: tongSoLuong(bayMauGroup?.items || []) || 0,

                size_ton_may: formatSizeSl(xuatGroup?.items || []) || "",
                tong_sl_ton_may: tongSoLuong(xuatGroup?.items || []) || 0,
                trang_thai: String(kqTong?.trangthai || "OK").toUpperCase(),
                chi_tiet_chenh_lech: kqTong?.chitiet || "",

                du_lieu_kiem_json: nhapTongGroup?.items || [],
                du_lieu_kiem_kho_json: nhapKhoGroup?.items || [],
                du_lieu_kiem_bay_mau_json: bayMauGroup?.items || [],

                du_lieu_ton_json: xuatGroup?.items || []
            };
        });
    }

    async function luuPhieuKiemTonKho() {
        try {

            if (isPhieuDangXem()) {
                alert("Phiếu kiểm tồn cũ chỉ được xem, không được sửa hoặc lưu lại. Hãy bấm Thêm mới để tạo phiếu mới.");
                return;
            }
            if (!window.supabase) {
                alert("Không tìm thấy kết nối Supabase.");
                return;
            }

            if (window.dangLuuKiemTonKho) return;
            window.dangLuuKiemTonKho = true;

            const sohdEl = byId("sohd");
            const ngayEl = byId("ngay");
            const tennvEl = byId("tennv");
            const ghichuEl = byId("ghichu_top");

            const so_phieu = String(sohdEl?.value || "").trim();
            const ngay_ct = String(ngayEl?.value || "").trim();
            const ten_nguoi_kiem = String(tennvEl?.value || "").trim();
            const ghi_chu = String(ghichuEl?.value || "").trim();
            const diadiem = String(CFG.branch || byId("diadiem")?.value || "").trim();

            if (!so_phieu) {
                alert("Chưa có số phiếu kiểm tồn.");
                sohdEl?.focus();
                return;
            }

            if (!ngay_ct) {
                alert("Chưa có ngày kiểm.");
                ngayEl?.focus();
                return;
            }

            if (!ten_nguoi_kiem) {
                alert("Chưa có nhân viên kiểm.");
                return;
            }

            docLaiNhapTuBangHTML();

            const state = getState();

            if (!state.nhap || Object.keys(state.nhap).length === 0) {
                alert("Chưa có dữ liệu kiểm để lưu.");
                return;
            }

            // Tự động kiểm tra trước khi lưu
            await napTonMayVaKiemTra();

            if (!state.daKiemTra) {
                alert("Bạn phải bấm KIỂM TRA trước khi lưu.");
                return;
            }

            if (!state.xuat || Object.keys(state.xuat).length === 0) {
                alert("Chưa có dữ liệu tồn máy. Hãy bấm KIỂM TRA lại.");
                return;
            }

            const { data: tonTaiCu, error: errCheck } = await window.supabase
                .from("kiem_ton_kho")
                .select("id, so_phieu")
                .eq("so_phieu", so_phieu)
                .maybeSingle();

            if (errCheck) {
                console.error("[kiem_ton_kho] check ton tai error:", errCheck);
                alert("Lỗi khi kiểm tra phiếu đã tồn tại.");
                return;
            }

            const thongTinTong = xayDungDuLieuTongVaChiTietLech();
            const rowsChiTiet = buildChiTietKiemTonRows(so_phieu, diadiem);

            const so_dong_ok = rowsChiTiet.filter(x => String(x.trang_thai || "").toUpperCase() === "OK").length;
            const so_dong_thieu = rowsChiTiet.filter(x => String(x.trang_thai || "").toUpperCase() === "THIEU").length;
            const so_dong_thua = rowsChiTiet.filter(x => String(x.trang_thai || "").toUpperCase() === "THUA").length;
            const so_dong_lech = rowsChiTiet.filter(x => String(x.trang_thai || "").toUpperCase() === "LECH").length;

            const rowTong = {
                so_phieu,
                ngay_ct,
                thoi_diem_kiem: new Date().toISOString(),
                thoi_diem_chot_ton: state.thoiDiemChotTon || new Date().toISOString(),
                diadiem,
                nguoi_kiem: String(byId("manv")?.value || "").trim(),
                ten_nguoi_kiem: ten_nguoi_kiem,
                ghi_chu,
                tong_masp: thongTinTong.tong_so_mat_hang || 0,
                tong_sl_kiem: thongTinTong.tong_so_luong_nhan || 0,
                tong_sl_ton_may: thongTinTong.tong_so_luong_xuat || 0,
                tong_sl_lech_thieu: thongTinTong.tong_sl_lech_thieu || 0,
                tong_sl_lech_thua: thongTinTong.tong_sl_lech_thua || 0,
                so_dong_ok,
                so_dong_thieu,
                so_dong_thua,
                so_dong_lech
            };

            if (tonTaiCu) {
                alert(`Số phiếu ${so_phieu} đã tồn tại. Không được ghi đè phiếu kiểm tồn cũ. Hãy bấm Thêm mới để tạo phiếu mới.`);
                return;
            }

            const { error: errTong } = await window.supabase
                .from("kiem_ton_kho")
                .insert([rowTong]);

            if (errTong) {
                console.error("[kiem_ton_kho] insert tong error:", errTong);
                alert("Lỗi khi lưu bảng kiem_ton_kho: " + (errTong.message || ""));
                return;
            }

            if (rowsChiTiet.length > 0) {
                const { error: errCt } = await window.supabase
                    .from("ct_kiem_ton_kho")
                    .insert(rowsChiTiet);

                if (errCt) {
                    console.error("[ct_kiem_ton_kho] insert error:", errCt);
                    alert("Đã lưu bảng tổng nhưng lỗi khi lưu chi tiết kiểm tồn: " + (errCt.message || ""));
                    return;
                }
            }

            alert(`Đã lưu phiếu kiểm tồn: ${so_phieu}`);
            await resetPhieu();

        } catch (err) {
            console.error("[luuPhieuKiemTonKho] exception:", err);
            alert("Có lỗi khi lưu dữ liệu kiểm tồn kho.");
        } finally {
            window.dangLuuKiemTonKho = false;
        }
    }

    function bindButtons() {
        const btnThem = byId("them");
        if (btnThem) {
            btnThem.addEventListener("click", async (e) => {
                e.preventDefault();
                await resetPhieu();
            });
        }

        const btnKiemTra = byId("btnKiemTraPhieu_footer");
        if (btnKiemTra) {
            btnKiemTra.addEventListener("click", async (e) => {
                e.preventDefault();
                await napTonMayVaKiemTra();
            });
        }

        const btnPhieuTruoc = byId("btn-phieu-truoc");
        if (btnPhieuTruoc) {
            btnPhieuTruoc.addEventListener("click", async (e) => {
                e.preventDefault();
                await moPhieuTruoc();
            });
        }

        const btnPhieuSau = byId("btn-phieu-sau");
        if (btnPhieuSau) {
            btnPhieuSau.addEventListener("click", async (e) => {
                e.preventDefault();
                await moPhieuSau();
            });
        }

        const btnCopy = byId("btn-copy-nhap");
        if (btnCopy) {
            btnCopy.addEventListener("click", async (e) => {
                e.preventDefault();
                await copyDuLieuNhap();
            });
        }

        const btnPaste = byId("btn-paste-nhap");
        if (btnPaste) {
            btnPaste.addEventListener("click", async (e) => {
                e.preventDefault();
                await pasteDuLieuNhap();
            });
        }

        const btnSua = byId("sua");
        if (btnSua) {
            btnSua.textContent = "Xóa";
            btnSua.addEventListener("click", async (e) => {
                e.preventDefault();

                if (isPhieuDangXem()) {
                    alert("Phiếu cũ chỉ được xem, không được xóa dòng. Hãy bấm Thêm mới để tạo phiếu mới.");
                    return;
                }

                xoaDongDangChon();
            });
        }

        const btnThuaNhapKiem = byId("btnThuaNhapKiem");
        if (btnThuaNhapKiem) {
            btnThuaNhapKiem.addEventListener("click", async (e) => {
                e.preventDefault();
                await taoPhieuDieuChinhKiem("nhap");
            });
        }

        const btnThieuXuatKiem = byId("btnThieuXuatKiem");
        if (btnThieuXuatKiem) {
            btnThieuXuatKiem.addEventListener("click", async (e) => {
                e.preventDefault();
                await taoPhieuDieuChinhKiem("xuat");
            });
        }

        byId("btnCanDoiSize")?.addEventListener("click", canDoiSizeKiemTon);

        byId("btnLayBayMau")?.addEventListener("click", async () => {
            const cfgSheet = getBayMauSheetConfig();

            const ok = confirm(
                `Phần mềm sẽ tải dữ liệu bày mẫu từ Google Sheet ${cfgSheet.sheetName}.\n\n` +
                `Dữ liệu lấy từ:\n` +
                `- Cột A: mã sản phẩm\n` +
                `- Cột B: size\n\n` +
                `Dữ liệu sẽ được đưa vào cột MẪU của bảng kiểm tồn.\n\n` +
                `Bạn có muốn tiếp tục không?`
            );

            if (!ok) return;

            await layBayMauTuGoogleSheet();
        });

        byId("btnLayKiemKho")?.addEventListener("click", async () => {
            const cfgSheet = getKiemKhoSheetConfig();

            const ok = confirm(
                `Phần mềm sẽ tải dữ liệu kiểm kho từ Google Sheet ${cfgSheet.sheetName}.\n\n` +
                `Dữ liệu lấy từ:\n` +
                `- Cột A: mã sản phẩm\n` +
                `- Cột B: size\n\n` +
                `Dữ liệu sẽ được đưa vào cột KHO của bảng kiểm tồn.\n\n` +
                `Bạn có muốn tiếp tục không?`
            );

            if (!ok) return;

            await layKiemKhoTuGoogleSheet();
        });

        byId("btnLayYeuCauKiemTon")?.addEventListener("click", async () => {
            const cfgSheet = getKiemKhoSheetConfig();

            const ok = confirm(
                `Phần mềm sẽ tải yêu cầu kiểm tồn từ Google Sheet ${cfgSheet.sheetName}.\n\n` +
                `Dữ liệu lấy từ:\n` +
                `- Cột A: mã sản phẩm\n\n` +
                `Phần mềm chỉ lấy mã sản phẩm, không lấy size.\n` +
                `Dữ liệu sẽ được đưa vào cột TỒN MÁY / Mã hàng của trang kiểm tồn.\n\n` +
                `Bạn có muốn tiếp tục không?`
            );

            if (!ok) return;

            await layYeuCauKiemTonTuGoogleSheet();
        });

    }

    async function moLaiPhieuKiemTonCu(soPhieu) {
        if (!window.supabase) {
            alert("Không tìm thấy kết nối Supabase.");
            return;
        }

        const sohd = String(soPhieu || "").trim();
        if (!sohd) {
            alert("Chưa có số phiếu kiểm tồn.");
            return;
        }

        const { data: phieuTong, error: errTong } = await window.supabase
            .from("kiem_ton_kho")
            .select("*")
            .eq("so_phieu", sohd)
            .maybeSingle();

        if (errTong) {
            console.error(errTong);
            alert("Lỗi khi đọc phiếu kiểm tồn.");
            return;
        }

        if (!phieuTong) {
            alert("Không tìm thấy phiếu kiểm tồn.");
            return;
        }

        const { data: rows, error: errRows } = await window.supabase
            .from("ct_kiem_ton_kho")
            .select("*")
            .eq("so_phieu", sohd)
            .order("stt", { ascending: true });

        if (errRows) {
            console.error(errRows);
            alert("Lỗi khi đọc chi tiết phiếu kiểm tồn.");
            return;
        }

        const state = getState();
        state.nhap = {};
        state.xuat = {};
        state.ketQua = {};
        state.nhapOrder = [];
        state.xuatOrder = [];
        state.daKiemTra = false;
        state.thoiDiemChotTon = phieuTong.thoi_diem_chot_ton || null;

        byId("sohd").value = phieuTong.so_phieu || "";
        byId("ngay").value = phieuTong.ngay_ct || "";
        byId("ghichu_top").value = phieuTong.ghi_chu || "";

        const tennvEl = byId("tennv");
        if (tennvEl) tennvEl.value = phieuTong.ten_nguoi_kiem || "";

        const manvEl = byId("manv");
        if (manvEl) manvEl.value = phieuTong.nguoi_kiem || "";

        const hdState = byId("hd_state");
        if (hdState) {
            hdState.value = "xem";
            hdState.setAttribute("data-state", "xem");
        }

        (rows || []).forEach((row) => {
            const masp = normalizeMasp(row.masp);
            if (masp) {
                if (!state.nhapOrder.includes(masp)) state.nhapOrder.push(masp);
                if (!state.xuatOrder.includes(masp)) state.xuatOrder.push(masp);
            }

            const khoItems =
                Array.isArray(row.du_lieu_kiem_kho_json) && row.du_lieu_kiem_kho_json.length
                    ? row.du_lieu_kiem_kho_json
                    : parseSizeSlText(row.size_kiem_kho || "");

            const bayMauItems =
                Array.isArray(row.du_lieu_kiem_bay_mau_json) && row.du_lieu_kiem_bay_mau_json.length
                    ? row.du_lieu_kiem_bay_mau_json
                    : parseSizeSlText(row.size_kiem_bay_mau || "");

            // fallback cho phiếu cũ chưa có dữ liệu tách kho / mẫu  moi2
            const tongItemsFallback =
                (!khoItems.length && !bayMauItems.length)
                    ? (Array.isArray(row.du_lieu_kiem_json) && row.du_lieu_kiem_json.length
                        ? row.du_lieu_kiem_json
                        : parseSizeSlText(row.size_kiem || ""))
                    : [];

            khoItems.forEach(item => {
                const key = makeKey(masp, item.size);
                state.nhap[key] = {
                    masp,
                    size: item.size,
                    sl: item.sl
                };
            });

            bayMauItems.forEach(item => {
                const key = makeKey(masp, item.size);
                state.bayMau[key] = {
                    masp,
                    size: item.size,
                    sl: item.sl
                };
            });

            tongItemsFallback.forEach(item => {
                const key = makeKey(masp, item.size);
                state.nhap[key] = {
                    masp,
                    size: item.size,
                    sl: item.sl
                };
            });

            const xuatItems = parseSizeSlText(row.size_ton_may || "");
            xuatItems.forEach(item => {
                const key = makeKey(masp, item.size);
                state.xuat[key] = {
                    masp,
                    size: item.size,
                    sl: item.sl
                };
            });
        });

        renderBangKetQua();
        kiemTraPhieu();
        state.daKiemTra = true;
    }

    async function docPhieuKiemTonTuDB(soPhieu) {
        const sohd = String(soPhieu || "").trim();
        if (!sohd) throw new Error("Chưa có số phiếu.");

        const { data: phieuTong, error: errTong } = await window.supabase
            .from("kiem_ton_kho")
            .select("*")
            .eq("so_phieu", sohd)
            .maybeSingle();

        if (errTong) throw errTong;
        if (!phieuTong) throw new Error("Không tìm thấy phiếu kiểm tồn.");

        const { data: rows, error: errRows } = await window.supabase
            .from("ct_kiem_ton_kho")
            .select("*")
            .eq("so_phieu", sohd)
            .order("stt", { ascending: true });

        if (errRows) throw errRows;

        return { phieuTong, rows: rows || [] };
    }

    async function layDanhSachSoPhieuKiemTonTheoCoSo() {
        if (!window.supabase) return [];

        const prefix = String(CFG.soPhieuPrefix || "").trim();
        const { data, error } = await window.supabase
            .from("kiem_ton_kho")
            .select("so_phieu, ngay_ct, created_at")
            .ilike("so_phieu", `${prefix}%`)
            .order("so_phieu", { ascending: true });

        if (error) {
            console.error("[KTK] layDanhSachSoPhieuKiemTonTheoCoSo error:", error);
            return [];
        }

        return (data || []).map(x => String(x.so_phieu || "").trim()).filter(Boolean);
    }

    async function moPhieuLienKe(offset) {
        const ds = await layDanhSachSoPhieuKiemTonTheoCoSo();
        if (!ds.length) {
            alert("Không có phiếu kiểm tồn nào.");
            return;
        }

        const soHienTai = String(byId("sohd")?.value || "").trim();

        // Nếu chưa có số phiếu hiện tại:
        // - Quay lại => mở phiếu cuối cùng
        // - Tiếp tục => mở phiếu đầu tiên
        if (!soHienTai) {
            const fallback = offset < 0 ? ds[ds.length - 1] : ds[0];
            await moLaiPhieuKiemTonCu(fallback);
            return;
        }

        const idx = ds.indexOf(soHienTai);

        // Nếu số phiếu hiện tại chưa được lưu (ví dụ đang là phiếu mới kế tiếp),
        // thì:
        // - Quay lại => mở phiếu cuối cùng đã lưu
        // - Tiếp tục => báo đã là phiếu cuối
        if (idx < 0) {
            if (offset < 0) {
                await moLaiPhieuKiemTonCu(ds[ds.length - 1]);
                return;
            } else {
                alert("Đây đã là phiếu cuối cùng.");
                return;
            }
        }

        const newIndex = idx + offset;
        if (newIndex < 0 || newIndex >= ds.length) {
            alert(offset < 0 ? "Đây đã là phiếu đầu tiên." : "Đây đã là phiếu cuối cùng.");
            return;
        }

        await moLaiPhieuKiemTonCu(ds[newIndex]);
    }

    async function moPhieuTruoc() {
        await moPhieuLienKe(-1);
    }

    async function moPhieuSau() {
        await moPhieuLienKe(1);
    }

    async function moPopupChonPhieuCu() {
        const ds = await layDanhSachSoPhieuKiemTonTheoCoSo();
        if (!ds.length) {
            alert("Không có phiếu kiểm tồn cũ.");
            return;
        }

        const old = document.getElementById("popup_chon_phieu_cu");
        if (old) old.remove();

        const wrap = document.createElement("div");
        wrap.id = "popup_chon_phieu_cu";
        wrap.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.35);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

        const box = document.createElement("div");
        box.style.cssText = `
        width: 420px;
        max-width: 95vw;
        max-height: 80vh;
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 8px 30px rgba(0,0,0,.25);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;

        box.innerHTML = `
        <div style="font-weight:700; font-size:18px;">Chọn phiếu kiểm tồn cũ</div>
        <input id="popup_chon_phieu_cu_kw" placeholder="Lọc số phiếu..." style="padding:6px 8px;">
        <div id="popup_chon_phieu_cu_list" style="border:1px solid #ddd; overflow:auto; max-height:50vh;"></div>
        <div style="text-align:right;">
            <button id="popup_chon_phieu_cu_dong">Đóng</button>
        </div>
    `;

        wrap.appendChild(box);
        document.body.appendChild(wrap);

        const listEl = box.querySelector("#popup_chon_phieu_cu_list");
        const kwEl = box.querySelector("#popup_chon_phieu_cu_kw");
        const btnDong = box.querySelector("#popup_chon_phieu_cu_dong");

        function renderList(keyword = "") {
            const kw = String(keyword || "").trim().toLowerCase();
            const filtered = ds.filter(so => !kw || so.toLowerCase().includes(kw));

            listEl.innerHTML = "";
            filtered.slice().reverse().forEach((so) => {
                const row = document.createElement("div");
                row.textContent = so;
                row.style.cssText = `
                padding: 8px 10px;
                border-bottom: 1px solid #eee;
                cursor: pointer;
            `;
                row.addEventListener("mouseenter", () => row.style.background = "#f5f5f5");
                row.addEventListener("mouseleave", () => row.style.background = "#fff");
                row.addEventListener("click", async () => {
                    wrap.remove();
                    await moLaiPhieuKiemTonCu(so);
                });
                listEl.appendChild(row);
            });
        }

        renderList("");

        kwEl.addEventListener("input", () => renderList(kwEl.value));
        btnDong.addEventListener("click", () => wrap.remove());
        wrap.addEventListener("click", (e) => {
            if (e.target === wrap) wrap.remove();
        });

        kwEl.focus();
    }

    // =========================
    // API công khai
    // =========================
    window.KiemTonKho = {
        resetPhieu,
        renderBangKetQua,
        kiemTraPhieu,
        napTonMayVaKiemTra,
        themDongNhapBenTrai,
        getState,
        luuPhieuKiemTonKho,
        copyDuLieuNhap,
        pasteDuLieuNhap,
        xoaDongDangChon,
        suaDongDangChon,
        moLaiPhieuKiemTonCu,
        moPopupChonPhieuCu,
        moPhieuTruoc,
        moPhieuSau,
        layBayMauTuGoogleSheet,
        canDoiSizeKiemTon,

        setXuatData(dataMap, orderArr) {
            const state = getState();
            state.xuat = dataMap || {};
            state.xuatOrder = Array.isArray(orderArr) ? orderArr.map(normalizeMasp).filter(Boolean) : [];
            state.ketQua = {};
            state.daKiemTra = false;
            renderBangKetQua();
        }
    };


    // =========================
    // INIT
    // =========================
    async function init() {
        updateTitle();
        setDefaultBranchInfo();
        bindInputEvents();
        bindButtons();
        bindRowSelection();

        // Mở khóa beep cho trình duyệt
        setupBeepUnlockOnce(document);

        await resetPhieu();
        focusNhapMasp(true);

        console.log("[nhapkiemkho] init OK", CFG);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }


    // ✅ đảm bảo popup_size luôn tồn tại
    document.addEventListener("DOMContentLoaded", () => {
        let popup = document.getElementById("popup_size");

        if (!popup) {
            popup = document.createElement("div");
            popup.id = "popup_size";

            popup.style.position = "absolute";
            popup.style.top = "100%";
            popup.style.left = "0";
            popup.style.width = "200px";
            popup.style.maxHeight = "200px";
            popup.style.background = "#fff";
            popup.style.border = "1px solid #ccc";
            popup.style.display = "none";
            popup.style.overflowY = "auto";
            popup.style.zIndex = "9999";

            document.body.appendChild(popup);
        }

    });

    document.addEventListener("keydown", function (e) {
        const tag = (document.activeElement?.tagName || "").toUpperCase();
        const isTyping =
            tag === "INPUT" ||
            tag === "TEXTAREA" ||
            tag === "SELECT" ||
            document.activeElement?.isContentEditable;

        if (e.key === "F11") {
            e.preventDefault();
            moPopupChonPhieuCu();
            return;
        }

        if (e.key === "F3") {
            e.preventDefault();
            suaDongDangChon();
            return;
        }
    });

    function buildTonMapFromSavedRows(rows) {
        const out = {};
        (rows || []).forEach(row => {
            const masp = normalizeMasp(row.masp);
            const arr = Array.isArray(row.du_lieu_ton_json) ? row.du_lieu_ton_json : [];
            arr.forEach(it => {
                const key = makeKey(masp, it.size || "0");
                out[key] = {
                    masp,
                    size: normalizeSize(it.size || "0"),
                    sl: normalizeNumber(it.sl || 0)
                };
            });
        });
        return out;
    }

    function buildTonMapFromRpcData(data) {
        const out = {};
        (data || []).forEach(item => {
            const masp = normalizeMasp(item.masp);
            const size = normalizeSize(item.size || "0");

            const sl = normalizeNumber(
                CFG.branch === "cs1"
                    ? (item.ton_cs1 ?? item.ton_cuoi ?? item.ton ?? item.soluong ?? 0)
                    : (item.ton_cs2 ?? item.ton_cuoi ?? item.ton ?? item.soluong ?? 0)
            );

            const key = makeKey(masp, size);
            out[key] = { masp, size, sl };
        });
        return out;
    }

    function areTonMapsEqual(savedMap, currentMap) {
        const keys = new Set([
            ...Object.keys(savedMap || {}),
            ...Object.keys(currentMap || {})
        ]);

        for (const key of keys) {
            const a = normalizeNumber(savedMap?.[key]?.sl || 0);
            const b = normalizeNumber(currentMap?.[key]?.sl || 0);
            if (a !== b) {
                return false;
            }
        }
        return true;
    }

    async function kiemTraTonMayPhiếuConHopLe(rows, ngayCt) {
        const dsMasp = Array.from(new Set(
            (rows || []).map(r => normalizeMasp(r.masp)).filter(Boolean)
        ));

        if (!dsMasp.length) {
            return { ok: false, message: "Phiếu không có mã sản phẩm." };
        }

        const { data, error } = await window.supabase.rpc("xntnhanh", {
            p_masps: dsMasp,
            p_den_ngay: ngayCt,
            p_tonghop_size: false
        });

        if (error) {
            console.error("[xntnhanh] kiemTraTonMayPhiếuConHopLe:", error);
            return { ok: false, message: "Lỗi khi kiểm tra tồn máy hiện tại." };
        }

        const savedMap = buildTonMapFromSavedRows(rows);
        const currentMap = buildTonMapFromRpcData(data || []);

        console.log("[KTK] savedMap =", savedMap);
        console.log("[KTK] currentMap =", currentMap);
        console.log("[KTK] rpcData =", data || []);

        const equal = areTonMapsEqual(savedMap, currentMap);

        return {
            ok: equal,
            savedMap,
            currentMap,
            rpcData: data || [],
            message: equal
                ? "Tồn máy hiện tại khớp với tồn máy đã lưu."
                : "Tồn máy hiện tại đã thay đổi so với thời điểm kiểm. Không được tạo phiếu điều chỉnh."
        };
    }

    function tachItemsNhapXuatTuRowsKiemTon(rows, mode) {
        const items = [];

        (rows || []).forEach(row => {
            const masp = normalizeMasp(row.masp);
            const trangThai = String(row.trang_thai || "").trim().toUpperCase();

            const duLieuKiem = Array.isArray(row.du_lieu_kiem_json) ? row.du_lieu_kiem_json : [];
            const duLieuTon = Array.isArray(row.du_lieu_ton_json) ? row.du_lieu_ton_json : [];

            const mapKiem = {};
            const mapTon = {};

            duLieuKiem.forEach(it => {
                const key = makeKey(masp, it.size || "0");
                mapKiem[key] = normalizeNumber(it.sl || 0);
            });

            duLieuTon.forEach(it => {
                const key = makeKey(masp, it.size || "0");
                mapTon[key] = normalizeNumber(it.sl || 0);
            });

            const keys = new Set([...Object.keys(mapKiem), ...Object.keys(mapTon)]);

            for (const key of keys) {
                const { size } = splitKey(key);
                const slKiem = normalizeNumber(mapKiem[key] || 0);
                const slTon = normalizeNumber(mapTon[key] || 0);

                if (slKiem > slTon) {
                    if (mode === "nhap") {
                        items.push({
                            masp,
                            size: size || "0",
                            sl: slKiem - slTon
                        });
                    }
                } else if (slKiem < slTon) {
                    if (mode === "xuat") {
                        items.push({
                            masp,
                            size: size || "0",
                            sl: slTon - slKiem
                        });
                    }
                }
            }
        });

        const merged = new Map();
        items.forEach(it => {
            const key = `${it.masp}@@${it.size}`;
            if (!merged.has(key)) merged.set(key, { ...it });
            else merged.get(key).sl += it.sl;
        });

        return Array.from(merged.values()).filter(x => normalizeNumber(x.sl) > 0);
    }

    async function kiemTraDaTaoPhieuDieuChinh(phieuTong, mode) {
        if (mode === "nhap" && phieuTong.da_tao_nhap_kiem) {
            return {
                ok: false,
                message: `Phiếu này đã tạo nhập kiểm rồi (${phieuTong.so_phieu_nhap_kiem || "không rõ số phiếu"}).`
            };
        }

        if (mode === "xuat" && phieuTong.da_tao_xuat_kiem) {
            return {
                ok: false,
                message: `Phiếu này đã tạo xuất kiểm rồi (${phieuTong.so_phieu_xuat_kiem || "không rõ số phiếu"}).`
            };
        }

        return { ok: true };
    }

    async function capNhatTracePhieuKiemTon(soPhieuKiemTon, mode, payloadMeta) {
        const { manv, tennv } = getCurrentUserInfo();
        const nowIso = new Date().toISOString();

        const patch = mode === "nhap"
            ? {
                da_tao_nhap_kiem: true,
                so_phieu_nhap_kiem: payloadMeta.so_phieu_dich || null,
                nguoi_tao_nhap_kiem: manv || null,
                ten_nguoi_tao_nhap_kiem: tennv || null,
                thoi_diem_tao_nhap_kiem: nowIso,
                so_dong_nhap_kiem: payloadMeta.so_dong || 0,
                nhap_kiem_meta_json: payloadMeta
            }
            : {
                da_tao_xuat_kiem: true,
                so_phieu_xuat_kiem: payloadMeta.so_phieu_dich || null,
                nguoi_tao_xuat_kiem: manv || null,
                ten_nguoi_tao_xuat_kiem: tennv || null,
                thoi_diem_tao_xuat_kiem: nowIso,
                so_dong_xuat_kiem: payloadMeta.so_dong || 0,
                xuat_kiem_meta_json: payloadMeta
            };

        const { error } = await window.supabase
            .from("kiem_ton_kho")
            .update(patch)
            .eq("so_phieu", soPhieuKiemTon);

        if (error) throw error;
    }

    function moTrangDieuChinhKiem(mode, soPhieuKiemTon, items) {
        const payload = {
            source: mode === "nhap" ? "kiemton_nhapkiem" : "kiemton_xuatkiem",
            cs: CFG.branch,
            from_so_phieu_kiem_ton: soPhieuKiemTon,
            created_at: new Date().toISOString(),
            items: items.map(x => ({
                masp: x.masp,
                size: x.size || "0",
                sl: normalizeNumber(x.sl || 0)
            }))
        };

        const key = `imp_kiemton_${mode}_${Date.now()}`;
        localStorage.setItem(key, JSON.stringify(payload));

        const page = mode === "nhap" ? getNhapKiemPageUrl() : getXuatKiemPageUrl();
        const url = `${location.origin}/${page}#impkey=${encodeURIComponent(key)}`;

        window.open(url, "_blank");

        return payload;
    }

    async function taoPhieuDieuChinhKiem(mode) {
        try {
            if (!window.supabase) {
                alert("Không tìm thấy kết nối Supabase.");
                return;
            }

            const hdStateEl = document.getElementById("hd_state");
            const hdStateValue = String(
                hdStateEl?.value || hdStateEl?.getAttribute("data-state") || ""
            ).trim().toLowerCase();

            if (hdStateValue !== "xem") {
                alert("Chỉ được tạo phiếu điều chỉnh khi đang mở phiếu kiểm tồn cũ.");
                return;
            }

            const soPhieu = String(document.getElementById("sohd")?.value || "").trim();
            const ngayCt = String(document.getElementById("ngay")?.value || "").trim();

            if (!soPhieu || !ngayCt) {
                alert("Phiếu kiểm tồn không hợp lệ.");
                return;
            }

            const { phieuTong, rows } = await docPhieuKiemTonTuDB(soPhieu);

            const ckDup = await kiemTraDaTaoPhieuDieuChinh(phieuTong, mode);
            if (!ckDup.ok) {
                alert(ckDup.message);
                return;
            }

            const ckTon = await kiemTraTonMayPhiếuConHopLe(rows, ngayCt);
            if (!ckTon.ok) {
                alert(ckTon.message);
                return;
            }

            const items = tachItemsNhapXuatTuRowsKiemTon(rows, mode);
            if (!items.length) {
                alert(mode === "nhap"
                    ? "Không có dữ liệu thừa để tạo phiếu nhập kiểm."
                    : "Không có dữ liệu thiếu để tạo phiếu xuất kiểm.");
                return;
            }

            const payload = moTrangDieuChinhKiem(mode, soPhieu, items);

            await capNhatTracePhieuKiemTon(soPhieu, mode, {
                so_phieu_kiem_ton: soPhieu,
                so_phieu_dich: null,
                mode,
                so_dong: items.length,
                tong_sl: items.reduce((s, x) => s + normalizeNumber(x.sl || 0), 0),
                created_at: new Date().toISOString(),
                items
            });

            //  alert(
            //  mode === "nhap"
            //     ? `Đã đẩy ${items.length} dòng sang trang nhập kiểm.`
            //      : `Đã đẩy ${items.length} dòng sang trang xuất kiểm.`
            // );

        } catch (err) {
            console.error(`[taoPhieuDieuChinhKiem:${mode}]`, err);
            alert("Lỗi thật: " + (err?.message || err));
        }
    }

    async function docPhieuKiemTonTuDB(soPhieu) {
        const sohd = String(soPhieu || "").trim();
        if (!sohd) throw new Error("Chưa có số phiếu.");

        const { data: phieuTong, error: errTong } = await window.supabase
            .from("kiem_ton_kho")
            .select("*")
            .eq("so_phieu", sohd)
            .maybeSingle();

        if (errTong) throw errTong;
        if (!phieuTong) throw new Error("Không tìm thấy phiếu kiểm tồn.");

        const { data: rows, error: errRows } = await window.supabase
            .from("ct_kiem_ton_kho")
            .select("*")
            .eq("so_phieu", sohd)
            .order("stt", { ascending: true });

        if (errRows) throw errRows;

        return { phieuTong, rows: rows || [] };
    }

})();
