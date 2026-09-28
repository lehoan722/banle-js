// HOAN TUYET - nhapHangGroupedModel.js V5 - ONE MASP ONE ROW
// Engine chung cho nhaptamcs1/2 + nhapmoimtcs1/2.
// State chuẩn: bangKetQua[MASP] = {sizes:[], soluongs:[]}
// Visual "39/3" chỉ là hiển thị; raw size nằm ở data-size="39".

let _initialized = false;
let _rendering = false;
let _coSo = "cs1";
let _pageType = "nhaptam";

const U = (v) => String(v ?? "").trim().toUpperCase();

function isNhapHangGroupedPage() {
    const p = String(location.pathname || "").toLowerCase();
    return p.includes("nhaptamcs1") ||
           p.includes("nhaptamcs2") ||
           p.includes("nhapmoimtcs1") ||
           p.includes("nhapmoimtcs2");
}

function parseMoney(v) {
    const raw = String(v ?? "").trim();
    if (!raw) return 0;
    const neg = raw.startsWith("-");
    const digits = raw.replace(/[^\d]/g, "");
    const n = Number(digits || 0);
    return neg ? -n : n;
}

function sortSizePairs(pairs) {
    return pairs.sort((a, b) => {
        const na = Number(a.size), nb = Number(b.size);
        const aa = Number.isFinite(na), bb = Number.isFinite(nb);
        if (aa && bb) return na - nb;
        if (aa) return -1;
        if (bb) return 1;
        return String(a.size).localeCompare(String(b.size), "vi");
    });
}

function getVitriTheoKho(masp) {
    const code = U(masp);
    const sp = window.sanPhamData?.[code] || null;
    const cs = String(
        document.getElementById("diadiem")?.value ||
        localStorage.getItem("diadiem") ||
        _coSo
    ).toLowerCase();

    if (!sp) return "";
    if (cs === "cs1") return sp.vitrikho1 || "";
    if (cs === "cs2") return sp.vitrikho2 || "";
    return sp.vitrikho1 || sp.vitrikho2 || sp.vitrikho3 || "";
}

function normalizeGrouped(rawBang) {
    const grouped = {};

    Object.values(rawBang || {}).forEach((item) => {
        const masp = U(item?.masp);
        if (!masp) return;

        const sp = window.sanPhamData?.[masp] || null;

        if (!grouped[masp]) {
            grouped[masp] = {
                masp,
                tensp: String(item?.tensp || sp?.tensp || ""),
                dvt: String(item?.dvt || sp?.dvt || "sp"),
                gia: Number(item?.gia ?? sp?.gianhap ?? 0) || 0,
                km: Number(item?.km || 0) || 0,
                sizes: [],
                soluongs: []
            };
        }

        const g = grouped[masp];

        if (!g.tensp && item?.tensp) g.tensp = String(item.tensp);
        if ((!g.dvt || g.dvt === "sp") && item?.dvt) g.dvt = String(item.dvt);
        if (!g.gia && Number(item?.gia || 0)) g.gia = Number(item.gia);

        const sizes = Array.isArray(item?.sizes) ? item.sizes : [];
        const counts = Array.isArray(item?.soluongs) ? item.soluongs : [];

        sizes.forEach((rawSize, idx) => {
            const size = String(rawSize ?? "").trim() || "0";
            const sl = Number(counts[idx] || 0);
            if (!sl) return;

            const pos = g.sizes.findIndex((x) => String(x) === size);
            if (pos >= 0) {
                g.soluongs[pos] = Number(g.soluongs[pos] || 0) + sl;
            } else {
                g.sizes.push(size);
                g.soluongs.push(sl);
            }
        });
    });

    Object.values(grouped).forEach((g) => {
        const pairs = g.sizes.map((size, i) => ({
            size: String(size),
            sl: Number(g.soluongs[i] || 0)
        }));
        sortSizePairs(pairs);
        g.sizes = pairs.map((x) => x.size);
        g.soluongs = pairs.map((x) => x.sl);
        g.tong = g.soluongs.reduce((s, q) => s + Number(q || 0), 0);
    });

    return grouped;
}

function updateSummary(grouped) {
    const items = Object.values(grouped || {});
    let mathang = items.length;
    let tongsl = 0, tongkm = 0, phaitra = 0;

    items.forEach((item) => {
        const gia = Number(item.gia || 0);
        const km = Number(item.km || 0);

        (item.sizes || []).forEach((_, idx) => {
            const sl = Number(item.soluongs?.[idx] || 0);
            if (!sl) return;
            tongsl += sl;
            tongkm += km * sl;
            phaitra += (gia - km) * sl;
        });
    });

    const setVal = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = String(value);
    };

    setVal("mathang", mathang);
    setVal("tongsl", tongsl);
    setVal("tongkm", tongkm.toLocaleString("vi-VN"));
    setVal("phaithanhtoan", phaitra.toLocaleString("vi-VN"));
    setVal("khachtra", phaitra.toLocaleString("vi-VN"));
    setVal("conlai", "0");
}

