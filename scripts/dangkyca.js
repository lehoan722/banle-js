// dangkyca.js - Nhân viên đăng ký ca + login auth + lọc khoảng ngày

import { supabase } from "./supabaseClient.js";
import { khoiTaoDangNhapDungChung } from "./authModule.js";

// --- DOM element ---
const manvInput = document.getElementById("manv");
const diadiemSelect = document.getElementById("diadiem");
const ngayInput = document.getElementById("ngay");
const gioBdInput = document.getElementById("gio_bat_dau");
const gioKtInput = document.getElementById("gio_ket_thuc");
const lyDoInput = document.getElementById("ly_do");
const btnDangKy = document.getElementById("btn-dang-ky");
const tbodyLich = document.getElementById("tbody-lich");
const msgEl = document.getElementById("msg");

const fromDateInput = document.getElementById("from_date");
const toDateInput = document.getElementById("to_date");
const btnTaiDangKy = document.getElementById("btn-tai-dangky");

let daGanEvent = false; // tránh gắn event nhiều lần nếu onLoginSuccess được gọi lại 
let currentManv = null; // mã NV lấy từ login

// --- Tiện ích chung ---

function formatISODate(d) {
  return d.toISOString().slice(0, 10);
}

function getDefaultRange7Days() {
  const today = new Date();

  // 3 ngày trước hôm nay
  const threeDaysAgo = new Date(
    today.getTime() - 1 * 24 * 60 * 60 * 1000
  );

  // 7 ngày sau hôm nay
  const sevenDaysAfter = new Date(
    today.getTime() + 1 * 24 * 60 * 60 * 1000
  );

  return {
    fromDate: formatISODate(threeDaysAgo),
    toDate: formatISODate(sevenDaysAfter)
  };
}


function setTodayAndDefaultRange() {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  ngayInput.value = formatISODate(tomorrow);

  const { fromDate, toDate } = getDefaultRange7Days();
  if (!fromDateInput.value) fromDateInput.value = fromDate;
  if (!toDateInput.value) toDateInput.value = toDate;
}

function setMsg(text, isError = false) {
  msgEl.textContent = text || "";
  msgEl.style.color = isError ? "#c62828" : "#555";
}

function validateDangKyUI() {
  const now = new Date();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectedDate = new Date(ngayInput.value);
  selectedDate.setHours(0, 0, 0, 0);

  // quá 19h
 // if (now.getHours() >= 19) {
    //btnDangKy.style.display = "none";
    //setMsg("Đã quá 19:00, hệ thống đã khóa đăng ký cho ngày mai.", true);
   // return;
 // }

  // ngày hôm nay hoặc quá khứ
  if (selectedDate <= today) {
    btnDangKy.style.display = "none";
    setMsg("Chỉ được đăng ký ca từ ngày mai trở đi.", true);
    return;
  }

  btnDangKy.style.display = "";
  setMsg("");
}

// Chuyển "HH:MM" -> phút
function timeToMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// --- Tự điền mã NV sau khi đăng nhập và khóa ô ---
function autoFillManvFromLogin(thongTinNguoiDung) {
  try {
    const info =
      thongTinNguoiDung ||
      window.thongTinNguoiDung ||
      window.thongTinDangNhap ||
      window.currentUserInfo ||
      null;

    if (!info) {
      console.warn("Không có thông tin đăng nhập để lấy manv");
      return;
    }

    const manv =
      info.manv ||
      info.ma_nv ||
      info.maNhanVien ||
      info.ma_nhan_vien ||
      null;

    if (manv) {
      currentManv = String(manv).trim(); // lưu lại mã NV đăng nhập
      manvInput.value = currentManv;

      // khóa hẳn ô mã NV
      manvInput.readOnly = true;
      manvInput.disabled = true;
      manvInput.title =
        "Mã nhân viên được lấy từ tài khoản đăng nhập, không thể sửa.";
    } else {
      console.warn(
        "Không tìm được trường manv trong thongTinNguoiDung:",
        info
      );
    }
  } catch (e) {
    console.warn("Lỗi khi autoFillManvFromLogin:", e);
  }
}

