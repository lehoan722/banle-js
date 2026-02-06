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
const summaryTimelineEl = document.getElementById("summary-timeline");
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

  setSummaryMessage("Đang tải đăng ký ca...");

  clearSummaryTimeline();

  const { data, error } = await supabase
    .from("lichlam_dangky")
    // IMPORTANT: need loai_dang_ky + (tu_gio/den_gio) so we can:
    // - treat NGHI_CA_NGAY as full-day off (remove all work intervals)
    // - subtract NGHI_THEO_GIO from CA_LAM when building the summary timeline
    .select("diadiem, manv, loai_dang_ky, gio_bat_dau, gio_ket_thuc, tu_gio, den_gio, trang_thai, ngay")
    .eq("ngay", ngay)
    .in("trang_thai", ["CHO_DUYET", "DA_DUYET"])
    .order("diadiem", { ascending: true })
    .order("gio_bat_dau", { ascending: true })
    .order("manv", { ascending: true });

  if (error) {
    console.error("Lỗi đọc lichlam_dangky:", error);
    setSummaryMessage("Lỗi tải đăng ký ca.");
    if (summaryTimelineEl) summaryTimelineEl.innerHTML = `<div style="color:#c62828;">Lỗi tải dữ liệu, xem console.</div>`;
    return;
  }

  const rows = data || [];
  if (rows.length === 0) {
    setSummaryMessage(`Không có đăng ký ca (CHO_DUYET/DA_DUYET) trong ngày ${ngay}.`);
    if (summaryTimelineEl) summaryTimelineEl.innerHTML = `<div>Không có đăng ký phù hợp.</div>`;
    return;
  }

  renderTimelineBlocks(buildEffectiveRowsForSummary(rows));
  setSummaryMessage(`Đã tải xong (${rows.length} dòng đăng ký).`);
}


