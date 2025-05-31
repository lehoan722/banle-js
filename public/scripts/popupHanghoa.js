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

let cheDoNhap = "them"; // hoặc 'sua'
let duLieuCu = {};

export function moPopupNhapHangHoa(mode = "them", data = null) {
  cheDoNhap = mode;
  duLieuCu = data || {};
  document.getElementById("popupNhapHangHoa").style.display = "block";
  document.getElementById("tieudePopupHangHoa").textContent = mode === "them" ? "Thêm sản phẩm mới" : `Sửa: ${data.masp}`;
  taoFormHangHoa(duLieuCu, cheDoNhap);
}

function taoFormHangHoa(data = {}, mode = "them") {
  const container = document.getElementById("fieldsNhapHangHoa");
  container.innerHTML = "";

  const giuLaiConfig = JSON.parse(localStorage.getItem("giulai_hanghoa") || "{}");

  truongHangHoa.forEach(truong => {
    const div = document.createElement("div");
    div.style = "margin-bottom:6px";

    const label = `<label style="display:block;font-weight:bold;">${truong.label}</label>`;
    const value = data[truong.id] ?? "";

    let input = "";
    if (truong.loai === "boolean") {
      input = `<input type="checkbox" id="nhh_${truong.id}" ${value ? "checked" : ""}/>`;
    } else {
      const disabled = (mode === "sua" && truong.id === "masp") ? "readonly style='background:#eee'" : "";
      input = `<input id="nhh_${truong.id}" value="${value}" ${disabled} style="width:100%;padding:6px;" />`;
    }

    const checkbox = `<label><input type="checkbox" id="giu_${truong.id}" ${giuLaiConfig[truong.id] ? "checked" : ""} style="margin-right:4px;"/>Giữ lại</label>`;

    div.innerHTML = `${label}${input}${checkbox}`;
    container.appendChild(div);
  });

  const footer = document.getElementById("footerHangHoa");
  if (mode === "sua") {
    footer.innerHTML = `Ngày sửa: ${new Date().toLocaleString()}`;
  } else if (mode === "them" && data.nhapdau) {
    footer.innerHTML = `Nhập đầu: ${data.nhapdau}`;
  } else {
    footer.innerHTML = "";
  }
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

  // Lưu cấu hình giữ lại vào localStorage
  localStorage.setItem("giulai_hanghoa", JSON.stringify(giuLai));

  if (!data.masp || !data.tensp) {
    alert("❗ Vui lòng nhập Mã SP và Tên SP.");
    return;
  }

  const now = new Date().toISOString();

  if (cheDoNhap === "them") {
    data.nhapdau = now.slice(0, 10);
    const { error } = await supabase.from("dmhanghoa").insert([data]);
    if (error) {
      alert("❌ Lỗi khi thêm sản phẩm: " + error.message);
      return;
    } else {
      alert("✅ Đã thêm sản phẩm.");
    }
  } else {
    data.ngaysua = now;
    const { error } = await supabase.from("dmhanghoa").update(data).eq("masp", duLieuCu.masp);
    if (error) {
      alert("❌ Lỗi khi cập nhật sản phẩm: " + error.message);
      return;
    } else {
      alert("✅ Đã cập nhật sản phẩm.");
    }
  }

  document.getElementById("popupNhapHangHoa").style.display = "none";

  // Áp dụng giữ lại cho lần nhập tiếp
  if (cheDoNhap === "them") {
    const truongMoi = {};
    for (const truong of truongHangHoa) {
      if (giuLai[truong.id]) {
        const el = document.getElementById(`nhh_${truong.id}`);
        if (el) {
          truongMoi[truong.id] = truong.loai === "boolean" ? el.checked : el.value.trim();
        }
      }
    }
    // Lưu tạm để lần sau dùng nếu tiếp tục thêm mới
    window.giaTriGiulai = truongMoi;
  }
}
