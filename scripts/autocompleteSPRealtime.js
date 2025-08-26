import { supabase } from "./supabaseClient.js";

export function initAutocompleteRealtimeMasp() {
  const input = document.getElementById("masp");
  const popup = document.getElementById("popup_masp");
  if (!input || !popup) return;

  let cursor = -1; // vị trí item đang chọn bằng phím

  function renderList(list) {
    popup.innerHTML = list.map(sp => `
      <div class="goi-y-item" data-masp="${sp.masp}" style="padding:6px;cursor:pointer;border-bottom:1px solid #eee;">
        <b>${sp.masp}</b> - ${sp.tensp || ""}
      </div>
    `).join("");
    popup.style.display = "block";
    popup.style.left = "0";
    popup.style.top = "100%";
    popup.style.zIndex = 9999;
    cursor = -1;
  }

  async function search() {
    const keyword = input.value.trim().toUpperCase();
    if (!keyword || keyword.length < 2) {
      popup.style.display = "none";
      return;
    }
    const { data, error } = await supabase
      .from("dmhanghoa")
      .select("masp, tensp")
      .ilike("masp", `%${keyword}%`)
      .limit(100);
    if (error || !data || data.length === 0) {
      popup.style.display = "none";
      return;
    }
    renderList(data);
  }

  function highlight(idx) {
    const items = popup.querySelectorAll(".goi-y-item");
    items.forEach((el, i) => {
      el.style.background = (i === idx) ? "#e9f3ff" : "";
    });
  }

  function chonMasp(masp) {
    input.value = masp;
    popup.style.display = "none";
    // Ưu tiên gọi logic cũ nếu có:
    if (typeof window.xuLyKhiChonMaSanPham === "function") {
      window.xuLyKhiChonMaSanPham(masp);
    } else {
      // fallback: phát Enter để các listener khác xử lý
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    }
  }

  // gõ ký tự → tìm
  input.addEventListener("input", search);

  // click chọn
  popup.addEventListener("click", (e) => {
    const div = e.target.closest(".goi-y-item");
    if (!div) return;
    chonMasp(div.dataset.masp);
  });

  // điều hướng bằng phím
  input.addEventListener("keydown", (e) => {
    const items = popup.querySelectorAll(".goi-y-item");
    if (popup.style.display !== "none" && items.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        cursor = (cursor + 1) % items.length;
        highlight(cursor);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        cursor = (cursor - 1 + items.length) % items.length;
        highlight(cursor);
        return;
      }
      if (e.key === "Enter") {
        if (cursor >= 0) {
          e.preventDefault();
          const div = items[cursor];
          chonMasp(div.dataset.masp);
          return;
        }
      }
      if (e.key === "Escape") {
        popup.style.display = "none";
        return;
      }
    }
  });

  // Ẩn popup khi click ngoài
  document.addEventListener("click", (e) => {
    if (!popup.contains(e.target) && e.target !== input) {
      popup.style.display = "none";
    }
  });
}
