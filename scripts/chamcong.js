// scripts/chamcong.js

// Dùng chung cơ chế đăng nhập như trang Up ảnh nhanh
import { khoiTaoDangNhapDungChung } from './authModule.js';

// Supabase client sẽ được gán vào window.supabase sau khi đăng nhập
let supabase = null;

// ===== CẤU HÌNH CƠ SỞ (tọa độ) =====
const CS1_COORD = { lat: 21.5525047, lng: 105.8423559 };
const CS2_COORD = { lat: 21.5843348, lng: 105.8343116 };
const MAX_DISTANCE_M = 400;                // bán kính cho phép (m)
const AUTO_CHECK_INTERVAL_MS = 300000;     // 3 phút
const BUTTON_LOCK_MS = 5 * 60 * 1000;      // 5 phút khoá nút sau khi bấm

// Bộ nhớ log chấm công trong ngày hiện tại (sau khi load từ DB)
let todayEvents = []; // mỗi phần tử: { su_kien, createdAt: Date, nguon }

function isMobileDevice() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

// Tính khoảng cách 2 tọa độ (haversine)
function distanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Lấy diadiem từ URL: chamcongcs1.html / chamcongcs2.html
function getDiaDiemFromPath() {
    const path = (window.location && window.location.pathname) || "";
    if (path.includes("chamcongcs1")) return "cs1";
    if (path.includes("chamcongcs2")) return "cs2";
    return "cs1"; // mặc định
}

function getCoordForDiaDiem(diadiem) {
    if (diadiem === "cs1") return CS1_COORD;
    if (diadiem === "cs2") return CS2_COORD;
    return CS1_COORD;
}

// ==== VỊ TRÍ / GPS =====================================

async function checkInStore(diadiem) {
    if (!navigator.geolocation) {
        alert("Thiết bị không hỗ trợ định vị. Ứng dụng chấm công chỉ dùng tại cửa hàng.");
        return false;
    }

    const coord = getCoordForDiaDiem(diadiem);

    const pos = await new Promise(resolve => {
        navigator.geolocation.getCurrentPosition(
            (p) => resolve(p),
            (err) => {
                console.error("Lỗi định vị:", err);
                if (err.code === 1) {
                    alert(
                        "Bạn đã từ chối quyền truy cập vị trí cho website này.\n\n" +
                        "Hãy vào Cài đặt trình duyệt / ứng dụng để bật lại quyền vị trí, rồi mở lại trang chấm công."
                    );
                } else {
                    alert("Không lấy được vị trí. Vui lòng kiểm tra GPS/mạng rồi thử lại.");
                }
                resolve(null);
            },
            { enableHighAccuracy: false, timeout: 10000 }
        );
    });

    if (!pos) return false;

    const { latitude, longitude } = pos.coords;
    const dist = distanceInMeters(latitude, longitude, coord.lat, coord.lng);
    console.log("Khoảng cách tới", diadiem, "=", dist, "m");
    if (dist > MAX_DISTANCE_M) {
        alert("Bạn không đứng trong khu vực cửa hàng, không thể chấm công.");
        return false;
    }
    return true;
}

// Check trước khi chấm công một sự kiện
async function ensureInStoreBeforeAction(diadiem) {
    // Chỉ cho phép trên mobile
    if (!isMobileDevice()) {
        alert("Ứng dụng chấm công chỉ được dùng trên điện thoại.");
        return false;
    }
    const ok = await checkInStore(diadiem);
    return ok;
}

// ==== GHI & ĐỌC CSDL ====================================

async function ensureSupabase() {
    if (!supabase) {
        supabase = window.supabase;
    }
    if (!supabase) {
        alert("Không khởi tạo được Supabase, vui lòng tải lại trang.");
        return null;
    }
    return supabase;
}

// ====== BẮT NHẮC BAY MAU TRƯỚC KHI CHẤM CÔNG ======

function getBayMauKeyForToday(manv, diadiem) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `baymau_checked_${yyyy}-${mm}-${dd}_${diadiem}_${manv}`;
}

