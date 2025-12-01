// doimacode.js - Đổi mã sản phẩm / nhân viên, dùng login chuẩn + kiểm tra quyền
import { supabase } from "./supabaseClient.js";
import { khoiTaoDangNhapDungChung } from "./authModule.js";

// Các phần tử giao diện
const form = document.getElementById("renameForm");
const oldCodeInput = document.getElementById("oldCode");
const newCodeInput = document.getElementById("newCode");
const mergeRow = document.getElementById("mergeRow");
const mergeCheckbox = document.getElementById("mergeIfExists");
const resultBox = document.getElementById("resultBox");
const errorBox = document.getElementById("errorBox");
const submitBtn = document.getElementById("submitBtn");
const msgEl = document.getElementById("msg");

// trạng thái quyền
let coQuyenDoiMa = false;
let thongTinNguoiDungHienTai = null;

function setMsg(text, isError = false) {
  if (!msgEl) return;
  msgEl.textContent = text || "";
  msgEl.style.color = isError ? "#c62828" : "#555";
}

function toUpperTrim(value) {
  return (value || "").trim().toUpperCase();
}

// Ẩn/hiện checkbox merge theo loại mã
function updateMergeVisibility() {
  const mode = document.querySelector('input[name="mode"]:checked')?.value;
  // Hiện checkbox cho cả mã sản phẩm & mã nhân viên
  if (mode === "masp" || mode === "manv") {
    mergeRow?.classList.remove("hidden");
  } else {
    mergeRow?.classList.add("hidden");
  }
}


// Cập nhật UI theo quyền
function capNhatTrangThaiQuyenUI() {
  if (!form) return;

  const inputs = form.querySelectorAll("input, button, select, textarea");
  inputs.forEach((el) => {
    if (coQuyenDoiMa) {
      el.disabled = false;
    } else {
      // vẫn cho chọn radio + gõ mã? → để an toàn: khóa hết
      el.disabled = true;
    }
  });

  if (!coQuyenDoiMa) {
    setMsg(
      "Bạn không có quyền sử dụng trang ĐỔI MÃ. Chỉ admin hoặc nhân viên được phép sửa/xóa hóa đơn mới được thao tác.",
      true
    );
  } else {
    setMsg(
      "Bạn có quyền dùng trang đổi mã. Hãy cẩn thận, thao tác này ảnh hưởng nhiều bảng dữ liệu.",
      false
    );
  }
}

/**
 * Kiểm tra quyền đổi mã:
 * - Ưu tiên: dòng dmnhanvien (is_admin, sua_hoadon, xoa_hoadon) theo manv
 * - Chỉ cho phép nếu: is_admin = true OR sua_hoadon = true OR xoa_hoadon = true
 * - Fallback: nếu lỗi đọc dmnhanvien, dùng info.sua_hoadon, info.xoa_hoadon
 */
async function kiemTraQuyenDoiMa(thongTinNguoiDung) {
  console.log("Thông tin đăng nhập dùng để kiểm tra quyền đổi mã:", thongTinNguoiDung);

  if (!thongTinNguoiDung) {
    coQuyenDoiMa = false;
    capNhatTrangThaiQuyenUI();
    return;
  }

  const manv =
    thongTinNguoiDung.manv ||
    thongTinNguoiDung.ma_nv ||
    thongTinNguoiDung.maNhanVien ||
    thongTinNguoiDung.ma_nhan_vien ||
    null;

  const fallbackSua =
    thongTinNguoiDung.sua_hoadon === true || thongTinNguoiDung.suaHoaDon === true;
  const fallbackXoa =
    thongTinNguoiDung.xoa_hoadon === true || thongTinNguoiDung.xoaHoaDon === true;

  // Mặc định: không có quyền
  coQuyenDoiMa = false;

  if (!manv) {
    // không có manv, chỉ còn fallback
    coQuyenDoiMa = fallbackSua || fallbackXoa;
    capNhatTrangThaiQuyenUI();
    return;
  }

  try {
    const { data, error } = await supabase
      .from("dmnhanvien")
      .select("manv, is_admin, sua_hoadon, xoa_hoadon")
      .eq("manv", manv)
      .maybeSingle();

    console.log("Kết quả đọc dmnhanvien theo manv:", { data, error });

    if (error) {
      console.error("Lỗi kiểm tra quyền trong dmnhanvien:", error);
      coQuyenDoiMa = fallbackSua || fallbackXoa;
      capNhatTrangThaiQuyenUI();
      return;
    }

    if (!data) {
      coQuyenDoiMa = fallbackSua || fallbackXoa;
      capNhatTrangThaiQuyenUI();
      return;
    }

    const isAdmin = data.is_admin === true;
    const coSua = data.sua_hoadon === true;
    const coXoa = data.xoa_hoadon === true;

    coQuyenDoiMa = isAdmin || coSua || coXoa || fallbackSua || fallbackXoa;
    capNhatTrangThaiQuyenUI();
  } catch (e) {
    console.error("Lỗi ngoại lệ khi kiểm tra quyền:", e);
    coQuyenDoiMa = fallbackSua || fallbackXoa;
    capNhatTrangThaiQuyenUI();
  }
}

