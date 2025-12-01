// bangluongthang.js - Bảng lương tháng tất cả nhân viên
import { supabase } from "./supabaseClient.js";

const tuNgayInput = document.getElementById("tu_ngay");
const denNgayInput = document.getElementById("den_ngay");
const diadiemSelect = document.getElementById("diadiem");
const luongGioInput = document.getElementById("luong_gio");
const khoanGioInput = document.getElementById("khoan_gio");
const pctThuongInput = document.getElementById("pct_thuong");
const btnTai = document.getElementById("btn-tai");
const tbody = document.getElementById("tbody-bangluong");
const statusEl = document.getElementById("status");

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
  tbody.innerHTML = `<tr><td colspan="13">Đang tải...</td></tr>`;

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
      tbody.innerHTML = `<tr><td colspan="13" style="color:red;">Lỗi chamcong_tinhcong_monthly.</td></tr>`;
      return;
    }

    if (!congData || congData.length === 0) {
      setStatus("Không có dữ liệu chấm công trong khoảng này.");
      tbody.innerHTML = `<tr><td colspan="13">Không có dữ liệu.</td></tr>`;
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
    tbody.innerHTML = "";

    // Các biến tổng cho từng cột
    let sum_gio_cong = 0;
    let sum_gio_phat = 0;
    let sum_gio_tinh = 0;
    let sum_doanhthu = 0;
    let sum_khoan_gio = 0;      // tổng cột Khoán/giờ
    let sum_khoan_thang = 0;
    let sum_tien_vuot = 0;
    let sum_tien_thuong = 0;
    let sum_luong_cung = 0;
    let sum_tong_luong = 0;

    // gom theo nhân viên (vì chamcong_tinhcong_monthly có thể trả nhiều dòng / nv)
    const byManv = {};
    congData.forEach(r => {
      if (!byManv[r.manv]) byManv[r.manv] = [];
      byManv[r.manv].push(r);
    });

    for (const manv of Object.keys(byManv)) {
      const rows = byManv[manv];
      const ten = mapTen[String(manv)] || "";
      const dia = rows[0].diadiem || "";

      // tổng giờ trong khoảng
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
      // CHO PHÉP ÂM: không dùng Math.max nữa
      const tien_vuot = doanhthu - khoan_thang;              // có thể âm
      const tien_thuong = tien_vuot * (pct_thuong / 100.0);  // thưởng/phạt

      const luong_cung = gio_tinh * luong_gio;
      const tong_luong = luong_cung + tien_thuong;           // tổng lương có thể < lương cứng

      // Cộng dồn vào tổng cuối
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

      // Tạo dòng chi tiết
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

      tbody.appendChild(tr);
    }

    // 4) Dòng TỔNG cuối cùng cho tất cả các cột
    const trTotal = document.createElement("tr");
    trTotal.className = "table-secondary fw-bold";

    const addTotal = (txt, colspan = 1) => {
      const td = document.createElement("td");
      if (colspan > 1) td.colSpan = colspan;
      td.textContent = txt;
      trTotal.appendChild(td);
    };

    // 3 cột đầu (Mã NV, Tên, Cơ sở) gộp thành một ô "TỔNG"
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

    tbody.appendChild(trTotal);

    setStatus(
      `Đã tải ${congData.length} dòng. Tổng lương: ${fmt(
        sum_tong_luong,
        0
      )} đ.`
    );
  } catch (err) {
    console.error("Lỗi không mong muốn:", err);
    setStatus("Có lỗi xảy ra, xem console.", true);
    tbody.innerHTML = `<tr><td colspan="13" style="color:red;">Lỗi JS.</td></tr>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // ngày mặc định cho bảng lương
  setDefaultDates();
  setStatus(
    "Chọn tháng, lương/giờ, khoán/giờ và % thưởng rồi bấm Tải bảng lương."
  );
  btnTai.addEventListener("click", taiBangLuong);

  // tháng/năm mặc định cho BẢNG CÔNG
  const today = new Date();
  const thangEl = document.getElementById("bc-thang");
  const namEl = document.getElementById("bc-nam");
  if (thangEl && namEl) {
    thangEl.value = today.getMonth() + 1;
    namEl.value = today.getFullYear();
  }

  // Tự động tải cả bảng lương và bảng công khi mở trang
  taiBangLuong();
  taiBangCong();
});


// --------- PHẦN BẢNG CÔNG THÁNG (giữ nguyên) ----------

// --------- PHẦN BẢNG CÔNG THÁNG ----------

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
    return;
  }

  if (!data || data.length === 0) {
    thead.innerHTML = "";
    tbody.innerHTML = `<tr><td colspan="50">Không có dữ liệu.</td></tr>`;
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
    return;
  }

  // Header
  let header = `<th>Ngày</th><th>Thứ</th>`;
  nhanvien.forEach(n => {
    const [, tennv] = n.split("|");
    header += `<th>${tennv}</th>`;
  });
  header += `<th>Tổng</th>`;
  thead.innerHTML = `<tr>${header}</tr>`;

  // Gom theo ngày
  const groupByNgay = {};
  data.forEach(d => {
    if (!groupByNgay[d.ngay]) groupByNgay[d.ngay] = [];
    groupByNgay[d.ngay].push(d);
  });

  // Biến tổng cho từng nhân viên & tổng toàn bộ
  const tongTheoNhanVien = {};
  nhanvien.forEach(n => {
    const manv = n.split("|")[0];
    tongTheoNhanVien[manv] = 0;
  });
  let tongTatCa = 0;

  let html = "";
  const ngayList = Object.keys(groupByNgay).sort((a, b) => Number(a) - Number(b));

  ngayList.forEach(ng => {
    const row = groupByNgay[ng];
    const thu = row[0].thu;
    let sum = 0;
    let cells = "";

    nhanvien.forEach(n => {
      const manv = n.split("|")[0];
      const found = row.find(r => r.manv == manv);
      const gioCong = found ? Number(found.gio_cong || 0) : 0;

      if (gioCong === 0) {
        cells += `<td></td>`;
      } else {
        cells += `<td>${gioCong}</td>`;
        sum += gioCong;
        tongTheoNhanVien[manv] += gioCong;
        tongTatCa += gioCong;
      }
    });

    html += `<tr>
      <td>${ng}</td>
      <td class="${thu == "CN" ? "text-danger fw-bold" : ""}">${thu}</td>
      ${cells}
      <td class="fw-bold">${fmt(sum, 2)}</td>
    </tr>`;
  });

  // Dòng TỔNG cuối cùng
  let totalRow = `<tr class="table-secondary fw-bold">
    <td>TỔNG</td>
    <td></td>`;

  nhanvien.forEach(n => {
    const manv = n.split("|")[0];
    const tongNv = tongTheoNhanVien[manv] || 0;
    totalRow += `<td>${tongNv > 0 ? fmt(tongNv, 2) : ""}</td>`;
  });
  totalRow += `<td>${fmt(tongTatCa, 2)}</td></tr>`;


  html += totalRow;

  tbody.innerHTML = html;
}

window.taiBangCong = taiBangCong;


window.taiBangCong = taiBangCong;
