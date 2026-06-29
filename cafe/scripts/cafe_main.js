import { loadKhuVuc } from "../services/service_khuvuc.js";
import { loadBan } from "../services/service_ban.js";
import { loadHangHoa } from "../services/service_hanghoa.js";

console.log("Cafe bán hàng loaded");

const state = {
  khuVucList: [],
  banList: [],
  hangHoaList: [],
  ordersByBan: {},
  selectedBan: null,
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

const cafeOrderList = document.getElementById("cafeOrderList");
const cafeTotalQty = document.getElementById("cafeTotalQty");
const cafeTotalMoney = document.getElementById("cafeTotalMoney");
const cafeProductGrid = document.querySelector(".cafe-product-grid");
const cafeCurrentTable = document.querySelector(".cafe-current-table strong");

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

function getKhuVucName(khuvucId) {
  const kv = state.khuVucList.find((x) => String(x.id) === String(khuvucId));
  return kv?.ten_khuvuc || "";
}

function selectBan(ban) {
  state.selectedBan = ban;

  if (cafeCurrentTable) {
    if (ban.id === "takeaway") {
      cafeCurrentTable.textContent = "▣ Mang về";
    } else {
      cafeCurrentTable.textContent = `▣ ${ban.ten_ban} / ${getKhuVucName(ban.khuvuc_id)}`;
    }
  }

  renderBan();
  renderOrder();
}

function renderBan() {
  if (!cafeTableGrid) return;

  const list = getFilteredBanList();

  const isTakeawayActive = state.selectedBan?.id === "takeaway" ? "active" : "";
  const takeawayHasOrder = (state.ordersByBan["takeaway"] || []).length > 0 ? "using" : "";

  const mangVeCard = `
  <div class="cafe-table-card takeaway ${takeawayHasOrder} ${isTakeawayActive}" data-ban-id="takeaway">
      <div class="cafe-table-icon">🛍️</div>
      <div>Mang về</div>
    </div>
  `;

  const banCards = list.map((ban) => {
    const orderOfBan = state.ordersByBan[String(ban.id)] || [];
    const isUsing = ban.trang_thai === "dang_dung" || orderOfBan.length > 0;
    const isActive = state.selectedBan && String(state.selectedBan.id) === String(ban.id);
    const cls = `${isUsing ? "using" : ""} ${isActive ? "active" : ""}`;

    return `
      <div class="cafe-table-card ${cls}" data-ban-id="${ban.id}">
        <div class="cafe-table-icon">▭</div>
        <div>${ban.ten_ban}</div>
      </div>
    `;
  });

  cafeTableGrid.innerHTML = [mangVeCard, ...banCards].join("");
  cafeTableGrid.querySelectorAll(".cafe-table-card").forEach((card) => {
    card.addEventListener("click", () => {
      const banId = card.dataset.banId;

      if (banId === "takeaway") {
        selectBan({
          id: "takeaway",
          ten_ban: "Mang về",
          khuvuc_id: null,
        });
        return;
      }

      const ban = state.banList.find((x) => String(x.id) === String(banId));
      if (ban) selectBan(ban);
    });
  });
  renderCounts();
}

function formatMoney(value) {
  const number = Number(value || 0);
  return number.toLocaleString("vi-VN");
}

function renderProducts() {
  if (!cafeProductGrid) return;

  const products = state.hangHoaList.slice(0, 24);

  cafeProductGrid.innerHTML = products.map((item) => {
    const imageUrl = item.hinh_anh_url || "./assets/images/default-food.jpg";
    const giaBan = Number(item.gia_ban || 0);

    return `
      <div class="cafe-product-card" data-hanghoa-id="${item.id}">
        <div class="cafe-product-image">
          <img src="${imageUrl}" alt="${item.ten_hang}" />
        </div>
        <div class="cafe-product-price">${formatMoney(giaBan)}</div>
        <div class="cafe-product-name">${item.ten_hang}</div>
      </div>
    `;
  }).join("");

  cafeProductGrid.querySelectorAll(".cafe-product-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = Number(card.dataset.hanghoaId);
      const product = state.hangHoaList.find((x) => Number(x.id) === id);
      if (product) addProductToOrder(product);
    });
  });
}

