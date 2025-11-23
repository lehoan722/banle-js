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
    today.getTime() - 3 * 24 * 60 * 60 * 1000
  );

  // 7 ngày sau hôm nay
  const sevenDaysAfter = new Date(
    today.getTime() + 7 * 24 * 60 * 60 * 1000
  );

  return {
    fromDate: formatISODate(threeDaysAgo),
    toDate: formatISODate(sevenDaysAfter)
  };
}


function setTodayAndDefaultRange() {
  const today = new Date();
  ngayInput.value = formatISODate(today);

  const { fromDate, toDate } = getDefaultRange7Days();
  if (!fromDateInput.value) fromDateInput.value = fromDate;
  if (!toDateInput.value) toDateInput.value = toDate;
}

function setMsg(text, isError = false) {
  msgEl.textContent = text || "";
  msgEl.style.color = isError ? "#c62828" : "#555";
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

  // --- KIỂM TRA GIỚI HẠN 3 CA / NGÀY / ĐỊA ĐIỂM + KHÔNG TRÙNG GIỜ ---

  // 1) Lấy tất cả đăng ký của NV trong NGÀY đó (mọi địa điểm),
  //    bỏ qua các ca đã hủy / từ chối nếu có.
  const { data: existing, error: existError } = await supabase
    .from("lichlam_dangky")
    .select("id, diadiem, gio_bat_dau, gio_ket_thuc, trang_thai")
    .eq("manv", manv)
    .eq("ngay", ngay)
    .not("trang_thai", "in", "(HUY,TU_CHOI)");

  if (existError) {
    console.error("Lỗi kiểm tra đăng ký ca hiện có:", existError);
    setMsg("Lỗi kiểm tra lịch đăng ký hiện có. Vui lòng thử lại.", true);
    return;
  }

  const list = existing || [];

  // 1.1. Kiểm tra tối đa 3 ca trong cùng 1 địa điểm
  const caCungDiaDiem = list.filter(r => r.diadiem === diadiem);
  if (caCungDiaDiem.length >= 3) {
    setMsg(
      `Bạn đã đăng ký tối đa 3 ca trong ngày ${ngay} tại cơ sở ${diadiem}. Không thể đăng ký thêm ca mới.`,
      true
    );
    return;
  }

  // 1.2. Kiểm tra trùng giờ với bất kỳ ca nào đã đăng ký (mọi địa điểm)
  const newStart = timeToMinutes(gio_bd);
  const newEnd = timeToMinutes(gio_kt);

  const overlap = list.find(r => {
    const s = timeToMinutes(r.gio_bat_dau);
    const e = timeToMinutes(r.gio_ket_thuc);
    if (s == null || e == null) return false;
    // điều kiện trùng: thời đoạn [start,end) cắt nhau
    return newStart < e && newEnd > s;
  });

  if (overlap) {
    setMsg(
      `Khoảng giờ ${gio_bd} - ${gio_kt} bị trùng với ca đã đăng ký ` +
      `${overlap.gio_bat_dau?.slice(0, 5)} - ${overlap.gio_ket_thuc?.slice(0, 5)
      } tại cơ sở ${overlap.diadiem}. ` +
      "Không thể đăng ký trùng giờ ở bất kỳ cửa hàng nào.",
      true
    );
    return;
  }

  // --- Nếu qua hết kiểm tra thì mới insert ---
  setMsg("Đang gửi đăng ký...");

  const { error } = await supabase.from("lichlam_dangky").insert({
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

// --- Gắn event sau khi login thành công ---
function attachEventsOnce() {
  if (daGanEvent) return;
  daGanEvent = true;

  btnDangKy.addEventListener("click", handleDangKy);
  btnTaiDangKy.addEventListener("click", loadMyRequests);
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
