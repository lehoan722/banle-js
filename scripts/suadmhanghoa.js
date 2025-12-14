import { supabase } from './supabaseClient.js';
import { backupAllTablesToZip, backupAllTablesToExcel } from './backup.js';
import { khoiTaoDangNhapDungChung, dangXuatDungChung } from './authModule.js';

// ==== Khai báo các trường bảng danh mục hàng hóa (giống bảng SQL) ====
const COLS = [
  { name: "masp", label: "Mã sản phẩm" },
  { name: "tensp", label: "Tên sản phẩm" },
  { name: "gianhap", label: "Giá nhập" },
  { name: "giale", label: "Giá lẻ" },
  { name: "giasi", label: "Giá sỉ" },
  { name: "mangan", label: "Mã ngắn" },
  { name: "nhomhang", label: "Nhóm hàng" },
  { name: "nhacc", label: "Nhà CC" },
  { name: "chungloai", label: "Chủng loại" },
  { name: "vitrikho1", label: "Vị trí kho 1" },
  { name: "vitrikho2", label: "Vị trí kho 2" },
  { name: "mausac", label: "Màu sắc" },
  { name: "khuyenmai", label: "Khuyến mãi" },
  { name: "quanlykichco", label: "Quản lý kích cỡ" },
  { name: "active", label: "Đang dùng?" },
  { name: "ngaysua", label: "Ngày sửa" },
  { name: "ngaykiem", label: "Ngày kiểm" },
  { name: "dvt", label: "ĐVT" },
  { name: "nhapdau", label: "Ngày nhập đầu" },
  { name: "treomaucs1", label: "treo mau cs1" },
  { name: "treomaucs2", label: "treo mau cs2" },
  { name: "vitrikho3", label: "Vị trí kho 3" },
  

];

// ==== Render dropdown chọn cột cần ghi ====
function renderColSelect() {
  let html = `<option value="" selected disabled>-- Chọn mục cần ghi --</option>` +
    COLS
      .filter(c => c.name !== "masp")
      .map(c => `<option value="${c.name}">${c.label}</option>`)
      .join("");

  const colSelect = document.getElementById('col-select');
  if (colSelect) {
    colSelect.innerHTML = html;
  }
}

// ==== Table Handsontable (chỉ gồm masp, cột cần sửa, trạng thái) ====
let hot;

function initTable(colname = 'vitrikho1') {
  const colInfo = COLS.find(c => c.name === colname);
  const colLabel = colInfo ? colInfo.label : colname;

  const colHeaders = ['Mã sản phẩm', colLabel, 'Trạng thái'];
  const columns = [
    { data: 'masp', type: 'text', width: 150 },
    { data: colname, type: 'text', width: 150 },
    { data: 'trangthai', type: 'text', width: 110 }
  ];

  const container = document.getElementById('hot');
  if (!container) return;

  if (hot) hot.destroy();

  hot = new Handsontable(container, {
    data: Array.from({ length: 30 }, () => ({ masp: null, [colname]: null, trangthai: null })),
    columns,
    colHeaders,
    rowHeaders: true,
    minSpareRows: 1,
    width: '100%',
    height: 420,
    stretchH: 'all',
    manualColumnResize: true,
    licenseKey: 'non-commercial-and-evaluation',
    cells: function (row, col) {
      const cellProperties = {};
      if (col === 2) {
        const val = this.instance.getDataAtCell(row, col);
        if (val === "OK") cellProperties.className = "trangthai-ok";
        if (val === "BỎ QUA") cellProperties.className = "trangthai-boqua";
        if (val === "LỖI") cellProperties.className = "trangthai-loi";
        if (val === "MÃ KHÔNG TỒN TẠI") cellProperties.className = "trangthai-khongtontai";
        if (val === "CHƯA CÓ GIÁ TRỊ") cellProperties.className = "trangthai-chuacovitri";
      }
      return cellProperties;
    }
  });
}

