import { supabase } from "./supabaseClient.js";

let cacheMaSP = [];

async function napDanhSachMaSPRealtime() {
  if (cacheMaSP.length === 0) {
    const { data } = await supabase.from("dmhanghoa").select("masp, tensp").limit(5000);
    if (data) cacheMaSP = data.map(sp => ({
      masp: sp.masp?.toUpperCase(),
      tensp: sp.tensp || ""
    }));
  }
}

export function initAutocompleteRealtimeMasp() {
  const input = document.getElementById("masp");
  const popup = document.getElementById("popup-gioi-y-sp");

  if (!input || !popup) return;

  napDanhSachMaSPRealtime(); // preload cache

  input.addEventListener("input", () => {
    const keyword = input.value.trim().toUpperCase();
    if (!keyword) return popup.style.display = "none";

    const goiY = cacheMaSP.filter(sp =>
      sp.masp.includes(keyword) || sp.tensp.toUpperCase().includes(keyword)
    ).slice(0, 50);

    if (goiY.length === 0) {
      popup.style.display = "none";
      return;
    }

    const rect = input.getBoundingClientRect();
    popup.style.left = `${rect.left + window.scrollX}px`;
    popup.style.top = `${rect.bottom + window.scrollY}px`;
    popup.style.width = `${rect.width}px`;
    popup.innerHTML = goiY.map(sp => `
      <div class="item-sp" data-masp="${sp.masp}" style="padding:6px; border-bottom:1px solid #eee; cursor:pointer;">
        <b>${sp.masp}</b> – ${sp.tensp}
      </div>
    `).join("");

    popup.style.display = "block";

    popup.querySelectorAll(".item-sp").forEach(div => {
      div.addEventListener("click", () => {
        const masp = div.dataset.masp;
        input.value = masp;
        popup.style.display = "none";
        input.focus();
      });
    });
  });

  // Ẩn popup khi click ra ngoài
  document.addEventListener("click", e => {
    if (!popup.contains(e.target) && e.target !== input) {
      popup.style.display = "none";
    }
  });
}
