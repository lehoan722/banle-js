// duyetca.js - Quản lý duyệt ca (login + kiểm tra quyền is_admin với log chi tiết)

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
 * CHỈ KIỂM TRA CỘT is_admin:
 * - nếu is_admin = TRUE -> được quyền duyệt / từ chối
 * - nếu FALSE hoặc không tìm thấy -> chỉ được xem danh sách
 *
 * Ưu tiên tìm theo manv; nếu không có, thử tìm theo user_id.
 */
async function kiemTraQuyenDuyetCa() {
  try {
    const info =
      window.thongTinNguoiDung ||
      window.thongTinDangNhap ||
      window.currentUserInfo ||
      null;

    console.log("Thong tin dang nhap (authModule):", info);

    const manv   = info?.manv || info?.ma_nv || info?.maNhanVien || null;
    const userId = info?.user_id || info?.id || null;

    if (!manv && !userId) {
      console.warn("Không tìm thấy manv hoặc user_id từ thông tin đăng nhập.");
      coQuyenDuyetCa = false;
      setMsg("Không xác định được nhân viên, tạm thời chỉ được xem danh sách.", true);
      return;
    }

    let query = supabase.from("dmnhanvien").select("manv, is_admin, user_id");

    if (manv) {
      query = query.eq("manv", manv);
      console.log("Kiểm tra quyền theo manv =", manv);
    } else if (userId) {
      query = query.eq("user_id", userId);
      console.log("Kiểm tra quyền theo user_id =", userId);
    }

    const { data, error } = await query.maybeSingle();

    console.log("Kết quả dmnhanvien:", { data, error });

    if (error) {
      console.error("Lỗi kiểm tra quyền trong dmnhanvien:", error);
      coQuyenDuyetCa = false;
      setMsg("Lỗi kiểm tra quyền, tạm thời chỉ được xem danh sách.", true);
      return;
    }

    if (!data) {
      console.warn("Không tìm thấy dòng dmnhanvien tương ứng.");
      coQuyenDuyetCa = false;
      setMsg("Không tìm thấy nhân viên trong danh mục, tạm thời chỉ được xem danh sách.", true);
      return;
    }

    coQuyenDuyetCa = !!data.is_admin;

    if (!coQuyenDuyetCa) {
      setMsg(
        `Bạn (${data.manv}) KHÔNG có quyền duyệt/từ chối ca (is_admin = FALSE). Chỉ được xem danh sách đăng ký.`,
        true
      );
    } else {
      setMsg(`Bạn (${data.manv}) là admin, được quyền duyệt/từ chối ca.`, false);
    }
  } catch (e) {
    console.error("Lỗi ngoại lệ khi kiểm tra quyền:", e);
    coQuyenDuyetCa = false;
    setMsg("Lỗi kiểm tra quyền, tạm thời chỉ được xem danh sách.", true);
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

// Gọi sau khi login thành công
async function onLoginSuccess() {
  defaultRangeIfEmpty();
  attachEvents();
  await kiemTraQuyenDuyetCa(); // kiểm tra is_admin
  await loadRequests();
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
