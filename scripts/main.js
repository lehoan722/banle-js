
import { khoiTaoTimMaSP, luuMaSanPhamMoi, moCauHinhTruong, luuCauHinhTruong } from './sanpham.js';
import { chuyenFocus, ganTenNV, xoaDongDangChon, getBangKetQua } from './hoadon.js';
import { capNhatBangHTML, resetFormBang } from './bangketqua.js';
import { capNhatThongTinTong } from './utils.js';
import { capNhatSoHoaDonTuDong } from './sohoadon.js';
import { ganSuKienDuyetHoaDon } from './duyetHoaDon.js';
import { ganSuKienNutLenh } from './nutLenh.js';
import { khoiTaoShortcut } from './shortcut.js';
import { xacNhanSuaHoaDon, luuHoaDonQuaAPI, luuHoaDonCaHaiBan } from './luuhoadon.js';
import { supabase } from './supabaseClient.js';
import { moBangDanhMucHangHoa, timLaiTrongBangDM, chonDongDeSua } from './banghanghoa.js';
import { moPopupNhapHangHoa, luuHangHoa, themTiepSanPham } from './popupHanghoa.js';
import { initAutocompleteRealtimeMasp } from "./autocompleteSPRealtime.js";
import { setupBeepUnlockOnce, playSuccessBeep, playWaitSizeBeep, playAlertBeep } from './soundBeep.js';
import { setupScanner } from './scanner.js';
import { showFlash, showToast } from './feedback.js';
import { ensureAccess } from './auth_guard.js';

// ===== GUARD THEO THIẾT BỊ & VỊ TRÍ CỬA HÀNG =====
function isMobileDevice() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  // Các từ khoá phổ biến trên điện thoại / tablet
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

async function checkInStoreLocation() {
  // Toạ độ các cửa hàng (CẦN CẬP NHẬT LẠI CHO ĐÚNG)
  const STORE_POINTS = [
    // Ví dụ: Hamburg center – bạn thay lại bằng toạ độ cửa hàng thật
    { lat: 21.5527, lng: 105842555 }
  ];
  const MAX_DISTANCE_M = 200; // bán kính cho phép (m) – muốn chặt hơn thì giảm xuống

  // Nếu thiết bị không hỗ trợ định vị
  if (!navigator.geolocation) {
    alert("Thiết bị không hỗ trợ định vị. Ứng dụng này chỉ dùng trong cửa hàng.");
    return false;
  }

  // Lấy vị trí hiện tại (promise wrapper)
  const pos = await new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      (err) => {
        console.error("Lỗi định vị:", err);
        alert("Không lấy được vị trí (có thể bạn đã từ chối). Ứng dụng chỉ dùng trong cửa hàng.");
        resolve(null);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000
      }
    );
  });

  if (!pos) return false;

  const { latitude, longitude } = pos.coords;

  // Hàm tính khoảng cách 2 toạ độ (haversine)
  function distanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // bán kính trái đất (m)
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  let ok = false;
  for (const p of STORE_POINTS) {
    const dist = distanceInMeters(latitude, longitude, p.lat, p.lng);
    console.log("Khoảng cách tới điểm", p, "=", dist, "m");
    if (dist <= MAX_DISTANCE_M) {
      ok = true;
      break;
    }
  }

  if (!ok) {
    alert("Bạn không ở trong khu vực cửa hàng, ứng dụng không cho phép sử dụng.");
  }
  return ok;
}

// ===== HẾT PHẦN GUARD THEO THIẾT BỊ & VỊ TRÍ =====


// Khởi tạo âm thanh & tạo 2 helper toàn cục '/scripts/success.wav'

