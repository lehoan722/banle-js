// dmnhanvien.js
// Module dùng chung cho danh mục nhân viên

import { supabase } from "./supabaseClient.js";

/**
 * Lấy danh sách nhân viên từ bảng dmnhanvien
 * @returns {Promise<Array<{manv:string, tennv:string|null, diadiem?:string}>>}
 */
export async function fetchDmNhanVien() {
  const { data, error } = await supabase
    .from("dmnhanvien")
    .select("manv, tennv, diadiem")
    .order("manv", { ascending: true });

  if (error) {
    console.error("Lỗi tải danh mục nhân viên:", error);
    throw error;
  }

  return data || [];
}

/**
 * Đổ danh mục nhân viên vào 1 <datalist> hoặc <select>.
 *
 * @param {HTMLElement} targetEl - thẻ <datalist> hoặc <select>
 * @param {Object} options
 *    - includeEmptyOption: thêm option rỗng đầu tiên (chỉ dùng với <select>)
 *    - showName: có hiển thị tên nhân viên không
 *    - showDiadiem: có hiển thị cơ sở không
 */
export async function fillNhanVienDropdown(targetEl, options = {}) {
  if (!targetEl) return;

  const list = await fetchDmNhanVien();

  const {
    includeEmptyOption = false,
    showName = true,
    showDiadiem = false
  } = options;

  targetEl.innerHTML = "";

  if (includeEmptyOption && targetEl.tagName === "SELECT") {
    const optEmpty = document.createElement("option");
    optEmpty.value = "";
    optEmpty.textContent = "";
    targetEl.appendChild(optEmpty);
  }

  list.forEach((nv) => {
    const opt = document.createElement("option");
    opt.value = nv.manv;

    let label = nv.manv;
    if (showName && nv.tennv) {
      label += ` - ${nv.tennv}`;
    }
    if (showDiadiem && nv.diadiem) {
      label += ` (${nv.diadiem})`;
    }

    opt.textContent = label;
    targetEl.appendChild(opt);
  });

  return list;
}