// Lấy danh sách nhiệm vụ bày mẫu cho trang chấm công
async function fetchBayMauTasksForChamCong({ diadiem, manv }) {
    const sp = await ensureSupabase();
    if (!sp || !manv) return [];

    try {
        const { data, error } = await sp.rpc("baymau_get_tasks", {
            p_diadiem: diadiem,
            p_mode: "nv",
            p_manv: manv
        });

        if (error) {
            console.error("Lỗi RPC baymau_get_tasks (chấm công):", error);
            return [];
        }

        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.error("Lỗi fetchBayMauTasksForChamCong:", e);
        return [];
    }
}

// Lưu thay đổi bày mẫu / ghi chú cho các dòng được sửa
async function saveBayMauRowsFromChamCong(changes, { manv }) {
    if (!changes.length) return true;

    const sp = await ensureSupabase();
    if (!sp) return false;

    for (const row of changes) {
        const updates = {};
        if (row.newBayMauBy !== row.oldBayMauBy) {
            updates.baymau_by = row.newBayMauBy;
        }
        if (row.newNote !== row.oldNote) {
            updates.baymau_note = row.newNote;
        }
        if (Object.keys(updates).length === 0) continue;

        const { error } = await sp
            .from("ct_hoadon_banle")
            .update(updates)
            .eq("id", row.id_ct);

        if (error) {
            console.error("Lỗi cập nhật bày mẫu từ chấm công:", error);
            alert("Lỗi lưu trạng thái bày mẫu, vui lòng thử lại hoặc báo quản lý.");
            return false;
        }
    }
    return true;
}