// --- Load đăng ký theo mã NV + khoảng ngày ---
async function loadMyRequests() {
  // Chỉ cho phép xem theo mã NV đã đăng nhập
  if (!currentManv) {
    tbodyLich.innerHTML = `<tr><td colspan="6">Vui lòng đăng nhập để xem lịch đăng ký ca.</td></tr>`;
    setMsg(
      "Không xác định được Mã NV từ phiên đăng nhập. Vui lòng đăng nhập lại.",
      true
    );
    return;
  }

  const manv = currentManv;

  let fromDate = fromDateInput.value;
  let toDate = toDateInput.value;

  // Nếu chưa chọn thì tự set mặc định 7 ngày gần đây
  if (!fromDate || !toDate) {
    const def = getDefaultRange7Days();
    if (!fromDate) {
      fromDate = def.fromDate;
      fromDateInput.value = fromDate;
    }
    if (!toDate) {
      toDate = def.toDate;
      toDateInput.value = toDate;
    }
  }

  if (fromDate > toDate) {
    setMsg("'Từ ngày' phải nhỏ hơn hoặc bằng 'Đến ngày'.", true);
    return;
  }

  setMsg("Đang tải đăng ký...");

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
    setMsg("Lỗi tải dữ liệu.", true);
    return;
  }

  if (!data || data.length === 0) {
    tbodyLich.innerHTML = `<tr><td colspan="6">Không có đăng ký nào trong khoảng ngày đã chọn.</td></tr>`;
    setMsg("");
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
    tdGio.textContent = `${row.gio_bat_dau?.slice(0, 5)} - ${row.gio_ket_thuc?.slice(0, 5)
      }`;
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

  setMsg("");
}

// --- Gửi đăng ký ca ---
async function handleDangKy() {
  // Bắt buộc phải có mã NV từ login
  if (!currentManv) {
    setMsg(
      "Không xác định được Mã NV từ phiên đăng nhập. Vui lòng đăng nhập lại.",
      true
    );
    return;
  }

  const manv = currentManv;
  const diadiem = diadiemSelect.value;
  const ngay = ngayInput.value;
  const gio_bd = gioBdInput.value;
  const gio_kt = gioKtInput.value;
  const ly_do = lyDoInput.value.trim();

  if (!manv || !ngay || !gio_bd || !gio_kt || !diadiem) {
    setMsg(
      "Vui lòng nhập đủ Cơ sở, Ngày, Giờ bắt đầu/kết thúc.",
      true
    );
    return;
  }

  if (gio_bd >= gio_kt) {
    setMsg("Giờ bắt đầu phải nhỏ hơn giờ kết thúc.", true);
    return;
  }

  setMsg("Đang gửi đăng ký...");

  const { data, error } = await supabase.rpc("rpc_dangky_ca", {
    p_manv: manv,
    p_diadiem: diadiem,
    p_ngay: ngay,
    p_gio_bat_dau: gio_bd,
    p_gio_ket_thuc: gio_kt,
    p_ly_do: ly_do
  });

  if (error) {
    console.error("RPC error:", error);
    setMsg("Lỗi hệ thống khi gửi đăng ký.", true);
    return;
  }

  if (!data || data.ok !== true) {
    setMsg(data?.message || "RPC không trả về dữ liệu. Kiểm tra lại rpc_dangky_ca.", true);
    validateDangKyUI();
    return;
  }

  setMsg(data.message);
  await loadMyRequests();
  validateDangKyUI();


}

// --- Gắn event sau khi login thành công ---
function attachEventsOnce() {
  if (daGanEvent) return;
  daGanEvent = true;

  btnDangKy.addEventListener("click", handleDangKy);
  btnTaiDangKy.addEventListener("click", loadMyRequests);
  ngayInput.addEventListener("change", validateDangKyUI);

}

// --- onLoginSuccess từ authModule ---
function onLoginSuccess(thongTinNguoiDung) {
  // Lưu global giống trang duyệt ca để chỗ khác dùng nếu cần
  window.thongTinNguoiDung = thongTinNguoiDung;

  // Tự set ngày hôm nay + khoảng 7 ngày mặc định
  setTodayAndDefaultRange();

  // Lấy manv từ thông tin đăng nhập, điền vào form và khóa lại
  autoFillManvFromLogin(thongTinNguoiDung);

  // Gắn event các nút (chỉ gắn 1 lần)
  attachEventsOnce();

  // Tải đăng ký mặc định 7 ngày gần đây cho đúng manv
  loadMyRequests();
  validateDangKyUI();
}

// --- Khởi tạo login giống trang up ảnh nhanh ---
document.addEventListener("DOMContentLoaded", () => {
  khoiTaoDangNhapDungChung({
    loginContainerId: "login-container",
    appContainerId: "app-container",
    macDinhDiaDiem: "cs1", // chỉ config cho module login, không ảnh hưởng select cơ sở ở form
    tuDongKhoaCoSo: false, // để người dùng TỰ chọn cơ sở khi đăng ký ca
    loginApiPath: "/api/login-cs1",
    onLoginSuccess
  });
});
