// scripts/chamcong.js

// Dùng chung cơ chế đăng nhập như trang Up ảnh nhanh
import { khoiTaoDangNhapDungChung } from './authModule.js';
import {
    playAlertBeep,
    setupBeepUnlockOnce
} from './soundBeep.js';

// Supabase client sẽ được gán vào window.supabase sau khi đăng nhập
let supabase = null;
let currentAssignedTask = null;
let currentNormalTask = null;
let currentUnplannedTask = null;
let qlnvChamCongChannel = null;
let qlnvNotificationChannel = null;
let lastChamCongNotificationId = 0;

// ===== CẤU HÌNH CƠ SỞ (tọa độ) =====
const CS1_COORD = { lat: 21.552722, lng: 105.842583 };
const CS2_COORD = { lat: 21.5843348, lng: 105.8343116 };
const MAX_DISTANCE_M = 17000;                // bán kính cho phép (m)
const AUTO_CHECK_INTERVAL_MS = 1000000;     // 3 phút
const BUTTON_LOCK_MS = 5 * 60 * 1000;      // 5 phút khoá nút sau khi bấm

// Bộ nhớ log chấm công trong ngày hiện tại (sau khi load từ DB)
let todayEvents = []; // mỗi phần tử: { su_kien, createdAt: Date, nguon }

function isMobileDevice() {
    //const ua = navigator.userAgent || navigator.vendor || window.opera;
    //return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
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

function playNotifySound() {
    playAlertBeep();
}

function showTaskPopup(title, body) {
    const div = document.createElement("div");
    div.style.cssText = `
        position: fixed;
        left: 12px;
        right: 12px;
        top: 12px;
        background: #111827;
        color: #fff;
        padding: 14px;
        border-radius: 10px;
        z-index: 99999;
        font-size: 15px;
        box-shadow: 0 8px 30px rgba(0,0,0,.25);
    `;
    div.innerHTML = `<b>${title || "Thông báo"}</b><br>${body || ""}`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 8000);
}

async function requestBrowserNotificationPermission() {
    if (!("Notification" in window)) return false;

    if (Notification.permission === "granted") return true;

    if (Notification.permission !== "denied") {
        const p = await Notification.requestPermission();
        return p === "granted";
    }

    return false;
}

function showBrowserNotification(title, body) {
    if (!("Notification" in window)) return;

    if (Notification.permission === "granted") {
        new Notification(title || "Thông báo", {
            body: body || "",
            icon: "/icons/icon-192.png"
        });
    }
}

async function markNotificationRead(id) {
    const sp = await ensureSupabase();
    if (!sp || !id) return;

    await sp
        .schema("qlnv")
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);
}

async function createChamCongNotification({
    diadiem,
    manv,
    title,
    body,
    type = "staff_event",
    refType = "chamcong"
}) {
    const sp = await ensureSupabase();
    if (!sp) return;

    const { error } = await sp
        .schema("qlnv")
        .from("notifications")
        .insert({
            diadiem,
            target_manv: null,
            target_role: "admin",
            title,
            body,
            type,
            ref_type: refType,
            is_read: false
        });

    if (error) {
        console.error("Lỗi tạo notification từ chấm công:", error);
    }
}

function setupNotificationRealtimeChamCong({ manv, diadiem }) {
    if (!supabase || !manv) return;

    const myManv = String(manv || "").trim().toUpperCase();

    if (qlnvNotificationChannel) {
        supabase.removeChannel(qlnvNotificationChannel);
        qlnvNotificationChannel = null;
    }

    qlnvNotificationChannel = supabase
        .channel(`qlnv-notifications-${diadiem}-${myManv}-${Date.now()}`)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "qlnv",
                table: "notifications"
            },
            async (payload) => {
                console.log("Đã nhận notification realtime:", payload);

                const n = payload.new;
                if (!n) return;

                const target = String(n.target_manv || "").trim().toUpperCase();
                const rowDiadiem = String(n.diadiem || "").trim().toLowerCase();

                if (target !== myManv) return;
                if (rowDiadiem !== String(diadiem).toLowerCase()) return;
                if (n.id === lastChamCongNotificationId) return;

                lastChamCongNotificationId = n.id;

                console.log("Notification đúng nhân viên:", n);

                playNotifySound();
                showTaskPopup(n.title, n.body);
                showBrowserNotification(n.title, n.body);

                await markNotificationRead(n.id);
                await loadMyCurrentTask({ manv: myManv, diadiem });
            }
        )
        .subscribe((status) => {
            console.log("Notification realtime chấm công:", status);
        });

    window.testQlnvBeep = () => {
        playNotifySound();
        showTaskPopup("Test âm báo", "Nếu thấy popup này thì phần popup/beep hoạt động.");
    };
}

