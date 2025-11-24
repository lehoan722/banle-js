// quanlynhanvien.js
// Hiển thị trạng thái nhân viên hiện tại + tổng quan nhân lực theo giờ (từ đăng ký ca đã duyệt)

import { supabase } from "./supabaseClient.js";

// --- DOM elements: trạng thái hiện tại ---
const tbodyStatus = document.getElementById("tbody-status");
const diadiemSelect = document.getElementById("filter-diadiem");
const statusMsg = document.getElementById("status-msg");
const refreshBtn = document.getElementById("btn-refresh");

// --- DOM elements: tổng quan theo giờ ---
const summaryDateInput = document.getElementById("summary-date");
const tbodySummary = document.getElementById("tbody-summary");
const summaryMsg = document.getElementById("summary-msg");
const summaryBtn = document.getElementById("btn-load-summary");

let autoTimer = null;
const AUTO_REFRESH_MS = 60000; // 60 giây

// ========== PHẦN 1: TRẠNG THÁI NHÂN VIÊN HIỆN TẠI ==========

function trangThaiLabel(code) {
    switch (code) {
        case "DANG_LAM": return "Đang làm";
        case "NGHI_TRUA": return "Nghỉ trưa";
        case "NGHI_CHIEU": return "Nghỉ chiều";
        case "DA_TAN_CA": return "Đã tan ca";
        case "SAP_VAO_CA": return "Sắp vào ca";
        case "CHUA_VAO_CA": return "Chưa vào ca";
        default: return "Khác";
    }
}

function suKienLabel(code) {
    const map = {
        VAOCA: "Vào ca",
        NTR: "Nghỉ trưa",
        NTRD: "Trưa đến",
        NCH: "Nghỉ chiều",
        NCHD: "Chiều đến",
        TANCA: "Tan ca",
        AUTO_TANCA: "Tự tan ca"
    };
    return map[code] || (code || "");
}

function formatTimeVN(value) {
    if (!value) return "";
    // nếu là ISO string
    if (typeof value === "string" && value.includes("T")) {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return "";
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        const ss = String(d.getSeconds()).padStart(2, "0");
        return `${hh}:${mm}:${ss}`;
    }
    // nếu là "HH:MM" hoặc "HH:MM:SS"
    if (typeof value === "string") {
        const parts = value.split(":");
        if (parts.length >= 2) {
            const hh = parts[0].padStart(2, "0");
            const mm = parts[1].padStart(2, "0");
            const ss = parts[2] ? parts[2].padStart(2, "0") : "00";
            return `${hh}:${mm}:${ss}`;
        }
    }
    return "";
}

function formatMinutes(m) {
    if (m == null || Number.isNaN(Number(m))) return "";
    const val = Number(m);
    if (val < 60) return `${Math.round(val)}p`;
    const hours = Math.floor(val / 60);
    const mins = Math.round(val % 60);
    if (mins === 0) return `${hours}g`;
    return `${hours}g${mins}p`;
}

function setStatusMessage(text) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    statusMsg.textContent = text ? `${text} (Lần cuối: ${hh}:${mm})` : "";
}

