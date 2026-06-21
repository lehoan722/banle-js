// bangluongthang.js - Bảng lương tháng tất cả nhân viên (đã tối ưu & hỗ trợ login dùng chung)
// - Fix hiển thị Tên NV (fallback lấy từ bảng công nếu dmnhanvien bị RLS)
// - Tăng tốc tải KPI (doanh thu) bằng chạy song song có giới hạn
// - Tích hợp authModule.khoiTaoDangNhapDungChung + kiểm tra quyền trang
import { supabase } from "./supabaseClient.js";
import * as authModule from "./authModule.js";

const tuNgayInput = document.getElementById("tu_ngay");
const denNgayInput = document.getElementById("den_ngay");
const diadiemSelect = document.getElementById("diadiem");
const luongGioInput = document.getElementById("luong_gio");
const khoanGioInput = document.getElementById("khoan_gio");
const pctThuongInput = document.getElementById("pct_thuong");

const btnTai = document.getElementById("btn-tai");
const btnLuuLuong = document.getElementById("btn-luu-luong");
const selectLuongDaLuu = document.getElementById("chon-bangluong-da-luu");
const btnTaiDsLuongDaLuu = document.getElementById("btn-tai-ds-luong-da-luu");
const btnXemLuongDaLuu = document.getElementById("btn-xem-luong-da-luu");
const btnXoaLuongDaLuu = document.getElementById("btn-xoa-luong-da-luu");
const btnCopyLuong = document.getElementById("btn-copy-luong");
const tbodyLuong = document.getElementById("tbody-bangluong");
const statusEl = document.getElementById("status");

// Container Handsontable
const hotLuongContainer = document.getElementById("hotLuong");
const hotBangCongContainer = document.getElementById("hotBangCong");

// Biến lưu instance Handsontable 
let hotLuong = null;
let hotBangCong = null;
let thongKeCsHienTai = null;

// =============================
// KIỂM SOÁT QUYỀN TRUY CẬP TRANG
// =============================
async function kiemTraQuyenXemTrang(pathTrang) {
  const nv = authModule.getCurrentUserInfo();

  // Chưa login: để authModule giữ overlay đăng nhập
  if (!nv || !nv.manv) return false;

  const { data, error } = await supabase.rpc("get_pages_for_manv", {
    p_manv: nv.manv
  });

  if (error) {
    hienCamTruyCap("Lỗi kiểm tra phân quyền: " + error.message);
    return false;
  }

  const dsTrang = (data || []).map(r => r.path);

  // Không phải admin và không nằm trong danh sách → CẤM
  if (!nv.is_admin && !dsTrang.includes(pathTrang)) {
    hienCamTruyCap(
      `Không có quyền truy cập trang này.<br> Mã NV: ${nv.manv} – ${nv.tennv}`
    );
    return false;
  }

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

function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function setDefaultDates() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

  if (tuNgayInput) tuNgayInput.value = toIsoDate(firstDay);
  if (denNgayInput) denNgayInput.value = toIsoDate(today);
}

function getLastDayOfMonth(dateStr) {
  if (!dateStr) return "";

  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return "";

  const lastDay = new Date(y, m, 0);
  return toIsoDate(lastDay);
}

function autoSetDenNgayTheoTuNgay() {
  const tuNgay = tuNgayInput?.value;
  if (!tuNgay || !denNgayInput) return;

  const [y, m, d] = tuNgay.split("-").map(Number);

  // Chỉ tự động nếu người dùng chọn ngày mùng 1
  if (d === 1) {
    denNgayInput.value = getLastDayOfMonth(tuNgay);
  }
}

function fmt(n, d = 0) {
  if (n == null || Number.isNaN(Number(n))) return "0";
  return Number(n).toLocaleString("vi-VN", {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  });
}

function setStatus(msg, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
  statusEl.style.color = isError ? "#b00020" : "#222";
  statusEl.style.whiteSpace = "pre-line";
}

// =================== HELPERS (tối ưu & normalize) ===================
function normalizeManv(v) {
  return String(v || "").trim().toUpperCase();
}