// Check trước khi chấm công một sự kiện
async function ensureInStoreBeforeAction(diadiem) {
    // Chỉ cho phép trên mobile
    //if (!isMobileDevice()) {
    //  alert("Ứng dụng chấm công chỉ được dùng trên điện thoại.");
    // return false;
    //}
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

async function insertTaskLog({
    task,
    action,
    oldStatus = null,
    newStatus = null,
    source = "chamcong",
    note = null
}) {
    const sp = await ensureSupabase();
    if (!sp || !task) return;

    const { error } = await sp
        .schema("qlnv")
        .from("task_logs")
        .insert({
            task_id: task.id || null,
            manv: task.assigned_to || localStorage.getItem("manv") || null,
            tennv: task.assigned_name || localStorage.getItem("tennv") || null,
            diadiem: task.diadiem || getDiaDiemFromPath(),
            action,
            old_status: oldStatus,
            new_status: newStatus,
            task_type: task.task_type || null,
            area: task.area || null,
            source,
            note
        });

    if (error) {
        console.error("Lỗi ghi task_logs:", error);
    }
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

async function compressImageForBayMau(file, maxWidth = 900, quality = 0.72) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);

            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        reject(new Error("Không nén được ảnh"));
                        return;
                    }

                    const newFile = new File(
                        [blob],
                        "baymau.jpg",
                        { type: "image/jpeg" }
                    );

                    resolve(newFile);
                },
                "image/jpeg",
                quality
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Không đọc được ảnh"));
        };

        img.src = url;
    });
}

function formatBayMauTime(d = new Date()) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function fileToImageBayMau(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Không đọc được ảnh"));
        };

        img.src = url;
    });
}