// Hiển thị popup bày mẫu dạng chặn (blocking) cho trang chấm công
function showBayMauPopupChamCong(tasks, { diadiem, manv }) {
    return new Promise((resolve) => {
        // Tạo overlay full màn hình
        const overlay = document.createElement("div");
        overlay.id = "baymau-cc-overlay";
        Object.assign(overlay.style, {
            position: "fixed",
            inset: "0",
            backgroundColor: "rgba(0,0,0,0.4)",
            zIndex: "9999",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
        });

        // Popup container
        const popup = document.createElement("div");
        Object.assign(popup.style, {
            backgroundColor: "#ffe4b5",
            borderRadius: "6px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
            width: "90%",
            maxWidth: "800px",
            maxHeight: "80%",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "Tahoma, Arial, sans-serif",
            fontSize: "14px"
        });

        // Header
        const header = document.createElement("div");
        header.textContent = "YÊU CẦU BÀY MẪU SP (trước khi chấm công)";
        Object.assign(header.style, {
            backgroundColor: "#f4b05e",
            color: "#000",
            fontWeight: "bold",
            padding: "6px 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
        });

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "X";
        Object.assign(closeBtn.style, {
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontWeight: "bold"
        });

        header.appendChild(closeBtn);
        popup.appendChild(header);

        // Thân bảng
        const body = document.createElement("div");
        Object.assign(body.style, {
            flex: "1",
            overflow: "auto",
            padding: "6px 10px",
            backgroundColor: "#ffecc8"
        });

        const table = document.createElement("table");
        table.style.width = "100%";
        table.style.borderCollapse = "collapse";

        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");
        const headers = ["bày mẫu", "mã sp", "nv bán", "GHI CHÚ"];
        headers.forEach((h) => {
            const th = document.createElement("th");
            th.textContent = h;
            Object.assign(th.style, {
                borderBottom: "1px solid #d09040",
                padding: "4px",
                textAlign: h === "GHI CHÚ" ? "left" : "center",
                backgroundColor: "#f4b05e"
            });
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        const rowStates = [];

        tasks.forEach((t) => {
            const tr = document.createElement("tr");

            const tdCheck = document.createElement("td");
            tdCheck.style.textAlign = "center";
            tdCheck.style.padding = "4px";
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = !!t.baymau_by;
            tdCheck.appendChild(cb);
            tr.appendChild(tdCheck);

            const tdMasp = document.createElement("td");
            tdMasp.textContent = t.masp || "";
            tdMasp.style.padding = "4px";
            tr.appendChild(tdMasp);

            const tdNvban = document.createElement("td");
            tdNvban.textContent = t.nvban || "";
            tdNvban.style.textAlign = "center";
            tdNvban.style.padding = "4px";
            tr.appendChild(tdNvban);

            const tdNote = document.createElement("td");
            tdNote.style.padding = "4px";
            const inputNote = document.createElement("input");
            inputNote.type = "text";
            inputNote.value = t.baymau_note || "";
            inputNote.style.width = "100%";
            tdNote.appendChild(inputNote);
            tr.appendChild(tdNote);

            tbody.appendChild(tr);

            rowStates.push({
                id_ct: t.id_ct,
                checkbox: cb,
                inputNote,
                oldBayMauBy: t.baymau_by || null,
                oldNote: t.baymau_note || ""
            });
        });

        table.appendChild(tbody);
        body.appendChild(table);
        popup.appendChild(body);

        // Footer với nút lưu
        const footer = document.createElement("div");
        Object.assign(footer.style, {
            padding: "6px 10px",
            backgroundColor: "#f4b05e",
            textAlign: "right"
        });

        const info = document.createElement("span");
        info.textContent = "Hãy bày mẫu hoặc ghi chú lý do trước khi chấm công.";
        info.style.float = "left";
        footer.appendChild(info);

        const btnSave = document.createElement("button");
        btnSave.textContent = "Lưu & đóng";
        Object.assign(btnSave.style, {
            padding: "4px 12px",
            fontWeight: "bold",
            cursor: "pointer"
        });
        footer.appendChild(btnSave);

        popup.appendChild(footer);
        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        function cleanup(ok) {
            document.body.removeChild(overlay);
            resolve(ok);
        }

        // Không cho đóng bằng click nền / ESC
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                e.stopPropagation();
            }
        });
        document.addEventListener(
            "keydown",
            function escHandler(ev) {
                if (ev.key === "Escape") {
                    ev.preventDefault();
                    ev.stopPropagation();
                }
            },
            { capture: true, once: true }
        );

        closeBtn.addEventListener("click", async () => {
            // xử lý như nút Lưu & đóng
            await btnSave.click();
        });

        btnSave.addEventListener("click", async () => {
            // Chuẩn bị danh sách cần lưu
            const changes = [];
            for (const row of rowStates) {
                const newBayMauBy = row.checkbox.checked ? manv : null;
                const newNote = row.inputNote.value.trim();
                if (newBayMauBy !== row.oldBayMauBy || newNote !== row.oldNote) {
                    changes.push({
                        id_ct: row.id_ct,
                        newBayMauBy,
                        newNote,
                        oldBayMauBy: row.oldBayMauBy,
                        oldNote: row.oldNote
                    });
                }
            }

            // Nếu vẫn còn dòng chưa tích & chưa ghi chú -> nhắc và không đóng
            const unresolved = rowStates.filter((row) => {
                const isChecked = row.checkbox.checked;
                const noteVal = row.inputNote.value.trim();
                return !isChecked && !noteVal;
            });
            if (unresolved.length > 0) {
                alert(
                    "Vẫn còn sản phẩm chưa bày mẫu và chưa có ghi chú. Vui lòng xử lý hết trước khi đóng."
                );
                return;
            }

            const ok = await saveBayMauRowsFromChamCong(changes, { manv });
            if (!ok) {
                // lỗi lưu thì không đóng, caller sẽ xử lý tiếp
                return;
            }

            cleanup(true);
        });
    });
}

// Hàm ép người dùng xử lý bày mẫu trước khi chấm công
async function enforceBayMauBeforeChamCong({ diadiem }) {
    const manv = localStorage.getItem("manv");
    if (!manv) return;

    while (true) {
        const tasks = await fetchBayMauTasksForChamCong({ diadiem, manv });
        if (!tasks.length) {
            // Không còn nhiệm vụ nào → cho vào chấm công luôn
            return;
        }

        // Chỉ chặn theo các dòng chưa bày mẫu & chưa có ghi chú
        const needAction = tasks.filter((t) => !t.baymau_by && !t.baymau_note);
        if (!needAction.length) {
            // Tất cả dòng đã có người bày hoặc có ghi chú → cho qua
            return;
        }

        const ok = await showBayMauPopupChamCong(needAction, { diadiem, manv });
        if (!ok) {
            // Nếu lưu bị lỗi thì dừng, tránh kẹt vòng lặp
            return;
        }

        // Sau khi lưu thành công, vòng while sẽ gọi lại RPC,
        // nếu vẫn còn dòng chưa bày + chưa ghi chú thì lại hiện popup tiếp.
    }
}