function parseYMD(s) {
  const [y, m, d] = String(s || "").split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function listMonthsBetween(tu_ngay, den_ngay) {
  const a = parseYMD(tu_ngay);
  const b = parseYMD(den_ngay);
  const start = new Date(a.getFullYear(), a.getMonth(), 1);
  const end = new Date(b.getFullYear(), b.getMonth(), 1);

  const out = [];
  let cur = new Date(start);
  while (cur <= end) {
    out.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

/**
 * Lấy map {MANV: TENNV}
 * - Ưu tiên: dmnhanvien (nhanh)
 * - Fallback: chamcong_bangcong_monthly (để admin login vẫn có Tên NV dù dmnhanvien bị RLS)
 */
async function loadTenNhanVienForRange(tu_ngay, den_ngay, manvArr) {
  const mapTen = {};

  // (A) Thử lấy từ dmnhanvien
  try {
    const { data: nvData, error: nvErr } = await supabase
      .from("dmnhanvien")
      .select("manv, tennv")
      .in("manv", manvArr);

    if (!nvErr && Array.isArray(nvData) && nvData.length) {
      nvData.forEach(n => {
        const k = normalizeManv(n.manv);
        if (k) mapTen[k] = String(n.tennv || "").trim();
      });
      return mapTen;
    }
  } catch (e) {
    console.warn("Không lấy được dmnhanvien (có thể do RLS):", e);
  }

  // (B) Fallback: lấy từ bảng công tháng
  try {
    const months = listMonthsBetween(tu_ngay, den_ngay);
    for (const { year, month } of months) {
      const { data, error } = await supabase.rpc("chamcong_bangcong_monthly", {
        p_month: month,
        p_year: year
      });

      if (error || !Array.isArray(data)) continue;

      for (const r of data) {
        const k = normalizeManv(r.manv);
        if (k && !mapTen[k]) mapTen[k] = String(r.tennv || "").trim();
      }
    }
  } catch (e) {
    console.warn("Fallback lấy tên từ chamcong_bangcong_monthly bị lỗi:", e);
  }

  return mapTen;
}

/**
 * Lấy doanh thu KPI theo nhân viên (RPC nv_match2h_summary_all_v2)
 * - Chạy song song có giới hạn để nhanh (mặc định 6 luồng)
 */
async function loadDoanhThuKPIConcurrent(manvArr, tu_ngay, den_ngay, concurrency = 6) {
  const mapDoanhThu = {};
  const mapHoaHong = {};
  const list = [...manvArr];
  let idx = 0;
  let done = 0;

  async function worker() {
    while (idx < list.length) {
      const manv = list[idx++];
      try {
        const { data: kpiData, error: kpiErr } = await supabase.rpc(
          "nv_match2h_summary_all_v2",
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
          console.error(`Lỗi nv_match2h_summary_all_v2 cho NV ${manv}:`, kpiErr);
          mapDoanhThu[manv] = 0;
          mapHoaHong[manv] = 0;
        } else {
          mapDoanhThu[manv] = Number(kpiData?.[0]?.tong_doanh_thu || 0);
          mapHoaHong[manv] = Number(kpiData?.[0]?.tong_hoa_hong || 0);
        }
      } catch (e) {
        console.error(`KPI exception cho ${manv}:`, e);
        mapDoanhThu[manv] = 0;
        mapHoaHong[manv] = 0;
      } finally {
        done++;
        // cập nhật nhẹ trạng thái (không spam quá nhiều)
        if (done % 5 === 0 || done === list.length) {
          setStatus(`Đang tải doanh thu KPI... (${done}/${list.length})`);
        }
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, list.length || 1) },
    () => worker()
  );
  await Promise.all(workers);
  return { mapDoanhThu, mapHoaHong };
}

/**
 * Lấy map khoản trừ: { MANV: tong_so_tien }
 * Rule diadiem:
 * - Nếu trang lương chọn cs1/cs2: lấy (diadiem = csX) OR (diadiem IS NULL) OR (diadiem = "")
 * - Nếu chọn "Tất cả": không lọc diadiem
 */
async function loadKhoanTruForRange(tu_ngay, den_ngay, diadiem, manvArr) {
  const mapKhoanTru = {};
  const list = (manvArr || []).map(normalizeManv).filter(Boolean);

  if (!list.length) return mapKhoanTru;

  try {
    let q = supabase
      .from("cackhoantru")
      .select("manv, so_tien, diadiem")
      .gte("ngay_phatsinh", tu_ngay)
      .lte("ngay_phatsinh", den_ngay)
      .in("manv", list);

    // Nếu đang chọn cs1/cs2: vẫn tính cả diadiem trống
    if (diadiem) {
      q = q.or(`diadiem.eq.${diadiem},diadiem.is.null,diadiem.eq.""`);
    }

    const { data, error } = await q;
    if (error) {
      console.error("Lỗi loadKhoanTruForRange:", error);
      return mapKhoanTru;
    }

    (data || []).forEach(r => {
      const k = normalizeManv(r.manv);
      if (!k) return;
      mapKhoanTru[k] = (mapKhoanTru[k] || 0) + Number(r.so_tien || 0);
    });

    return mapKhoanTru;
  } catch (e) {
    console.error("Exception loadKhoanTruForRange:", e);
    return mapKhoanTru;
  }
}


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
    "Giờ công ",
    "Giờ trừ ",
    "Giờ tính lương",
    "Doanh thu",
    "Hoa hồng",
    "Khoán /g",
    "Khoán tháng",
    "Tiền vượt",
    "Thưởng vượt kh",
    "Lương cứng",
    "Tổng lương",
    "Các khoản trừ",
    "Thực lĩnh",
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

    // Tổng lương
    { data: 13, type: "numeric", numericFormat: { pattern: "0,0" } },

    // ✅ 2 cột mới
    { data: 14, type: "numeric", numericFormat: { pattern: "0,0" } }, // Các khoản trừ
    { data: 15, type: "numeric", numericFormat: { pattern: "0,0" } }, // Thực lĩnh

    // Lương/1 giờ
    { data: 16, type: "numeric", numericFormat: { pattern: "0,0" } }
  ];

  // 👇 Độ rộng từng cột (bạn muốn chỉnh thì chỉ sửa mảng này)
  const colWidths = [
    70,  // Mã NV
    90,  // Tên NV
    80,  // Cơ sở
    90,  // Giờ công (thực)
    100, // Giờ trừ TANCA_LỊCH
    100, // Giờ tính lương
    70,  // Doanh thu
    70,  // Hoa hồng
    70,  // Khoán / giờ
    70,  // Khoán theo giờ công
    110, // Doanh thu vượt khoán
    110, // Thưởng vượt khoán
    90,  // Lương cứng
    90,  // Tổng lương

    90,  // ✅ Các khoản trừ
    90,  // ✅ Thực lĩnh

    90   // Lương/1 giờ
  ];

  // Ẩn cột tự động (nếu muốn)
  const hiddenColsConfig = {
    columns: [],
    indicators: true
  };

  const settings = {
    data,
    colHeaders,
    columns,
    colWidths,
    rowHeaders: true,
    filters: true,
    dropdownMenu: true,
    columnSorting: true,
    wordWrap: true,
    // ✅ QUAN TRỌNG: đặt chiều cao header đủ cho 2 dòng
    columnHeaderHeight: 44,  // bạn có thể chỉnh 40/44/48 tuỳ header dài

    // (khuyến nghị) chiều cao dòng dữ liệu ổn định
    rowHeights: 26,
    hiddenColumns: hiddenColsConfig,
    licenseKey: "non-commercial-and-evaluation"
  };

  if (!hotLuong) {
    hotLuong = new HOT(hotLuongContainer, settings);
  } else {
    hotLuong.updateSettings(settings);
    hotLuong.render();
  }
}

async function luuBangLuongThang() {
  if (!hotLuong) {
    alert("Chưa có dữ liệu bảng lương để lưu. Vui lòng bấm Tải bảng lương trước.");
    return;
  }

  const tu_ngay = tuNgayInput?.value;
  const den_ngay = denNgayInput?.value;
  const diadiem = diadiemSelect?.value || null;
  const luong_gio = Number(luongGioInput?.value || 0);
  const khoan_gio = Number(khoanGioInput?.value || 0);
  const pct_thuong = Number(pctThuongInput?.value || 0);

  if (!tu_ngay || !den_ngay) {
    alert("Vui lòng chọn Từ ngày và Đến ngày.");
    return;
  }

  const data = hotLuong.getData() || [];

  if (!data.length) {
    alert("Bảng lương chưa có dữ liệu.");
    return;
  }

  const dongTong = data.find(r => String(r[0] || "").trim().toUpperCase() === "TỔNG");

  const tong_luong = Number(dongTong?.[13] || 0);
  const tong_khoan_tru = Number(dongTong?.[14] || 0);
  const tong_thuc_linh = Number(dongTong?.[15] || 0);

  const ok = confirm(
    `Bạn có chắc muốn lưu/chốt bảng lương từ ${tu_ngay} đến ${den_ngay} không?\n\n` +
    `Tổng lương: ${fmt(tong_luong, 0)} đ\n` +
    `Khoản trừ: ${fmt(tong_khoan_tru, 0)} đ\n` +
    `Thực lĩnh: ${fmt(tong_thuc_linh, 0)} đ`
  );

  if (!ok) return;

  try {
    setStatus("Đang lưu bảng lương...");

    const nv = authModule.getCurrentUserInfo?.();
    const created_by = nv?.manv || nv?.email || "";

    // 1. Lưu đầu bảng lương
    const { data: headerData, error: headerError } = await supabase
      .from("bangluong_thang")
      .insert({
        tu_ngay,
        den_ngay,
        diadiem,
        luong_gio,
        khoan_gio,
        pct_thuong,
        tong_luong,
        tong_khoan_tru,
        tong_thuc_linh,
        thongke_cs: thongKeCsHienTai || {},
        ghichu: "Chốt từ trang bảng lương tháng",
        created_by
      })
      .select("id")
      .single();

    if (headerError) {
      console.error("Lỗi lưu bangluong_thang:", headerError);
      alert("Lỗi lưu đầu bảng lương: " + headerError.message);
      setStatus("Lỗi lưu bảng lương.", true);
      return;
    }

    const bangluong_id = headerData.id;

    // 2. Lưu chi tiết từng nhân viên, bỏ dòng TỔNG
    const chiTietRows = data
      .filter(r => String(r[0] || "").trim().toUpperCase() !== "TỔNG")
      .map((r, index) => ({
        bangluong_id,
        stt: index + 1,

        manv: r[0] || "",
        tennv: r[1] || "",
        diadiem: r[2] || "",

        gio_cong: Number(r[3] || 0),
        gio_tru: Number(r[4] || 0),
        gio_tinh_luong: Number(r[5] || 0),

        doanh_thu: Number(r[6] || 0),
        hoa_hong: Number(r[7] || 0),
        khoan_gio: Number(r[8] || 0),
        khoan_thang: Number(r[9] || 0),
        tien_vuot: Number(r[10] || 0),
        thuong_vuot_khoan: Number(r[11] || 0),
        luong_cung: Number(r[12] || 0),
        tong_luong: Number(r[13] || 0),
        khoan_tru: Number(r[14] || 0),
        thuc_linh: Number(r[15] || 0),
        luong_1_gio: Number(r[16] || 0)
      }));

    if (!chiTietRows.length) {
      alert("Không có dòng nhân viên nào để lưu.");
      setStatus("Không có dữ liệu chi tiết để lưu.", true);
      return;
    }

    const { error: detailError } = await supabase
      .from("bangluong_thang_chitiet")
      .insert(chiTietRows);

    if (detailError) {
      console.error("Lỗi lưu bangluong_thang_chitiet:", detailError);
      alert("Lỗi lưu chi tiết bảng lương: " + detailError.message);
      setStatus("Lỗi lưu chi tiết bảng lương.", true);
      return;
    }

    setStatus(`Đã lưu bảng lương thành công. Mã chốt: ${bangluong_id}`);
    alert("Đã lưu/chốt bảng lương thành công.");

  } catch (e) {
    console.error("Exception luuBangLuongThang:", e);
    alert("Có lỗi xảy ra khi lưu bảng lương.");
    setStatus("Có lỗi xảy ra khi lưu bảng lương.", true);
  }
}

async function taiDanhSachBangLuongDaLuu() {
  if (!selectLuongDaLuu) return;

  try {
    setStatus("Đang tải danh sách bảng lương đã lưu...");

    const { data, error } = await supabase
      .from("bangluong_thang")
      .select("id, tu_ngay, den_ngay, diadiem, tong_luong, tong_thuc_linh, created_at, created_by")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Lỗi tải danh sách bảng lương đã lưu:", error);
      alert("Lỗi tải danh sách bảng lương đã lưu: " + error.message);
      setStatus("Lỗi tải danh sách bảng lương đã lưu.", true);
      return;
    }

    selectLuongDaLuu.innerHTML = `<option value="">-- Chọn bảng lương đã lưu --</option>`;

    (data || []).forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.id;

      const ngayTao = r.created_at
        ? new Date(r.created_at).toLocaleString("vi-VN")
        : "";

      opt.textContent =
        `${r.tu_ngay} → ${r.den_ngay}` +
        ` | ${r.diadiem || "Tất cả"}` +
        ` | Thực lĩnh: ${fmt(r.tong_thuc_linh, 0)} đ` +
        ` | ${ngayTao}` +
        `${r.created_by ? " | " + r.created_by : ""}`;

      selectLuongDaLuu.appendChild(opt);
    });

    setStatus(`Đã tải ${data?.length || 0} bản lương đã lưu.`);

  } catch (e) {
    console.error("Exception taiDanhSachBangLuongDaLuu:", e);
    alert("Có lỗi khi tải danh sách bảng lương đã lưu.");
    setStatus("Có lỗi khi tải danh sách bảng lương đã lưu.", true);
  }
}

