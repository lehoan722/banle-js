// bangketqua.js

import { getMaspspDangChon, setMaspspDangChon } from './hoadon.js';
import { capNhatThongTinTong } from './utils.js';

export function capNhatBangHTML(bangKetQua) {
  const tbody = document.querySelector("#bangketqua tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  Object.values(bangKetQua).forEach(item => {
    // Sắp xếp kích cỡ và số lượng tương ứng
    const zipped = item.sizes.map((size, i) => ({ size: parseInt(size), soluong: item.soluongs[i] }));
    zipped.sort((a, b) => a.size - b.size);  // sắp xếp theo size tăng dần

    const sortedSizes = zipped.map(z => z.size);
    const sortedSoluongs = zipped.map(z => z.soluong);

    const thanhtien = (item.gia - item.km) * item.tong;
    const row = tbody.insertRow();
    row.innerHTML = `
    <td>${item.masp}</td>
    <td>${item.tensp}</td>
    <td>${sortedSizes.join(",")}</td>
    <td>${sortedSoluongs.join(",")}</td>
    <td>${item.tong}</td>
    <td>${item.gia}</td>
    <td>${item.km}</td>
    <td>${thanhtien.toLocaleString()}</td>
    <td>${item.dvt}</td>
  `;

    row.addEventListener("click", () => {
      setMaspspDangChon(item.masp);
      highlightRow(row);
    });
  });


  capNhatThongTinTong(bangKetQua);
}

function highlightRow(selectedRow) {
  document.querySelectorAll("#bangketqua tbody tr").forEach(row => {
    row.style.backgroundColor = row === selectedRow ? "#e6f3ff" : "";
  });
}

export function resetFormBang() {
  const maspInput = document.getElementById("masp");
  const soluongInput = document.getElementById("soluong");
  const sizeInput = document.getElementById("size");

  // LƯU lại mã sản phẩm vừa nhập trước khi xóa trắng
  window.masp_last = maspInput.value || window.masp_last || "";

  // Xóa nội dung, đặt lại giá trị
  maspInput.value = "";
  soluongInput.value = "1";
  sizeInput.value = "";

  // Gọi hàm hiển thị ảnh vừa nhập cuối cùng (sẽ ưu tiên từ masp_last)
  if (window.hienThiAnhSanPhamTuMasp) window.hienThiAnhSanPhamTuMasp();

  // Làm mất focus, rồi mới focus lại để đảm bảo nhận diện lại sự kiện
  maspInput.blur();
  setTimeout(() => maspInput.focus(), 50);
}


