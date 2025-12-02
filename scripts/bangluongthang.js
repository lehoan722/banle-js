// bangluongthang.js - Bảng lương tháng tất cả nhân viên
import { supabase } from "./supabaseClient.js";

const tuNgayInput = document.getElementById("tu_ngay");
const denNgayInput = document.getElementById("den_ngay");
const diadiemSelect = document.getElementById("diadiem");
const luongGioInput = document.getElementById("luong_gio");
const khoanGioInput = document.getElementById("khoan_gio");
const pctThuongInput = document.getElementById("pct_thuong");
const btnTai = document.getElementById("btn-tai");
const tbodyLuong = document.getElementById("tbody-bangluong");
const statusEl = document.getElementById("status");

// Container Handsontable
const hotLuongContainer = document.getElementById("hotLuong");
const hotBangCongContainer = document.getElementById("hotBangCong");

// Biến lưu instance Handsontable
let hotLuong = null;
let hotBangCong = null;

// =================== HÀM DÙNG CHUNG ===================

// =============================
// KIỂM SOÁT QUYỀN TRUY CẬP TRANG
// =============================
import { supabase } from "./supabaseClient.js";
import * as authModule from "./authModule.js";

async function kiemTraQuyenXemTrang(pathTrang) {
  // 1. Lấy nhân viên đang đăng nhập
  const nv = await authModule.getCurrentUserInfo();

  if (!nv || !nv.manv) {
    hienCamTruyCap("Bạn chưa đăng nhập.");
    return false;
  }

  // 2. Lấy danh sách trang được phép xem
  const { data, error } = await supabase.rpc("get_pages_for_manv", {
    p_manv: nv.manv
  });

  if (error) {
    hienCamTruyCap("Lỗi kiểm tra phân quyền: " + error.message);
    return false;
  }

  const dsTrang = data?.map(r => r.path) || [];

  // 3. Nếu không phải admin và không nằm trong danh sách → CẤM
  if (!nv.is_admin && !dsTrang.includes(pathTrang)) {
    hienCamTruyCap(
      `Không có quyền truy cập trang này.<br> Mã NV: ${nv.manv} – ${nv.tennv}`
    );
    return false;
  }

  // 4. Cho phép hiển thị trang
  document.getElementById("app").style.display = "";
  return true;
}

// Hàm hiện thông báo cấm truy cập
function hienCamTruyCap(msg) {
  document.body.innerHTML = `
        <div style="padding:24px;color:#b00020;font-size:20px;font-weight:bold">
            ⛔ Không có quyền truy cập<br>
            <div style="font-size:16px;margin-top:8px;color:#444">${msg}</div>
        </div>
    `;
}

// =============================
// GỌI KIỂM TRA
// =============================
kiemTraQuyenXemTrang("bangluongthang.html");


function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function setDefaultDates() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  tuNgayInput.value = toIsoDate(firstDay);
  denNgayInput.value = toIsoDate(lastDay);
}

function fmt(n, d = 0) {
  if (n == null || Number.isNaN(Number(n))) return "0";
  return Number(n).toLocaleString("vi-VN", {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  });
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg || "";
  statusEl.style.color = isError ? "#c62828" : "#555";
}

// ============== RENDER HANDSONTABLE LƯƠNG ==============

