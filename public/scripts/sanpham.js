
export function khoiTaoTimMaSP() {
  const inputMaSP = document.getElementById("masp");
  const popup = document.getElementById("popup_masp");

  inputMaSP.addEventListener("input", () => {
    const keyword = inputMaSP.value.trim().toUpperCase();
    if (!keyword) return popup.style.display = "none";

    const danhSach = Object.values(window.sanPhamData || {})
      .filter(sp => sp.masp.includes(keyword) || (sp.tensp || "").toUpperCase().includes(keyword))
      .slice(0, 100);

    if (danhSach.length === 0) {
      popup.style.display = "none";
      return;
    }

    popup.innerHTML = danhSach.map(sp => `
      <div class="popup-masp-item" data-masp="\${sp.masp}" style="padding:6px; border-bottom:1px solid #eee; cursor:pointer;">
        \${sp.masp} - \${sp.tensp}
      </div>
    `).join("");
    popup.style.display = "block";
  });

  popup.addEventListener("click", (e) => {
    const item = e.target.closest(".popup-masp-item");
    if (!item) return;
    inputMaSP.value = item.dataset.masp;
    popup.style.display = "none";
    const evt = new KeyboardEvent("keydown", { key: "Enter" });
    inputMaSP.dispatchEvent(evt);
  });

  inputMaSP.addEventListener("keydown", async (e) => {
    if (e.key === "Escape") popup.style.display = "none";
    if (e.key === "Enter") popup.style.display = "none";
  });

  document.addEventListener("click", (e) => {
    if (!popup.contains(e.target) && e.target !== inputMaSP) {
      popup.style.display = "none";
    }
  });
}
