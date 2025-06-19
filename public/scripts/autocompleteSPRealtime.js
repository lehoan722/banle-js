import { supabase } from './supabaseClient.js';

let popupEl;
let inputEl;
let ketQua = [];

export function initAutocompleteRealtimeMasp() {
  popupEl = document.getElementById("popup-gioi-y-sp");
  inputEl = document.getElementById("masp");

  if (!popupEl || !inputEl) return;

  inputEl.addEventListener("input", handleInput);
  inputEl.addEventListener("keydown", handleKeyDown);
  document.addEventListener("click", (e) => {
    if (!popupEl.contains(e.target) && e.target !== inputEl) {
      popupEl.style.display = "none";
    }
  });
}

async function handleInput(e) {
  const keyword = inputEl.value.trim();
  if (!keyword) {
    popupEl.style.display = "none";
    return;
  }

  // Ẩn popup cũ nếu có
  const popupMaspCu = document.getElementById("popup_masp");
  if (popupMaspCu) popupMaspCu.style.display = "none";

  const { data, error } = await supabase
    .from("dmhanghoa")
    .select("masp, tensp")
    .or(`masp.ilike.%${keyword}%,tensp.ilike.%${keyword}%`)
    .order("masp")
    .limit(100);

  ketQua = data || [];
  if (ketQua.length === 0) {
    popupEl.style.display = "none";
    return;
  }

  const rect = inputEl.getBoundingClientRect();
  popupEl.style.left = `${rect.left + window.scrollX}px`;
  popupEl.style.top = `${rect.bottom + window.scrollY}px`;
  popupEl.style.width = `${rect.width}px`;

  popupEl.innerHTML = ketQua.map(item => `
    <div class="item-sp" data-masp="${item.masp}" style="padding:6px; cursor:pointer; border-bottom:1px solid #eee">
      <b>${item.masp}</b> – ${item.tensp}
    </div>
  `).join("");

  popupEl.style.display = "block";

  popupEl.querySelectorAll(".item-sp").forEach(div => {
    div.addEventListener("click", () => {
      const masp = div.dataset.masp;
      inputEl.value = masp;
      popupEl.style.display = "none";
      inputEl.focus();
    });
  });
}


function handleKeyDown(e) {
  if (e.key === "Escape") popupEl.style.display = "none";
}
