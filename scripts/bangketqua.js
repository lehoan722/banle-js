// HOAN TUYET - bangketqua.js - LINE MODEL V2
// Mỗi lần thêm sản phẩm = một dòng độc lập.
// Không cộng dồn cùng MASP + SIZE.
// Vẫn giữ shape object + arrays 1 phần tử để tương thích toàn bộ module lưu hiện tại.

import { getMaspspDangChon, setMaspspDangChon } from './hoadon.js';
import { capNhatThongTinTong } from './utils.js';

function getVitriTheoKho(masp) {
    if (!masp) return "";
    const sp =
        (window.sanPhamData && (window.sanPhamData[masp] || window.sanPhamData[masp.toUpperCase()])) || null;

    const diadiem = (document.getElementById('diadiem')?.value ||
        localStorage.getItem('diadiem') || '').toLowerCase();

    if (!sp) return "";
    if (diadiem === 'cs1') return sp.vitrikho1 || "";
    if (diadiem === 'cs2') return sp.vitrikho2 || "";
    if (diadiem === 'cs3') return sp.vitrikho3 || "";
    return sp.vitrikho1 || sp.vitrikho2 || sp.vitrikho3 || "";
}

function isBanLeMainPage() {
    const p = String(window.location.pathname || "").toLowerCase();
    return p.includes("banlemtcs1") || p.includes("banlemtcs2");
}

function lineVal(item, key, i, fallback = null) {
    const arr = item?.[key];
    return Array.isArray(arr) && i < arr.length ? arr[i] : fallback;
}

function ensureLineCss() {
    if (document.getElementById("ht-line-model-v2-css")) return;
    const style = document.createElement("style");
    style.id = "ht-line-model-v2-css";
    style.textContent = `
      /* KM xả theo %: tím nhạt, áp dụng cả bannv + banlemt */
      #bangketqua tbody tr.clearance-row > td {
        background:#f3e8ff !important;
      }
      /* Dòng đang chọn: xanh nhạt để thao tác sửa/xóa */
      #bangketqua tbody tr.row-selected > td {
        background:#e6f3ff !important;
      }
    `;
    document.head.appendChild(style);
}

function makeFallbackKey(masp, idx = 0) {
    window.__HT_LINE_SEQ = Number(window.__HT_LINE_SEQ || 0) + 1;
    return `LN_DOM_${Date.now()}_${window.__HT_LINE_SEQ}_${String(masp || "").replace(/[^\w-]/g,"_")}_${idx}`;
}

