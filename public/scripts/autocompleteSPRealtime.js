import { supabase } from "./supabaseClient.js";

export function initAutocompleteRealtimeMasp() {
  const input = document.getElementById("masp");
  const popup = document.getElementById("popup_masp");

  if (!input || !popup) return;

  input.addEventListener("input", async (e) => {
    const keyword = e.target.value.trim().toUpperCase();

    if (!keyword || keyword.length < 2) {
      popup.style.display = "none";
      return;
    }

    const { data, error } = await supabase
      .from("dmhanghoa")
      .select("masp, tensp")
      .ilike("masp", `%${keyword}%`)
      .limit(20);

    if (error || !data || data.length === 0) {
      popup.style.display = "none";
      return;
    }

    popup.innerHTML = data
      .map(
        sp =>
          `<div class="goi-y-item" style="padding:6px; cursor:pointer; border-bottom:1px solid #eee;" 
            data-masp="${sp.masp}">
            <b>${sp.masp}</b> - ${sp.tensp || ""}
          </div>`
      )
      .join("");

    const rect = input.getBoundingClientRect();
    popup.style.display = "block";
    popup.style.left = "0";
    popup.style.top = "100%";
    popup.style.zIndex = 9999;
  });

  popup.addEventListener("click", (e) => {
    const div = e.target.closest(".goi-y-item");
    if (!div) return;

    const masp = div.dataset.masp;
    const input = document.getElementById("masp");
    input.value = masp;
    popup.style.display = "none";
    input.focus();
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      popup.style.display = "none";
    }, 200); // delay nhỏ để xử lý các click chọn
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      input.blur(); // tự mất focus để gọi blur
    }
  });


  // Ẩn popup khi click ngoài
  document.addEventListener("click", (e) => {
    if (!popup.contains(e.target) && e.target !== input) {
      popup.style.display = "none";
    }
  });

  let closePopupTimer;
  input.addEventListener("input", (e) => {
    const val = e.target.value.trim().toUpperCase();

    // Nếu độ dài mã sản phẩm > 5 → chờ 400ms không gõ thêm thì đóng popup
    if (val.length > 3) {
      clearTimeout(closePopupTimer);
      closePopupTimer = setTimeout(() => {
        // Kiểm tra nếu popup còn hiển thị
        if (popup.style.display === "block") {
          popup.style.display = "none";
        }
      }, 400);
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      setTimeout(() => {
        popup.style.display = "none";
        input.focus(); // đảm bảo luôn quay lại ô mã sp
        input.select(); // chọn lại nội dung để nhập tiếp
      }, 200);
    }
  });


}