// ====== HET NHẮC BAY MAU TRƯỚC KHI CHẤM CÔNG ======

// Ghi 1 dòng chấm công vào bảng chamcong_log
// Ghi 1 dòng chấm công (chuẩn server) + tự phạt nếu vi phạm
async function logChamCong({ manv, diadiem, su_kien, nguon = "manual", ghi_chu = null }) {
  const sp = await ensureSupabase();
  if (!sp) return false;

  const { data, error } = await sp.rpc("rpc_chamcong_log_v2", {
    p_manv: String(manv || "").trim().toUpperCase(),
    p_diadiem: String(diadiem || "").trim().toLowerCase(),
    p_su_kien: String(su_kien || "").trim().toUpperCase(),
    p_nguon: nguon,
    p_ghi_chu: ghi_chu
  });

  if (error) {
    console.error("Lỗi RPC chấm công:", error);
    alert("Lỗi chấm công, vui lòng thử lại.");
    return false;
  }

  if (data && data.ok === false) {
    console.error("RPC trả về lỗi:", data);
    alert("Lỗi chấm công: " + (data.error || "Không rõ lỗi"));
    return false;
  }

  // Optional: nếu có phát sinh phạt thì bạn có thể hiện thông báo nhẹ
  if (data?.phat_rows > 0 && Number(data?.phat) > 0) {
    console.log("Đã ghi phạt:", data);
    // bạn muốn popup cũng được, còn không thì để console
    // alert(`Bạn bị trừ ${Number(data.phat).toLocaleString("vi-VN")}đ: ${data.note}`);
  }

  return true;
}


// Tải toàn bộ log chấm công của hôm nay cho nhân viên & cơ sở
// Tải toàn bộ log chấm công của hôm nay cho nhân viên & cơ sở
async function loadTodayEvents(manv, diadiem) {
    const sp = await ensureSupabase();
    if (!sp) return [];

    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const { data, error } = await sp
        .from("chamcong_log")
        .select("su_kien, nguon, created_at")
        .eq("manv", manv)
        .eq("diadiem", diadiem)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Lỗi load log hôm nay:", error);
        return [];
    }

    return (data || []).map(row => ({
        su_kien: row.su_kien,
        nguon: row.nguon,
        createdAt: new Date(row.created_at)
    }));
}


/* ====== TỰ ĐỘNG DUYỆT CA KHI VÀO CA ====== */
/* ====== TỰ ĐỘNG DUYỆT CA KHI VÀO CA ====== */
async function approveShiftWhenCheckin({ manv, diadiem }) {
    const sp = await ensureSupabase();
    if (!sp) return;

    try {
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
        const nowTime = now.toTimeString().slice(0, 8);  // HH:MM:SS

        // Lấy các ca CHO_DUYỆT của NV hôm nay tại đúng cơ sở
        let { data, error } = await sp
            .from("lichlam_dangky")
            .select("*")
            .eq("manv", manv)
            .eq("diadiem", diadiem)
            .eq("ngay", todayStr)
            .eq("trang_thai", "CHO_DUYET")
            .order("gio_bat_dau", { ascending: true });

        if (error) {
            console.error("Lỗi đọc lichlam_dangky khi auto duyệt:", error);
            return;
        }

        if (!data || data.length === 0) {
            console.log("Không có ca CHO_DUYET nào hôm nay để auto duyệt.");
            return;
        }

        // Ưu tiên ca bao trùm thời điểm hiện tại
        let target = data.find(row =>
            row.gio_bat_dau && row.gio_ket_thuc &&
            row.gio_bat_dau <= nowTime && row.gio_ket_thuc >= nowTime
        );

        // Nếu không có ca đúng giờ → lấy ca CHO_DUYỆT đầu tiên
        if (!target) target = data[0];

        const { error: upErr } = await sp
            .from("lichlam_dangky")
            .update({
                trang_thai: "DA_DUYET",
                ghi_chu_admin: (target.ghi_chu_admin || "") + " (auto duyệt khi vào ca)",
                updated_at: new Date().toISOString()
            })
            .eq("id", target.id);

        if (upErr) {
            console.error("Lỗi update auto duyệt ca:", upErr);
            return;
        }

        console.log("ĐÃ AUTO DUYỆT ca id", target.id, "cho", manv, "tại", diadiem);
    } catch (e) {
        console.error("Lỗi ngoại lệ auto duyệt ca:", e);
    }
}


