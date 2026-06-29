import { loadKhuVuc } from "../services/service_khuvuc.js";
import { loadBan } from "../services/service_ban.js";
import { loadHangHoa } from "../services/service_hanghoa.js";
import { luuHoaDonCafe, thanhToanHoaDonCafe, loadHoaDonDangMo } from "../services/service_hoadon.js";
import { loadNhomHang } from "../services/service_nhomhang.js";

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
const btnThongBao = document.querySelector(".cafe-outline-btn");
const btnThanhToan = document.querySelector(".cafe-primary-btn");
const cafeProductTabs = document.querySelector(".cafe-product-tabs");
const cafeSearchInput = document.querySelector(".cafe-search-box input");

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

function updateOrderNote(productId) {
  const orderItems = getCurrentOrderItems();
  const item = orderItems.find((x) => Number(x.id) === Number(productId));
  if (!item) return;

  const note = prompt("Nhập ghi chú cho món:", item.ghi_chu || "");
  if (note === null) return;

  item.ghi_chu = note.trim();
  renderOrder();
}

function removeOrderItem(productId) {
  const key = getSelectedBanKey();
  if (!key) return;

  const orderItems = getCurrentOrderItems();
  const item = orderItems.find((x) => Number(x.id) === Number(productId));
  if (!item) return;

  const ok = confirm(`Xóa món "${item.ten_hang}" khỏi đơn?`);
  if (!ok) return;

  state.ordersByBan[key] = orderItems.filter((x) => Number(x.id) !== Number(productId));

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
    btn.addEventListener("click", () => {
      updateOrderNote(btn.dataset.id);
    });
  });

  cafeOrderList.querySelectorAll(".btnRemoveOrderItem").forEach((btn) => {
    btn.addEventListener("click", () => {
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

    alert(`Đã lưu hóa đơn ${hoaDon.so_hoadon}`);

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

    delete state.ordersByBan[banKey];
    delete state.hoaDonByBan[banKey];

    renderOrder();
    renderBan();

    alert("Đã thanh toán hóa đơn.");

  } catch (error) {
    console.error("Lỗi thanh toán cafe:", error);
    alert("Không thanh toán được hóa đơn. Xem Console để kiểm tra lỗi.");
  }
}

async function restoreHoaDonDangMo() {
  const hoaDons = await loadHoaDonDangMo();

  hoaDons.forEach((hd) => {
    const banKey = hd.loai_don === "mang_ve" ? "takeaway" : String(hd.ban_id);

    state.hoaDonByBan[banKey] = {
      id: hd.id,
      so_hoadon: hd.so_hoadon,
    };

    state.ordersByBan[banKey] = (hd.chi_tiet || []).map((ct) => ({
      id: ct.hanghoa_id,
      ma_hang: ct.ma_hang,
      ten_hang: ct.ten_hang,
      so_luong: Number(ct.so_luong || 0),
      don_gia: Number(ct.don_gia || 0),
      thanh_tien: Number(ct.thanh_tien || 0),
      ghi_chu: ct.ghi_chu || "",
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
  setLeftView("tables");
});

btnViewProducts?.addEventListener("click", () => {
  setLeftView("products");
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

btnThongBao?.addEventListener("click", handleLuuHoaDonTam);
btnThanhToan?.addEventListener("click", handleThanhToan);
cafeSearchInput?.addEventListener("input", () => {
  state.productSearchText = cafeSearchInput.value || "";
  setLeftView("products");
  renderProducts();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "F3") {
    event.preventDefault();
    setLeftView("products");
    cafeSearchInput?.focus();
    cafeSearchInput?.select();
  }
});

initTables();
