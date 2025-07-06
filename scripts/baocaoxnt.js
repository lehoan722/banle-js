import { supabase } from "./supabaseClient.js";
let hotInstance;


// Hàm đăng nhập Supabase Auth
window.dangNhap = async function () {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const status = document.getElementById("authStatus");
  status.textContent = "";

  if (!email || !password) {
    status.textContent = "Nhập đầy đủ email và mật khẩu!";
    return;
  }

  const { error, data } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    status.textContent = "Sai email hoặc mật khẩu!";
    return;
  }

  status.style.color = "green";
  status.textContent = "Đăng nhập thành công!";
  document.getElementById("authBox").style.display = "none";
}

// Hàm kiểm tra đăng nhập và truy vấn báo cáo
window.taiBaoCaoXNT = async function () {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    alert("Bạn cần đăng nhập trước khi xem báo cáo!");
    document.getElementById("authBox").style.display = "block";
    return;
  }

  const tuNgay = document.getElementById("tuNgay").value;
  const denNgay = document.getElementById("denNgay").value;
  const nhomhang = document.getElementById("nhomhang").value.trim() || null;
  const loaihang = document.getElementById("loaihang").value.trim() || null;
  const mausac = document.getElementById("mausac").value.trim() || null;
  const size = document.getElementById("size").value.trim() || null;
  const masp = document.getElementById("masp").value.trim() || null;

  if (!tuNgay || !denNgay) return alert("Chọn đủ từ ngày và đến ngày!");

  // Lấy tên function từ dropdown
  const functionName = document.getElementById("selectFunction")?.value || "baocaoxnt";

  const params = {
    tu_ngay: tuNgay,
    den_ngay: denNgay,
    nhomhang_filter: nhomhang,
    loaihang_filter: loaihang,
    mausac_filter: mausac,
    size_filter: size,
    masp_filter: masp
  };
  console.log(`🔎 Gửi filter báo cáo XNT [${functionName}]:`, params);

  const { data, error } = await supabase.rpc(functionName, params);

  if (error) {
    console.error("❌ Lỗi gọi RPC Supabase:", error);
  } else {
    console.log("✅ Dữ liệu báo cáo XNT trả về:", data);
  }

  const container = document.getElementById('hot'); // hot là id div bạn sẽ thêm ở HTML
  if (hotInstance) {
    hotInstance.destroy();
    hotInstance = null;
  }

  if (error) {
    container.innerHTML = `<div style="color: red;">Lỗi: ${error.message}</div>`;
    return;
  }
  if (!data || !data.length) {
    container.innerHTML = `<div style="color: orange;">Không có dữ liệu</div>`;
    return;
  }

  // Chuẩn bị tiêu đề cột và dữ liệu cho Handsontable
  const columns = [
    { data: 'stt', type: 'numeric', readOnly: true, width: 50 },
    { data: 'masp', title: 'Mã hàng', readOnly: true },
    { data: 'tensp', title: 'Tên hàng', readOnly: true },
    { data: 'dvt', title: 'DVT', readOnly: true },
    { data: 'nhomhang', title: 'Nhóm hàng', readOnly: true },
    { data: 'mausac', title: 'Màu sắc', readOnly: true },
    { data: 'size', title: 'Kích cỡ', readOnly: true },
    { data: 'dauky', title: 'Đầu kỳ', type: 'numeric', readOnly: true },
    { data: 'tongnhap', title: 'Tổng nhập', type: 'numeric', readOnly: true },
    { data: 'tongxuat', title: 'Tổng xuất', type: 'numeric', readOnly: true },
    { data: 'cuoiky', title: 'Cuối kỳ', type: 'numeric', readOnly: true },
    { data: 'gianhap', title: 'Giá nhập', type: 'numeric', readOnly: true, numericFormat: { pattern: "0,0" } },
    { data: 'giale', title: 'Giá lẻ', type: 'numeric', readOnly: true, numericFormat: { pattern: "0,0" } },
  ];

  // Map dữ liệu, thêm STT
  const hotData = data.map((row, idx) => ({
    stt: idx + 1,
    ...row
  }));

  hotInstance = new Handsontable(container, {
    data: hotData,
    columns: columns,
    colHeaders: columns.map(c => c.title || c.data),
    rowHeaders: true,
    width: '100%',
    height: 480,
    licenseKey: 'non-commercial-and-evaluation',
    stretchH: 'all',
    manualColumnResize: true,
    manualRowResize: true,
    filters: true,
    dropdownMenu: true,
    columnSorting: true,
    readOnly: true,
    autoWrapRow: true,
    wordWrap: true
  });
};


// Khi load trang, kiểm tra trạng thái đăng nhập và set ngày mặc định
  window.onload = async function () {
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('tuNgay').value = today;
    document.getElementById('denNgay').value = today;

    // Ẩn/hiện form đăng nhập tuỳ trạng thái
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      document.getElementById("authBox").style.display = "none";
    } else {
      document.getElementById("authBox").style.display = "block";
    }
  };