async function xemBangLuongDaLuu() {
  const bangluong_id = selectLuongDaLuu?.value;

  if (!bangluong_id) {
    alert("Vui lòng chọn một bảng lương đã lưu.");
    return;
  }

  try {
    setStatus("Đang tải chi tiết bảng lương đã lưu...");

    // 1. Lấy đầu bảng lương
    const { data: header, error: headerError } = await supabase
      .from("bangluong_thang")
      .select("*")
      .eq("id", bangluong_id)
      .single();

    if (headerError) {
      console.error("Lỗi tải đầu bảng lương:", headerError);
      alert("Lỗi tải đầu bảng lương: " + headerError.message);
      setStatus("Lỗi tải đầu bảng lương.", true);
      return;
    }

    // 2. Lấy chi tiết bảng lương
    const { data: rows, error: detailError } = await supabase
      .from("bangluong_thang_chitiet")
      .select("*")
      .eq("bangluong_id", bangluong_id)
      .order("stt", { ascending: true });

    if (detailError) {
      console.error("Lỗi tải chi tiết bảng lương:", detailError);
      alert("Lỗi tải chi tiết bảng lương: " + detailError.message);
      setStatus("Lỗi tải chi tiết bảng lương.", true);
      return;
    }

    const bangLuongData = (rows || []).map(r => [
      r.manv || "",
      r.tennv || "",
      r.diadiem || "",
      Number(r.gio_cong || 0),
      Number(r.gio_tru || 0),
      Number(r.gio_tinh_luong || 0),
      Number(r.doanh_thu || 0),
      Number(r.hoa_hong || 0),
      Number(r.khoan_gio || 0),
      Number(r.khoan_thang || 0),
      Number(r.tien_vuot || 0),
      Number(r.thuong_vuot_khoan || 0),
      Number(r.luong_cung || 0),
      Number(r.tong_luong || 0),
      Number(r.khoan_tru || 0),
      Number(r.thuc_linh || 0),
      Number(r.luong_1_gio || 0)
    ]);

    // 3. Thêm dòng TỔNG cuối bảng
    const tongGioCong = bangLuongData.reduce((s, r) => s + Number(r[3] || 0), 0);
    const tongGioTru = bangLuongData.reduce((s, r) => s + Number(r[4] || 0), 0);
    const tongGioTinh = bangLuongData.reduce((s, r) => s + Number(r[5] || 0), 0);
    const tongDoanhThu = bangLuongData.reduce((s, r) => s + Number(r[6] || 0), 0);
    const tongHoaHong = bangLuongData.reduce((s, r) => s + Number(r[7] || 0), 0);
    const tongKhoanThang = bangLuongData.reduce((s, r) => s + Number(r[9] || 0), 0);
    const tongTienVuot = bangLuongData.reduce((s, r) => s + Number(r[10] || 0), 0);
    const tongThuongVuot = bangLuongData.reduce((s, r) => s + Number(r[11] || 0), 0);
    const tongLuongCung = bangLuongData.reduce((s, r) => s + Number(r[12] || 0), 0);
    const tongLuong = bangLuongData.reduce((s, r) => s + Number(r[13] || 0), 0);
    const tongKhoanTru = bangLuongData.reduce((s, r) => s + Number(r[14] || 0), 0);
    const tongThucLinh = bangLuongData.reduce((s, r) => s + Number(r[15] || 0), 0);

    bangLuongData.push([
      "TỔNG",
      "",
      "",
      Number(tongGioCong.toFixed(2)),
      Number(tongGioTru.toFixed(2)),
      Number(tongGioTinh.toFixed(2)),
      Math.round(tongDoanhThu),
      Math.round(tongHoaHong),
      Number(header.khoan_gio || 0),
      Math.round(tongKhoanThang),
      Math.round(tongTienVuot),
      Math.round(tongThuongVuot),
      Math.round(tongLuongCung),
      Math.round(tongLuong),
      Math.round(tongKhoanTru),
      Math.round(tongThucLinh),
      Math.round(tongGioCong > 0 ? tongLuong / tongGioCong : 0)
    ]);

    // 4. Render lại vào bảng lương hiện tại
    renderLuongHot(bangLuongData);

    // 5. Đổ lại thông tin kỳ lương lên bộ lọc
    if (tuNgayInput) tuNgayInput.value = header.tu_ngay || "";
    if (denNgayInput) denNgayInput.value = header.den_ngay || "";
    if (diadiemSelect) diadiemSelect.value = header.diadiem || "";
    if (luongGioInput) luongGioInput.value = header.luong_gio || 0;
    if (khoanGioInput) khoanGioInput.value = header.khoan_gio || 0;
    if (pctThuongInput) pctThuongInput.value = header.pct_thuong || 0;

    const thongKeCs = header.thongke_cs || {};

    const dongThongKeCS = ["cs1", "cs2"]
      .map(cs => {
        const r = thongKeCs[cs];
        if (!r) return null;

        return (
          `${cs.toUpperCase()}: DT/giờ công ${fmt(r.dt_moi_gio, 0)} đ/h | ` +
          `Khoán ${fmt(r.khoan_gio, 0)} đ/h | ` +
          `Đạt ${Number(r.ty_le_dat || 0).toFixed(1)}%`
        );
      })
      .filter(Boolean)
      .join("\n");

    setStatus(
      `Đã tải bảng lương đã lưu: ${header.tu_ngay} → ${header.den_ngay} | ` +
      `Tổng lương: ${fmt(header.tong_luong, 0)} đ | ` +
      `Khoản trừ: ${fmt(header.tong_khoan_tru, 0)} đ | ` +
      `Thực lĩnh: ${fmt(header.tong_thuc_linh, 0)} đ` +
      (dongThongKeCS ? `\n${dongThongKeCS}` : "")
    );

  } catch (e) {
    console.error("Exception xemBangLuongDaLuu:", e);
    alert("Có lỗi khi xem bảng lương đã lưu.");
    setStatus("Có lỗi khi xem bảng lương đã lưu.", true);
  }
}

