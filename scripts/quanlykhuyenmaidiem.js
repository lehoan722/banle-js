import {
  khoiTaoDangNhapDungChung,
  dangXuatDungChung,
  getCurrentUserInfo,
  getSupabaseClient
} from "./authModule.js";

const supabase = getSupabaseClient();

const $ = (id) => document.getElementById(id);

function showMsg(text, color = "green") {
  const el = $("msg");
  el.style.color = color;
  el.textContent = text;
}

function requireAdmin() {
  const info = getCurrentUserInfo();

  if (!info.is_admin) {
    $("app-container").innerHTML = `
      <h2 style="color:red;">Không có quyền truy cập</h2>
      <p>Trang này chỉ dành cho ADMIN.</p>
      <button id="btnDangXuat2">Đăng xuất</button>
    `;

    document.getElementById("btnDangXuat2")?.addEventListener("click", () => {
      dangXuatDungChung();
    });

    return false;
  }

  return true;
}

function fillForm(data) {
  $("tien_de_cong_1_diem").value = data.tien_de_cong_1_diem ?? 50000;
  $("tien_moi_diem").value = data.tien_moi_diem ?? 1000;
  $("ty_le_toi_da_dung_diem").value = data.ty_le_toi_da_dung_diem ?? 0.10;
  $("so_ngay_het_han").value = data.so_ngay_het_han ?? 90;
  $("cho_phep_dung_diem_trong_ngay").checked = !!data.cho_phep_dung_diem_trong_ngay;
  $("prefix_hoa_don_duoc_xu_ly").value = Array.isArray(data.prefix_hoa_don_duoc_xu_ly)
    ? data.prefix_hoa_don_duoc_xu_ly.join(", ")
    : "bancs1_, bancs2_";
  $("active").checked = data.active !== false;
  $("ghichu").value = data.ghichu || "";
}

function readForm() {
  const prefixes = $("prefix_hoa_don_duoc_xu_ly")
    .value
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);

  return {
    id: 1,
    tien_de_cong_1_diem: Number($("tien_de_cong_1_diem").value || 0),
    tien_moi_diem: Number($("tien_moi_diem").value || 0),
    ty_le_toi_da_dung_diem: Number($("ty_le_toi_da_dung_diem").value || 0),
    so_ngay_het_han: Number($("so_ngay_het_han").value || 0),
    cho_phep_dung_diem_trong_ngay: $("cho_phep_dung_diem_trong_ngay").checked,
    prefix_hoa_don_duoc_xu_ly: prefixes,
    active: $("active").checked,
    ghichu: $("ghichu").value.trim(),
    updated_at: new Date().toISOString()
  };
}

function validateConfig(cfg) {
  if (cfg.tien_de_cong_1_diem <= 0) {
    return "Tiền để cộng 1 điểm phải lớn hơn 0.";
  }

  if (cfg.tien_moi_diem <= 0) {
    return "Tiền quy đổi mỗi điểm phải lớn hơn 0.";
  }

  if (cfg.ty_le_toi_da_dung_diem < 0 || cfg.ty_le_toi_da_dung_diem > 1) {
    return "Tỷ lệ tối đa dùng điểm phải nằm trong khoảng 0 đến 1.";
  }

  if (cfg.so_ngay_het_han <= 0) {
    return "Số ngày hết hạn điểm phải lớn hơn 0.";
  }

  if (!cfg.prefix_hoa_don_duoc_xu_ly.length) {
    return "Phải có ít nhất 1 prefix hóa đơn được xử lý.";
  }

  return "";
}

async function taiCauHinh() {
  showMsg("Đang tải cấu hình...", "#0d6efd");

  const { data, error } = await supabase
    .from("cauhinh_diem_khachhang")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error(error);
    showMsg("❌ Lỗi tải cấu hình: " + error.message, "red");
    return;
  }

  if (!data) {
    fillForm({
      id: 1,
      tien_de_cong_1_diem: 50000,
      tien_moi_diem: 1000,
      ty_le_toi_da_dung_diem: 0.10,
      so_ngay_het_han: 90,
      cho_phep_dung_diem_trong_ngay: false,
      prefix_hoa_don_duoc_xu_ly: ["bancs1_", "bancs2_"],
      active: true
    });

    showMsg("⚠️ Chưa có cấu hình, đang hiển thị giá trị mặc định.", "#b45309");
    return;
  }

  fillForm(data);
  showMsg("✅ Đã tải cấu hình.");
}

async function luuCauHinh() {
  const cfg = readForm();
  const err = validateConfig(cfg);

  if (err) {
    showMsg("❌ " + err, "red");
    return;
  }

  showMsg("Đang lưu cấu hình...", "#0d6efd");

  const { error } = await supabase
    .from("cauhinh_diem_khachhang")
    .upsert(cfg, { onConflict: "id" });

  if (error) {
    console.error(error);
    showMsg("❌ Lỗi lưu cấu hình: " + error.message, "red");
    return;
  }

  showMsg("✅ Đã lưu cấu hình khuyến mại điểm.");
}

function ganSuKien() {
  $("btnTaiLai").addEventListener("click", taiCauHinh);
  $("btnLuu").addEventListener("click", luuCauHinh);
  $("btnDangXuat").addEventListener("click", () => dangXuatDungChung());
}

khoiTaoDangNhapDungChung({
  loginContainerId: "login-container",
  appContainerId: "app-container",
  macDinhDiaDiem: "cs1",
  onLoginSuccess: async () => {
    if (!requireAdmin()) return false;

    ganSuKien();
    await taiCauHinh();

    return true;
  }
});