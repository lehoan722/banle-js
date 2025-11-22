// duyetca.js - Quản lý duyệt ca (có login + lọc theo khoảng ngày)

import { supabase } from "./supabaseClient.js";
import { khoiTaoDangNhapDungChung } from "./authModule.js";

const diadiemSelect = document.getElementById("diadiem");
const trangThaiSelect = document.getElementById("trang_thai");
const btnLoad = document.getElementById("btn-load");
const tbody = document.getElementById("tbody-duyet");
const msgEl = document.getElementById("msg");

const fromDateInput = document.getElementById("from_date");
const toDateInput = document.getElementById("to_date");

function setMsg(text, isError = false) {
  msgEl.textContent = text || "";
  msgEl.style.color = isError ? "#c62828" : "#555";
}

function formatISO(d) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const today = new Date();
  const last7 = new Date(today.getTime() - 6 * 86400000);
  fromDateInput.value = formatISO(last7);
  toDateInput.value = formatISO(today);
}

async function loadRequests() {
  const diadiem = diadiemSelect.value;
  const trang_thai = trangThaiSelect.value;

  let fromDate = fromDateInput.value;
  let toDate = toDateInput.value;

  if (!fromDate || !toDate) defaultRange();

  setMsg("Đang tải danh sách...");

  let query = supabase.from("lichlam_dangky").select("*");

  if (diadiem) query = query.eq("diadiem", diadiem);
  if (trang_thai) query = query.eq("trang_thai", trang_thai);
  if (fromDate) query = query.gte("ngay", fromDate);
  if (toDate) query = query.lte("ngay", toDate);

  query = query.order("ngay").order("diadiem").order("manv");

  const { data, error } = await query;

  if (error) {
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="9" style="color:red;">Lỗi tải dữ liệu.</td></tr>`;
    setMsg("Lỗi tải dữ liệu.", true);
    return;
  }

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="9">Không có đăng ký phù hợp.</td></tr>`;
    setMsg("Đã tải xong (0).");
    return;
  }

  tbody.innerHTML = "";
  data.forEach(row => {
    tbody.innerHTML += `
      <tr>
        <td>${row.id}</td>
        <td>${row.ngay}</td>
        <td>${row.diadiem}</td>
        <td>${row.manv}</td>
        <td>${row.gio_bat_dau?.slice(0,5)} - ${row.gio_ket_thuc?.slice(0,5)}</td>
        <td class="status-${row.trang_thai}">${row.trang_thai}</td>
        <td>${row.ly_do || ""}</td>
        <td><input class="note-input" data-id="${row.id}" value="${row.ghi_chu_admin || ""}" style="width:120px;font-size:12px;"/></td>
        <td>
          <button data-act="approve" data-id="${row.id}">Duyệt</button>
          <button data-act="reject" data-id="${row.id}">Từ chối</button>
        </td>
      </tr>`;
  });

  setMsg(`Đã tải xong (${data.length} dòng).`);
}

async function updateStatus(id, newStatus) {
  const note = document.querySelector(`.note-input[data-id="${id}"]`);
  const ghi_chu_admin = note ? note.value : "";

  const { error } = await supabase
    .from("lichlam_dangky")
    .update({ trang_thai: newStatus, ghi_chu_admin })
    .eq("id", id);

  if (error) {
    alert("Cập nhật thất bại!");
    return;
  }
  loadRequests();
}

function attachEvents() {
  btnLoad.addEventListener("click", loadRequests);

  tbody.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    if (act === "approve") updateStatus(id, "DA_DUYET");
    if (act === "reject") updateStatus(id, "TU_CHOI");
  });
}

function onLoginSuccess() {
  defaultRange();
  attachEvents();
  loadRequests();
}

// === KÍCH HOẠT LOGIN ===
document.addEventListener("DOMContentLoaded", () => {
  khoiTaoDangNhapDungChung({
    loginContainerId: "login-container",
    appContainerId: "app-container",
    loginApiPath: "/api/login-cs1", // vẫn theo mẫu trang đăng ký ca
    onLoginSuccess
  });
});
