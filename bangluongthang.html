<!DOCTYPE html>
<html lang="vi">

<head>
  <meta charset="UTF-8" />
  <title>Bảng lương tháng - tất cả nhân viên</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <!-- Handsontable CSS -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/handsontable@14.3.0/dist/handsontable.full.min.css" />

  <style>
    body {
      font-family: sans-serif;
      margin: 0;
      padding: 8px;
      background: #f5f5f5;
    }

    h1,
    h2 {
      margin: 0;
      padding: 0;
    }

    .card {
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
      padding: 8px 12px;
      margin-bottom: 8px;
    }

    label {
      font-size: 13px;
      margin-right: 4px;
    }

    input[type="date"],
    input[type="number"],
    select {
      padding: 2px 4px;
      font-size: 13px;
      margin-right: 4px;
    }

    button {
      padding: 4px 10px;
      font-size: 13px;
      cursor: pointer;
    }

    #status {
      font-size: 12px;
      margin-top: 4px;
    }

    .hot-container {
      height: 360px;
      /* hoặc 400px tuỳ bạn */
      overflow: auto;
      margin-top: 6px;
      background: #fff;
      /* cho dễ nhìn, không bắt buộc */
      border: 1px solid #ddd;
      border-radius: 4px;
    }


    table {
      border-collapse: collapse;
      width: 100%;
      font-size: 12px;
    }

    th,
    td {
      border: 1px solid #ddd;
      padding: 3px 4px;
      text-align: right;
    }

    th:first-child,
    td:first-child {
      text-align: left;
    }

    th:nth-child(2),
    td:nth-child(2) {
      text-align: left;
    }

    .table-secondary {
      background-color: #e9ecef;
    }

    .fw-bold {
      font-weight: bold;
    }

    .mt-2 {
      margin-top: 8px;
    }

    /* Cho tiêu đề cột Handsontable được xuống dòng */
    .handsontable .ht_clone_top th .relative {
      white-space: normal !important;
      line-height: 1.2;
    }
  </style>
</head>

<body>
  <!-- Bọc toàn bộ app bằng app-container -->
  <div id="app-container">

    <!-- KHUNG TRÊN: THÔNG TIN TÍNH LƯƠNG -->
    <div class="card">
      <h1 style="font-size: 16px; text-align: center; margin-bottom: 8px">
        Bảng lương tháng - tất cả nhân viên
      </h1>

      <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center">
        <div>
          <label for="tu_ngay">Từ ngày:</label>
          <input type="date" id="tu_ngay" />
        </div>

        <div>
          <label for="den_ngay">Đến ngày:</label>
          <input type="date" id="den_ngay" />
        </div>

        <div>
          <label for="diadiem">Cơ sở:</label>
          <select id="diadiem">
            <option value="">Tất cả</option>
            <option value="cs1">cs1</option>
            <option value="cs2">cs2</option>
          </select>
        </div>
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px">
        <div>
          <label for="luong_gio">Lương/giờ (VND):</label>
          <input type="number" id="luong_gio" value="26000" />
        </div>

        <div>
          <label for="khoan_gio">Khoán doanh thu / giờ (VND):</label>
          <input type="number" id="khoan_gio" value="700000" />
        </div>

        <div>
          <label for="pct_thuong">% thưởng trên phần vượt khoán:</label>
          <input type="number" id="pct_thuong" value="1" step="0.1" />
        </div>

        <div style="align-self: flex-end">
          <button id="btn-tai">Tải bảng lương</button>
        </div>
      </div>

      <div id="status"></div>
    </div>

    <!-- DANH SÁCH LƯƠNG -->

    <div class="card">
      <h2 style="font-size: 14px; margin-bottom: 4px">Danh sách lương</h2>

      <!-- Bảng lương dùng Handsontable -->
      <div id="hotLuong" class="hot-container"></div>

      <!-- Bảng HTML cũ: luôn hiển thị (fallback) -->
      <div style="max-height: 480px; overflow: auto; margin-top: 6px; display:none;">
        <table>
          <thead>
            <tr>
              <th>Mã NV</th>
              <th>Tên NV</th>
              <th>Cơ sở</th>
              <th>Giờ công (thực)</th>
              <th>Giờ trừ TANCA_LỊCH</th>
              <th>Giờ tính lương</th>
              <th>Doanh thu</th>
              <th>Khoán / giờ</th>
              <th>Khoán theo giờ công</th>
              <th>Doanh thu vượt khoán</th>
              <th>Thưởng vượt khoán</th>
              <th>Lương cứng</th>
              <th>Tổng lương</th>
            </tr>
          </thead>
          <tbody id="tbody-bangluong"></tbody>
        </table>
      </div>
    </div>

    <!-- BẢNG CÔNG THÁNG -->
    <div class="card">
      <h2 style="font-size: 14px; margin-bottom: 4px">BẢNG CÔNG THÁNG</h2>

      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px">
        <div>
          <label for="bc-thang">Tháng:</label>
          <input type="number" id="bc-thang" min="1" max="12" value="1" style="width: 60px" />
        </div>
        <div>
          <label for="bc-nam">Năm:</label>
          <input type="number" id="bc-nam" value="2025" style="width: 80px" />
        </div>
        <div>
          <button onclick="taiBangCong()">Tải bảng công</button>
        </div>
      </div>

      <!-- Bảng công dùng Handsontable -->
      <div id="hotBangCong" class="hot-container"></div>

      <!-- Bảng HTML cũ: ẩn, chỉ dùng làm fallback -->
      <div class="table-responsive mt-2" style="max-height: 500px; overflow: auto; display:none;">
        <table class="table table-bordered table-sm">
          <thead id="thead-bangcong" class="table-dark"></thead>
          <tbody id="tbody-bangcong"></tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Hàng rào đăng nhập chuẩn cho Bảng lương tháng -->
  <script type="module">
    import { khoiTaoDangNhapDungChung } from "./scripts/authModule.js";

    khoiTaoDangNhapDungChung({
      appContainerId: 'app',        // hoặc 'app-container' tuỳ bạn đang dùng id nào
      macDinhDiaDiem: '',
      tuDongKhoaCoSo: false,
      loginApiPath: '/api/login-cs1',

      async onLoginSuccess(nv, ctx) {
        // 1. Kiểm tra quyền xem trang theo bảng phân quyền
        if (window.kiemTraQuyenXemTrang) {
          const ok = await window.kiemTraQuyenXemTrang("bangluongthang.html");
          if (!ok) {
            // kiemTraQuyenXemTrang đã tự hiển thị thông báo cấm truy cập
            return;
          }
        }

        // 2. Nếu qua được bước 1 -> cho hiển thị app & load dữ liệu
        const appDiv = document.getElementById('app');
        if (appDiv) appDiv.style.display = '';

        if (window.taiBangLuong) {
          await window.taiBangLuong();
        }
        if (window.taiBangCong) {
          await window.taiBangCong();
        }
      }
    });

    window.kiemTraQuyenXemTrang = kiemTraQuyenXemTrang;
  </script>


  <!-- Handsontable JS -->
  <script src="https://cdn.jsdelivr.net/npm/handsontable@14.3.0/dist/handsontable.full.min.js"></script>

  <!-- Script xử lý -->
  <script type="module" src="./scripts/bangluongthang.js"></script>
</body>

</html>