async function resizeBayMauImageFixed(file, quality = 0.62, masp = "", manv = "", diadiem = "") {
    const img = await fileToImageBayMau(file);

    const isLandscape = img.width >= img.height;
    const targetW = isLandscape ? 480 : 360;
    const targetH = isLandscape ? 360 : 480;

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetW, targetH);

    const scale = Math.min(targetW / img.width, targetH / img.height);
    const drawW = Math.round(img.width * scale);
    const drawH = Math.round(img.height * scale);
    const dx = Math.round((targetW - drawW) / 2);
    const dy = Math.round((targetH - drawH) / 2);

    ctx.drawImage(img, dx, dy, drawW, drawH);

    const lines = [
        `MÃ SP: ${String(masp || "").toUpperCase()}`,
        `THỜI GIAN: ${formatBayMauTime(new Date())}`,
        `NHÂN VIÊN: ${String(manv || "").toUpperCase()}`,
        `CƠ SỞ: ${String(diadiem || "").toUpperCase()}`
    ];

    const fontSize = Math.max(15, Math.round(Math.min(targetW, targetH) * 0.045));
    const pad = 10;
    const lineH = Math.round(fontSize * 1.35);
    const boxH = lineH * lines.length + pad * 2;
    const boxW = Math.round(targetW * 0.82);
    const boxX = 8;
    const boxY = targetH - boxH - 8;

    ctx.fillStyle = "rgba(0,0,0,0.58)";
    ctx.fillRect(boxX, boxY, boxW, boxH);

    ctx.font = `700 ${fontSize}px Arial, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffeb3b";
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.lineWidth = 2;

    lines.forEach((txt, i) => {
        const x = boxX + pad;
        const y = boxY + pad + i * lineH;
        ctx.strokeText(txt, x, y);
        ctx.fillText(txt, x, y);
    });

    return await new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error("Không nén được ảnh"));
                    return;
                }
                resolve(blob);
            },
            "image/jpeg",
            quality
        );
    });
}

async function saveBayMauRowsFromChamCong(changes, { manv, diadiem }) {
    if (!changes.length) return true;

    const sp = await ensureSupabase();
    if (!sp) return false;

    for (const row of changes) {
        const updates = {};

        if (row.newBayMauBy !== row.oldBayMauBy) {
            updates.baymau_by = row.newBayMauBy;
            updates.baymau_at = row.newBayMauBy ? new Date().toISOString() : null;
        }

        if (row.newNote !== row.oldNote) {
            updates.baymau_note = row.newNote;
        }

        if (row.imageFile) {
            let uploadBlob;

            try {
                uploadBlob = await resizeBayMauImageFixed(
                    row.imageFile,
                    0.62,
                    row.masp || "",
                    manv,
                    diadiem
                );
            } catch (e) {
                console.error("Lỗi resize ảnh bày mẫu:", e);
                alert("Không xử lý được ảnh vừa chụp, vui lòng chụp lại.");
                return false;
            }

            const filePath = `${diadiem}/${manv}/${new Date().toISOString().slice(0, 10)}/${row.id_ct}_${Date.now()}.jpg`;

            const { error: uploadError } = await sp.storage
                .from("ANHBAYMAU")
                .upload(filePath, uploadBlob, {
                    cacheControl: "3600",
                    upsert: true,
                    contentType: "image/jpeg"
                });

            if (uploadError) {
                console.error("Lỗi upload ảnh bày mẫu:", uploadError);
                alert("Lỗi lưu ảnh bày mẫu: " + (uploadError.message || "Không rõ lỗi"));
                return false;
            }

            updates.baymau_image_path = filePath;
            updates.baymau_image_at = new Date().toISOString();
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
        const headers = ["bày mẫu", "ảnh mẫu", "mã sp", "nv bán", "GHI CHÚ"];
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

            const tdImage = document.createElement("td");
            tdImage.style.textAlign = "center";
            tdImage.style.padding = "4px";

            const fileInput = document.createElement("input");
            fileInput.type = "file";
            fileInput.accept = "image/*";
            fileInput.capture = "environment";
            fileInput.style.display = "none";

            const btnPhoto = document.createElement("button");
            btnPhoto.type = "button";
            btnPhoto.textContent = "Chụp ảnh";
            btnPhoto.style.padding = "4px 8px";
            btnPhoto.style.fontSize = "13px";
            btnPhoto.style.display = cb.checked ? "" : "none";

            const photoStatus = document.createElement("div");
            photoStatus.textContent = "";
            photoStatus.style.fontSize = "12px";
            photoStatus.style.color = "green";

            btnPhoto.addEventListener("click", () => {
                fileInput.click();
            });

            fileInput.addEventListener("change", () => {
                if (fileInput.files && fileInput.files[0]) {
                    photoStatus.textContent = "Đã chọn ảnh";
                } else {
                    photoStatus.textContent = "";
                }
            });

            cb.addEventListener("change", () => {
                if (cb.checked && t.can_chup_anh_baymau) {
                    btnPhoto.style.display = "";
                    setTimeout(() => fileInput.click(), 50);
                } else {
                    btnPhoto.style.display = "none";
                }

                if (!cb.checked || !t.can_chup_anh_baymau) {
                    fileInput.value = "";
                    photoStatus.textContent = "";
                }
            });

            tdImage.appendChild(btnPhoto);
            tdImage.appendChild(fileInput);
            tdImage.appendChild(photoStatus);
            tr.appendChild(tdCheck);
            tr.appendChild(tdImage);

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
                masp: t.masp || "",
                canChupAnh: !!t.can_chup_anh_baymau,
                checkbox: cb,
                inputNote,
                fileInput,
                oldBayMauBy: t.baymau_by || null,
                oldNote: t.baymau_note || "",
                oldImagePath: t.baymau_image_path || ""
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
                const imageFile = row.fileInput?.files?.[0] || null;

                if (newBayMauBy !== row.oldBayMauBy || newNote !== row.oldNote || imageFile) {
                    changes.push({
                        id_ct: row.id_ct,
                        masp: row.masp || "",
                        newBayMauBy,
                        newNote,
                        oldBayMauBy: row.oldBayMauBy,
                        oldNote: row.oldNote,
                        imageFile
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

            const missingPhoto = rowStates.filter((row) => {
                const isChecked = row.checkbox.checked;
                const hasNewPhoto = row.fileInput?.files && row.fileInput.files[0];
                const hasOldPhoto = !!row.oldImagePath;
                return row.canChupAnh && isChecked && !hasNewPhoto && !hasOldPhoto;
            });

            if (missingPhoto.length > 0) {
                alert("Bạn đã tick bày mẫu nhưng chưa chụp ảnh. Vui lòng chụp ảnh mẫu trước khi lưu.");
                return;
            }

            const ok = await saveBayMauRowsFromChamCong(changes, { manv, diadiem });
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

    const { data, error } = await sp.rpc("rpc_chamcong_log_v6", {
        p_manv: String(manv || "").trim().toUpperCase(),
        p_diadiem: String(diadiem || "").trim().toLowerCase(),
        p_su_kien: String(su_kien || "").trim().toUpperCase(),
        p_nguon: nguon,
        p_ghi_chu: ghi_chu
    });
    console.log("RPC DATA =", data);
    console.log("RPC ERROR =", error);

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
            .eq("loai_dang_ky", "CA_LAM")
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
                nguoi_duyet: "AUTO",
                thoi_gian_duyet: new Date().toISOString(),
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
        .eq("ngay", todayStr)
        .eq("loai_dang_ky", "CA_LAM")
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

async function updateQlnvStaffStatus({
    manv,
    diadiem,
    status,
    lastAction = null,
    cleanupMinutes = null
}) {
    const sp = await ensureSupabase();
    if (!sp || !manv) return false;

    const nowIso = new Date().toISOString();

    let cleanupUntil = null;

    if (cleanupMinutes) {
        const d = new Date();
        d.setMinutes(d.getMinutes() + cleanupMinutes);
        cleanupUntil = d.toISOString();
    }

    const payload = {
        manv: String(manv || "").trim().toUpperCase(),
        diadiem,
        current_status: status,
        last_action: lastAction,
        status_started_at: nowIso,
        cleanup_until: cleanupUntil,
        updated_by: manv,
        updated_at: nowIso
    };

    if (status === "free" || status === "off" || status === "break") {
        payload.current_task_id = null;
        payload.current_invoice = null;
    }

    const { error } = await sp
        .schema("qlnv")
        .from("staff_status")
        .upsert(payload, {
            onConflict: "manv"
        });

    if (error) {
        console.error("Lỗi cập nhật qlnv.staff_status:", error);
        alert("Không cập nhật được trạng thái làm việc.");
        return false;
    }

    return true;
}

function renderWorkStatusText(status) {
    const el = document.getElementById("work-status-text");
    if (!el) return;

    const map = {
        free: "Đang rảnh / có thể nhận việc",
        serving_customer: "Đang phục vụ khách",
        cleanup_after_sale: "Đang dọn dẹp sau bán",
        doing_task: "Đang làm task",
        break: "Đang nghỉ",
        off: "Đã tan ca / không nhận việc"
    };

    el.textContent = map[status] || status || "Chưa xác định";
}

async function loadMyCurrentTask({ manv, diadiem }) {
    const sp = await ensureSupabase();
    if (!sp || !manv) return;

    const { data, error } = await sp
        .schema("qlnv")
        .from("tasks")
        .select("*")
        .eq("diadiem", diadiem)
        .eq("assigned_to", String(manv).toUpperCase())
        .in("status", ["pending", "in_progress"])
        .order("is_unplanned", { ascending: false })
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Lỗi load task nhân viên:", error);
        return;
    }

    currentAssignedTask = null;
    currentNormalTask = null;
    currentUnplannedTask = null;

    (data || []).forEach(t => {
        if (t.is_unplanned) {
            if (!currentUnplannedTask) {
                currentUnplannedTask = t;
            }
        } else {
            if (!currentNormalTask) {
                currentNormalTask = t;
            }
        }
    });

    currentAssignedTask =
        currentUnplannedTask ||
        currentNormalTask ||
        null;

    renderMyTask();
}

function renderMyTask() {
    const box = document.getElementById("my-task-box");
    const btnStart = document.getElementById("btn-my-task-start");
    const btnDone = document.getElementById("btn-my-task-done");
    const pausedBox = document.getElementById("paused-task-box");
    const btnResume = document.getElementById("btn-my-task-resume");

    if (!box) return;

    if (!currentAssignedTask) {
        box.innerHTML = "Chưa có công việc được giao.";
        if (btnStart) btnStart.disabled = true;
        if (btnDone) btnDone.disabled = true;
        if (btnResume) btnResume.disabled = true;

        if (pausedBox) {
            pausedBox.style.display = "none";
            pausedBox.innerHTML = "";
        }

        return;
    }

    box.innerHTML = `
    <b>${currentAssignedTask.title || ""}</b><br>
    ${currentAssignedTask.description || ""}<br>
    Trạng thái: <b>${currentAssignedTask.status}</b><br>
    Thời gian làm: <b id="my-task-timer">00:00:00</b>
    ${currentAssignedTask.paused_at ? "<br><b style='color:#e53935'>Đang tạm dừng vì phục vụ khách</b>" : ""}
