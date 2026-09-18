// quanlynhanvien.js
// Hiển thị trạng thái nhân viên hiện tại + tổng quan nhân lực theo giờ (từ đăng ký ca đã duyệt)

import { supabase } from "./supabaseClient.js";
import { initNhansuSummary } from "./nhansu_summary.js";

// --- DOM elements: trạng thái hiện tại --- 
const tbodyStatus = document.getElementById("tbody-status");
const diadiemSelect = document.getElementById("filter-diadiem");
const statusMsg = document.getElementById("status-msg");
const refreshBtn = document.getElementById("btn-refresh");

// --- DOM elements: tổng quan theo giờ ---
const summaryDateInput = document.getElementById("summary-date");
const summaryTimelineEl = document.getElementById("summary-timeline");
const summaryMsg = document.getElementById("summary-msg");
const summaryBtn = document.getElementById("btn-load-summary");

// --- DOM elements: bảng công tháng ---
const hotBangCongContainer = document.getElementById("hotBangCong");
const bangCongMsg = document.getElementById("bangcong-msg");
let hotBangCong = null;

let autoTimer = null;
const AUTO_REFRESH_MS = 60000; // 60 giây

// ========== PHẦN 1: TRẠNG THÁI NHÂN VIÊN HIỆN TẠI ==========

function trangThaiLabel(code) {
    switch (code) {
        case "DANG_LAM": return "Đang làm";
        case "NGHI_TRUA": return "Nghỉ trưa";
        case "NGHI_CHIEU": return "Nghỉ chiều";
        case "DA_TAN_CA": return "Đã tan ca";
        case "KHONG_CHAM_TAN_CA": return "Không chấm tan ca";
        case "SAP_VAO_CA": return "Sắp vào ca";
        case "CHUA_VAO_CA": return "Chưa vào ca";
        case "KHONG_DI_LAM": return "Không đi làm";
        case "KHONG_CO_LICH": return "Không có lịch";
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
        AUTO_TANCA: "Tự tan ca",
        TANCA_LICH: "Tan ca (theo lịch dang ky cong)"

    };
    return map[code] || (code || "");
}

