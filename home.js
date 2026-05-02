function toggleMenu() {
  const menu = document.querySelector(".menu");
  if (menu) menu.classList.toggle("show");
}

const SUPABASE_URL = "https://rddjrmbjftlcvrgzlyby.supabase.co";
const SUPABASE_ANON_KEY = "DAN_ANON_KEY_CUA_BAN_VAO_DAY";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let heroImages = [];
let currentHeroIndex = 0;

async function loadHeroSlides() {
  const { data, error } = await supabase
    .from("web_slides")
    .select("image_url")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Lỗi tải ảnh trình chiếu:", error);
    return;
  }

  heroImages = (data || []).map(item => item.image_url).filter(Boolean);

  if (heroImages.length === 0) {
    heroImages = [
      "https://rddjrmbjftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/ANH-NEN-1.jpg",
      "https://rddjrmbjftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/ANH-NEN-2.jpg",
      "https://rddjrmbjftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/ANH-NEN-3.jpg",
      "https://rddjrmbjftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/ANH-NEN-4.jpg",
      "https://rddjrmbjftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/ANH-NEN-5.jpg"
    ];
  }

  startHeroSlider();
}

function startHeroSlider() {
  const hero = document.getElementById("heroSlider");
  if (!hero || heroImages.length === 0) return;

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

document.addEventListener("DOMContentLoaded", loadHeroSlides);
