import { loadKhuVuc } from "../services/service_khuvuc.js";
import { loadBan } from "../services/service_ban.js";
import { loadHangHoa } from "../services/service_hanghoa.js";
import { luuHoaDonCafe, thanhToanHoaDonCafe, loadHoaDonDangMo, guiBepHoaDonCafe, huyHoaDonCafe } from "../services/service_hoadon.js";
import { loadNhomHang } from "../services/service_nhomhang.js";
import { setupCafeRealtime } from "./cafe_realtime.js";
import { createCafeOrderSync } from "./cafe_orderSync.js";

console.log("Cafe bán hàng loaded");

const state = {
  khuVucList: [],
  banList: [],
  hangHoaList: [],
  nhomHangList: [],

  ordersByBan: {},
  hoaDonByBan: {},
  selectedBan: null,
  selectedKhuVucId: "all",
  selectedStatus: "all",
  selectedNhomId: "all",
  productSearchText: "",
};

let isLocalSaving = false;
let realtimeReloadTimerLocal = null;

const btnViewTables = document.getElementById("btnViewTables");
const btnViewProducts = document.getElementById("btnViewProducts");



const btnViewOrder = document.getElementById("btnViewOrder");
const mobileOrderBar = document.getElementById("mobileOrderBar");
const btnMobileViewOrder = document.getElementById("btnMobileViewOrder");
const btnMobileChooseAgain = document.getElementById("btnMobileChooseAgain");
const mobileOrderQty = document.getElementById("mobileOrderQty");

const btnGuiBep = document.getElementById("btnGuiBep");
const btnInTamTinh = document.getElementById("btnInTamTinh");
const btnThanhToanNew = document.getElementById("btnThanhToan");

const mobileOrderMenuSheet = document.getElementById("mobileOrderMenuSheet");
const btnCloseOrderMenu = document.getElementById("btnCloseOrderMenu");
const btnOpenCancelOrder = document.getElementById("btnOpenCancelOrder");

const mobileCancelSheet = document.getElementById("mobileCancelSheet");
const btnCloseCancelOrder = document.getElementById("btnCloseCancelOrder");
const btnConfirmCancelOrder = document.getElementById("btnConfirmCancelOrder");
const cancelReasonInput = document.getElementById("cancelReasonInput");



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
const btnThongBao = btnGuiBep || document.querySelector(".cafe-outline-btn");
const cafeKitchenNotice = document.querySelector(".cafe-kitchen-notice");
const btnThanhToan = btnThanhToanNew || document.querySelector(".cafe-primary-btn");
const cafeProductTabs = document.querySelector(".cafe-product-tabs");
const cafeSearchInput = document.querySelector(".cafe-search-box input");

const btnMobileBackTables = document.getElementById("btnMobileBackTables");
const mobileProductTitle = document.getElementById("mobileProductTitle");
const btnMobileProductSearch = document.getElementById("btnMobileProductSearch");
const btnMobileAddCategory = document.getElementById("btnMobileAddCategory");
const mobileProductSearchRow = document.getElementById("mobileProductSearchRow");
const mobileProductSearchInput = document.getElementById("mobileProductSearchInput");
const mobileOrderSummary = document.getElementById("mobileOrderSummary");

