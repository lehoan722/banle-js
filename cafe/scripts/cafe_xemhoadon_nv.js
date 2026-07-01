import { supabase } from "../../scripts/supabaseClient.js";

const SCHEMA = "cafe";

const el = {
  tuNgay: document.getElementById("tuNgay"),
  denNgay: document.getElementById("denNgay"),
  locSoHD: document.getElementById("locSoHD"),
  locNV: document.getElementById("locNV"),
  locBan: document.getElementById("locBan"),
  locKhuVuc: document.getElementById("locKhuVuc"),
  locMon: document.getElementById("locMon"),
  locTrangThai: document.getElementById("locTrangThai"),
  locLoaiDon: document.getElementById("locLoaiDon"),

  btnLoc: document.getElementById("btnLoc"),
  btnCopyTable: document.getElementById("btnCopyTable"),
  btnCopyChiTiet: document.getElementById("btnCopyChiTiet"),
  btnClosePopup: document.getElementById("btnClosePopup"),

  dsHoaDon: document.getElementById("dsHoaDon"),
  dsChiTiet: document.getElementById("dsChiTiet"),

  tongHoaDon: document.getElementById("tongHoaDon"),
  tongSoLuong: document.getElementById("tongSoLuong"),
  tongTien: document.getElementById("tongTien"),

  popup: document.getElementById("popupChiTiet"),
  popupHeader: document.getElementById("popupHeader"),
  popupSoHD: document.getElementById("popupSoHD"),
};

let hoaDonCache = [];
let selectedHoaDon = null;

