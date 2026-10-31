// HOAN TUYET - XAC NHAN ANH SAN PHAM V4
// Script độc lập đăng ký window.XacNhanAnhSP; hoadon.js chỉ gọi qua hook mềm nếu script này tồn tại.
// Áp dụng: banlemtcs1, banlemtcs2, bannvcs1, bannvcs2.

const STORAGE_KEY = "xacnhananhsp_boqua";
const IMAGE_BASE = "https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham";
const ALLOWED_PAGES = new Set([
  "banlemtcs1.html",
  "banlemtcs2.html",
  "bannvcs1.html",
  "bannvcs2.html"
]);

let currentResolve = null;
let currentMasp = "";
let initialized = false;

function currentPage() {
  return (location.pathname.split("/").pop() || "").toLowerCase();
}

function laTrangApDungXacNhanAnhSP() {
  return ALLOWED_PAGES.has(currentPage());
}

function truthy(v) {
  return String(v ?? "").toLowerCase() === "true" || String(v ?? "") === "1";
}

function laAdminXacNhanAnhSP() {
  // Một số trang cũ từng dùng sessionStorage, vì vậy đọc cả hai để tương thích.
  return truthy(localStorage.getItem("is_admin")) || truthy(sessionStorage.getItem("is_admin"));
}

function coDuocBoQuaXacNhanAnhSP() {
  // Bắt buộc đủ 3 điều kiện: đúng trang + là admin + admin đã bật bỏ qua.
  return laTrangApDungXacNhanAnhSP()
    && laAdminXacNhanAnhSP()
    && truthy(localStorage.getItem(STORAGE_KEY));
}

function formatMoney(value) {
  const n = Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;
  return `${Math.round(n).toLocaleString("vi-VN")} đ`;
}

function injectStyle() {
  if (document.getElementById("xacnhananhsp-style")) return;
  const style = document.createElement("style");
  style.id = "xacnhananhsp-style";
  style.textContent = `
    #xacnhananhsp-overlay{
      position:fixed; inset:0; z-index:90000; display:none;
      background:rgba(8,12,18,.96); color:#fff;
      font-family:Arial,Helvetica,sans-serif;
    }
    #xacnhananhsp-overlay.xnas-open{display:block}
    #xacnhananhsp-card{position:absolute; inset:0; overflow:hidden}
    #xacnhananhsp-image-wrap{
      position:absolute; left:2vw; right:2vw; top:2vh; bottom:20vh;
      display:flex; align-items:center; justify-content:center;
    }
    #xacnhananhsp-image{
      max-width:96vw; max-height:77vh; width:auto; height:auto;
      object-fit:contain; background:#fff; border-radius:10px;
      box-shadow:0 8px 32px rgba(0,0,0,.45);
    }
    #xacnhananhsp-info{
      position:absolute; left:50%; bottom:8.5vh; transform:translateX(-50%);
      min-width:340px; max-width:62vw; padding:10px 18px;
      background:rgba(0,0,0,.70); border:1px solid rgba(255,255,255,.25);
      border-radius:12px; text-align:center; box-shadow:0 4px 18px rgba(0,0,0,.35);
    }
    #xacnhananhsp-masp{
      display:inline-block; color:#5ec8ff; font-size:25px; font-weight:800;
      text-decoration:underline; cursor:pointer; padding:2px 8px;
    }
    #xacnhananhsp-ten{font-size:17px; margin-top:2px; color:#f1f5f9}
    #xacnhananhsp-gia{font-size:25px; font-weight:800; margin-top:3px; color:#fff}
    .xnas-btn{
      position:absolute; bottom:18px; min-width:220px; height:58px;
      border:0; border-radius:11px; font-size:20px; font-weight:800;
      cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,.35);
    }
    /* Nút ĐÚNG SP luôn cố định góc trái, không còn nhảy theo số hóa đơn. */
    #xacnhananhsp-dung{left:24px; background:#13a855; color:#fff}
    #xacnhananhsp-sai{right:24px; background:#e9eef3; color:#111827}
    #xacnhananhsp-admin-wrap{
      display:inline-flex; align-items:center; gap:5px; margin-left:8px;
      white-space:nowrap; font-size:13px; font-weight:700; color:#8b0000;
      vertical-align:middle;
    }
    #xacnhananhsp-admin-wrap input{width:auto!important; height:auto!important; margin:0}
    /* Khi đang xác nhận ảnh, StockQuick phải luôn nằm trên overlay xác nhận. */
    body.xnas-verify-active .sq-stock-popup{z-index:200000!important}
    body.xnas-verify-active .sq-image-fullscreen{z-index:200010!important}
    body.xnas-verify-active .sq-backdrop{z-index:199990!important}
    @media (max-width:800px){
      #xacnhananhsp-info{max-width:88vw; min-width:280px; bottom:10vh}
      .xnas-btn{min-width:175px; height:52px; font-size:17px}
      #xacnhananhsp-dung{left:12px}
      #xacnhananhsp-sai{right:12px}
    }
  `;
  document.head.appendChild(style);
}