// ==== KIỂM TRA ĐÃ ĐĂNG KÝ CA HÔM NAY CHƯA ===============

async function hasRegisteredShiftToday(manv, diadiem) {
    const sp = await ensureSupabase();
    if (!sp) return false;

    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const { data, error } = await sp
        .from("lichlam_dangky")
        .select("id")
        .eq("manv", manv)
        .eq("diadiem", diadiem)
        .eq("loai_dang_ky", "CA_LAM")
        .eq("ngay", todayStr)
        .not("trang_thai", "in", "(HUY,TU_CHOI)");

    if (error) {
        console.error("Lỗi kiểm tra đăng ký ca hôm nay:", error);
        alert("Không kiểm tra được đăng ký ca hôm nay. Vui lòng thử lại hoặc báo quản lý.");
        return false;
    }

    return !!(data && data.length > 0);
}

// ==== LOGIC TÍNH GIỜ & HIỂN THỊ ========================

function formatTime(date) {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
}

function labelSuKien(su_kien) {
    switch (su_kien) {
        case "VAOCA": return "Vào ca";
        case "NTR": return "Nghỉ trưa";
        case "NTRD": return "Nghỉ trưa đến";
        case "NCH": return "Nghỉ chiều";
        case "NCHD": return "Nghỉ chiều đến";
        case "TANCA": return "Tan ca";
        case "AUTO_TANCA": return "Tan ca (tự động)";
        default: return su_kien;
    }
}

// Tính tổng giờ công từ danh sách sự kiện trong ngày
function computeTotalHours(events) {
    const sorted = [...events].sort((a, b) => a.createdAt - b.createdAt);

    const startEvents = new Set(["VAOCA", "NTRD", "NCHD"]);
    const endEvents = new Set(["NTR", "NCH", "TANCA", "AUTO_TANCA"]);

    let totalMs = 0;
    let currentStart = null;

    for (const ev of sorted) {
        if (startEvents.has(ev.su_kien)) {
            if (currentStart === null) {
                currentStart = ev.createdAt;
            } else {
                // nếu đang trong ca mà lại start mới -> reset mốc
                currentStart = ev.createdAt;
            }
        } else if (endEvents.has(ev.su_kien)) {
            if (currentStart !== null) {
                totalMs += ev.createdAt - currentStart;
                currentStart = null;
            }
        }
    }

    const hours = totalMs / (1000 * 60 * 60);
    return Math.round(hours * 100) / 100; // 2 chữ số sau dấu phẩy
}

function renderTodayLog() {
    const logList = document.getElementById("log-list");
    const logTotal = document.getElementById("log-total");
    if (!logList || !logTotal) return;

    logList.innerHTML = "";

    todayEvents
        .sort((a, b) => a.createdAt - b.createdAt)
        .forEach(ev => {
            const li = document.createElement("li");
            li.textContent = `Đã ghi: ${ev.su_kien} (${labelSuKien(ev.su_kien)}) lúc ${formatTime(ev.createdAt)}` +
                (ev.nguon === "auto-gps" ? " [tự động]" : "");
            logList.appendChild(li);
        });

    const total = computeTotalHours(todayEvents);
    logTotal.textContent = `Tổng công hôm nay: ${total.toFixed(2)} giờ`;
}

