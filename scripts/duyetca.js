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
  // Build headcount timeline by time blocks for ONE site (diadiem)
  // ✅ Only CA_LAM adds headcount
  // ✅ Any NGHI_* removes headcount in the overlapped time range (e.g. NGHI_CA_NGAY, NGHI_THEO_GIO)
  // ❌ DI_MUON / VE_SOM / etc. do not affect headcount summary

  const toMin = (t) => {
    if (!t) return null;
    const s = String(t).trim();
    // supports 'HH:MM' or 'HH:MM:SS'
    const parts = s.split(":");
    if (parts.length < 2) return null;
    const hh = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    return hh * 60 + mm;
  };

  const toHM = (m) => {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const normType = (x) => String(x || "").trim().toUpperCase();

  const intervalsWork = [];   // { manv, s, e }
  const intervalsOff = [];    // { manv, s, e }

  for (const r of rows) {
    const loai = normType(r.loai_dang_ky);
    const stt = normType(r.trang_thai);

    // skip cancelled/rejected for all types
    if (stt === "HUY" || stt === "TU_CHOI") continue;

    const s = toMin(r.gio_bat_dau);
    const e = toMin(r.gio_ket_thuc);

    if (s == null || e == null) continue;

    const manv = String(r.manv || "").trim().toUpperCase();
    if (!manv) continue;

    // only CA_LAM counts as working
    if (loai === "CA_LAM") {
      intervalsWork.push({ manv, s, e });
      continue;
    }

    // any NGHI_* removes headcount (nghỉ cả ngày / nghỉ theo giờ / ...)
    if (loai.startsWith("NGHI")) {
      intervalsOff.push({ manv, s, e });
      continue;
    }
  }

  // if no working interval -> no blocks
  if (intervalsWork.length === 0) return [];

  // Boundaries are built from BOTH working and off intervals (to split correctly)
  const boundsSet = new Set();
  for (const it of intervalsWork) {
    boundsSet.add(it.s);
    boundsSet.add(it.e);
  }
  for (const it of intervalsOff) {
    boundsSet.add(it.s);
    boundsSet.add(it.e);
  }
  const bounds = Array.from(boundsSet).sort((a, b) => a - b);

  // Helper: who is "present" in [a,b)
  const presentSet = (a, b) => {
    const pres = new Set();

    // add CA_LAM covering segment
    for (const it of intervalsWork) {
      if (it.s <= a && it.e >= b) pres.add(it.manv);
    }

    if (pres.size === 0) return pres;

    // remove any NGHI covering segment
    for (const it of intervalsOff) {
      if (it.s <= a && it.e >= b) pres.delete(it.manv);
    }

    return pres;
  };

  const blocks = [];
  let lastKey = null;
  let lastSet = new Set();
  let blockStart = null;

  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i];
    const b = bounds[i + 1];
    if (a === b) continue;

    const curSet = presentSet(a, b);
    const curArr = Array.from(curSet).sort();
    const curKey = curArr.join("|");

    // skip empty segments (nobody present)
    if (!curKey) {
      // close existing block if any
      if (lastKey) {
        blocks.push({
          start: toHM(blockStart),
          end: toHM(a),
          employees: Array.from(lastSet).sort(),
          count: lastSet.size,
        });
        lastKey = null;
        lastSet = new Set();
        blockStart = null;
      }
      continue;
    }

    if (!lastKey) {
      // start new block
      lastKey = curKey;
      lastSet = curSet;
      blockStart = a;
      continue;
    }

    if (curKey !== lastKey) {
      // close old block at boundary a
      blocks.push({
        start: toHM(blockStart),
        end: toHM(a),
        employees: Array.from(lastSet).sort(),
        count: lastSet.size,
      });

      // start new block
      lastKey = curKey;
      lastSet = curSet;
      blockStart = a;
    }
  }

  // close last block
  if (lastKey) {
    const endMin = bounds[bounds.length - 1];
    blocks.push({
      start: toHM(blockStart),
      end: toHM(endMin),
      employees: Array.from(lastSet).sort(),
      count: lastSet.size,
    });
  }

  return blocks;
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