function buildTimelineText(eventsToday) {
    if (!eventsToday) return "";

    // Supabase thường trả về object/array, nhưng phòng khi bị stringify
    let arr = eventsToday;
    if (typeof arr === "string") {
        try { arr = JSON.parse(arr); } catch { return ""; }
    }
    if (!Array.isArray(arr) || arr.length === 0) return "";

    // "Vào ca, 07:30:00, Nghỉ trưa, 12:00:00, ..."
    return arr
        .map(it => {
            const ev = it?.su_kien;
            const t = it?.gio_vn;
            const evLabel = suKienLabel(ev);
            const time = (t && typeof t === "string") ? t : "";
            if (!evLabel && !time) return "";
            if (!time) return `${evLabel}`;
            if (!evLabel) return `${time}`;
            return `${evLabel}, ${time}`;
        })
        .filter(Boolean)
        .join(", ");
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

function formatTimeHM(value) {
    // trả về HH:MM (dùng cho giờ đăng ký / giờ kết thúc)
    const full = formatTimeVN(value);
    if (!full) return "";
    return full.slice(0, 5);
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

    const { data, error } = await supabase.rpc("nhanvien_status_day_now", {
        p_diadiem: diadiem
    });
    if (error) {
        console.error("Lỗi gọi nhanvien_status_now:", error);
        tbodyStatus.innerHTML = `<tr><td colspan="7" style="color:red;">Lỗi tải dữ liệu, xem console để biết chi tiết.</td></tr>`;
        setStatusMessage("Lỗi tải dữ liệu.");
        return;
    }

    const rows = (data || []);
    if (rows.length === 0) {
        tbodyStatus.innerHTML = `<tr><td colspan="7">Không có dữ liệu chấm công hôm nay.</td></tr>`;
        setStatusMessage("Đã tải xong (không có dữ liệu hôm nay).");
        return;
    }

    // ✅ SORT: ưu tiên theo cơ sở (CS1 trước CS2), trong cơ sở sort theo giờ đăng ký tăng dần
    const baseDiaRank = (d) => {
        const x = String(d || "").toLowerCase();
        if (x === "cs1") return 1;
        if (x === "cs2") return 2;
        return 99; // cơ sở lạ đưa xuống cuối
    };

    // Nếu sau này bạn cho phép "Tất cả" nhưng vẫn muốn ưu tiên cơ sở đang chọn,
    // ta lấy diadiemSelect làm ưu tiên 0 (không ảnh hưởng nếu backend đã lọc theo p_diadiem)
    const selectedDia = String(diadiemSelect.value || "").toLowerCase();
    const diaRank = (d) => {
        const x = String(d || "").toLowerCase();
        if (selectedDia && x === selectedDia) return 0;
        return baseDiaRank(x);
    };

    const timeToMin = (t) => {
        if (!t) return 999999;
        const s = String(t);
        const parts = s.split(":");
        const h = Number(parts[0]);
        const m = Number(parts[1] || 0);
        if (Number.isNaN(h) || Number.isNaN(m)) return 999999;
        return h * 60 + m;
    };

    rows.sort((a, b) => {
        // 1) ưu tiên cơ sở
        const ra = diaRank(a.diadiem);
        const rb = diaRank(b.diadiem);
        if (ra !== rb) return ra - rb;

        // 2) trong cơ sở: ưu tiên theo giờ đăng ký bắt đầu tăng dần
        const ta = timeToMin(a.gio_dangky_bat_dau);
        const tb = timeToMin(b.gio_dangky_bat_dau);
        if (ta !== tb) return ta - tb;

        // 3) phụ: nếu trùng giờ bắt đầu thì sort theo mã NV cho ổn định
        return String(a.manv || "").localeCompare(String(b.manv || ""), "vi");
    });


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

        // Cột gộp: Trạng thái, Sự kiện cuối, Giờ(VN)
        const tdGop = document.createElement("td");
        const span = document.createElement("span");
        span.className = `status-badge status-${r.trang_thai || "KHAC"}`;

        const tt = trangThaiLabel(r.trang_thai);

        // ✅ NEW: timeline sự kiện trong ca
        const timeline = buildTimelineText(r.events_today);

        // fallback cũ (nếu vì lý do nào đó chưa có events_today)
        const sk = suKienLabel(r.su_kien_cuoi);
        const gio = formatTimeVN(r.gio_cuoi_vn || r.gio_cuoi);

        let text = "";
        if (timeline) {
            // ✅ yêu cầu mới: Trạng thái + tất cả sự kiện trong ngày/ca kèm giờ
            text = `${tt}, ${timeline}`;
        } else if (sk && gio) {
            // fallback cũ
            text = `${tt}, ${sk}, ${gio}`;
        } else {
            // fallback cũ: không có log -> kèm giờ đăng ký bắt đầu
            const gioDk = formatTimeHM(r.gio_dangky_bat_dau);
            text = gioDk ? `${tt} ${gioDk}` : tt;
        }

        span.textContent = text;
        tdGop.appendChild(span);
        tr.appendChild(tdGop);

        // Giờ đăng ký / Giờ kết thúc
        const tdGioDk = document.createElement("td");
        tdGioDk.textContent = formatTimeHM(r.gio_dangky_bat_dau);
        tr.appendChild(tdGioDk);

        const tdGioKt = document.createElement("td");
        tdGioKt.textContent = formatTimeHM(r.gio_dangky_ket_thuc);
        tr.appendChild(tdGioKt);

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
// Xây timeline linh hoạt từ đăng ký ca + log chấm công
// - Nhân viên có chấm công: dùng các phiên làm việc thực tế (có thể nhiều ca)
// - Nhân viên không chấm công: dùng giờ đăng ký ca
function buildTimelineFromRows(scheduleRows, logRows) {
    const schedules = scheduleRows || [];
    const logs = logRows || [];

    // Gom đăng ký ca theo (manv, diadiem)
    const scheduleByKey = new Map();
    for (const r of schedules) {
        if (!r.manv || !r.diadiem) continue;
        const key = `${r.manv}|${r.diadiem}`;
        if (!scheduleByKey.has(key)) scheduleByKey.set(key, []);
        scheduleByKey.get(key).push(r);
    }

    // Tính giờ kết thúc lớn nhất theo đăng ký ca cho từng nhân viên / cơ sở
    const scheduleEndByKey = new Map();
    for (const [key, schedList] of scheduleByKey.entries()) {
        let maxEnd = null;
        for (const r of schedList) {
            const e = parseTimeToMinutes(r.gio_ket_thuc);
            if (e != null && (maxEnd == null || e > maxEnd)) {
                maxEnd = e;
            }
        }
        if (maxEnd != null) {
            scheduleEndByKey.set(key, maxEnd);
        }
    }


    // Gom log chấm công theo (manv, diadiem)
    const logsByKey = new Map();
    for (const log of logs) {
        if (!log.manv || !log.diadiem || !log.su_kien || !log.created_at) continue;
        const key = `${log.manv}|${log.diadiem}`;
        if (!logsByKey.has(key)) logsByKey.set(key, []);
        logsByKey.get(key).push(log);
    }

    const intervals = [];

    function toMinutesFromTimestamp(ts) {
        const d = new Date(ts);
        return d.getHours() * 60 + d.getMinutes();
    }

    // Hàm tạo nhãn cho 1 nhân viên ở 1 cơ sở
    function makeLabel(key, fallbackManv) {
        const schedList = scheduleByKey.get(key) || [];
        const [manvOnly] = key.split("|");
        const baseManv = fallbackManv || manvOnly;

        if (schedList.length === 0) {
            // chỉ có chấm công, không có lịch -> TT (Thực Tế)
            return `${baseManv}(TT)`;
        }

        const r0 = schedList[0];
        const ten = r0.tennv || r0.manv || baseManv;
        let suffix = "T";
        if (r0.trang_thai === "DA_DUYET") suffix = "D";
        else if (r0.trang_thai === "CHO_DUYET") suffix = "C";
        return `${ten}(${suffix})`;
    }

    // 1) Tạo các khoảng làm việc thực tế từ log (có thể nhiều ca trong ngày)
    const tanEvents = new Set(["TANCA", "AUTO_TANCA"]);
    for (const [key, evs] of logsByKey.entries()) {
        // sắp xếp log theo thời gian
        evs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        let currentStart = null;
        let lastTimeSeen = null;

        for (const ev of evs) {
            const tMin = toMinutesFromTimestamp(ev.created_at);
            lastTimeSeen = tMin;

            if (ev.su_kien === "VAOCA") {
                if (currentStart == null) {
                    // mở ca mới
                    currentStart = tMin;
                } else {
                    // đang có ca mà lại VAOCA nữa -> đóng ca cũ tại thời điểm này, mở ca mới
                    if (tMin > currentStart) {
                        intervals.push({
                            key,
                            manv: ev.manv,
                            diadiem: ev.diadiem,
                            startM: currentStart,
                            endM: tMin,
                            label: makeLabel(key, ev.manv),
                        });
                    }
                    currentStart = tMin;
                }
            } else if (tanEvents.has(ev.su_kien)) {
                if (currentStart != null && tMin > currentStart) {
                    intervals.push({
                        key,
                        manv: ev.manv,
                        diadiem: ev.diadiem,
                        startM: currentStart,
                        endM: tMin,
                        label: makeLabel(key, ev.manv),
                    });
                    currentStart = null;
                }
                // nếu không có currentStart thì đây là TANCA lẻ -> bỏ qua cho timeline
            } else if ((ev.su_kien === "NTRD" || ev.su_kien === "NCHD") && currentStart == null) {
                // trong trường hợp hiếm chỉ có NTRD/NCHD mà không có VAOCA, coi như bắt đầu ca
                currentStart = tMin;
            }
        }

        // Nếu còn 1 ca đang mở mà chưa gặp TANCA trong ngày
        if (currentStart != null) {
            // Ưu tiên kết thúc theo giờ đăng ký ca (nếu có)
            let endM = scheduleEndByKey.get(key);
            if (endM == null || endM <= currentStart) {
                // Không có đăng ký hoặc giờ kết thúc <= giờ bắt đầu,
                // cho chạy tới cuối ngày để thể hiện "đang làm"
                endM = 23 * 60 + 59; // 23:59
            }

            intervals.push({
                key,
                manv: evs[evs.length - 1].manv,
                diadiem: evs[evs.length - 1].diadiem,
                startM: currentStart,
                endM,
                label: makeLabel(key, evs[evs.length - 1].manv),
            });
        }

    }

    // 2) Thêm các khoảng chỉ có lịch đăng ký (không chấm công)
    for (const [key, schedList] of scheduleByKey.entries()) {
        if (logsByKey.has(key)) {
            // đã có log -> đã tạo interval thực tế, không thêm khoảng lịch nữa
            continue;
        }

        for (const r of schedList) {
            const startM = parseTimeToMinutes(r.gio_bat_dau);
            const endM = parseTimeToMinutes(r.gio_ket_thuc);
            if (startM == null || endM == null || endM <= startM) continue;

            const label = makeLabel(key, r.manv);

            intervals.push({
                key,
                manv: r.manv,
                diadiem: r.diadiem,
                startM,
                endM,
                label,
            });
        }
    }

    if (intervals.length === 0) return [];

    // 3) Tập tất cả mốc thời gian (linh hoạt, lấy theo dữ liệu)
    const timeSet = new Set();
    for (const itv of intervals) {
        timeSet.add(itv.startM);
        timeSet.add(itv.endM);
    }
    const times = Array.from(timeSet).sort((a, b) => a - b);

    // 4) Tính trạng thái tại từng mốc
    const steps = [];
    for (const t of times) {
        const cs1 = [];
        const cs2 = [];

        for (const itv of intervals) {
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
            cs2,
        });
    }

    // 5) Nén lại, chỉ giữ mốc thay đổi danh sách nhân viên
    const result = [];
    let prevKey = null;

    for (const step of steps) {
        const cs1Ids = step.cs1.map(x => x.manv).sort().join(",");
        const cs2Ids = step.cs2.map(x => x.manv).sort().join(",");
        const key = `${cs1Ids}|${cs2Ids}`;

        if (prevKey !== null && key === prevKey) {
            // không có thay đổi so với mốc trước -> bỏ
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
            cs2Text,
        });
    }

    return result;
}