function showResult(data, mode, oldCode, newCode) {
  errorBox?.classList.add("hidden");
  resultBox?.classList.remove("hidden");

  if (!Array.isArray(data) || data.length === 0) {
    resultBox.innerHTML =
      `Đã đổi ${mode === "masp" ? "mã sản phẩm" : "mã nhân viên"} từ <b>${oldCode}</b> sang <b>${newCode}</b>. `
      + "Function không trả về thống kê chi tiết.";
    return;
  }

  let html = "";
  html += `Đã đổi ${mode === "masp" ? "mã sản phẩm" : "mã nhân viên"} từ <b>${oldCode}</b> sang <b>${newCode}</b>.<br/>`;
  html += "Thống kê số dòng cập nhật:<br/>";
  html += "<table><thead><tr><th>Bảng</th><th>Số dòng cập nhật</th></tr></thead><tbody>";
  for (const row of data) {
    html += `<tr><td>${row.table_name}</td><td>${row.updated_rows}</td></tr>`;
  }
  html += "</tbody></table>";

  resultBox.innerHTML = html;
}

function showError(message) {
  resultBox?.classList.add("hidden");
  errorBox?.classList.remove("hidden");
  errorBox.textContent = message;
}

// Xử lý submit form
async function handleSubmit(e) {
  e.preventDefault();

  if (!coQuyenDoiMa) {
    alert("Bạn không có quyền sử dụng chức năng ĐỔI MÃ. Chỉ admin hoặc người có quyền sửa/xóa hóa đơn.");
    return;
  }

  const mode = document.querySelector('input[name="mode"]:checked')?.value;
  const oldCode = toUpperTrim(oldCodeInput?.value);
  const newCode = toUpperTrim(newCodeInput?.value);
  const mergeIfExists = mergeCheckbox?.checked ?? false;

  if (!oldCode || !newCode) {
    showError("Vui lòng nhập đầy đủ mã cũ và mã mới.");
    return;
  }

  if (oldCode === newCode) {
    showError("Mã cũ và mã mới trùng nhau. Không cần đổi.");
    return;
  }

  const confirmText =
    `Bạn chắc chắn muốn đổi ${mode === "masp" ? "mã sản phẩm" : "mã nhân viên"} `
    + `từ "${oldCode}" sang "${newCode}"?\n`
    + "Hành động này ảnh hưởng đến nhiều bảng dữ liệu, chỉ dùng khi thực sự cần.";
  if (!window.confirm(confirmText)) {
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Đang xử lý...";

  try {
    let data, error;

    if (mode === "masp") {
      ({ data, error } = await supabase.rpc("rename_masp", {
        p_old_code: oldCode,
        p_new_code: newCode,
        p_merge_if_exists: mergeIfExists
      }));
    } else {
      ({ data, error } = await supabase.rpc("rename_manv", {
        p_old_manv: oldCode,
        p_new_manv: newCode,
        p_merge_if_exists: mergeIfExists   // <<< thêm dòng này
      }));
    }


    if (error) {
      console.error("RPC error:", error);
      showError("Lỗi khi gọi function: " + (error.message || JSON.stringify(error)));
    } else {
      showResult(data, mode, oldCode, newCode);
    }
  } catch (err) {
    console.error(err);
    showError("Lỗi không xác định: " + err.message);
  } finally {
    submitBtn.disabled = !coQuyenDoiMa; // nếu không có quyền thì để disabled luôn
    submitBtn.textContent = "Thực hiện đổi mã";
  }
}

function attachEventsSauKhiCoQuyen() {
  if (!form) return;

  // radio thay đổi: ẩn/hiện merge
  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.addEventListener("change", updateMergeVisibility);
  });
  updateMergeVisibility();

  form.addEventListener("submit", handleSubmit);

  // focus mặc định vào ô mã cũ
  oldCodeInput?.focus();
}

// Gọi sau khi login thành công – GIỐNG duyetca.js: nhận thông tin người dùng
async function onLoginSuccess(thongTinNguoiDung) {
  thongTinNguoiDungHienTai = thongTinNguoiDung;

  await kiemTraQuyenDoiMa(thongTinNguoiDung);
  // Nếu có quyền thì mới gắn event và cho phép dùng form
  if (coQuyenDoiMa) {
    attachEventsSauKhiCoQuyen();
  }
}

// Khởi tạo login giống trang duyệt ca
document.addEventListener("DOMContentLoaded", () => {
  khoiTaoDangNhapDungChung({
    loginContainerId: "login-container",
    appContainerId: "app-container",
    loginApiPath: "/api/login-cs1", // giống duyetca, nếu đổi cơ sở thì sửa path này
    onLoginSuccess
  });
});
