export function capNhatThongTinTong(bangKetQua) {
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
      item.soluongs.forEach(sl => {
            const slnum = Number(sl) || 0;
            tongsl += slnum;
            tongkm += (Number(item.km || 0)) * slnum;
        tongThanhTien += (Number(item.gia || 0) - km1) * soluong;
      });
    }
    // Trường hợp hiếm còn dữ liệu lẻ cũ
    else if (typeof item.soluong !== "undefined") {
      let soluong = Number(item.soluong) || 0;
      tongSoLuong += soluong;
      let km1 = Number(item.km || 0);
      tongKhuyenMai += km1 * soluong;
      tongThanhTien += (Number(item.gia || 0) - km1) * soluong;
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
  phaithanhtoanInput.value = phaitra.toLocaleString();

  // Khách trả
  let khachtra = parseFloat(khachtraInput.value.replace(/,/g, "").trim());
  if (!khachtraInput.dataset.modified) {
    khachtra = phaitra;
    khachtraInput.value = phaitra.toLocaleString();
  }

  // Còn lại
  const conlai = khachtra - phaitra;
  conlaiInput.value = conlai.toLocaleString();

  document.getElementById("phaithanhtoan_text").textContent = phaitra.toLocaleString();
  document.getElementById("khachtra_text").textContent = khachtra.toLocaleString();
  document.getElementById("conlai_text").textContent = conlai.toLocaleString();
}
