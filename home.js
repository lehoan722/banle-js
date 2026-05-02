function toggleMenu() {
  const menu = document.querySelector(".menu");
  if (menu) menu.classList.toggle("show");
}

/*
  Ảnh nền trình chiếu lấy từ Supabase Storage bucket: anhsanpham

  Quy tắc:
  - Bạn upload đúng 5 ảnh với tên:
    anh-nen-1.jpg
    anh-nen-2.jpg
    anh-nen-3.jpg
    anh-nen-4.jpg
    anh-nen-5.jpg

  Sau này muốn đổi ảnh nền:
  - Chỉ cần upload ảnh mới đè lên đúng tên cũ trong Supabase Storage
  - Không cần sửa code nữa
*/

const SUPABASE_IMAGE_BASE =
  "https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham";

const heroImages = [
  `${SUPABASE_IMAGE_BASE}/ANH-NEN-1.jpg`,
  `${SUPABASE_IMAGE_BASE}/ANH-NEN-2.jpg`,
  `${SUPABASE_IMAGE_BASE}/ANH-NEN-3.jpg`,
  `${SUPABASE_IMAGE_BASE}/ANH-NEN-4.jpg`,
  `${SUPABASE_IMAGE_BASE}/ANH-NEN-5.jpg`
];

let currentHeroIndex = 0;

function startHeroSlider() {
  const hero = document.getElementById("heroSlider");
  if (!hero) return;

  function updateHeroImage() {
    hero.style.backgroundImage = `
      linear-gradient(90deg, rgba(0,0,0,.78), rgba(0,0,0,.22)),
      url("${heroImages[currentHeroIndex]}")
    `;

    currentHeroIndex = (currentHeroIndex + 1) % heroImages.length;
  }

  updateHeroImage();
  setInterval(updateHeroImage, 4500);
}

document.addEventListener("DOMContentLoaded", startHeroSlider);
