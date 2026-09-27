// HOAN TUYET - nhaptam.js V3
// Module RIÊNG cho nhaptamcs1.html / nhaptamcs2.html
//
// Mục tiêu:
// - Không sửa hoadon.js / bangketqua.js / main.js dùng chung.
// - Trang bán tiếp tục LINE MODEL.
// - Trang nhập tạm dùng LEGACY GROUPED MODEL theo MASP:
//      bangKetQua[MASP] = { masp, sizes:[], soluongs:[], ... }
// - Hiển thị kiểu cũ: mỗi size một dòng, cột Kích cỡ = "SIZE/SL".
// - Tuyệt đối không biến chuỗi hiển thị "39/2" thành size thật.
//   Mỗi dòng render có data-size chứa size gốc.

let _initialized = false;
let _rendering = false;
let _coSo = "cs1";

const U = (v) => String(v ?? "").trim().toUpperCase();

function isNhapTamPage() {
    const p = String(location.pathname || "").toLowerCase();
    return p.includes("nhaptamcs1") || p.includes("nhaptamcs2");
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
        const na = Number(a.size);
        const nb = Number(b.size);
        const aNum = Number.isFinite(na);
        const bNum = Number.isFinite(nb);

        if (aNum && bNum) return na - nb;
        if (aNum) return -1;
        if (bNum) return 1;
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

/**
 * Quy mọi shape hiện tại về đúng grouped model nhập tạm.
 * Chấp nhận cả:
 * - legacy grouped: key = MASP, sizes nhiều phần tử
 * - line model mới: key = LN_..., mỗi item 1 size
 */
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
    let mathang = 0;
    let tongsl = 0;
    let tongkm = 0;
    let phaitra = 0;

    Object.values(grouped || {}).forEach((item) => {
        const gia = Number(item.gia || 0);
        const km = Number(item.km || 0);

        (item.sizes || []).forEach((_, idx) => {
            const sl = Number(item.soluongs?.[idx] || 0);
            if (!sl) return;

            mathang += 1;
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

/**
 * Render ĐÚNG kiểu cũ của nhập tạm:
 * mỗi size = một dòng.
 * Visual Kích cỡ = "39/2" nhưng raw size nằm ở tr.dataset.size = "39".
 */
function renderLegacyTable(rawBang) {
    if (!isNhapTamPage()) return;

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

            (item.sizes || []).forEach((rawSize, idx) => {
                const size = String(rawSize ?? "").trim() || "0";
                const sl = Number(item.soluongs?.[idx] || 0);
                if (!sl) return;

                const thanhTien = (gia - km) * sl;

                const tr = document.createElement("tr");
                tr.dataset.masp = item.masp;
                tr.dataset.size = size;
                tr.dataset.soluong = String(sl);

                tr.innerHTML = `
                    <td>${item.masp}</td>
                    <td>${item.tensp || ""}</td>
                    <td>${size}/${sl}</td>
                    <td>${sl}</td>
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
        });
    } finally {
        _rendering = false;
    }

    updateSummary(grouped);
}

/**
 * Parser RIÊNG của nhập tạm.
 * Không dùng parser line-model mới.
 *
 * Ưu tiên raw size từ tr.dataset.size.
 * Nếu là dòng copy/paste không có dataset:
 * - visual "39/2" + SL=2 => raw size "39"
 * - visual "39" => raw size "39"
 */
function rebuildFromDomLegacy() {
    if (_rendering) {
        return window.bangKetQua || {};
    }

    const tbody = document.querySelector("#bangketqua tbody");
    if (!tbody) return window.bangKetQua || {};

    const grouped = {};

    Array.from(tbody.querySelectorAll("tr")).forEach((tr) => {
        const cells = tr.querySelectorAll("td");
        if (cells.length < 6) return;

        const masp = U(cells[0]?.innerText);
        if (!masp) return;

        const tensp = String(cells[1]?.innerText || "").trim();

        const sl = Number(
            String(cells[3]?.innerText || tr.dataset.soluong || "0")
                .replace(/[^\d.-]/g, "")
        ) || 0;

        if (!sl) return;

        let size = String(tr.dataset.size || "").trim();

        if (!size) {
            const visual = String(cells[2]?.innerText || "0").trim();

            // Nếu visual là "39/2" và SL=2 thì bỏ phần "/2".
            const m = visual.match(/^(.*)\/(\d+(?:\.\d+)?)$/);
            if (m && Number(m[2]) === sl) {
                size = String(m[1] || "").trim();
            } else {
                size = visual;
            }
        }

        if (!size) size = "0";

        const dvt = String(cells[4]?.innerText || "sp").trim() || "sp";
        const gia = parseMoney(cells[5]?.innerText || "0");
        const km = cells.length > 6 ? parseMoney(cells[6]?.innerText || "0") : 0;

        if (!grouped[masp]) {
            grouped[masp] = {
                masp,
                tensp,
                dvt,
                gia,
                km,
                sizes: [],
                soluongs: []
            };
        }

        const g = grouped[masp];
        const pos = g.sizes.findIndex((x) => String(x) === size);

        if (pos >= 0) {
            g.soluongs[pos] = Number(g.soluongs[pos] || 0) + sl;
        } else {
            g.sizes.push(size);
            g.soluongs.push(sl);
        }
    });

    const normalized = normalizeGrouped(grouped);
    window.bangKetQua = normalized;
    updateSummary(normalized);

    return normalized;
}

function installHooks() {
    // 1) Mọi code cũ gọi hàm này sẽ dùng parser riêng của nhập tạm.
    window.capNhatBangKetQuaTuDOM = rebuildFromDomLegacy;

    // 2) Sau khi bangketqua.js mới render line-model,
    // lập tức gom state lại + render về giao diện cũ của nhập tạm.
    window.ccnAfterRenderAdapter = ({ bangKetQua } = {}) => {
        const grouped = normalizeGrouped(bangKetQua || window.bangKetQua || {});
        window.bangKetQua = grouped;
        renderLegacyTable(grouped);
    };

    // API rõ ràng để nhaptamAutoSync / popup ngang / save dùng.
    window.getNhapTamBangKetQua = () => {
        const grouped = normalizeGrouped(window.bangKetQua || {});
        window.bangKetQua = grouped;
        return grouped;
    };

    window.renderNhapTamBangKetQua = (bang) => {
        const grouped = normalizeGrouped(bang || window.bangKetQua || {});
        window.bangKetQua = grouped;
        renderLegacyTable(grouped);
        return grouped;
    };

    // Nếu có dữ liệu đã được nạp trước khi module init (hash/import/xem HĐ)
    // thì chuẩn hóa và vẽ lại ngay.
    if (window.bangKetQua && Object.keys(window.bangKetQua).length) {
        const grouped = normalizeGrouped(window.bangKetQua);
        window.bangKetQua = grouped;
        renderLegacyTable(grouped);
    }
}

export function khoiTaoNhapTam({ coSo = "cs1" } = {}) {
    if (!isNhapTamPage()) return;
    if (_initialized) return;

    _coSo = String(coSo || "cs1").toLowerCase();
    _initialized = true;

    installHooks();

    console.log("[NHAPTAM V3] Đã tách khỏi line-model dùng chung:", {
        coSo: _coSo,
        path: location.pathname
    });
}

export function getNhapTamBangKetQua() {
    if (!_initialized) {
        khoiTaoNhapTam({
            coSo: String(localStorage.getItem("diadiem") || "cs1").toLowerCase()
        });
    }
    return window.getNhapTamBangKetQua
        ? window.getNhapTamBangKetQua()
        : normalizeGrouped(window.bangKetQua || {});
}