// Giờ giới hạn cho phép bắt đầu ca thứ 2 (22h)
const SHIFT_RESTART_LIMIT_HOUR = 22;

function getAllowedNextEvents() {
    // Chưa có sự kiện nào trong ngày -> chỉ được VÀO CA
    if (todayEvents.length === 0) {
        return ["VAOCA"];
    }

    const last = [...todayEvents]
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(-1)[0];
    const lastCode = last.su_kien;

    // Lấy giờ hiện tại để quyết định có cho phép VÀO CA lần 2 không
    const now = new Date();
    const currentHour = now.getHours();

    switch (lastCode) {
        case "VAOCA":
            // Sau VÀO CA: có thể nghỉ trưa, nghỉ chiều, hoặc tan ca luôn
            return ["NTR", "NCH", "TANCA"];

        case "NTR":
            // Sau NGHỈ TRƯA: chỉ được NGHỈ TRƯA ĐẾN hoặc TAN CA
            return ["NTRD", "TANCA"];

        case "NTRD":
            // Sau NGHỈ TRƯA ĐẾN: được NGHỈ CHIỀU hoặc TAN CA
            return ["NCH", "TANCA"];

        case "NCH":
            // Sau NGHỈ CHIỀU: chỉ được NGHỈ CHIỀU ĐẾN hoặc TAN CA
            return ["NCHD", "TANCA"];

        case "NCHD":
            // Sau NGHỈ CHIỀU ĐẾN: chỉ còn TAN CA
            return ["TANCA"];

        case "TANCA":
        case "AUTO_TANCA":
            // Đã tan ca xong 1 ca:
            // - Nếu TRƯỚC 22h: cho phép VÀO CA lại (ca 2)
            // - Nếu SAU 22h: không cho chấm thêm
            if (currentHour < SHIFT_RESTART_LIMIT_HOUR) {
                return ["VAOCA"];
            }
            return [];

        default:
            // Nếu vì lý do gì đó chuỗi lạ -> bắt buộc quay lại từ VÀO CA
            return ["VAOCA"];
    }
}

// Kiểm tra từ lần VAOCA gần nhất tới hiện tại đã có TANCA/AUTO_TANCA chưa
function hasTancaAfterLastVaoca() {
    if (todayEvents.length === 0) return false;

    const sorted = [...todayEvents].sort((a, b) => a.createdAt - b.createdAt);
    let lastVaocaIndex = -1;

    // Tìm VAOCA gần nhất
    for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i].su_kien === "VAOCA") {
            lastVaocaIndex = i;
            break;
        }
    }

    const startIndex = lastVaocaIndex === -1 ? 0 : lastVaocaIndex;

    for (let i = startIndex; i < sorted.length; i++) {
        const code = sorted[i].su_kien;
        if (code === "TANCA" || code === "AUTO_TANCA") {
            return true; // ca hiện tại đã tan ca
        }
    }

    return false;
}

function hasTancaToday() {
    return todayEvents.some(ev => ev.su_kien === "TANCA" || ev.su_kien === "AUTO_TANCA");
}

// Khoá nút tạm thời sau khi bấm để tránh click liên tiếp
function disableButtonTemporarily(btn, ms = BUTTON_LOCK_MS) {
    if (!btn) return;
    btn.disabled = true;
    const unlockAt = Date.now() + ms;
    btn.dataset.disabledUntil = String(unlockAt);

    setTimeout(() => {
        const stored = parseInt(btn.dataset.disabledUntil || "0", 10);
        if (Date.now() >= stored) {
            btn.disabled = false;
        }
    }, ms);
}

// ==== AUTO TANCA (GPS 3 lần liên tiếp) ==================

let lastInStore = true;
let outCount = 0;

function getTodayKeyForAuto(manv, diadiem) {
    const d = new Date();
    const dayStr = d.toISOString().slice(0, 10); // YYYY-MM-DD
    return `autoTanCa_${manv}_${diadiem}_${dayStr}`;
}