// ============== RENDER HANDSONTABLE LƯƠNG ==============
function renderLuongHot(data) {
  if (!hotLuongContainer) return;
  const HOT = window.Handsontable;
  if (!HOT) {
    console.error("Handsontable chưa được nạp.");
    return;
  }

  // Tiêu đề có xuống dòng (\n)
  const colHeaders = [
    "Mã NV",
    "Tên NV",
    "Cơ sở",
    "Giờ công (thực)",
    "Giờ trừ TANCA_LỊCH",
    "Giờ tính lương",
    "Doanh thu",
    "Khoán / giờ",
    "Khoán theo giờ công",
    "Doanh thu vượt khoán",
    "Thưởng vượt khoán",
    "Lương cứng",
    "Tổng lương",
    "Lương/1 giờ"
  ];

  // Kiểu dữ liệu từng cột
  const columns = [
    { data: 0, type: "text" },
    { data: 1, type: "text" },
    { data: 2, type: "text" },
    { data: 3, type: "numeric", numericFormat: { pattern: "0.00" } },
    { data: 4, type: "numeric", numericFormat: { pattern: "0.00" } },
    { data: 5, type: "numeric", numericFormat: { pattern: "0.00" } },
    { data: 6, type: "numeric", numericFormat: { pattern: "0,0" } },
    { data: 7, type: "numeric", numericFormat: { pattern: "0,0" } },
    { data: 8, type: "numeric", numericFormat: { pattern: "0,0" } },
    { data: 9, type: "numeric", numericFormat: { pattern: "0,0" } },
    { data: 10, type: "numeric", numericFormat: { pattern: "0,0" } },
    { data: 11, type: "numeric", numericFormat: { pattern: "0,0" } },
    { data: 12, type: "numeric", numericFormat: { pattern: "0,0" } },
    // Lương/1 giờ
    { data: 13, type: "numeric", numericFormat: { pattern: "0,0" } }
  ];

  // 👇 Độ rộng từng cột (bạn muốn chỉnh thì chỉ sửa mảng này)
  const colWidths = [
    70,   // Mã NV
    90,  // Tên NV
    50,   // Cơ sở
    70,   // Giờ công (thực)
    70,   // Giờ trừ TANCA_LỊCH
    70,   // Giờ tính lương
    70,   // Doanh thu
    70,   // Khoán / giờ
    70,   // Khoán theo giờ công
    70,   // Doanh thu vượt khoán
    70,   // Thưởng vượt khoán
    70,   // Lương cứng
    100   // Tổng lương
  ];

  // 👇 Ẩn tạm 3 cột: Doanh thu (6), Khoán theo giờ công (8), Doanh thu vượt khoán (9)
  const hiddenColsConfig = {
    columns: [6, 7, 8, 9],
    indicators: true   // hiện dấu nhỏ ở đầu để biết có cột đang ẩn
  };

  const commonSettings = {
    data,
    colHeaders,
    columns,
    colWidths,
    rowHeaders: true,
    filters: true,
    dropdownMenu: true,
    columnSorting: true,
    wordWrap: true,
    hiddenColumns: hiddenColsConfig,
    licenseKey: "non-commercial-and-evaluation"
  };

  if (!hotLuong) {
    hotLuong = new HOT(hotLuongContainer, commonSettings);
  } else {
    hotLuong.updateSettings(commonSettings);
  }
}

// ============== RENDER HANDSONTABLE BẢNG CÔNG ==============

function renderBangCongHot(colHeaders, data) {
  if (!hotBangCongContainer) return;
  const HOT = window.Handsontable;
  if (!HOT) {
    console.error("Handsontable chưa được nạp.");
    return;
  }

  if (!hotBangCong) {
    hotBangCong = new HOT(hotBangCongContainer, {
      data,
      colHeaders,
      rowHeaders: true,
      filters: true,
      dropdownMenu: true,
      columnSorting: true,
      licenseKey: "non-commercial-and-evaluation"
    });
  } else {
    hotBangCong.updateSettings({
      data,
      colHeaders
    });
  }
}

// ===================== TẢI BẢNG LƯƠNG =====================