`;

    startMyTaskTimer();
    renderPausedNormalTask();

    if (btnStart) {
        btnStart.disabled = currentAssignedTask.status !== "pending";
    }

    if (btnDone) {
        btnDone.disabled = currentAssignedTask.status !== "in_progress";
    }

    if (btnResume) {
        btnResume.disabled = !(
            currentAssignedTask.status === "in_progress" &&
            currentAssignedTask.paused_at
        );
    }
}

function renderPausedNormalTask() {
    const pausedBox = document.getElementById("paused-task-box");
    if (!pausedBox) return;

    if (
        !currentUnplannedTask ||
        !currentNormalTask ||
        !currentNormalTask.paused_at
    ) {
        pausedBox.style.display = "none";
        pausedBox.innerHTML = "";
        return;
    }

    pausedBox.style.display = "block";

    pausedBox.innerHTML = `
        <b>Task đang tạm dừng</b><br>
        ${currentNormalTask.title || ""} <b style="color:#e53935;">tạm dừng</b><br>
        Thời gian làm: <b id="paused-normal-task-timer">00:00:00</b>
    `;

    renderPausedNormalTaskTimer();
}

function renderPausedNormalTaskTimer() {
    const el = document.getElementById("paused-normal-task-timer");
    if (!el || !currentNormalTask?.started_at) return;

    const startedAt = new Date(currentNormalTask.started_at).getTime();
    const pausedAt = currentNormalTask.paused_at
        ? new Date(currentNormalTask.paused_at).getTime()
        : Date.now();

    const pausedSeconds = Number(currentNormalTask.paused_seconds || 0);

    const diff = Math.max(
        0,
        Math.floor((pausedAt - startedAt) / 1000) - pausedSeconds
    );

    const h = String(Math.floor(diff / 3600)).padStart(2, "0");
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
    const s = String(diff % 60).padStart(2, "0");

    el.textContent = `${h}:${m}:${s}`;
}

let myTaskTimerInterval = null;

function startMyTaskTimer() {
    const el = document.getElementById("my-task-timer");

    if (myTaskTimerInterval) {
        clearInterval(myTaskTimerInterval);
        myTaskTimerInterval = null;
    }

    const task = currentAssignedTask;

    if (!el || !task || !task.started_at) return;

    function update() {
        if (!task || !task.started_at) return;

        const startedAt = new Date(task.started_at).getTime();
        const pausedSeconds = Number(task.paused_seconds || 0);

        let now = Date.now();

        if (task.paused_at) {
            now = new Date(task.paused_at).getTime();
        }

        const diff = Math.max(
            0,
            Math.floor((now - startedAt) / 1000) - pausedSeconds
        );

        const h = String(Math.floor(diff / 3600)).padStart(2, "0");
        const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
        const s = String(diff % 60).padStart(2, "0");

        el.textContent = `${h}:${m}:${s}`;
    }

    update();

    if (!task.paused_at) {
        myTaskTimerInterval = setInterval(update, 1000);
    }
}

async function updateMyTaskStatus(newStatus) {
    const sp = await ensureSupabase();
    if (!sp || !currentAssignedTask) return;

    const manv = localStorage.getItem("manv");
    const diadiem = getDiaDiemFromPath();

    let finalPausedSeconds = Number(currentAssignedTask.paused_seconds || 0);

    if (newStatus === "done" && currentAssignedTask.paused_at) {
        const pausedAt = new Date(currentAssignedTask.paused_at).getTime();
        finalPausedSeconds += Math.max(0, Math.floor((Date.now() - pausedAt) / 1000));
    }

    const updateData = {
        status: newStatus
    };

    if (newStatus === "in_progress") {
        updateData.started_at = new Date().toISOString();
    }

    if (newStatus === "done") {
        updateData.completed_at = new Date().toISOString();
        updateData.paused_at = null;
        updateData.paused_seconds = finalPausedSeconds;
    }

    const { error } = await sp
        .schema("qlnv")
        .from("tasks")
        .update(updateData)
        .eq("id", currentAssignedTask.id);

    if (error) {
        console.error("Lỗi cập nhật task:", error);
        alert("Không cập nhật được công việc.");
        return;
    }

    await insertTaskLog({
        task: currentAssignedTask,
        action:
            newStatus === "in_progress"
                ? "task_started"
                : newStatus === "done"
                    ? "task_done"
                    : "task_status_changed",
        oldStatus: currentAssignedTask.status || null,
        newStatus,
        source: "chamcong",
        note: "Nhân viên cập nhật task từ trang chấm công"
    });

    if (newStatus === "in_progress") {
        await updateQlnvStaffStatus({
            manv,
            diadiem,
            status: "doing_task",
            lastAction: "Nhân viên bắt đầu task"
        });
        renderWorkStatusText("doing_task");
    }

    if (newStatus === "done") {
        await updateQlnvStaffStatus({
            manv,
            diadiem,
            status: "free",
            lastAction: "Nhân viên hoàn thành task"
        });
        renderWorkStatusText("free");
    }

    await loadMyCurrentTask({ manv, diadiem });
}

function setupChamCongRealtime({ manv, diadiem }) {
    if (!supabase || !manv) return;

    if (qlnvChamCongChannel) {
        supabase.removeChannel(qlnvChamCongChannel);
        qlnvChamCongChannel = null;
    }

    qlnvChamCongChannel = supabase
        .channel(`qlnv-chamcong-${diadiem}-${manv}`)
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "qlnv",
                table: "tasks",
                filter: `assigned_to=eq.${String(manv).toUpperCase()}`
            },
            async () => {
                await loadMyCurrentTask({ manv, diadiem });
            }
        )
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "qlnv",
                table: "staff_status",
                filter: `manv=eq.${String(manv).toUpperCase()}`
            },
            async () => {
                await loadMyCurrentTask({ manv, diadiem });
            }
        )
        .subscribe();
}

async function pauseCurrentTaskIfDoing() {
    const sp = await ensureSupabase();
    if (!sp || !currentAssignedTask) return;

    if (currentAssignedTask.status !== "in_progress") return;
    if (currentAssignedTask.paused_at) return;

    const { error } = await sp
        .schema("qlnv")
        .from("tasks")
        .update({
            paused_at: new Date().toISOString()
        })
        .eq("id", currentAssignedTask.id);

    if (error) {
        console.error("Lỗi tạm dừng task:", error);
        return;
    }

    await insertTaskLog({
        task: currentAssignedTask,
        action: "task_paused",
        oldStatus: "in_progress",
        newStatus: "in_progress",
        source: "chamcong",
        note: "Tạm dừng task do phục vụ khách / dọn dẹp"
    });

    currentAssignedTask.paused_at = new Date().toISOString();
    renderMyTask();
}

async function resumeCurrentTaskIfPaused() {
    const sp = await ensureSupabase();
    if (!sp || !currentAssignedTask) return;

    if (currentAssignedTask.status !== "in_progress") return;
    if (!currentAssignedTask.paused_at) return;

    const pausedAt = new Date(currentAssignedTask.paused_at).getTime();
    const addSeconds = Math.max(0, Math.floor((Date.now() - pausedAt) / 1000));

    const oldPausedSeconds = Number(currentAssignedTask.paused_seconds || 0);

    const { error } = await sp
        .schema("qlnv")
        .from("tasks")
        .update({
            paused_at: null,
            paused_seconds: oldPausedSeconds + addSeconds
        })
        .eq("id", currentAssignedTask.id);

    if (error) {
        console.error("Lỗi tiếp tục task:", error);
        return;
    }

    await insertTaskLog({
        task: currentAssignedTask,
        action: "task_resumed",
        oldStatus: "in_progress",
        newStatus: "in_progress",
        source: "chamcong",
        note: "Nhân viên quay lại làm tiếp task"
    });

    currentAssignedTask.paused_at = null;
    currentAssignedTask.paused_seconds = oldPausedSeconds + addSeconds;
    renderMyTask();
}

async function resumeTaskAndSetDoing() {
    const manv = localStorage.getItem("manv");
    const diadiem = getDiaDiemFromPath();

    await resumeCurrentTaskIfPaused();

    const ok = await updateQlnvStaffStatus({
        manv,
        diadiem,
        status: currentAssignedTask?.status === "in_progress" ? "doing_task" : "free",
        lastAction: currentAssignedTask?.status === "in_progress"
            ? "Nhân viên làm tiếp task"
            : "Nhân viên báo rảnh"
    });

    if (ok) {
        renderWorkStatusText(
            currentAssignedTask?.status === "in_progress" ? "doing_task" : "free"
        );
    }

    await loadMyCurrentTask({ manv, diadiem });
}

function openUnplannedModal() {
    const modal = document.getElementById("unplanned-modal");
    const noteEl = document.getElementById("unplanned-task-note");

    if (noteEl) noteEl.value = "";
    if (modal) modal.style.display = "flex";

    setTimeout(() => noteEl?.focus(), 100);
}

function closeUnplannedModal() {
    const modal = document.getElementById("unplanned-modal");
    if (modal) modal.style.display = "none";
}

async function startUnplannedTask() {
    const sp = await ensureSupabase();

    const manv = localStorage.getItem("manv");
    const diadiem = getDiaDiemFromPath();

    if (!manv) return;

    const noteEl =
        document.getElementById("unplanned-task-note");

    const note =
        String(noteEl?.value || "").trim();

    if (!note) {
        alert("Vui lòng nhập mô tả nhiệm vụ bất thường.");
        return;
    }

    if (
        currentAssignedTask &&
        currentAssignedTask.is_unplanned
    ) {
        alert("Đang có nhiệm vụ bất thường.");
        return;
    }

    if (
        currentAssignedTask &&
        currentAssignedTask.status === "in_progress"
    ) {
        await pauseCurrentTaskIfDoing();
    }

    const { data, error } = await sp
        .schema("qlnv")
        .from("tasks")
        .insert({
            title: "Nhiệm vụ bất thường",
            description: note,
            task_type: "bat_thuong",
            diadiem,
            assigned_to: String(manv).toUpperCase(),
            assigned_name:
                localStorage.getItem("tennv") || manv,
            priority: 1,
            status: "in_progress",
            started_at: new Date().toISOString(),
            estimated_minutes: 10,
            created_by: String(manv).toUpperCase(),
            is_unplanned: true,
            parent_task_id:
                currentNormalTask?.id || null
        })
        .select()
        .single();

    if (error) {
        console.error(error);
        alert("Không tạo được nhiệm vụ bất thường.");
        return;
    }

    currentUnplannedTask = data;
    currentAssignedTask = data;

    await insertTaskLog({
        task: data,
        action: "unplanned_task_started",
        oldStatus: null,
        newStatus: "in_progress",
        source: "chamcong",
        note: note
    });

    await updateQlnvStaffStatus({
        manv,
        diadiem,
        status: "doing_task",
        lastAction: "Làm nhiệm vụ bất thường"
    });

    renderWorkStatusText("doing_task");

    noteEl.value = "";
    closeUnplannedModal();

    await loadMyCurrentTask({ manv, diadiem });
}

async function finishUnplannedTask() {
    const sp = await ensureSupabase();

    const manv = localStorage.getItem("manv");
    const diadiem = getDiaDiemFromPath();

    if (!currentUnplannedTask) {
        alert("Không có nhiệm vụ bất thường.");
        return;
    }

    const { error } = await sp
        .schema("qlnv")
        .from("tasks")
        .update({
            status: "done",
            completed_at: new Date().toISOString()
        })
        .eq("id", currentUnplannedTask.id);

    if (error) {
        console.error(error);
        alert("Không hoàn thành được nhiệm vụ.");
        return;
    }

    await insertTaskLog({
        task: currentUnplannedTask,
        action: "unplanned_task_done",
        oldStatus: "in_progress",
        newStatus: "done",
        source: "chamcong",
        note: "Hoàn thành nhiệm vụ bất thường"
    });

    if (
        currentNormalTask &&
        currentNormalTask.status === "in_progress"
    ) {
        currentAssignedTask = currentNormalTask;

        await resumeTaskAndSetDoing();
    } else {
        await updateQlnvStaffStatus({
            manv,
            diadiem,
            status: "free",
            lastAction:
                "Hoàn thành nhiệm vụ bất thường"
        });

        renderWorkStatusText("free");
    }

    currentUnplannedTask = null;

    await loadMyCurrentTask({ manv, diadiem });
}

function attachChamCongButtons(diadiem) {
    const manv = localStorage.getItem("manv");
    if (!manv) return;

    const btnWorkFree = document.getElementById("btn-work-free");
    const btnWorkServing = document.getElementById("btn-work-serving");
    const btnWorkCleanup = document.getElementById("btn-work-cleanup");
    const btnWorkOff = document.getElementById("btn-work-off");

    btnWorkFree?.addEventListener("click", async () => {
        await resumeCurrentTaskIfPaused();

        const ok = await updateQlnvStaffStatus({
            manv,
            diadiem,
            status: currentAssignedTask?.status === "in_progress" ? "doing_task" : "free",
            lastAction: currentAssignedTask?.status === "in_progress"
                ? "Nhân viên quay lại làm task"
                : "Nhân viên báo rảnh"
        });

        if (ok) {
            renderWorkStatusText(
                currentAssignedTask?.status === "in_progress" ? "doing_task" : "free"
            );
        }
    });

    btnWorkServing?.addEventListener("click", async () => {
        await pauseCurrentTaskIfDoing();

        const ok = await updateQlnvStaffStatus({
            manv,
            diadiem,
            status: "serving_customer",
            lastAction: "Nhân viên bắt đầu phục vụ khách"
        });

        if (ok) renderWorkStatusText("serving_customer");
    });

    btnWorkCleanup?.addEventListener("click", async () => {
        await pauseCurrentTaskIfDoing();

        const ok = await updateQlnvStaffStatus({
            manv,
            diadiem,
            status: "cleanup_after_sale",
            lastAction: "Dọn dẹp sau bán",
            cleanupMinutes: 10
        });

        if (ok) renderWorkStatusText("cleanup_after_sale");
    });

    btnWorkOff?.addEventListener("click", async () => {
        const ok = await updateQlnvStaffStatus({
            manv,
            diadiem,
            status: "off",
            lastAction: "Ngừng nhận việc"
        });

        if (ok) renderWorkStatusText("off");
    });

    const statusManv = document.getElementById("status-manv");
    const statusMsg = document.getElementById("status-msg");
    statusManv.textContent = manv;

    const btnVaoca = document.getElementById("btn-vaoca");
    const btnNtr = document.getElementById("btn-ntr");
    const btnNtrd = document.getElementById("btn-ntrd");
    const btnNch = document.getElementById("btn-nch");
    const btnNchd = document.getElementById("btn-nchd");
    const btnTanca = document.getElementById("btn-tanca");
    const btnMyTaskStart = document.getElementById("btn-my-task-start");
    const btnMyTaskDone = document.getElementById("btn-my-task-done");
    const btnMyTaskResume = document.getElementById("btn-my-task-resume");
    const btnUnplannedStart =
        document.getElementById("btn-unplanned-start");

    const btnUnplannedDone =
        document.getElementById("btn-unplanned-done");

    btnUnplannedStart?.addEventListener(
        "click",
        () => {
            openUnplannedModal();
        }
    );

    const btnUnplannedConfirm =
        document.getElementById("btn-unplanned-confirm");

    const btnUnplannedCancel =
        document.getElementById("btn-unplanned-cancel");

    btnUnplannedConfirm?.addEventListener(
        "click",
        async () => {
            await startUnplannedTask();
        }
    );

    btnUnplannedCancel?.addEventListener(
        "click",
        () => {
            closeUnplannedModal();
        }
    );

    btnUnplannedDone?.addEventListener(
        "click",
        async () => {
            await finishUnplannedTask();
        }
    );

    btnMyTaskStart?.addEventListener("click", async () => {
        await updateMyTaskStatus("in_progress");
    });

    btnMyTaskDone?.addEventListener("click", async () => {
        await updateMyTaskStatus("done");
    });

    btnMyTaskResume?.addEventListener("click", async () => {
        await resumeTaskAndSetDoing();
    });

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

                await createChamCongNotification({
                    diadiem,
                    manv,
                    title: "Nhân viên vừa chấm công",
                    body: `${manv} vừa bấm ${labelSuKien(su_kien)} lúc ${formatTime(now)}`,
                    type: "chamcong_event",
                    refType: "chamcong_log"
                });

                playNotifySound();

                showTaskPopup(
                    "Đã ghi nhận chấm công",
                    `${labelSuKien(su_kien)} lúc ${formatTime(now)}`
                );

                if (su_kien === "VAOCA") {
                    await updateQlnvStaffStatus({
                        manv,
                        diadiem,
                        status: "free",
                        lastAction: "Vào ca"
                    });
                    renderWorkStatusText("free");
                }

                if (su_kien === "NTR" || su_kien === "NCH") {
                    await updateQlnvStaffStatus({
                        manv,
                        diadiem,
                        status: "break",
                        lastAction: labelSuKien(su_kien)
                    });
                    renderWorkStatusText("break");
                }

                if (su_kien === "NTRD" || su_kien === "NCHD") {
                    await updateQlnvStaffStatus({
                        manv,
                        diadiem,
                        status: "free",
                        lastAction: labelSuKien(su_kien)
                    });
                    renderWorkStatusText("free");
                }

                if (su_kien === "TANCA" || su_kien === "AUTO_TANCA") {
                    await updateQlnvStaffStatus({
                        manv,
                        diadiem,
                        status: "off",
                        lastAction: labelSuKien(su_kien)
                    });
                    renderWorkStatusText("off");
                }

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

let cleanupAutoResumeInterval = null;

function startAutoResumeAfterCleanup({ manv, diadiem }) {
    if (cleanupAutoResumeInterval) {
        clearInterval(cleanupAutoResumeInterval);
        cleanupAutoResumeInterval = null;
    }

    cleanupAutoResumeInterval = setInterval(async () => {
        const sp = await ensureSupabase();
        if (!sp || !manv) return;

        const { data, error } = await sp
            .schema("qlnv")
            .from("staff_status")
            .select("current_status, cleanup_until")
            .eq("manv", String(manv).toUpperCase())
            .eq("diadiem", diadiem)
            .maybeSingle();

        if (error || !data) return;

        if (data.current_status !== "cleanup_after_sale") return;
        if (!data.cleanup_until) return;

        const cleanupUntil = new Date(data.cleanup_until).getTime();

        if (Date.now() < cleanupUntil) return;

        await loadMyCurrentTask({ manv, diadiem });

        if (
            currentAssignedTask &&
            currentAssignedTask.status === "in_progress" &&
            currentAssignedTask.paused_at
        ) {
            await resumeTaskAndSetDoing();
        } else {
            await updateQlnvStaffStatus({
                manv,
                diadiem,
                status: "free",
                lastAction: "Tự động kết thúc dọn dẹp sau bán"
            });

            renderWorkStatusText("free");
        }
    }, 30000);
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
    setupBeepUnlockOnce(document);

    await loadMyCurrentTask({ manv, diadiem });
    setupChamCongRealtime({ manv, diadiem });

    await requestBrowserNotificationPermission();
    setupNotificationRealtimeChamCong({ manv, diadiem });

    startAutoResumeAfterCleanup({ manv, diadiem });

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









