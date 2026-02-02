// scripts/cackhoantru.js
// Giao diện nhập + xem danh sách các khoản trừ
// - Dùng supabaseClient.js + authModule.js giống trang lương của bạn. :contentReference[oaicite:1]{index=1}

import { supabase } from "./supabaseClient.js";
import * as authModule from "./authModule.js";

const el = (id) => document.getElementById(id);

const statusEl = el("status");
const btnLuu = el("btn-luu");
const btnMoi = el("btn-moi");
const btnTai = el("btn-tai");
const btnXoa = el("btn-xoa");

const inpNgay = el("ngay_phatsinh");
const inpDiaDiem = el("diadiem");
const inpManv = el("manv");
const inpTennv = el("tennv");
const selLoai = el("loai_khoan_tru");
const inpSoTien = el("so_tien");
const inpGhiChu = el("ghi_chu");

const locTuNgay = el("tu_ngay");
const locDenNgay = el("den_ngay");
const locDiaDiem = el("loc_diadiem");
const locManv = el("loc_manv");

const hotContainer = el("hotKhoanTru");
let hot = null;
let currentSelectedRow = null; // row index trong HOT

function setStatus(msg, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
  statusEl.style.color = isError ? "#b00020" : "#222";
}

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function normalizeManv(v) {
  return String(v || "").trim().toUpperCase();
}

