import { supabase } from "./supabaseClient.js";
import { fillNhanVienDropdown } from "./dmnhanvien.js";

function toIsoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtNumber(n, decimals = 0) {
  return Number(n || 0).toLocaleString("vi-VN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function normalizeManv(v) {
  return String(v || "").trim().toUpperCase();
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setStatus(msg) {
  setText("status", msg || "");
}

function setDefaultDates() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  document.getElementById("tu_ngay").value = toIsoDate(firstDay);
  document.getElementById("den_ngay").value = toIsoDate(today);
}

async function loadKhoanTru(tu_ngay, den_ngay, manv) {
  const { data, error } = await supabase
    .from("cackhoantru")
    .select("so_tien")
    .gte("ngay_phatsinh", tu_ngay)
    .lte("ngay_phatsinh", den_ngay)
    .eq("manv", normalizeManv(manv));

  if (error) {
    console.error("Lỗi khoản trừ:", error);
    return 0;
  }

  return (data || []).reduce((s, r) => s + Number(r.so_tien || 0), 0);
}

async function tinhLuongKpi1Nv() {
  const tuNgay = document.getElementById("tu_ngay").value;
  const denNgay = document.getElementById("den_ngay").value;
  const manv = normalizeManv(document.getElementById("manv").value);

  const luongGioBan = Number(document.getElementById("luong_gio").value || 0);
  const khoanGio = Number(document.getElementById("khoan_gio").value || 0);
  const pctThuong = Number(document.getElementById("pct_thuong").value || 0) / 100;

  if (!tuNgay || !denNgay || !manv) {
    alert("Vui lòng chọn ngày và mã nhân viên.");
    return;
  }

  setStatus("Đang tính lương KPI chi tiết...");

  const { data: gioData, error: gioErr } = await supabase
    .schema("qlnv")
    .rpc("rpc_staff_work_hours_kpi_v1", {
      tu_ngay: tuNgay,
      den_ngay: denNgay,
      p_diadiem: null,
      p_manv: manv
    });

  if (gioErr) {
    console.error(gioErr);
    alert("Lỗi lấy giờ KPI.");
    setStatus("");
    return;
  }

  const gio = gioData?.[0] || {};

  const gioBan = Number(gio.gio_ban_hang || 0);
  const gioTask = Number(gio.gio_task || 0);
  const gioDonDep = Number(gio.gio_don_dep || 0);
  const gioNghiOff = Number(gio.gio_nghi_off || 0);
  const tongGioLog = Number(gio.tong_gio_log || 0);

  const { data: kpiData, error: kpiErr } = await supabase.rpc("nv_match2h_summary_all_v2", {
    tu_ngay: tuNgay,
    den_ngay: denNgay,
    p_manv: manv,
    p_masp_list: null,
    p_min_price: 0,
    p_size: null
  });

  if (kpiErr) {
    console.error(kpiErr);
    alert("Lỗi lấy doanh thu KPI.");
    setStatus("");
    return;
  }

  const doanhThu = Number(kpiData?.[0]?.tong_doanh_thu || 0);
  const hoaHong = Number(kpiData?.[0]?.tong_hoa_hong || 0);

  const khoanThang = gioBan * khoanGio;
  const tienVuot = Math.max(0, doanhThu - khoanThang);
  const tienThuong = tienVuot * pctThuong;

  const luongBan = gioBan * luongGioBan;
  const luongTask = gioTask * luongGioBan;
  const luongDonDep = gioDonDep * luongGioBan;

  const tongLuong = luongBan + luongTask + luongDonDep + tienThuong + hoaHong;
  const khoanTru = await loadKhoanTru(tuNgay, denNgay, manv);
  const thucLinh = tongLuong - khoanTru;
  const luong1Gio = tongGioLog > 0 ? tongLuong / tongGioLog : 0;

  setText("kq-manv", manv);
  setText("kq-range", `${tuNgay} → ${denNgay}`);

  setText("kq-tong-gio-cong", fmtNumber(tongGioLog, 2));
  setText("kq-gio-cong-tinh-luong", fmtNumber(gioBan + gioTask + gioDonDep, 2));
  setText("kq-gio-ban", fmtNumber(gioBan, 2));
  setText("kq-gio-task", fmtNumber(gioTask, 2));
  setText("kq-gio-dondep", fmtNumber(gioDonDep, 2));
  setText("kq-gio-nghi-off", fmtNumber(gioNghiOff, 2));
  setText("kq-tong-gio-log", fmtNumber(tongGioLog, 2));

  setText("kq-khoan-gio", fmtNumber(khoanGio));
  setText("kq-khoan-thang", fmtNumber(khoanThang));
  setText("kq-doanhso", fmtNumber(doanhThu));
  setText("kq-hoa-hong", fmtNumber(hoaHong));
  setText("kq-tien-vuot", fmtNumber(tienVuot));
  setText("kq-thuong-doanhso", fmtNumber(tienThuong));
  setText("kq-luong-gio", fmtNumber(luongBan + luongTask + luongDonDep));
  setText("kq-tong-luong", fmtNumber(tongLuong));
  setText("kq-khoan-tru", fmtNumber(khoanTru));
  setText("kq-thuc-linh", fmtNumber(thucLinh));
  setText("kq-luong-1-gio", fmtNumber(luong1Gio));

  setStatus("Đã tính xong lương KPI chi tiết.");
}

document.addEventListener("DOMContentLoaded", async () => {
  setDefaultDates();

  const ds = document.getElementById("ds-manv");
  if (ds) {
    await fillNhanVienDropdown(ds, { showName: true });
  }

  document.getElementById("btn-tinh-luong").addEventListener("click", tinhLuongKpi1Nv);
});