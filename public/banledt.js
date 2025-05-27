
// ====== CẤU HÌNH SUPABASE ======
const supabase = window.supabase.createClient(
  "https://rddjrmbyftlcvrgzlyby.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM"
);

let nhanVienHienTai = null;
let sanPhamHienTai = null;

// ====== XÁC THỰC MÃ NHÂN VIÊN ======
async function xacThucNhanVien() {
  const manv = document.getElementById("manv")?.value.trim().toUpperCase();
  if (!manv) return alert("Vui lòng nhập mã nhân viên");

  const { data, error } = await supabase
    .from("dmnhanvien")
    .select("*")
    .eq("manv", manv)
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

// ====== XỬ LÝ MÃ SẢN PHẨM ======
async function xuLyMaSP() {
  const masp = document.getElementById("masp")?.value.trim().toUpperCase();
  if (!masp) return;

  const { data, error } = await supabase
    .from("dmhanghoa")
    .select("*")
    .eq("masp", masp)
    .eq("active", true)
    .single();

  if (error || !data) {
    alert("Không tìm thấy sản phẩm hoặc đã ngừng kinh doanh.");
    sanPhamHienTai = null;
    return;
  }

  sanPhamHienTai = data;
  document.getElementById("gia").value = data.giale || 0;

  // Nếu có khuyến mãi thì xử lý
  const giam = parseFloat(data.khuyenmai) || 0;
  if (giam > 0) {
    const giaKM = (parseFloat(data.giale || 0) - giam);
    document.getElementById("phaithanhtoan").value = giaKM.toFixed(0);
  } else {
    document.getElementById("phaithanhtoan").value = data.giale || 0;
  }
}

// ====== LƯU HÓA ĐƠN QUA API ======
async function luuHoaDon() {
  if (!nhanVienHienTai) return alert("Bạn chưa đăng nhập nhân viên hợp lệ.");
  if (!sanPhamHienTai) return alert("Bạn chưa nhập sản phẩm hợp lệ.");

  const hoadon = {
    ngay: new Date().toISOString().split("T")[0],
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

// ====== GẮN SỰ KIỆN ======
window.addEventListener("DOMContentLoaded", () => {
  const manvInput = document.getElementById("manv");
  if (manvInput) {
    manvInput.addEventListener("change", xacThucNhanVien);
  }

  const maspInput = document.getElementById("masp");
  if (maspInput) {
    maspInput.addEventListener("change", xuLyMaSP);
  }

  const nutLuu = document.querySelector(".btn-yellow");
  if (nutLuu) {
    nutLuu.addEventListener("click", luuHoaDon);
  }
});