function showToast(message) {
  let toast = document.getElementById("cafeToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "cafeToast";
    toast.style.position = "fixed";
    toast.style.top = "90px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
    toast.style.zIndex = "99999";
    toast.style.background = "#1f7a35";
    toast.style.color = "#fff";
    toast.style.padding = "14px 22px";
    toast.style.borderRadius = "14px";
    toast.style.fontWeight = "700";
    toast.style.boxShadow = "0 10px 30px rgba(0,0,0,0.25)";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.display = "block";

  clearTimeout(window.__cafeToastTimer);
  window.__cafeToastTimer = setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
}

function showKitchenNotice() {
  if (cafeKitchenNotice) {
    cafeKitchenNotice.style.display = "block";
  }
}

function hideKitchenNotice() {
  if (cafeKitchenNotice) {
    cafeKitchenNotice.style.display = "none";
  }
}

const orderSync = createCafeOrderSync({
  getSelectedBan: () => state.selectedBan,

  getHoaDonByBan: (banKey) => state.hoaDonByBan[banKey],

  getOrderItems: () => getCurrentOrderItems(),

  setHoaDonForBan: (banKey, hoaDon) => {
    state.hoaDonByBan[banKey] = {
      ...state.hoaDonByBan[banKey],
      ...hoaDon,
      gio_vao: state.hoaDonByBan[banKey]?.gio_vao || new Date().toISOString(),
    };
  },

  saveOrder: luuHoaDonCafe,

  showSaving: () => {
    isLocalSaving = true;
    showKitchenNotice();
  },

  showSaved: () => {
    setTimeout(() => {
      isLocalSaving = false;
    }, 1200);

    showToast("Đơn đã tự động lưu.");
  },

  showError: () => {
    isLocalSaving = false;
    alert("Không tự động lưu được đơn. Vui lòng kiểm tra kết nối.");
  },
});

function setLeftView(viewName) {
  const isTables = viewName === "tables";

  btnViewTables?.classList.toggle("active", isTables);
  btnViewProducts?.classList.toggle("active", !isTables);

  viewTables?.classList.toggle("active", isTables);
  viewProducts?.classList.toggle("active", !isTables);
}

function isMobileView() {
  return window.matchMedia("(max-width: 768px)").matches;
}

function setMobileView(viewName) {
  if (!isMobileView()) {
    if (viewName === "tables") setLeftView("tables");
    if (viewName === "products") setLeftView("products");
    return;
  }

  document.body.dataset.mobileView = viewName;

  btnViewTables?.classList.toggle("active", viewName === "tables");
  btnViewProducts?.classList.toggle("active", viewName === "products");
  btnViewOrder?.classList.toggle("active", viewName === "order");

  updateMobileOrderBar();
}

function updateMobileOrderBar() {
  const items = getCurrentOrderItems();
  const qty = items.reduce((sum, item) => sum + Number(item.so_luong || 0), 0);

  if (mobileOrderQty) mobileOrderQty.textContent = qty;

  const showBar =
    isMobileView() &&
    qty > 0 &&
    document.body.dataset.mobileView === "products";

  if (mobileOrderBar) {
    mobileOrderBar.classList.toggle("show", showBar);
  }

  const totalMoney = items.reduce((sum, item) => sum + Number(item.thanh_tien || 0), 0);

  if (mobileOrderSummary) {
    const banName = state.selectedBan?.id === "takeaway"
      ? "Mang về"
      : state.selectedBan?.ten_ban || "Chưa chọn bàn";

    mobileOrderSummary.textContent = `${banName} • ${qty} món • ${formatMoney(totalMoney)}`;
  }

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

function isBanDangSuDung(ban) {
  const orderOfBan = state.ordersByBan[String(ban.id)] || [];
  return ban.trang_thai === "dang_dung" || orderOfBan.length > 0;
}

function getFilteredBanList() {
  let list = [...state.banList];

  if (state.selectedKhuVucId !== "all") {
    list = list.filter((ban) => String(ban.khuvuc_id) === String(state.selectedKhuVucId));
  }

  if (state.selectedStatus === "using") {
    list = list.filter((ban) => isBanDangSuDung(ban));
  }

  if (state.selectedStatus === "empty") {
    list = list.filter((ban) => !isBanDangSuDung(ban));
  }

  return list;
}

function renderCounts() {
  const all = state.banList.length;
  const using = state.banList.filter((ban) => isBanDangSuDung(ban)).length;
  const empty = state.banList.filter((ban) => !isBanDangSuDung(ban)).length;

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

  if (mobileProductTitle) {
    mobileProductTitle.textContent =
      ban.id === "takeaway"
        ? "Mang về"
        : `${ban.ten_ban} / ${getKhuVucName(ban.khuvuc_id)}`;
  }

  renderBan();
  renderOrder();
}

function formatThoiGianSuDung(gioVao) {
  if (!gioVao) return "";

  const start = new Date(gioVao);
  const now = new Date();
  const diffMs = now - start;

  if (diffMs < 0) return "";

  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes} phút`;
  return `${hours} giờ ${minutes} phút`;
}

function getThoiGianSuDungBan(banId) {
  const hd = state.hoaDonByBan[String(banId)];
  if (!hd?.gio_vao) return "";
  return formatThoiGianSuDung(hd.gio_vao);
}

function getTongTienBan(banId) {
  const items = state.ordersByBan[String(banId)] || [];
  return items.reduce((sum, item) => sum + Number(item.thanh_tien || 0), 0);
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
    const isUsing = isBanDangSuDung(ban);
    const isActive = state.selectedBan && String(state.selectedBan.id) === String(ban.id);
    const cls = `${isUsing ? "using" : ""} ${isActive ? "active" : ""}`;

    const usedTime = getThoiGianSuDungBan(ban.id);
    const titleText = usedTime ? `${ban.ten_ban} đã sử dụng ${usedTime}` : ban.ten_ban;

    const tongTienBan = getTongTienBan(ban.id);

    return `
  <div class="cafe-table-card ${cls}" data-ban-id="${ban.id}" title="${titleText}">
    <div class="cafe-table-name">${ban.ten_ban}</div>

    ${isUsing
        ? `
          <div class="cafe-table-meta">
            <div>tổng tiền: ${formatMoney(tongTienBan)}</div>
            <div>Thời gian: ${usedTime}</div>
          </div>
        `
        : ``
      }
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

      if (ban) {
        selectBan(ban);
        if (isMobileView()) setMobileView("products");

      }

    });
  });
  renderCounts();
}

