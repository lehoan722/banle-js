// bangketqua.js

import { getMaspspDangChon, setMaspspDangChon } from './hoadon.js';
import { capNhatThongTinTong } from './utils.js';

export function capNhatBangHTML(bangKetQua) {
  const tbody = document.querySelector("#bangketqua tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  Object.values(bangKetQua).forEach(item => {
    // Sắp xếp kích cỡ và số lượng tương ứng
    const zipped = item.sizes.map((size, i) => ({
      size: parseInt(size),
      soluong: item.soluongs[i]
    }));
    zipped.sort((a, b) => a.size - b.size);  // sắp xếp theo size tăng dần

    // Mỗi size là một dòng riêng
    zipped.forEach((z, idx) => {
      const thanhtien = (item.gia - item.km) * z.soluong;
      const row = tbody.insertRow();
      row.innerHTML = `
        <td>${item.masp}</td>
        <td>${item.tensp}</td>
        <td>${z.size}</td>
        <td>${z.soluong}</td>
        <td>${z.soluong}</td>
        <td>${item.gia}</td>
        <td>${item.km}</td>
        <td>${thanhtien.toLocaleString()}</td>
        <td>${item.dvt}</td>
      `;

      // Lưu cả mã sản phẩm và size khi chọn dòng
      row.addEventListener("click", () => {
        setMaspspDangChon({ masp: item.masp, size: z.size });
        highlightRow(row);
      });
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



export function capNhatBangKetQuaTuDOM() {
  const tbody = document.querySelector("#bangketqua tbody");
  if (!tbody) return;

  const bang = {};

  Array.from(tbody.rows).forEach(row => {
    // Chú ý: các chỉ số cells[] phải khớp với thứ tự cột của bảng!
    const masp = (row.cells[0]?.innerText || "").trim().toUpperCase();
    const tensp = (row.cells[1]?.innerText || "").trim();
    const size = (row.cells[2]?.innerText || "").trim();
    const soluong = parseFloat(row.cells[3]?.innerText || "0");
    // cells[4] là Tổng, không cần dùng
    const gia = parseFloat(row.cells[5]?.innerText || "0");
    const km = parseFloat(row.cells[6]?.innerText || "0");
    // cells[7] là Thành tiền, không cần dùng
    const dvt = (row.cells[8]?.innerText || "").trim();

    if (!masp) return; // Bỏ qua dòng rỗng

    // Nếu đã có mã này, chỉ push thêm size & số lượng
    if (!bang[masp]) {
      bang[masp] = {
        masp,
        tensp,
        sizes: [],
        soluongs: [],
        gia,
        km,
        dvt,
      };
    }
    bang[masp].sizes.push(size);
    bang[masp].soluongs.push(soluong);
    // Nếu muốn cộng dồn size trùng, bổ sung logic group thêm
  });

  // Gán vào window để getBangKetQua() có thể đọc
  window.bangKetQua = bang;
}

