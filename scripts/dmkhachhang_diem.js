// scripts/services/dmkhachhang.js

const TY_LE_TOI_DA_DUNG_DIEM = 0.10;
export function mountKhachHangSuggest(options = {}) {
  const {
    inputId = "makh",
    tenInputId = "khachhang",
    suggestBoxId = "khSuggestList",
    btnSearchId = "btnPopupKH",
    diemInputId = "diem_hientai",
    hangInputId = "hang_khach",
    diemTruInputId = "diem_tru",
    tienDoiDiemInputId = "tien_doi_diem",
    nhapKhachUrl = "/nhapdmkhachhang.html",
  } = options;

  const makhInput = document.getElementById(inputId);
  const suggestBox = document.getElementById(suggestBoxId);
  const btnPopup = document.getElementById(btnSearchId);

  if (!makhInput || !suggestBox) {
    console.warn("⚠️ Không tìm thấy input hoặc suggestBox khách hàng.");
    return;
  }

  let dsSuggest = [];
  let suggestIndex = -1;
  let searchTimer = null;

  // Trạng thái tạo nhanh khách mới ngay trên trang bán nhân viên
  let dangTaoKhachMoi = false;
  let makhMoiTam = "";

  function getEl(id) {
    return document.getElementById(id);
  }

  function setVal(id, val) {
    const el = getEl(id);
    if (el) el.value = val ?? "";
  }

  function parseMoneyValue(val) {
    return Number(String(val || "0").replace(/\D/g, "")) || 0;
  }

  function parseMoneyInput(id) {
    return parseMoneyValue(getEl(id)?.value);
  }

  function coHangTrongBangKetQua() {
    const tbody = document.querySelector("#bangketqua tbody");
    return !!tbody && tbody.querySelectorAll("tr").length > 0;
  }

  function khoiPhucTongGocTruocKhiDoiKhach() {
    const tienDoiDiemDangCo = parseMoneyInput(tienDoiDiemInputId);

    // Nếu chưa có hàng trong hóa đơn thì tuyệt đối không lấy tổng cũ
    if (!coHangTrongBangKetQua()) {
      window.__tongPhaiTraGoc = 0;

      setVal(diemTruInputId, "0");
      setVal(tienDoiDiemInputId, "0");
      setVal("km_diem_hienthi", "0");
      setVal("phaithanhtoan", "0");
      setVal("khachtra", "0");
      setVal("conlai", "0");

      return 0;
    }

    const tongDangHienThi = parseMoneyInput("phaithanhtoan");
    const tongGoc = tongDangHienThi + tienDoiDiemDangCo;

    window.__tongPhaiTraGoc = tongGoc;

    setVal(diemTruInputId, "0");
    setVal(tienDoiDiemInputId, "0");
    setVal("km_diem_hienthi", "0");
    setVal("phaithanhtoan", tongGoc.toLocaleString("vi-VN"));
    setVal("khachtra", tongGoc.toLocaleString("vi-VN"));
    setVal("conlai", "0");

    return tongGoc;
  }

  function clearThongTinKhachHang() {
    setVal(tenInputId, "");
    setVal(diemInputId, "");
    setVal(hangInputId, "");
    setVal(diemTruInputId, "0");
    setVal(tienDoiDiemInputId, "0");

    const tenEl = getEl(tenInputId);
    if (tenEl) tenEl.readOnly = true;

    dangTaoKhachMoi = false;
    makhMoiTam = "";
  }

  async function napThongTinDiemKhach(makh) {
    if (!makh) return null;

    const { data, error } = await window.supabase
      .from("dmkhachhang")
      .select("makh, tenkh, diem_hientai, hang_khach, tong_chi_tieu, so_lan_mua")
      .eq("makh", makh)
      .maybeSingle();

    if (error || !data) {
      alert("Không đọc được thông tin điểm khách hàng.");
      return null;
    }

    setVal(diemInputId, data.diem_hientai || 0);
    setVal(hangInputId, data.hang_khach || "THUONG");
    setVal(diemTruInputId, "0");
    setVal(tienDoiDiemInputId, "0");

    return data;
  }

  function renderSuggest(data) {
    dsSuggest = data || [];
    suggestIndex = dsSuggest.length ? 0 : -1;

    if (!dsSuggest.length) {
      suggestBox.innerHTML = `
        <div style="padding:8px;color:#777;">
          Không có khách phù hợp. Nhấn Enter để thêm mới.
        </div>
      `;
      suggestBox.style.display = "block";
      return;
    }

    suggestBox.innerHTML = dsSuggest.map((kh, i) => `
      <div class="kh-suggest-item"
        data-idx="${i}"
        style="padding:7px 8px; cursor:pointer; border-bottom:1px solid #eee; ${i === 0 ? "background:#eaf4ff;" : ""}">
        <b>${kh.makh || ""}</b> - ${kh.tenkh || ""}
        <div style="font-size:12px;color:#666;">
          Điểm: ${kh.diem_hientai || 0} | Hạng: ${kh.hang_khach || "THUONG"}
        </div>
      </div>
    `).join("");

    suggestBox.style.display = "block";

    suggestBox.querySelectorAll(".kh-suggest-item").forEach(item => {
      item.addEventListener("mousedown", async (e) => {
        e.preventDefault();
        const idx = Number(item.dataset.idx);
        await chonKhachHang(idx);
      });
    });
  }

  function updateActiveSuggest() {
    suggestBox.querySelectorAll(".kh-suggest-item").forEach((item, i) => {
      item.style.background = i === suggestIndex ? "#eaf4ff" : "#fff";
      if (i === suggestIndex) item.scrollIntoView({ block: "nearest" });
    });
  }

  async function timKhachHang(keyword) {
    const kw = String(keyword || "").trim();

    if (!kw) {
      suggestBox.style.display = "none";
      clearThongTinKhachHang();
      return;
    }

    const { data, error } = await window.supabase
      .from("dmkhachhang")
      .select("makh, tenkh, dienthoai, diem_hientai, hang_khach")
      .or(`makh.ilike.%${kw}%,tenkh.ilike.%${kw}%,dienthoai.ilike.%${kw}%`)
      .order("makh", { ascending: true })
      .limit(20);

    if (error) {
      console.error("Lỗi tìm khách hàng:", error);
      suggestBox.innerHTML = `<div style="padding:8px;color:red;">Lỗi tìm khách hàng</div>`;
      suggestBox.style.display = "block";
      return;
    }

    renderSuggest(data || []);
  }

  async function chonKhachHang(idx) {
    const kh = dsSuggest[idx];
    if (!kh) return;

    // ✅ Trước khi đổi khách, khôi phục hóa đơn về tổng gốc
    khoiPhucTongGocTruocKhiDoiKhach();

    makhInput.value = kh.makh || "";
    setVal(tenInputId, kh.tenkh || "");
    suggestBox.style.display = "none";

    dangTaoKhachMoi = false;
    makhMoiTam = "";

    const tenEl = getEl(tenInputId);
    if (tenEl) tenEl.readOnly = true;

    localStorage.setItem("pending_makh_banle", kh.makh || "");
    localStorage.setItem("pending_tenkh_banle", kh.tenkh || "");

    await napThongTinDiemKhach(kh.makh);

    setTimeout(() => {
      const diemTruEl = getEl(diemTruInputId);
      if (diemTruEl) {
        diemTruEl.focus();
        diemTruEl.select?.();
      }
    }, 50);
  }

  function laSoDienThoaiHopLe(makh) {
    const digits = String(makh || "").replace(/[^\d]/g, "");
    return /^\d{10}$/.test(digits);
  }

  function batDauTaoKhachMoiTaiBanLe() {
    const makh = String(makhInput.value || "").trim();

    if (!makh) return;

    if (!laSoDienThoaiHopLe(makh)) {
      alert("❌ Mã khách mới phải là số điện thoại 10 số.");
      makhInput.focus();
      makhInput.select?.();
      return;
    }

    dangTaoKhachMoi = true;
    makhMoiTam = makh;

    suggestBox.style.display = "none";

    setVal(tenInputId, "");
    setVal(diemInputId, "0");
    setVal(hangInputId, "THUONG");
    setVal(diemTruInputId, "0");
    setVal(tienDoiDiemInputId, "0");

    const tenEl = getEl(tenInputId);
    if (tenEl) {
      tenEl.readOnly = false;
      tenEl.placeholder = "Nhập tên khách mới...";
      setTimeout(() => {
        tenEl.focus();
        tenEl.select?.();
      }, 50);
    }
  }

  async function luuNhanhKhachMoiTaiBanLe() {
    const makh = String(makhMoiTam || makhInput.value || "").trim();
    const tenkh = String(getEl(tenInputId)?.value || "").trim();

    if (!laSoDienThoaiHopLe(makh)) {
      alert("❌ Mã khách/SĐT không hợp lệ. Phải đủ 10 số.");
      makhInput.focus();
      makhInput.select?.();
      return;
    }

    if (!tenkh) {
      alert("❌ Chưa nhập tên khách hàng.");
      getEl(tenInputId)?.focus();
      return;
    }

    const ok = confirm(
      `Xác nhận thêm khách hàng mới?\n\n` +
      `Mã KH: ${makh}\n` +
      `Tên KH: ${tenkh}\n` +
      `SĐT: ${makh}`
    );

    if (!ok) {
      getEl(tenInputId)?.focus();
      getEl(tenInputId)?.select?.();
      return;
    }

    const obj = {
      makh,
      tenkh,
      dienthoai: makh,
      diem_hientai: 0,
      hang_khach: "THUONG",
      so_lan_mua: 0,
      tong_chi_tieu: 0
    };

    const { error } = await window.supabase
      .from("dmkhachhang")
      .insert(obj);

    if (error) {
      console.error("❌ Lỗi thêm nhanh khách hàng:", error);
      alert("❌ Không lưu được khách hàng mới: " + error.message);
      return;
    }

    makhInput.value = makh;
    setVal(tenInputId, tenkh);
    setVal(diemInputId, "0");
    setVal(hangInputId, "THUONG");
    setVal(diemTruInputId, "0");
    setVal(tienDoiDiemInputId, "0");

    const tenEl = getEl(tenInputId);
    if (tenEl) tenEl.readOnly = true;

    dangTaoKhachMoi = false;
    makhMoiTam = "";

    localStorage.setItem("pending_makh_banle", makh);
    localStorage.setItem("pending_tenkh_banle", tenkh);

    alert("✅ Đã thêm khách hàng mới và sử dụng cho hóa đơn hiện tại.");

    setTimeout(() => {
      const maspEl = getEl("masp");
      if (maspEl) {
        maspEl.focus();
        maspEl.select?.();
      }
    }, 50);
  }

  // Giữ tên hàm cũ để không ảnh hưởng chỗ gọi cũ
  function moTrangNhapKhachMoi() {
    batDauTaoKhachMoiTaiBanLe();
  }

  function bindDiemTru() {
    const diemTruEl = getEl(diemTruInputId);
    if (!diemTruEl) return;

    const parseMoney = (id) => {
      const el = getEl(id);
      return Number(String(el?.value || "0").replace(/\D/g, "")) || 0;
    };

    function layTienMoiDiem() {
      return Number(window.TIEN_MOI_DIEM_KHACHHANG || 1000);
    }

    function layTongGocHoaDon() {
      return (
        Number(window.__tongPhaiTraGoc || 0) ||
        (parseMoney("phaithanhtoan") + parseMoney(tienDoiDiemInputId))
      );
    }

    function tinhDiemToiDaDuocDung() {
      const diemHienTai = Number(getEl(diemInputId)?.value || 0) || 0;
      const tongGoc = layTongGocHoaDon();
      const tienMoiDiem = layTienMoiDiem();

      if (!tienMoiDiem || tienMoiDiem <= 0) return 0;

      const tienToiDaDuocGiam = Math.floor(tongGoc * TY_LE_TOI_DA_DUNG_DIEM);
      const diemToiDaTheoHoaDon = Math.floor(tienToiDaDuocGiam / tienMoiDiem);

      return Math.max(0, Math.min(diemHienTai, diemToiDaTheoHoaDon));
    }

    function capNhatTongTheoDiem(diemTru) {
      const tongGoc =
        Number(window.__tongPhaiTraGoc || 0) ||
        layTongGocHoaDon();
      const tienMoiDiem = layTienMoiDiem();

      const tienGiam = diemTru * tienMoiDiem;
      const tongSauDiem = Math.max(0, tongGoc - tienGiam);

      setVal(tienDoiDiemInputId, tienGiam.toLocaleString("vi-VN"));
      setVal("km_diem_hienthi", tienGiam.toLocaleString("vi-VN"));
      setVal("phaithanhtoan", tongSauDiem.toLocaleString("vi-VN"));
      setVal("khachtra", tongSauDiem.toLocaleString("vi-VN"));
      setVal("conlai", "0");

      window.__tongPhaiTraGoc = tongGoc;
    }

    diemTruEl.addEventListener("input", () => {
      let raw = String(diemTruEl.value || "").trim();

      if (raw === "") {
        setVal(tienDoiDiemInputId, "0");
        setVal("km_diem_hienthi", "0");
        capNhatTongTheoDiem(0);
        return;
      }

      const diemToiDa = tinhDiemToiDaDuocDung();

      if (raw.toLowerCase() === "m") {
        diemTruEl.value = diemToiDa;
        capNhatTongTheoDiem(diemToiDa);
        return;
      }

      if (!/^\d+$/.test(raw)) {
        setVal(tienDoiDiemInputId, "0");
        setVal("km_diem_hienthi", "0");
        capNhatTongTheoDiem(0);
        return;
      }

      let diemTru = Number(raw) || 0;

      if (diemTru < 0) diemTru = 0;

      if (diemTru > diemToiDa) {
        alert(`Điểm dùng tối đa cho hóa đơn này là ${diemToiDa} điểm.`);
        diemTru = diemToiDa;
        diemTruEl.value = diemTru;
      }

      capNhatTongTheoDiem(diemTru);
    });
  }

  function bindEvents() {
    makhInput.addEventListener("input", () => {
      const kw = makhInput.value.trim();

      khoiPhucTongGocTruocKhiDoiKhach();
      clearThongTinKhachHang();

      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        timKhachHang(kw);
      }, 180);
    });

    makhInput.addEventListener("focus", () => {
      const kw = makhInput.value.trim();
      if (kw) timKhachHang(kw);
    });

    makhInput.addEventListener("keydown", async (e) => {
      const popupOpen = suggestBox.style.display !== "none";

      if (e.key === "ArrowDown" && popupOpen && dsSuggest.length) {
        e.preventDefault();
        suggestIndex = (suggestIndex + 1) % dsSuggest.length;
        updateActiveSuggest();
        return;
      }

      if (e.key === "ArrowUp" && popupOpen && dsSuggest.length) {
        e.preventDefault();
        suggestIndex = (suggestIndex - 1 + dsSuggest.length) % dsSuggest.length;
        updateActiveSuggest();
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();

        if (dsSuggest.length && suggestIndex >= 0) {
          await chonKhachHang(suggestIndex);
        } else {
          moTrangNhapKhachMoi();
        }
        return;
      }

      if (e.key === "Escape") {
        suggestBox.style.display = "none";
      }
    });

    btnPopup?.addEventListener("click", () => {
      const kw = makhInput.value.trim();
      timKhachHang(kw);
      makhInput.focus();
    });

    const tenKhachEl = getEl(tenInputId);
    tenKhachEl?.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      if (!dangTaoKhachMoi) return;

      e.preventDefault();
      await luuNhanhKhachMoiTaiBanLe();
    });

    document.addEventListener("mousedown", (e) => {
      const box = makhInput.closest("#khBox") || makhInput.parentElement;
      if (!box) return;
      if (!box.contains(e.target)) {
        suggestBox.style.display = "none";
      }
    });

    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState !== "visible") return;

      // Khi đang là hóa đơn mới / chưa có hàng thì tuyệt đối không tự kéo khách cũ về
      const coHang = coHangTrongBangKetQua();
      const sohd = String(getEl("sohd")?.value || "");

      if (!coHang && /^bancs[12]_\d+/i.test(sohd)) {
        localStorage.removeItem("pending_makh_banle");
        localStorage.removeItem("pending_tenkh_banle");
        clearThongTinKhachHang();
        makhInput.value = "";
        suggestBox.style.display = "none";
        return;
      }

      // Không tự nạp khách khi người dùng không đang chủ động chọn khách
    });

    bindDiemTru();
  }

  bindEvents();

  // Cho các file khác gọi lại nếu cần
  window.napThongTinDiemKhach = napThongTinDiemKhach;
  window.timKhachHangBanLe = timKhachHang;
}