function clearSummaryTimeline() {
  if (summaryTimelineEl) summaryTimelineEl.innerHTML = "";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toMinutes(timeStr) {
  if (!timeStr) return null;
  const s = String(timeStr).slice(0, 5); // "HH:MM"
  const [h, m] = s.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToHHMM(min) {
  if (min == null || !Number.isFinite(min)) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function addActive(activeCount, manv) {
  if (!manv) return;
  activeCount.set(manv, (activeCount.get(manv) || 0) + 1);
}

function removeActive(activeCount, manv) {
  if (!manv) return;
  const cur = activeCount.get(manv) || 0;
  if (cur <= 1) activeCount.delete(manv);
  else activeCount.set(manv, cur - 1);
}


  // ===== v2 SUMMARY HELPERS (support NGHI_CA_NGAY / NGHI_THEO_GIO) =====
  function safeUpper(v) { return String(v ?? "").trim().toUpperCase(); }
  function safeLower(v) { return String(v ?? "").trim().toLowerCase(); }

  // Normalize diadiem/coso variants to 'cs1' / 'cs2' (defensive for legacy data)
  function normalizeSite(v) {
    const s = safeLower(v);
    if (!s) return "";
    if (s === "cs1" || s === "cs 1" || s === "co so 1" || s === "cơ sở 1" || s === "1" || s === "cs_1" || s === "cs-1") return "cs1";
    if (s === "cs2" || s === "cs 2" || s === "co so 2" || s === "cơ sở 2" || s === "2" || s === "cs_2" || s === "cs-2") return "cs2";
    // fallback: if string contains cs1/cs2
    if (s.includes("cs1")) return "cs1";
    if (s.includes("cs2")) return "cs2";
    return s;
  }

  // Backward-compat alias (some versions call timeToMinutes)
  function timeToMinutes(timeStr) { return toMinutes(timeStr); }

  function isLoaiCaLam(loai) {
    return safeUpper(loai) === "CA_LAM";
  }
  function isLoaiNghiCaNgay(loai) {
    const x = safeUpper(loai);
    return x === "NGHI_CA_NGAY" || x === "NGHI_PHEP_NGAY" || x === "NGHI_CA";
  }
  function isLoaiNghiTheoGio(loai) {
    const x = safeUpper(loai);
    return x === "NGHI_THEO_GIO" || x === "NGHI_GIO" || x === "NGHI_PHEP_GIO";
  }

  // Subtract leave intervals from a work interval [s,e)
  function subtractOne(work, leave) {
    const out = [];
    const s = work.s, e = work.e, ls = leave.s, le = leave.e;
    if (le <= s || ls >= e) { out.push(work); return out; } // no overlap
    if (ls <= s && le >= e) { return out; } // fully covered
    if (ls <= s && le < e) { out.push({ s: le, e }); return out; }
    if (ls > s && le >= e) { out.push({ s, e: ls }); return out; }
    // split in middle
    out.push({ s, e: ls });
    out.push({ s: le, e });
    return out;
  }

  function subtractLeaves(workIntervals, leaveIntervals) {
    let current = [...workIntervals];
    for (const lv of leaveIntervals) {
      const next = [];
      for (const w of current) next.push(...subtractOne(w, lv));
      current = next;
      if (current.length === 0) break;
    }
    return current;
  }

  // Build "effective" CA_LAM rows after applying NGHI_CA_NGAY and NGHI_THEO_GIO
  function buildEffectiveRowsForSummary(rows) {
    const bySite = new Map(); // site -> Map(manv -> { work:[], leaves:[], hasDayOff:false })
    for (const r of (rows || [])) {
      const site = normalizeSite(r.diadiem ?? r.co_so ?? r.coso ?? r.site);
      const manv = safeUpper(r.manv);
      if (!site || !manv) continue;

      if (!bySite.has(site)) bySite.set(site, new Map());
      const byManv = bySite.get(site);
      if (!byManv.has(manv)) byManv.set(manv, { work: [], leaves: [], hasDayOff: false });
      const st = byManv.get(manv);

      const loai = safeUpper(r.loai_dang_ky);

      if (isLoaiNghiCaNgay(loai)) {
        st.hasDayOff = true;
        continue;
      }

      if (isLoaiCaLam(loai)) {
        const s = toMinutes(r.gio_bat_dau);
        const e = toMinutes(r.gio_ket_thuc);
        if (s != null && e != null && e > s) st.work.push({ s, e });
        continue;
      }

      if (isLoaiNghiTheoGio(loai)) {
        const s = toMinutes(r.tu_gio ?? r.gio_bat_dau);
        const e = toMinutes(r.den_gio ?? r.gio_ket_thuc);
        if (s != null && e != null && e > s) st.leaves.push({ s, e });
        continue;
      }
    }

    const out = [];
    for (const [site, byManv] of bySite.entries()) {
      for (const [manv, st] of byManv.entries()) {
        if (st.hasDayOff) continue;

        // sort + merge work, sort leaves
        const work = st.work.sort((a,b)=>a.s-b.s);
        const mergedWork = [];
        for (const w of work) {
          const last = mergedWork[mergedWork.length-1];
          if (!last || w.s > last.e) mergedWork.push({ ...w });
          else last.e = Math.max(last.e, w.e);
        }

        const leaves = st.leaves.sort((a,b)=>a.s-b.s);
        const effective = subtractLeaves(mergedWork, leaves);

        for (const it of effective) {
          const sStr = minutesToHHMM(it.s);
          const eStr = minutesToHHMM(it.e);
          if (!sStr || !eStr) continue;
          out.push({
            ngay: rows?.[0]?.ngay ?? null,
            diadiem: site,
            manv: manv,
            gio_bat_dau: sStr,
            gio_ket_thuc: eStr,
            loai_dang_ky: "CA_LAM",
            trang_thai: "DA_DUYET"
          });
        }
      }
    }
    return out;
  }
  // ===== end v2 helpers =====

function buildTimelineForOneSite(rows) {
  const events = new Map(); // minute -> { starts:[], ends:[] }
  const points = new Set();

  for (const r of rows) {
    const sMin = toMinutes(r.gio_bat_dau);
    const eMin = toMinutes(r.gio_ket_thuc);
    if (sMin == null || eMin == null) continue;
    if (eMin <= sMin) continue;

    points.add(sMin);
    points.add(eMin);

    if (!events.has(sMin)) events.set(sMin, { starts: [], ends: [] });
    if (!events.has(eMin)) events.set(eMin, { starts: [], ends: [] });

    events.get(sMin).starts.push(r.manv);
    events.get(eMin).ends.push(r.manv);
  }

  const sorted = Array.from(points).sort((a, b) => a - b);
  if (sorted.length < 2) return [];

  const activeCount = new Map(); // manv -> count
  const lines = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const t = sorted[i];
    const next = sorted[i + 1];

    // QUY TẮC MỐC: end trước start tại cùng thời điểm
    const ev = events.get(t);
    if (ev?.ends?.length) ev.ends.forEach((m) => removeActive(activeCount, m));
    if (ev?.starts?.length) ev.starts.forEach((m) => addActive(activeCount, m));

    const manvs = Array.from(activeCount.keys()).sort();
    const count = manvs.length;

    lines.push({
      from: minutesToHHMM(t),
      to: minutesToHHMM(next),
      count,
      manvs,
    });
  }

  return lines;
}

function renderTimelineBlocks(rows) {
  if (!summaryTimelineEl) return;

  const makeBlock = (site, color) => {
    const r = rows.filter((x) => normalizeSite(x.diadiem ?? x.co_so ?? x.coso ?? x.site) === site);
    const lines = buildTimelineForOneSite(r);

    if (lines.length === 0) {
      return `<div style="color:${color};font-weight:600;">${site}: (không có dữ liệu)</div>`;
    }

    let html = `<div style="color:${color};font-weight:600;">${site}:</div>`;
    for (const ln of lines) {
      const txt =
        ln.count === 0
          ? `${ln.from} - ${ln.to} : 0 người`
          : `${ln.from} - ${ln.to} : ${ln.count} người (${ln.manvs.join(", ")})`;

      html += `<div style="margin-left:14px;color:${ln.count === 0 ? "#c62828" : "#333"};">${txt}</div>`;
    }
    return html;
  };

  summaryTimelineEl.innerHTML = makeBlock("cs1", "blue") + makeBlock("cs2", "red");
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
