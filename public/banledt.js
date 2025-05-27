
const supabase = window.supabase.createClient(
  "https://rddjrmbyftlcvrgzlyby.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM"
);

let nhanVienHienTai = null;
let sanPhamHienTai = null;

async function xacThucNhanVien() {
  const manv = document.getElementById("manv")?.value.trim().toUpperCase();
  if (!manv) return alert("Vui lòng nhập mã nhân viên");

  const { data, error } = await supabase
    .from("dmnhanvien")
    .select("*")
    .ilike("manv", manv)
    .eq("trangthai", true)
    .single();

  if (error || !data) {
    alert("Mã nhân viên không hợp lệ hoặc đã ngừng sử dụng.");
    document.getElementById("tennv").value = "";
    nhanVienHienTai = null;
  } else {
    document.getElementById("tennv").value = data.tennv;
    nhanVienHienTai = data;
  }
}

async function xuLyMaSP() {
  const masp = document.getElementById("masp")?.value.trim().toUpperCase();
  if (!masp) return;

  const { data, error } = await supabase
    .from("dmhanghoa")
    .select("*")
    .ilike("masp", masp)
    .eq("active", true)
    .single();

  if (error || !data) {
    alert("Không tìm thấy sản phẩm hoặc đã ngừng kinh doanh.");
    sanPhamHienTai = null;
    return;
  }

  sanPhamHienTai = data;
  document.getElementById("gia").value = data.giale || 0;
  tinhTienTuDong();
}

function tinhTienTuDong() {
  const sl = parseInt(document.getElementById("soluong").value || "0");
  const gia = parseFloat(document.getElementById("gia").value || "0");
  const km = parseFloat(sanPhamHienTai?.khuyenmai || "0");
  const tien = (gia - km) * sl;
  document.getElementById("phaithanhtoan").value = tien.toFixed(0);
  document.getElementById("tongtien").innerText = tien.toFixed(0);
  document.getElementById("tongsl").innerText = sl;
  document.getElementById("khachtra").value = tien.toFixed(0);
}

async function capNhatSoHoaDon() {
  const { data, error } = await supabase
    .from("sochungtu")
    .select("so_hientai")
    .eq("loai", "banledt")
    .single();

  if (!error && data) {
    const so = parseInt(data.so_hientai || 0) + 1;
    const sohd = "banledt_" + String(so).padStart(5, "0");
    document.getElementById("sohd").value = sohd;
  } else {
    document.getElementById("sohd").value = "banledt_00001";
  }
}

async function luuHoaDon() {
  if (!nhanVienHienTai) return alert("Bạn chưa đăng nhập nhân viên hợp lệ.");
  if (!sanPhamHienTai) return alert("Bạn chưa nhập sản phẩm hợp lệ.");

  const hoadon = {
    sohd: document.getElementById("sohd").value,
    ngay: new Date().toISOString(),
    manv: nhanVienHienTai.manv,
    tennv: nhanVienHienTai.tennv,
    diadiem: "mobile",
    khachhang: document.getElementById("khachtra")?.value || "",
    tongsl: parseInt(document.getElementById("soluong").value || "0"),
    tongkm: parseFloat(sanPhamHienTai.khuyenmai || 0),
    chietkhau: 0,
    thanhtoan: parseFloat(document.getElementById("phaithanhtoan").value || "0"),
    ghichu: document.getElementById("ghichu").value || "",
    hinhthuctt: document.getElementById("hinhthuctt")?.value || "tm",
    loai: "banledt"
  };

  const chitiet = [{
    masp: sanPhamHienTai.masp,
    tensp: sanPhamHienTai.tensp,
    size: "",
    soluong: parseInt(document.getElementById("soluong").value),
    gia: parseFloat(sanPhamHienTai.giale || 0),
    km: parseFloat(sanPhamHienTai.khuyenmai || 0),
    thanhtien: parseFloat(document.getElementById("phaithanhtoan").value) || 0
  }];

  const res = await fetch("/api/luuhoadon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hoadon, chitiet })
  });

  const result = await res.json();
  if (result.success) {
    alert("✅ Đã lưu hóa đơn thành công!");
  } else {
    alert("❌ Lỗi khi lưu: " + result.error);
  }
}

function chonTuPopup(masp) {
  document.getElementById("masp").value = masp;
  xuLyMaSP();
  dongPopup();
  document.getElementById("masp").focus();
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("manv")?.addEventListener("change", xacThucNhanVien);
  document.getElementById("masp")?.addEventListener("change", xuLyMaSP);
  document.getElementById("soluong")?.addEventListener("input", tinhTienTuDong);
  document.querySelector(".btn-yellow")?.addEventListener("click", luuHoaDon);
  capNhatSoHoaDon();
  document.getElementById("ngay").value = new Date().toISOString().slice(0, 16);
});
