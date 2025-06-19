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

  // Ẩn popup khi click ngoài
  document.addEventListener("click", (e) => {
    if (!popup.contains(e.target) && e.target !== input) {
      popup.style.display = "none";
    }
  });
}

