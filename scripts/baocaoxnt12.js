
import { supabase } from "./supabaseClient.js";
let hotInstance;

window.dangNhap = async function () {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const status = document.getElementById("authStatus");
  status.textContent = "";

  if (!email || !password) {
    status.textContent = "Nhập đầy đủ email và mật khẩu!";
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    status.textContent = "Sai email hoặc mật khẩu!";
    return;
  }

  status.style.color = "green";
  status.textContent = "Đăng nhập thành công!";
  document.getElementById("authBox").style.display = "none";
};

window.taiBaoCaoXNT = async function () {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    alert("Bạn cần đăng nhập trước khi xem báo cáo!");
    document.getElementById("authBox").style.display = "block";
    return;
  }

  const tuNgay = document.getElementById("tuNgay").value;
  const denNgay = document.getElementById("denNgay").value;
  if (!tuNgay || !denNgay) return alert("Chọn đủ từ ngày và đến ngày!");

  const params = {
    tu_ngay: tuNgay,
    den_ngay: denNgay,
    p_dsmsp: null,
    p_diadiem_filter: document.getElementById("diadiemSelect").value || null,
    p_khachhang_filter: document.getElementById("khachhangInput")?.value.trim() || null,
    p_nhanvien_filter: document.getElementById("nhanvienInput")?.value.trim() || null,
    p_nhomhang_filter: document.getElementById("nhomhangInput")?.value.trim() || null,
    p_chungloai_filter: document.getElementById("chungloaiInput")?.value.trim() || null,
    p_mausac_filter: document.getElementById("mausacInput")?.value.trim() || null,
    p_size_filter: document.getElementById("sizeInput")?.value.trim() || null,
    p_tu_gia: parseFloat(document.getElementById("tuGiaInput")?.value) || null,
    p_den_gia: parseFloat(document.getElementById("denGiaInput")?.value) || null,
    loc_duong: document.getElementById("locDuong")?.checked || false,
    loc_am: document.getElementById("locAm")?.checked || false,
    loc_het: document.getElementById("locHet")?.checked || false,
    loc_phatsinh_nhap: document.getElementById("locPhatsinhNhap")?.checked || false,
    loc_phatsinh_xuat: document.getElementById("locPhatsinhXuat")?.checked || false,
    p_tonghop_size: document.getElementById("tonghopSize")?.checked || false
  };

  const { data, error } = await supabase.rpc("baocaoxnt12", params);

  const container = document.getElementById("hot");
  if (hotInstance) {
    hotInstance.destroy();
    hotInstance = null;
  }

  if (error) {
    container.innerHTML = `<div style="color:red;">Lỗi: ${error.message}</div>`;
    return;
  }

  if (!data || !data.length) {
    container.innerHTML = `<div style="color:orange;">Không có dữ liệu</div>`;
    return;
  }

  const columns = [
    { data: 'stt', title: '#', readOnly: true, width: 40 },
    { data: 'masp', title: 'Mã hàng', readOnly: true },
    { data: 'tensp', title: 'Tên hàng', readOnly: true },
    { data: 'size', title: 'Kích cỡ', readOnly: true },
    { data: 'dauky', title: 'Đầu kỳ', type: 'numeric', readOnly: true },
    { data: 'nhapmua', title: 'Nhập mua', type: 'numeric', readOnly: true },
    { data: 'nhapkhac', title: 'Nhập khác', type: 'numeric', readOnly: true },
    { data: 'tongnhap', title: 'Tổng nhập', type: 'numeric', readOnly: true },
    { data: 'xuatban', title: 'Xuất bán', type: 'numeric', readOnly: true },
    { data: 'xuatkhac', title: 'Xuất khác', type: 'numeric', readOnly: true },
    { data: 'tongxuat', title: 'Tổng xuất', type: 'numeric', readOnly: true },
    { data: 'cuoiky', title: 'Cuối kỳ', type: 'numeric', readOnly: true },
    { data: 'ton_cs1', title: 'Tồn CS1', type: 'numeric', readOnly: true },
    { data: 'ton_cs2', title: 'Tồn CS2', type: 'numeric', readOnly: true },
    { data: 'giale', title: 'Giá lẻ', type: 'numeric', readOnly: true },
    { data: 'gianhap', title: 'Ẩn - Giá nhập', readOnly: true, visible: false }
  ];

  const hotData = data.map((row, idx) => ({ stt: idx + 1, ...row }));

  hotInstance = new Handsontable(container, {
    data: hotData,
    columns: columns,
    colHeaders: columns.map(col => col.title),
    rowHeaders: true,
    width: '100%',
    height: 550,
    licenseKey: 'non-commercial-and-evaluation',
    stretchH: 'all',
    manualColumnResize: true,
    readOnly: true,
    hiddenColumns: { columns: [15], indicators: false }
  });
};

window.onload = () => {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("tuNgay").value = today;
  document.getElementById("denNgay").value = today;
};
