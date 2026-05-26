// scripts/services/dmkhachhang.js

let TY_LE_TOI_DA_DUNG_DIEM = 0.05;
let TIEN_MOI_DIEM_KHACHHANG = 1000;
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

  let lastCopiedMakh = "";

  // Ép ô mã khách chỉ nhập số + hiển thị bàn phím số trên điện thoại
  makhInput.setAttribute("type", "tel");
  makhInput.setAttribute("inputmode", "text");
  makhInput.setAttribute("pattern", "[0-9KkLl]*");
  makhInput.setAttribute("maxlength", "10");
  makhInput.setAttribute("autocomplete", "tel");

  function chuanHoaMakhNhap(value) {
    const raw = String(value || "").trim().toUpperCase();

    // Cho phép gõ từng bước: K -> KL
    if (raw === "K") return "K";
    if (raw === "KL") return "KL";

    // Nếu bắt đầu bằng K nhưng không phải KL thì chỉ giữ K để người dùng sửa tiếp
    if (raw.startsWith("K")) return raw.slice(0, 2);

    // Các trường hợp còn lại vẫn chỉ lấy số điện thoại 10 số
    return raw.replace(/\D/g, "").slice(0, 10);
  }

  // Giữ tên cũ để không ảnh hưởng các chỗ gọi cũ
  function chiLaySo(value) {
    return chuanHoaMakhNhap(value);
  }

  async function copyMakhNeuDu10So() {
    const makh = chuanHoaMakhNhap(makhInput.value);

    if (makh === "KL") {
      makhInput.value = "KL";
      khoaDiemKhachLe();
      suggestBox.style.display = "none";

      const maspEl = getEl("masp");
      setTimeout(() => {
        maspEl?.focus();
        maspEl?.select?.();
      }, 50);

      return;
    }

    if (makh.length !== 10) return;
    if (makh === lastCopiedMakh) return;

    lastCopiedMakh = makh;

    try {
      await navigator.clipboard.writeText(makh);
      console.log("✅ Đã copy mã khách:", makh);
    } catch (e) {
      console.warn("⚠️ Không copy được clipboard:", e);
    }
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  async function taiCauHinhDiemKhachHang() {
    try {
      const { data, error } = await window.supabase
        .from("cauhinh_diem_khachhang")
        .select("tien_moi_diem, ty_le_toi_da_dung_diem")
        .eq("id", 1)
        .eq("active", true)
        .maybeSingle();

      if (error) {
        console.warn("⚠️ Không đọc được cấu hình điểm:", error);
        return;
      }

      if (data) {
        TY_LE_TOI_DA_DUNG_DIEM = Number(data.ty_le_toi_da_dung_diem || 0.05);
        TIEN_MOI_DIEM_KHACHHANG = Number(data.tien_moi_diem || 1000);
        window.TIEN_MOI_DIEM_KHACHHANG = TIEN_MOI_DIEM_KHACHHANG;
      }
    } catch (e) {
      console.warn("⚠️ Lỗi tải cấu hình điểm:", e);
    }
  }

  function setVal(id, val) {
    const el = getEl(id);
    if (el) el.value = val ?? "";
  }

  function setZaloJoinedUI(checked, readonly = false) {
    const cb = getEl("zalo_da_vao_nhom");
    const text = getEl("zalo_joined_text");

    if (cb) {
      cb.checked = !!checked;
      cb.disabled = !!readonly;
    }

    if (text) {
      text.textContent = checked ? "đã vào" : "chưa vào";
      text.style.color = checked ? "#16a34a" : "#666";
      text.style.fontWeight = checked ? "bold" : "normal";
    }
  }

  function setZaloInvitedUI(checked, readonly = false) {

    const cb = getEl("zalo_da_moi");

    if (cb) {
      cb.checked = !!checked;
      cb.disabled = !!readonly;
    }
  }

  function resetZaloJoinedUI() {

    setZaloJoinedUI(false, true);

    setZaloInvitedUI(false, true);
  }

  async function capNhatZaloTheoMakhHienTai() {
    const makh = chuanHoaMakhNhap(makhInput.value);

    if (!makh || makh === "KL") {
      resetZaloJoinedUI();
      return false;
    }

    return await napTrangThaiZaloKhach(makh);
  }

  async function napTrangThaiZaloKhach(makh) {
    makh = String(makh || "").trim();

    if (!makh || makh.toUpperCase() === "KL") {
      setZaloJoinedUI(false, true);
      return false;
    }

    const { data, error } = await window.supabase
      .from("zalo_customer_status")
      .select(`
  makh,
  da_tham_gia_congdong,
  da_gui_loi_moi
`)
      .eq("makh", makh)
      .maybeSingle();

    if (error) {
      console.warn("Không đọc được trạng thái Zalo:", error);
      setZaloJoinedUI(false, false);
      return false;
    }

    const joined = !!data?.da_tham_gia_congdong;
    const invited = !!data?.da_gui_loi_moi;
    setZaloJoinedUI(joined, false);

    setZaloInvitedUI(invited, false);
    return joined;
  }

  async function luuTrangThaiZaloDaVaoNhom(makh, checked) {
    makh = String(makh || "").trim();

    if (!makh || makh.toUpperCase() === "KL") {
      alert("Chưa có mã khách hợp lệ.");
      setZaloJoinedUI(false, true);
      return false;
    }

    const info = {
      manv: localStorage.getItem("manv") || "",
      tennv: localStorage.getItem("tennv") || ""
    };

    const tenkh = getEl(tenInputId)?.value || "";
    const payload = {
      makh,
      tenkh,
      dienthoai: makh,
      da_tham_gia_congdong: !!checked,
      updated_by_manv: info.manv,
      updated_by_tennv: info.tennv,
      updated_at: new Date().toISOString()
    };

    const { error } = await window.supabase
      .from("zalo_customer_status")
      .upsert(payload, { onConflict: "makh" });

    if (error) {
      console.error("Lỗi lưu trạng thái Zalo:", error);
      alert("Không lưu được trạng thái Zalo: " + error.message);
      await napTrangThaiZaloKhach(makh);
      return false;
    }

    setZaloJoinedUI(!!checked, false);
    return true;
  }

  function laKhachLe() {
    const makh = String(makhInput?.value || "").trim().toUpperCase();
    const tenkh = String(getEl(tenInputId)?.value || "").trim().toUpperCase();

    return makh === "KL" || tenkh === "KHACH LE" || tenkh === "KHÁCH LẺ";
  }

  function khoaDiemKhachLe() {
    const diemTruEl = getEl(diemTruInputId);
    const tienGiamEl = getEl(tienDoiDiemInputId);

    // Chuẩn hóa kl/Kl/kL thành KL nhưng KHÔNG khóa ô mã khách
    if (makhInput) {
      makhInput.value = "KL";
      makhInput.readOnly = false;
      makhInput.disabled = false;
    }

    setVal(tenInputId, "KHACH LE");
    setVal(diemInputId, "0");
    setVal(hangInputId, "KHACH LE");
    setVal(diemTruInputId, "0");
    setVal(tienDoiDiemInputId, "0");
    setVal("km_diem_hienthi", "0");

    if (diemTruEl) {
      diemTruEl.value = "0";
      diemTruEl.readOnly = true;
      diemTruEl.disabled = false;
      diemTruEl.style.background = "#e5e5e5";
      diemTruEl.title = "Khách lẻ không được sử dụng điểm khuyến mại";
    }

    if (tienGiamEl) {
      tienGiamEl.value = "0";
      tienGiamEl.readOnly = true;
      tienGiamEl.disabled = false;
      tienGiamEl.style.background = "#e5e5e5";
      tienGiamEl.title = "Khách lẻ không được sử dụng điểm khuyến mại";
    }

    suggestBox.style.display = "none";
  }

  function moKhoaDiemKhachThuong() {
    const diemTruEl = getEl(diemTruInputId);
    const tienGiamEl = getEl(tienDoiDiemInputId);

    if (makhInput) {
      makhInput.readOnly = false;
      makhInput.disabled = false;
    }

    if (diemTruEl) {
      diemTruEl.readOnly = false;
      diemTruEl.disabled = false;
      diemTruEl.style.background = "#fffbe6";
      diemTruEl.title = "";
    }

    if (tienGiamEl) {
      tienGiamEl.readOnly = true;
      tienGiamEl.disabled = false;
      tienGiamEl.style.background = "";
      tienGiamEl.title = "";
    }
  }

  function capNhatTrangThaiDiemTheoKhach() {
    if (laKhachLe()) {
      khoaDiemKhachLe();
    } else {
      moKhoaDiemKhachThuong();
    }
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
    resetZaloJoinedUI();
    makhMoiTam = "";
  }

  async function napThongTinDiemKhach(makh) {
    if (!makh) return null;

    const { data, error } = await window.supabase
      .from("dmkhachhang")
      .select("makh, tenkh, diem_hientai, hang_khach, tong_chi_tieu, so_lan_mua, created_by_manv")
      .eq("makh", makh)
      .maybeSingle();

    if (error || !data) {
      alert("Không đọc được thông tin điểm khách hàng.");
      return null;
    }

    setVal(diemInputId, data.diem_hientai || 0);
    const hangText = data.hang_khach || "THUONG";
    const nvTaoText = data.created_by_manv ? "/" + data.created_by_manv : "";

    setVal(hangInputId, hangText + nvTaoText);
    setVal(diemTruInputId, "0");
    setVal(tienDoiDiemInputId, "0");

    await napTrangThaiZaloKhach(makh);
    return data;
  }

  function renderSuggest(data) {
    dsSuggest = data || [];
    suggestIndex = -1;

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
      .select("makh, tenkh, dienthoai, diem_hientai, hang_khach, created_by_manv")
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

    makhInput.value = chiLaySo(kh.makh || "");
    setVal(tenInputId, kh.tenkh || "");
    copyMakhNeuDu10So();
    suggestBox.style.display = "none";

    dangTaoKhachMoi = false;
    makhMoiTam = "";

    const tenEl = getEl(tenInputId);
    if (tenEl) tenEl.readOnly = true;

    localStorage.setItem("pending_makh_banle", kh.makh || "");
    localStorage.setItem("pending_tenkh_banle", kh.tenkh || "");

    await napThongTinDiemKhach(kh.makh);
    capNhatTrangThaiDiemTheoKhach();

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

  function chuanHoaThangNamSinh(raw) {
    const s = String(raw || "").trim();
    if (!s) return { thangsinh: null, namsinh: null };

    const namHienTai = new Date().getFullYear();

    function chuanHoaNam(namRaw) {
      let n = Number(namRaw);
      if (!Number.isFinite(n)) return null;

      // 70 => 1970, 05 => 2005
      if (String(namRaw).length <= 2) {
        n = n >= 30 ? 1900 + n : 2000 + n;
      }

      return n;
    }

    // Dạng: 3/70, 3-70, 3/1970, 03-1970
    let m = s.match(/^(\d{1,2})[\/\-](\d{2}|\d{4})$/);
    if (m) {
      const thangsinh = Number(m[1]);
      const namsinh = chuanHoaNam(m[2]);

      if (thangsinh < 1 || thangsinh > 12) {
        alert("❌ Tháng sinh không hợp lệ. Chỉ nhập từ 1 đến 12.");
        return false;
      }

      if (!namsinh || namsinh < 1900 || namsinh > namHienTai) {
        alert("❌ Năm sinh không hợp lệ.");
        return false;
      }

      return { thangsinh, namsinh };
    }

    // Dạng chỉ nhập năm: 70 hoặc 1970
    m = s.match(/^(\d{2}|\d{4})$/);
    if (m) {
      const namsinh = chuanHoaNam(m[1]);

      if (!namsinh || namsinh < 1900 || namsinh > namHienTai) {
        alert("❌ Năm sinh không hợp lệ.");
        return false;
      }

      // Không biết tháng sinh => thangsinh null, không được KM sinh nhật
      return { thangsinh: null, namsinh };
    }

    alert("❌ Ngày sinh không hợp lệ. Ví dụ: 3/70, 3-1970 hoặc chỉ nhập 70.");
    return false;
  }

  function damBaoPopupKhachMoi() {
    if (document.getElementById("popupKhachMoiBanLe")) return;

    const div = document.createElement("div");
    div.id = "popupKhachMoiBanLe";
    div.style.cssText = `
    display:none; position:fixed; inset:0; z-index:99999;
    background:rgba(0,0,0,.45); align-items:center; justify-content:center;
  `;

    div.innerHTML = `
    <div style="width:420px;background:#fff;border-radius:14px;padding:22px;box-shadow:0 8px 30px #0005;">
      <div style="font-size:20px;font-weight:bold;color:#14346b;text-align:center;margin-bottom:18px;">
        THÊM NHANH KHÁCH HÀNG
      </div>

      <div style="margin-bottom:12px;">
        <label>Mã KH *</label>
        <input id="popup_makh" style="width:100%;padding:9px;font-size:16px;background:#fffbe6;" maxlength="10" inputmode="numeric" placeholder="Nhập SĐT 10 số">
      </div>

      <div style="margin-bottom:12px;">
        <label>Tên KH *</label>
        <input id="popup_tenkh" style="width:100%;padding:9px;font-size:16px;" placeholder="Nhập tên khách hàng">
      </div>

      <div style="margin-bottom:12px;">
        <label>Số điện thoại *</label>
        <input id="popup_dienthoai" readonly style="width:100%;padding:9px;font-size:16px;background:#f3f4f6;">
      </div>

      <div style="margin-bottom:16px;">
        <label>Tháng/Năm sinh</label>
<input id="popup_thangsinh" style="width:100%;padding:9px;font-size:16px;" placeholder="Ví dụ: 3/70, 3-1970 hoặc 70">
      </div>

      <div style="display:flex;gap:12px;justify-content:center;">
        <button id="btnLuuPopupKH" style="padding:9px 22px;border:none;border-radius:8px;background:#18804f;color:white;font-weight:bold;">
          Lưu dữ liệu
        </button>
        <button id="btnHuyPopupKH" style="padding:9px 22px;border:none;border-radius:8px;background:#ddd;">
          Hủy
        </button>
      </div>
    </div>
  `;

    document.body.appendChild(div);

    document.getElementById("btnHuyPopupKH").onclick = () => {
      div.style.display = "none";
      makhInput.focus();
    };

    document.getElementById("btnLuuPopupKH").onclick = async () => {
      await luuNhanhKhachMoiTaiBanLe();
    };

    const popupMakhEl = document.getElementById("popup_makh");
    const popupDienThoaiEl = document.getElementById("popup_dienthoai");

    popupMakhEl?.addEventListener("input", () => {
      const ma = String(popupMakhEl.value || "").replace(/\D/g, "").slice(0, 10);
      popupMakhEl.value = ma;
      if (popupDienThoaiEl) popupDienThoaiEl.value = ma;
      makhMoiTam = ma;
    });

    ["popup_tenkh", "popup_thangsinh"].forEach(id => {
      document.getElementById(id)?.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (id === "popup_tenkh") {
            document.getElementById("popup_thangsinh")?.focus();
          } else {
            await luuNhanhKhachMoiTaiBanLe();
          }
        }
      });
    });
  }

  function batDauTaoKhachMoiTaiBanLe() {
    const makh = chuanHoaMakhNhap(makhInput.value);

    dangTaoKhachMoi = true;
    makhMoiTam = makh || "";

    suggestBox.style.display = "none";
    damBaoPopupKhachMoi();

    setVal(diemInputId, "0");
    setVal(hangInputId, "THUONG");
    setVal(diemTruInputId, "0");
    setVal(tienDoiDiemInputId, "0");

    const popupMakh = document.getElementById("popup_makh");
    const popupDienThoai = document.getElementById("popup_dienthoai");

    popupMakh.value = makh || "";
    popupDienThoai.value = makh || "";
    document.getElementById("popup_tenkh").value = "";
    document.getElementById("popup_thangsinh").value = "";

    const popup = document.getElementById("popupKhachMoiBanLe");
    popup.style.display = "flex";

    setTimeout(() => {
      popupMakh.focus();
      popupMakh.select?.();
    }, 80);
  }

  async function luuNhanhKhachMoiTaiBanLe() {
    const makh = chuanHoaMakhNhap(document.getElementById("popup_makh")?.value || makhMoiTam || makhInput.value);
    const tenkh = String(document.getElementById("popup_tenkh")?.value || "").trim();
    const thangsinhRaw = String(document.getElementById("popup_thangsinh")?.value || "").trim();

    if (!laSoDienThoaiHopLe(makh)) {
      alert("❌ Mã khách/SĐT không hợp lệ. Phải đủ 10 số.");
      makhInput.focus();
      makhInput.select?.();
      return;
    }

    const khTrung = await timKhachHangChinhXacTheoMakh(makh);
    if (khTrung) {
      document.getElementById("popupKhachMoiBanLe").style.display = "none";

      makhInput.value = chiLaySo(khTrung.makh || "");
      setVal(tenInputId, khTrung.tenkh || "");
      await napThongTinDiemKhach(khTrung.makh);
      await napTrangThaiZaloKhach(khTrung.makh);
      capNhatTrangThaiDiemTheoKhach();

      localStorage.setItem("pending_makh_banle", khTrung.makh || "");
      localStorage.setItem("pending_tenkh_banle", khTrung.tenkh || "");

      alert("✅ Mã khách này đã tồn tại. Đã nạp thông tin khách lên hóa đơn.");
      return;
    }

    if (!tenkh) {
      alert("❌ Chưa nhập tên khách hàng.");
      document.getElementById("popup_tenkh")?.focus();
      return;
    }

    const sinh = chuanHoaThangNamSinh(thangsinhRaw);
    if (sinh === false) {
      document.getElementById("popup_thangsinh")?.focus();
      return;
    }

    const { thangsinh, namsinh } = sinh;

    const manvTao =
      String(getEl("manv")?.value || localStorage.getItem("manv") || "").trim();

    const tennvTao =
      String(getEl("tennv")?.value || localStorage.getItem("tennv") || "").trim();

    const diadiemTao =
      String(getEl("diadiem")?.value || localStorage.getItem("diadiem") || "").trim();

    const obj = {
      makh,
      tenkh,
      dienthoai: makh,
      thangsinh,
      namsinh,
      diem_hientai: 0,
      hang_khach: "THUONG",
      so_lan_mua: 0,
      tong_chi_tieu: 0,

      created_by_manv: manvTao || null,
      created_by_tennv: tennvTao || null,
      created_by_diadiem: diadiemTao || null
    };

    const { error } = await window.supabase
      .from("dmkhachhang")
      .insert(obj);

    if (error) {
      console.error("❌ Lỗi thêm nhanh khách hàng:", error);
      alert("❌ Không lưu được khách hàng mới: " + error.message);
      return;
    }

    document.getElementById("popupKhachMoiBanLe").style.display = "none";

    makhInput.value = chiLaySo(makh);
    setVal(tenInputId, tenkh);
    copyMakhNeuDu10So();

    window.dispatchEvent(new CustomEvent("ht:khachhangmoi:saved", {
      detail: { makh, tenkh }
    }));
    setVal(diemInputId, "0");
    setVal(hangInputId, manvTao ? "THUONG/" + manvTao : "THUONG");
    setVal(diemTruInputId, "0");
    setVal(tienDoiDiemInputId, "0");

    const tenEl = getEl(tenInputId);
    if (tenEl) tenEl.readOnly = true;

    dangTaoKhachMoi = false;
    makhMoiTam = "";

    localStorage.setItem("pending_makh_banle", makh);
    localStorage.setItem("pending_tenkh_banle", tenkh);

    //alert("✅ Đã thêm khách hàng mới và sử dụng cho hóa đơn hiện tại.");

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
      return Number(window.TIEN_MOI_DIEM_KHACHHANG || TIEN_MOI_DIEM_KHACHHANG || 1000);
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
      if (laKhachLe()) {
        khoaDiemKhachLe();
        return;
      }
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
    const zaloCb = getEl("zalo_da_vao_nhom");
    const zaloMoiCb = getEl("zalo_da_moi");

    zaloMoiCb?.addEventListener("change", async () => {

      const makh =
        chuanHoaMakhNhap(makhInput.value);

      if (!makh || makh === "KL") {
        alert("Chưa có mã khách.");
        return;
      }

      const payload = {

        makh,

        tenkh:
          getEl(tenInputId)?.value || "",

        dienthoai: makh,

        da_gui_loi_moi:
          zaloMoiCb.checked,

        updated_by_manv:
          localStorage.getItem("manv") || "",

        updated_by_tennv:
          localStorage.getItem("tennv") || "",

        updated_at:
          new Date().toISOString()
      };

      const { error } =
        await window.supabase
          .from("zalo_customer_status")
          .upsert(payload, {
            onConflict: "makh"
          });

      if (error) {

        console.error(error);

        alert(
          "Không lưu được trạng thái đã mời."
        );

        await napTrangThaiZaloKhach(makh);

        return;
      }

      setZaloInvitedUI(
        zaloMoiCb.checked,
        false
      );
    });

    zaloCb?.addEventListener("change", async () => {
      const makh = chuanHoaMakhNhap(makhInput.value);

      await luuTrangThaiZaloDaVaoNhom(
        makh,
        zaloCb.checked
      );
    });
    makhInput.addEventListener("input", () => {
      const maMoi = chuanHoaMakhNhap(makhInput.value);

      if (makhInput.value !== maMoi) {
        makhInput.value = maMoi;
      }

      copyMakhNeuDu10So();

      const kw = makhInput.value.trim();

      khoiPhucTongGocTruocKhiDoiKhach();
      clearThongTinKhachHang();

      if (String(kw).trim().toUpperCase() === "KL") {
        setVal(tenInputId, "KHACH LE");
        capNhatTrangThaiDiemTheoKhach();
        suggestBox.style.display = "none";
        return;
      }
      // Khi người dùng xóa/sửa KL sang mã khác thì mở lại ô điểm dùng
      moKhoaDiemKhachThuong();

      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        timKhachHang(kw);
      }, 180);
    });

    makhInput.addEventListener("focus", () => {
      makhInput.select?.();

      setTimeout(() => {
        makhInput.select?.();
      }, 50);

      copyMakhNeuDu10So();

      const kw = String(makhInput.value || "").trim();

      if (kw.toUpperCase() === "KL") {
        khoaDiemKhachLe();
        suggestBox.style.display = "none";
        return;
      }

      if (kw) timKhachHang(kw);
    });

    let dangXuLyMakhBlur = false;

    async function timKhachHangChinhXacTheoMakh(makh) {
      const { data, error } = await window.supabase
        .from("dmkhachhang")
        .select("makh, tenkh, dienthoai, diem_hientai, hang_khach, created_by_manv")
        .eq("makh", makh)
        .maybeSingle();

      if (error) {
        console.error("Lỗi tìm chính xác khách hàng:", error);
        return null;
      }

      return data || null;
    }

    async function xuLyMakhNhuEnter() {
      if (dangXuLyMakhBlur) return;

      const makh = chuanHoaMakhNhap(makhInput.value);
      if (makh === "KL") return;

      // Ô trống hoặc chưa đủ 10 số: vẫn mở popup thêm nhanh
      if (!makh || makh.length < 10) {
        clearThongTinKhachHang();
        suggestBox.style.display = "none";
        batDauTaoKhachMoiTaiBanLe();
        return;
      }

      dangXuLyMakhBlur = true;

      try {
        makhInput.value = makh;

        const kh = await timKhachHangChinhXacTheoMakh(makh);

        if (kh) {
          khoiPhucTongGocTruocKhiDoiKhach();

          makhInput.value = chiLaySo(kh.makh || "");
          setVal(tenInputId, kh.tenkh || "");
          copyMakhNeuDu10So();

          suggestBox.style.display = "none";
          dangTaoKhachMoi = false;
          makhMoiTam = "";

          const tenEl = getEl(tenInputId);
          if (tenEl) tenEl.readOnly = true;

          localStorage.setItem("pending_makh_banle", kh.makh || "");
          localStorage.setItem("pending_tenkh_banle", kh.tenkh || "");

          await napThongTinDiemKhach(kh.makh);
          await napTrangThaiZaloKhach(kh.makh);
          capNhatTrangThaiDiemTheoKhach();

          if (typeof window.kiemTraCanhBaoMuaNhieuKhachHang === "function") {
            window.kiemTraCanhBaoMuaNhieuKhachHang();
          }

          return;
        }

        // Đủ 10 số nhưng chưa có khách thì mở popup thêm nhanh
        moTrangNhapKhachMoi();

      } finally {
        setTimeout(() => {
          dangXuLyMakhBlur = false;
        }, 500);
      }
    }

    makhInput.addEventListener("blur", () => {
      setTimeout(() => {
        const active = document.activeElement;

        // Nếu đang bấm chọn trong danh sách gợi ý hoặc popup tìm khách thì không xử lý blur
        if (suggestBox?.contains(active)) return;

        const popupKhachMoi = document.getElementById("popupKhachMoiBanLe");
        if (popupKhachMoi && popupKhachMoi.style.display !== "none") return;

        xuLyMakhNhuEnter();
      }, 180);
    });

    makhInput.addEventListener("keydown", async (e) => {
      const popupOpen = suggestBox.style.display !== "none";
      const kwNow = String(makhInput.value || "").trim().toUpperCase();

      if (kwNow === "KL") {
        suggestBox.style.display = "none";
        capNhatTrangThaiDiemTheoKhach();

        // Chỉ chặn phím Enter, còn Backspace/Delete/nhập mã khác vẫn cho sửa bình thường
        if (e.key === "Enter") {
          e.preventDefault();

          const maspEl = getEl("masp");
          setTimeout(() => {
            maspEl?.focus();
            maspEl?.select?.();
          }, 50);

          return;
        }
      }

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
        await xuLyMakhNhuEnter();
        return;
      }

      if (e.key === "Escape") {
        suggestBox.style.display = "none";
      }
    });

    btnPopup?.addEventListener("click", () => {
      const kw = makhInput.value.trim();

      if (kw && typeof window.moPopupThongTinKhachHangNhanh === "function") {
        window.moPopupThongTinKhachHangNhanh(kw);
        return;
      }

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

  taiCauHinhDiemKhachHang().finally(() => {
    bindEvents();
  });

  // Cho các file khác gọi lại nếu cần
  window.napThongTinDiemKhach = napThongTinDiemKhach;
  window.napTrangThaiZaloKhach = napTrangThaiZaloKhach;
  window.resetZaloJoinedUI = resetZaloJoinedUI;
  window.capNhatZaloTheoMakhHienTai = capNhatZaloTheoMakhHienTai;
  window.timKhachHangBanLe = timKhachHang;
}
