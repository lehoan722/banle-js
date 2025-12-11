// chamcong_admin.js - Quản lý chỉnh sửa chấm công (ADMIN)
import { supabase } from "./supabaseClient.js";
import { khoiTaoDangNhapDungChung, dangXuatDungChung } from "./authModule.js";
import { fillNhanVienDropdown } from "./dmnhanvien.js";

// --- DOM elements ---
const filterNgay = document.getElementById("filter-ngay");
const filterDia = document.getElementById("filter-diadiem");
const filterManv = document.getElementById("filter-manv");
const btnLoad = document.getElementById("btn-load");
const statusEl = document.getElementById("status");
const tbodyLog = document.getElementById("tbody-log");

const newManv = document.getElementById("new-manv");
const newDia = document.getElementById("new-diadiem");
const newNgay = document.getElementById("new-ngay");
const newGio = document.getElementById("new-gio");
const newSuKien = document.getElementById("new-su_kien");
const newNguon = document.getElementById("new-nguon");

const btnAdd = document.getElementById("btn-add");

// datalist mã nhân viên dùng chung
const manvDatalist = document.getElementById("ds-manv");

let daGanEvent = false;

// --- Helpers chung ---

function setStatus(msg, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
  statusEl.style.color = isError ? "#c62828" : "#555";
}

function toVNTimeString(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

function getTodayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10); // yyyy-mm-dd
}

// --- Load log theo ngày ---

async function loadLogs() {
  try {
    const ngay = filterNgay.value || getTodayISO();
    filterNgay.value = ngay;

    const diadiem = filterDia.value || "";
    const manv = filterManv.value.trim();

    // Khoảng thời gian 1 ngày theo giờ VN
    const from = `${ngay}T00:00:00+07:00`;
    const to = `${ngay}T23:59:59.999+07:00`;

    let query = supabase
      .from("chamcong_log")
      .select("id, manv, diadiem, su_kien, nguon, created_at")
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: true });

    if (diadiem) {
      query = query.eq("diadiem", diadiem);
    }
    if (manv) {
      query = query.eq("manv", manv);
    }

    setStatus("Đang tải dữ liệu...");
    const { data, error } = await query;

    if (error) {
      console.error("Lỗi load chamcong_log:", error);
      setStatus("Lỗi tải log chấm công. Xem console.", true);
      return;
    }

    renderLogs(data || []);
  } catch (err) {
    console.error("Lỗi không xác định khi loadLogs:", err);
    setStatus("Lỗi không xác định khi tải log.", true);
  }
}

function renderLogs(rows) {
  tbodyLog.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.textContent = "Chưa có dữ liệu.";
    tr.appendChild(td);
    tbodyLog.appendChild(tr);
    setStatus("Không có bản ghi nào.");
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    const tdId = document.createElement("td");
    tdId.textContent = row.id;
    tr.appendChild(tdId);

    const tdServer = document.createElement("td");
    tdServer.textContent = row.created_at || "";
    tr.appendChild(tdServer);

    const tdVN = document.createElement("td");
    tdVN.textContent = toVNTimeString(row.created_at);
    tr.appendChild(tdVN);

    const tdManv = document.createElement("td");
    tdManv.textContent = row.manv || "";
    tr.appendChild(tdManv);

    const tdDia = document.createElement("td");
    tdDia.textContent = row.diadiem || "";
    tr.appendChild(tdDia);

    const tdSuKien = document.createElement("td");
    tdSuKien.textContent = row.su_kien || "";
    tr.appendChild(tdSuKien);

    const tdNguon = document.createElement("td");
    tdNguon.textContent = row.nguon || "";
    tr.appendChild(tdNguon);

    const tdAct = document.createElement("td");

    const btnEdit = document.createElement("button");
    btnEdit.textContent = "Sửa";
    btnEdit.className = "btn-small";
    btnEdit.onclick = () => editLog(row);
    tdAct.appendChild(btnEdit);

    const btnDel = document.createElement("button");
    btnDel.textContent = "Xóa";
    btnDel.className = "btn-small";
    btnDel.onclick = () => deleteLog(row);
    tdAct.appendChild(btnDel);

    tr.appendChild(tdAct);
    tbodyLog.appendChild(tr);
  });

  setStatus(`Đã tải ${rows.length} bản ghi.`);
}

// --- Thêm / sửa / xóa log ---

