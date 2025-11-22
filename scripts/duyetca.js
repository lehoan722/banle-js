// duyetca.js - Quản lý duyệt ca (login + kiểm tra quyền is_admin từ thông tin đăng nhập)

import { supabase } from "./supabaseClient.js";
import { khoiTaoDangNhapDungChung } from "./authModule.js";

const diadiemSelect   = document.getElementById("diadiem");
const trangThaiSelect = document.getElementById("trang_thai");
const btnLoad         = document.getElementById("btn-load");
const tbody           = document.getElementById("tbody-duyet");
const msgEl           = document.getElementById("msg");

const fromDateInput   = document.getElementById("from_date");
const toDateInput     = document.getElementById("to_date");

// người đăng nhập hiện tại có quyền duyệt hay không
let coQuyenDuyetCa = false;

function setMsg(text, isError = false) {
  msgEl.textContent = text || "";
  msgEl.style.color = isError ? "#c62828" : "#555";
}

function formatISO(d) {
  return d.toISOString().slice(0, 10);
}

function defaultRangeIfEmpty() {
  const today = new Date();
  const last7 = new Date(today.getTime() - 6 * 86400000);
  if (!fromDateInput.value) fromDateInput.value = formatISO(last7);
  if (!toDateInput.value)   toDateInput.value   = formatISO(today);
}

/**
 * Dùng trực tiếp thông tin authModule trả về:
 * - Nếu is_admin = TRUE -> được quyền duyệt / từ chối
 * - Ngược lại -> chỉ được xem danh sách
 */
function kiemTraQuyenDuyetCaTuLogin(info) {
  console.log("Thông tin đăng nhập dùng để kiểm tra quyền:", info);

  if (!info) {
    coQuyenDuyetCa = false;
    setMsg("Không xác định được thông tin nhân viên, tạm thời chỉ được xem danh sách.", true);
    return;
  }

  // cố gắng lấy manv & is_admin với nhiều tên key khác nhau cho chắc
  const manv =
    info.manv ||
    info.ma_nv ||
    info.maNhanVien ||
    info.ma_nhan_vien ||
    info.profile?.manv ||
    null;

  const isAdminRaw =
    info.is_admin ??
    info.isAdmin ??
    info.profile?.is_admin ??
    info.profile?.isAdmin ??
    null;

  const isAdminBool =
    isAdminRaw === true ||
    isAdminRaw === "true" ||
    isAdminRaw === "TRUE" ||
    isAdminRaw === 1 ||
    isAdminRaw === "1";

  coQuyenDuyetCa = !!isAdminBool;

  if (!coQuyenDuyetCa) {
    setMsg(
      `Bạn${manv ? " (" + manv + ")" : ""} KHÔNG có quyền duyệt/từ chối ca (is_admin = FALSE). Chỉ được xem danh sách đăng ký.`,
      true
    );
  } else {
    setMsg(
      `Bạn${manv ? " (" + manv + ")" : ""} là admin (is_admin = TRUE), được quyền duyệt/từ chối ca.`,
      false
    );
  }
}

async function loadRequests() {
  defaultRangeIfEmpty();

  const diadiem    = diadiemSelect.value;
  const trang_thai = trangThaiSelect.value;
  const fromDate   = fromDateInput.value;
  const toDate     = toDateInput.value;

  if (fromDate && toDate && fromDate > toDate) {
    setMsg("'Từ ngày' phải nhỏ hơn hoặc bằng 'Đến ngày'.", true);
    return;
  }

  setMsg("Đang tải danh sách...");

  let query = supabase.from("lichlam_dangky").select("*");

  if (diadiem)    query = query.eq("diadiem", diadiem);
  if (trang_thai) query = query.eq("trang_thai", trang_thai);
  if (fromDate)   query = query.gte("ngay", fromDate);
  if (toDate)     query = query.lte("ngay", toDate);

  query = query
    .order("ngay")
    .order("diadiem")
    .order("manv");

  const { data, error } = await query;

  if (error) {
    console.error("Lỗi load lichlam_dangky:", error);
    tbody.innerHTML = `<tr><td colspan="9" style="color:red;">Lỗi tải dữ liệu.</td></tr>`;
    setMsg("Lỗi tải dữ liệu.", true);
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9">Không có đăng ký phù hợp.</td></tr>`;
    setMsg("Đã tải xong (0 dòng).");
    return;
  }

  // Nếu không có quyền -> disable nút Duyệt / Từ chối + readonly ghi chú
  const disabledAttr = coQuyenDuyetCa ? "" : "disabled";

  tbody.innerHTML = "";
  data.forEach((row) => {
    tbody.innerHTML += `
      <tr>
        <td>${row.id}</td>
        <td>${row.ngay}</td>
        <td>${row.diadiem}</td>
        <td>${row.manv}</td>
        <td>${row.gio_bat_dau?.slice(0,5)} - ${row.gio_ket_thuc?.slice(0,5)}</td>
        <td class="status-${row.trang_thai}">${row.trang_thai}</td>
        <td>${row.ly_do || ""}</td>
        <td>
          <input
            class="note-input"
            data-id="${row.id}"
            value="${row.ghi_chu_admin || ""}"
            style="width:120px;font-size:12px;"
            ${coQuyenDuyetCa ? "" : "readonly"}
          />
        </td>
        <td>
          <button data-act="approve" data-id="${row.id}" ${disabledAttr}>Duyệt</button>
          <button data-act="reject"  data-id="${row.id}" ${disabledAttr}>Từ chối</button>
        </td>
      </tr>
    `;
  });

  setMsg(`Đã tải xong (${data.length} dòng).`);
}

async function updateStatus(id, newStatus) {
  if (!coQuyenDuyetCa) {
    alert("Bạn không có quyền duyệt/từ chối ca (chỉ admin được phép).");
    return;
  }

  const note = document.querySelector(`.note-input[data-id="${id}"]`);
  const ghi_chu_admin = note ? note.value : "";

  const { error } = await supabase
    .from("lichlam_dangky")
    .update({
      trang_thai: newStatus,
      ghi_chu_admin,
      updated_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) {
    console.error("Lỗi update lichlam_dangky:", error);
    alert("Cập nhật trạng thái thất bại.");
    return;
  }

  await loadRequests();
}

function attachEvents() {
  btnLoad.addEventListener("click", loadRequests);

  tbody.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const id  = btn.dataset.id;
    const act = btn.dataset.act;
    if (!id || !act) return;

    if (act === "approve") {
      updateStatus(id, "DA_DUYET");
    } else if (act === "reject") {
      updateStatus(id, "TU_CHOI");
    }
  });
}

// ⚠️ LƯU Ý: NHẬN THAM SỐ thongTinNguoiDung TỪ authModule
async function onLoginSuccess(thongTinNguoiDung) {
  // Lưu global để sau này có thể dùng lại nếu cần
  window.thongTinNguoiDung = thongTinNguoiDung;

  defaultRangeIfEmpty();
  attachEvents();
  kiemTraQuyenDuyetCaTuLogin(thongTinNguoiDung); // dùng chính object trả về
  await loadRequests();
}

// Khởi tạo login giống các trang khác
document.addEventListener("DOMContentLoaded", () => {
  khoiTaoDangNhapDungChung({
    loginContainerId: "login-container",
    appContainerId: "app-container",
    loginApiPath: "/api/login-cs1",
    onLoginSuccess    // <== authModule sẽ gọi onLoginSuccess(thongTinNguoiDung)
  });
});
