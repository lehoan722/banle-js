// bangketqua.js

import { getMaspspDangChon, setMaspspDangChon } from './hoadon.js';
import { capNhatThongTinTong } from './utils.js';

function getVitriTheoKho(masp) {
  if (!masp) return "";
  const sp =
    (window.sanPhamData && (window.sanPhamData[masp] || window.sanPhamData[masp.toUpperCase()])) || null;

  // Xác định cơ sở từ input #diadiem (ưu tiên) hoặc localStorage
  const diadiem = (document.getElementById('diadiem')?.value ||
    localStorage.getItem('diadiem') || '').toLowerCase();

  if (!sp) return "";
  if (diadiem === 'cs1') return sp.vitrikho1 || "";
  if (diadiem === 'cs2') return sp.vitrikho2 || "";
  if (diadiem === 'cs3') return sp.vitrikho3 || "";
  return sp.vitrikho1 || sp.vitrikho2 || sp.vitrikho3 || "";
}


export function capNhatBangHTML(bangKetQua, lastAdded = null) {
  const tbody = document.querySelector("#bangketqua tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  // Giữ logic: trang "nhập mới" thì tính giá/khuyến mại khác
  const isNhap = window.location.pathname.includes("nhapmoi");

  // --- 1) Tạo thứ tự mã: nếu có lastAdded.masp thì đẩy mã đó lên đầu ---
  const maspList = Object.keys(bangKetQua);
  const orderedMasps = (lastAdded && lastAdded.masp && maspList.includes(lastAdded.masp))
    ? [lastAdded.masp, ...maspList.filter(m => m !== lastAdded.masp)]
    : maspList;

  // --- 2) Duyệt theo thứ tự đã xếp ---
  orderedMasps.forEach(masp => {
    const item = bangKetQua[masp];

    // Sắp xếp size tăng dần theo danh mục; fallback numeric nếu không có trong danh mục
    // Chuẩn hoá size về string
    const sizes = item.sizes.map(s => String(s).trim());
    const counts = item.soluongs.slice(); // song song với sizes

    const toIndex = (sz) => {
      if (Array.isArray(window.danhMucSize) && window.danhMucSize.length) {
        const idx = window.danhMucSize.findIndex(x => String(x).trim().toUpperCase() === sz.toUpperCase());
        if (idx !== -1) return idx;
      }
      // fallback: parse số để so sánh tăng dần; nếu NaN thì đẩy về cuối
      const n = parseFloat(sz);
      return isNaN(n) ? Number.POSITIVE_INFINITY : n + 100000; // cộng offset để không đụng các index hợp lệ
    };

    // Tạo mảng index để sort ổn định sizes + counts cùng lúc
    const idxArr = sizes.map((_, i) => i);
    idxArr.sort((i, j) => {
      const ai = toIndex(sizes[i]);
      const aj = toIndex(sizes[j]);
      return ai - aj;
    });

    // Render từng size theo thứ tự đã sắp
    idxArr.forEach(i => {
      const sz = sizes[i];
      const sl = counts[i];

      // Tính giá/km theo nghiệp vụ
      let gia = item.gia || 0;
      let km = item.km || 0;
      if (isNhap) {
        if (window.sanPhamData && window.sanPhamData[item.masp]) {
          gia = window.sanPhamData[item.masp].gianhap || 0;
        } else {
          gia = 0;
        }
        km = 0;
      }
      const thanhtien = (gia - km) * sl;

      const tr = tbody.insertRow();
      const vitri = getVitriTheoKho(item.masp);

      tr.innerHTML = `
        <td>${item.masp}</td>
        <td>${item.tensp}</td>
        <td>${sz}</td>
        <td>${sl}</td>
        <td>${item.dvt || ""}</td>
        <td>${gia}</td>
        <td>${km}</td>
        <td>${thanhtien.toLocaleString()}</td>
        <td>${vitri}</td>
      `;

      // Lưu chọn để sửa/xóa theo cặp (masp, size)
      tr.addEventListener("click", () => {
        setMaspspDangChon({ masp: item.masp, size: sz });
        highlightRow(tr);
      });

      // --- 3) Highlight dòng vừa thêm ---
      if (
        lastAdded &&
        String(lastAdded.masp).toUpperCase() === String(item.masp).toUpperCase() &&
        String(lastAdded.size).trim().toUpperCase() === String(sz).trim().toUpperCase()
      ) {
        tr.classList.add("highlight");
      }
    });
  });

  // Cập nhật tổng số liệu
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

export function resetFormSauKhiNhapSize() {
  const maspInput = document.getElementById("masp");
  const soluongInput = document.getElementById("soluong");
  const sizeInput = document.getElementById("size");

  // LƯU lại masp vừa dùng để hiển thị ảnh nếu cần
  window.masp_last = maspInput.value || window.masp_last || "";

  // KHÔNG xóa masp; chỉ reset size & số lượng
  soluongInput.value = "1";
  sizeInput.value = "";

  // Cập nhật ảnh (ưu tiên masp hiện tại)
  if (window.hienThiAnhSanPhamTuMasp) window.hienThiAnhSanPhamTuMasp();

  // Tiếp tục nhập size cho cùng mã
  sizeInput.focus();
  sizeInput.select();
}


export function capNhatBangKetQuaTuDOM() {
  const tbody = document.querySelector("#bangketqua tbody");
  if (!tbody) return;

  const bang = {};

  Array.from(tbody.rows).forEach(row => {
    // Chú ý: cập nhật lại chỉ số cột nếu bảng có thay đổi thứ tự
    const masp = (row.cells[0]?.innerText || "").trim().toUpperCase();
    const tensp = (row.cells[1]?.innerText || "").trim();
    const size = (row.cells[2]?.innerText || "").trim();
    const soluong = parseFloat(row.cells[3]?.innerText || "0");
    // cells[4] là ĐVT nhưng sẽ không lấy trực tiếp
    const gia = parseFloat(row.cells[5]?.innerText?.replace(/,/g, "") || "0");
    const km = parseFloat(row.cells[6]?.innerText?.replace(/,/g, "") || "0");
    // cells[7] là Thành tiền, không cần dùng

    if (!masp) return; // Bỏ qua dòng rỗng

    // Lấy dvt từ danh mục hàng hóa (window.sanPhamData)
    let dvt = "";
    if (window.sanPhamData && window.sanPhamData[masp]) {
      dvt = window.sanPhamData[masp].dvt || "";
    }

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
    // Có thể bổ sung logic cộng dồn size nếu cần
  });

  // Gán vào window để getBangKetQua() có thể đọc
  window.bangKetQua = bang;
}

window.capNhatBangKetQuaTuDOM = capNhatBangKetQuaTuDOM;