// ===== Workforce-by-hour summary (shared module) =====
let nhansuSummaryApi = null;

function ensureNhansuSummary() {
    if (!nhansuSummaryApi) {
        nhansuSummaryApi = initNhansuSummary({
            supabase,
            dateInputEl: summaryDateInput,
            loadButtonEl: summaryBtn,                 // ✅ đúng tên
            timelineEl: summaryTimelineEl,
            messageEl: summaryMsg,
            statuses: ["CHO_DUYET", "DA_DUYET"],       // ✅ đúng tên
            autoLoad: true                           // ✅ đúng tên (bạn muốn auto thì true)
        });
    }
}



// ========== PHẦN 3: BẢNG CÔNG THÁNG + ĐỐI CHIẾU LỊCH/THỰC TẾ ==========

function normalizeManv(v) {
    return String(v || "").trim().toUpperCase();
}

const bcDetailModeEl = document.getElementById("bc-detail-mode");
const bcEmployeeWrapEl = document.getElementById("bc-employee-wrap");
const bcEmployeeEl = document.getElementById("bc-employee");
const bcAbnormalWrapEl = document.getElementById("bc-abnormal-wrap");
const bcOnlyAbnormalEl = document.getElementById("bc-only-abnormal");
const bcDetailTitleEl = document.getElementById("bc-detail-title");

let bangCongCache = null;
let bangCongCellMeta = [];

function setBangCongMessage(text, isError = false) {
    if (!bangCongMsg) return;
    bangCongMsg.textContent = text || "";
    bangCongMsg.style.color = isError ? "#b00020" : "#555";
}

