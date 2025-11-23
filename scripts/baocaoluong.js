// baocaoluong.js
// Tính lương tháng: giờ công (chamcong_tinhcong_monthly)
// + thưởng doanh thu vượt khoán (nv_match2h_summary_all)

import { supabase } from "./supabaseClient.js";

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function setDefaultDates() {
  const tuNgayInput = document.getElementById("tu_ngay");
  const denNgayInput = document.getElementById("den_ngay");
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

  tuNgayInput.value = toIsoDate(firstDay);
  denNgayInput.value = toIsoDate(today);
}

function fmtNumber(n, decimals = 0) {
  if (n == null || Number.isNaN(Number(n))) return "0";
  return Number(n).toLocaleString("vi-VN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function setStatus(msg) {
  const el = document.getElementById("status");
  el.textContent = msg || "";
}

function setResultFields(values) {
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText("kq-manv", values.manv || "-");
  setText("kq-range", values.range || "-");

  setText("kq-so-ngay-cong", fmtNumber(values.so_ngay_cong, 0));
  setText("kq-tong-gio-cong", fmtNumber(values.tong_gio_cong, 2));
  setText("kq-gio-cong-tinh-luong", fmtNumber(values.gio_cong_tinh_luong, 2));
  setText("kq-gio-phat-tanca-lich", fmtNumber(values.gio_phat_tanca_lich, 2));

  setText("kq-auto-tanca", fmtNumber(values.so_lan_auto_tanca, 0));
  setText("kq-cb1", fmtNumber(values.so_ngay_cb1, 0));
  setText("kq-cb2", fmtNumber(values.so_ngay_cb2, 0));
  setText("kq-cb3", fmtNumber(values.so_ngay_cb3, 0));
  setText("kq-so-ngay-vang", fmtNumber(values.so_ngay_vang, 0));
  setText("kq-so-ngay-tanca-lich", fmtNumber(values.so_ngay_tanca_lich, 0));

  setText("kq-khoan-gio", fmtNumber(values.khoan_gio, 0));
  setText("kq-khoan-thang", fmtNumber(values.khoan_thang, 0));
  setText("kq-doanhso", fmtNumber(values.tong_doanh_thu, 0));
  setText("kq-tien-vuot", fmtNumber(values.tien_vuot, 0));
  setText("kq-thuong-doanhso", fmtNumber(values.tien_thuong, 0));
  setText("kq-luong-gio", fmtNumber(values.luong_gio_thang, 0));
  setText("kq-tong-luong", fmtNumber(values.tong_luong, 0));

  const warns = [];

  if (values.so_ngay_cb1 > 0) {
    warns.push(`- Có ${values.so_ngay_cb1} ngày bán hàng nhưng không vào ca đúng quy trình (CB1).`);
  }
  if (values.so_ngay_cb2 > 0) {
    warns.push(`- Có ${values.so_ngay_cb2} ngày nghỉ trưa quá 70 phút (CB2).`);
  }
  if (values.so_ngay_cb3 > 0) {
    warns.push(`- Có ${values.so_ngay_cb3} ngày nghỉ chiều quá 40 phút (CB3).`);
  }
  if (values.so_lan_auto_tanca > 5) {
    warns.push(`- AUTO_TANCA ${values.so_lan_auto_tanca} lần trong kỳ (>5 lần) – cần xem lại ý thức chấm công.`);
  }
  if (values.so_ngay_vang > 0) {
    warns.push(`- Có ${values.so_ngay_vang} ca VẮNG (vào ca muộn > 15 phút hoặc không vào ca).`);
  }
  if (values.so_ngay_tanca_lich > 0) {
    warns.push(
      `- Có ${values.so_ngay_tanca_lich} ca tan ca theo LỊCH (không bấm TANCA sau giờ đăng ký + 15p) – đã trừ `
      + fmtNumber(values.gio_phat_tanca_lich, 2) + ` giờ công.`
    );
  }

  if (values.tien_vuot <= 0) {
    warns.push("- Doanh thu chưa vượt mức khoán, thưởng vượt khoán = 0.");
  } else {
    warns.push(
      `- Doanh thu vượt khoán: ${fmtNumber(values.tien_vuot, 0)} đ, thưởng vượt khoán: ${fmtNumber(values.tien_thuong, 0)} đ.`
    );
  }

  const warnEl = document.getElementById("warning-section");
  warnEl.innerHTML = warns.length
    ? warns.join("<br>")
    : "Không có cảnh báo vi phạm đáng chú ý trong kỳ (CB1/CB2/CB3/AUTO_TANCA/VẮNG/TANCA_LỊCH) và doanh thu đang đạt/vượt khoán.";
}

async function tinhLuongThang() {
  const tuNgay = document.getElementById("tu_ngay").value;
  const denNgay = document.getElementById("den_ngay").value;
  const manv = document.getElementById("manv").value.trim();
  const luong_gio = parseFloat(document.getElementById("luong_gio").value || "0") || 0;
  const khoan_gio = parseFloat(document.getElementById("khoan_gio").value || "0") || 0;
  const pct_thuong = parseFloat(document.getElementById("pct_thuong").value || "0") || 0;

  if (!tuNgay || !denNgay) {
    alert("Vui lòng chọn đủ TỪ NGÀY và ĐẾN NGÀY.");
    return;
  }
  if (!manv) {
    alert("Vui lòng nhập mã nhân viên.");
    return;
  }

  setStatus("Đang tính lương, vui lòng đợi...");
  setResultFields({
    manv: "-",
    range: "-",
    so_ngay_cong: 0,
    tong_gio_cong: 0,
    gio_cong_tinh_luong: 0,
    gio_phat_tanca_lich: 0,
    so_lan_auto_tanca: 0,
    so_ngay_cb1: 0,
    so_ngay_cb2: 0,
    so_ngay_cb3: 0,
    so_ngay_vang: 0,
    so_ngay_tanca_lich: 0,
    khoan_gio,
    khoan_thang: 0,
    tong_doanh_thu: 0,
    tien_vuot: 0,
    tien_thuong: 0,
    luong_gio_thang: 0,
    tong_luong: 0
  });

  try {
    // 1) Giờ công tháng từ chamcong_tinhcong_monthly
    const { data: chamcongData, error: chamcongError } = await supabase.rpc(
      "chamcong_tinhcong_monthly",
      {
        tu_ngay: tuNgay,
        den_ngay: denNgay,
        p_diadiem: null,
        p_manv: manv
      }
    );

    if (chamcongError) {
      console.error("Lỗi chamcong_tinhcong_monthly:", chamcongError);
      alert("Lỗi lấy dữ liệu chấm công. Xem console để biết thêm chi tiết.");
      setStatus("");
      return;
    }

    let tong_gio_cong = 0;
    let so_ngay_cong = 0;
    let so_lan_auto_tanca = 0;
    let so_ngay_cb1 = 0;
    let so_ngay_cb2 = 0;
    let so_ngay_cb3 = 0;
    let so_ngay_vang = 0;
    let so_ngay_tanca_lich = 0;

    (chamcongData || []).forEach(row => {
      tong_gio_cong      += Number(row.tong_gio_cong || 0);
      so_ngay_cong       += Number(row.so_ngay_cong || 0);
      so_lan_auto_tanca  += Number(row.so_lan_auto_tanca || 0);
      so_ngay_cb1        += Number(row.so_ngay_cb1 || 0);
      so_ngay_cb2        += Number(row.so_ngay_cb2 || 0);
      so_ngay_cb3        += Number(row.so_ngay_cb3 || 0);
      so_ngay_vang       += Number(row.so_ngay_vang || 0);
      so_ngay_tanca_lich += Number(row.so_ngay_tanca_lich || 0);
    });

    const gio_phat_tanca_lich = so_ngay_tanca_lich * 1.0;
    const gio_cong_tinh_luong = Math.max(tong_gio_cong - gio_phat_tanca_lich, 0);

    // 2) Doanh số KPI từ nv_match2h_summary_all
    const { data: kpiData, error: kpiError } = await supabase.rpc(
      "nv_match2h_summary_all",
      {
        tu_ngay: tuNgay,
        den_ngay: denNgay,
        p_manv: manv,
        p_masp_list: null,
        p_min_price: 0,
        p_size: null
      }
    );

    if (kpiError) {
      console.error("Lỗi nv_match2h_summary_all:", kpiError);
      alert("Lỗi lấy dữ liệu doanh số KPI. Xem console để biết thêm chi tiết.");
      setStatus("");
      return;
    }

    let tong_doanh_thu = 0;
    if (kpiData && kpiData.length > 0) {
      tong_doanh_thu = Number(kpiData[0].tong_doanh_thu || 0);
    }

    // 3) Tính khoán & thưởng vượt khoán
    const khoan_thang = gio_cong_tinh_luong * khoan_gio;
    const tien_vuot = Math.max(tong_doanh_thu - khoan_thang, 0);
    const tien_thuong = tien_vuot * (pct_thuong / 100.0);

    // 4) Tính lương
    const luong_gio_thang = gio_cong_tinh_luong * luong_gio;
    const tong_luong = luong_gio_thang + tien_thuong;

    const rangeLabel = `${tuNgay} → ${denNgay}`;

    setResultFields({
      manv,
      range: rangeLabel,
      so_ngay_cong,
      tong_gio_cong,
      gio_cong_tinh_luong,
      gio_phat_tanca_lich,
      so_lan_auto_tanca,
      so_ngay_cb1,
      so_ngay_cb2,
      so_ngay_cb3,
      so_ngay_vang,
      so_ngay_tanca_lich,
      khoan_gio,
      khoan_thang,
      tong_doanh_thu,
      tien_vuot,
      tien_thuong,
      luong_gio_thang,
      tong_luong
    });

    setStatus("Đã tính xong.");
  } catch (err) {
    console.error("Lỗi không mong muốn:", err);
    alert("Có lỗi xảy ra, xem console để biết chi tiết.");
    setStatus("");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setDefaultDates();
  setStatus("Chọn khoảng ngày, nhập mã NV, lương giờ, khoán/giờ và % thưởng trên phần vượt khoán rồi bấm Tính lương.");
  document.getElementById("btn-tinh-luong").addEventListener("click", tinhLuongThang);
});
