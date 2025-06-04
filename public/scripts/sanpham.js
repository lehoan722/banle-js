
import { supabase } from './supabaseClient.js';
import { moBangDanhMucHangHoa } from './banghanghoa.js';

const truongHangHoa = [
  { id: "masp", label: "Mã sản phẩm", batbuoc: true },
  { id: "tensp", label: "Tên sản phẩm", batbuoc: true },
  { id: "gianhap", label: "Giá nhập" },
  { id: "giale", label: "Giá lẻ" },
  { id: "giasi", label: "Giá sỉ" },
  { id: "mangan", label: "Mã ngắn" },
  { id: "nhomhang", label: "Nhóm hàng" },
  { id: "tenhang", label: "Tên hàng (in hóa đơn)" },
  { id: "nhacc", label: "Nhà cung cấp" },
  { id: "chungloai", label: "Chủng loại" },
  { id: "vitrikho1", label: "Vị trí kho 1" },
  { id: "vitrikho2", label: "Vị trí kho 2" },
  { id: "vitrikho3", label: "Vị trí kho 3" },
  { id: "dakiem", label: "Đã kiểm", loai: "boolean" },
  { id: "loaisp", label: "Loại sản phẩm" },
  { id: "mausac", label: "Màu sắc" },
  { id: "khuyenmai", label: "Khuyến mãi" },
  { id: "quanlykhicoc", label: "Quản lý khi cọc", loai: "boolean" }
];

export function khoiTaoTimMaSP(sanPhamData) {
  const inputMaSP = document.getElementById("masp");
  const popup = document.getElementById("popup_masp");

  inputMaSP.addEventListener("input", () => {
    const keyword = inputMaSP.value.trim().toUpperCase();
    if (!keyword) return (popup.style.display = "none");

    const danhSach = Object.values(sanPhamData)
      .filter(sp =>
        sp.masp.includes(keyword) || (sp.tensp || "").toUpperCase().includes(keyword)
      )
      .slice(0, 100);

    if (danhSach.length === 0) {
      popup.style.display = "none";
      return;
    }

    popup.innerHTML = danhSach.map(sp => `
      <div class="popup-masp-item" data-masp="${sp.masp}" style="padding:6px; border-bottom:1px solid #eee; cursor:pointer;">
        ${sp.masp} - ${sp.tensp}
      </div>
    `).join("");
    popup.style.display = "block";
  });

  popup.addEventListener("click", (e) => {
    const item = e.target.closest(".popup-masp-item");
    if (!item) return;
    chonMaSanPham(item.dataset.masp);
  });

  inputMaSP.addEventListener("keydown", (e) => {
    if (e.key === "Escape") popup.style.display = "none";

    if (e.key === "Enter") {
      e.preventDefault();
      const itemFirst = popup.querySelector(".popup-masp-item");
      const keyword = inputMaSP.value.trim().toUpperCase();

      if (popup.style.display !== "none" && itemFirst) {
        chonMaSanPham(itemFirst.dataset.masp);
      } else {
        popup.style.display = "none"; // để hoadon.js xử lý tiếp
      }
    }
  });

  document.addEventListener("click", (e) => {
    if (!popup.contains(e.target) && e.target !== inputMaSP) {
      popup.style.display = "none";
    }
  });

  function chonMaSanPham(masp) {
    inputMaSP.value = masp;
    popup.style.display = "none";
    xuLyKhiChonMaSanPham(masp);
  }
}

function xuLyKhiChonMaSanPham(masp) {
  const sp = sanPhamData[masp];
  if (sp) {
    console.log("Đã chọn sản phẩm:", sp);
  } else {
    window.moPopupNhapHangHoa("them", { masp });
  }
}
