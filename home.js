function toggleMenu() {
  const menu = document.querySelector(".menu");
  if (menu) menu.classList.toggle("show");
}

const heroImages = [
  "/images/slide1.jpg",
  "/images/slide2.jpg",
  "/images/slide3.jpg",
  "/images/slide4.jpg",
  "/images/slide5.jpg"
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