async function startAutoCheckLeave(manv, diadiem) {
    if (!manv) return;

    setInterval(async () => {
        const inStore = await checkInStore(diadiem);

        if (inStore) {
            lastInStore = true;
            outCount = 0;
            return;
        }

        // Không ở trong cửa hàng
        if (!lastInStore) {
            outCount++;
        } else {
            lastInStore = false;
            outCount = 1;
        }

        console.log("outCount =", outCount);

        if (outCount >= 5) {
            // Sau 3 lần check liên tiếp (3 * 3 phút = 9 phút) ngoài cửa hàng
            if (hasTancaToday()) {
                console.log("Đã có TANCA hôm nay, không ghi AUTO_TANCA nữa.");
                return;
            }

            const already = localStorage.getItem(getTodayKeyForAuto(manv, diadiem));
            if (already) {
                console.log("AUTO_TANCA hôm nay đã được ghi trong localStorage.");
                return;
            }

            const ok = await logChamCong({
                manv,
                diadiem,
                su_kien: "AUTO_TANCA",
                nguon: "auto-gps",
                ghi_chu: "Tự động tan ca do rời khỏi cửa hàng"
            });

            if (ok) {
                localStorage.setItem(getTodayKeyForAuto(manv, diadiem), "1");
                todayEvents.push({
                    manv,
                    diadiem,
                    su_kien: "AUTO_TANCA",
                    nguon: "auto-gps",
                    createdAt: new Date()
                });
                renderTodayLog();
                alert("Hệ thống ghi nhận TAN CA tự động do bạn đã rời khỏi cửa hàng.");
            }
        }
    }, AUTO_CHECK_INTERVAL_MS);
}

// ==== GIAO DIỆN CHẤM CÔNG =============================

function attachChamCongButtons(diadiem) {
    const manv = localStorage.getItem("manv");
    if (!manv) return;

    const statusManv = document.getElementById("status-manv");
    const statusMsg = document.getElementById("status-msg");
    statusManv.textContent = manv;

    const btnVaoca = document.getElementById("btn-vaoca");
    const btnNtr = document.getElementById("btn-ntr");
    const btnNtrd = document.getElementById("btn-ntrd");
    const btnNch = document.getElementById("btn-nch");
    const btnNchd = document.getElementById("btn-nchd");
    const btnTanca = document.getElementById("btn-tanca");

    // Hàm xử lý bấm nút chấm công, chống double-click / nhiều listener
    // Hàm xử lý bấm nút chấm công, chống double-click / nhiều listener
    async function handleClick(su_kien, btn) {
        if (!btn) return;

        // Nếu nút đang xử lý 1 lần bấm rồi thì bỏ qua (chống nhân đôi khi có 2 listener)
        if (btn.dataset.working === "1") {
            return;
        }
        btn.dataset.working = "1";

        try {
            // 1) Luôn load lại log hôm nay mới nhất từ DB
            //    -> chống mở nhiều tab / nhiều thiết bị cùng chấm công.
            todayEvents = await loadTodayEvents(manv, diadiem);

            // 2) Kiểm tra thứ tự sự kiện hợp lý dựa trên log mới nhất
            const allowed = getAllowedNextEvents();
            if (!allowed.includes(su_kien)) {
                alert("Thứ tự chấm công không hợp lý. Vui lòng chấm đúng quy trình trong ngày.");
                return;
            }

            // 3) Các kiểm tra riêng cho VÀO CA
            if (su_kien === "VAOCA") {
                // 3a. Nếu đã từng VÀO CA hôm nay mà ca gần nhất chưa TAN CA -> không cho vào ca mới
                const hasAnyVaoca = todayEvents.some(ev => ev.su_kien === "VAOCA");
                if (hasAnyVaoca && !hasTancaAfterLastVaoca()) {
                    alert(
                        "Ca trước của bạn chưa TAN CA, không thể vào ca mới.\n" +
                        "Hãy nhờ quản lý kiểm tra / sửa lại chấm công trước."
                    );
                    return;
                }

                // 3b. Bắt buộc phải có ca đã đăng ký trong lichlam_dangky
                const hasShift = await hasRegisteredShiftToday(manv, diadiem);
                if (!hasShift) {
                    alert("Bạn chưa đăng ký ca hôm nay. Vui lòng đăng ký ca trước khi chấm công.");
                    return;
                }

                // 3c. Nếu ca hôm nay đang ở trạng thái CHO_DUYET -> auto duyệt
                await approveShiftWhenCheckin({ manv, diadiem });
            }

            // 4) MỖI LẦN CHẤM CÔNG ĐỀU PHẢI XỬ LÝ BÀY MẪU (NẾU CÒN)
            //    Nếu còn dòng chưa bày mẫu & chưa ghi chú -> popup sẽ chặn không cho qua.
            // Chỉ nhắc bày mẫu cho các sự kiện KHÁC VÀO CA
            
            if (su_kien !== "VAOCA") {
                await enforceBayMauBeforeChamCong({ diadiem });
            }

            // 5) Kiểm tra GPS: phải đứng trong khu vực cửa hàng
            const okInStore = await ensureInStoreBeforeAction(diadiem);
            if (!okInStore) return;

            // 6) Ghi log chấm công
            const ok = await logChamCong({
                manv,
                diadiem,
                su_kien,
                nguon: "manual"
            });

            if (ok) {
                const now = new Date();
                todayEvents.push({
                    manv,
                    diadiem,
                    su_kien,
                    nguon: "manual",
                    createdAt: now
                });
                if (statusMsg) {
                    statusMsg.textContent = `Đã ghi: ${su_kien} lúc ${formatTime(now)}`;
                }
                renderTodayLog();

                // Khoá nút trong 5 phút như cũ
                disableButtonTemporarily(btn);
            }
        } finally {
            // Cho phép lần bấm tiếp theo (tránh kẹt nếu validate fail / GPS fail)
            btn.dataset.working = "0";
        }
    }


    btnVaoca.addEventListener("click", () => handleClick("VAOCA", btnVaoca));
    btnNtr.addEventListener("click", () => handleClick("NTR", btnNtr));
    btnNtrd.addEventListener("click", () => handleClick("NTRD", btnNtrd));
    btnNch.addEventListener("click", () => handleClick("NCH", btnNch));
    btnNchd.addEventListener("click", () => handleClick("NCHD", btnNchd));
    btnTanca.addEventListener("click", () => handleClick("TANCA", btnTanca));

    // Render log ngay khi gắn nút
    renderTodayLog();
}

