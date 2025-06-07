import { supabase } from './supabaseClient.js';

const truongHangHoa = [
  { id: "masp", label: "Mã sản phẩm", batbuoc: true },
  { id: "tensp", label: "Tên sản phẩm", batbuoc: true },
  { id: "gianhap", label: "Giá nhập" },
  { id: "giale", label: "Giá lẻ" },
  //{ id: "giasi", label: "Giá sỉ" },
  { id: "mangan", label: "Mã ngắn" },
  { id: "nhomhang", label: "Nhóm hàng" },
  //{ id: "tenhang", label: "Tên hàng (in hóa đơn)" },
  { id: "nhacc", label: "Nhà cung cấp" },
  { id: "chungloai", label: "Chủng loại" },
  //{ id: "vitrikho1", label: "Vị trí kho 1" },
  //{ id: "vitrikho2", label: "Vị trí kho 2" },
 // { id: "vitrikho3", label: "Vị trí kho 3" },
 //{ id: "ngaykiem", label: "ngay kiem" },
  { id: "loaisp", label: "Loại sản phẩm" },
 // { id: "mausac", label: "Màu sắc" },
  { id: "khuyenmai", label: "Khuyến mãi" },
  { id: "quanlykichco", label: "Quản lý kich co", loai: "boolean" }
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

  const cauHinhHienThi = JSON.parse(localStorage.getItem("cauhinh_hh") || "{}");
  const giuLaiConfig = JSON.parse(localStorage.getItem("giulai_hanghoa") || "{}");

  truongHangHoa.forEach(truong => {
    if (Object.keys(cauHinhHienThi).length > 0 && cauHinhHienThi[truong.id] === false) return;

    const label = truong.label;
    const value = data[truong.id] ?? "";
    const isReadOnly = (mode === "sua" && truong.id === "masp") ? "readonly style='background:#eee'" : "";
    const checked = giuLaiConfig[truong.id] ? "checked" : "";

    const row = document.createElement("div");
    row.style = "display: flex; align-items: center; margin-bottom: 4px; gap: 6px;";

    const labelEl = document.createElement("label");
    labelEl.textContent = label;
    labelEl.style = "width: 140px; font-weight: bold;";

    let inputEl;
    if (truong.id === "masp") {
      inputEl = document.createElement("input");
      inputEl.id = `nhh_${truong.id}`;
      inputEl.type = "text";
      inputEl.setAttribute("list", "dsmasp");
      inputEl.value = value;
      inputEl.style = "flex: 1;";

      if (!document.getElementById("dsmasp")) {
        const datalist = document.createElement("datalist");
        datalist.id = "dsmasp";
        document.body.appendChild(datalist);
      }

      napDanhSachMaSPVaoPopup();
    } else {
      inputEl = document.createElement("input");
      inputEl.id = `nhh_${truong.id}`;
      inputEl.type = truong.loai === "boolean" ? "checkbox" : "text";
      inputEl.style = "flex: 1;";
      if (truong.loai !== "boolean") {
        inputEl.value = value;
        if (isReadOnly) inputEl.setAttribute("readonly", "true");
      } else {
        inputEl.checked = !!value;
      }
    }
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

if (mode === "sua") {
  const ngayNhap = data.nhapdau ? `📅 Ngày nhập: ${data.nhapdau}` : "";
  const ngaySua = `🕒 Ngày sửa: ${new Date().toLocaleString()}`;
  footer.innerHTML = `${ngayNhap} / ${ngaySua}`;
} else {
  footer.innerHTML = data.nhapdau ? `📅 Ngày nhập: ${data.nhapdau}` : "";
}
  
}

export function moPopupCauHinh() {
  const khung = document.getElementById("dsCauHinhTruong");
  khung.innerHTML = "";

  const config = JSON.parse(localStorage.getItem("cauhinh_hh") || "{}");

  truongHangHoa.forEach(truong => {
    const div = document.createElement("div");
    div.style = "margin-bottom:6px;";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "cauhinh_" + truong.id;
    checkbox.value = truong.id;
    checkbox.checked = !(config[truong.id] === false);

    const label = document.createElement("label");
    label.textContent = " " + truong.label;

    div.appendChild(checkbox);
    div.appendChild(label);
    khung.appendChild(div);
  });

  document.getElementById("popupCauHinh").style.display = "block";
}

export function luuCauHinhTruong() {
  const config = {};
  truongHangHoa.forEach(truong => {
    const checkbox = document.getElementById("cauhinh_" + truong.id);
    if (checkbox) config[truong.id] = checkbox.checked;
  });

  localStorage.setItem("cauhinh_hh", JSON.stringify(config));
  alert("✅ Đã lưu cấu hình hiển thị.");
  document.getElementById("popupCauHinh").style.display = "none";
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

  localStorage.setItem("giulai_hanghoa", JSON.stringify(giuLai));

  if (data.masp) {
    data.masp = data.masp.toUpperCase();
  }
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
themTiepSanPham();
  
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

window.moPopupCauHinh = moPopupCauHinh;


let cacheMaSP = [];

async function napDanhSachMaSPVaoPopup() {
  if (cacheMaSP.length > 0) return;
  const { data, error } = await supabase.from("dmhanghoa").select("masp").limit(1000);
  if (data) {
    cacheMaSP = data.map(d => d.masp?.toUpperCase());
    const datalist = document.getElementById("dsmasp");
    datalist.innerHTML = "";
    cacheMaSP.forEach(masp => {
      const opt = document.createElement("option");
      opt.value = masp;
      datalist.appendChild(opt);
    });
  }
}

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    const popup = document.getElementById("popupNhapHangHoa");
    if (popup && popup.style.display !== "none") {
      popup.style.display = "none";
    }
    const cauhinh = document.getElementById("popupCauHinh");
    if (cauhinh && cauhinh.style.display !== "none") {
      cauhinh.style.display = "none";
    }
  }
});
