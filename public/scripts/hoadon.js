
// hoadon.js - phiên bản cải tiến: tự fetch mã nếu thiếu và tránh mở popup nếu đã có
import { capNhatBangHTML, resetFormBang } from './bangketqua.js';
import { supabase } from './supabaseClient.js';
import { tinhKhuyenMai } from './khuyenmai.js';

export let bangKetQua = {};
window.maspCuoiCung = null;         // Lưu trạng thái mã sản phẩm cuối cùng vừa nhập thành công
window.sanPhamData = window.sanPhamData || {};  // Đảm bảo cache luôn có
window.danhMucSize = window.danhMucSize || ["0", "38", "39", "40", "41", "42", "43", "44", "45"]; // Ví dụ mặc định


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

  // Chặn mọi event "dội" tiếp theo (bảo vệ khỏi double event)
  if (e.preventDefault) e.preventDefault();
  if (e.stopPropagation) e.stopPropagation();

  const nhapNhanh = document.getElementById("nhapnhanh")?.checked;
  const size45 = document.getElementById("size45")?.checked;

  if (e.target.id === "masp") {
    const maspVal = document.getElementById("masp").value.trim().toUpperCase();
    const tenTrang = window.location.pathname.split('/').pop().replace('.html', '');
    const laTrangNhapNhanh = ['nhapmoi', 'ccn1v2', 'ccn2v1'].includes(tenTrang);
    const danhSachSizeNhanh = window.danhMucSize.map(x => String(x)); // Đảm bảo là chuỗi

    // ====== NHẬP SIZE NHANH ======
    if (laTrangNhapNhanh && danhSachSizeNhanh.includes(maspVal)) {
      if (window.maspCuoiCung && window.maspCuoiCung.masp) {
        const maspTruoc = window.maspCuoiCung.masp;
        document.getElementById("masp").value = maspTruoc;
        document.getElementById("size").value = maspVal;
        document.getElementById("soluong").value = 1;

        themVaoBang(maspVal, maspTruoc); // forcedSize, forcedMasp

        setTimeout(() => {
          document.getElementById("masp").value = "";
          document.getElementById("size").value = "";
          document.getElementById("soluong").value = 1;
          document.getElementById("masp").focus();
          document.getElementById("masp").select();
        }, 0);
      } else {
        alert("Bạn cần nhập mã sản phẩm trước khi nhập size!");
        document.getElementById("masp").focus();
        document.getElementById("masp").select();
      }
      return; // Không cho chạy xuống dưới nữa
    }

    // ====== NHẬP MÃ SẢN PHẨM BÌNH THƯỜNG ======
    const thanhCong = await xuLyMaSanPham(maspVal, size45, nhapNhanh);
    if (thanhCong) {
      window.maspCuoiCung = { masp: maspVal };
    }
    if (!thanhCong && typeof moPopupTimMaSanPham === "function") {
      moPopupTimMaSanPham();
    }
  }
  else if (e.target.id === "soluong") {
    document.getElementById("size").focus();
  } else if (e.target.id === "size") {
    themVaoBang();
  }
}


export async function xuLyMaSanPham(maspVal, size45, nhapNhanh) {
  // Chuẩn hóa mã sản phẩm
  maspVal = maspVal.toUpperCase().trim();
  if (!maspVal) return false;

  // 1. Tìm trong cache trước
  let spData = window.sanPhamData?.[maspVal];

  // 2. Nếu chưa có, fetch từ Supabase
  if (!spData) {
    try {
      const { data, error } = await supabase
        .from("dmhanghoa")
        .select("*")
        .eq("masp", maspVal)
        .single();
      if (error) throw error;
      if (data) {
        spData = data;
        window.sanPhamData[maspVal] = data; // cache lại
      }
    } catch (err) {
      spData = null;
    }
  }

  // 3. Không tìm thấy thì mở popup tìm mã
  if (!spData) {
    if (typeof moBangDanhMucHangHoa === "function") moBangDanhMucHangHoa(maspVal);
    return false;
  }

  // 4. Xử lý bán siêu nhanh (tự động ghi size=0, số lượng=1, thêm luôn)
  const banSieuNhanh = document.getElementById("bansieunhanh")?.checked;
  if (banSieuNhanh) {
    document.getElementById("soluong").value = "1";
    document.getElementById("size").value = "0";
    themVaoBang("0", maspVal); // size = 0, masp ép buộc
    document.getElementById("masp").focus();
    document.getElementById("masp").select();
    return true;
  }

  // 5. Gán thông tin sản phẩm vào form
  document.getElementById("gia").value = spData.giale || "";
  document.getElementById("khuyenmai").value = spData.khuyenmai || "";
  const cs = document.getElementById("diadiem")?.value;
  const vitri = cs === "cs1" ? spData.vitrikho1 : spData.vitrikho2;
  if (document.getElementById("vitri")) document.getElementById("vitri").value = vitri || "";

  // 6. Xử lý riêng với sản phẩm giày dép khi bật size45: BẮT BUỘC nhập size
  if (
    size45 &&
    spData.chungloai &&
    spData.chungloai.toLowerCase() === "gd"
  ) {
    const sizeInput = document.getElementById("size");
    if (!sizeInput.value.trim()) {
      sizeInput.focus();
      return true; // Dừng, chờ người dùng nhập size
    }
    document.getElementById("soluong").value = "1";
    themVaoBang(sizeInput.value.trim(), maspVal); // truyền size, masp ép buộc
    return true;
  }

  // 7. Nếu là nhập size45 nhưng KHÔNG phải giày dép: mặc định size=0, số lượng=1, thêm luôn
  if (size45) {
    document.getElementById("soluong").value = "1";
    themVaoBang("0", maspVal);
    return true;
  }

  // 8. Nếu là nhập nhanh: focus sang ô size, còn lại: focus sang ô số lượng
  const nextId = nhapNhanh ? "size" : "soluong";
  const nextInput = document.getElementById(nextId);
  if (nextInput) {
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

  // ==== KIỂM TRA SIZE HỢP LỆ (TRỪ bán siêu nhanh) ====
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
      sizeInput.select();
      return;
    }
  }
  // ==== END KIỂM TRA ====

  const gia = parseFloat(document.getElementById("gia").value) || 0;
  let km = typeof tinhKhuyenMai === "function" ? tinhKhuyenMai(sp, gia) : 0;

  const key = masp;
  const bang = bangKetQua[key] || {
    masp,
    tensp: sp.tensp,
    sizes: [],
    soluongs: [],
    tong: 0,
    gia,
    km,
    dvt: sp.dvt || ""
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

  if (typeof capNhatBangHTML === "function") capNhatBangHTML(bangKetQua);

  // Chỉ reset toàn bộ form khi KHÔNG nhập size nhanh
  if (!forcedSize) {
    if (typeof resetFormBang === "function") resetFormBang();
  }
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

