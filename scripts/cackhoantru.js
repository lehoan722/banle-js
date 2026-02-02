<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Các khoản trừ nhân viên</title>

  <!-- Handsontable CSS -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/handsontable@14.3.0/dist/handsontable.full.min.css" />

  <style>
    body { font-family: sans-serif; margin: 0; padding: 8px; background: #f5f5f5; }
    h1, h2 { margin: 0; padding: 0; }
    .card { background:#fff; border:1px solid #ddd; border-radius:6px; padding:10px; margin-bottom:8px; }
    .row { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
    label { font-size:12px; color:#333; margin-right:4px; white-space:nowrap; }
    input, select { padding:4px 6px; font-size:12px; }
    button { padding:4px 10px; font-size:13px; cursor:pointer; }
    #status { font-size:12px; margin-top:6px; }
    .hot-container { height: 520px; overflow:auto; margin-top:8px; background:#fff; border:1px solid #ddd; border-radius:4px; }
    .muted { color:#666; font-size:12px; }
  </style>
</head>

<body>
  <div class="card">
    <h1 style="font-size:16px; margin-bottom:6px;">Nhập các khoản trừ (Ứng lương / Phạt / Trừ khác)</h1>

    <div class="row">
      <div>
        <label for="ngay_phatsinh">Ngày phát sinh:</label>
        <input type="date" id="ngay_phatsinh" />
      </div>

      <div>
        <label for="diadiem">Cơ sở:</label>
        <select id="diadiem">
          <option value="">(trống / tất cả)</option>
          <option value="cs1">cs1</option>
          <option value="cs2">cs2</option>
        </select>
      </div>

      <div>
        <label for="manv">Mã NV:</label>
        <input id="manv" type="text" placeholder="VD: NV01" style="width:110px;" />
      </div>

      <div>
        <label for="tennv">Tên NV:</label>
        <input id="tennv" type="text" placeholder="tự điền hoặc nhập tay" style="width:160px;" />
      </div>

      <div>
        <label for="loai_khoan_tru">Loại:</label>
        <select id="loai_khoan_tru">
          <option value="UNG_LUONG">Ứng lương</option>
          <option value="KO_BAY_MAU">Phạt kỷ luật</option>
          <option value="VAO_CA_MUON">Phạt kỷ luật</option>
          <option value="KO_TAN_CA">Phạt kỷ luật</option>

          <option value="TRU_KHAC" selected>Trừ khác</option>
        </select>
      </div>

      <div>
        <label for="so_tien">Số tiền (VND):</label>
        <input id="so_tien" type="number" min="1" step="1000" placeholder="VD: 200000" style="width:130px;" />
      </div>

      <div style="flex:1; min-width:220px;">
        <label for="ghi_chu">Ghi chú:</label>
        <input id="ghi_chu" type="text" placeholder="VD: Ứng ngày 05/02" style="width:100%;" />
      </div>

      <div style="display:flex; gap:8px; align-items:center;">
        <button id="btn-luu">Lưu khoản trừ</button>
        <button id="btn-moi" type="button">Làm mới form</button>
        <button id="btn-xoa" type="button" style="display:none;">Xóa dòng đang chọn</button>
      </div>
    </div>

    <div class="muted" style="margin-top:6px;">
      Tip: Mình khuyến nghị lưu <b>so_tien</b> là số dương (khoản bị trừ). Trang lương sẽ lấy SUM để trừ.
    </div>

    <div id="status"></div>
  </div>

  <div class="card">
    <h2 style="font-size:14px; margin-bottom:6px;">Danh sách khoản trừ</h2>

    <div class="row">
      <div>
        <label for="tu_ngay">Từ ngày:</label>
        <input type="date" id="tu_ngay" />
      </div>
      <div>
        <label for="den_ngay">Đến ngày:</label>
        <input type="date" id="den_ngay" />
      </div>
      <div>
        <label for="loc_diadiem">Cơ sở:</label>
        <select id="loc_diadiem">
          <option value="">Tất cả</option>
          <option value="cs1">cs1</option>
          <option value="cs2">cs2</option>
        </select>
      </div>
      <div>
        <label for="loc_manv">Mã NV:</label>
        <input id="loc_manv" type="text" placeholder="lọc theo manv" style="width:120px;" />
      </div>
      <div style="align-self:flex-end;">
        <button id="btn-tai">Tải danh sách</button>
      </div>
    </div>

    <div id="hotKhoanTru" class="hot-container"></div>
  </div>

  <!-- Handsontable JS -->
  <script src="https://cdn.jsdelivr.net/npm/handsontable@14.3.0/dist/handsontable.full.min.js"></script>

  <!-- Script xử lý -->
  <script type="module" src="./scripts/cackhoantru.js"></script>
</body>
</html>
