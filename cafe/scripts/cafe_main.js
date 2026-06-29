console.log("Cafe bán hàng loaded");

const btnViewTables = document.getElementById("btnViewTables");
const btnViewProducts = document.getElementById("btnViewProducts");
const viewTables = document.getElementById("viewTables");
const viewProducts = document.getElementById("viewProducts");

const btnProductMore = document.getElementById("btnProductMore");
const productMoreMenu = document.getElementById("productMoreMenu");

function setLeftView(viewName) {
  const isTables = viewName === "tables";

  btnViewTables.classList.toggle("active", isTables);
  btnViewProducts.classList.toggle("active", !isTables);

  viewTables.classList.toggle("active", isTables);
  viewProducts.classList.toggle("active", !isTables);
}

btnViewTables?.addEventListener("click", () => {
  setLeftView("tables");
});

btnViewProducts?.addEventListener("click", () => {
  setLeftView("products");
});

btnProductMore?.addEventListener("click", (event) => {
  event.stopPropagation();
  productMoreMenu?.classList.toggle("open");
});

document.addEventListener("click", () => {
  productMoreMenu?.classList.remove("open");
});