function renderGroupedTable(rawBang) {
    if (!isNhapHangGroupedPage()) return;

    const tbody = document.querySelector("#bangketqua tbody");
    if (!tbody) return;

    const grouped = normalizeGrouped(rawBang || window.bangKetQua || {});
    window.bangKetQua = grouped;

    _rendering = true;
    try {
        tbody.innerHTML = "";

        Object.values(grouped).forEach((item) => {
            const gia = Number(item.gia || 0);
            const km = Number(item.km || 0);
            const vitri = getVitriTheoKho(item.masp);

            const pairs = (item.sizes || [])
                .map((size, idx) => ({
                    size: String(size ?? "").trim() || "0",
                    sl: Number(item.soluongs?.[idx] || 0)
                }))
                .filter(x => x.sl > 0);

            if (!pairs.length) return;

            const tongSl = pairs.reduce((s, x) => s + x.sl, 0);
            const thanhTien = (gia - km) * tongSl;

            // Visual giống trang Chuyển chi nhánh:
            // 39/3
            // 40/2
            // 41/1
            const sizeHtml = pairs
                .map(x => `${x.size}/${x.sl}`)
                .join("<br>");

            const tr = document.createElement("tr");

            // RAW DATA là nguồn chuẩn; visual chỉ để xem.
            tr.dataset.masp = item.masp;
            tr.dataset.sizes = JSON.stringify(pairs.map(x => x.size));
            tr.dataset.soluongs = JSON.stringify(pairs.map(x => x.sl));
            tr.dataset.soluong = String(tongSl);

            tr.innerHTML = `
                <td>${item.masp}</td>
                <td>${item.tensp || ""}</td>
                <td>${sizeHtml}</td>
                <td>${tongSl}</td>
                <td>${item.dvt || ""}</td>
                <td>${gia}</td>
                <td>${km}</td>
                <td>${thanhTien.toLocaleString("vi-VN")}</td>
                <td>${vitri}</td>
                <td>0</td>
                <td>0</td>
            `;

            tbody.appendChild(tr);
        });
    } finally {
        _rendering = false;
    }

    updateSummary(grouped);
}

function rebuildFromDomGrouped() {
    if (_rendering) return window.bangKetQua || {};

    const tbody = document.querySelector("#bangketqua tbody");
    if (!tbody) return window.bangKetQua || {};

    const grouped = {};

    Array.from(tbody.querySelectorAll("tr")).forEach((tr) => {
        const cells = tr.querySelectorAll("td");
        if (cells.length < 6) return;

        const masp = U(tr.dataset.masp || cells[0]?.innerText);
        if (!masp) return;

        const tensp = String(cells[1]?.innerText || "").trim();
        const dvt = String(cells[4]?.innerText || "sp").trim() || "sp";
        const gia = parseMoney(cells[5]?.innerText || "0");
        const km = cells.length > 6 ? parseMoney(cells[6]?.innerText || "0") : 0;

        let sizes = [];
        let counts = [];

        // Nguồn chuẩn của V5: dataset arrays.
        try {
            const dsSizes = JSON.parse(tr.dataset.sizes || "[]");
            const dsCounts = JSON.parse(tr.dataset.soluongs || "[]");

            if (Array.isArray(dsSizes) && Array.isArray(dsCounts)) {
                sizes = dsSizes.map(x => String(x ?? "").trim() || "0");
                counts = dsCounts.map(x => Number(x || 0));
            }
        } catch (_) {}

        // Fallback để tương thích dữ liệu DOM cũ:
        // cột size có thể là nhiều dòng "39/3\n40/2\n41/1".
        if (!sizes.length) {
            const visual = String(cells[2]?.innerText || "").trim();

            visual
                .split(/\n+/)
                .map(x => x.trim())
                .filter(Boolean)
                .forEach(token => {
                    const m = token.match(/^(.*)\/(\d+(?:\.\d+)?)$/);
                    if (!m) return;

                    const rawSize = String(m[1] || "").trim() || "0";
                    const sl = Number(m[2] || 0);
                    if (!sl) return;

                    sizes.push(rawSize);
                    counts.push(sl);
                });
        }

        if (!grouped[masp]) {
            grouped[masp] = {
                masp, tensp, dvt, gia, km,
                sizes: [], soluongs: []
            };
        }

        const g = grouped[masp];

        sizes.forEach((size, idx) => {
            const sl = Number(counts[idx] || 0);
            if (!sl) return;

            const pos = g.sizes.findIndex(x => String(x) === String(size));
            if (pos >= 0) {
                g.soluongs[pos] = Number(g.soluongs[pos] || 0) + sl;
            } else {
                g.sizes.push(String(size));
                g.soluongs.push(sl);
            }
        });
    });

    // Nếu DOM đang rỗng nhưng state hiện tại có dữ liệu,
    // không được vô tình xóa state.
    if (!Object.keys(grouped).length && window.bangKetQua && Object.keys(window.bangKetQua).length) {
        return normalizeGrouped(window.bangKetQua);
    }

    const normalized = normalizeGrouped(grouped);
    window.bangKetQua = normalized;
    updateSummary(normalized);
    return normalized;
}

