export function capNhatThongTinTong(bangKetQua) {

  // 🚫 CHẶN TÍNH LẠI KHI XEM HÓA ĐƠN
  if (window.dangXemHoaDon) {
    console.log("⛔ Bỏ qua capNhatThongTinTong vì đang VIEW hóa đơn");
    return;
  }

  const mathangInput = document.getElementById("mathang");
  const tongslInput = document.getElementById("tongsl");
  const tongkmInput = document.getElementById("tongkm");
  const chietkhauInput = document.getElementById("chietkhau");
  const phaithanhtoanInput = document.getElementById("phaithanhtoan");
  const khachtraInput = document.getElementById("khachtra");
  const conlaiInput = document.getElementById("conlai");

  let tongSoMatHang = Object.keys(bangKetQua).length;
  let tongSoLuong = 0;
  let tongKhuyenMai = 0;
  let tongThanhTien = 0;

  Object.values(bangKetQua).forEach(item => {
    // Luôn cộng tổng theo các số lượng trong mảng soluongs (cột S.lượng)
    if (Array.isArray(item.soluongs)) {
      item.soluongs.forEach((sl, idx) => {
        const soluong = Number(sl) || 0;
        tongSoLuong += soluong;
        // Khuyến mãi: có thể là số chung, nếu có mảng riêng cho từng size thì sửa lại cho phù hợp

        const gia1 = Number(item.gia || 0);
        const km1 = Number(item.km || 0);
        const kmTongDong = km1 * soluong;
        tongKhuyenMai += kmTongDong;
        tongThanhTien += (gia1 * soluong) - kmTongDong;
      });
    }
    // Trường hợp hiếm còn dữ liệu lẻ cũ
    else if (typeof item.soluong !== "undefined") {
      let soluong = Number(item.soluong) || 0;
      tongSoLuong += soluong;

      const gia1 = Number(item.gia || 0);
      const km1 = Number(item.km || 0);
      const kmTongDong = km1 * soluong;
      tongKhuyenMai += kmTongDong;
      tongThanhTien += (gia1 * soluong) - kmTongDong;
    }
  });

  // Cập nhật lên giao diện
  mathangInput.value = tongSoMatHang;
  tongslInput.value = tongSoLuong;
  tongkmInput.value = tongKhuyenMai.toLocaleString();

  // Chiết khấu
  let ck = parseFloat(chietkhauInput.value.trim()) || 0;
  if (ck <= 100) {
    ck = tongThanhTien * (ck / 100);
    chietkhauInput.value = ck.toLocaleString();
  }

  // Phải thanh toán
  const phaitra = tongThanhTien - ck;

  // ===============================
  // Đồng bộ lại tổng gốc cho module điểm
  // ===============================
  window.__tongPhaiTraGoc = phaitra;

  // Lấy số tiền giảm theo điểm đang sử dụng
  const tienGiamDiem =
    Number(
      (document.getElementById("tien_doi_diem")?.value || "0")
        .replace(/\D/g, "")
    ) || 0;

  // Tổng sau khi trừ điểm
  const phaiTraSauDiem = Math.max(0, phaitra - tienGiamDiem);

  phaithanhtoanInput.value = phaiTraSauDiem.toLocaleString();

  // Nếu người dùng chưa nhập tiền khách trả
  // thì luôn cập nhật theo tổng mới
  let khachtra;

  if (!khachtraInput.dataset.modified) {

    khachtra = phaiTraSauDiem;
    khachtraInput.value = phaiTraSauDiem.toLocaleString();

  } else {

    khachtra =
      Number(khachtraInput.value.replace(/\D/g, "")) || 0;

  }

  conlaiInput.value =
    (khachtra - phaiTraSauDiem).toLocaleString();

}

window.capNhatThongTinTong = capNhatThongTinTong;