function bcToMinutes(timeStr) {
    if (!timeStr) return null;
    const s = String(timeStr).slice(0, 5);
    const m = s.match(/^(\d{2}):(\d{2})$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
}

function bcMinutesToHHMM(mins) {
    if (mins == null || !Number.isFinite(mins)) return "";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function bcSafeUpper(v) {
    return String(v ?? "").trim().toUpperCase();
}

function bcNormalizeSite(v) {
    const s = String(v ?? "").trim().toLowerCase();
    if (!s) return null;
    if (s === "cs1" || s === "cơ sở 1" || s === "co so 1") return "cs1";
    if (s === "cs2" || s === "cơ sở 2" || s === "co so 2") return "cs2";
    return s;
}

function bcIsWork(loai) {
    return bcSafeUpper(loai) === "CA_LAM";
}

function bcIsDayOff(loai) {
    const x = bcSafeUpper(loai);
    return x === "NGHI_CA_NGAY" || x === "NGHI_PHEP_NGAY" || x === "NGHI_CA";
}

function bcIsHourlyLeave(loai) {
    const x = bcSafeUpper(loai);
    return x === "NGHI_THEO_GIO" || x === "NGHI_GIO" || x === "NGHI_PHEP_GIO";
}

function bcSubtractOne(work, leave) {
    const { s, e } = work;
    const ls = leave.s;
    const le = leave.e;
    if (le <= s || ls >= e) return [work];
    if (ls <= s && le >= e) return [];
    if (ls <= s && le < e) return [{ s: le, e }];
    if (ls > s && le >= e) return [{ s, e: ls }];
    return [{ s, e: ls }, { s: le, e }];
}

function bcSubtractLeaves(workIntervals, leaveIntervals) {
    let current = [...workIntervals];
    for (const lv of leaveIntervals) {
        const next = [];
        for (const w of current) next.push(...bcSubtractOne(w, lv));
        current = next;
        if (!current.length) break;
    }
    return current;
}

function makeDateYMD(year, month, day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Luôn lấy "hôm nay" theo Việt Nam để quản lý từ Đức vẫn ra đúng ngày của cửa hàng.
function vietnamTodayYMD() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const get = (t) => parts.find(x => x.type === t)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
}

function vnDateKeyFromTimestamp(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(d);
    const get = (t) => parts.find(x => x.type === t)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
}

function vnTimeHMFromTimestamp(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(d);
    const get = (t) => parts.find(x => x.type === t)?.value || "";
    return `${get("hour")}:${get("minute")}`;
}

function formatHour2(v) {
    return Number(v || 0).toFixed(2);
}

function formatSignedHour(v) {
    const n = Number(v || 0);
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}h`;
}

function formatSignedMinutes(vHours) {
    const mins = Math.round(Number(vHours || 0) * 60);
    return `${mins >= 0 ? "+" : ""}${mins}p`;
}

function getCompareState(actual, registered, dateYmd) {
    const a = Number(actual || 0);
    const r = Number(registered || 0);
    const today = vietnamTodayYMD();

    // Không cảnh báo ngày hôm nay / tương lai vì ca có thể chưa kết thúc.
    if (dateYmd >= today) return { type: "", diff: a - r };

    if (r > 0 && a <= 0) return { type: "missing_actual", diff: -r };
    if (r <= 0 && a > 0) return { type: "no_schedule", diff: a };

    const diff = a - r;
    if (r > 0 && a > 0 && diff <= -0.5) return { type: "under", diff };
    if (r > 0 && a > 0 && diff >= 0.5) return { type: "over", diff };
    return { type: "", diff };
}

function bcEscapeHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Trả về cả tổng giờ đăng ký và chuỗi chi tiết để dùng cho chế độ 1 nhân viên.
function buildRegisteredData(scheduleRows) {
    const byKey = new Map(); // yyyy-mm-dd|manv|site

    for (const r of scheduleRows || []) {
        const ngay = String(r.ngay || "").slice(0, 10);
        const manv = normalizeManv(r.manv);
        const site = bcNormalizeSite(r.diadiem) || "";
        if (!ngay || !manv) continue;

        const key = `${ngay}|${manv}|${site}`;
        if (!byKey.has(key)) byKey.set(key, { work: [], leaves: [], hasDayOff: false, site });
        const st = byKey.get(key);
        const loai = bcSafeUpper(r.loai_dang_ky);

        if (bcIsDayOff(loai)) {
            st.hasDayOff = true;
            continue;
        }
        if (bcIsWork(loai)) {
            const s = bcToMinutes(r.gio_bat_dau);
            const e = bcToMinutes(r.gio_ket_thuc);
            if (s != null && e != null && e > s) st.work.push({ s, e });
            continue;
        }
        if (bcIsHourlyLeave(loai)) {
            const s = bcToMinutes(r.tu_gio ?? r.gio_bat_dau);
            const e = bcToMinutes(r.den_gio ?? r.gio_ket_thuc);
            if (s != null && e != null && e > s) st.leaves.push({ s, e });
        }
    }

    const hoursMap = {};
    const detailParts = {}; // yyyy-mm-dd|manv => array text parts
    const hasDayOffMap = {};

    for (const [key, st] of byKey.entries()) {
        const [ngay, manv] = key.split("|");
        const dayKey = `${ngay}|${manv}`;

        if (st.hasDayOff) {
            hasDayOffMap[dayKey] = true;
            if (!detailParts[dayKey]) detailParts[dayKey] = [];
            detailParts[dayKey].push(`${st.site ? st.site.toUpperCase() + ": " : ""}Nghỉ cả ngày`);
            continue;
        }

        const work = st.work.sort((a, b) => a.s - b.s);
        const merged = [];
        for (const w of work) {
            const last = merged[merged.length - 1];
            if (!last || w.s > last.e) merged.push({ ...w });
            else last.e = Math.max(last.e, w.e);
        }

        const leaves = st.leaves.sort((a, b) => a.s - b.s);
        const effective = bcSubtractLeaves(merged, leaves);
        const mins = effective.reduce((sum, x) => sum + Math.max(0, x.e - x.s), 0);
        hoursMap[dayKey] = (hoursMap[dayKey] || 0) + mins / 60;

        const workText = merged.map(x => `${bcMinutesToHHMM(x.s)}–${bcMinutesToHHMM(x.e)}`).join(" + ");
        const leaveText = leaves.map(x => `${bcMinutesToHHMM(x.s)}–${bcMinutesToHHMM(x.e)}`).join(" + ");
        let part = workText || "Không có ca làm";
        if (leaveText) part += `; nghỉ ${leaveText}`;
        if (st.site) part = `${st.site.toUpperCase()}: ${part}`;
        if (!detailParts[dayKey]) detailParts[dayKey] = [];
        detailParts[dayKey].push(part);
    }

    const detailMap = {};
    const keys = new Set([...Object.keys(hoursMap), ...Object.keys(detailParts), ...Object.keys(hasDayOffMap)]);
    for (const k of keys) {
        const total = Number(hoursMap[k] || 0);
        const parts = detailParts[k] || [];
        if (parts.length) detailMap[k] = `${parts.join(" | ")} / ${formatHour2(total)}h`;
        else detailMap[k] = total > 0 ? `${formatHour2(total)}h` : "";
    }

    return { hoursMap, detailMap, hasDayOffMap };
}

const bcEventLabels = {
    VAOCA: "Vào",
    NTR: "Nghỉ trưa",
    NTRD: "Vào lại",
    NCH: "Nghỉ chiều",
    NCHD: "Vào lại",
    TANCA: "Tan",
    AUTO_TANCA: "Tự tan",
    TANCA_LICH: "Tan theo lịch"
};

function buildActualEventMap(logRows) {
    const map = {}; // yyyy-mm-dd|manv => event[]
    for (const r of logRows || []) {
        const manv = normalizeManv(r.manv);
        const ngay = vnDateKeyFromTimestamp(r.created_at);
        if (!manv || !ngay) continue;
        const key = `${ngay}|${manv}`;
        if (!map[key]) map[key] = [];
        map[key].push(r);
    }

    const out = {};
    for (const [key, rows] of Object.entries(map)) {
        rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        out[key] = rows.map(r => {
            const ev = bcSafeUpper(r.su_kien);
            const label = bcEventLabels[ev] || ev || "Sự kiện";
            const t = vnTimeHMFromTimestamp(r.created_at);
            return `${label} ${t}`.trim();
        }).join(" · ");
    }
    return out;
}

function buildActualHoursMap(congData, year, month) {
    const map = {};
    for (const r of congData || []) {
        const manv = normalizeManv(r.manv);
        const day = Number(r.ngay);
        if (!manv || !day) continue;
        map[`${makeDateYMD(year, month, day)}|${manv}`] = Number(r.gio_cong || 0);
    }
    return map;
}

function bangCongRenderer(instance, td, row, col, prop, value, cellProperties) {
    window.Handsontable.renderers.NumericRenderer.apply(this, arguments);
    td.style.background = "";
    td.style.color = "";
    td.style.fontWeight = "";
    td.style.cursor = "";
    td.title = "";

    const meta = bangCongCellMeta?.[row]?.[col];
    if (!meta) return td;

    const colors = {
        under: { bg: "#fff3b0", fg: "#7a5a00" },
        over: { bg: "#ffcdd2", fg: "#8e0000" },
        missing_actual: { bg: "#bbdefb", fg: "#0d47a1" },
        no_schedule: { bg: "#e1bee7", fg: "#6a1b9a" },
    };
    const c = colors[meta.type];
    if (c) {
        td.style.background = c.bg;
        td.style.color = c.fg;
        td.style.fontWeight = "700";
    }
    td.style.cursor = "help";
    td.title = meta.tooltip || "";
    return td;
}

function bangCongDetailTextRenderer(instance, td, row, col, prop, value, cellProperties) {
    window.Handsontable.renderers.TextRenderer.apply(this, arguments);
    td.style.whiteSpace = "normal";
    td.style.lineHeight = "1.35";
    td.style.verticalAlign = "top";
    td.title = cellProperties?.title || "";
    return td;
}

function bangCongDetailAlertRenderer(instance, td, row, col, prop, value, cellProperties) {
    window.Handsontable.renderers.TextRenderer.apply(this, arguments);
    td.style.whiteSpace = "normal";
    td.style.lineHeight = "1.35";
    td.style.verticalAlign = "top";
    td.style.background = "";
    td.style.color = "";
    td.style.fontWeight = "";
    const meta = bangCongCellMeta?.[row]?.[col];
    const colors = {
        under: { bg: "#fff3b0", fg: "#7a5a00" },
        over: { bg: "#ffcdd2", fg: "#8e0000" },
        missing_actual: { bg: "#bbdefb", fg: "#0d47a1" },
        no_schedule: { bg: "#e1bee7", fg: "#6a1b9a" },
    };
    const c = colors[meta?.type];
    if (c) {
        td.style.background = c.bg;
        td.style.color = c.fg;
        td.style.fontWeight = "700";
    }
    td.title = meta?.tooltip || "";
    return td;
}

function renderBangCongHot(colHeaders, data, mode = "summary") {
    if (!hotBangCongContainer) return;
    const HOT = window.Handsontable;
    if (!HOT) {
        console.error("Handsontable chưa được nạp.");
        setBangCongMessage("Không tải được thư viện hiển thị bảng công.", true);
        return;
    }

    const detailMode = mode === "detail";
    const settings = {
        data,
        colHeaders,
        rowHeaders: true,
        width: "100%",
        height: 430,
        stretchH: detailMode ? "all" : "all",
        manualColumnResize: true,
        manualRowResize: true,
        filters: true,
        dropdownMenu: true,
        columnSorting: true,
        readOnly: true,
        wordWrap: true,
        rowHeights: detailMode ? 42 : 26,
        colWidths: detailMode ? [58, 55, 85, 260, 310, 95] : undefined,
        cells(row, col) {
            const cp = {};
            if (!detailMode) {
                if (row < data.length - 1 && col >= 2 && col < colHeaders.length - 1) {
                    cp.type = "numeric";
                    cp.numericFormat = { pattern: "0.00" };
                    cp.renderer = bangCongRenderer;
                }
            } else {
                if (col === 2 || col === 5) cp.renderer = bangCongDetailAlertRenderer;
                else if (col === 3 || col === 4) cp.renderer = bangCongDetailTextRenderer;
            }
            return cp;
        },
        licenseKey: "non-commercial-and-evaluation"
    };

    if (!hotBangCong) hotBangCong = new HOT(hotBangCongContainer, settings);
    else {
        hotBangCong.updateSettings(settings);
        hotBangCong.loadData(data);
        hotBangCong.render();
    }
}

function getThuLabel(year, month, day, fallback = "") {
    if (fallback) return fallback;
    const thuNames = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    return thuNames[new Date(year, month - 1, day).getDay()];
}

function populateBangCongEmployeeSelect(cache) {
    if (!bcEmployeeEl) return;
    const prev = bcEmployeeEl.value;
    const actualEmployees = new Map();
    for (const r of cache.congData || []) {
        const manv = normalizeManv(r.manv);
        if (!manv || Number(r.gio_cong || 0) <= 0) continue;
        const name = String(r.tennv || manv).trim();
        if (!actualEmployees.has(manv)) actualEmployees.set(manv, name);
    }

    const list = Array.from(actualEmployees.entries()).sort((a, b) =>
        String(a[1]).localeCompare(String(b[1]), "vi") || a[0].localeCompare(b[0], "vi")
    );
    bcEmployeeEl.innerHTML = `<option value="">-- Chọn nhân viên --</option>` + list.map(([manv, name]) =>
        `<option value="${bcEscapeHtml(manv)}">${bcEscapeHtml(name)} (${bcEscapeHtml(manv)})</option>`
    ).join("");

    if (prev && actualEmployees.has(prev)) bcEmployeeEl.value = prev;
    else if (list.length === 1) bcEmployeeEl.value = list[0][0];
}

function buildSummaryEmployeeList(cache) {
    const employeeMap = new Map();
    cache.congData.forEach(d => {
        const manv = normalizeManv(d.manv);
        if (!manv) return;
        if (!employeeMap.has(manv)) employeeMap.set(manv, d.tennv || d.manv || manv);
    });
    cache.lichRows.forEach(r => {
        const manv = normalizeManv(r.manv);
        if (!manv) return;
        if (!employeeMap.has(manv)) employeeMap.set(manv, manv);
    });
    return Array.from(employeeMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0], "vi"))
        .map(([manv, tennv]) => ({ manv, tennv }));
}

function renderBangCongSummary(cache) {
    const { thang, nam, lastDay, congData, registeredData } = cache;
    const tbody = document.getElementById("tbody-bangcong");
    const thead = document.getElementById("thead-bangcong");
    const nhanvien = buildSummaryEmployeeList(cache);

    if (bcDetailTitleEl) bcDetailTitleEl.style.display = "none";

    if (!nhanvien.length) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="50">Không có dữ liệu.</td></tr>`;
        if (thead) thead.innerHTML = "";
        bangCongCellMeta = [];
        renderBangCongHot([], []);
        setBangCongMessage(`Không có dữ liệu công hoặc lịch đã duyệt tháng ${thang}/${nam}.`);
        return;
    }

    const groupByNgay = {};
    congData.forEach(d => {
        const day = Number(d.ngay);
        groupByNgay[day] = groupByNgay[day] || [];
        groupByNgay[day].push(d);
    });

    const colHeaders = ["Ngày", "Thứ", ...nhanvien.map(x => x.tennv), "Tổng"];
    const hotData = [];
    bangCongCellMeta = [];
    const tongTheoNhanVien = {};
    nhanvien.forEach(n => { tongTheoNhanVien[n.manv] = 0; });
    let tongTatCa = 0;
    let countUnder = 0, countOver = 0, countMissing = 0, countNoSchedule = 0;

    for (let day = 1; day <= lastDay; day++) {
        const dateYmd = makeDateYMD(nam, thang, day);
        const row = groupByNgay[day] || [];
        const thu = getThuLabel(nam, thang, day, row[0]?.thu || "");
        let sum = 0;
        const rowData = [day, thu];
        const metaRow = [{}, {}];

        nhanvien.forEach(n => {
            const found = row.find(r => normalizeManv(r.manv) === n.manv);
            const actual = found ? Number(found.gio_cong || 0) : 0;
            const registered = Number(registeredData.hoursMap[`${dateYmd}|${n.manv}`] || 0);
            const cmp = getCompareState(actual, registered, dateYmd);

            if (cmp.type === "under") countUnder++;
            if (cmp.type === "over") countOver++;
            if (cmp.type === "missing_actual") countMissing++;
            if (cmp.type === "no_schedule") countNoSchedule++;

            sum += actual;
            tongTheoNhanVien[n.manv] += actual;
            rowData.push(Number(actual.toFixed(2)));

            const tooltip = [
                `${n.tennv} (${n.manv}) - ${dateYmd}`,
                `Giờ thực tế: ${formatHour2(actual)}h`,
                `Giờ đăng ký đã duyệt: ${formatHour2(registered)}h`,
                `Chênh lệch: ${formatSignedHour(actual - registered)}`,
                cmp.type === "under" ? "Cảnh báo: thực tế thiếu từ 30 phút." : "",
                cmp.type === "over" ? "Cảnh báo: thực tế vượt từ 30 phút." : "",
                cmp.type === "missing_actual" ? "Cảnh báo: có lịch đã duyệt nhưng chưa có giờ công thực tế." : "",
                cmp.type === "no_schedule" ? "Cảnh báo: có giờ công thực tế nhưng không có lịch đã duyệt." : "",
                dateYmd >= vietnamTodayYMD() ? "Ngày hôm nay/tương lai: chưa áp dụng màu cảnh báo thiếu/vượt." : "",
            ].filter(Boolean).join("\n");
            metaRow.push({ type: cmp.type, tooltip });
        });

        tongTatCa += sum;
        rowData.push(Number(sum.toFixed(2)));
        metaRow.push({});
        hotData.push(rowData);
        bangCongCellMeta.push(metaRow);
    }

    const totalRow = ["Tổng", "", ...nhanvien.map(n => Number((tongTheoNhanVien[n.manv] || 0).toFixed(2))), Number(tongTatCa.toFixed(2))];
    hotData.push(totalRow);
    bangCongCellMeta.push([]);
    renderBangCongHot(colHeaders, hotData, "summary");

    setBangCongMessage(
        `Đã tải tháng ${thang}/${nam}: ${nhanvien.length} NV | ` +
        `Thiếu ≥30p: ${countUnder} | Vượt ≥30p: ${countOver} | ` +
        `Có lịch không có công: ${countMissing} | Có công không có lịch: ${countNoSchedule}`
    );
}