export async function khoiTaoUngDung() {

  window.danhMucNhom = window.danhMucNhom instanceof Map ? window.danhMucNhom : new Map();

  console.log("🚀 Khởi động hệ thống sau đăng nhập...");

  // Xác định đang ở trang nào (dựa theo URL)
  const path = (window.location && window.location.pathname) || "";
  const isBannvcs1Page = path.includes("bannvcs1"); // chỉ trang bannvcs1.html mới bị bắt định vị

  // === 1. NẾU LÀ TRANG BÁN NHÂN VIÊN CS1 THÌ MỚI CHẠY GUARD MOBILE + VỊ TRÍ ===
  if (isBannvcs1Page) {
    // Chỉ cho phép trên điện thoại / tablet
    if (!isMobileDevice()) {
      alert("Ứng dụng bán hàng nhân viên chỉ được dùng trên điện thoại tại cửa hàng.");
      try {
        const app = document.getElementById("app-container");
        const login = document.getElementById("login-container");
        if (app) app.style.display = "none";
        if (login) login.style.display = "";
      } catch (e) {
        console.warn("Không ẩn/hiện được container sau khi chặn thiết bị:", e);
      }
      return;
    }

    // Kiểm tra vị trí cửa hàng
    const inStore = await checkInStoreLocation();
    if (!inStore) {
      try {
        const app = document.getElementById("app-container");
        const login = document.getElementById("login-container");
        if (app) app.style.display = "none";
        if (login) login.style.display = "";
      } catch (e) {
        console.warn("Không ẩn/hiện được container sau khi chặn vị trí:", e);
      }
      return;
    }
  }

  // === 2. GUARD QUYỀN TRUY CẬP TRANG (DÙNG CHUNG CHO TẤT CẢ CÁC TRANG) ===
  const manvDangNhap = localStorage.getItem('manv');           // bạn đã set sau khi login
  const ok = await ensureAccess({ supabase, manv: manvDangNhap });
  if (!ok) return; // bị chặn thì dừng khởi tạo còn lại
  // === HẾT GUARD ===


  const { data: dssp, error } = await supabase.from("dmhanghoa").select("*");
  if (error) {
    alert("Lỗi khi tải danh mục hàng hóa");
    console.error(error);
    // KHÔNG return; vẫn tiếp tục để còn nạp dmnhomhang
    window.sanPhamData = {};  // vẫn thiết lập biến rỗng để phần khác không vấp
  } else {
    window.sanPhamData = {};
    dssp.forEach(sp => window.sanPhamData[sp.masp] = sp);
  }

  window.sanPhamData = {};
  dssp.forEach(sp => window.sanPhamData[sp.masp] = sp);

  const { data: dsnv, error: errnv } = await supabase.from("dmnhanvien").select("manv, tennv");
  if (!errnv) {
    window.nhanVienData = {};
    dsnv.forEach(nv => window.nhanVienData[nv.manv] = nv.tennv);
  }

  // Cache danh mục nhóm hàng
  window.danhMucNhom = new Map();

  async function loadDanhMucNhom() {
    try {
      const { data, error } = await supabase
        .from("dmnhomhang")
        .select("manhom, quanlysize, diadiem");
      if (error) {
        console.error("Lỗi tải dmnhomhang:", error);
        return;
      }
      data.forEach(row => {
        window.danhMucNhom.set(String(row.manhom).toUpperCase(), {
          quanlysize: row.quanlysize,
          diadiem: (row.diadiem || "").toUpperCase()
        });
      });
      console.log("✅ Đã load dmnhomhang:", window.danhMucNhom.size, "nhóm");
    } catch (e) {
      console.error("Exception loadDanhMucNhom:", e);
    }
  }

  await loadDanhMucNhom();

  //khoiTaoTimMaSP(window.sanPhamData);

  window.luuMaSanPhamMoi = () => luuMaSanPhamMoi(window.sanPhamData);
  window.moCauHinhTruong = moCauHinhTruong;
  window.luuCauHinhTruong = luuCauHinhTruong;
  window.moBangDanhMucHangHoa = moBangDanhMucHangHoa;
  window.timLaiTrongBangDM = timLaiTrongBangDM;
  window.chonDongDeSua = chonDongDeSua;
  window.moPopupNhapHangHoa = moPopupNhapHangHoa;
  window.luuHangHoa = luuHangHoa;
  window.themTiepSanPham = themTiepSanPham;
  window.luuHoaDonQuaAPI = luuHoaDonQuaAPI;
  window.luuHoaDonCaHaiBan = luuHoaDonCaHaiBan;
  window.xacNhanSuaHoaDon = xacNhanSuaHoaDon;

  khoiTaoShortcut();
  ganSuKienDuyetHoaDon();
  ganSuKienNutLenh();

  ["masp", "soluong", "size"].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.addEventListener("keydown", chuyenFocus);
  });

  const manvInput = document.getElementById("manv");
  if (manvInput) manvInput.addEventListener("change", ganTenNV);

  document.getElementById("chietkhau")?.addEventListener("blur", () => {
    capNhatThongTinTong(getBangKetQua());
  });

  document.getElementById("khachtra")?.addEventListener("input", (e) => {
    e.target.dataset.modified = true;
    capNhatThongTinTong(getBangKetQua());
  });

  document.getElementById("ngay").value = new Date().toISOString().slice(0, 10);
  await capNhatSoHoaDonTuDong();
  document.getElementById("masp").focus();
  initAutocompleteRealtimeMasp();

  // Gắn nút chuyển dạng bảng
  const btnChuyen = document.getElementById("btnChuyenBang");
  if (btnChuyen) {
    import('./bangketqua.js').then(mod => {
      btnChuyen.addEventListener("click", () => mod.toggleBangKetQua());
    });
  }

  // Helper: lấy mã gốc, bỏ hậu tố (xx) nếu có, chuẩn hoá IN HOA
  function layMaspGoc(str) {
    return String(str || "")
      .toUpperCase()
      .replace(/\(\d+\)\s*$/, "") // bỏ "(12)" ở cuối, nếu có
      .trim();
  }

  async function hienThiAnhSanPhamTuMasp() {
    const imgEl = document.querySelector(".product-image");
    if (!imgEl) return;

    // Ưu tiên lấy từ ô masp; nếu rỗng thì fallback masp_last
    const rawInput = document.getElementById("masp")?.value || "";
    const raw = rawInput.trim() || (window.masp_last || "");
    if (!raw) return;

    const masp = layMaspGoc(raw);       // ✅ dùng mã gốc, không dính (xx)
    const extension = ".JPG";            // ✅ luôn IN HOA như quy ước của bạn
    const base =
      "https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham";

    const url = `${base}/${masp}${extension}`;

    // Tránh reload ảnh không cần thiết nếu cùng URL
    if (imgEl.getAttribute("src") !== url) {
      imgEl.src = url;
    }

    imgEl.onerror = () => {
      imgEl.onerror = null; // tránh vòng lặp nếu fallback cũng lỗi
      imgEl.src = `${base}/NO-IMAGE.JPG`;
    };
  }

  // Đảm bảo cho biến global dùng được ở bangketqua.js
  window.hienThiAnhSanPhamTuMasp = hienThiAnhSanPhamTuMasp;

  // Gán sự kiện khi nhập xong
  const maspInput = document.getElementById("masp");
  if (maspInput) {
    maspInput.addEventListener("blur", hienThiAnhSanPhamTuMasp);
    maspInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        hienThiAnhSanPhamTuMasp();
      }
    });
  }

  const soluongInput = document.getElementById("soluong");

  if (soluongInput) {
    soluongInput.addEventListener("input", (e) => {
      const val = soluongInput.value;

      // Nếu không phải số hoặc số > 100
      if (!/^\d*$/.test(val) || parseInt(val, 10) > 100) {
        alert("Chỉ được phép nhập số nhỏ hơn 100!");
        soluongInput.focus();
        soluongInput.select(); // Bôi đen toàn bộ nội dung để nhập lại
        return;
      }
    });

    // Nếu người dùng bỏ trống khi blur → gán mặc định 1
    soluongInput.addEventListener("blur", () => {
      const val = soluongInput.value.trim();
      if (val === "" || parseInt(val, 10) === 0) {
        soluongInput.value = "1";
      }
    });
  }


  // Đảm bảo ô cơ sở luôn hiển thị đúng và bị khóa không đổi
  const cs = localStorage.getItem("diadiem");
  const csSelect = document.getElementById("diadiem");
  if (cs && csSelect) {
    csSelect.value = cs;
    csSelect.disabled = true; // Không cho đổi
  }

  // 1. Hàm tải lại danh mục sản phẩm
  window.taiLaiSanPhamData = async function () {
    const { data, error } = await window.supabase
      .from('dmhanghoa')
      .select('*');
    if (error) {
      alert('Không tải được danh mục hàng hóa!');
      return;
    }
    window.sanPhamData = {};
    dssp.forEach(sp => {
      const key = String(sp.masp || "").toUpperCase().trim();
      window.sanPhamData[key] = sp;
    });
    //alert('✅ Đã tải lại danh mục sản phẩm!');
  };

  // 2. Gắn F1 toàn trang (hoặc giới hạn theo vùng nhập liệu tuỳ ý)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'F1') {
      e.preventDefault();
      window.taiLaiSanPhamData();
    }
  });

  document.getElementById('btnReloadSP').onclick = window.taiLaiSanPhamData;
  // Chèn cuối khoiTaoUngDung()
  loadQuickActionState();
  ["nhapnhanh", "size45", "inSauKhiLuu", "inKhongHoi"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", saveQuickActionState);
  });

  // Tải danh sách size từ Supabase về cache global
  const { data: dsSize, error: errSize } = await supabase.from("dm_size").select("size");
  if (!errSize && dsSize) {
    // Lưu danh sách size (toàn bộ giá trị, ép về string)
    window.danhMucSize = dsSize.map(row => String(row.size).trim());
  } else {
    window.danhMucSize = []; // fallback rỗng nếu có lỗi
  }

  // Mở khóa audio trên iOS sau tương tác đầu tiên
  setupBeepUnlockOnce(document);

  // Gán 3 hàm toàn cục để các module khác gọi như cũ
  window.soundSuccess = playSuccessBeep;
  window.soundWaitSize = playWaitSizeBeep;
  window.soundAlert = playAlertBeep;


  // Phát âm cảnh báo mỗi khi gọi alert()
  // Phát âm cảnh báo TRƯỚC, rồi mới mở alert ở tick kế tiếp
  (function patchAlert() {
    const nativeAlert = window.alert;
    window.alert = function (message) {
      try { window.soundAlert?.(); } catch { }
      setTimeout(() => nativeAlert.call(window, message), 300);
      return; // giữ API như alert gốc
    };
  })();

  // Tạo scanner, gắn callback khi đọc được mã
  const videoEl = document.getElementById("scanVideo");
  const statusEl = document.getElementById("scanStatus");
  const selectEl = document.getElementById("cameraSelect");
  const flashBtn = document.getElementById("flashBtn");
  const fileInput = document.getElementById("pickImage");

  const { startScan, stopScan, toggleTorch, changeCamera, decodeFromFile } = setupScanner({
    videoEl, statusEl, selectEl,
    onResult: (code) => {
      if (!code) return;
      showFlash();
      showToast(`✅ Đã quét: ${code}`, "info");
      try { window.soundSuccess?.(); } catch { }

      const maspInput = document.getElementById("masp");
      maspInput.value = code;
      maspInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

      document.getElementById("popupScan").style.display = "none";
      stopScan();
    }
  });

  // mở popup & mặc định chọn Ultra-Wide/0.5x nếu có
  const btnScan = document.createElement("button");
  btnScan.textContent = "📷 Quét";
  btnScan.onclick = () => {
    document.getElementById("popupScan").style.display = "block";
    startScan(); // startScan() sẽ tự điền dropdown & chọn default Ultra-Wide
  };
  document.querySelector(".top-inputs").appendChild(btnScan);

  document.getElementById("btnCloseScan").onclick = () => {
    document.getElementById("popupScan").style.display = "none";
    stopScan();
  };

  // bật/tắt đèn
  flashBtn.onclick = async () => {
    const on = await toggleTorch();
    flashBtn.textContent = on ? "🔦 Tắt đèn" : "🔦 Đèn";
  };

  // đổi camera từ dropdown
  selectEl.onchange = () => changeCamera(selectEl.value);

  // ảnh có sẵn
  fileInput.onchange = (e) => {
    const f = e.target.files?.[0];
    if (f) decodeFromFile(f);
  };

  // === TỒN KHO TỨC THÌ: Observer + batch RPC (KHÔNG đụng code render cũ) ===
  {
    const tbody = document.querySelector('#bangketqua tbody');
    if (!tbody) console.warn('Không thấy #bangketqua tbody');
    const memo = new Map(); // cache theo key "MASP|SIZE"
    let queue = new Map();  // gom batch {key -> {masp,size,row}}
    let batchTimer = null;

    function keyOf(masp, size) {
      return (String(masp || '').toUpperCase() + '|' + String(size || '').trim());
    }

    function scheduleBatch() {
      if (batchTimer) return;
      batchTimer = setTimeout(async () => {
        const items = Array.from(queue.values());
        queue.clear(); batchTimer = null;
        if (!items.length) return;

        // Lấy mảng MASP (upper) cho RPC (giữ đúng format que hàm cũ/wrapper)
        const maspSet = new Set(items.map(it => String(it.masp || '').toUpperCase()));
        const masp_list = Array.from(maspSet);

        // Gọi RPC gọn cột (wrapper mới)
        const { data, error } = await window.supabase.rpc('timton_hientai_v2', { masp_list });
        if (error) {
          console.error('RPC ton nhanh lỗi:', error);
          // Đổ lỗi nhẹ vào ô
          items.forEach(({ row }) => {
            const cs1 = row.querySelector('td[data-col="ton_cs1"]'); if (cs1) cs1.textContent = '…';
            const cs2 = row.querySelector('td[data-col="ton_cs2"]'); if (cs2) cs2.textContent = '…';
          });
          return;
        }

        // Map kết quả theo key "MASP|SIZE"
        const resultMap = new Map();
        (data || []).forEach(r => {
          const k = keyOf(r.masp, r.size);
          resultMap.set(k, { ton_cs1: r.ton_cs1 || 0, ton_cs2: r.ton_cs2 || 0 });
        });

        // Điền số vào từng dòng; ghi memo
        items.forEach(({ masp, size, row }) => {
          const k = keyOf(masp, size);
          const val = resultMap.get(k) || { ton_cs1: 0, ton_cs2: 0 };
          memo.set(k, val);

          const cs1 = row.querySelector('td[data-col="ton_cs1"]');
          const cs2 = row.querySelector('td[data-col="ton_cs2"]');
          if (cs1) cs1.textContent = val.ton_cs1;
          if (cs2) cs2.textContent = val.ton_cs2;
        });
      }, 80); // gom trong ~80ms cho 1-3 mã/lượt
    }

    function ensureTds(row) {
      // Nếu chưa có 2 ô tồn → append vào cuối hàng
      if (!row.querySelector('td[data-col="ton_cs1"]')) {
        const td1 = document.createElement('td'); td1.dataset.col = 'ton_cs1'; td1.textContent = '…';
        row.appendChild(td1);
      }
      if (!row.querySelector('td[data-col="ton_cs2"]')) {
        const td2 = document.createElement('td'); td2.dataset.col = 'ton_cs2'; td2.textContent = '…';
        row.appendChild(td2);
      }
    }

    function pickCellText(row, idx) {
      const c = row.cells[idx];
      return c ? c.textContent.trim() : '';
    }

    function handleRow(row) {
      // Cột hiện có theo thead: 0 Mã hàng, 1 Tên, 2 Kích cỡ, 3 SL, 4 ĐVT, 5 Đơn giá, 6 KM, 7 Thành tiền, 8 Vị trí
      const masp = pickCellText(row, 0).toUpperCase();
      const size = pickCellText(row, 2);
      if (!masp) return;

      const cardCell = row.cells[0] || row; // ưu tiên ô "Mã hàng"

      // 🔹 GẮN POPUP TỒN/BÁN NHANH THEO MÃ – chỉ gắn 1 lần/dòng
      if (
        window.StockQuick &&
        typeof window.StockQuick.attach === "function" &&
        !row.dataset.stockQuickBound
      ) {
        cardCell.classList.add("card");
        window.StockQuick.attach(cardCell, masp);
        row.dataset.stockQuickBound = "1";

        // PC: cho phép click CẢ DÒNG thì cũng mở popup
        const isTouch =
          "ontouchstart" in window || (navigator && navigator.maxTouchPoints > 0);

        if (!isTouch && typeof window.StockQuick.showFor === "function" &&
          !row.dataset.stockQuickRowClickBound) {

          row.addEventListener("click", () => {
            // chỉ gọi showFor, không toggle, để luôn hiện popup theo dòng đang chọn
            window.StockQuick.showFor(cardCell, masp);
          });

          row.dataset.stockQuickRowClickBound = "1";
        }
      }

      // 🔹 Phần tồn kho tức thì – GIỮ NGUYÊN như cũ
      ensureTds(row);
      const k = keyOf(masp, size);

      if (memo.has(k)) {
        const val = memo.get(k);
        const cs1 = row.querySelector('td[data-col="ton_cs1"]');
        const cs2 = row.querySelector('td[data-col="ton_cs2"]');
        if (cs1) cs1.textContent = val.ton_cs1;
        if (cs2) cs2.textContent = val.ton_cs2;
        return;
      }

      queue.set(k, { masp, size, row });
      scheduleBatch();
    }


    document.addEventListener("keydown", (e) => {
      // tránh xóa khi đang gõ trong input
      const tag = (e.target.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || e.isComposing) return;

      if (e.key === "Delete") {
        e.preventDefault();
        try { xoaDongDangChon(); } catch (err) { console.warn(err); }
      }
    });

    // Quan sát thêm dòng mới hoặc cập nhật nội dung dòng
    if (tbody) {
      const mo = new MutationObserver(muts => {
        muts.forEach(m => {
          m.addedNodes.forEach(node => {
            if (node.nodeType === 1 && node.tagName === 'TR') handleRow(node);
          });
          if (m.type === 'childList' && m.target && m.target.tagName === 'TBODY') return;
          // Nếu cell thay đổi (vd sửa size sau khi add)
          if (m.type === 'characterData') {
            const row = m.target.parentElement?.parentElement;
            if (row && row.tagName === 'TR') handleRow(row);
          }
        });
      });
      mo.observe(tbody, { childList: true, subtree: true, characterData: true });
    }
  }

}

