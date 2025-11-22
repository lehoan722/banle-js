// statusnhanvien.js
// Hiển thị trạng thái nhân viên hiện tại theo dữ liệu chamcong_log

import { supabase } from "./supabaseClient.js";

const tbody = document.getElementById("tbody-status");
const diadiemSelect = document.getElementById("filter-diadiem");
const statusMsg = document.getElementById("status-msg");
const refreshBtn = document.getElementById("btn-refresh");

let autoTimer = null;
const AUTO_REFRESH_MS = 60000; // 60 giây

function trangThaiLabel(code) {
    switch (code) {
        case "DANG_LAM": return "Đang làm";
        case "NGHI_TRUA": return "Nghỉ trưa";
        case "NGHI_CHIEU": return "Nghỉ chiều";
        case "DA_TAN_CA": return "Đã tan ca";
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
        NTRD: "Trưa đến",
        NCH: "Nghỉ chiều",
        NCHD: "Chiều đến",
        TANCA: "Tan ca",
        AUTO_TANCA: "Tự động tan ca"
    };
    return map[code] || code || "";
}

function formatTimeVN(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
}

function formatMinutes(m) {
    if (m == null || Number.isNaN(Number(m))) return "";
    const val = Number(m);
    return val.toFixed(1).replace(".", ",");
}

function setStatusMessage(text) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    statusMsg.textContent = `${text} (Lần cuối: ${hh}:${mm})`;
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
        tbody.innerHTML = `<tr><td colspan="7" style="color:red;">Lỗi tải dữ liệu, xem console để biết chi tiết.</td></tr>`;
        setStatusMessage("Lỗi tải dữ liệu.");
        return;
    }

    const rows = data || [];
    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7">Không có dữ liệu chấm công hôm nay.</td></tr>`;
        setStatusMessage("Đã tải xong (không có dữ liệu hôm nay).");
        return;
    }

    tbody.innerHTML = "";
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

        tbody.appendChild(tr);
    });

    setStatusMessage(`Đã tải xong (${rows.length} nhân viên).`);
}

function startAutoRefresh() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = setInterval(loadStatus, AUTO_REFRESH_MS);
}

document.addEventListener("DOMContentLoaded", () => {
    loadStatus();
    startAutoRefresh();

    refreshBtn.addEventListener("click", () => {
        loadStatus();
    });

    diadiemSelect.addEventListener("change", () => {
        loadStatus();
    });
});
