import { loadKhuVuc } from "../services/service_khuvuc.js";
import { loadBan } from "../services/service_ban.js";

console.log("Cafe bán hàng loaded");

const state = {
  khuVucList: [],
  banList: [],
  selectedKhuVucId: "all",
  selectedStatus: "all",
};

const btnViewTables = document.getElementById("btnViewTables");
const btnViewProducts = document.getElementById("btnViewProducts");
const viewTables = document.getElementById("viewTables");
const viewProducts = document.getElementById("viewProducts");

const btnProductMore = document.getElementById("btnProductMore");
const productMoreMenu = document.getElementById("productMoreMenu");

const cafeZoneTabs = document.getElementById("cafeZoneTabs");
const cafeTableGrid = document.getElementById("cafeTableGrid");

const countAllTables = document.getElementById("countAllTables");
const countUsingTables = document.getElementById("countUsingTables");
const countEmptyTables = document.getElementById("countEmptyTables");

function setLeftView(viewName) {
  const isTables = viewName === "tables";

  btnViewTables?.classList.toggle("active", isTables);
  btnViewProducts?.classList.toggle("active", !isTables);

  viewTables?.classList.toggle("active", isTables);
  viewProducts?.classList.toggle("active", !isTables);
}

function renderKhuVucTabs() {
  if (!cafeZoneTabs) return;

  const buttons = [
    `<button class="${state.selectedKhuVucId === "all" ? "active" : ""}" data-khuvuc-id="all">Tất cả</button>`,
    ...state.khuVucList.map((kv) => {
      const active = String(state.selectedKhuVucId) === String(kv.id) ? "active" : "";
      return `<button class="${active}" data-khuvuc-id="${kv.id}">${kv.ten_khuvuc}</button>`;
    }),
  ];

  cafeZoneTabs.innerHTML = buttons.join("");

  cafeZoneTabs.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedKhuVucId = btn.dataset.khuvucId;
      renderKhuVucTabs();
      renderBan();
    });
  });
}

function getFilteredBanList() {
  let list = [...state.banList];

  if (state.selectedKhuVucId !== "all") {
    list = list.filter((ban) => String(ban.khuvuc_id) === String(state.selectedKhuVucId));
  }

  if (state.selectedStatus === "using") {
    list = list.filter((ban) => ban.trang_thai === "dang_dung");
  }

  if (state.selectedStatus === "empty") {
    list = list.filter((ban) => ban.trang_thai === "trong");
  }

  return list;
}

function renderCounts() {
  const all = state.banList.length;
  const using = state.banList.filter((ban) => ban.trang_thai === "dang_dung").length;
  const empty = state.banList.filter((ban) => ban.trang_thai === "trong").length;

  if (countAllTables) countAllTables.textContent = all;
  if (countUsingTables) countUsingTables.textContent = using;
  if (countEmptyTables) countEmptyTables.textContent = empty;
}

function renderBan() {
  if (!cafeTableGrid) return;

  const list = getFilteredBanList();

  const mangVeCard = `
    <div class="cafe-table-card takeaway" data-ban-id="takeaway">
      <div class="cafe-table-icon">🛍️</div>
      <div>Mang về</div>
    </div>
  `;

  const banCards = list.map((ban) => {
    const isUsing = ban.trang_thai === "dang_dung";
    const cls = isUsing ? "using" : "";

    return `
      <div class="cafe-table-card ${cls}" data-ban-id="${ban.id}">
        <div class="cafe-table-icon">▭</div>
        <div>${ban.ten_ban}</div>
      </div>
    `;
  });

  cafeTableGrid.innerHTML = [mangVeCard, ...banCards].join("");
  renderCounts();
}

async function initTables() {
  try {
    state.khuVucList = await loadKhuVuc();
    state.banList = await loadBan();

    renderKhuVucTabs();
    renderBan();
  } catch (error) {
    console.error("Không thể khởi tạo phòng bàn:", error);
    if (cafeTableGrid) {
      cafeTableGrid.innerHTML = `<div style="padding:20px;color:red;">Không tải được dữ liệu phòng bàn.</div>`;
    }
  }
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

document.querySelectorAll('input[name="tableStatus"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    state.selectedStatus = radio.value;
    renderBan();
  });
});

initTables();