async function loadStatus() {
    const diadiem = diadiemSelect.value || null;

    setStatusMessage("Đang tải dữ liệu...");

    const nowIso = new Date().toISOString();

    const { data, error } = await supabase.rpc("nhanvien_status_now", {
        p_time: nowIso,
        p_diadiem: diadiem
    });

    if (error) {
        console.error("Lỗi gọi nhanvien_status_now:", error);
        tbodyStatus.innerHTML = `<tr><td colspan="8" style="color:red;">Lỗi tải dữ liệu, xem console để biết chi tiết.</td></tr>`;
        setStatusMessage("Lỗi tải dữ liệu.");
        return;
    }

    const rows = (data || []);
    if (rows.length === 0) {
        tbodyStatus.innerHTML = `<tr><td colspan="8">Không có dữ liệu chấm công hôm nay.</td></tr>`;
        setStatusMessage("Đã tải xong (không có dữ liệu hôm nay).");
        return;
    }

    tbodyStatus.innerHTML = "";
    rows.forEach((r, idx) => {
        const tr = document.createElement("tr");

        const tdIndex = document.createElement("td");
        tdIndex.textContent = String(idx + 1);
        tr.appendChild(tdIndex);

        const tdManv = document.createElement("td");
        tdManv.textContent = r.manv || "";
        tr.appendChild(tdManv);

        const tdTennv = document.createElement("td");
        tdTennv.textContent = r.tennv || "";
        tr.appendChild(tdTennv);

        const tdDia = document.createElement("td");
        tdDia.textContent = r.diadiem || "";
        tr.appendChild(tdDia);

        const tdTrangThai = document.createElement("td");
        const span = document.createElement("span");
        span.className = `status-badge status-${r.trang_thai || "KHAC"}`;
        span.textContent = trangThaiLabel(r.trang_thai);
        tdTrangThai.appendChild(span);
        tr.appendChild(tdTrangThai);

        const tdSuKien = document.createElement("td");
        tdSuKien.textContent = suKienLabel(r.su_kien_cuoi);
        tr.appendChild(tdSuKien);

        const tdGio = document.createElement("td");
        tdGio.textContent = formatTimeVN(r.gio_cuoi_vn || r.gio_cuoi);
        tr.appendChild(tdGio);

        const tdPhut = document.createElement("td");
        tdPhut.textContent = formatMinutes(r.phut_tu_su_kien_cuoi);
        tr.appendChild(tdPhut);

        tbodyStatus.appendChild(tr);
    });

    setStatusMessage(`Đã tải xong (${rows.length} nhân viên).`);
}

function startAutoRefresh() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = setInterval(loadStatus, AUTO_REFRESH_MS);
}

// ========== PHẦN 2: TỔNG QUAN NHÂN LỰC THEO GIỜ ==========

function setSummaryMessage(text) {
    summaryMsg.textContent = text || "";
}

function parseTimeToMinutes(t) {
    if (!t) return null;
    if (typeof t === "string") {
        const parts = t.split(":");
        if (parts.length >= 2) {
            const h = Number(parts[0]);
            const m = Number(parts[1]);
            if (Number.isNaN(h) || Number.isNaN(m)) return null;
            return h * 60 + m;
        }
    }
    return null;
}

// chuyển phút -> "HH:MM" (07:30, 08:00, 08:30,...)
function minutesToHourLabel(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    return `${hh}:${mm}`;
}

// tạo các slot 30 phút từ 07:30 -> 22:00
// tạo các slot 30 phút từ 07:30 -> 22:00
function buildSlotsFromRows(rows) {
    const SLOT_START = 7 * 60 + 30; // 07:30
    const SLOT_END = 22 * 60;       // 22:00

    // Chuẩn hóa intervals từ từng dòng đăng ký ca
    const intervals = (rows || []).map(r => {
        const startM = parseTimeToMinutes(r.gio_bat_dau);
        const endM = parseTimeToMinutes(r.gio_ket_thuc);
        const ten = r.tennv || r.manv || "";

        // D = đã duyệt, C = chờ duyệt, T = từ chối / huỷ / trạng thái khác
        let suffix = "T";
        if (r.trang_thai === "DA_DUYET") suffix = "D";
        else if (r.trang_thai === "CHO_DUYET") suffix = "C";

        const label = ten ? `${ten}(${suffix})` : "";

        return {
            diadiem: r.diadiem,
            manv: r.manv,
            startM,
            endM,
            label
        };
    });

    // Tạo danh sách slot 30 phút
    const slots = [];
    for (let m = SLOT_START; m < SLOT_END; m += 30) {
        slots.push({
            startM: m,
            endM: m + 30,
            label: minutesToHourLabel(m),
            cs1: [], // mỗi phần tử: { manv, label }
            cs2: []
        });
    }

    // Phân bổ nhân viên vào từng slot
    for (const itv of intervals) {
        if (itv.startM == null || itv.endM == null || !itv.label) continue;

        for (const s of slots) {
            // nếu ca có giao với slot
            if (itv.startM < s.endM && itv.endM > s.startM) {
                if (itv.diadiem === "cs1") {
                    // mỗi nhân viên chỉ xuất hiện 1 lần/slot
                    if (!s.cs1.some(x => x.manv === itv.manv)) {
                        s.cs1.push({ manv: itv.manv, label: itv.label });
                    }
                } else if (itv.diadiem === "cs2") {
                    if (!s.cs2.some(x => x.manv === itv.manv)) {
                        s.cs2.push({ manv: itv.manv, label: itv.label });
                    }
                }
            }
        }
    }

    // Chuyển thành chuỗi hiển thị: "n, ten1(D), ten2(C)..."
    slots.forEach(s => {
        const list1 = s.cs1.map(x => x.label);
        const list2 = s.cs2.map(x => x.label);

        s.cs1Text = list1.length > 0 ? `${list1.length}, ${list1.join(", ")}` : "";
        s.cs2Text = list2.length > 0 ? `${list2.length}, ${list2.join(", ")}` : "";
    });

    return slots;
}