async function addLog() {
  const manv = newManv.value.trim();
  const diadiem = newDia.value;
  const ngay = newNgay.value || filterNgay.value || getTodayISO();
  const gio = newGio.value;
  const su_kien = newSuKien.value;
  const nguon = (newNguon.value || "manual-admin").trim();

  if (!manv || !diadiem || !ngay || !gio || !su_kien) {
    setStatus("Vui lòng nhập đủ Mã NV, Cơ sở, Ngày, Giờ, Sự kiện.", true);
    return;
  }

  const ts = `${ngay}T${gio}:00+07:00`;

  try {
    const { error } = await supabase.from("chamcong_log").insert([
      {
        manv,
        diadiem,
        su_kien,
        nguon,
        created_at: ts
      }
    ]);

    if (error) {
      console.error("Lỗi thêm log:", error);
      setStatus("Lỗi thêm bản ghi mới. Xem console.", true);
      return;
    }

    setStatus("Đã thêm bản ghi mới.");
    // Reload list để thấy dòng mới
    await loadLogs();
  } catch (err) {
    console.error("Lỗi không xác định khi thêm log:", err);
    setStatus("Lỗi không xác định khi thêm bản ghi.", true);
  }
}

// Tạm thời: Sửa = load giá trị lên form (nếu anh muốn nâng cấp thêm)
function editLog(row) {
  newManv.value = row.manv || "";
  newDia.value = row.diadiem || "cs1";
  const d = new Date(row.created_at);
  const ngay = d.toISOString().slice(0, 10);
  const gio = d.toISOString().slice(11, 16); // HH:MM

  newNgay.value = ngay;
  newGio.value = gio;
  newSuKien.value = row.su_kien || "VAOCA";
  newNguon.value = row.nguon || "manual-admin";
}

// Xóa log
async function deleteLog(row) {
  if (!window.confirm(`Xóa bản ghi ID ${row.id}?`)) return;

  try {
    const { error } = await supabase
      .from("chamcong_log")
      .delete()
      .eq("id", row.id);

    if (error) {
      console.error("Lỗi xóa log:", error);
      setStatus("Lỗi xóa bản ghi.", true);
      return;
    }

    setStatus(`Đã xóa bản ghi ID ${row.id}.`);
    await loadLogs();
  } catch (err) {
    console.error("Lỗi không xác định khi xóa log:", err);
    setStatus("Lỗi không xác định khi xóa.", true);
  }
}

// --- Gắn event chỉ 1 lần ---

function attachEventsOnce() {
  if (daGanEvent) return;
  daGanEvent = true;

  if (btnLoad) btnLoad.addEventListener("click", loadLogs);
  if (btnAdd) btnAdd.addEventListener("click", addLog);
}

// --- Login thành công (chuẩn authModule) ---

/**
 * authModule sẽ gọi:
 *   onLoginSuccess(nhanvien, context)
 * -> Ở đây ta chỉ cho phép nhanvien.is_admin === true
 */
async function onLoginSuccess(nhanvien, context) {
  console.log("DEBUG chamcong_admin onLoginSuccess:", nhanvien, context);

  // Nếu không phải admin -> không cho dùng trang này
  if (!nhanvien || nhanvien.is_admin !== true) {
    alert("Tài khoản này không có quyền ADMIN để dùng trang chỉnh sửa chấm công.");

    // Đăng xuất + hiện lại màn đăng nhập (không cần xóa draft hóa đơn gì cả)
    await dangXuatDungChung({
      loginContainerId: "login-container",
      appContainerId: "app-container",
      clearDraft: false
    });

    // Đảm bảo status hiển thị rõ
    setStatus("Bạn không phải admin, vui lòng đăng nhập bằng tài khoản admin.", true);
    return;
  }

  // ----- Từ đây trở xuống: CHỈ ADMIN -----

  // Đổ danh sách nhân viên vào datalist ds-manv
  if (manvDatalist) {
    try {
      await fillNhanVienDropdown(manvDatalist, { showName: true });
    } catch (err) {
      console.error("Lỗi khi đổ danh sách nhân viên:", err);
    }
  }

  // Ngày mặc định = hôm nay
  const today = getTodayISO();
  if (filterNgay) filterNgay.value = today;
  if (newNgay) newNgay.value = today;

  attachEventsOnce();
  loadLogs();
}

// --- Khởi động ---

document.addEventListener("DOMContentLoaded", () => {
  khoiTaoDangNhapDungChung({
    loginContainerId: "login-container",
    appContainerId: "app-container",
    macDinhDiaDiem: "cs1",
    tuDongKhoaCoSo: false,
    loginApiPath: "/api/login-cs1",
    onLoginSuccess
  });
});