// ==== Sự kiện giao diện chính ====
function attachUIEvents() {
  const colSelect = document.getElementById('col-select');
  const btnReset = document.getElementById('btn-reset');
  const btnKiemTra = document.getElementById('btn-kiemtra');
  const btnXoa = document.getElementById('btn-xoa');
  const btnBackup = document.getElementById('btn-backup');
  const btnLuu = document.getElementById('btn-luu');
  const previewEl = document.getElementById('preview');

  if (colSelect) {
    colSelect.onchange = function () {
      initTable(this.value);
      if (previewEl) previewEl.innerHTML = "";
    };
  }

  if (btnReset) {
    btnReset.onclick = function () {
      initTable(colSelect?.value || 'vitrikho1');
      if (previewEl) previewEl.innerHTML = "";
    };
  }

  if (btnKiemTra) {
    btnKiemTra.onclick = kiemTraViTri;
  }

  if (btnXoa) {
    btnXoa.onclick = xoaSanPhamDaCoViTri;
  }

  if (btnBackup) {
    btnBackup.onclick = backupTruocKhiGhi;
  }

  if (btnLuu) {
    btnLuu.onclick = luuDuLieu;
  }
}

// ==== Kiểm tra vị trí ====
async function kiemTraViTri() {
  const colSelect = document.getElementById('col-select');
  const previewEl = document.getElementById('preview');
  if (!colSelect) return;

  const colname = colSelect.value;
  if (!colname) {
    alert("Bạn cần chọn mục cần ghi vào trước khi thực hiện thao tác này!");
    return;
  }

  if (!hot) return;
  hot.updateSettings({ cells: hot.getSettings().cells });

  const allRows = hot.getSourceData();
  const uniqueMasps = [];
  const uniqueRows = [];
  const seen = {};

  for (let row of allRows) {
    const masp = (row.masp || "").toString().trim().toUpperCase();
    if (masp && !seen[masp]) {
      seen[masp] = true;
      uniqueMasps.push(masp);
      uniqueRows.push({ masp, [colname]: null, trangthai: null });
    }
  }

  if (uniqueMasps.length === 0) {
    alert("Nhập mã sản phẩm để kiểm tra!");
    return;
  }

  hot.loadData(uniqueRows);

  const { data: found, error } = await supabase
    .from('dmhanghoa')
    .select(`masp,${colname}`)
    .in('masp', uniqueMasps);

  if (error) {
    alert('Lỗi kết nối Supabase!');
    return;
  }

  const maspMap = {};
  found.forEach(row => { maspMap[row.masp.toUpperCase()] = row[colname]; });

  hot.batch(() => {
    for (let r = 0; r < hot.countRows(); r++) {
      const masp = (hot.getDataAtCell(r, 0) || "").toString().trim().toUpperCase();
      hot.setDataAtCell(r, 0, masp);

      if (!masp) {
        hot.setDataAtCell(r, 1, null);
        hot.setDataAtCell(r, 2, null);
        continue;
      }

      if (typeof maspMap[masp] === "undefined") {
        hot.setDataAtCell(r, 1, null);
        hot.setDataAtCell(r, 2, "MÃ KHÔNG TỒN TẠI");
      } else if (maspMap[masp]) {
        hot.setDataAtCell(r, 1, maspMap[masp]);
        hot.setDataAtCell(r, 2, "BỎ QUA");
      } else {
        hot.setDataAtCell(r, 1, null);
        hot.setDataAtCell(r, 2, "CHƯA CÓ GIÁ TRỊ");
      }
    }
  });

  if (previewEl) {
    previewEl.innerHTML = `<span>✅ Đã kiểm tra xong.</span>`;
  }
  hot.updateSettings({ cells: hot.getSettings().cells });
}

// ==== Xóa sản phẩm đã có vị trí (và dòng trống) ====
function xoaSanPhamDaCoViTri() {
  const previewEl = document.getElementById('preview');
  if (!hot) return;

  let tableData = hot.getSourceData();
  tableData = tableData.filter(row =>
    row.masp && row.trangthai !== "BỎ QUA"
  );

  if (tableData.length === 0) {
    tableData.push({ masp: null, vitrikho1: null, trangthai: null });
  }

  hot.loadData(tableData);
  hot.updateSettings({ cells: hot.getSettings().cells });

  if (previewEl) {
    previewEl.innerHTML = `<span>👉 Nhập vị trí cho các sản phẩm chưa có vị trí hoặc mã mới.</span>`;
  }
}

