// stockQuickImage.js
// Xử lý ảnh sản phẩm và nút chụp/copy.

(function () {
  "use strict";

  const IMG_BASE = "https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/";
  const UPANH_URL = "https://app.hoantuyet.vn/upanhnhanh.html?masp=";

  function buildImageBlock(masp) {
    const upper = String(masp || "").trim().toUpperCase();
    const imgUrl = IMG_BASE + upper + ".JPG";

    return `
      <div class="sq-img-wrapper" data-masp="${upper}">
        <img src="${imgUrl}"
             alt="${upper}"
             onerror="this.parentElement.style.display='none';" />
      </div>`;
  }

  function bindPhotoButton(popup) {
    if (!popup) return;

    const btnPhoto = popup.querySelector(".sq-photo-btn");
    if (!btnPhoto) return;

    btnPhoto.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const maspPopup = String(popup.dataset.masp || "").trim().toUpperCase();
      const ok = await window.StockQuickUtils.copyTextToClipboard(maspPopup);

      const old = btnPhoto.innerHTML;
      btnPhoto.innerHTML = ok
        ? "📷 Chụp ảnh <span class='ok'>(đã copy)</span>"
        : "📷 Chụp ảnh <span class='ok'>(copy lỗi)</span>";

      setTimeout(() => (btnPhoto.innerHTML = old), 900);

      const url = UPANH_URL + encodeURIComponent(maspPopup);
      window.open(url, "_blank");
    };
  }

  window.StockQuickImage = {
    IMG_BASE,
    buildImageBlock,
    bindPhotoButton,
  };
})();
