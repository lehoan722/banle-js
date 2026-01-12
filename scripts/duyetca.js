// duyetca.js - Quản lý duyệt ca (login + kiểm tra quyền is_admin bằng manv)

import { supabase } from "./supabaseClient.js";
import { khoiTaoDangNhapDungChung } from "./authModule.js";

const diadiemSelect = document.getElementById("diadiem");
const trangThaiSelect = document.getElementById("trang_thai");
const btnLoad = document.getElementById("btn-load");
const tbody = document.getElementById("tbody-duyet");
const msgEl = document.getElementById("msg");

const fromDateInput = document.getElementById("from_date");
const toDateInput = document.getElementById("to_date");

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

  // 3 ngày trước
  const threeDaysBefore = new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000); // - la truoc + la sau ngay hien tai
  // 3 ngày sau
  const threeDaysAfter = new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000);

  if (!fromDateInput.value) fromDateInput.value = formatISO(threeDaysBefore);
  if (!toDateInput.value) toDateInput.value = formatISO(threeDaysAfter);
}


/**
 * Kiểm tra quyền duyệt ca:
 * - Ưu tiên: dmnhanvien.is_admin (theo manv)
 * - Fallback: nếu không đọc được dmnhanvien mà info.sua_hoadon === true
 */
async function kiemTraQuyenDuyetCa(thongTinNguoiDung) {
  console.log("Thông tin đăng nhập dùng để kiểm tra quyền:", thongTinNguoiDung);

  if (!thongTinNguoiDung) {
    coQuyenDuyetCa = false;
    setMsg("Không xác định được thông tin nhân viên, tạm thời chỉ được xem danh sách.", true);
    return;
  }

  const manv =
    thongTinNguoiDung.manv ||
    thongTinNguoiDung.ma_nv ||
    thongTinNguoiDung.maNhanVien ||
    thongTinNguoiDung.ma_nhan_vien ||
    null;

  const fallbackSuaHoaDon = thongTinNguoiDung.sua_hoadon === true;

  if (!manv) {
    // không có manv, chỉ còn fallback
    coQuyenDuyetCa = fallbackSuaHoaDon;
    if (coQuyenDuyetCa) {
      setMsg("Không tìm được mã nhân viên nhưng có quyền sửa hóa đơn, cho phép duyệt ca.", false);
    } else {
      setMsg("Không tìm được mã nhân viên, tạm thời chỉ được xem danh sách.", true);
    }
    return;
  }

  try {
    const { data, error } = await supabase
      .from("dmnhanvien")
      .select("manv, is_admin")
      .eq("manv", manv)
      .maybeSingle();

    console.log("Kết quả đọc dmnhanvien theo manv:", { data, error });

    if (error) {
      console.error("Lỗi kiểm tra quyền trong dmnhanvien:", error);
      // lỗi thì dùng fallback
      coQuyenDuyetCa = fallbackSuaHoaDon;
      if (coQuyenDuyetCa) {
        setMsg(
          `Lỗi kiểm tra quyền trong dmnhanvien, nhưng ${manv} có quyền sửa hóa đơn nên được phép duyệt ca.`,
          false
        );
      } else {
        setMsg("Lỗi kiểm tra quyền, tạm thời chỉ được xem danh sách.", true);
      }
      return;
    }

    if (!data) {
      // không có dòng dmnhanvien phù hợp
      coQuyenDuyetCa = fallbackSuaHoaDon;
      if (coQuyenDuyetCa) {
        setMsg(
          `Không tìm thấy ${manv} trong dmnhanvien, nhưng có quyền sửa hóa đơn nên được phép duyệt ca.`,
          false
        );
      } else {
        setMsg(
          `Không tìm thấy ${manv} trong dmnhanvien, tạm thời chỉ được xem danh sách.`,
          true
        );
      }
      return;
    }

    const isAdmin = data.is_admin === true;

    coQuyenDuyetCa = isAdmin || fallbackSuaHoaDon;

    if (!coQuyenDuyetCa) {
      setMsg(
        `Bạn (${manv}) KHÔNG có quyền duyệt/từ chối ca (is_admin = FALSE). Chỉ được xem danh sách đăng ký.`,
        true
      );
    } else if (isAdmin) {
      setMsg(`Bạn (${manv}) là admin (is_admin = TRUE), được quyền duyệt/từ chối ca.`, false);
    } else {
      setMsg(
        `Bạn (${manv}) không phải admin nhưng có quyền sửa hóa đơn, cho phép duyệt/từ chối ca.`,
        false
      );
    }
  } catch (e) {
    console.error("Lỗi ngoại lệ khi kiểm tra quyền:", e);
    coQuyenDuyetCa = fallbackSuaHoaDon;
    if (coQuyenDuyetCa) {
      setMsg("Lỗi kiểm tra quyền, tạm dùng quyền sửa hóa đơn để cho phép duyệt ca.", false);
    } else {
      setMsg("Lỗi kiểm tra quyền, tạm thời chỉ được xem danh sách.", true);
    }
  }
}

async function loadRequests() {
  defaultRangeIfEmpty();

  const diadiem = diadiemSelect.value;
  const trang_thai = trangThaiSelect.value;
  const fromDate = fromDateInput.value;
  const toDate = toDateInput.value;

  if (fromDate && toDate && fromDate > toDate) {
    setMsg("'Từ ngày' phải nhỏ hơn hoặc bằng 'Đến ngày'.", true);
    return;
  }

  setMsg("Đang tải danh sách...");

  let query = supabase.from("lichlam_dangky").select("*");

  if (diadiem) query = query.eq("diadiem", diadiem);
  if (trang_thai) query = query.eq("trang_thai", trang_thai);
  if (fromDate) query = query.gte("ngay", fromDate);
  if (toDate) query = query.lte("ngay", toDate);


  query = query
    .order("ngay", { ascending: true })
    .order("diadiem", { ascending: true })
    .order("gio_bat_dau", { ascending: true })
    .order("manv", { ascending: true });


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
        <td>${row.gio_bat_dau?.slice(0, 5)} - ${row.gio_ket_thuc?.slice(0, 5)}</td>
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

    const id = btn.dataset.id;
    const act = btn.dataset.act;
    if (!id || !act) return;

    if (act === "approve") {
      updateStatus(id, "DA_DUYET");
    } else if (act === "reject") {
      updateStatus(id, "TU_CHOI");
    }
  });
}

// Gọi sau khi login thành công – NHẬN THAM SỐ thông tin người dùng
async function onLoginSuccess(thongTinNguoiDung) {
  window.thongTinNguoiDung = thongTinNguoiDung; // lưu lại nếu cần dùng chỗ khác

  await kiemTraQuyenDuyetCa(thongTinNguoiDung); // kiểm tra is_admin + fallback
  defaultRangeIfEmpty();
  attachEvents();
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
