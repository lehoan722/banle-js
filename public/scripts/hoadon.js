
// hoadon.js - phiên bản cải tiến: tự fetch mã nếu thiếu và tránh mở popup nếu đã có
import { capNhatBangHTML, resetFormBang } from './bangketqua.js';
import { supabase } from './supabaseClient.js';

let bangKetQua = {};
let maspDangChon = null;

export async function chuyenFocus(e) {
  if (e.key !== "Enter") return;

  const nhapNhanh = document.getElementById("nhapnhanh").checked;
  const size45 = document.getElementById("size45").checked;

  if (e.target.id === "masp") {
    const maspVal = document.getElementById("masp").value.trim().toUpperCase();
    const thanhCong = await xuLyMaSanPham(maspVal, size45, nhapNhanh);

    // Nếu không thành công, mới mở popup tìm mã
    if (!thanhCong && typeof moPopupTimMaSanPham === "function") {
      moPopupTimMaSanPham();
    }
  } else if (e.target.id === "soluong") {
    document.getElementById("size").focus();
  } else if (e.target.id === "size") {
    themVaoBang();
  }
}

async function xuLyMaSanPham(maspVal, size45, nhapNhanh) {
  maspVal = maspVal.toUpperCase().trim();
  let spData = window.sanPhamData?.[maspVal];

  // Nếu không có trong cache, gọi Supabase để tìm chính xác
  if (!spData) {
    const { data, error } = await supabase
      .from("dmhanghoa")
      .select("*")
      .eq("masp", maspVal)
      .single();

    if (data) {
      spData = data;
      window.sanPhamData[maspVal] = data; // cache lại
    }
  }

  // Nếu vẫn không tìm thấy, mở popup danh mục hàng hóa
  if (!spData) {
    if (typeof moBangDanhMucHangHoa === "function") {
      moBangDanhMucHangHoa(maspVal);
    }
    return false;
  }

  // Gán thông tin sản phẩm vào form
  document.getElementById("gia").value = spData.giale || "";
  document.getElementById("khuyenmai").value = spData.khuyenmai || "";

  const cs = document.getElementById("diadiem").value;
  const vitri = cs === "cs1" ? spData.vitrikho1 : spData.vitrikho2;
  document.getElementById("vitri").value = vitri || "";

  if (size45) {
    document.getElementById("soluong").value = "1";
    themVaoBang("45");
  } else {
    const nextId = nhapNhanh ? "size" : "soluong";
    const nextInput = document.getElementById(nextId);
    nextInput.focus();
    if (nextId === "soluong") nextInput.select();
  }

  return true;
}

export function themVaoBang(forcedSize = null) {
  const masp = document.getElementById("masp").value.trim().toUpperCase();
  const size = forcedSize || document.getElementById("size").value.trim();
  const soluong = parseInt(document.getElementById("soluong").value.trim()) || 1;

  const sp = window.sanPhamData?.[masp];
  if (!masp || !size || !sp) {
    alert("Mã sản phẩm không hợp lệ hoặc không tồn tại.");
    return;
  }

  const gia = parseFloat(document.getElementById("gia").value) || 0;
  let km = parseFloat(document.getElementById("khuyenmai").value) || 0;
  if (!km) km = gia < 100000 ? 5000 : gia < 500000 ? 10000 : 20000;

  const key = masp;
  const bang = bangKetQua[key] || {
    masp,
    tensp: sp.tensp,
    sizes: [],
    soluongs: [],
    tong: 0,
    gia,
    km,
    dvt: ""
  };

  const index = bang.sizes.indexOf(size);
  if (index !== -1) {
    bang.soluongs[index] += soluong;
  } else {
    bang.sizes.push(size);
    bang.soluongs.push(soluong);
  }

  bang.tong += soluong;
  bangKetQua[key] = bang;

  capNhatBangHTML(bangKetQua);
  resetFormBang();
}

export function getBangKetQua() {
  return bangKetQua;
}

export function resetBangKetQua() {
  bangKetQua = {};
  capNhatBangHTML(bangKetQua);
}

export function setMaspspDangChon(masp) {
  maspDangChon = masp;
}

export function getMaspspDangChon() {
  return maspDangChon;
}

export function ganTenNV() {
  const manv = document.getElementById("manv").value.trim();
  document.getElementById("tennv").value = window.nhanVienData?.[manv] || "";
}

export function xoaDongDangChon() {
  if (!maspDangChon) {
    alert("Vui lòng chọn dòng cần xóa.");
    return;
  }

  if (confirm(`Bạn có chắc muốn xóa mã sản phẩm "${maspDangChon}"?`)) {
    delete bangKetQua[maspDangChon];
    maspDangChon = null;
    capNhatBangHTML(bangKetQua);
  }
}

export function suaDongDangChon() {
  if (!maspDangChon) {
    alert("Vui lòng chọn dòng muốn sửa.");
    return;
  }
  const item = bangKetQua[maspDangChon];
  if (!item) {
    alert("Không tìm thấy dòng để sửa.");
    return;
  }

  // Nếu có nhiều size, lấy size đầu tiên
  const size = item.sizes && item.sizes.length > 0 ? item.sizes[0] : "";
  const soluong = item.soluongs && item.soluongs.length > 0 ? item.soluongs[0] : "";

  // Đưa thông tin về các ô nhập liệu
  document.getElementById("masp").value = item.masp || "";
  document.getElementById("size").value = size || "";
  document.getElementById("soluong").value = soluong || "1";
  document.getElementById("dvt").value = item.dvt || "";
  document.getElementById("gia").value = item.gia || "";
  document.getElementById("khuyenmai").value = item.km || "";
  // Thành tiền có thể để tự động tính lại khi sửa số lượng/giá

  // Xóa dòng đang chọn khỏi bảng và cập nhật lại lưới
  delete bangKetQua[maspDangChon];
  maspDangChon = null;
  capNhatBangHTML(bangKetQua);

  // Focus lại vào ô nhập liệu đầu vào để sửa
  document.getElementById("masp").focus();
}