// --- Đặt ở cuối file main.js ---
function saveQuickActionState() {
  const states = {
    nhapnhanh: document.getElementById("nhapnhanh")?.checked,
    size45: document.getElementById("size45")?.checked,
    inSauKhiLuu: document.getElementById("inSauKhiLuu")?.checked,
    inKhongHoi: document.getElementById("inKhongHoi")?.checked
  };
  localStorage.setItem("quickActions", JSON.stringify(states));
}

function loadQuickActionState() {
  const states = JSON.parse(localStorage.getItem("quickActions") || '{}');
  if ("nhapnhanh" in states && document.getElementById("nhapnhanh"))
    document.getElementById("nhapnhanh").checked = states.nhapnhanh;
  if ("size45" in states && document.getElementById("size45"))
    document.getElementById("size45").checked = states.size45;
  if ("inSauKhiLuu" in states && document.getElementById("inSauKhiLuu"))
    document.getElementById("inSauKhiLuu").checked = states.inSauKhiLuu;
  if ("inKhongHoi" in states && document.getElementById("inKhongHoi"))
    document.getElementById("inKhongHoi").checked = states.inKhongHoi;
}

document.addEventListener("DOMContentLoaded", function () {
  loadQuickActionState();
  ["nhapnhanh", "size45", "inSauKhiLuu", "inKhongHoi"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", saveQuickActionState);
  });
});
