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
const summaryWrap = document.getElementById("summaryWrap");

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

function slotToCaVN(slot) {
  const s = String(slot || "").toLowerCase();
  if (s === "morning" || s === "sang") return "sáng";
  if (s === "lunch" || s === "noon" || s === "trua") return "trưa";
  if (s === "afternoon" || s === "chieu") return "chiều";
  if (s === "evening" || s === "toi" || s === "night") return "tối";
  return slot; // fallback
}

function caSortKey(caVN) {
  // sắp xếp theo thứ tự: sáng -> trưa -> chiều -> tối
  const c = String(caVN || "").toLowerCase();
  if (c === "sáng") return 1;
  if (c === "trưa") return 2;
  if (c === "chiều") return 3;
  if (c === "tối") return 4;
  return 9;
}

function normalizeListStr(s) {
  const raw = String(s || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function buildSummaryRows(shortageRows, assignmentRows) {
  // index shortage by key
  const shortageByKey = new Map();
  for (const r of shortageRows || []) {
    const key = `${r.ngay}__${r.coso}__${r.slot}`;
    shortageByKey.set(key, r);
  }

  // group assignments
  const group = new Map();
  for (const a of assignmentRows || []) {
    const key = `${a.ngay}__${a.coso}__${a.slot}`;
    if (!group.has(key)) group.set(key, []);
    group.get(key).push(a);
  }

  // union keys
  const keys = new Set([...shortageByKey.keys(), ...group.keys()]);
  const rows = [];

  for (const key of keys) {
    const [ngay, coso, slot] = key.split("__");
    const s = shortageByKey.get(key);
    const as = group.get(key) || [];
    const ca = slotToCaVN(slot);

    // required_count: ưu tiên từ view thiếu người; nếu không có thì coi như bằng số đã xếp
    const assignedCount = as.length;
    const requiredCount = Number.isFinite(Number(s?.required_count))
      ? Number(s.required_count)
      : assignedCount;

    const thieu = Math.max(0, requiredCount - assignedCount);
    const thua = Math.max(0, assignedCount - requiredCount);

    // danh sách đã xếp
    const daXepList = as
      .slice()
      .sort((x, y) => String(x.manv || "").localeCompare(String(y.manv || "")))
      .map((x) => x.manv)
      .filter(Boolean);

    // gợi ý thêm: lấy từ view thiếu người
    const goiYThem = s?.recommended_candidates || "";

    // gợi ý bớt: nếu thừa thì đề xuất các NV có score thấp hơn
    let goiYBot = "";
    if (thua > 0) {
      const candidates = as
        .slice()
        .sort((x, y) => {
          const sx = Number(x.score ?? 0);
          const sy = Number(y.score ?? 0);
          return sx - sy; // thấp trước
        })
        .slice(0, thua)
        .map((x) => x.manv)
        .filter(Boolean);
      goiYBot = candidates.join(", ");
    }

    rows.push({
      ngay,
      coso,
      ca,
      can: requiredCount,
      dangky_cung: s?.assigned_count ?? "", // để đối chiếu nếu bạn cần
      da_xep: assignedCount,
      thieu,
      thua,
      da_xep_list: daXepList.join(", "),
      goi_y_them: goiYThem,
      goi_y_bot: goiYBot,
    });
  }

  // sort: ngày -> cơ sở -> ca
  rows.sort((a, b) => {
    if (a.ngay !== b.ngay) return String(a.ngay).localeCompare(String(b.ngay));
    if (a.coso !== b.coso) return String(a.coso).localeCompare(String(b.coso));
    return caSortKey(a.ca) - caSortKey(b.ca);
  });

  return rows;
}

function renderSummaryTable(container, rows) {
  if (!rows || rows.length === 0) {
    container.innerHTML = `<div class="muted">Không có dữ liệu tổng hợp trong khoảng ngày đã chọn.</div>`;
    return;
  }

  const cols = [
    { key: "ngay", label: "ngày" },
    { key: "coso", label: "cơ sở" },
    { key: "ca", label: "ca" },
    { key: "can", label: "cần" },
    { key: "da_xep", label: "đã xếp" },
    { key: "thieu", label: "thiếu" },
    { key: "thua", label: "thừa" },
    { key: "da_xep_list", label: "đã xếp (list)" },
    { key: "goi_y_them", label: "gợi ý thêm" },
    { key: "goi_y_bot", label: "gợi ý bớt" },
  ];

  const thead = cols.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
  const tbody = rows
    .map((r) => {
      const tds = cols
        .map((c) => {
          const v = r[c.key];
          if (c.key === "thieu" && Number(v) > 0) return `<td class="num-red">${escapeHtml(v)}</td>`;
          if (c.key === "thua" && Number(v) > 0) return `<td class="num-blue">${escapeHtml(v)}</td>`;
          return `<td>${escapeHtml(v)}</td>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  container.innerHTML = `
    <div class="muted" style="margin-bottom:6px;">Tổng hợp: (${rows.length} dòng)</div>
    <div style="overflow:auto;">
      <table class="tbl">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  `;
}

// ===== Data =====
async function loadShortageSuggestionsData(fromISO, toISO) {
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

  return data || [];
}

async function loadAssignmentsData(fromISO, toISO) {
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

  return data || [];
}

async function refreshAll(fromISO, toISO) {
  setStatus("Đang tải dữ liệu...", "muted");

  const [shortageRows, assignmentRows] = await Promise.all([
    loadShortageSuggestionsData(fromISO, toISO),
    loadAssignmentsData(fromISO, toISO),
  ]);

  // 1) Tổng hợp theo ngày
  const summaryRows = buildSummaryRows(shortageRows, assignmentRows);
  renderSummaryTable(summaryWrap, summaryRows);

  // 2) Chi tiết thiếu người (để đối chiếu)
  const shortageDisplayRows = (shortageRows || []).map((r) => ({
    ...r,
    ca: slotToCaVN(r.slot),
  }));
  renderTable(
    shortageWrap,
    shortageDisplayRows,
    [
      { key: "ngay", label: "ngày" },
      { key: "coso", label: "cơ sở" },
      { key: "ca", label: "ca" },
      { key: "required_count", label: "cần" },
      { key: "assigned_count", label: "đã xếp" },
      { key: "shortage", label: "thiếu" },
      { key: "assigned_list", label: "đã xếp (list)" },
      { key: "recommended_candidates", label: "gợi ý" },
    ],
    "Thiếu người theo ca"
  );

  // 3) Chi tiết đã xếp
  const assignmentDisplayRows = (assignmentRows || []).map((r) => ({
    ...r,
    ca: slotToCaVN(r.slot),
  }));
  renderTable(
    assignWrap,
    assignmentDisplayRows,
    [
      { key: "ngay", label: "ngày" },
      { key: "coso", label: "cơ sở" },
      { key: "ca", label: "ca" },
      { key: "manv", label: "mã NV" },
      { key: "source_used", label: "nguồn" },
      { key: "score", label: "điểm" },
      { key: "reason", label: "ghi chú" },
      { key: "created_at", label: "tạo lúc" },
    ],
    "Danh sách phân ca chi tiết"
  );

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
  // AuthModule dùng các option: loginContainerId, appContainerId, coSoMacDinh,
  // tuDongKhoaCoSo, requireAdmin, onLoginSuccess, onLogout...
  loginContainerId: "authContainer",  // đúng id trong phancatudong.html
  appContainerId: "appContainer",     // đúng id trong phancatudong.html
  coSoMacDinh: "cs1",
  tuDongKhoaCoSo: false,
  loginApiPath: "/api/login-cs1",
  requireAdmin: true,                  // CHỈ admin
  onLoginSuccess: async ({ coSo }) => {
    // lưu lại cơ sở đang làm việc (nếu cần dùng về sau)
    localStorage.setItem("selectedCoso", coSo);
    initApp();
  },
  onLogout: () => {
    setStatus("Đã đăng xuất.", "muted");
  },
});

