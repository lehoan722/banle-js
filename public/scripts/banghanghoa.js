// scripts/banghanghoa.js
import { supabase } from './supabaseClient.js';
import Handsontable from 'https://cdn.jsdelivr.net/npm/handsontable@13.0.0/+esm';

let hot;
let container;
let danhSachHienTai = [];

export async function moBangDanhMucHangHoa(keyword = "") {
  document.getElementById("popupBangDanhMuc").style.display = "block";
  container = document.getElementById("hotDanhMuc");

  const { data, error } = await supabase
    .from("dmhanghoa")
    .select("*")
    .ilike("masp", `%${keyword}%`)
    .order("masp", { ascending: true })
    .limit(100);

  if (error) {
    alert("Lỗi tải danh mục: " + error.message);
    return;
  }

  danhSachHienTai = data;

  if (hot) {
    hot.loadData(data);
  } else {
    hot = new Handsontable(container, {
      data: data,
      columns: [
        { data: 'masp', title: 'Mã SP' },
        { data: 'tensp', title: 'Tên SP' },
        { data: 'giale', title: 'Giá lẻ' },
        { data: 'gianhap', title: 'Giá nhập' },
        { data: 'nhomhang', title: 'Nhóm hàng' },
        { data: 'nhacc', title: 'Nhà cung cấp' },
        { data: 'mausac', title: 'Màu' }
      ],
      colHeaders: true,
      rowHeaders: true,
      height: 400,
      licenseKey: 'non-commercial-and-evaluation'
    });
  }
}

export function timLaiTrongBangDM() {
  const keyword = document.getElementById("timKiemMaspDM").value.trim();
  moBangDanhMucHangHoa(keyword);
}

export function chonDongDeSua() {
  const selected = hot.getSelected();
  if (!selected || selected.length === 0) {
    alert("Vui lòng chọn một dòng để sửa.");
    return;
  }
  const rowIndex = selected[0][0];
  const sp = danhSachHienTai[rowIndex];
  window.moPopupSuaHangHoa(sp); // gọi popup sửa
}