// ==== Backup danh mục ====
async function backupTruocKhiGhi() {
  const overlay = document.getElementById('backup-overlay');
  if (!confirm("Bạn muốn backup toàn bộ dữ liệu các bảng chính trước khi ghi?")) return;

  if (overlay) overlay.style.display = "block";

  try {
    await backupAllTablesToZip();
    alert("Đã backup toàn bộ các bảng quan trọng!\nHãy di chuyển file vừa tải về vào thư mục D:\\backup để đảm bảo an toàn!");
  } catch (err) {
    alert("Lỗi backup: " + err.message);
  } finally {
    if (overlay) overlay.style.display = "none";
  }
}

// 1) Thêm hàm chuẩn hóa giá trị trước khi ghi
function resolveUpdateValue(colname, rawVal) {
  // Trả về null nếu người dùng để trống (xóa dữ liệu cũ)
  if (rawVal === undefined || rawVal === null) return null;
  const s = rawVal.toString().trim();
  if (s === '') return null;

  // Cột kiểu ngày dùng chuẩn hóa sẵn có
  if (["ngaysua", "ngaykiem", "nhapdau"].includes(colname)) {
    return normalizeDate(s); // normalizeDate đã có sẵn, rỗng -> null
  }

  // Nếu có cột boolean (vd: active, quanlykichco) muốn hỗ trợ:
  if (["active", "quanlykichco"].includes(colname)) {
    // chấp nhận true/false, 1/0, "true"/"false"
    if (s === '1' || s.toLowerCase() === 'true') return true;
    if (s === '0' || s.toLowerCase() === 'false') return false;
    // để trống đã xử lý ở trên -> null
  }

  // Mặc định: giữ nguyên chuỗi đã trim
  return s;
}

// ==== Lưu dữ liệu (PATCH từng dòng, chia chunk 100 dòng) ====
async function luuDuLieu() {
  const colSelect = document.getElementById('col-select');
  const previewEl = document.getElementById('preview');
  if (!colSelect) return;

  const colname = colSelect.value;
  if (!colname) {
    alert("Bạn cần chọn mục cần ghi vào trước khi thực hiện thao tác này!");
    return;
  }

  const colLabel = COLS.find(c => c.name === colname)?.label || colname;

  if (!hot) return;

  // LẤY TOÀN BỘ DÒNG CÓ MÃ, KỂ CẢ Ô RỖNG (để cho phép xóa)
  const source = hot.getSourceData();
  let rows = source
    .map((r, rowIndex) => ({
      rowIndex,
      masp: (r.masp || '').toString().trim().toUpperCase(),
      rawVal: r[colname]
    }))
    .filter(r => r.masp); // chỉ cần có mã

  if (rows.length === 0) {
    alert("Không có dữ liệu hợp lệ để ghi.");
    return;
  }

  // Nhắc người dùng: sẽ GHI ĐÈ và có thể XÓA dữ liệu cũ (ghi null)
  if (!confirm(`⚠️ Hành động này sẽ ghi đè cột "${colLabel}" cho các mã đã nhập.\nNếu ô để trống, hệ thống sẽ xóa giá trị cũ (ghi NULL).\nBạn chắc chắn muốn tiếp tục?`)) {
    if (previewEl) {
      previewEl.innerHTML = `<span style="color:orange;">⏹️ Đã hủy thao tác ghi đè.</span>`;
    }
    return;
  }

  const chunkSize = 100;
  const chunks = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize));
  }

  let success = 0, fail = 0, errorMsg = [];

  for (let i = 0; i < chunks.length; i++) {
    if (previewEl) {
      previewEl.innerHTML = `<span>⏳ Đang ghi nhóm ${i + 1}/${chunks.length}...</span>`;
    }

    const promises = chunks[i].map((row) => {
      const updateObj = {};
      updateObj[colname] = resolveUpdateValue(colname, row.rawVal); // rỗng -> null

      return supabase
        .from('dmhanghoa')
        .update(updateObj)
        .eq('masp', row.masp)
        .select()
        .then(({ data, error }) => ({
          rowIndex: row.rowIndex,
          masp: row.masp,
          success: !error && data && data.length === 1,
          error: error?.message || (!data?.length && 'Không có dòng nào được cập nhật (mã không tồn tại)') || null
        }));
    });

    const results = await Promise.all(promises);

    results.forEach(res => {
      if (res.success) {
        hot.setDataAtCell(res.rowIndex, 2, "OK");     // dùng rowIndex gốc
        success++;
      } else {
        hot.setDataAtCell(res.rowIndex, 2, "LỖI");    // dùng rowIndex gốc
        fail++;
        errorMsg.push(`Dòng ${res.rowIndex + 1} (${res.masp}): ${res.error}`);
      }
    });
  }

  let html = `<span>✅ Đã lưu xong: <b style="color:#e53935">${success} OK</b> &nbsp; <b style="color:orange">${fail} lỗi</b></span>`;
  if (fail) {
    html += `<br><details><summary>Xem chi tiết lỗi</summary><div style="color:orange;text-align:left">${errorMsg.join('<br>')}</div></details>`;
  }
  if (previewEl) {
    previewEl.innerHTML = html;
  }
  hot.updateSettings({ cells: hot.getSettings().cells });
}

