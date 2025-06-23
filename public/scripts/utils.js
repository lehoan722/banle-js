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
    // Nếu nhập từng dòng tay thì item.tong là số lẻ, còn copy/dán thì soluongs là mảng
    if (Array.isArray(item.soluongs)) {
      item.soluongs.forEach((sl, idx) => {
        const soluong = Number(sl) || 0;
        tongSoLuong += soluong;
        // Nếu km là số chung
        let km1 = Number(item.km || 0);
        // Nếu bạn lưu km từng dòng thì dùng mảng, ở đây ưu tiên số chung
        tongKhuyenMai += km1 * soluong;
        tongThanhTien += (Number(item.gia || 0) - km1) * soluong;
      });
    } else {
      // Trường hợp cũ, nhập từng dòng
      const sl = Number(item.tong || 0);
      const km = Number(item.km || 0);
      const gia = Number(item.gia || 0);
      tongSoLuong += sl;
      tongKhuyenMai += km * sl;
      tongThanhTien += (gia - km) * sl;
    }
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
