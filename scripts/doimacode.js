// doimacode.js - Đổi mã sản phẩm / nhân viên / khách hàng / nhóm hàng / chủng loại
import { supabase } from "./supabaseClient.js";
import { khoiTaoDangNhapDungChung } from "./authModule.js";

const form = document.getElementById("renameForm");
const oldCodeInput = document.getElementById("oldCode");
const newCodeInput = document.getElementById("newCode");
const mergeRow = document.getElementById("mergeRow");
const mergeCheckbox = document.getElementById("mergeIfExists");
const resultBox = document.getElementById("resultBox");
const errorBox = document.getElementById("errorBox");
const submitBtn = document.getElementById("submitBtn");
const msgEl = document.getElementById("msg");

let coQuyenDoiMa = false;
let thongTinNguoiDungHienTai = null;
let eventsAttached = false;

function setMsg(text, isError = false) {
  if (!msgEl) return;
  msgEl.textContent = text || "";
  msgEl.style.color = isError ? "#c62828" : "#555";
}

function toUpperTrim(value) {
  return (value || "").trim().toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getModeLabel(mode) {
  const labels = {
    masp: "mã sản phẩm",
    manv: "mã nhân viên",
    makh: "mã khách hàng",
    nhomhang: "mã nhóm hàng",
    chungloai: "mã chủng loại"
  };
  return labels[mode] || "mã dữ liệu";
}

function updateMergeVisibility() {
  const mode = document.querySelector('input[name="mode"]:checked')?.value;
  const modesChoPhepGop = ["masp", "manv", "makh", "nhomhang", "chungloai"];

  if (modesChoPhepGop.includes(mode)) {
    mergeRow?.classList.remove("hidden");
  } else {
    mergeRow?.classList.add("hidden");
    if (mergeCheckbox) mergeCheckbox.checked = false;
  }
}

function capNhatTrangThaiQuyenUI() {
  if (!form) return;

  form.querySelectorAll("input, button, select, textarea").forEach((el) => {
    el.disabled = !coQuyenDoiMa;
  });

  if (!coQuyenDoiMa) {
    setMsg("Bạn không có quyền sử dụng trang ĐỔI MÃ. Chỉ admin hoặc nhân viên được phép sửa/xóa hóa đơn mới được thao tác.", true);
  } else {
    setMsg("Bạn có quyền dùng trang đổi mã. Hãy kiểm tra kỹ mã cũ và mã mới trước khi thực hiện.", false);
  }
}

async function kiemTraQuyenDoiMa(thongTinNguoiDung, context) {
  let lsIsAdmin = false;
  let lsSua = false;
  let lsXoa = false;

  try {
    lsIsAdmin = localStorage.getItem("is_admin") === "true";
    lsSua = localStorage.getItem("quyen_sua_hoadon") === "true";
    lsXoa = localStorage.getItem("quyen_xoa_hoadon") === "true";
  } catch (_) {}

  const objIsAdmin = thongTinNguoiDung?.is_admin === true || context?.nhanvien?.is_admin === true;
  const objSua = thongTinNguoiDung?.sua_hoadon === true || thongTinNguoiDung?.suaHoaDon === true || context?.nhanvien?.sua_hoadon === true;
  const objXoa = thongTinNguoiDung?.xoa_hoadon === true || thongTinNguoiDung?.xoaHoaDon === true || context?.nhanvien?.xoa_hoadon === true;

  coQuyenDoiMa = lsIsAdmin || lsSua || lsXoa || objIsAdmin || objSua || objXoa;
  if (coQuyenDoiMa) {
    capNhatTrangThaiQuyenUI();
    return;
  }

  const manv = thongTinNguoiDung?.manv || thongTinNguoiDung?.ma_nv || thongTinNguoiDung?.maNhanVien || thongTinNguoiDung?.ma_nhan_vien || context?.nhanvien?.manv || null;

  if (!manv) {
    capNhatTrangThaiQuyenUI();
    return;
  }

  try {
    const { data, error } = await supabase
      .from("dmnhanvien")
      .select("manv, is_admin, sua_hoadon, xoa_hoadon")
      .eq("manv", String(manv).trim().toUpperCase())
      .maybeSingle();

    if (error || !data) {
      coQuyenDoiMa = false;
    } else {
      coQuyenDoiMa = data.is_admin === true || data.sua_hoadon === true || data.xoa_hoadon === true;
    }
  } catch (e) {
    console.error("Lỗi kiểm tra quyền:", e);
    coQuyenDoiMa = false;
  }

  capNhatTrangThaiQuyenUI();
}

function showResult(data, mode, oldCode, newCode) {
  errorBox?.classList.add("hidden");
  resultBox?.classList.remove("hidden");

  const modeLabel = getModeLabel(mode);
  const safeOld = escapeHtml(oldCode);
  const safeNew = escapeHtml(newCode);

  if (!Array.isArray(data) || data.length === 0) {
    resultBox.innerHTML = `Đã đổi ${modeLabel} từ <b>${safeOld}</b> sang <b>${safeNew}</b>.<br>Function không trả về thống kê chi tiết.`;
    return;
  }

  let html = `Đã đổi ${modeLabel} từ <b>${safeOld}</b> sang <b>${safeNew}</b>.<br>`;
  html += "Thống kê số dòng cập nhật:<br>";
  html += "<table><thead><tr><th>Bảng</th><th>Số dòng cập nhật</th></tr></thead><tbody>";

  for (const row of data) {
    html += `<tr><td>${escapeHtml(row.table_name)}</td><td>${escapeHtml(row.updated_rows)}</td></tr>`;
  }

  html += "</tbody></table>";
  resultBox.innerHTML = html;
}

function showError(message) {
  resultBox?.classList.add("hidden");
  errorBox?.classList.remove("hidden");
  errorBox.textContent = message;
}

async function handleSubmit(e) {
  e.preventDefault();

  if (!coQuyenDoiMa) {
    alert("Bạn không có quyền sử dụng chức năng ĐỔI MÃ.");
    return;
  }

  const mode = document.querySelector('input[name="mode"]:checked')?.value;
  const oldCode = toUpperTrim(oldCodeInput?.value);
  const newCode = toUpperTrim(newCodeInput?.value);
  const mergeIfExists = mergeCheckbox?.checked ?? false;
  const modeLabel = getModeLabel(mode);

  if (!oldCode || !newCode) {
    showError("Vui lòng nhập đầy đủ mã cũ và mã mới.");
    return;
  }

  if (oldCode === newCode) {
    showError("Mã cũ và mã mới trùng nhau. Không cần đổi.");
    return;
  }

  const confirmText =
    `Bạn chắc chắn muốn đổi ${modeLabel} từ "${oldCode}" sang "${newCode}"?\n\n` +
    "Hành động này có thể ảnh hưởng đến nhiều bảng dữ liệu. Chỉ thực hiện khi đã kiểm tra chính xác.";

  if (!window.confirm(confirmText)) return;

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
    } else if (mode === "manv") {
      ({ data, error } = await supabase.rpc("rename_manv", {
        p_old_manv: oldCode,
        p_new_manv: newCode,
        p_merge_if_exists: mergeIfExists
      }));
    } else if (mode === "makh") {
      ({ data, error } = await supabase.rpc("rename_makh", {
        p_old_makh: oldCode,
        p_new_makh: newCode,
        p_merge_if_exists: mergeIfExists
      }));
    } else if (mode === "nhomhang") {
      ({ data, error } = await supabase.rpc("rename_nhomhang", {
        p_old_code: oldCode,
        p_new_code: newCode,
        p_merge_if_exists: mergeIfExists
      }));
    } else if (mode === "chungloai") {
      ({ data, error } = await supabase.rpc("rename_chungloai", {
        p_old_code: oldCode,
        p_new_code: newCode,
        p_merge_if_exists: mergeIfExists
      }));
    } else {
      throw new Error("Loại mã cần đổi không hợp lệ.");
    }

    if (error) {
      console.error("RPC error:", error);
      showError("Lỗi khi gọi function: " + (error.message || JSON.stringify(error)));
    } else {
      showResult(data, mode, oldCode, newCode);
      if (oldCodeInput) oldCodeInput.value = "";
      if (newCodeInput) newCodeInput.value = "";
      if (mergeCheckbox) mergeCheckbox.checked = false;
      oldCodeInput?.focus();
    }
  } catch (err) {
    console.error(err);
    showError("Lỗi không xác định: " + err.message);
  } finally {
    submitBtn.disabled = !coQuyenDoiMa;
    submitBtn.textContent = "Thực hiện đổi mã";
  }
}

function attachEventsSauKhiCoQuyen() {
  if (!form || eventsAttached) return;
  eventsAttached = true;

  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.addEventListener("change", updateMergeVisibility);
  });

  updateMergeVisibility();
  form.addEventListener("submit", handleSubmit);
  oldCodeInput?.focus();
}

async function onLoginSuccess(nhanvienLike, context) {
  thongTinNguoiDungHienTai = nhanvienLike || null;
  await kiemTraQuyenDoiMa(nhanvienLike, context);
  if (coQuyenDoiMa) attachEventsSauKhiCoQuyen();
}

document.addEventListener("DOMContentLoaded", () => {
  khoiTaoDangNhapDungChung({
    loginContainerId: "login-container",
    appContainerId: "app-container",
    loginApiPath: "/api/login-cs1",
    onLoginSuccess
  });
});