function renderBangCongDetail(cache) {
    const { thang, nam, lastDay, congData, registeredData, actualEventMap, actualHoursMap } = cache;
    const manv = normalizeManv(bcEmployeeEl?.value);
    const onlyAbnormal = !!bcOnlyAbnormalEl?.checked;

    if (!manv) {
        bangCongCellMeta = [];
        renderBangCongHot(["Ngày", "Thứ", "Giờ công", "Giờ đăng ký", "Giờ thực hiện", "Chênh lệch"], [], "detail");
        if (bcDetailTitleEl) {
            bcDetailTitleEl.style.display = "block";
            bcDetailTitleEl.textContent = "Chọn một nhân viên để xem chi tiết bảng công.";
        }
        setBangCongMessage("Chế độ chi tiết: vui lòng chọn nhân viên.");
        return;
    }

    const nameRow = congData.find(r => normalizeManv(r.manv) === manv && String(r.tennv || "").trim());
    const tennv = String(nameRow?.tennv || manv).trim();
    if (bcDetailTitleEl) {
        bcDetailTitleEl.style.display = "block";
        bcDetailTitleEl.textContent = `CHI TIẾT BẢNG CÔNG – ${tennv} (${manv}) – THÁNG ${String(thang).padStart(2,"0")}/${nam}`;
    }

    const groupByDay = {};
    congData.filter(r => normalizeManv(r.manv) === manv).forEach(r => { groupByDay[Number(r.ngay)] = r; });

    const hotData = [];
    bangCongCellMeta = [];
    let countShown = 0;
    let abnormalCount = 0;
    let totalActualMonth = 0;
    let totalRegisteredMonth = 0;

    for (let day = 1; day <= lastDay; day++) {
        const dateYmd = makeDateYMD(nam, thang, day);
        const found = groupByDay[day];
        const actual = Number(actualHoursMap[`${dateYmd}|${manv}`] ?? found?.gio_cong ?? 0);
        const registered = Number(registeredData.hoursMap[`${dateYmd}|${manv}`] || 0);
        const cmp = getCompareState(actual, registered, dateYmd);
        const isAbnormal = !!cmp.type;
        if (isAbnormal) abnormalCount++;

        totalActualMonth += actual;
        totalRegisteredMonth += registered;

        const hasAnyData = actual > 0 || registered > 0;
        if (!hasAnyData) continue;
        if (onlyAbnormal && !isAbnormal) continue;

        // Chế độ chi tiết chỉ hiện những ngày có công hoặc có lịch làm, tránh các dòng rỗng.
        const thu = getThuLabel(nam, thang, day, found?.thu || "");
        const regText = registeredData.detailMap[`${dateYmd}|${manv}`] || (registered > 0 ? `${formatHour2(registered)}h` : "—");
        const events = actualEventMap[`${dateYmd}|${manv}`] || "";
        const actualText = actual > 0
            ? `${events || "Không đọc được log chi tiết"} / ${formatHour2(actual)}h`
            : (events ? `${events} / 0.00h` : "—");
        const diffText = (actual === 0 && registered === 0) ? "" : formatSignedMinutes(actual - registered);

        const tooltip = [
            `${tennv} (${manv}) - ${dateYmd}`,
            `Giờ thực tế: ${formatHour2(actual)}h`,
            `Giờ đăng ký: ${formatHour2(registered)}h`,
            `Chênh lệch: ${formatSignedMinutes(actual - registered)}`,
            cmp.type === "under" ? "Thiếu từ 30 phút." : "",
            cmp.type === "over" ? "Vượt từ 30 phút." : "",
            cmp.type === "missing_actual" ? "Có lịch nhưng không có công." : "",
            cmp.type === "no_schedule" ? "Có công nhưng không có lịch đã duyệt." : ""
        ].filter(Boolean).join("\n");

        const rowIndex = hotData.length;
        hotData.push([
            day,
            thu,
            actual > 0 ? formatHour2(actual) : "",
            regText,
            actualText,
            diffText
        ]);
        bangCongCellMeta[rowIndex] = [
            {}, {},
            { type: cmp.type, tooltip },
            {}, {},
            { type: cmp.type, tooltip }
        ];
        countShown++;
    }

    const totalDiff = totalActualMonth - totalRegisteredMonth;
    hotData.push([
        "Tổng",
        "",
        formatHour2(totalActualMonth),
        `Tổng lịch: ${formatHour2(totalRegisteredMonth)}h`,
        `Tổng thực tế: ${formatHour2(totalActualMonth)}h`,
        formatSignedMinutes(totalDiff)
    ]);
    bangCongCellMeta.push([{}, {}, {}, {}, {}, {}]);

    renderBangCongHot(["Ngày", "Thứ", "Giờ công", "Giờ đăng ký", "Giờ thực hiện", "Chênh lệch"], hotData, "detail");
    setBangCongMessage(
        `Chi tiết ${tennv}: hiển thị ${countShown} ngày` +
        `${onlyAbnormal ? ` bất thường (tổng ${abnormalCount})` : ` | bất thường: ${abnormalCount}`}` +
        ` | Tổng thực tế ${formatHour2(totalActualMonth)}h / đăng ký ${formatHour2(totalRegisteredMonth)}h` +
        ` | Ngưỡng cảnh báo: ±30 phút.`
    );
}

