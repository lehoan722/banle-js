// duyetca.js - quản lý duyệt ca

import { supabase } from "./supabaseClient.js";

const ngayInput = document.getElementById("ngay");
const diadiemSelect = document.getElementById("diadiem");
const trangThaiSelect = document.getElementById("trang_thai");
const btnLoad = document.getElementById("btn-load");
const tbody = document.getElementById("tbody-duyet");
const msgEl = document.getElementById("msg");

function setToday() {
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  ngayInput.value = iso;
}

function setMsg(text, isError = false) {
  msgEl.textContent = text || "";
  msgEl.style.color = isError ? "#c62828" : "#555";
}

async function loadRequests() {
  const ngay = ngayInput.value;
  const diadiem = diadiemSelect.value;
  const trang_thai = trangThaiSelect.value;

  setMsg("Đang tải danh sách...");

  let query = supabase.from("lichlam_dangky").select("*");

  if (ngay) query = query.eq("ngay", ngay);
  if (diadiem) query = query.eq("diadiem", diadiem);
  if (trang_thai) query = query.eq("trang_thai", trang_thai);

  query = query.order("ngay", { ascending: true }).order("diadiem", { ascending: true }).order("manv", { ascending: true });

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

  tbody.innerHTML = "";
  data.forEach(row => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row.id}</td>
      <td>${row.ngay}</td>
      <td>${row.diadiem}</td>
      <td>${row.manv}</td>
      <td>${row.gio_bat_dau?.slice(0,5)} - ${row.gio_ket_thuc?.slice(0,5)}</td>
      <td class="status-${row.trang_thai}">${row.trang_thai}</td>
      <td>${row.ly_do || ""}</td>
      <td><input type="text" value="${row.ghi_chu_admin || ""}" data-id="${row.id}" class="note-input" style="width:120px;font-size:12px;"/></td>
      <td>
        <button data-act="approve" data-id="${row.id}">Duyệt</button>
        <button data-act="reject" data-id="${row.id}">Từ chối</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  setMsg(`Đã tải xong (${data.length} dòng).`);
}

async function updateStatus(id, newStatus) {
  const noteInput = tbody.querySelector(`input.note-input[data-id="${id}"]`);
  const ghi_chu_admin = noteInput ? noteInput.value : "";

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

document.addEventListener("DOMContentLoaded", () => {
  setToday();

  btnLoad.addEventListener("click", loadRequests);

  tbody.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    const act = btn.getAttribute("data-act");
    if (!id || !act) return;

    if (act === "approve") {
      updateStatus(id, "DA_DUYET");
    } else if (act === "reject") {
      updateStatus(id, "TU_CHOI");
    }
  });
});