function installHooks() {
    window.capNhatBangKetQuaTuDOM = rebuildFromDomGrouped;

    window.ccnAfterRenderAdapter = ({ bangKetQua } = {}) => {
        const grouped = normalizeGrouped(bangKetQua || window.bangKetQua || {});
        window.bangKetQua = grouped;
        renderGroupedTable(grouped);
    };

    window.getNhapHangGroupedBangKetQua = () => {
        const grouped = normalizeGrouped(window.bangKetQua || {});
        window.bangKetQua = grouped;
        return grouped;
    };

    window.renderNhapHangGroupedBangKetQua = (bang) => {
        const grouped = normalizeGrouped(bang || window.bangKetQua || {});
        window.bangKetQua = grouped;
        renderGroupedTable(grouped);
        return grouped;
    };

    window.getNhapTamBangKetQua = window.getNhapHangGroupedBangKetQua;

    // Tương thích các đoạn inline cũ trong nhapmoi.
    window.renderBangKetQua = window.renderNhapHangGroupedBangKetQua;
    window.capNhatBangHTML = window.renderNhapHangGroupedBangKetQua;
    window.capNhatTongTien = (bang) =>
        updateSummary(normalizeGrouped(bang || window.bangKetQua || {}));
    window.capNhatThongTinTong = window.capNhatTongTien;

    if (window.bangKetQua && Object.keys(window.bangKetQua).length) {
        const grouped = normalizeGrouped(window.bangKetQua);
        window.bangKetQua = grouped;
        renderGroupedTable(grouped);
    }
}

export function khoiTaoNhapHangGrouped({ coSo = "cs1", pageType = "nhaptam" } = {}) {
    if (!isNhapHangGroupedPage()) return;
    if (_initialized) return;

    _coSo = String(coSo || "cs1").toLowerCase();
    _pageType = String(pageType || "nhaptam").toLowerCase();
    _initialized = true;

    installHooks();

    console.log("[NHAP HANG GROUPED V5 - ONE MASP ONE ROW]", {
        coSo: _coSo,
        pageType: _pageType,
        path: location.pathname
    });
}

export function getNhapHangGroupedBangKetQua() {
    if (!_initialized) {
        khoiTaoNhapHangGrouped({
            coSo: String(localStorage.getItem("diadiem") || "cs1").toLowerCase(),
            pageType: String(location.pathname || "").toLowerCase().includes("nhapmoi")
                ? "nhapmoi"
                : "nhaptam"
        });
    }

    return window.getNhapHangGroupedBangKetQua
        ? window.getNhapHangGroupedBangKetQua()
        : normalizeGrouped(window.bangKetQua || {});
}

export function replaceSize0WithBreakdown(masp, breakdown, { requireExactTotal = true } = {}) {
    const bang = getNhapHangGroupedBangKetQua();
    const key = U(masp);
    const target = bang[key];

    if (!target) {
        return { ok: false, reason: "MASP_NOT_FOUND", masp: key };
    }

    const oldTotal = (target.soluongs || [])
        .reduce((s, q) => s + Number(q || 0), 0);

    const detailPairs = (breakdown || [])
        .map((x) => ({
            size: String(x?.size ?? "").trim() || "0",
            sl: Number(x?.soluong ?? x?.sl ?? 0)
        }))
        .filter((x) => x.size !== "0" && x.sl > 0);

    const newTotal = detailPairs.reduce((s, x) => s + x.sl, 0);

    if (requireExactTotal && oldTotal > 0 && newTotal !== oldTotal) {
        return {
            ok: false,
            reason: "TOTAL_MISMATCH",
            masp: key,
            oldTotal,
            newTotal
        };
    }

    const merged = new Map();
    detailPairs.forEach((x) => {
        merged.set(x.size, Number(merged.get(x.size) || 0) + x.sl);
    });

    const pairs = sortSizePairs(
        Array.from(merged.entries()).map(([size, sl]) => ({ size, sl }))
    );

    target.sizes = pairs.map((x) => x.size);
    target.soluongs = pairs.map((x) => x.sl);
    target.tong = newTotal;

    window.bangKetQua = bang;
    renderGroupedTable(bang);

    return {
        ok: true,
        masp: key,
        oldTotal,
        newTotal,
        sizeCount: pairs.length
    };
}
