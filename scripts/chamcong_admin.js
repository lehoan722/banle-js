// chamcong_admin.js - Quản lý chỉnh sửa chấm công
import { supabase } from "./supabaseClient.js";
import { khoiTaoDangNhapDungChung } from "./authModule.js";

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

let daGanEvent = false;

function setStatus(msg, isError = false) {
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
  return d.toISOString().slice(0, 10);
}

// Load log theo ngày
async function loadLogs() {
  const ngay = filterNgay.value || getTodayISO();
  filterNgay.value = ngay;

  const diadiem = filterDia.value || null;
  const manv = filterManv.value.trim() || null;

  setStatus("Đang tải log...");

  // Khoảng thời gian 1 ngày theo giờ Việt Nam
  const from = `${ngay}T00:00:00+07:00`;
  const to = `${ngay}T23:59:59.999+07:00`;

  let query = supabase
    .from("chamcong_log")
    .select("id, manv, diadiem, su_kien, nguon, created_at")
    .gte("created_at", from)
    .lte("created_at", to)
    .order("created_at", { ascending: true });

  if (diadiem) query = query.eq("diadiem", diadiem);
  if (manv) query = query.eq("manv", manv);

  const { data, error } = await query;

  if (error) {
    console.error("Lỗi load chamcong_log:", error);
    tbodyLog.innerHTML =
      `<tr><td colspan="8" style="color:red;">Lỗi tải dữ liệu.</td></tr>`;
    setStatus("Lỗi tải dữ liệu.", true);
    return;
  }

  if (!data || data.length === 0) {
    tbodyLog.innerHTML =
      `<tr><td colspan="8">Không có bản ghi chấm công trong ngày này.</td></tr>`;
    setStatus("");
    return;
  }

  tbodyLog.innerHTML = "";
  data.forEach(row => {
    const tr = document.createElement("tr");

    const tdId = document.createElement("td");
    tdId.textContent = row.id;
    tr.appendChild(tdId);

    const tdTime = document.createElement("td");
    tdTime.textContent = row.created_at;
    tr.appendChild(tdTime);

    const tdTimeVN = document.createElement("td");
    tdTimeVN.textContent = toVNTimeString(row.created_at);
    tr.appendChild(tdTimeVN);

    const tdManv = document.createElement("td");
    tdManv.textContent = row.manv;
    tr.appendChild(tdManv);

    const tdDia = document.createElement("td");
    tdDia.textContent = row.diadiem;
    tr.appendChild(tdDia);

    const tdSu = document.createElement("td");
    tdSu.textContent = row.su_kien;
    tr.appendChild(tdSu);

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

  setStatus(`Đã tải ${data.length} bản ghi.`);
}

// Thêm bản ghi mới
async function addLog() {
  const manv = newManv.value.trim();
  const diadiem = newDia.value;
  const ngay = newNgay.value || filterNgay.value || getTodayISO();
  const gio = newGio.value;
  const su_kien = newSuKien.value;
  const nguon = newNguon.value.trim() || "manual-admin";

  if (!manv || !diadiem || !ngay || !gio || !su_kien) {
    setStatus("Vui lòng nhập đủ Mã NV, Cơ sở, Ngày, Giờ, Sự kiện.", true);
    return;
  }

  const ts = `${ngay}T${gio}:00+07:00`;

  setStatus("Đang thêm bản ghi...");

  const { error } = await supabase.from("chamcong_log").insert({
    manv,
    diadiem,
    su_kien,
    nguon,
    created_at: ts
  });

  if (error) {
    console.error("Lỗi insert chamcong_log:", error);
    setStatus("Thêm bản ghi thất bại.", true);
    return;
  }

  setStatus("Đã thêm bản ghi mới.");
  await loadLogs();
}

// Sửa 1 bản ghi: sửa sự kiện + giờ
async function editLog(row) {
  const newSu = prompt(
    `Sự kiện mới cho ID ${row.id} (hiện tại: ${row.su_kien}):`,
    row.su_kien
  );
  if (!newSu) return;

  const vnNow = toVNTimeString(row.created_at);
  const defTime = vnNow.slice(11, 16); // HH:MM
  const newTime = prompt(
    `Giờ mới (HH:MM) cho ID ${row.id} (hiện tại: ${defTime}):`,
    defTime
  );
  if (!newTime) return;

  const ngay = filterNgay.value || getTodayISO();
  const ts = `${ngay}T${newTime}:00+07:00`;

  setStatus(`Đang cập nhật ID ${row.id}...`);

  const { error } = await supabase
    .from("chamcong_log")
    .update({ su_kien: newSu, created_at: ts })
    .eq("id", row.id);

  if (error) {
    console.error("Lỗi update chamcong_log:", error);
    setStatus("Cập nhật thất bại.", true);
    return;
  }

  setStatus(`Đã cập nhật ID ${row.id}.`);
  await loadLogs();
}

// Xóa bản ghi
async function deleteLog(row) {
  if (!confirm(`Xóa bản ghi ID ${row.id}?`)) return;

  setStatus(`Đang xóa ID ${row.id}...`);

  const { error } = await supabase
    .from("chamcong_log")
    .delete()
    .eq("id", row.id);

  if (error) {
    console.error("Lỗi delete chamcong_log:", error);
    setStatus("Xóa thất bại.", true);
    return;
  }

  setStatus(`Đã xóa ID ${row.id}.`);
  await loadLogs();
}

function attachEventsOnce() {
  if (daGanEvent) return;
  daGanEvent = true;

  btnLoad.addEventListener("click", loadLogs);
  btnAdd.addEventListener("click", addLog);
}

function onLoginSuccess(thongTinNguoiDung) {
  // Ở đây anh có thể kiểm tra role admin nếu muốn (theo thongTinNguoiDung)
  filterNgay.value = getTodayISO();
  newNgay.value = getTodayISO();
  attachEventsOnce();
  loadLogs();
}

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