// ==== Tiện ích ====

// Chia mảng thành các nhóm nhỏ
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// Chuyển array object sang CSV
function toCSV(data) {
  if (!data.length) return '';
  const keys = Object.keys(data[0]);
  const csvRows = [
    keys.join(','), // Tiêu đề
    ...data.map(row => keys.map(k => `"${(row[k] ?? "").toString().replace(/"/g, '""')}"`).join(','))
  ];
  return csvRows.join('\r\n');
}

// Chuẩn hóa ngày tháng (dành cho các trường ngày)
function normalizeDate(val) {
  if (!val) return null;
  let m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?/);
  if (m) {
    let dd = m[1].padStart(2, '0');
    let mm = m[2].padStart(2, '0');
    let yyyy = m[3];
    let h = m[4] || '00', mi = m[5] || '00';
    return `${yyyy}-${mm}-${dd} ${h.padStart(2, '0')}:${mi.padStart(2, '0')}:00`;
  }
  if (["null", "NULL", "NaN", "undefined"].includes(val.toString().trim())) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val;
  return null;
}

// ==== KHỞI TẠO TRANG ====
(function initPage() {
  // Khởi tạo dropdown & bảng (ẩn phía sau, chờ đăng nhập xong sẽ hiện app-container)
  renderColSelect();
  initTable();
  attachUIEvents();

  // Khởi tạo module đăng nhập dùng chung (mã NV + mật khẩu NV)
  khoiTaoDangNhapDungChung({
    appContainerId: 'app-container',
    macDinhDiaDiem: 'cs1',        // mặc định cơ sở 1 (nếu cần đổi thì sửa ở đây)
    tuDongKhoaCoSo: true,         // khóa dropdown cơ sở để tránh nhầm
    loginApiPath: '/api/login-cs1', // API login backend bạn đang dùng cho các trang khác
    onLoginSuccess: async (nhanvien, context) => {
      // CHỈ CHO ADMIN VÀO TRANG NÀY
      if (!nhanvien.is_admin) {
        alert('Bạn không có quyền truy cập trang SỬA DANH MỤC HÀNG HÓA.\nChỉ admin mới được phép chỉnh sửa!');
        await dangXuatDungChung({ appContainerId: 'app-container' });
        return;
      }
      console.log('Admin đăng nhập thành công vào suadmhanghoa:', nhanvien.manv);
    }
  });
})();
