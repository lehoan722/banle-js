// duyetca.js - Quản lý duyệt ca (có login + kiểm tra quyền)

import { supabase } from "./supabaseClient.js";
import { khoiTaoDangNhapDungChung } from "./authModule.js";

const diadiemSelect   = document.getElementById("diadiem");
const trangThaiSelect = document.getElementById("trang_thai");
const btnLoad         = document.getElementById("btn-load");
const tbody           = document.getElementById("tbody-duyet");
const msgEl           = document.getElementById("msg");

const fromDateInput   = document.getElementById("from_date");
const toDateInput     = document.getElementById("to_date");

// Biến toàn cục: người đang đăng nhập có quyền duyệt / từ chối hay không
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
 * Lấy thông tin người đăng nhập và kiểm tra trong dmnhanvien
 * Chỉ những ai được gắn quyền mới được duyệt / từ chối.
 *
 * Giả định bảng dmnhanvien có các cột:
 *  - duoc_duyet_ca (boolean)  // ưu tiên
 *  - quyen_sua (boolean)
 *  - quyen_xoa (boolean)
 *
 * Nếu bạn đang dùng tên cột khác, chỉ cần sửa ở đây.
 */
async function kiemTraQuyenDuyetCa() {
  try {
    const info =
      window.thongTinNguoiDung ||
      window.thongTinDangNhap ||
      window.currentUserInfo ||
      null;

    const manv = info?.manv;
    if (!manv) {
      console.warn("Không tìm thấy manv từ thông tin đăng nhập.");
      coQuyenDuyetCa = false;
      setMsg("Không xác định được mã nhân viên, tạm thời chỉ được xem danh sách.", true);
      return;
    }

    const { data, error } = await supabase
      .from("dmnhanvien")
      .select("manv, sua_hoadon, xoa_hoadon")
      .eq("manv", manv)
      .maybeSingle();

    if (error) {
      console.error("Lỗi kiểm tra quyền trong dmnhanvien:", error);
      coQuyenDuyetCa = false;
      setMsg("Lỗi kiểm tra quyền, tạm thời chỉ được xem danh sách.", true);
      return;
    }

    // Xác định quyền:
    // 1. Nếu có trường duoc_duyet_ca = true -> được duyệt
    // 2. Hoặc có quyen_sua hoặc quyen_xoa = true -> cũng cho duyệt
    coQuyenDuyetCa =
      
      !!(data?.sua_hoadon) ||
      !!(data?.xoa_hoadon);

    if (!coQuyenDuyetCa) {
      setMsg(
        `Bạn (${manv}) KHÔNG có quyền duyệt/từ chối ca. Chỉ được xem danh sách đăng ký.`,
        true
      );
    } else {
      setMsg(`Bạn (${manv}) có quyền duyệt/từ chối ca.`, false);
    }
  } catch (e) {
    console.error("Lỗi ngoại lệ khi kiểm tra quyền:", e);
    coQuyenDuyetCa = false;
    setMsg("Lỗi kiểm tra quyền, tạm thời chỉ được xem danh sách.", true);
  }
}

async function loadRequests() {
  defaultRangeIfEmpty();

  const diadiem     = diadiemSelect.value;
  const trang_thai  = trangThaiSelect.value;
  const fromDate    = fromDateInput.value;
  const toDate      = toDateInput.value;

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
          <button data-act="reject" data-id="${row.id}" ${disabledAttr}>Từ chối</button>
        </td>
      </tr>
    `;
  });

  setMsg(`Đã tải xong (${data.length} dòng).`);
}

async function updateStatus(id, newStatus) {
  if (!coQuyenDuyetCa) {
    alert("Bạn không có quyền duyệt/từ chối ca.");
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

// Được gọi sau khi login thành công
async function onLoginSuccess() {
  defaultRangeIfEmpty();
  attachEvents();
  await kiemTraQuyenDuyetCa(); // kiểm tra quyền trước
  await loadRequests();        // rồi mới tải dữ liệu
}

// Khởi tạo login giống các trang khác
document.addEventListener("DOMContentLoaded", () => {
  khoiTaoDangNhapDungChung({
    loginContainerId: "login-container",
    appContainerId: "app-container",
    loginApiPath: "/api/login-cs1",
    onLoginSuccess
  });
});
