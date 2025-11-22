// dangkyca.js - nhân viên đăng ký ca

import { supabase } from "./supabaseClient.js";

const manvInput = document.getElementById("manv");
const diadiemSelect = document.getElementById("diadiem");
const ngayInput = document.getElementById("ngay");
const gioBdInput = document.getElementById("gio_bat_dau");
const gioKtInput = document.getElementById("gio_ket_thuc");
const lyDoInput = document.getElementById("ly_do");
const btnDangKy = document.getElementById("btn-dang-ky");
const tbodyLich = document.getElementById("tbody-lich");
const msgEl = document.getElementById("msg");

function setToday() {
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  ngayInput.value = iso;
}

function setMsg(text, isError = false) {
  msgEl.textContent = text || "";
  msgEl.style.color = isError ? "#c62828" : "#555";
}

async function loadMyRequests() {
  const manv = manvInput.value.trim();
  if (!manv) {
    tbodyLich.innerHTML = `<tr><td colspan="6">Nhập mã NV để xem lịch đăng ký.</td></tr>`;
    return;
  }

  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
  const fromDate = sevenDaysAgo.toISOString().slice(0, 10);
  const toDate = today.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("lichlam_dangky")
    .select("*")
    .eq("manv", manv)
    .gte("ngay", fromDate)
    .lte("ngay", toDate)
    .order("ngay", { ascending: true });

  if (error) {
    console.error("Lỗi load lichlam_dangky:", error);
    tbodyLich.innerHTML = `<tr><td colspan="6" style="color:red;">Lỗi tải dữ liệu.</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbodyLich.innerHTML = `<tr><td colspan="6">Không có đăng ký nào trong 7 ngày gần đây.</td></tr>`;
    return;
  }

  tbodyLich.innerHTML = "";
  data.forEach(row => {
    const tr = document.createElement("tr");

    const tdNgay = document.createElement("td");
    tdNgay.textContent = row.ngay;
    tr.appendChild(tdNgay);

    const tdDia = document.createElement("td");
    tdDia.textContent = row.diadiem;
    tr.appendChild(tdDia);

    const tdGio = document.createElement("td");
    tdGio.textContent = `${row.gio_bat_dau?.slice(0,5)} - ${row.gio_ket_thuc?.slice(0,5)}`;
    tr.appendChild(tdGio);

    const tdTrangThai = document.createElement("td");
    tdTrangThai.textContent = row.trang_thai;
    tdTrangThai.className = `status-${row.trang_thai}`;
    tr.appendChild(tdTrangThai);

    const tdLyDo = document.createElement("td");
    tdLyDo.textContent = row.ly_do || "";
    tr.appendChild(tdLyDo);

    const tdNote = document.createElement("td");
    tdNote.textContent = row.ghi_chu_admin || "";
    tr.appendChild(tdNote);

    tbodyLich.appendChild(tr);
  });
}

async function handleDangKy() {
  const manv = manvInput.value.trim();
  const diadiem = diadiemSelect.value;
  const ngay = ngayInput.value;
  const gio_bd = gioBdInput.value;
  const gio_kt = gioKtInput.value;
  const ly_do = lyDoInput.value.trim();

  if (!manv || !ngay || !gio_bd || !gio_kt) {
    setMsg("Vui lòng nhập đủ Mã NV, Ngày, Giờ bắt đầu/kết thúc.", true);
    return;
  }

  if (gio_bd >= gio_kt) {
    setMsg("Giờ bắt đầu phải nhỏ hơn giờ kết thúc.", true);
    return;
  }

  setMsg("Đang gửi đăng ký...");

  const { error } = await supabase
    .from("lichlam_dangky")
    .insert({
      manv,
      diadiem,
      ngay,
      gio_bat_dau: gio_bd,
      gio_ket_thuc: gio_kt,
      ly_do,
      trang_thai: "CHO_DUYET",
      created_by: manv
    });

  if (error) {
    console.error("Lỗi insert lichlam_dangky:", error);
    setMsg("Gửi đăng ký thất bại.", true);
    return;
  }

  setMsg("Đã gửi đăng ký, chờ quản lý duyệt.");
  await loadMyRequests();
}

document.addEventListener("DOMContentLoaded", () => {
  setToday();

  btnDangKy.addEventListener("click", handleDangKy);
  manvInput.addEventListener("change", loadMyRequests);
  manvInput.addEventListener("blur", loadMyRequests);
});
