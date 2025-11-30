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
        NTRD: "Nghỉ Trưa đến",
        NCH: "Nghỉ chiều",
        NCHD: "Nghỉ Chiều đến",
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
// Xây timeline linh hoạt từ đăng ký ca + giờ làm thực tế
// - Mỗi nhân viên -> 1 hoặc nhiều khoảng [start, end) theo phút trong ngày
// - Ghép thêm giờ vào/ra thực tế (chamcong_log) để mở rộng khoảng
// - Trả về các mốc thời gian mà danh sách nhân viên CS1/CS2 thay đổi
function buildTimelineFromRows(scheduleRows, logRows) {
    const rows = scheduleRows || [];
    const logs = logRows || [];

    if (rows.length === 0 && logs.length === 0) return [];

    // Gom log theo (manv, diadiem) lấy mốc đến / về
    const logMap = new Map();
    const startEvents = new Set(["VAOCA", "NTRD", "NCHD"]);
    const endEvents = new Set(["TANCA", "AUTO_TANCA"]);

    for (const log of logs) {
        if (!log.manv || !log.diadiem || !log.su_kien || !log.created_at) continue;

        const d = new Date(log.created_at); // giả định local time = VN
        const mins = d.getHours() * 60 + d.getMinutes();
        const key = `${log.manv}|${log.diadiem}`;

        let info = logMap.get(key);
        if (!info) {
            info = {
                manv: log.manv,
                diadiem: log.diadiem,
                firstPresenceMin: null,
                lastPresenceMin: null
            };
            logMap.set(key, info);
        }

        if (startEvents.has(log.su_kien)) {
            if (info.firstPresenceMin == null || mins < info.firstPresenceMin) {
                info.firstPresenceMin = mins;
            }
        }

        if (endEvents.has(log.su_kien)) {
            if (info.lastPresenceMin == null || mins > info.lastPresenceMin) {
                info.lastPresenceMin = mins;
            }
        }
    }

    const intervals = [];
    const scheduleKeySet = new Set();

    // Tạo interval từ đăng ký ca, điều chỉnh theo giờ thực tế nếu có
    for (const r of rows) {
        let startM = parseTimeToMinutes(r.gio_bat_dau);
        let endM = parseTimeToMinutes(r.gio_ket_thuc);
        if (startM == null || endM == null || endM <= startM) continue;

        const key = `${r.manv}|${r.diadiem}`;
        scheduleKeySet.add(key);

        const info = logMap.get(key);
        if (info) {
            // Nếu vào sớm hơn đăng ký -> lấy giờ vào thực tế
            if (info.firstPresenceMin != null && info.firstPresenceMin < startM) {
                startM = info.firstPresenceMin;
            }
            // Nếu tan muộn hơn đăng ký -> kéo mốc cuối ra
            if (info.lastPresenceMin != null && info.lastPresenceMin > endM) {
                endM = info.lastPresenceMin;
            }
        }

        if (endM <= startM) continue;

        const ten = r.tennv || r.manv || "";
        let suffix = "T"; // T = trạng thái khác
        if (r.trang_thai === "DA_DUYET") suffix = "D";
        else if (r.trang_thai === "CHO_DUYET") suffix = "C";

        const label = ten ? `${ten}(${suffix})` : "";

        intervals.push({
            diadiem: r.diadiem,
            manv: r.manv,
            startM,
            endM,
            label
        });
    }

    // Thêm các interval chỉ có chấm công mà không có đăng ký ca
    for (const info of logMap.values()) {
        const key = `${info.manv}|${info.diadiem}`;
        if (scheduleKeySet.has(key)) continue;

        if (
            info.firstPresenceMin == null ||
            info.lastPresenceMin == null ||
            info.lastPresenceMin <= info.firstPresenceMin
        ) {
            continue;
        }

        // TT = Thực Tế (không có lịch)
        const label = `${info.manv}(TT)`;

        intervals.push({
            diadiem: info.diadiem,
            manv: info.manv,
            startM: info.firstPresenceMin,
            endM: info.lastPresenceMin,
            label
        });
    }

    if (intervals.length === 0) return [];

    // Tập tất cả mốc thời gian xuất hiện trong dữ liệu (linh hoạt, không cố định 30 phút)
    const timeSet = new Set();
    for (const itv of intervals) {
        timeSet.add(itv.startM);
        timeSet.add(itv.endM);
    }

    const times = Array.from(timeSet).sort((a, b) => a - b);

    // Tính danh sách nhân viên tại từng mốc thời gian
    const steps = [];
    for (const t of times) {
        const cs1 = [];
        const cs2 = [];

        for (const itv of intervals) {
            // Nhân viên được tính là đang làm nếu start <= t < end
            if (itv.startM <= t && t < itv.endM) {
                const dest = itv.diadiem === "cs2" ? cs2 : cs1;
                if (!dest.some(x => x.manv === itv.manv)) {
                    dest.push({ manv: itv.manv, label: itv.label });
                }
            }
        }

        steps.push({
            timeM: t,
            label: minutesToHourLabel(t),
            cs1,
            cs2
        });
    }

    // Nén lại: chỉ giữ những mốc mà danh sách nhân viên thay đổi
    const result = [];
    let prevKey = null;

    for (const step of steps) {
        const cs1Ids = step.cs1.map(x => x.manv).sort().join(",");
        const cs2Ids = step.cs2.map(x => x.manv).sort().join(",");
        const key = `${cs1Ids}|${cs2Ids}`;

        if (prevKey !== null && key === prevKey) {
            // Không có thay đổi so với mốc trước -> bỏ qua
            continue;
        }
        prevKey = key;

        const cs1Text =
            step.cs1.length > 0
                ? `${step.cs1.length}, ${step.cs1.map(x => x.label).join(", ")}`
                : "";
        const cs2Text =
            step.cs2.length > 0
                ? `${step.cs2.length}, ${step.cs2.map(x => x.label).join(", ")}`
                : "";

        result.push({
            label: step.label,
            cs1Text,
            cs2Text
        });
    }

    return result;
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

    // Đọc thêm log chấm công trong ngày để lấy giờ làm thực tế
    const from = `${ngay}T00:00:00+07:00`;
    const to = `${ngay}T23:59:59.999+07:00`;

    let logRows = [];
    try {
        const { data: logs, error: logError } = await supabase
            .from("chamcong_log")
            .select("manv, diadiem, su_kien, created_at")
            .gte("created_at", from)
            .lte("created_at", to);

        if (logError) {
            console.error("Lỗi đọc chamcong_log cho summary:", logError);
        } else {
            logRows = logs || [];
        }
    } catch (e) {
        console.error("Lỗi không mong muốn khi đọc chamcong_log cho summary:", e);
    }

    // Xây timeline linh hoạt từ đăng ký + giờ thực tế
    const slots = buildTimelineFromRows(rows, logRows);
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

        tbodySummary.appendChild(tr);
    });

    setSummaryMessage(`Đã tải ${slots.length} mốc thời gian.`);


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