function createOverlay() {
  if (document.getElementById("xacnhananhsp-overlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "xacnhananhsp-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div id="xacnhananhsp-card" role="dialog" aria-modal="true" aria-label="Xác nhận sản phẩm">
      <div id="xacnhananhsp-image-wrap">
        <img id="xacnhananhsp-image" alt="Ảnh sản phẩm cần xác nhận">
      </div>
      <div id="xacnhananhsp-info">
        <div><span id="xacnhananhsp-masp" title="Bấm để xem tồn kho nhanh"></span></div>
        <div id="xacnhananhsp-ten"></div>
        <div id="xacnhananhsp-gia"></div>
      </div>
      <button id="xacnhananhsp-dung" class="xnas-btn" type="button">✓ ĐÚNG SẢN PHẨM</button>
      <button id="xacnhananhsp-sai" class="xnas-btn" type="button">↩ SAI SP / QUÉT LẠI</button>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById("xacnhananhsp-dung").addEventListener("click", () => finish(true));
  document.getElementById("xacnhananhsp-sai").addEventListener("click", () => finish(false));
  document.getElementById("xacnhananhsp-masp").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openStockQuick(e.currentTarget, currentMasp);
  });

  // Không cho click nền làm đóng popup / xác nhận nhầm.
  overlay.addEventListener("click", (e) => e.stopPropagation());

  // Enter luôn là hành động AN TOÀN: SAI SP / QUÉT LẠI.
  document.addEventListener("keydown", onGlobalKeyDown, true);
}