async function loadSummary() {
    // Ngày chọn, mặc định hôm nay
    let ngay = summaryDateInput.value;
    if (!ngay) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        ngay = `${yyyy}-${mm}-${dd}`;
        summaryDateInput.value = ngay;
    }

    setSummaryMessage("Đang tải tổng quan nhân lực...");

    const { data, error } = await supabase
        .from("lichlam_dangky_v") // DÙNG VIEW MỚI
        .select("diadiem, manv, tennv, gio_bat_dau, gio_ket_thuc, trang_thai, ngay")
        .eq("ngay", ngay);


    if (error) {
        console.error("Lỗi đọc lichlam_dangky:", error);
        tbodySummary.innerHTML = `<tr><td colspan="3" style="color:red;">Lỗi tải dữ liệu, xem console.</td></tr>`;
        setSummaryMessage("Lỗi tải tổng quan.");
        return;
    }

    const rows = data || [];
    if (rows.length === 0) {
        tbodySummary.innerHTML = `<tr><td colspan="3">Không có đăng ký ca trong ngày ${ngay}.</td></tr>`;
        setSummaryMessage("Không có dữ liệu.");
        return;
    }

    const slots = buildSlotsFromRows(rows);
    if (slots.length === 0) {
        tbodySummary.innerHTML = `<tr><td colspan="3">Không tạo được khung giờ hiển thị.</td></tr>`;
        setSummaryMessage("Không có dữ liệu phù hợp.");
        return;
    }

    tbodySummary.innerHTML = "";
    slots.forEach(s => {
        const tr = document.createElement("tr");

        const tdTime = document.createElement("td");
        tdTime.textContent = s.label;
        tr.appendChild(tdTime);

        const tdCS1 = document.createElement("td");
        tdCS1.textContent = s.cs1Text || "";
        tr.appendChild(tdCS1);

        const tdCS2 = document.createElement("td");
        tdCS2.textContent = s.cs2Text || "";
        tr.appendChild(tdCS2);
    });

    setSummaryMessage(`Đã tải tổng quan cho ngày ${ngay}.`);
}

// ========== KHỞI TẠO ==========

document.addEventListener("DOMContentLoaded", () => {
    // trạng thái hiện tại
    loadStatus();
    startAutoRefresh();

    refreshBtn.addEventListener("click", () => {
        loadStatus();
    });

    diadiemSelect.addEventListener("change", () => {
        loadStatus();
    });

    // tổng quan theo giờ
    if (summaryBtn) {
        summaryBtn.addEventListener("click", () => {
            loadSummary();
        });
    }

    // set mặc định ngày hôm nay cho summary
    if (summaryDateInput) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        summaryDateInput.value = `${yyyy}-${mm}-${dd}`;
    }

    loadSummary();
});