function parseNum(v) {
  const n = Number(String(v || "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function genRefCode({ manv, ngay_phatsinh, loai }) {
  // ví dụ: UNG_LUONG_2026-02-05_NV01_1700000000000
  return `${loai}_${ngay_phatsinh}_${manv}_${Date.now()}`;
}

// =============================
// Quyền truy cập (theo pattern trang lương)
// =============================
async function kiemTraQuyenXemTrang(pathTrang) {
  const nv = authModule.getCurrentUserInfo?.();
  if (!nv || !nv.manv) return false;

  const { data, error } = await supabase.rpc("get_pages_for_manv", { p_manv: nv.manv });
  if (error) {
    hienCamTruyCap("Lỗi kiểm tra phân quyền: " + error.message);
    return false;
  }

  const dsTrang = (data || []).map(r => r.path);
  if (!nv.is_admin && !dsTrang.includes(pathTrang)) {
    hienCamTruyCap(`Không có quyền truy cập.<br> Mã NV: ${nv.manv} – ${nv.tennv}`);
    return false;
  }
  return true;
}

function hienCamTruyCap(msg) {
  document.body.innerHTML = `
    <div style="padding:24px;color:#b00020;font-size:20px;font-weight:bold">
      ⛔ Không có quyền truy cập<br>
      <div style="font-size:16px;margin-top:8px;color:#444">${msg}</div>
    </div>`;
}

// =============================
// Default dates
// =============================
function setDefaultDates() {
  const today = new Date();
  inpNgay.value = toIsoDate(today);

  // mặc định lọc: đầu tháng -> hôm nay
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  locTuNgay.value = toIsoDate(firstDay);
  locDenNgay.value = toIsoDate(today);
}

// =============================
// Handsontable
// =============================
function renderHot(rows) {
  const colHeaders = [
    "ID",
    "Ngày",
    "Cơ sở",
    "Mã NV",
    "Tên NV",
    "Loại",
    "Số tiền",
    "Ghi chú",
    "Ref",
    "Tạo lúc",
    "Tạo bởi"
  ];

  const columns = [
    { data: "id", type: "numeric", readOnly: true },
    { data: "ngay_phatsinh", type: "text", readOnly: true },
    { data: "diadiem", type: "text", readOnly: true },
    { data: "manv", type: "text", readOnly: true },
    { data: "tennv", type: "text", readOnly: true },
    { data: "loai_khoan_tru", type: "text", readOnly: true },
    { data: "so_tien", type: "numeric", numericFormat: { pattern: "0,0" }, readOnly: true },
    { data: "ghi_chu", type: "text", readOnly: true },
    { data: "ref_code", type: "text", readOnly: true },
    { data: "created_at", type: "text", readOnly: true },
    { data: "created_by", type: "text", readOnly: true },
  ];

  if (!hot) {
    hot = new Handsontable(hotContainer, {
      data: rows,
      colHeaders,
      columns,
      rowHeaders: true,
      filters: true,
      dropdownMenu: true,
      columnSorting: true,
      wordWrap: true,
      stretchH: "none",
      height: "100%",
      licenseKey: "non-commercial-and-evaluation",

      afterSelection: (r) => {
        currentSelectedRow = r;
      },
    });
  } else {
    hot.loadData(rows);
  }
}

// =============================
// CRUD
// =============================
async function taiDanhSach() {
  const tu_ngay = locTuNgay.value;
  const den_ngay = locDenNgay.value;
  const dd = locDiaDiem.value;
  const manv = normalizeManv(locManv.value);

  if (!tu_ngay || !den_ngay) {
    setStatus("Vui lòng chọn Từ ngày / Đến ngày để tải danh sách.", true);
    return;
  }

  setStatus("Đang tải danh sách...");
  try {
    let q = supabase
      .from("cackhoantru")
      .select("*")
      .gte("ngay_phatsinh", tu_ngay)
      .lte("ngay_phatsinh", den_ngay)
      .order("ngay_phatsinh", { ascending: false })
      .order("id", { ascending: false })
      .limit(2000);

    if (dd) q = q.eq("diadiem", dd);
    if (manv) q = q.eq("manv", manv);

    const { data, error } = await q;
    if (error) throw error;

    renderHot(data || []);
    setStatus(`Đã tải ${data?.length || 0} dòng.`);
  } catch (e) {
    console.error(e);
    setStatus("Lỗi tải danh sách: " + (e?.message || e), true);
    renderHot([]);
  }
}

function resetForm() {
  inpManv.value = "";
  inpTennv.value = "";
  inpSoTien.value = "";
  inpGhiChu.value = "";
  selLoai.value = "TRU_KHAC";
  inpDiaDiem.value = "";
  inpNgay.value = toIsoDate(new Date());
  inpManv.focus();
}

async function luuKhoanTru() {
  const nv = authModule.getCurrentUserInfo?.() || {};
  const manv = normalizeManv(inpManv.value);
  const tennv = String(inpTennv.value || "").trim();
  const diadiem = String(inpDiaDiem.value || "").trim();
  const ngay_phatsinh = inpNgay.value;
  const loai_khoan_tru = selLoai.value;
  const so_tien = parseNum(inpSoTien.value);
  const ghi_chu = String(inpGhiChu.value || "").trim();

  if (!manv) return setStatus("Thiếu Mã NV.", true);
  if (!ngay_phatsinh) return setStatus("Thiếu Ngày phát sinh.", true);
  if (!loai_khoan_tru) return setStatus("Thiếu Loại khoản trừ.", true);
  if (!(so_tien > 0)) return setStatus("Số tiền phải > 0.", true);

  setStatus("Đang lưu...");
  try {
    const ref_code = genRefCode({ manv, ngay_phatsinh, loai: loai_khoan_tru });

    const payload = {
      manv,
      tennv: tennv || null,
      diadiem: diadiem || null,
      ngay_phatsinh,
      loai_khoan_tru,
      so_tien,
      ghi_chu: ghi_chu || null,
      ref_code,
      created_by: nv?.manv || null
    };

    const { error } = await supabase.from("cackhoantru").insert([payload]);
    if (error) throw error;

    setStatus("✅ Đã lưu khoản trừ.");
    await taiDanhSach();
    resetForm();
  } catch (e) {
    console.error(e);
    // nếu ref_code bị trùng (hiếm), sẽ báo unique
    setStatus("Lỗi lưu: " + (e?.message || e), true);
  }
}

async function xoaDongDangChon() {
  const nv = authModule.getCurrentUserInfo?.() || {};
  if (!nv?.is_admin) {
    setStatus("Chỉ admin mới được xóa.", true);
    return;
  }

  if (!hot || currentSelectedRow == null) {
    setStatus("Chưa chọn dòng để xóa.", true);
    return;
  }

  const row = hot.getSourceDataAtRow(currentSelectedRow);
  const id = row?.id;
  if (!id) {
    setStatus("Không lấy được ID dòng đang chọn.", true);
    return;
  }

  const ok = confirm(`Bạn chắc chắn muốn xóa khoản trừ ID=${id}?`);
  if (!ok) return;

  setStatus("Đang xóa...");
  try {
    const { error } = await supabase.from("cackhoantru").delete().eq("id", id);
    if (error) throw error;

    setStatus("✅ Đã xóa.");
    await taiDanhSach();
  } catch (e) {
    console.error(e);
    setStatus("Lỗi xóa: " + (e?.message || e), true);
  }
}

// =============================
// Init
// =============================
async function main() {
  // Khởi tạo login dùng chung giống trang lương :contentReference[oaicite:2]{index=2}
  if (authModule.khoiTaoDangNhapDungChung) {
    await authModule.khoiTaoDangNhapDungChung();
  }

  // Đổi path này đúng theo route bạn deploy
  const ok = await kiemTraQuyenXemTrang("/cackhoantru.html");
  if (!ok) return;

  setDefaultDates();

  const nv = authModule.getCurrentUserInfo?.() || {};
  if (nv?.is_admin) btnXoa.style.display = "inline-block";

  btnTai.addEventListener("click", taiDanhSach);
  btnLuu.addEventListener("click", luuKhoanTru);
  btnMoi.addEventListener("click", resetForm);
  btnXoa.addEventListener("click", xoaDongDangChon);

  // tải danh sách lần đầu
  await taiDanhSach();
}

main();
