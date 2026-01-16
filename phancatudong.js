// Auto Scheduling (Demo)
// - Dùng chung authModule.js (giống trang nhapdmnhanvien.html)
// - Chỉ admin mới được vào

import { khoiTaoDangNhapDungChung, dangXuatDungChung, getSupabaseClient } from "./authModule.js";

// ===== DOM =====
const elFrom = document.getElementById("fromDate");
const elTo = document.getElementById("toDate");
const btnRun = document.getElementById("btnRun");
const btnRefresh = document.getElementById("btnRefresh");
const statusEl = document.getElementById("status");
const shortageWrap = document.getElementById("shortageWrap");
const assignWrap = document.getElementById("assignWrap");

// ===== Utils =====
function setStatus(msg, type = "muted") {
    statusEl.className = type === "err" ? "err" : type === "ok" ? "ok" : "muted";
    statusEl.textContent = msg || "";
}

function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}
function addDaysISO(iso, days) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function escapeHtml(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderTable(container, rows, cols, title) {
    if (!rows || rows.length === 0) {
        container.innerHTML = `<div class="muted">${escapeHtml(title)}: (0 dòng)</div>`;
        return;
    }
    const thead = cols.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
    const tbody = rows
        .map((r) => {
            const tds = cols.map((c) => `<td>${escapeHtml(r[c.key])}</td>`).join("");
            return `<tr>${tds}</tr>`;
        })
        .join("");

    container.innerHTML = `
    <div class="muted" style="margin-bottom:6px;">${escapeHtml(title)}: (${rows.length} dòng)</div>
    <div style="overflow:auto;">
      <table class="tbl">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  `;
}

// ===== Data =====
async function loadShortageSuggestions(fromISO, toISO) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from("v_shift_shortage_suggestions")
        .select("*")
        .gte("ngay", fromISO)
        .lte("ngay", toISO)
        .order("ngay", { ascending: true })
        .order("coso", { ascending: true })
        .order("slot", { ascending: true });

    if (error) throw error;

    renderTable(
        shortageWrap,
        data,
        [
            { key: "ngay", label: "ngày" },
            { key: "coso", label: "cơ sở" },
            { key: "slot", label: "slot" },
            { key: "required_count", label: "cần" },
            { key: "assigned_count", label: "đã xếp" },
            { key: "shortage", label: "thiếu" },
            { key: "assigned_list", label: "đã xếp (list)" },
            { key: "recommended_candidates", label: "gợi ý" },
        ],
        "1) Shift Shortage + Suggestions"
    );
}

async function loadAssignments(fromISO, toISO) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from("shift_assignments")
        .select("*")
        .gte("ngay", fromISO)
        .lte("ngay", toISO)
        .order("ngay", { ascending: true })
        .order("coso", { ascending: true })
        .order("slot", { ascending: true })
        .order("manv", { ascending: true });

    if (error) throw error;

    renderTable(
        assignWrap,
        data,
        [
            { key: "ngay", label: "ngày" },
            { key: "coso", label: "cơ sở" },
            { key: "slot", label: "slot" },
            { key: "manv", label: "mã NV" },
            { key: "source_used", label: "nguồn" },
            { key: "score", label: "điểm" },
            { key: "reason", label: "ghi chú" },
            { key: "created_at", label: "tạo lúc" },
        ],
        "2) Shift Assignments (trong khoảng ngày)"
    );
}

async function refreshAll(fromISO, toISO) {
    setStatus("Đang tải dữ liệu...", "muted");
    await Promise.all([loadShortageSuggestions(fromISO, toISO), loadAssignments(fromISO, toISO)]);
    setStatus("Đã tải xong.", "ok");
}

// ===== Actions =====
async function runAutoSchedule(fromISO, toISO) {
    const supabase = getSupabaseClient();
    setStatus("Đang chạy auto_schedule...", "muted");

    const { error } = await supabase.rpc("auto_schedule", {
        p_from: fromISO,
        p_to: toISO,
    });

    if (error) throw error;

    setStatus("Chạy auto_schedule xong. Đang refresh...", "ok");
    await refreshAll(fromISO, toISO);
}

// ===== App Init (sau login) =====
function initApp() {
    // set mặc định ngày
    const d0 = todayISO();
    if (!elFrom.value) elFrom.value = d0;
    if (!elTo.value) elTo.value = addDaysISO(d0, 6);

    btnRun.addEventListener("click", async () => {
        try {
            const fromISO = elFrom.value;
            const toISO = elTo.value;
            if (!fromISO || !toISO) return setStatus("Bạn phải chọn đủ Từ ngày / Đến ngày.", "err");
            await runAutoSchedule(fromISO, toISO);
        } catch (e) {
            console.error(e);
            setStatus(`Lỗi: ${e?.message || e}`, "err");
        }
    });

    btnRefresh.addEventListener("click", async () => {
        try {
            const fromISO = elFrom.value;
            const toISO = elTo.value;
            if (!fromISO || !toISO) return setStatus("Bạn phải chọn đủ Từ ngày / Đến ngày.", "err");
            await refreshAll(fromISO, toISO);
        } catch (e) {
            console.error(e);
            setStatus(`Lỗi: ${e?.message || e}`, "err");
        }
    });

    // tải lần đầu
    btnRefresh.click();
}

// ===== Auth bootstrap (GIỐNG nhapdmnhanvien) =====
khoiTaoDangNhapDungChung({
    appContainerId: 'app-container',
    macDinhDiaDiem: 'cs1',      // mặc định cơ sở 1, tuỳ anh đổi nếu cần
    tuDongKhoaCoSo: true,
    loginApiPath: '/api/login-cs1',
    onLoginSuccess: async (nhanvien, { diadiem, session }) => {
        // Chỉ cho phép admin
        if (!nhanvien.is_admin) {
            alert('Tài khoản này KHÔNG phải ADMIN nên không được phép truy cập trang nhập danh mục nhân viên.');
            await dangXuatDungChung({ appContainerId: 'app-container' });
            return;
        }

        // Admin hợp lệ -> hiển thị app & load danh sách gợi ý mã NV
        document.getElementById('app-container').style.display = '';
        await loadNvList();
        resetForm();
    }
});