function formatMoney(value) {
  const number = Number(value || 0);
  return number.toLocaleString("vi-VN");
}

function formatDateTimeVN(date = new Date()) {
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getBanInfoText() {
  if (!state.selectedBan) return "";
  if (state.selectedBan.id === "takeaway") return "Khách lẻ";
  return state.selectedBan.ten_ban || "";
}

function buildReceiptHtml({ hoaDon, orderItems }) {
  const nowText = formatDateTimeVN(new Date());
  const soHoaDon = hoaDon?.so_hoadon || "";
  const total = orderItems.reduce((sum, item) => sum + Number(item.thanh_tien || 0), 0);

  const itemHtml = orderItems.map((item) => {
    return `
      <div class="receipt-item">
        <div class="receipt-item-name">${item.ten_hang}</div>
        <div class="receipt-row receipt-item-money">
          <span>${formatMoney(item.don_gia)}</span>
          <span>${item.so_luong}</span>
          <span>${formatMoney(item.thanh_tien)}</span>
        </div>
      </div>
      <div class="receipt-line"></div>
    `;
  }).join("");

  return `
    <div class="receipt-center">
      <div class="receipt-shop-name">GREEN SPACES</div>
      <div>Địa chỉ: 80 Hà Huy Tập</div>
      <div>Điện thoại: 090 5264180</div>
    </div>

    <div class="receipt-line"></div>

    <div>Ngày bán: ${nowText}</div>

    <div class="receipt-center receipt-bill-title">
      <div>HÓA ĐƠN BÁN HÀNG</div>
      <div>${soHoaDon}</div>
    </div>

    <div class="receipt-seller">Người bán: QUẢN LÝ</div>

    <div class="receipt-line"></div>

    <div class="receipt-row receipt-table-head">
      <span>Đơn giá</span>
      <span>SL</span>
      <span>Thành tiền</span>
    </div>

    ${itemHtml}

    <div class="receipt-row">
      <span>Tổng tiền hàng:</span>
      <span>${formatMoney(total)}</span>
    </div>
    <div class="receipt-row">
      <span>Chiết khấu:</span>
      <span>0</span>
    </div>

    <div class="receipt-line"></div>

    <div class="receipt-row receipt-grand-total">
      <span>Tổng cộng:</span>
      <span>${formatMoney(total)}</span>
    </div>

    <div class="receipt-line"></div>

    <div class="receipt-center receipt-thanks">
      Xin cảm ơn Quý khách!
    </div>
  `;
}

function openReceiptPopup({ hoaDon, orderItems }) {
  const popup = document.getElementById("cafeReceiptPopup");
  const printArea = document.getElementById("receiptPrintArea");

  if (!popup || !printArea) return;

  printArea.innerHTML = buildReceiptHtml({ hoaDon, orderItems });
  popup.classList.add("show");

  setTimeout(() => {
    document.getElementById("btnReceiptPrint")?.focus();
  }, 100);
}

function closeReceiptPopup() {
  document.getElementById("cafeReceiptPopup")?.classList.remove("show");
}

function printReceipt() {
  window.print();
}

function renderProductTabs() {
  if (!cafeProductTabs) return;

  const visibleGroups = state.nhomHangList.slice(0, 12);
  const hiddenGroups = state.nhomHangList.slice(12);

  const mainButtons = [
    `<button class="${state.selectedNhomId === "all" ? "active" : ""}" data-nhom-id="all">Tất cả</button>`,
    ...visibleGroups.map((nhom) => {
      const active = String(state.selectedNhomId) === String(nhom.id) ? "active" : "";
      return `<button class="${active}" data-nhom-id="${nhom.id}">${nhom.ten_nhom}</button>`;
    }),
  ];

  const moreButtons = hiddenGroups.map((nhom) => {
    const active = String(state.selectedNhomId) === String(nhom.id) ? "active" : "";
    return `<button class="${active}" data-nhom-id="${nhom.id}">${nhom.ten_nhom}</button>`;
  });

  cafeProductTabs.innerHTML = `
    ${mainButtons.join("")}
    <div class="cafe-product-more">
      <button id="btnProductMore">⌄</button>
      <div id="productMoreMenu" class="cafe-product-more-menu">
        ${moreButtons.join("")}
      </div>
    </div>
  `;

  cafeProductTabs.querySelectorAll("[data-nhom-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedNhomId = btn.dataset.nhomId;
      renderProductTabs();
      renderProducts();
    });
  });

  const btnMore = document.getElementById("btnProductMore");
  const moreMenu = document.getElementById("productMoreMenu");

  btnMore?.addEventListener("click", (event) => {
    event.stopPropagation();
    moreMenu?.classList.toggle("open");
  });
}