// Khởi tạo sau khi đăng nhập thành công
async function initChamCong(diadiem) {
    supabase = window.supabase;
    if (!supabase) {
        console.error("Supabase client chưa sẵn sàng!");
        alert("Không khởi tạo được Supabase, vui lòng tải lại trang.");
        return;
    }

    const loginContainer = document.getElementById("login-container");
    const appContainer = document.getElementById("app-container");
    if (loginContainer) loginContainer.style.display = "none";
    if (appContainer) appContainer.style.display = "";

    const manv = localStorage.getItem("manv");
    if (!manv) {
        alert("Không tìm thấy mã nhân viên trong phiên đăng nhập, vui lòng đăng nhập lại.");
        location.reload();
        return;
    }

    // Tải log hôm nay và hiển thị
    todayEvents = await loadTodayEvents(manv, diadiem);
    attachChamCongButtons(diadiem);

    // Bắt đầu auto check rời khỏi cửa hàng
    startAutoCheckLeave(manv, diadiem);
}

// ================== KHỞI ĐỘNG ==================
document.addEventListener("DOMContentLoaded", () => {
    const diadiem = getDiaDiemFromPath(); // cs1 / cs2
    const loginApiPath = diadiem === "cs1" ? "/api/login-cs1" : "/api/login-cs2";

    khoiTaoDangNhapDungChung({
        loginContainerId: 'login-container',
        appContainerId: 'app-container',
        macDinhDiaDiem: diadiem,
        tuDongKhoaCoSo: true,
        loginApiPath,
        onLoginSuccess: async () => {
            // Không kiểm tra bày mẫu khi đăng nhập nữa
            await initChamCong(diadiem);
        }
    });
});