function onGlobalKeyDown(e) {
  const overlay = document.getElementById("xacnhananhsp-overlay");
  if (!overlay?.classList.contains("xnas-open")) return;

  if (e.key === "Enter") {
    e.preventDefault();
    e.stopImmediatePropagation();
    finish(false);
    return;
  }

  // Không cho Escape/Space vô tình vượt qua xác nhận.
  if (e.key === "Escape" || e.key === " ") {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}

function openStockQuick(anchor, masp) {
  const code = String(masp || "").trim().toUpperCase();
  if (!code) return;
  try {
    if (window.StockQuick?.showFor) {
      window.StockQuick.showFor(anchor || document.body, code);
      return;
    }
    if (typeof window.stockQuickPopup === "function") {
      window.stockQuickPopup(code);
      return;
    }
    console.warn("[xacnhananhsp] StockQuickPopup chưa sẵn sàng.");
  } catch (err) {
    console.warn("[xacnhananhsp] Không mở được StockQuickPopup:", err);
  }
}

function finish(result) {
  if (typeof currentResolve !== "function") return;
  const resolve = currentResolve;
  currentResolve = null;
  currentMasp = "";
  const overlay = document.getElementById("xacnhananhsp-overlay");
  overlay?.classList.remove("xnas-open");
  overlay?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("xnas-verify-active");
  resolve(!!result);
}

function injectAdminBypass() {
  if (!laTrangApDungXacNhanAnhSP() || !laAdminXacNhanAnhSP()) return;
  if (document.getElementById("xacnhananhsp-admin-wrap")) return;

  const tongsl = document.getElementById("tongsl");
  if (!tongsl) return;
  const label = tongsl.closest("label") || tongsl.parentElement;
  if (!label) return;

  const wrap = document.createElement("label");
  wrap.id = "xacnhananhsp-admin-wrap";
  wrap.title = "Chỉ Admin nhìn thấy. Khi bật, luồng bán hàng chạy như trước và không hiện màn hình xác nhận ảnh.";
  wrap.innerHTML = `<input id="xacnhananhsp-boqua" type="checkbox"> Bỏ kiểm ảnh`;
  label.insertAdjacentElement("afterend", wrap);

  const cb = wrap.querySelector("#xacnhananhsp-boqua");
  cb.checked = truthy(localStorage.getItem(STORAGE_KEY));
  cb.addEventListener("change", () => {
    localStorage.setItem(STORAGE_KEY, cb.checked ? "true" : "false");
  });
}

function khoiTaoXacNhanAnhSP() {
  if (!laTrangApDungXacNhanAnhSP()) return;
  injectStyle();
  createOverlay();
  injectAdminBypass();
  initialized = true;
}

async function xacNhanAnhSanPham({ masp, tensp = "", gia = 0 } = {}) {
  if (!laTrangApDungXacNhanAnhSP()) return true;
  if (coDuocBoQuaXacNhanAnhSP()) return true;

  if (!initialized) khoiTaoXacNhanAnhSP();

  // Nếu vì lý do nào đó popup cũ chưa giải quyết, ưu tiên hủy popup cũ thay vì chồng popup.
  if (typeof currentResolve === "function") finish(false);

  const code = String(masp || "").trim().toUpperCase();
  currentMasp = code;

  const overlay = document.getElementById("xacnhananhsp-overlay");
  const img = document.getElementById("xacnhananhsp-image");
  const maspEl = document.getElementById("xacnhananhsp-masp");
  const tenEl = document.getElementById("xacnhananhsp-ten");
  const giaEl = document.getElementById("xacnhananhsp-gia");

  maspEl.textContent = code || "(không có mã)";
  tenEl.textContent = String(tensp || "").trim();
  tenEl.style.display = tenEl.textContent ? "block" : "none";
  giaEl.textContent = formatMoney(gia);

  const imageUrl = `${IMAGE_BASE}/${code}.JPG`;
  const fallbackUrl = `${IMAGE_BASE}/NO-IMAGE.JPG`;
  img.onerror = () => {
    if (img.src === fallbackUrl) return;
    img.onerror = null;
    img.src = fallbackUrl;
  };
  img.src = imageUrl;

  document.body.classList.add("xnas-verify-active");
  overlay.classList.add("xnas-open");
  overlay.setAttribute("aria-hidden", "false");

  return await new Promise((resolve) => {
    currentResolve = resolve;
  });
}

// MenuComponent hỏi hàm này khi người dùng Enter ở #masp.
// Nếu đang bật kiểm ảnh thì KHÔNG được focus/mở popup size trước; chờ xác nhận ĐÚNG SP xong mới mở.
function nenTriHoanPopupSize() {
  return laTrangApDungXacNhanAnhSP() && !coDuocBoQuaXacNhanAnhSP();
}

function moPopupSizeSauXacNhan() {
  const sizeEl = document.getElementById("size");
  if (!sizeEl) return;
  try {
    sizeEl.focus();
    sizeEl.select?.();
    if (typeof window.openCurrentMenuSizeDropdown === "function") {
      window.openCurrentMenuSizeDropdown();
    }
  } catch (err) {
    console.warn("[xacnhananhsp] Không mở được popup size sau xác nhận:", err);
  }
}

// Đăng ký hook toàn cục. hoadon.js KHÔNG import file này; chỉ gọi nếu hook tồn tại.
window.XacNhanAnhSP = Object.freeze({
  xacNhanAnhSanPham,
  khoiTao: khoiTaoXacNhanAnhSP,
  refreshAdminUI: injectAdminBypass,
  laTrangApDung: laTrangApDungXacNhanAnhSP,
  laAdmin: laAdminXacNhanAnhSP,
  coDuocBoQua: coDuocBoQuaXacNhanAnhSP,
  nenTriHoanPopupSize,
  moPopupSizeSauXacNhan
});

function bootXacNhanAnhSP() {
  if (!laTrangApDungXacNhanAnhSP()) return;
  khoiTaoXacNhanAnhSP();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(bootXacNhanAnhSP, 0), { once: true });
} else {
  setTimeout(bootXacNhanAnhSP, 0);
}
