import { supabase } from './supabaseClient.js'; // tách Supabase config ra file riêng nếu cần

const truongHangHoa = [
  { id: "masp", label: "Mã sản phẩm", batbuoc: true },
  { id: "tensp", label: "Tên sản phẩm", batbuoc: true },
  { id: "gia", label: "Giá bán", batbuoc: true },
  { id: "km", label: "Khuyến mãi" },
  { id: "dvt", label: "Đơn vị tính" },
  { id: "nhom", label: "Nhóm hàng" },
  { id: "vitriCS1", label: "Vị trí CS1" },
  { id: "vitriCS2", label: "Vị trí CS2" }
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
      if (popup.style.display !== "none" && itemFirst) {
        e.preventDefault();
        chonMaSanPham(itemFirst.dataset.masp);
      } else {
        e.preventDefault();
        hienThiFormMaMoi();
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
    const evt = new KeyboardEvent("keydown", { key: "Enter" });
    inputMaSP.dispatchEvent(evt);
  }
}

export function hienThiFormMaMoi() {
  const config = JSON.parse(localStorage.getItem("cauhinh_hienthi_truong") || "[]");
  const container = document.getElementById("formFields");
  container.innerHTML = "";

  truongHangHoa.forEach(truong => {
    if (truong.batbuoc || config.includes(truong.id)) {
      const div = document.createElement("div");
      div.innerHTML = `<input id="moi_${truong.id}" placeholder="${truong.label}" style="width:100%; padding:6px; margin-bottom:6px;" />`;
      container.appendChild(div);
    }
  });

  document.getElementById("popupNhapMaMoi").style.display = "block";
}

export async function luuMaSanPhamMoi(sanPhamData) {
  const data = {};
  truongHangHoa.forEach(truong => {
    const el = document.getElementById(`moi_${truong.id}`);
    if (el) data[truong.id] = el.value.trim();
  });

  if (!data.masp || !data.tensp || !data.gia) {
    alert("❗ Vui lòng nhập đầy đủ Mã SP, Tên SP và Giá.");
    return;
  }

  data.ngaynhapdau = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("dmhanghoa").insert([data]);
  if (error) {
    alert("❌ Lỗi khi lưu mã mới: " + error.message);
  } else {
    alert("✅ Đã thêm mã sản phẩm.");
    document.getElementById("popupNhapMaMoi").style.display = "none";
    sanPhamData[data.masp] = data;
    document.getElementById("masp").value = data.masp;
    const evt = new KeyboardEvent("keydown", { key: "Enter" });
    document.getElementById("masp").dispatchEvent(evt);
  }
}

export function moCauHinhTruong() {
  const ds = document.getElementById("dsTruongCauHinh");
  ds.innerHTML = "";
  const config = JSON.parse(localStorage.getItem("cauhinh_hienthi_truong") || "[]");

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
  localStorage.setItem("cauhinh_hienthi_truong", JSON.stringify(checked));
  alert("✅ Đã lưu cấu hình hiển thị.");
  document.getElementById("popupCauHinh").style.display = "none";
}
