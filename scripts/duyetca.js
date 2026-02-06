// duyetca.js - Quản lý duyệt ca (login + kiểm tra quyền is_admin bằng manv)

import { supabase } from "./supabaseClient.js";
import { khoiTaoDangNhapDungChung } from "./authModule.js";

const diadiemSelect = document.getElementById("diadiem");
const trangThaiSelect = document.getElementById("trang_thai");
const btnLoad = document.getElementById("btn-load");
const tbody = document.getElementById("tbody-duyet");
const msgEl = document.getElementById("msg");
const summaryEl = document.getElementById("summary");
const btnApproveAll = document.getElementById("btn-approve-all");


const fromDateInput = document.getElementById("from_date");
const toDateInput = document.getElementById("to_date");

// người đăng nhập hiện tại có quyền duyệt hay không
let coQuyenDuyetCa = false;
let currentRows = []; // lưu data đang hiển thị theo filter hiện tại 

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

function clearSummary() {
  if (summaryEl) summaryEl.innerHTML = "";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// nhận "07:30" hoặc "07:30:00" -> phút trong ngày
function toMinutes(timeStr) {
  if (!timeStr) return null;
  const s = String(timeStr).slice(0, 5); // "HH:MM"
  const [h, m] = s.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToHHMM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

// multiset để tránh lỗi nếu 1 manv có overlap nhiều dòng
function addActive(activeCount, manv) {
  if (!manv) return;
  activeCount.set(manv, (activeCount.get(manv) || 0) + 1);
}

function removeActive(activeCount, manv) {
  if (!manv) return;
  const cur = activeCount.get(manv) || 0;
  if (cur <= 1) activeCount.delete(manv);
  else activeCount.set(manv, cur - 1);
}

function buildTimelineForOneSite(rows) {
  if (!rows || rows.length === 0) return [];

  // --- Helper: parse "HH:MM" -> minutes
  const toMin = (t) => hhmmToMinutes(t);
  const norm = (s) => (s || "").toString().trim().toUpperCase();

  // --- 1) Tách nhóm theo loại đăng ký
  const caLam = rows.filter(r => norm(r.loai_dang_ky) === "CA_LAM");
  const nghiCaNgay = rows.filter(r => norm(r.loai_dang_ky) === "NGHI_CA_NGAY");
  const nghiTheoGio = rows.filter(r => norm(r.loai_dang_ky) === "NGHI_THEO_GIO");

  // --- 2) Tập nhân viên nghỉ cả ngày (loại khỏi mọi giờ)
  const offAllDay = new Set(nghiCaNgay.map(r => norm(r.manv)).filter(Boolean));

  // --- 3) Build work intervals từ CA_LAM
  // intervals: { manv, start, end }
  let intervals = [];
  for (const r of caLam) {
    const manv = norm(r.manv);
    if (!manv) continue;
    if (offAllDay.has(manv)) continue;

    const start = toMin(r.gio_bat_dau);
    const end = toMin(r.gio_ket_thuc);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

    intervals.push({ manv, start, end });
  }

  // --- 4) Trừ nghỉ theo giờ khỏi intervals (split interval)
  // nghỉ theo giờ ưu tiên dùng tu_gio/den_gio nếu có, không thì fallback gio_bat_dau/gio_ket_thuc
  const subtractOne = (work, off) => {
    // no overlap
    if (off.end <= work.start || off.start >= work.end) return [work];
    // off covers all
    if (off.start <= work.start && off.end >= work.end) return [];
    // cut left
    if (off.start <= work.start && off.end < work.end) {
      return [{ ...work, start: off.end }];
    }
    // cut right
    if (off.start > work.start && off.end >= work.end) {
      return [{ ...work, end: off.start }];
    }
    // split middle
    return [
      { ...work, end: off.start },
      { ...work, start: off.end }
    ].filter(x => x.end > x.start);
  };

  for (const r of nghiTheoGio) {
    const manv = norm(r.manv);
    if (!manv) continue;

    const s = r.tu_gio || r.gio_bat_dau;
    const e = r.den_gio || r.gio_ket_thuc;

    const offStart = toMin(s);
    const offEnd = toMin(e);
    if (!Number.isFinite(offStart) || !Number.isFinite(offEnd) || offEnd <= offStart) continue;

    const off = { start: offStart, end: offEnd };

    // apply subtract to all work intervals of this manv
    const newIntervals = [];
    for (const w of intervals) {
      if (w.manv !== manv) {
        newIntervals.push(w);
      } else {
        const parts = subtractOne(w, off);
        newIntervals.push(...parts);
      }
    }
    intervals = newIntervals;
  }

  // --- 5) Build timeline edges from intervals
  if (intervals.length === 0) return [];

  const edges = new Set();
  for (const it of intervals) {
    edges.add(it.start);
    edges.add(it.end);
  }
  const points = [...edges].sort((a, b) => a - b);

  const lines = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    if (to <= from) continue;

    const manvSet = new Set();
    for (const it of intervals) {
      if (it.start < to && it.end > from) manvSet.add(it.manv);
    }

    const manvs = [...manvSet].sort();
    lines.push({
      from: minutesToHHMM(from),
      to: minutesToHHMM(to),
      count: manvs.length,
      manvs
    });
  }

  return lines;
}

function renderTimelineSummaryIfSingleDay(data, fromDate, toDate, diadiemFilter) {
  if (!summaryEl) return;

  // chỉ khi đúng 1 ngày
  const isOneDay = fromDate && toDate && fromDate === toDate;
  if (!isOneDay) {
    clearSummary();
    return;
  }

  const makeBlock = (site, color) => {
    const rows = data.filter((x) => x.diadiem === site);
    const lines = buildTimelineForOneSite(rows);

    if (lines.length === 0) {
      return `<div style="color:${color};font-weight:600;">${site}: (không có dữ liệu)</div>`;
    }

    let html = `<div style="color:${color};font-weight:600;">${site}:</div>`;
    for (const ln of lines) {
      const txt =
        ln.count === 0
          ? `${ln.from} - ${ln.to} : 0 người`
          : `${ln.from} - ${ln.to} : ${ln.count} người (${ln.manvs.join(", ")})`;

      html += `<div style="margin-left:14px;color:${ln.count === 0 ? "#c62828" : "#333"};">${txt}</div>`;
    }
    return html;
  };

  let html = "";
  if (!diadiemFilter) {
    html += makeBlock("cs1", "blue");
    html += makeBlock("cs2", "red");
  } else if (diadiemFilter === "cs1") {
    html += makeBlock("cs1", "blue");
  } else if (diadiemFilter === "cs2") {
    html += makeBlock("cs2", "red");
  }

  summaryEl.innerHTML = html;
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

  currentRows = data || [];

  // Nếu không có quyền -> disable nút Duyệt / Từ chối + readonly ghi chú
  const disabledAttr = coQuyenDuyetCa ? "" : "disabled";

  tbody.innerHTML = "";
  data.forEach((row) => {
    tbody.innerHTML += `
      <tr>
        <td>${row.id}</td>
<td>${row.ngay}</td>
<td>${row.diadiem}</td>

<!-- GIỜ -->
<td>${row.gio_bat_dau?.slice(0, 5)} - ${row.gio_ket_thuc?.slice(0, 5)}</td>

<!-- LOẠI -->
<td style="font-weight:600; color:${row.loai_dang_ky?.startsWith("NGHI")
        ? "#d35400"
        : row.loai_dang_ky === "DI_MUON" || row.loai_dang_ky === "VE_SOM"
          ? "#8e44ad"
          : "#2c3e50"
      }">
  ${row.loai_dang_ky || "CA_LAM"}
</td>

<!-- NHÂN VIÊN -->
<td>${row.manv}</td>

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
          <button data-act="delete"  data-id="${row.id}" ${disabledAttr}>Xóa</button>

        </td>
      </tr>
    `;
  });

  renderTimelineSummaryIfSingleDay(data, fromDate, toDate, diadiem);
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

async function deleteRequest(id) {
  if (!coQuyenDuyetCa) {
    alert("Bạn không có quyền xóa đăng ký ca (chỉ admin được phép).");
    return;
  }

  const ok = confirm(`Bạn có chắc muốn XÓA đăng ký ca này không? (ID=${id})`);
  if (!ok) return;

  const { error } = await supabase
    .from("lichlam_dangky")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Lỗi delete lichlam_dangky:", error);
    alert("Xóa đăng ký thất bại.");
    return;
  }

  await loadRequests();
}


async function approveAllVisible() {
  if (!coQuyenDuyetCa) {
    alert("Bạn không có quyền duyệt/từ chối ca (chỉ admin được phép).");
    return;
  }

  if (!currentRows || currentRows.length === 0) {
    alert("Không có dữ liệu để duyệt.");
    return;
  }

  // Chỉ duyệt những dòng đang CHO_DUYET trong danh sách hiện tại
  const ids = currentRows
    .filter((r) => r.trang_thai === "CHO_DUYET")
    .map((r) => r.id);

  if (ids.length === 0) {
    alert("Không có ca nào ở trạng thái CHỜ DUYỆT trong danh sách hiện tại.");
    return;
  }

  const ok = confirm(`Bạn có chắc muốn DUYỆT TẤT CẢ ${ids.length} ca đang CHỜ DUYỆT không?`);
  if (!ok) return;

  // Update hàng loạt
  const { error } = await supabase
    .from("lichlam_dangky")
    .update({
      trang_thai: "DA_DUYET",
      updated_at: new Date().toISOString()
    })
    .in("id", ids);

  if (error) {
    console.error("Lỗi duyệt tất cả:", error);
    alert("Duyệt tất cả thất bại.");
    return;
  }

  await loadRequests();
}


function attachEvents() {
  btnLoad.addEventListener("click", loadRequests);
  btnApproveAll?.addEventListener("click", approveAllVisible);

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
    else if (act === "delete") {
      deleteRequest(id);
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
