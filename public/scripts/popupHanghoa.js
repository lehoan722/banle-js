import { supabase } from './supabaseClient.js';

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

let cheDoNhap = "them";
let duLieuCu = {};

export function moPopupNhapHangHoa(mode = "them", data = null) {
  cheDoNhap = mode;
  duLieuCu = data || {};
  document.getElementById("popupNhapHangHoa").style.display = "block";
  document.getElementById("tieudePopupHangHoa").textContent = mode === "them" ? "➕ Thêm sản phẩm mới" : `✏️ Sửa: ${data.masp}`;
  taoFormHangHoa(duLieuCu, cheDoNhap);
}

function taoFormHangHoa(data = {}, mode = "them") {
  const container = document.getElementById("fieldsNhapHangHoa");
  container.innerHTML = "";

  const giuLaiConfig = JSON.parse(localStorage.getItem("giulai_hanghoa") || "{}");

  truongHangHoa.forEach(truong => {
    const label = truong.label;
    const value = data[truong.id] ?? "";
    const isReadOnly = (mode === "sua" && truong.id === "masp") ? "readonly style='background:#eee'" : "";
    const checked = giuLaiConfig[truong.id] ? "checked" : "";

    const row = document.createElement("div");
    row.style = "display: flex; align-items: center; margin-bottom: 4px; gap: 6px;";

    const labelEl = document.createElement("label");
    labelEl.textContent = label;
    labelEl.style = "width: 140px; font-weight: bold;";

    let inputEl = document.createElement(truong.loai === "boolean" ? "input" : "input");
    inputEl.id = `nhh_${truong.id}`;
    inputEl.type = truong.loai === "boolean" ? "checkbox" : "text";
    inputEl.style = "flex: 1;";
    if (truong.loai !== "boolean") {
      inputEl.value = value;
      if (isReadOnly) inputEl.setAttribute("readonly", "true");
    } else {
      inputEl.checked = !!value;
    }

    const checkGiulai = document.createElement("input");
    checkGiulai.type = "checkbox";
    checkGiulai.id = `giu_${truong.id}`;
    checkGiulai.checked = !!giuLaiConfig[truong.id];
    checkGiulai.title = "Giữ lại";

    row.appendChild(labelEl);
    row.appendChild(inputEl);
    row.appendChild(checkGiulai);

    container.appendChild(row);
  });

  const footer = document.getElementById("footerHangHoa");
  footer.innerHTML = mode === "sua"
    ? `🕒 Ngày sửa: ${new Date().toLocaleString()}`
    : (data.nhapdau ? `📅 Nhập đầu: ${data.nhapdau}` : "");
}

export async function luuHangHoa() {
  const data = {};
  const giuLai = {};

  for (const truong of truongHangHoa) {
    const el = document.getElementById(`nhh_${truong.id}`);
    const giu = document.getElementById(`giu_${truong.id}`).checked;
    giuLai[truong.id] = giu;

    if (el) {
      if (truong.loai === "boolean") {
        data[truong.id] = el.checked;
      } else {
        const val = el.value.trim();
        data[truong.id] = val === "" ? null : val;
      }
    }
  }

  // Lưu cấu hình giữ lại
  localStorage.setItem("giulai_hanghoa", JSON.stringify(giuLai));

  if (!data.masp || !data.tensp) {
    alert("❗ Cần nhập Mã SP và Tên SP.");
    return;
  }

  const now = new Date().toISOString();

  if (cheDoNhap === "them") {
    data.nhapdau = now.slice(0, 10);
    const { error } = await supabase.from("dmhanghoa").insert([data]);
    if (error) {
      alert("❌ Lỗi khi thêm sản phẩm: " + error.message);
      return;
    }
    alert("✅ Đã thêm sản phẩm.");
  } else {
    data.ngaysua = now;
    const { error } = await supabase.from("dmhanghoa").update(data).eq("masp", duLieuCu.masp);
    if (error) {
      alert("❌ Lỗi khi cập nhật sản phẩm: " + error.message);
      return;
    }
    alert("✅ Đã cập nhật sản phẩm.");
  }

  document.getElementById("popupNhapHangHoa").style.display = "none";
}

export function themTiepSanPham() {
  const truoc = JSON.parse(localStorage.getItem("giulai_hanghoa") || "{}");
  const truongGiulai = {};

  for (const truong of truongHangHoa) {
    if (truoc[truong.id]) {
      const el = document.getElementById(`nhh_${truong.id}`);
      if (el) {
        truongGiulai[truong.id] = truong.loai === "boolean" ? el.checked : el.value.trim();
      }
    }
  }

  moPopupNhapHangHoa("them", truongGiulai);
}

window.moPopupCauHinh = () => {
  document.getElementById("popupCauHinh").style.display = "block";
};