async function xoaBangLuongDaLuu() {
  const bangluong_id = selectLuongDaLuu?.value;

  if (!bangluong_id) {
    alert("Vui lòng chọn bảng lương đã lưu cần xóa.");
    return;
  }

  const selectedText =
    selectLuongDaLuu.options[selectLuongDaLuu.selectedIndex]?.textContent || "";

  const ok = confirm(
    "Bạn có chắc muốn xóa bảng lương đã lưu này không?\n\n" +
    selectedText +
    "\n\nDữ liệu chi tiết cũng sẽ bị xóa theo."
  );

  if (!ok) return;

  try {
    setStatus("Đang xóa bảng lương đã lưu...");

    const { error } = await supabase
      .from("bangluong_thang")
      .delete()
      .eq("id", bangluong_id);

    if (error) {
      console.error("Lỗi xóa bảng lương:", error);
      alert("Lỗi xóa bảng lương đã lưu: " + error.message);
      setStatus("Lỗi xóa bảng lương đã lưu.", true);
      return;
    }

    alert("Đã xóa bảng lương đã lưu.");

    if (selectLuongDaLuu) {
      selectLuongDaLuu.value = "";
    }

    renderLuongHot([]);
    await taiDanhSachBangLuongDaLuu();

    setStatus("Đã xóa bảng lương đã lưu.");

  } catch (e) {
    console.error("Exception xoaBangLuongDaLuu:", e);
    alert("Có lỗi xảy ra khi xóa bảng lương đã lưu.");
    setStatus("Có lỗi xảy ra khi xóa bảng lương đã lưu.", true);
  }
}