async function taiBangLuong() {
  const tu_ngay = tuNgayInput.value;
  const den_ngay = denNgayInput.value;
  const diadiem = diadiemSelect.value || null;
  const luong_gio = parseFloat(luongGioInput.value || "0") || 0;
  const khoan_gio = parseFloat(khoanGioInput.value || "0") || 0;
  const pct_thuong = parseFloat(pctThuongInput.value || "0") || 0;

  if (!tu_ngay || !den_ngay) {
    alert("Vui lòng chọn khoảng Từ ngày - Đến ngày.");
    return;
  }

  setStatus("Đang tải dữ liệu lương...");
  tbodyLuong.innerHTML = `<tr><td colspan="13">Đang tải...</td></tr>`;

  try {
    // 1) Lấy chấm công tháng tất cả NV
    const { data: congData, error: congErr } = await supabase.rpc(
      "chamcong_tinhcong_monthly",
      {
        tu_ngay,
        den_ngay,
        p_diadiem: diadiem,
        p_manv: null
      }
    );

    if (congErr) {
      console.error("Lỗi chamcong_tinhcong_monthly:", congErr);
      setStatus("Lỗi lấy dữ liệu chấm công.", true);
      tbodyLuong.innerHTML = `<tr><td colspan="13" style="color:red;">Lỗi chamcong_tinhcong_monthly.</td></tr>`;
      return;
    }

    if (!congData || congData.length === 0) {
      setStatus("Không có dữ liệu chấm công trong khoảng này.");
      tbodyLuong.innerHTML = `<tr><td colspan="13">Không có dữ liệu.</td></tr>`;
      renderLuongHot([]); // clear HOT
      return;
    }

    // 2) Lấy danh sách mã NV từ dữ liệu chấm công
    const manvSet = new Set(congData.map(r => r.manv));
    const manvArr = Array.from(manvSet);

    // 2a) Lấy tên nhân viên từ dmnhanvien
    const mapTen = {};
    if (manvArr.length > 0) {
      const { data: nvData, error: nvErr } = await supabase
        .from("dmnhanvien")
        .select("manv, tennv")
        .in("manv", manvArr);

      if (nvErr) {
        console.error("Lỗi lấy dmnhanvien:", nvErr);
      } else if (nvData) {
        nvData.forEach(n => {
          mapTen[String(n.manv)] = n.tennv || "";
        });
      }
    }

    // 2b) Lấy DOANH THU KPI từ nv_match2h_summary_all
    const mapDoanhThuKPI = {};
    for (const manv of manvArr) {
      try {
        const { data: kpiData, error: kpiErr } = await supabase.rpc(
          "nv_match2h_summary_all",
          {
            tu_ngay,
            den_ngay,
            p_manv: manv,
            p_masp_list: null,
            p_min_price: 0,
            p_size: null
          }
        );

        if (kpiErr) {
          console.error(`Lỗi nv_match2h_summary_all cho NV ${manv}:`, kpiErr);
          mapDoanhThuKPI[manv] = 0;
        } else if (kpiData && kpiData.length > 0) {
          mapDoanhThuKPI[manv] = Number(kpiData[0].tong_doanh_thu || 0);
        } else {
          mapDoanhThuKPI[manv] = 0;
        }
      } catch (e) {
        console.error(`Lỗi RPC nv_match2h_summary_all cho ${manv}:`, e);
        mapDoanhThuKPI[manv] = 0;
      }
    }

    // 3) Dựng bảng lương + TỔNG CUỐI
    tbodyLuong.innerHTML = "";
    const bangLuongData = [];

    // Các biến tổng cho từng cột
    let sum_gio_cong = 0;
    let sum_gio_phat = 0;
    let sum_gio_tinh = 0;
    let sum_doanhthu = 0;
    let sum_khoan_gio = 0;
    let sum_khoan_thang = 0;
    let sum_tien_vuot = 0;
    let sum_tien_thuong = 0;
    let sum_luong_cung = 0;
    let sum_tong_luong = 0;

    // gom theo nhân viên
    const byManv = {};
    congData.forEach(r => {
      if (!byManv[r.manv]) byManv[r.manv] = [];
      byManv[r.manv].push(r);
    });

    for (const manv of Object.keys(byManv)) {
      const rows = byManv[manv];
      const ten = mapTen[String(manv)] || "";
      const dia = rows[0].diadiem || "";

      let gio_cong = 0;
      let so_ngay_tanca_lich = 0;
      rows.forEach(r => {
        gio_cong += Number(r.tong_gio_cong || 0);
        so_ngay_tanca_lich += Number(r.so_ngay_tanca_lich || 0);
      });

      const gio_phat_tanca_lich = so_ngay_tanca_lich * 1.0;
      const gio_tinh = Math.max(gio_cong - gio_phat_tanca_lich, 0);

      const doanhthu = Number(mapDoanhThuKPI[manv] || 0);

      const khoan_thang = gio_tinh * khoan_gio;
      const tien_vuot = doanhthu - khoan_thang;              // cho phép âm
      const tien_thuong = tien_vuot * (pct_thuong / 100.0);  // thưởng/phạt

      const luong_cung = gio_tinh * luong_gio;
      const tong_luong = luong_cung + tien_thuong;
      const luong_1_gio = gio_cong > 0 ? tong_luong / gio_cong : 0;

      // Cộng dồn
      sum_gio_cong += gio_cong;
      sum_gio_phat += gio_phat_tanca_lich;
      sum_gio_tinh += gio_tinh;
      sum_doanhthu += doanhthu;
      sum_khoan_gio += khoan_gio;
      sum_khoan_thang += khoan_thang;
      sum_tien_vuot += tien_vuot;
      sum_tien_thuong += tien_thuong;
      sum_luong_cung += luong_cung;
      sum_tong_luong += tong_luong;

      // HTML cũ (ẩn nhưng vẫn giữ)
      const tr = document.createElement("tr");
      const add = txt => {
        const td = document.createElement("td");
        td.textContent = txt;
        tr.appendChild(td);
      };
      add(manv);
      add(ten);
      add(dia);
      add(fmt(gio_cong, 2));
      add(fmt(gio_phat_tanca_lich, 2));
      add(fmt(gio_tinh, 2));
      add(fmt(doanhthu, 0));
      add(fmt(khoan_gio, 0));
      add(fmt(khoan_thang, 0));
      add(fmt(tien_vuot, 0));
      add(fmt(tien_thuong, 0));
      add(fmt(luong_cung, 0));
      add(fmt(tong_luong, 0));
      add(fmt(luong_1_gio, 0));   // <-- cột Lương/1 giờ
      tbodyLuong.appendChild(tr);

      // Dữ liệu cho Handsontable
      bangLuongData.push([
        manv,
        ten,
        dia,
        Number(gio_cong.toFixed(2)),
        Number(gio_phat_tanca_lich.toFixed(2)),
        Number(gio_tinh.toFixed(2)),
        Math.round(doanhthu),
        Math.round(khoan_gio),
        Math.round(khoan_thang),
        Math.round(tien_vuot),
        Math.round(tien_thuong),
        Math.round(luong_cung),
        Math.round(tong_luong),
        Math.round(luong_1_gio)   // <-- cột Lương/1 giờ
      ]);

    }

    // Dòng tổng (HTML ẩn)
    const trTotal = document.createElement("tr");
    trTotal.className = "table-secondary fw-bold";
    const addTotal = (txt, colspan = 1) => {
      const td = document.createElement("td");
      if (colspan > 1) td.colSpan = colspan;
      td.textContent = txt;
      trTotal.appendChild(td);
    };
    addTotal("TỔNG", 3);
    addTotal(fmt(sum_gio_cong, 2));
    addTotal(fmt(sum_gio_phat, 2));
    addTotal(fmt(sum_gio_tinh, 2));
    addTotal(fmt(sum_doanhthu, 0));
    addTotal(fmt(sum_khoan_gio, 0));
    addTotal(fmt(sum_khoan_thang, 0));
    addTotal(fmt(sum_tien_vuot, 0));
    addTotal(fmt(sum_tien_thuong, 0));
    addTotal(fmt(sum_luong_cung, 0));
    addTotal(fmt(sum_tong_luong, 0));
    tbodyLuong.appendChild(trTotal);

    // 👉 Thêm dòng TỔNG vào dữ liệu Handsontable
    bangLuongData.push([
      "TỔNG",                // Mã NV
      "",                    // Tên NV
      "",                    // Cơ sở
      Number(sum_gio_cong.toFixed(2)),
      Number(sum_gio_phat.toFixed(2)),
      Number(sum_gio_tinh.toFixed(2)),
      Math.round(sum_doanhthu),
      Math.round(sum_khoan_gio),
      Math.round(sum_khoan_thang),
      Math.round(sum_tien_vuot),
      Math.round(sum_tien_thuong),
      Math.round(sum_luong_cung),
      Math.round(sum_tong_luong)
    ]);

    // Render Handsontable
    renderLuongHot(bangLuongData);


    setStatus(
      `Đã tải ${congData.length} dòng. Tổng lương: ${fmt(
        sum_tong_luong,
        0
      )} đ.`
    );
  } catch (err) {
    console.error("Lỗi không mong muốn:", err);
    setStatus("Có lỗi xảy ra, xem console.", true);
    tbodyLuong.innerHTML = `<tr><td colspan="13" style="color:red;">Lỗi JS.</td></tr>`;
    renderLuongHot([]);
  }
}

