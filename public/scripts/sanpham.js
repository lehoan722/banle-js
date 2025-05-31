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
      const itemFirst = popup.querySelector(".popup-masp-item");
      const keyword = inputMaSP.value.trim().toUpperCase();

      e.preventDefault();
      if (popup.style.display !== "none" && itemFirst) {
        chonMaSanPham(itemFirst.dataset.masp);
      } else if (window.sanPhamData[keyword]) {
        xuLyKhiChonMaSanPham(keyword);
      } else {
        window.moPopupNhapHangHoa("them", { masp: keyword });
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
    // TODO: xử lý khi đã chọn sản phẩm
  } else {
    window.moPopupNhapHangHoa("them", { masp });
  }
}

export function hienThiFormMaMoi() {
  const config = JSON.parse(localStorage.getItem("cauhinh_hh") || "[]");
  const container = document.getElementById("formFields");
  container.innerHTML = "";

  truongHangHoa.forEach(truong => {
    if (truong.batbuoc || config.includes(truong.id)) {
      const div = document.createElement("div");
      if (truong.loai === "boolean") {
        div.innerHTML = `<label><input type="checkbox" id="moi_${truong.id}"/> ${truong.label}</label>`;
      } else {
        div.innerHTML = `<input id="moi_${truong.id}" placeholder="${truong.label}" style="width:100%; padding:6px; margin-bottom:6px;" />`;
      }
      container.appendChild(div);
    }
  });

  document.getElementById("popupNhapMaMoi").style.display = "block";
}

export async function luuMaSanPhamMoi(sanPhamData) {
  const data = {};

  truongHangHoa.forEach(truong => {
    const el = document.getElementById(`moi_${truong.id}`);
    if (el) {
      if (truong.loai === "boolean") {
        data[truong.id] = el.checked;
      } else {
        const val = el.value.trim();
        data[truong.id] = val === "" ? null : val;
      }
    }
  });

  if (!data.masp || !data.tensp || (!data.giale && !data.giasi && !data.gianhap)) {
    alert("❗ Cần nhập Mã SP, Tên SP và ít nhất một giá bán.");
    return;
  }

  data.nhapdau = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("dmhanghoa").insert([data]);
  if (error) {
    alert("❌ Lỗi khi lưu mã mới: " + error.message);
    console.error(error);
  } else {
    alert("✅ Đã thêm mã sản phẩm.");
    document.getElementById("popupNhapMaMoi").style.display = "none";
    sanPhamData[data.masp] = data;
    document.getElementById("masp").value = data.masp;
    xuLyKhiChonMaSanPham(data.masp);
  }
}

export function moCauHinhTruong() {
  const ds = document.getElementById("dsTruongCauHinh");
  ds.innerHTML = "";
  const config = JSON.parse(localStorage.getItem("cauhinh_hh") || "[]");

  truongHangHoa.forEach(truong => {
    if (truong.batbuoc) return;
    const div = document.createElement("div");
    div.innerHTML = `<label><input type="checkbox" value="${truong.id}" ${config.includes(truong.id) ? "checked" : ""}/> ${truong.label}</label>`;
    ds.appendChild(div);
  });

  document.getElementById("popupCauHinh").style.display = "block";
}

export function luuCauHinhTruong() {
  const checked = [...document.querySelectorAll("#dsTruongCauHinh input:checked")].map(el => el.value);
  localStorage.setItem("cauhinh_hh", JSON.stringify(checked));
  alert("✅ Đã lưu cấu hình hiển thị.");
  document.getElementById("popupCauHinh").style.display = "none";
}