async function copyBangLuong() {
  if (!hotLuong) {
    alert("Chưa có dữ liệu bảng lương để copy.");
    return;
  }

  const headers = hotLuong.getColHeader();
  const data = hotLuong.getData();

  const lines = [];

  // Dòng tiêu đề: thêm STT
  lines.push(["STT", ...headers].join("\t"));

  // Dữ liệu: thêm số thứ tự
  data.forEach((row, index) => {
    const cleanRow = row.map(v => v == null ? "" : String(v));
    lines.push([index + 1, ...cleanRow].join("\t"));
  });

  const text = lines.join("\n");

  try {
    await navigator.clipboard.writeText(text);
    setStatus("Đã copy toàn bộ bảng lương gồm tiêu đề và số thứ tự.");
  } catch (e) {
    console.error("Lỗi copy bảng lương:", e);
    alert("Không copy được dữ liệu. Vui lòng thử lại.");
  }
}

function renderBangCongHot(colHeaders, data) {
  if (!hotBangCongContainer) return;
  const HOT = window.Handsontable;
  if (!HOT) {
    console.error("Handsontable chưa được nạp.");
    return;
  }

  const settings = {
    data,
    colHeaders,
    rowHeaders: true,
    width: "100%",
    height: 430,
    stretchH: "all",
    manualColumnResize: true,
    manualRowResize: true,
    filters: true,
    dropdownMenu: true,
    columnSorting: true,
    licenseKey: "non-commercial-and-evaluation"
  };

  if (!hotBangCong) {
    hotBangCong = new HOT(hotBangCongContainer, settings);
  } else {
    hotBangCong.updateSettings(settings);
  }
}

