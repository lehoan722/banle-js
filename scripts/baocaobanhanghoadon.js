let hot;
let currentPage = 0;
let pageSize = 1000;

function readFilter() {
  return {
    tu_ngay: document.getElementById("tu_ngay").value,
    den_ngay: document.getElementById("den_ngay").value,
    khachhang: document.getElementById("khachhang").value || null,
    nhanvien: document.getElementById("nhanvien").value || null,
    diadiem: document.getElementById("diadiem").value || null,
    loaihd: document.getElementById("loaihd").value || null,
    masp: document.getElementById("masp").value || null,
    tonghop_ngay: document.getElementById("tonghop_ngay").checked,
    page_index: currentPage,
    page_size: pageSize
  };
}

async function taiDuLieu() {
  const filter = readFilter();
  const { data, error } = await supabase.rpc('baocaobanhanghoadon_paged', filter);

  if (error) return alert("❌ Lỗi tải dữ liệu: " + error.message);

  if (!hot) initTable();
  hot.loadData(data);
  document.getElementById("pageInfo").innerText = `Trang ${currentPage + 1}`;
}

function initTable() {
  const container = document.getElementById('hotContainer');
  hot = new Handsontable(container, {
    data: [],
    rowHeaders: true,
    colHeaders: [
      "Ngày", "Số HĐ", "Địa điểm", "Loại HĐ", "Nhân viên", "Khách hàng",
      "Mã SP", "Tên SP", "Size", "SL", "Giá", "Thành tiền", "KM"
    ],
    columns: [
      { data: "ngay" }, { data: "sohd" }, { data: "diadiem" }, { data: "loaihd" },
      { data: "tennv" }, { data: "khachhang" }, { data: "masp" }, { data: "tensp" },
      { data: "size" }, { data: "soluong", type: "numeric" },
      { data: "gia", type: "numeric" }, { data: "thanhtien", type: "numeric" },
      { data: "km", type: "numeric" }
    ],
    licenseKey: 'non-commercial-and-evaluation'
  });
}

function prevPage() {
  if (currentPage > 0) {
    currentPage--;
    taiDuLieu();
  }
}

function nextPage() {
  currentPage++;
  taiDuLieu();
}

async function xuatExcelToanBo() {
  const filter = readFilter();
  filter.page_index = 0;
  filter.page_size = 100000; // lấy hết tối đa 100k dòng

  const { data, error } = await supabase.rpc('baocaobanhanghoadon_paged', filter);
  if (error) return alert("❌ Lỗi xuất Excel: " + error.message);
  if (!data || data.length === 0) return alert("❌ Chưa có dữ liệu để xuất!");

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BaoCaoHoaDon");
  XLSX.writeFile(wb, "baocaobanhang.xlsx");
}

// Khởi tạo ngày mặc định khi tải trang
window.onload = () => {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById("tu_ngay").value = today;
  document.getElementById("den_ngay").value = today;
  taiDuLieu();
};
