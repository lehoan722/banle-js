
// hoadon.js - phiên bản cải tiến: tự fetch mã nếu thiếu và tránh mở popup nếu đã có
import { capNhatBangHTML, resetFormBang } from './bangketqua.js';
import { supabase } from './supabaseClient.js';
import { tinhKhuyenMai } from './khuyenmai.js';

export let bangKetQua = {};

// Trong hoadon.js
let maspDangChon = null;
export function setMaspspDangChon(obj) {
  maspDangChon = obj; // obj = {masp, size}
}
export function getMaspspDangChon() {
  return maspDangChon;
}



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

  // ==== ⚡️ THÊM XỬ LÝ BÁN SIÊU NHANH Ở ĐÂY ====
  const banSieuNhanh = document.getElementById("bansieunhanh")?.checked;
  if (banSieuNhanh) {
    document.getElementById("soluong").value = "1";
    document.getElementById("size").value = "0"; // size rỗng
    themVaoBang(""); // Bỏ qua kiểm tra size, số lượng
    document.getElementById("masp").focus();
    document.getElementById("masp").select();
    return true; // Không chạy các logic kiểm tra khác nữa!
  }
  // ==== ⚡️ END ====

  // Gán thông tin sản phẩm vào form (giữ nguyên các dòng dưới)
  document.getElementById("gia").value = spData.giale || "";
  document.getElementById("khuyenmai").value = spData.khuyenmai || "";

  const cs = document.getElementById("diadiem").value;
  const vitri = cs === "cs1" ? spData.vitrikho1 : spData.vitrikho2;
  document.getElementById("vitri").value = vitri || "";

  // ... Các xử lý logic size45, nhập nhanh cũ giữ nguyên ...
  // === BẮT BUỘC NHẬP SIZE VỚI GIÀY DÉP KHI BẬT SIZE 45 ===
  if (
    size45 &&
    spData.chungloai &&
    spData.chungloai.toLowerCase() === "gd"
  ) {
    const sizeInput = document.getElementById("size");
    if (!sizeInput.value.trim()) {
      sizeInput.focus();
      return true; // Dừng lại, không tự thêm vào bảng
    }
    document.getElementById("soluong").value = "1";
    themVaoBang(sizeInput.value.trim());
    return true;
  }

  // === CŨ: ĐỐI VỚI CÁC TRƯỜNG HỢP KHÁC ===
  if (size45) {
    document.getElementById("soluong").value = "1";
    themVaoBang("0");
  } else {
    const nextId = nhapNhanh ? "size" : "soluong";
    const nextInput = document.getElementById(nextId);
    nextInput.focus();
    if (nextId === "soluong") nextInput.select();
  }

  return true;
}



export function themVaoBang(forcedSize = null, forcedMasp = null) {
  const masp = (forcedMasp !== null && forcedMasp !== undefined)
    ? forcedMasp.trim().toUpperCase()
    : document.getElementById("masp").value.trim().toUpperCase();
  const size = (forcedSize !== null && forcedSize !== undefined)
    ? String(forcedSize)
    : document.getElementById("size").value.trim();
  const soluong = parseInt(document.getElementById("soluong").value.trim()) || 1;


  const sp = window.sanPhamData?.[masp];

  // --- Kiểm tra trạng thái bán siêu nhanh ---
  const banSieuNhanh = document.getElementById("bansieunhanh")?.checked;

  // ==== KIỂM TRA SIZE HỢP LỆ (áp dụng cho mọi trường hợp, TRỪ bán siêu nhanh) ====
  if (!banSieuNhanh) {
    if (!masp || !size || !sp) {
      alert("Phải nhập size hợp lệ cho sản phẩm.");
      const sizeInput = document.getElementById("size");
      sizeInput.focus();
      sizeInput.select();
      return;
    }
    if (
      Array.isArray(window.danhMucSize) &&
      !window.danhMucSize.includes(size)
    ) {
      alert(`Bạn phải nhập đúng size theo quy định! Các size hợp lệ: ${window.danhMucSize.join(', ')}`);
      const sizeInput = document.getElementById("size");
      sizeInput.focus();
      sizeInput.select(); // <-- Bôi đen toàn bộ ô nhập size
      return;
    }
  }
  // ==== END KIỂM TRA ====

  const gia = parseFloat(document.getElementById("gia").value) || 0;
  // --- Áp dụng cách tính khuyến mại mới ---
  let km = tinhKhuyenMai(sp, gia);

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
  if (window.bangKetQua && Object.keys(window.bangKetQua).length > 0) {
    return window.bangKetQua;
  }
  return bangKetQua;
}

export function resetBangKetQua() {
  bangKetQua = {};
  if (window.bangKetQua) window.bangKetQua = {};
  capNhatBangHTML(bangKetQua);
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
  const dangChon = getMaspspDangChon();
  if (!dangChon) {
    alert("Vui lòng chọn dòng muốn sửa.");
    return;
  }
  const { masp, size } = dangChon;
  const item = bangKetQua[masp];
  if (!item) {
    alert("Không tìm thấy dòng để sửa.");
    return;
  }
  const idx = item.sizes.findIndex(s => s == size);

  if (idx === -1) {
    alert("Không tìm thấy size để sửa.");
    return;
  }

  // Đưa thông tin về form nhập
  document.getElementById("masp").value = item.masp || "";
  document.getElementById("size").value = item.sizes[idx] || "";
  document.getElementById("soluong").value = item.soluongs[idx] || "1";
  document.getElementById("dvt").value = item.dvt || "";
  document.getElementById("gia").value = item.gia || "";
  document.getElementById("khuyenmai").value = item.km || "";

  // Xóa đúng dòng đang chọn (đúng size) khỏi bảng
  item.sizes.splice(idx, 1);
  item.soluongs.splice(idx, 1);
  item.tong -= parseInt(document.getElementById("soluong").value) || 0;
  if (item.sizes.length === 0) delete bangKetQua[masp];

  maspDangChon = null;
  capNhatBangHTML(bangKetQua);

  // Focus lại vào ô nhập liệu đầu vào để sửa
  document.getElementById("masp").focus();
}


export async function napLaiChiTietHoaDon(sohd) {
  // Lấy chi tiết từ bảng ct_hoadon_banle
  const { data: chitiet, error } = await supabase
    .from("ct_hoadon_banle")
    .select("*")
    .eq("sohd", sohd);

  if (error || !chitiet || chitiet.length === 0) {
    alert("❌ Không tìm thấy chi tiết hóa đơn để sửa.");
    return;
  }

  // Reset lại bảng tạm
  resetBangKetQua();

  // Ghép lại đúng cấu trúc của bangKetQua
  chitiet.forEach(ct => {
    const masp = ct.masp;
    if (!bangKetQua[masp]) {
      bangKetQua[masp] = {
        masp: ct.masp,
        tensp: ct.tensp,
        sizes: [],
        soluongs: [],
        tong: 0,
        gia: ct.gia,
        km: ct.km,
        dvt: ct.dvt || ""
      };
    }
    const index = bangKetQua[masp].sizes.indexOf(ct.size);
    if (index === -1) {
      bangKetQua[masp].sizes.push(String(ct.size)); // luôn lưu về kiểu string

      bangKetQua[masp].soluongs.push(ct.soluong);
    } else {
      bangKetQua[masp].soluongs[index] += ct.soluong;
    }
    bangKetQua[masp].tong += ct.soluong;
  });

  capNhatBangHTML(bangKetQua);
}