async function taiBangLuong() {
  const tu_ngay = tuNgayInput?.value;
  const den_ngay = denNgayInput?.value;
  const diadiem = diadiemSelect?.value || null;
  const luong_gio = parseFloat(luongGioInput?.value || "0") || 0;
  const khoan_gio = parseFloat(khoanGioInput?.value || "0") || 0;
  const pct_thuong = parseFloat(pctThuongInput?.value || "0") || 0;

  if (!tu_ngay || !den_ngay) {
    alert("Vui lòng chọn khoảng Từ ngày - Đến ngày.");
    return;
  }

  setStatus("Đang tải dữ liệu lương...");
  if (tbodyLuong) tbodyLuong.innerHTML = `<tr><td colspan="14">Đang tải...</td></tr>`;

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
      if (tbodyLuong) {
        tbodyLuong.innerHTML = `<tr><td colspan="14" style="color:red;">Lỗi chamcong_tinhcong_monthly.</td></tr>`;
      }
      renderLuongHot([]); // clear HOT
      return;
    }

    if (!congData || congData.length === 0) {
      setStatus("Không có dữ liệu.");
      if (tbodyLuong) tbodyLuong.innerHTML = `<tr><td colspan="14">Không có dữ liệu.</td></tr>`;
      renderLuongHot([]); // clear HOT
      return;
    }

    // 2) Danh sách MANV
    const manvSet = new Set(congData.map(r => normalizeManv(r.manv)));
    const manvArr = Array.from(manvSet).filter(Boolean);

    // 2a) Tên NV (2 tầng)
    setStatus(`Đang lấy tên nhân viên... (${manvArr.length} NV)`);
    const mapTen = await loadTenNhanVienForRange(tu_ngay, den_ngay, manvArr);

    // 2b) Doanh thu KPI (song song)
    setStatus(`Đang tải doanh thu KPI... (0/${manvArr.length})`);
    const { mapDoanhThu: mapDoanhThuKPI, mapHoaHong: mapHoaHongKPI } = await loadDoanhThuKPIConcurrent(
      manvArr,
      tu_ngay,
      den_ngay,
      2
    );

    // 2c) Khoản trừ (ứng lương / phạt...) theo kỳ
    setStatus(`Đang tải các khoản trừ...`);
    const mapKhoanTru = await loadKhoanTruForRange(tu_ngay, den_ngay, diadiem, manvArr);

    // 3) Gom dữ liệu theo MANV
    const byManv = {};
    congData.forEach(r => {
      const k = normalizeManv(r.manv);
      if (!k) return;
      if (!byManv[k]) byManv[k] = [];
      byManv[k].push({ ...r, manv: k });
    });

    // Reset bảng HTML
    if (tbodyLuong) tbodyLuong.innerHTML = "";

    // Dữ liệu cho Handsontable
    const bangLuongData = [];

    // Cộng dồn tổng
    let sum_gio_cong = 0;
    let sum_gio_phat = 0;
    let sum_gio_tinh = 0;
    let sum_doanhthu = 0;

    const thongKeTheoCS = {
      cs1: { doanhthu: 0, gio_tinh: 0 },
      cs2: { doanhthu: 0, gio_tinh: 0 }
    };

    let sum_hoa_hong = 0;
    let sum_khoan_thang = 0;
    let sum_tien_vuot = 0;
    let sum_tien_thuong = 0;
    let sum_luong_cung = 0;
    let sum_tong_luong = 0;
    let sum_khoan_tru = 0;
    let sum_thuc_linh = 0;

    // 4) Tính theo nhân viên
    const manvKeys = Object.keys(byManv).sort();
    for (const manv of manvKeys) {
      const rows = byManv[manv];
      const ten = mapTen[normalizeManv(manv)] || "";
      const dia = rows?.[0]?.diadiem || "";

      let gio_cong = 0;
      let so_ngay_tanca_lich = 0;
      rows.forEach(r => {
        gio_cong += Number(r.tong_gio_cong || 0);
        so_ngay_tanca_lich += Number(r.so_ngay_tanca_lich || 0);
      });

      const gio_phat_tanca_lich = so_ngay_tanca_lich * 1.0;
      const gio_tinh = Math.max(gio_cong - gio_phat_tanca_lich, 0);

      const doanhthu = Number(mapDoanhThuKPI[normalizeManv(manv)] || 0);
      const hoa_hong = Number(mapHoaHongKPI[normalizeManv(manv)] || 0);

      const khoan_thang = gio_tinh * khoan_gio;
      const tien_vuot = doanhthu - khoan_thang;              // cho phép âm
      const tien_thuong = tien_vuot * (pct_thuong / 100.0);  // thưởng/phạt

      const luong_cung = gio_tinh * luong_gio;
      const tong_luong = luong_cung + tien_thuong + hoa_hong;
      const khoan_tru = Number(mapKhoanTru[normalizeManv(manv)] || 0);
      const thuc_linh = tong_luong - khoan_tru;
      const luong_1_gio = gio_cong > 0 ? tong_luong / gio_cong : 0;


      // Cộng dồn
      sum_gio_cong += gio_cong;
      sum_gio_phat += gio_phat_tanca_lich;
      sum_gio_tinh += gio_tinh;
      sum_doanhthu += doanhthu;

      const keyCS = String(dia || "").trim().toLowerCase();

      if (thongKeTheoCS[keyCS]) {
        thongKeTheoCS[keyCS].doanhthu += doanhthu;
        thongKeTheoCS[keyCS].gio_tinh += gio_tinh;
      }

      sum_hoa_hong += hoa_hong;
      sum_khoan_thang += khoan_thang;
      sum_tien_vuot += tien_vuot;
      sum_tien_thuong += tien_thuong;
      sum_luong_cung += luong_cung;
      sum_tong_luong += tong_luong;
      sum_khoan_tru += khoan_tru;
      sum_thuc_linh += thuc_linh;

      // HTML row
      if (tbodyLuong) {
        const tr = document.createElement("tr");
        const add = (txt) => {
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
        add(fmt(hoa_hong, 0));
        add(fmt(khoan_gio, 0));
        add(fmt(khoan_thang, 0));
        add(fmt(tien_vuot, 0));
        add(fmt(tien_thuong, 0));
        add(fmt(luong_cung, 0));
        add(fmt(tong_luong, 0));
        add(fmt(khoan_tru, 0));
        add(fmt(thuc_linh, 0));
        add(fmt(luong_1_gio, 0));
        tbodyLuong.appendChild(tr);
      }

      // Handsontable row
      bangLuongData.push([
        manv,
        ten,
        dia,
        Number(gio_cong.toFixed(2)),
        Number(gio_phat_tanca_lich.toFixed(2)),
        Number(gio_tinh.toFixed(2)),
        Math.round(doanhthu),
        Math.round(hoa_hong),
        Math.round(khoan_gio),
        Math.round(khoan_thang),
        Math.round(tien_vuot),
        Math.round(tien_thuong),
        Math.round(luong_cung),
        Math.round(tong_luong),

        Math.round(khoan_tru),     // ✅ mới
        Math.round(thuc_linh),     // ✅ mới

        Math.round(luong_1_gio)
      ]);
    }

    // 5) Dòng tổng
    if (tbodyLuong) {
      const trTotal = document.createElement("tr");
      trTotal.className = "table-secondary fw-bold";
      const addTotal = (txt, colspan = 1) => {
        const td = document.createElement("td");
        if (colspan > 1) td.colSpan = colspan;
        td.textContent = txt;
        trTotal.appendChild(td);
      };

      addTotal("TỔNG");
      addTotal("", 2); // Tên NV + Cơ sở
      addTotal(fmt(sum_gio_cong, 2));
      addTotal(fmt(sum_gio_phat, 2));
      addTotal(fmt(sum_gio_tinh, 2));
      addTotal(fmt(sum_doanhthu, 0));
      addTotal(fmt(sum_hoa_hong, 0));
      addTotal(fmt(khoan_gio, 0));
      addTotal(fmt(sum_khoan_thang, 0));
      addTotal(fmt(sum_tien_vuot, 0));
      addTotal(fmt(sum_tien_thuong, 0));
      addTotal(fmt(sum_luong_cung, 0));
      addTotal(fmt(sum_tong_luong, 0));
      addTotal(fmt(sum_khoan_tru, 0));
      addTotal(fmt(sum_thuc_linh, 0));

      // Lương/1 giờ tổng: lấy theo tổng giờ công để tránh lệch
      const luong1hTong = sum_gio_cong > 0 ? sum_tong_luong / sum_gio_cong : 0;
      addTotal(fmt(luong1hTong, 0));

      tbodyLuong.appendChild(trTotal);
    }

    // Thêm dòng tổng vào HOT
    bangLuongData.push([
      "TỔNG",
      "",
      "",
      Number(sum_gio_cong.toFixed(2)),
      Number(sum_gio_phat.toFixed(2)),
      Number(sum_gio_tinh.toFixed(2)),
      Math.round(sum_doanhthu),
      Math.round(sum_hoa_hong),
      Math.round(khoan_gio),
      Math.round(sum_khoan_thang),
      Math.round(sum_tien_vuot),
      Math.round(sum_tien_thuong),
      Math.round(sum_luong_cung),
      Math.round(sum_tong_luong),
      Math.round(sum_khoan_tru),   // ✅ mới
      Math.round(sum_thuc_linh),   // ✅ mới
      Math.round(sum_gio_cong > 0 ? sum_tong_luong / sum_gio_cong : 0)
    ]);

    // Render HOT
    renderLuongHot(bangLuongData);

    thongKeCsHienTai = {};

    const dongThongKeCS = ["cs1", "cs2"]
      .map(cs => {
        const doanhthu = thongKeTheoCS[cs].doanhthu;
        const gioTinh = thongKeTheoCS[cs].gio_tinh;

        if (gioTinh <= 0) return null;

        const dtMoiGio = doanhthu / gioTinh;
        const tyLeDat = khoan_gio > 0 ? (dtMoiGio / khoan_gio) * 100 : 0;

        thongKeCsHienTai[cs] = {
          doanhthu: Math.round(doanhthu),
          gio_tinh: Number(gioTinh.toFixed(2)),
          dt_moi_gio: Math.round(dtMoiGio),
          khoan_gio: Math.round(khoan_gio),
          ty_le_dat: Number(tyLeDat.toFixed(1))
        };

        return (
          `${cs.toUpperCase()}: DT/giờ công ${fmt(dtMoiGio, 0)} đ/h | ` +
          `Khoán ${fmt(khoan_gio, 0)} đ/h | ` +
          `Đạt ${tyLeDat.toFixed(1)}%`
        );
      })
      .filter(Boolean)
      .join("\n");

    setStatus(
      `Đã tải xong. Tổng lương: ${fmt(sum_tong_luong, 0)} đ | ` +
      `Khoản trừ: ${fmt(sum_khoan_tru, 0)} đ | ` +
      `Thực lĩnh: ${fmt(sum_thuc_linh, 0)} đ` +
      (dongThongKeCS ? `\n${dongThongKeCS}` : "")
    );
  } catch (e) {
    console.error(e);
    setStatus("Có lỗi xảy ra khi tải bảng lương.", true);
    if (tbodyLuong) {
      tbodyLuong.innerHTML = `<tr><td colspan="14" style="color:red;">Có lỗi xảy ra.</td></tr>`;
    }
    renderLuongHot([]);
  }
}

