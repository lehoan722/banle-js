// utils.js

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
    const sl = item.tong;
    const km = item.km;
    const gia = item.gia;
    tongSoLuong += sl;
    tongKhuyenMai += km * sl;
    tongThanhTien += (gia - km) * sl;
  });

  mathangInput.value = tongSoMatHang;
  tongslInput.value = tongSoLuong;
  tongkmInput.value = tongKhuyenMai.toLocaleString();

  let ck = parseFloat(chietkhauInput.value.trim()) || 0;
  if (ck <= 100) {
    ck = tongThanhTien * (ck / 100);
    chietkhauInput.value = ck.toLocaleString();
  }

  const phaitra = tongThanhTien - ck;
  phaithanhtoanInput.value = phaitra.toLocaleString();

  let khachtra = parseFloat(khachtraInput.value.replace(/,/g, "").trim());
  if (!khachtraInput.dataset.modified) {
    khachtra = phaitra;
    khachtraInput.value = phaitra.toLocaleString();
  }

  const conlai = khachtra - phaitra;
  conlaiInput.value = conlai.toLocaleString();

  document.getElementById("phaithanhtoan_text").textContent = phaitra.toLocaleString();
  document.getElementById("khachtra_text").textContent = khachtra.toLocaleString();
  document.getElementById("conlai_text").textContent = conlai.toLocaleString();
}