export function capNhatBangHTML(bangKetQua, lastAdded = null) {
    ensureLineCss();

    const tbody = document.querySelector("#bangketqua tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const isNhap = window.location.pathname.includes("nhapmoi");
    const entryKeys = Object.keys(bangKetQua || {});

    let orderedKeys = [];
    if (Array.isArray(window.groupOrder) && window.groupOrder.length) {
        orderedKeys = window.groupOrder.filter(k => entryKeys.includes(k));
        orderedKeys.push(...entryKeys.filter(k => !orderedKeys.includes(k)));
    } else {
        orderedKeys = entryKeys.slice().reverse();
        window.groupOrder = orderedKeys.slice();
    }

    // Dòng vừa thêm luôn đứng trên cùng.
    if (lastAdded?.entryKey && entryKeys.includes(lastAdded.entryKey)) {
        orderedKeys = [
            lastAdded.entryKey,
            ...orderedKeys.filter(k => k !== lastAdded.entryKey)
        ];
        window.groupOrder = orderedKeys.slice();
    }

    orderedKeys.forEach(entryKey => {
        const item = bangKetQua[entryKey];
        if (!item) return;

        const sizes = Array.isArray(item.sizes) ? item.sizes.map(s => String(s).trim()) : [];
        const counts = Array.isArray(item.soluongs) ? item.soluongs.slice() : [];

        // Tương thích dữ liệu cũ có nhiều size trong một object.
        // Dữ liệu mới mỗi object chỉ có đúng 1 size.
        sizes.forEach((sz, i) => {
            const sl = Number(counts[i] || 0);
            if (!sl) return;

            let gia = Number(item.gia || 0);
            let kmDonVi = Number(lineVal(item, "kms", i, item.km || 0)) || 0;

            if (isNhap) {
                if (window.sanPhamData && window.sanPhamData[item.masp]) {
                    gia = Number(window.sanPhamData[item.masp].gianhap || 0);
                } else {
                    gia = 0;
                }
                kmDonVi = 0;
            }

            const kmTongDong = kmDonVi * sl;
            const thanhtien = (gia * sl) - kmTongDong;

            const kmPct = lineVal(item, "km_pcts", i, null);
            const kmMaxPct = lineVal(item, "km_max_pcts", i, null);
            const kmSource = lineVal(item, "km_sources", i, null);
            const manvBan = lineVal(item, "manv_bans", i, null);
            const tennvBan = lineVal(item, "tennv_bans", i, null);
            const tuVanCtId = lineVal(item, "tu_van_ct_ids", i, null);
            const tuVanSohd = lineVal(item, "tu_van_sohds", i, null);

            const lineKey =
                (Array.isArray(item.line_keys) && item.line_keys[i]) ||
                item.line_key ||
                `${entryKey}::${i}`;

            const tr = tbody.insertRow();
            const vitri = getVitriTheoKho(item.masp);
            const col9 = isBanLeMainPage() ? (tennvBan || manvBan || "") : vitri;

            tr.innerHTML = `
              <td>${item.masp || ""}</td>
              <td>${item.tensp || ""}</td>
              <td>${sz}</td>
              <td>${sl}</td>
              <td>${item.dvt || ""}</td>
              <td>${gia.toLocaleString("vi-VN")}</td>
              <td>${kmTongDong.toLocaleString("vi-VN")}</td>
              <td>${thanhtien.toLocaleString("vi-VN")}</td>
              <td>${col9}</td>
            `;

            tr.dataset.entryKey = entryKey;
            tr.dataset.lineKey = lineKey;
            tr.dataset.lineIndex = String(i);
            tr.dataset.km = String(kmDonVi || 0);
            tr.dataset.kmPct = kmPct == null ? "" : String(kmPct);
            tr.dataset.kmMaxPct = kmMaxPct == null ? "" : String(kmMaxPct);
            tr.dataset.kmSource = kmSource || "";
            tr.dataset.manvBan = manvBan || "";
            tr.dataset.tennvBan = tennvBan || "";
            tr.dataset.tuVanCtId = tuVanCtId == null ? "" : String(tuVanCtId);
            tr.dataset.tuVanSohd = tuVanSohd || "";

            // Chỉ dòng THỰC SỰ dùng % xả mới tô tím.
            const isClearance = Number(kmPct || 0) > 0;
            tr.dataset.clearance = isClearance ? "1" : "0";
            if (isClearance) tr.classList.add("clearance-row");

            tr.addEventListener("click", () => {
                setMaspspDangChon({
                    entryKey,
                    lineKey,
                    masp: item.masp,
                    size: sz,
                    index: i
                });
                highlightRow(tr);
            });

            if (lastAdded?.lineKey && String(lastAdded.lineKey) === String(lineKey)) {
                // Với KM xả ưu tiên màu tím; dòng thường vẫn dùng highlight vàng cũ.
                if (!isClearance) tr.classList.add("highlight");
            }
        });
    });

    capNhatThongTinTong(bangKetQua);

    if (typeof window.ccnAfterRenderAdapter === "function") {
        try {
            window.ccnAfterRenderAdapter({ bangKetQua, lastAdded });
        } catch (err) {
            console.error("Lỗi trong ccnAfterRenderAdapter:", err);
        }
    }
}

function highlightRow(selectedRow) {
    document.querySelectorAll("#bangketqua tbody tr").forEach(row => {
        row.classList.toggle("row-selected", row === selectedRow);
    });
}

export function resetFormBang() {
    const maspInput = document.getElementById("masp");
    const soluongInput = document.getElementById("soluong");
    const sizeInput = document.getElementById("size");

    window.masp_last = maspInput?.value || window.masp_last || "";

    if (maspInput) maspInput.value = "";
    if (soluongInput) soluongInput.value = "1";
    if (sizeInput) sizeInput.value = "";

    if (window.hienThiAnhSanPhamTuMasp) window.hienThiAnhSanPhamTuMasp();

    maspInput?.blur();
    setTimeout(() => maspInput?.focus(), 50);
}

export function resetFormSauKhiNhapSize() {
    const maspInput = document.getElementById("masp");
    const soluongInput = document.getElementById("soluong");
    const sizeInput = document.getElementById("size");

    window.masp_last = maspInput?.value || window.masp_last || "";

    if (soluongInput) soluongInput.value = "1";
    if (sizeInput) sizeInput.value = "";

    if (window.hienThiAnhSanPhamTuMasp) window.hienThiAnhSanPhamTuMasp();

    sizeInput?.focus();
    sizeInput?.select();
}

export function capNhatBangKetQuaTuDOM() {
    const tbody = document.querySelector("#bangketqua tbody");
    if (!tbody) return;

    const bang = {};
    const order = [];

    Array.from(tbody.rows).forEach((row, rowIdx) => {
        const masp = (row.cells[0]?.innerText || "").trim().toUpperCase();
        const tensp = (row.cells[1]?.innerText || "").trim();
        const sizeText = (row.cells[2]?.innerText || "").trim() || "0";
        const sl = Number(String(row.cells[3]?.innerText || "0").replace(/[^\d.-]/g, "")) || 0;
        const gia = Number(String(row.cells[5]?.innerText || "0").replace(/[^\d.-]/g, "")) || 0;
        const kmHienThi = Number(String(row.cells[6]?.innerText || "0").replace(/[^\d.-]/g, "")) || 0;
        const km = sl > 0 ? Math.round(kmHienThi / sl) : 0;

        if (!masp || !sl) return;

        let dvt = (row.cells[4]?.innerText || "").trim();
        if (!dvt && window.sanPhamData?.[masp]) {
            dvt = window.sanPhamData[masp].dvt || "";
        }

        const kmPct = row.dataset.kmPct === "" || row.dataset.kmPct == null
            ? null : Number(row.dataset.kmPct);
        const kmMaxPct = row.dataset.kmMaxPct === "" || row.dataset.kmMaxPct == null
            ? null : Number(row.dataset.kmMaxPct);

        let entryKey = String(row.dataset.entryKey || "").trim();
        if (!entryKey || bang[entryKey]) {
            entryKey = makeFallbackKey(masp, rowIdx);
        }

        const lineKey = String(row.dataset.lineKey || entryKey).trim() || entryKey;

        bang[entryKey] = {
            line_key: lineKey,
            line_keys: [lineKey],
            masp,
            tensp,
            sizes: [sizeText],
            soluongs: [sl],
            kms: [Number(row.dataset.km || km || 0) || 0],
            km_pcts: [kmPct],
            km_max_pcts: [kmMaxPct],
            km_sources: [row.dataset.kmSource || null],
            manv_bans: [row.dataset.manvBan || null],
            tennv_bans: [row.dataset.tennvBan || null],
            tu_van_ct_ids: [row.dataset.tuVanCtId ? Number(row.dataset.tuVanCtId) : null],
            tu_van_sohds: [row.dataset.tuVanSohd || null],
            tong: sl,
            gia,
            km: Number(row.dataset.km || km || 0) || 0,
            dvt
        };

        order.push(entryKey);
    });

    window.bangKetQua = bang;
    window.groupOrder = order;
}

window.capNhatBangKetQuaTuDOM = capNhatBangKetQuaTuDOM;