function getSelectedBanKey() {
  if (!state.selectedBan) return null;
  return String(state.selectedBan.id);
}

function getCurrentOrderItems() {
  const key = getSelectedBanKey();
  if (!key) return [];

  if (!state.ordersByBan[key]) {
    state.ordersByBan[key] = [];
  }

  return state.ordersByBan[key];
}

function addProductToOrder(product) {
  if (!state.selectedBan) {
    alert("Vui lòng chọn bàn trước khi chọn món.");
    return;
  }

  const orderItems = getCurrentOrderItems();

  const found = orderItems.find((x) => Number(x.id) === Number(product.id));

  if (found) {
    found.so_luong += 1;
    found.thanh_tien = found.so_luong * found.don_gia;
  } else {
    const donGia = Number(product.gia_ban || 0);

    orderItems.push({
      id: product.id,
      ma_hang: product.ma_hang,
      ten_hang: product.ten_hang,
      so_luong: 1,
      don_gia: donGia,
      thanh_tien: donGia,
      ghi_chu: "",
    });
  }

  renderOrder();
  renderBan();
}

function updateOrderQty(productId, change) {
  const orderItems = getCurrentOrderItems();

  const item = orderItems.find((x) => Number(x.id) === Number(productId));
  if (!item) return;

  item.so_luong += change;

  if (item.so_luong <= 0) {
    const key = getSelectedBanKey();
    state.ordersByBan[key] = orderItems.filter((x) => Number(x.id) !== Number(productId));
  } else {
    item.thanh_tien = item.so_luong * item.don_gia;
  }

  renderOrder();
  renderBan();
}

function renderOrder() {
  if (!cafeOrderList) return;
  const orderItems = getCurrentOrderItems();

  if (!orderItems.length) {
    cafeOrderList.innerHTML = `
      <div class="cafe-empty-order">
        <div class="cafe-empty-icon">🧾</div>
        <div>Chưa có món trong đơn</div>
        <small>Vui lòng chọn món trong thực đơn bên trái màn hình</small>
      </div>
    `;
  } else {
    cafeOrderList.innerHTML = orderItems.map((item, index) => {
      return `
        <div class="cafe-order-row" data-product-id="${item.id}">
          <div class="cafe-order-info">
            <strong>${index + 1}. ${item.ten_hang}</strong>
            <small>▧ Ghi chú/Món thêm</small>
          </div>

          <div class="cafe-qty-box">
            <button class="btnQtyMinus" data-id="${item.id}">−</button>
            <span>${item.so_luong}</span>
            <button class="btnQtyPlus" data-id="${item.id}">＋</button>
          </div>

          <div class="cafe-price">${formatMoney(item.don_gia)}</div>
          <div class="cafe-price bold">${formatMoney(item.thanh_tien)}</div>
        </div>
      `;
    }).join("");
  }

  const totalQty = orderItems.reduce((sum, item) => sum + item.so_luong, 0);
  const totalMoney = orderItems.reduce((sum, item) => sum + item.thanh_tien, 0);

  if (cafeTotalQty) cafeTotalQty.textContent = totalQty;
  if (cafeTotalMoney) cafeTotalMoney.textContent = formatMoney(totalMoney);

  cafeOrderList.querySelectorAll(".btnQtyMinus").forEach((btn) => {
    btn.addEventListener("click", () => {
      updateOrderQty(btn.dataset.id, -1);
    });
  });

  cafeOrderList.querySelectorAll(".btnQtyPlus").forEach((btn) => {
    btn.addEventListener("click", () => {
      updateOrderQty(btn.dataset.id, 1);
    });
  });
}

async function initTables() {
  try {
    state.khuVucList = await loadKhuVuc();
    state.banList = await loadBan();
    state.hangHoaList = await loadHangHoa();

    renderKhuVucTabs();
    renderBan();
    if (!state.selectedBan && state.banList.length) {
      selectBan(state.banList[0]);
    }
    renderProducts();
    renderOrder();
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