// ===================== TẢI BẢNG CÔNG =====================

async function taiBangCong() {
  const thang = parseInt(document.getElementById("bc-thang").value);
  const nam = parseInt(document.getElementById("bc-nam").value);
  const tbody = document.getElementById("tbody-bangcong");
  const thead = document.getElementById("thead-bangcong");

  tbody.innerHTML = `<tr><td colspan="50">Đang tải...</td></tr>`;

  const { data, error } = await supabase.rpc("chamcong_bangcong_monthly", {
    p_month: thang,
    p_year: nam
  });

  if (error) {
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="50">Lỗi tải dữ liệu</td></tr>`;
    renderBangCongHot([], []);
    return;
  }

  if (!data || data.length === 0) {
    thead.innerHTML = "";
    tbody.innerHTML = `<tr><td colspan="50">Không có dữ liệu.</td></tr>`;
    renderBangCongHot([], []);
    return;
  }

  // chỉ lấy nhân viên có phát sinh công > 0 trong tháng
  const nhanvien = [
    ...new Set(
      data
        .filter(d => Number(d.gio_cong || 0) > 0)
        .map(d => `${d.manv}|${d.tennv}`)
    )
  ];

  if (nhanvien.length === 0) {
    thead.innerHTML = `<tr><th>Ngày</th><th>Thứ</th><th>Tổng</th></tr>`;
    tbody.innerHTML = `<tr><td colspan="3">Không có nhân viên nào phát sinh công trong tháng này.</td></tr>`;
    renderBangCongHot([], []);
    return;
  }

  // Header HTML dự phòng
  let header = `<th>Ngày</th><th>Thứ</th>`;
  nhanvien.forEach(n => {
    const [, tennv] = n.split("|");
    header += `<th>${tennv}</th>`;
  });
  header += `<th>Tổng</th>`;
  thead.innerHTML = `<tr>${header}</tr>`;

  // Gom dữ liệu theo ngày
  const groupByNgay = {};
  data.forEach(d => {
    if (!groupByNgay[d.ngay]) groupByNgay[d.ngay] = [];
    groupByNgay[d.ngay].push(d);
  });

  // Header cho Handsontable
  const colHeaders = ["Ngày", "Thứ"];
  nhanvien.forEach(n => {
    const [, tennv] = n.split("|");
    colHeaders.push(tennv);
  });
  colHeaders.push("Tổng");

  const hotData = [];
  const tongTheoNhanVien = {};
  nhanvien.forEach(n => {
    const manv = n.split("|")[0];
    tongTheoNhanVien[manv] = 0;
  });
  let tongTatCa = 0;

  const ngayList = Object.keys(groupByNgay).sort((a, b) => Number(a) - Number(b));

  let html = "";

  ngayList.forEach(ng => {
    const row = groupByNgay[ng];
    const thu = row[0].thu;
    let sum = 0;

    const rowData = [Number(ng), thu];

    let cellsHtml = "";

    nhanvien.forEach(n => {
      const manv = n.split("|")[0];
      const found = row.find(r => r.manv == manv);
      const gioCong = found ? Number(found.gio_cong || 0) : 0;

      rowData.push(Number(gioCong.toFixed(2)));

      if (gioCong > 0) {
        sum += gioCong;
        tongTheoNhanVien[manv] += gioCong;
        tongTatCa += gioCong;
        cellsHtml += `<td>${gioCong.toFixed(2)}</td>`;
      } else {
        cellsHtml += "<td></td>";
      }
    });

    rowData.push(Number(sum.toFixed(2)));
    hotData.push(rowData);

    html += `<tr>
      <td>${ng}</td>
      <td>${thu}</td>
      ${cellsHtml}
      <td class="fw-bold">${sum.toFixed(2)}</td>
    </tr>`;
  });

  // Dòng tổng
  const totalRow = ["TỔNG", ""];
  let totalHtml = `<tr class="table-secondary fw-bold"><td>TỔNG</td><td></td>`;
  nhanvien.forEach(n => {
    const manv = n.split("|")[0];
    const tongNv = tongTheoNhanVien[manv] || 0;
    totalRow.push(Number(tongNv.toFixed(2)));
    totalHtml += `<td>${tongNv.toFixed(2)}</td>`;
  });
  totalRow.push(Number(tongTatCa.toFixed(2)));
  totalHtml += `<td>${tongTatCa.toFixed(2)}</td></tr>`;

  hotData.push(totalRow);

  tbody.innerHTML = html + totalHtml;

  // Render Handsontable
  renderBangCongHot(colHeaders, hotData);
}

// ===================== INIT =====================

document.addEventListener("DOMContentLoaded", () => {
  setDefaultDates();
  setStatus(
    "Chọn tháng, lương/giờ, khoán/giờ và % thưởng rồi bấm Tải bảng lương."
  );
  btnTai.addEventListener("click", taiBangLuong);

  const today = new Date();
  const thangEl = document.getElementById("bc-thang");
  const namEl = document.getElementById("bc-nam");
  if (thangEl && namEl) {
    thangEl.value = today.getMonth() + 1;
    namEl.value = today.getFullYear();
  }

  // tự tải khi mở trang
  //taiBangLuong();
  //taiBangCong();
});

// Cho phép gọi từ bên ngoài (authModule)
window.taiBangLuong = taiBangLuong;
window.taiBangCong = taiBangCong;