function renderBangCongCurrentMode() {
    if (!bangCongCache) return;
    const detail = !!bcDetailModeEl?.checked;
    if (bcEmployeeWrapEl) bcEmployeeWrapEl.style.display = detail ? "block" : "none";
    if (bcAbnormalWrapEl) bcAbnormalWrapEl.style.display = detail ? "inline-flex" : "none";
    if (detail) renderBangCongDetail(bangCongCache);
    else renderBangCongSummary(bangCongCache);
}

async function taiBangCong() {
    const thang = parseInt(document.getElementById("bc-thang")?.value || "0", 10);
    const nam = parseInt(document.getElementById("bc-nam")?.value || "0", 10);
    const tbody = document.getElementById("tbody-bangcong");

    if (!thang || thang < 1 || thang > 12 || !nam) {
        setBangCongMessage("Vui lòng chọn tháng và năm hợp lệ.", true);
        return;
    }

    if (tbody) tbody.innerHTML = `<tr><td colspan="50">Đang tải...</td></tr>`;
    setBangCongMessage(`Đang tải bảng công, lịch đăng ký và log thực tế tháng ${thang}/${nam}...`);

    const lastDay = new Date(nam, thang, 0).getDate();
    const firstDate = makeDateYMD(nam, thang, 1);
    const lastDate = makeDateYMD(nam, thang, lastDay);
    const nextMonth = thang === 12 ? { y: nam + 1, m: 1 } : { y: nam, m: thang + 1 };
    const nextFirstDate = makeDateYMD(nextMonth.y, nextMonth.m, 1);

    // created_at là timestamptz; dùng ranh giới +07:00 để lấy đúng ngày Việt Nam,
    // không phụ thuộc máy quản lý đang ở Việt Nam hay Đức.
    const logStart = `${firstDate}T00:00:00+07:00`;
    const logEnd = `${nextFirstDate}T00:00:00+07:00`;

    const [congRes, lichRes, logRes] = await Promise.all([
        supabase.rpc("chamcong_bangcong_monthly", { p_month: thang, p_year: nam }),
        supabase
            .from("lichlam_dangky")
            .select("ngay, diadiem, manv, loai_dang_ky, gio_bat_dau, gio_ket_thuc, tu_gio, den_gio, trang_thai")
            .gte("ngay", firstDate)
            .lte("ngay", lastDate)
            .eq("trang_thai", "DA_DUYET"),
        supabase
            .from("chamcong_log")
            .select("manv, diadiem, su_kien, created_at")
            .gte("created_at", logStart)
            .lt("created_at", logEnd)
            .order("created_at", { ascending: true })
    ]);

    if (congRes.error) {
        console.error("Lỗi chamcong_bangcong_monthly:", congRes.error);
        renderBangCongHot([], []);
        setBangCongMessage("Lỗi tải bảng công: " + (congRes.error.message || "Không xác định"), true);
        return;
    }
    if (lichRes.error) {
        console.error("Lỗi lichlam_dangky:", lichRes.error);
        renderBangCongHot([], []);
        setBangCongMessage("Lỗi tải lịch đăng ký: " + (lichRes.error.message || "Không xác định"), true);
        return;
    }

    // Log chi tiết là phần bổ sung. Nếu RLS chưa cho đọc chamcong_log thì bảng tổng vẫn hoạt động,
    // chế độ chi tiết sẽ báo "Không đọc được log chi tiết" thay vì làm hỏng cả bảng công.
    let logRows = [];
    let logWarning = "";
    if (logRes.error) {
        console.warn("Không tải được chamcong_log:", logRes.error);
        logWarning = " (chưa đọc được log vào/ra chi tiết; kiểm tra quyền SELECT chamcong_log)";
    } else {
        logRows = logRes.data || [];
    }

    const congData = congRes.data || [];
    const lichRows = lichRes.data || [];
    const registeredData = buildRegisteredData(lichRows);
    const actualEventMap = buildActualEventMap(logRows);
    const actualHoursMap = buildActualHoursMap(congData, nam, thang);

    bangCongCache = {
        thang, nam, lastDay, firstDate, lastDate,
        congData, lichRows, logRows,
        registeredData, actualEventMap, actualHoursMap,
        logWarning
    };

    populateBangCongEmployeeSelect(bangCongCache);
    renderBangCongCurrentMode();
    if (logWarning && bcDetailModeEl?.checked) {
        setBangCongMessage((bangCongMsg?.textContent || "") + logWarning, true);
    }
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

    // ✅ set ngày mặc định = hôm nay (yyyy-mm-dd) để khỏi phải chọn
if (summaryDateInput && !summaryDateInput.value) {
  summaryDateInput.value = new Date().toISOString().slice(0, 10);
}

    // workforce summary (shared module)
    ensureNhansuSummary();

    // bảng công tháng: mặc định tháng/năm hiện tại
    const today = new Date();
    const thangEl = document.getElementById("bc-thang");
    const namEl = document.getElementById("bc-nam");
    const btnBangCong = document.getElementById("btn-bangcong");

    if (thangEl && !thangEl.value) thangEl.value = today.getMonth() + 1;
    if (namEl && !namEl.value) namEl.value = today.getFullYear();
    if (btnBangCong) btnBangCong.addEventListener("click", taiBangCong);

    if (bcDetailModeEl) {
        bcDetailModeEl.addEventListener("change", () => {
            if (bcEmployeeWrapEl) bcEmployeeWrapEl.style.display = bcDetailModeEl.checked ? "block" : "none";
            if (bcAbnormalWrapEl) bcAbnormalWrapEl.style.display = bcDetailModeEl.checked ? "inline-flex" : "none";
            renderBangCongCurrentMode();
        });
    }
    if (bcEmployeeEl) {
        bcEmployeeEl.addEventListener("change", renderBangCongCurrentMode);
    }
    if (bcOnlyAbnormalEl) {
        bcOnlyAbnormalEl.addEventListener("change", renderBangCongCurrentMode);
    }

    // Tự tải bảng công tháng hiện tại khi mở trang
    taiBangCong();
});

// Cho phép gọi thủ công khi cần debug/refresh từ console
window.taiBangCong = taiBangCong;


