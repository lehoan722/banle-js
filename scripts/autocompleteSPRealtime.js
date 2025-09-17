// autocompleteSPRealtime.js
import { supabase } from "./supabaseClient.js";

export function initAutocompleteRealtimeMasp() {
  const input = document.getElementById("masp");
  const popup = document.getElementById("popup_masp");
  if (!input || !popup) return;

  // ---- State ----
  let cursor = -1;              // vị trí item đang highlight bằng phím
  let suppressBlur = false;     // ngăn blur đóng popup khi đang click trong popup
  let lastKeyword = "";
  let searching = 0;            // đếm lượt tìm async để chống đua

  // ---- Helpers ----
  function hidePopup() { popup.style.display = "none"; }
  function showPopup() {
    popup.style.display = "block";
    popup.style.left = "0";
    popup.style.top = "100%";
    popup.style.zIndex = 10000;
  }
  function isVisible() { return popup.style.display !== "none"; }

  // Xuất global để module khác “chốt hạ” đóng popup khi cần
  window.closePopupMasp = hidePopup;

  function renderList(list) {
    popup.innerHTML = list.map(sp => `
      <div class="goi-y-item" data-masp="${sp.masp}" style="padding:6px;cursor:pointer;border-bottom:1px solid #eee;">
        <b>${sp.masp}</b> - ${sp.tensp || ""}
      </div>
    `).join("");
    cursor = -1;
    if (list.length) showPopup(); else hidePopup();
  }

  function highlight(idx) {
    const items = popup.querySelectorAll(".goi-y-item");
    items.forEach((el, i) => {
      el.style.background = (i === idx) ? "#e9f3ff" : "";
    });
  }

  function chonMasp(masp) {
    input.value = masp;
    hidePopup();

    // Nếu app có hook cũ, ưu tiên gọi
    if (typeof window.xuLyKhiChonMaSanPham === "function") {
      window.xuLyKhiChonMaSanPham(masp);
    } else {
      // Fallback: phát Enter để các listener khác (vd. hoadon.js) xử lý
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }
  }

  // ---- Search (realtime) ----
  let debounceTimer = null;
  function debounce(fn, ms = 120) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fn, ms);
  }

  async function doSearch() {
    const keyword = (input.value || "").trim().toUpperCase();
    if (!keyword || keyword.length < 2) { hidePopup(); return; }

    // Chống lặp truy vấn giống nhau
    if (keyword === lastKeyword && isVisible()) return;
    lastKeyword = keyword;

    const ticket = ++searching; // vé kiểm tra cuộc gọi mới nhất
    const { data, error } = await supabase
      .from("dmhanghoa")
      .select("masp, tensp")
      .ilike("masp", `%${keyword}%`)
      .limit(100);

    if (ticket !== searching) return; // đã có cuộc gọi mới hơn
    if (error || !Array.isArray(data) || data.length === 0) { hidePopup(); return; }
    renderList(data);
  }

  // ---- Events ----
  // Gõ ký tự -> debounce search
  input.addEventListener("input", () => debounce(doSearch, 120));

  // Blur: chỉ ẩn nếu không click vào popup
  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (!suppressBlur && !popup.contains(document.activeElement)) hidePopup();
    }, 0);
  });

  // Ngăn blur “đóng sớm” khi đang click vào popup
  // Dùng pointerdown để hỗ trợ cả mobile + desktop
  popup.addEventListener("pointerdown", () => { suppressBlur = true; });
  document.addEventListener("pointerup", () => { setTimeout(() => { suppressBlur = false; }, 0); });

  // Click chọn item
  popup.addEventListener("click", (e) => {
    const div = e.target.closest(".goi-y-item");
    if (!div) return;
    chonMasp(div.dataset.masp);
  });

  // Điều hướng bằng phím
  input.addEventListener("keydown", (e) => {
    const items = popup.querySelectorAll(".goi-y-item");
    const hasList = isVisible() && items.length > 0;

    if (hasList) {
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
      if (e.key === "Escape") {
        hidePopup();
        return;
      }
      if (e.key === "Enter") {
        // Nếu đang chọn 1 item → chọn luôn
        if (cursor >= 0) {
          e.preventDefault();
          const div = items[cursor];
          chonMasp(div.dataset.masp);
          return;
        }
        // Không chọn item nào → vẫn đóng popup để không đè UI
        hidePopup();
        // Cho phép luồng Enter mặc định (chuyenFocus) tiếp tục xử lý
        return;
      }
    } else if (e.key === "Enter") {
      // Không có danh sách mà vẫn Enter → đóng phòng hờ
      hidePopup();
    }
  });

  // Ẩn popup khi click ngoài (không phải input & không phải popup)
  document.addEventListener("click", (e) => {
    if (e.target !== input && !popup.contains(e.target)) {
      hidePopup();
    }
  });
}