async function taiBangCong() {
  const thang = parseInt(document.getElementById("bc-thang")?.value || "0");
  const nam = parseInt(document.getElementById("bc-nam")?.value || "0");
  const tbody = document.getElementById("tbody-bangcong");
  const thead = document.getElementById("thead-bangcong");

  if (!thang || !nam) {
    alert("Vui lòng nhập tháng và năm.");
    return;
  }

  const tu_ngay = `${nam}-${String(thang).padStart(2, "0")}-01`;
  const den_ngay = toIsoDate(new Date(nam, thang, 0));

  tbody.innerHTML = `<tr><td colspan="50">Đang tải...</td></tr>`;

  const { data, error } = await supabase
    .rpc("chamcong_tinhcong_monthly", {
      tu_ngay,
      den_ngay,
      p_diadiem: null,
      p_manv: null
    })
    .range(0, 9999);

  if (error) {
    console.error("Lỗi tải bảng công:", error);
    tbody.innerHTML = `<tr><td colspan="50">Lỗi tải dữ liệu</td></tr>`;
    renderBangCongHot([], []);
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="50">Không có dữ liệu.</td></tr>`;
    renderBangCongHot([], []);
    return;
  }

  const nhanvien = [
    ...new Set(
      data
        .filter(d => Number(d.tong_gio_cong || 0) > 0)
        .map(d => `${normalizeManv(d.manv)}|${d.tennv || d.manv}`)
    )
  ];

  const colHeaders = ["Ngày", "Thứ"];
  nhanvien.forEach(n => {
    const [, tennv] = n.split("|");
    colHeaders.push(tennv);
  });
  colHeaders.push("Tổng");

  let header = `<th>Ngày</th><th>Thứ</th>`;
  nhanvien.forEach(n => {
    const [, tennv] = n.split("|");
    header += `<th>${tennv}</th>`;
  });
  header += `<th>Tổng</th>`;
  thead.innerHTML = `<tr>${header}</tr>`;

  const groupByNgay = {};
  data.forEach(d => {
    const ngay = Number(String(d.ngay || d.ngay_date || d.ngay_chamcong || "").slice(-2));
    if (!ngay) return;

    groupByNgay[ngay] = groupByNgay[ngay] || [];
    groupByNgay[ngay].push(d);
  });

  const soNgayTrongThang = new Date(nam, thang, 0).getDate();
  const hotData = [];
  const tongTheoNhanVien = {};
  nhanvien.forEach(n => {
    tongTheoNhanVien[normalizeManv(n.split("|")[0])] = 0;
  });

  let tongTatCa = 0;
  let html = "";

  for (let ng = 1; ng <= soNgayTrongThang; ng++) {
    const row = groupByNgay[ng] || [];
    const ngayDate = new Date(nam, thang - 1, ng);
    const thu = ngayDate.toLocaleDateString("en-US", { weekday: "short" });

    let sum = 0;
    const rowData = [ng, thu];
    let cellsHtml = "";

    nhanvien.forEach(n => {
      const manv = normalizeManv(n.split("|")[0]);
      const found = row.find(r => normalizeManv(r.manv) === manv);
      const gioCong = found ? Number(found.tong_gio_cong || 0) : 0;

      sum += gioCong;
      tongTheoNhanVien[manv] += gioCong;

      rowData.push(Number(gioCong.toFixed(2)));
      cellsHtml += `<td>${gioCong ? gioCong.toFixed(2) : ""}</td>`;
    });

    tongTatCa += sum;
    rowData.push(Number(sum.toFixed(2)));
    hotData.push(rowData);

    html += `<tr><td>${ng}</td><td>${thu}</td>${cellsHtml}<td>${sum ? sum.toFixed(2) : ""}</td></tr>`;
  }

  const totalRow = ["Tổng", ""];
  let totalHtml = `<tr style="font-weight:bold;background:#f3f3f3"><td colspan="2">Tổng</td>`;

  nhanvien.forEach(n => {
    const manv = normalizeManv(n.split("|")[0]);
    const tong = Number(tongTheoNhanVien[manv] || 0);
    totalRow.push(Number(tong.toFixed(2)));
    totalHtml += `<td>${tong ? tong.toFixed(2) : ""}</td>`;
  });

  totalRow.push(Number(tongTatCa.toFixed(2)));
  totalHtml += `<td>${tongTatCa ? tongTatCa.toFixed(2) : ""}</td></tr>`;

  hotData.push(totalRow);
  tbody.innerHTML = html + totalHtml;

  renderBangCongHot(colHeaders, hotData);
}

// ===================== INIT =====================
document.addEventListener("DOMContentLoaded", () => {
  // Tương thích: nếu HTML cũ dùng id="app" thì đổi sang app-container
  const legacyApp = document.getElementById("app");
  if (legacyApp && !document.getElementById("app-container")) {
    legacyApp.id = "app-container";
  }

  setDefaultDates();
  setStatus("Chọn tháng, lương/giờ, khoán/giờ và % thưởng rồi bấm Tải bảng lương.");
  if (tuNgayInput) {
    tuNgayInput.addEventListener("change", autoSetDenNgayTheoTuNgay);
  }

  if (btnTai) btnTai.addEventListener("click", taiBangLuong);
  if (btnLuuLuong) btnLuuLuong.addEventListener("click", luuBangLuongThang);

  if (btnTaiDsLuongDaLuu) {
    btnTaiDsLuongDaLuu.addEventListener("click", taiDanhSachBangLuongDaLuu);
  }

  if (btnXemLuongDaLuu) {
    btnXemLuongDaLuu.addEventListener("click", xemBangLuongDaLuu);
  }

  if (btnXoaLuongDaLuu) {
    btnXoaLuongDaLuu.addEventListener("click", xoaBangLuongDaLuu);
  }

  if (btnCopyLuong) btnCopyLuong.addEventListener("click", copyBangLuong);

  const btnBangCong = document.getElementById("btn-bangcong");
  if (btnBangCong) btnBangCong.addEventListener("click", taiBangCong);

  // Default tháng/năm bảng công
  const today = new Date();
  const thangEl = document.getElementById("bc-thang");
  const namEl = document.getElementById("bc-nam");
  if (thangEl && namEl) {
    thangEl.value = today.getMonth() + 1;
    namEl.value = today.getFullYear();
  }

  // Đăng nhập dùng chung (NV: mã + mật khẩu; Admin: email + mật khẩu)
  authModule.khoiTaoDangNhapDungChung({
    appContainerId: "app-container",
    onLoginSuccess: async () => {
      const ok = await kiemTraQuyenXemTrang(window.location.pathname);
      // Nếu OK, bạn có thể tự động tải dữ liệu ở đây nếu muốn:
      // if (ok) taiBangLuong();
      taiDanhSachBangLuongDaLuu();
      return ok;
    }
  });
});

// Cho phép gọi từ bên ngoài
window.taiBangLuong = taiBangLuong;
window.taiBangCong = taiBangCong;