function formatMoney(value) {
  return Number(value || 0).toLocaleString("vi-VN");
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);

  const datePart = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);

  const timePart = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);

  return `${datePart} ${timePart.replace(":", "h")}`;
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getEndDatePlusOne(dateValue) {
  if (!dateValue) return null;
  const d = new Date(`${dateValue}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function getStartDate(dateValue) {
  if (!dateValue) return null;
  return new Date(`${dateValue}T00:00:00`).toISOString();
}

function trangThaiText(value) {
  if (value === "dang_mo") return "Đang mở";
  if (value === "da_thanh_toan") return "Đã thanh toán";
  if (value === "da_huy") return "Đã hủy";
  return value || "";
}

function loaiDonText(value) {
  if (value === "tai_ban") return "Tại bàn";
  if (value === "mang_ve") return "Mang về";
  return value || "";
}

async function taiHoaDonCafe() {
  el.dsHoaDon.innerHTML = `<tr><td colspan="12">Đang tải dữ liệu...</td></tr>`;

  let query = supabase
    .schema(SCHEMA)
    .from("cafe_hoadon")
    .select(`
      id,
      so_hoadon,
      ban_id,
      khuvuc_id,
      loai_don,
      trang_thai,
      gio_vao,
      gio_thanh_toan,
      tong_tien,
      giam_gia,
      thanh_toan,
      ghi_chu,
      manv,
      tennv,
      cafe_ban:ban_id (
        ten_ban
      ),
      cafe_khuvuc:khuvuc_id (
        ten_khuvuc
      ),
      cafe_hoadon_ct!inner (
  id,
  ma_hang,
  ten_hang,
  so_luong,
  don_gia,
  thanh_tien,
  ghi_chu,
  trang_thai
)
    `)
    .order("gio_vao", { ascending: false })
    .limit(1000);

  query = query.eq("cafe_hoadon_ct.trang_thai", "binh_thuong");

  const tuNgay = el.tuNgay.value;
  const denNgay = el.denNgay.value;
  const sohd = el.locSoHD.value.trim();
  const nv = el.locNV.value.trim();
  const trangThai = el.locTrangThai.value;
  const loaiDon = el.locLoaiDon.value;

  if (tuNgay) query = query.gte("gio_vao", getStartDate(tuNgay));
  if (denNgay) query = query.lt("gio_vao", getEndDatePlusOne(denNgay));
  if (sohd) query = query.ilike("so_hoadon", `%${sohd}%`);
  if (nv) query = query.or(`manv.ilike.%${nv}%,tennv.ilike.%${nv}%`);
  if (trangThai) query = query.eq("trang_thai", trangThai);
  if (loaiDon) query = query.eq("loai_don", loaiDon);

  const { data, error } = await query;

  if (error) {
    console.error("Lỗi tải hóa đơn cafe:", error);
    el.dsHoaDon.innerHTML = `<tr><td colspan="12">❌ ${error.message}</td></tr>`;
    return;
  }

  let rows = data || [];

  const banText = el.locBan.value.trim().toLowerCase();
  const khuVucText = el.locKhuVuc.value.trim().toLowerCase();
  const monText = el.locMon.value.trim().toLowerCase();

  if (banText) {
    rows = rows.filter((hd) => String(hd.cafe_ban?.ten_ban || "").toLowerCase().includes(banText));
  }

  if (khuVucText) {
    rows = rows.filter((hd) => String(hd.cafe_khuvuc?.ten_khuvuc || "").toLowerCase().includes(khuVucText));
  }

  if (monText) {
    rows = rows.filter((hd) =>
      (hd.cafe_hoadon_ct || []).some((ct) => {
        const ten = String(ct.ten_hang || "").toLowerCase();
        const ma = String(ct.ma_hang || "").toLowerCase();
        return ten.includes(monText) || ma.includes(monText);
      })
    );
  }

  hoaDonCache = rows;
  renderHoaDon(rows);
}

function renderHoaDon(rows) {
  if (!rows.length) {
    el.dsHoaDon.innerHTML = `<tr><td colspan="12">Không có hóa đơn phù hợp.</td></tr>`;
    renderSummary([]);
    return;
  }

  el.dsHoaDon.innerHTML = rows.map((hd, index) => {
    const chiTietBinhThuong = (hd.cafe_hoadon_ct || []).filter((ct) => ct.trang_thai === "binh_thuong");
    const tongSl = chiTietBinhThuong.reduce((sum, ct) => sum + Number(ct.so_luong || 0), 0);
    const tongTienTinhLai = chiTietBinhThuong.reduce((sum, ct) => sum + Number(ct.thanh_tien || 0), 0);

    return `
      <tr data-id="${hd.id}">
        <td>${index + 1}</td>
        <td>${hd.so_hoadon || ""}</td>
        <td>${formatDateTime(hd.gio_vao)}</td>
        <td>${formatDateTime(hd.gio_thanh_toan)}</td>
        <td>${hd.cafe_khuvuc?.ten_khuvuc || ""}</td>
        <td>${hd.loai_don === "mang_ve" ? "Mang về" : (hd.cafe_ban?.ten_ban || "")}</td>
        <td>${loaiDonText(hd.loai_don)}</td>
        <td class="status-${hd.trang_thai}">${trangThaiText(hd.trang_thai)}</td>
        <td>${hd.tennv || hd.manv || ""}</td>
        <td class="text-right">${formatMoney(tongSl)}</td>
        <td class="text-right">${formatMoney(tongTienTinhLai)}</td>
        <td>${hd.ghi_chu || ""}</td>
      </tr>
    `;
  }).join("");

  el.dsHoaDon.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("click", () => {
      const id = Number(tr.dataset.id);
      const hd = hoaDonCache.find((x) => Number(x.id) === id);
      if (hd) showChiTiet(hd);
    });
  });

  renderSummary(rows);
}

function renderSummary(rows) {
  const tongHoaDon = rows.length;
  const tongSl = rows.reduce((sum, hd) => {
    return sum + (hd.cafe_hoadon_ct || [])
      .filter((ct) => ct.trang_thai === "binh_thuong")
      .reduce((s, ct) => s + Number(ct.so_luong || 0), 0);
  }, 0);

  const tongTien = rows.reduce((sum, hd) => {
    return sum + (hd.cafe_hoadon_ct || [])
      .filter((ct) => ct.trang_thai === "binh_thuong")
      .reduce((s, ct) => s + Number(ct.thanh_tien || 0), 0);
  }, 0);

  el.tongHoaDon.textContent = formatMoney(tongHoaDon);
  el.tongSoLuong.textContent = formatMoney(tongSl);
  el.tongTien.textContent = formatMoney(tongTien);
}

function showChiTiet(hd) {
  selectedHoaDon = hd;
  el.popup.style.display = "block";
  el.popupSoHD.textContent = hd.so_hoadon || "";

  const chiTiet = hd.cafe_hoadon_ct || [];

  el.dsChiTiet.innerHTML = chiTiet.map((ct) => `
    <tr>
      <td>${ct.ma_hang || ""}</td>
      <td>${ct.ten_hang || ""}</td>
      <td class="text-right">${formatMoney(ct.so_luong)}</td>
      <td class="text-right">${formatMoney(ct.don_gia)}</td>
      <td class="text-right">${formatMoney(ct.thanh_tien)}</td>
      <td>${ct.ghi_chu || ""}</td>
    </tr>
  `).join("");
}

function dongPopup() {
  el.popup.style.display = "none";
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

function copyTable() {
  const rows = Array.from(document.querySelectorAll(".table-wrap table tr"));
  const text = rows.map((tr) =>
    Array.from(tr.cells).map((td) => td.innerText.replace(/\n/g, " ")).join("\t")
  ).join("\n");

  copyText(text);
}

function copyChiTiet() {
  const rows = Array.from(el.dsChiTiet.querySelectorAll("tr"));
  if (!rows.length) return;

  const text = rows.map((tr) =>
    Array.from(tr.cells).map((td) => td.innerText.replace(/\n/g, " ")).join("\t")
  ).join("\n");

  copyText(text);
}

function bindPopupDrag() {
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  el.popupHeader.addEventListener("mousedown", (e) => {
    isDragging = true;
    const rect = el.popup.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    document.onmousemove = (ev) => {
      if (!isDragging) return;
      el.popup.style.left = `${ev.clientX - offsetX}px`;
      el.popup.style.top = `${ev.clientY - offsetY}px`;
    };

    document.onmouseup = () => {
      isDragging = false;
      document.onmousemove = null;
    };
  });
}

function setDefaultDates() {
  const today = getToday();
  el.tuNgay.value = today;
  el.denNgay.value = today;
}

el.btnLoc.addEventListener("click", taiHoaDonCafe);
el.btnCopyTable.addEventListener("click", copyTable);
el.btnCopyChiTiet.addEventListener("click", copyChiTiet);
el.btnClosePopup.addEventListener("click", dongPopup);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") dongPopup();
  if (e.key === "Enter") taiHoaDonCafe();
});

setDefaultDates();
bindPopupDrag();
taiHoaDonCafe();