function renderProducts() {
  if (!cafeProductGrid) return;

  let products = [...state.hangHoaList];

  const searchText = state.productSearchText.trim().toLowerCase();

  if (searchText) {
    products = products.filter((item) => {
      const tenHang = String(item.ten_hang || "").toLowerCase();
      const maHang = String(item.ma_hang || "").toLowerCase();
      return tenHang.includes(searchText) || maHang.includes(searchText);
    });
  } else if (state.selectedNhomId !== "all") {
    products = products.filter((item) => String(item.nhom_id) === String(state.selectedNhomId));
  }

  cafeProductGrid.innerHTML = products.map((item) => {
    const imageUrl = item.hinh_anh_url || "./assets/images/default-food.jpg";
    const giaBan = Number(item.gia_ban || 0);

    return `
  <div class="cafe-product-card" data-hanghoa-id="${item.id}">
    <div class="cafe-product-image">
      <img src="${imageUrl}" alt="${item.ten_hang}" />
    </div>

    <div class="cafe-product-info">
      <div class="cafe-product-name">${item.ten_hang}</div>
      <div class="cafe-product-price">${formatMoney(giaBan)}</div>
    </div>
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
      thu_tu: orderItems.length + 1,
    });
  }

  renderOrder();
  renderBan();
  orderSync.scheduleSave();

  const banName = state.selectedBan?.id === "takeaway"
    ? "Mang về"
    : state.selectedBan?.ten_ban || "";

  showToast(`Đã thêm ${product.ten_hang} vào ${banName}`);
  updateMobileOrderBar();
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
  orderSync.scheduleSave();
}

function updateOrderNote(productId) {
  const orderItems = getCurrentOrderItems();
  const item = orderItems.find((x) => Number(x.id) === Number(productId));
  if (!item) return;

  const note = prompt("Nhập ghi chú cho món:", item.ghi_chu || "");
  if (note === null) return;

  item.ghi_chu = note.trim();
  renderOrder();
  orderSync.scheduleSave();
}

function removeOrderItem(productId) {
  const key = getSelectedBanKey();
  if (!key) return;

  const orderItems = getCurrentOrderItems();
  const item = orderItems.find((x) => Number(x.id) === Number(productId));
  if (!item) return;

  const ok = confirm(`Xóa món "${item.ten_hang}" khỏi đơn?`);
  if (!ok) return;

  const conLai = orderItems.filter((x) => Number(x.id) !== Number(productId));

  if (!conLai.length) {
    alert("Đây là món cuối cùng. Muốn bỏ hết món thì hãy dùng chức năng Hủy đơn để lưu lý do và hủy hóa đơn.");
    return;
  }

  state.ordersByBan[key] = conLai;

  renderOrder();
  renderBan();
  orderSync.scheduleSave();
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
            <div class="cafe-order-subline">
  <small class="btnOrderNote" data-id="${item.id}">
    ▧ ${item.ghi_chu ? item.ghi_chu : "Ghi chú/Món thêm"}
  </small>
  <button class="btnRemoveOrderItem" data-id="${item.id}">Xóa</button>
 </div>
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

  updateMobileOrderBar();

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

  cafeOrderList.querySelectorAll(".btnOrderNote").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      updateOrderNote(btn.dataset.id);
    });
  });

  cafeOrderList.querySelectorAll(".btnRemoveOrderItem").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeOrderItem(btn.dataset.id);
    });
  });

}

async function handleLuuHoaDonTam() {
  try {
    const orderItems = getCurrentOrderItems();

    if (!state.selectedBan) {
      alert("Vui lòng chọn bàn.");
      return;
    }

    if (!orderItems.length) {
      alert("Chưa có món trong đơn.");
      return;
    }

    const banKey = getSelectedBanKey();

    const hoaDon = await luuHoaDonCafe({
      hoaDonId: state.hoaDonByBan[banKey]?.id || null,
      ban: state.selectedBan,
      orderItems,
      manv: null,
      tennv: "admin",
    });

    state.hoaDonByBan[banKey] = hoaDon;
    if (!state.hoaDonByBan[banKey].gio_vao) {
      state.hoaDonByBan[banKey].gio_vao = new Date().toISOString();
    }

    showToast(`Đã gửi thông báo bếp cho hóa đơn ${hoaDon.so_hoadon}`);

  } catch (error) {
    console.error("Lỗi lưu hóa đơn cafe:", error);
    alert("Không lưu được hóa đơn cafe. Xem Console để kiểm tra lỗi.");
  }
}

async function handleThanhToan() {
  try {
    const banKey = getSelectedBanKey();
    const orderItems = getCurrentOrderItems();

    if (!state.selectedBan) {
      alert("Vui lòng chọn bàn.");
      return;
    }

    if (!orderItems.length) {
      alert("Chưa có món trong đơn.");
      return;
    }

    let hoaDon = state.hoaDonByBan[banKey];

    if (!hoaDon?.id) {
      hoaDon = await luuHoaDonCafe({
        hoaDonId: null,
        ban: state.selectedBan,
        orderItems,
        manv: null,
        tennv: "admin",
      });

      state.hoaDonByBan[banKey] = hoaDon;
    }

    const ok = confirm(`Thanh toán hóa đơn ${hoaDon.so_hoadon}?`);
    if (!ok) return;

    await thanhToanHoaDonCafe(hoaDon.id);

    const paidItems = orderItems.map((item) => ({ ...item }));
    const paidHoaDon = { ...hoaDon };

    delete state.ordersByBan[banKey];
    delete state.hoaDonByBan[banKey];

    renderOrder();
    renderBan();

    openReceiptPopup({
      hoaDon: paidHoaDon,
      orderItems: paidItems,
    });

  } catch (error) {
    console.error("Lỗi thanh toán cafe:", error);
    alert("Không thanh toán được hóa đơn. Xem Console để kiểm tra lỗi.");
  }
}

function clearHoaDonDangMoLocal() {
  state.ordersByBan = {};
  state.hoaDonByBan = {};
}

async function restoreHoaDonDangMo() {
  clearHoaDonDangMoLocal();

  const hoaDons = await loadHoaDonDangMo();

  hoaDons.forEach((hd) => {
    const banKey = hd.loai_don === "mang_ve" ? "takeaway" : String(hd.ban_id);

    state.hoaDonByBan[banKey] = {
      id: hd.id,
      so_hoadon: hd.so_hoadon,
      gio_vao: hd.gio_vao,
    };

    state.ordersByBan[banKey] = (hd.chi_tiet || [])
      .sort((a, b) => Number(a.thu_tu || 0) - Number(b.thu_tu || 0) || Number(a.id || 0) - Number(b.id || 0))
      .map((ct) => ({
        id: ct.hanghoa_id,
        ma_hang: ct.ma_hang,
        ten_hang: ct.ten_hang,
        so_luong: Number(ct.so_luong || 0),
        don_gia: Number(ct.don_gia || 0),
        thanh_tien: Number(ct.thanh_tien || 0),
        ghi_chu: ct.ghi_chu || "",
        thu_tu: Number(ct.thu_tu || 0),
      }));
  });
}

async function initTables() {
  try {
    state.khuVucList = await loadKhuVuc();
    state.banList = await loadBan();
    state.hangHoaList = await loadHangHoa();
    state.nhomHangList = await loadNhomHang();

    await restoreHoaDonDangMo();

    renderKhuVucTabs();
    renderBan();
    if (!state.selectedBan && state.banList.length) {
      selectBan(state.banList[0]);
    }
    renderProductTabs();
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
  setMobileView("tables");
});

btnViewProducts?.addEventListener("click", () => {
  setMobileView("products");
});

btnViewOrder?.addEventListener("click", () => {
  setMobileView("order");
});

btnMobileViewOrder?.addEventListener("click", () => {
  setMobileView("order");
});

btnMobileChooseAgain?.addEventListener("click", () => {
  setMobileView("tables");
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

btnThongBao?.addEventListener("click", async () => {
  try {
    await orderSync.saveNow();

    const banKey = getSelectedBanKey();
    const hoaDon = state.hoaDonByBan[banKey];

    if (!hoaDon?.id) {
      alert("Chưa có hóa đơn để gửi bếp.");
      return;
    }

    const result = await guiBepHoaDonCafe(hoaDon.id);

    state.hoaDonByBan[banKey] = {
      ...state.hoaDonByBan[banKey],
      ...result,
    };

    hideKitchenNotice();
    showToast(`Đã gửi bếp hóa đơn ${result.so_hoadon}`);
  } catch (error) {
    console.error("Lỗi gửi bếp:", error);
    alert("Không gửi được bếp. Xem Console để kiểm tra lỗi.");
  }
});

btnThanhToan?.addEventListener("click", handleThanhToan);
cafeSearchInput?.addEventListener("input", () => {
  state.productSearchText = cafeSearchInput.value || "";
  setLeftView("products");
  renderProducts();
});

btnMobileBackTables?.addEventListener("click", () => {
  setMobileView("tables");
});

btnMobileProductSearch?.addEventListener("click", () => {
  mobileProductSearchRow?.classList.toggle("show");
  mobileProductSearchInput?.focus();
});

mobileProductSearchInput?.addEventListener("input", () => {
  state.productSearchText = mobileProductSearchInput.value || "";
  renderProducts();
});

btnMobileAddCategory?.addEventListener("click", () => {
  showToast("Chức năng thêm danh mục sẽ phát triển sau.");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "F3") {
    event.preventDefault();
    setLeftView("products");
    cafeSearchInput?.focus();
    cafeSearchInput?.select();
  }
});

setInterval(() => {
  renderBan();
}, 60000);

const btnHeaderMenu = document.getElementById("btnHeaderMenu");
const headerMenuPopup = document.getElementById("headerMenuPopup");

btnHeaderMenu?.addEventListener("click", (event) => {
  event.stopPropagation();
  headerMenuPopup?.classList.toggle("open");
});

headerMenuPopup?.addEventListener("click", (event) => {
  const logoutLink = event.target.closest("[data-logout]");
  if (logoutLink) {
    event.preventDefault();
    window.dangXuatCafe?.();
    return;
  }

  const link = event.target.closest("[data-soon]");
  if (!link) return;

  event.preventDefault();
  alert("Chức năng này sẽ phát triển ở bước tiếp theo.");
});

document.addEventListener("click", () => {
  headerMenuPopup?.classList.remove("open");
});

btnInTamTinh?.addEventListener("click", () => {
  showToast("Tính năng in tạm tính sẽ phát triển sau.");
});

document.addEventListener("click", (event) => {
  const btn = event.target.closest(".cafe-current-table .cafe-icon-btn");
  if (!btn) return;

  event.preventDefault();
  event.stopPropagation();

  const sheet = document.getElementById("mobileOrderMenuSheet");
  if (sheet) {
    sheet.classList.add("show");
  }
});

btnCloseOrderMenu?.addEventListener("click", () => {
  mobileOrderMenuSheet?.classList.remove("show");
});

mobileOrderMenuSheet?.addEventListener("click", (event) => {
  if (event.target === mobileOrderMenuSheet) {
    mobileOrderMenuSheet.classList.remove("show");
  }

  if (event.target.closest("[data-soon]")) {
    showToast("Chức năng này sẽ phát triển sau.");
  }
});

btnOpenCancelOrder?.addEventListener("click", () => {
  mobileOrderMenuSheet?.classList.remove("show");
  mobileCancelSheet?.classList.add("show");
});

btnCloseCancelOrder?.addEventListener("click", () => {
  mobileCancelSheet?.classList.remove("show");
});

mobileCancelSheet?.querySelectorAll("[data-reason]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (cancelReasonInput) cancelReasonInput.value = btn.dataset.reason;
  });
});

btnConfirmCancelOrder?.addEventListener("click", async () => {
  const reason = cancelReasonInput?.value?.trim();

  if (!reason) {
    alert("Vui lòng chọn hoặc nhập lý do hủy.");
    return;
  }

  const ok = confirm(`Hủy đơn với lý do: ${reason}?`);
  if (!ok) return;

  const banKey = getSelectedBanKey();
  const hoaDon = banKey ? state.hoaDonByBan[banKey] : null;

  try {
    if (hoaDon?.id) {
      await huyHoaDonCafe(hoaDon.id, {
        lyDo: reason,
        manv: null,
        tennv: "admin",
      });
    }

    if (banKey) {
      delete state.ordersByBan[banKey];
      delete state.hoaDonByBan[banKey];
    }

    renderOrder();
    renderBan();
    hideKitchenNotice();
    mobileCancelSheet?.classList.remove("show");
    showToast("Đã hủy đơn và cập nhật xuống database.");
    setMobileView("tables");
  } catch (error) {
    console.error("Lỗi hủy hóa đơn:", error);
    alert("Không hủy được hóa đơn. Xem Console để kiểm tra lỗi.");
  }
});

document.getElementById("btnReceiptPrint")?.addEventListener("click", printReceipt);
document.getElementById("btnReceiptClose")?.addEventListener("click", closeReceiptPopup);
document.getElementById("btnCloseReceiptPopup")?.addEventListener("click", closeReceiptPopup);

document.getElementById("cafeReceiptPopup")?.addEventListener("click", (event) => {
  if (event.target.id === "cafeReceiptPopup") {
    closeReceiptPopup();
  }
});

document.addEventListener("keydown", (event) => {
  const popup = document.getElementById("cafeReceiptPopup");
  const isOpen = popup?.classList.contains("show");

  if (!isOpen) return;

  if (event.key === "Enter") {
    event.preventDefault();
    printReceipt();
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeReceiptPopup();
  }
});

window.initCafeApp = async function () {
  await initTables();

  setupCafeRealtime({
    onReload: async () => {
      clearTimeout(realtimeReloadTimerLocal);

      realtimeReloadTimerLocal = setTimeout(async () => {
        if (isLocalSaving) {
          return;
        }

        try {
          const selectedKey = getSelectedBanKey();

          state.banList = await loadBan();
          await restoreHoaDonDangMo();

          if (selectedKey && state.banList.length) {
            const oldSelectedBan = state.selectedBan;

            if (oldSelectedBan?.id === "takeaway") {
              state.selectedBan = oldSelectedBan;
            } else {
              const freshBan = state.banList.find((x) => String(x.id) === String(selectedKey));
              if (freshBan) state.selectedBan = freshBan;
            }
          }

          renderOrder();
          renderBan();
        } catch (error) {
          console.error("Lỗi reload realtime cafe:", error);
        }
      }, 1200);
    },
  });
};
