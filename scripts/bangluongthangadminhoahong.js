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
const bangCongMsg = document.getElementById("bangcong-msg");

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

// ========== BẢNG CÔNG NÂNG CẤP + ĐỐI CHIẾU LỊCH/THỰC TẾ ==========



const bcFromDateEl = document.getElementById("bc-tu-ngay");
const bcToDateEl = document.getElementById("bc-den-ngay");
const bcDetailModeEl = document.getElementById("bc-detail-mode");
const bcEmployeeWrapEl = document.getElementById("bc-employee-wrap");
const bcEmployeeEl = document.getElementById("bc-employee");
const bcAbnormalWrapEl = document.getElementById("bc-abnormal-wrap");
const bcOnlyAbnormalEl = document.getElementById("bc-only-abnormal");
const bcDetailTitleEl = document.getElementById("bc-detail-title");

let bangCongCache = null;
let bangCongCellMeta = [];

function setBangCongMessage(text, isError = false) {
    if (!bangCongMsg) return;
    bangCongMsg.textContent = text || "";
    bangCongMsg.style.color = isError ? "#b00020" : "#555";
}

function bcToMinutes(timeStr) {
    if (!timeStr) return null;
    const s = String(timeStr).slice(0, 5);
    const m = s.match(/^(\d{2}):(\d{2})$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
}

function bcMinutesToHHMM(mins) {
    if (mins == null || !Number.isFinite(mins)) return "";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function bcSafeUpper(v) {
    return String(v ?? "").trim().toUpperCase();
}

function bcNormalizeSite(v) {
    const s = String(v ?? "").trim().toLowerCase();
    if (!s) return null;
    if (s === "cs1" || s === "cơ sở 1" || s === "co so 1") return "cs1";
    if (s === "cs2" || s === "cơ sở 2" || s === "co so 2") return "cs2";
    return s;
}

function bcIsWork(loai) {
    return bcSafeUpper(loai) === "CA_LAM";
}

function bcIsDayOff(loai) {
    const x = bcSafeUpper(loai);
    return x === "NGHI_CA_NGAY" || x === "NGHI_PHEP_NGAY" || x === "NGHI_CA";
}

function bcIsHourlyLeave(loai) {
    const x = bcSafeUpper(loai);
    return x === "NGHI_THEO_GIO" || x === "NGHI_GIO" || x === "NGHI_PHEP_GIO";
}

function bcSubtractOne(work, leave) {
    const { s, e } = work;
    const ls = leave.s;
    const le = leave.e;
    if (le <= s || ls >= e) return [work];
    if (ls <= s && le >= e) return [];
    if (ls <= s && le < e) return [{ s: le, e }];
    if (ls > s && le >= e) return [{ s, e: ls }];
    return [{ s, e: ls }, { s: le, e }];
}

function bcSubtractLeaves(workIntervals, leaveIntervals) {
    let current = [...workIntervals];
    for (const lv of leaveIntervals) {
        const next = [];
        for (const w of current) next.push(...bcSubtractOne(w, lv));
        current = next;
        if (!current.length) break;
    }
    return current;
}

function makeDateYMD(year, month, day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseYMDParts(ymd) {
    const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function addDaysYMD(ymd, days) {
    const p = parseYMDParts(ymd);
    if (!p) return "";
    const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + Number(days || 0)));
    return makeDateYMD(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function lastDayOfMonthYMD(ymd) {
    const p = parseYMDParts(ymd);
    if (!p) return "";
    const last = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
    return makeDateYMD(p.y, p.m, last);
}

function listDatesBetween(startYmd, endYmd) {
    const out = [];
    if (!startYmd || !endYmd || startYmd > endYmd) return out;
    let cur = startYmd;
    let guard = 0;
    while (cur <= endYmd && guard < 800) {
        out.push(cur);
        cur = addDaysYMD(cur, 1);
        guard++;
    }
    return out;
}

function listMonthsBetweenDates(startYmd, endYmd) {
    const a = parseYMDParts(startYmd);
    const b = parseYMDParts(endYmd);
    if (!a || !b) return [];
    const out = [];
    let y = a.y, m = a.m;
    while (y < b.y || (y === b.y && m <= b.m)) {
        out.push({ y, m });
        m++;
        if (m > 12) { m = 1; y++; }
    }
    return out;
}

function formatDateDM(ymd) {
    const p = parseYMDParts(ymd);
    if (!p) return ymd || "";
    return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}`;
}

function formatDateRangeLabel(startYmd, endYmd) {
    return `${formatDateDM(startYmd)}/${String(startYmd).slice(0,4)} – ${formatDateDM(endYmd)}/${String(endYmd).slice(0,4)}`;
}

// Luôn lấy "hôm nay" theo Việt Nam để quản lý từ Đức vẫn ra đúng ngày của cửa hàng.
function vietnamTodayYMD() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const get = (t) => parts.find(x => x.type === t)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
}

function vnDateKeyFromTimestamp(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(d);
    const get = (t) => parts.find(x => x.type === t)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
}

function vnTimeHMFromTimestamp(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(d);
    const get = (t) => parts.find(x => x.type === t)?.value || "";
    return `${get("hour")}:${get("minute")}`;
}

function formatHour2(v) {
    return Number(v || 0).toFixed(2);
}

function formatSignedHour(v) {
    const n = Number(v || 0);
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}h`;
}

function formatSignedMinutes(vHours) {
    const mins = Math.round(Number(vHours || 0) * 60);
    return `${mins >= 0 ? "+" : ""}${mins}p`;
}

function getCompareState(actual, registered, dateYmd) {
    const a = Number(actual || 0);
    const r = Number(registered || 0);
    const today = vietnamTodayYMD();

    // Không cảnh báo ngày hôm nay / tương lai vì ca có thể chưa kết thúc.
    if (dateYmd >= today) return { type: "", diff: a - r };

    if (r > 0 && a <= 0) return { type: "missing_actual", diff: -r };
    if (r <= 0 && a > 0) return { type: "no_schedule", diff: a };

    const diff = a - r;
    if (r > 0 && a > 0 && diff <= -0.5) return { type: "under", diff };
    if (r > 0 && a > 0 && diff >= 0.5) return { type: "over", diff };
    return { type: "", diff };
}

function bcEscapeHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Trả về cả tổng giờ đăng ký và chuỗi chi tiết để dùng cho chế độ 1 nhân viên.
function buildRegisteredData(scheduleRows) {
    const byKey = new Map(); // yyyy-mm-dd|manv|site

    for (const r of scheduleRows || []) {
        const ngay = String(r.ngay || "").slice(0, 10);
        const manv = normalizeManv(r.manv);
        const site = bcNormalizeSite(r.diadiem) || "";
        if (!ngay || !manv) continue;

        const key = `${ngay}|${manv}|${site}`;
        if (!byKey.has(key)) byKey.set(key, { work: [], leaves: [], hasDayOff: false, site });
        const st = byKey.get(key);
        const loai = bcSafeUpper(r.loai_dang_ky);

        if (bcIsDayOff(loai)) {
            st.hasDayOff = true;
            continue;
        }
        if (bcIsWork(loai)) {
            const s = bcToMinutes(r.gio_bat_dau);
            const e = bcToMinutes(r.gio_ket_thuc);
            if (s != null && e != null && e > s) st.work.push({ s, e });
            continue;
        }
        if (bcIsHourlyLeave(loai)) {
            const s = bcToMinutes(r.tu_gio ?? r.gio_bat_dau);
            const e = bcToMinutes(r.den_gio ?? r.gio_ket_thuc);
            if (s != null && e != null && e > s) st.leaves.push({ s, e });
        }
    }

    const hoursMap = {};
    const detailParts = {}; // yyyy-mm-dd|manv => array text parts
    const hasDayOffMap = {};

    for (const [key, st] of byKey.entries()) {
        const [ngay, manv] = key.split("|");
        const dayKey = `${ngay}|${manv}`;

        if (st.hasDayOff) {
            hasDayOffMap[dayKey] = true;
            if (!detailParts[dayKey]) detailParts[dayKey] = [];
            detailParts[dayKey].push(`${st.site ? st.site.toUpperCase() + ": " : ""}Nghỉ cả ngày`);
            continue;
        }

        const work = st.work.sort((a, b) => a.s - b.s);
        const merged = [];
        for (const w of work) {
            const last = merged[merged.length - 1];
            if (!last || w.s > last.e) merged.push({ ...w });
            else last.e = Math.max(last.e, w.e);
        }

        const leaves = st.leaves.sort((a, b) => a.s - b.s);
        const effective = bcSubtractLeaves(merged, leaves);
        const mins = effective.reduce((sum, x) => sum + Math.max(0, x.e - x.s), 0);
        hoursMap[dayKey] = (hoursMap[dayKey] || 0) + mins / 60;

        const workText = merged.map(x => `${bcMinutesToHHMM(x.s)}–${bcMinutesToHHMM(x.e)}`).join(" + ");
        const leaveText = leaves.map(x => `${bcMinutesToHHMM(x.s)}–${bcMinutesToHHMM(x.e)}`).join(" + ");
        let part = workText || "Không có ca làm";
        if (leaveText) part += `; nghỉ ${leaveText}`;
        if (st.site) part = `${st.site.toUpperCase()}: ${part}`;
        if (!detailParts[dayKey]) detailParts[dayKey] = [];
        detailParts[dayKey].push(part);
    }

    const detailMap = {};
    const keys = new Set([...Object.keys(hoursMap), ...Object.keys(detailParts), ...Object.keys(hasDayOffMap)]);
    for (const k of keys) {
        const total = Number(hoursMap[k] || 0);
        const parts = detailParts[k] || [];
        if (parts.length) detailMap[k] = `${parts.join(" | ")} / ${formatHour2(total)}h`;
        else detailMap[k] = total > 0 ? `${formatHour2(total)}h` : "";
    }

    return { hoursMap, detailMap, hasDayOffMap };
}

const bcEventLabels = {
    VAOCA: "Vào",
    NTR: "Nghỉ trưa",
    NTRD: "Vào lại",
    NCH: "Nghỉ chiều",
    NCHD: "Vào lại",
    TANCA: "Tan",
    AUTO_TANCA: "Tự tan",
    TANCA_LICH: "Tan theo lịch"
};

function buildActualEventMap(logRows) {
    const map = {}; // yyyy-mm-dd|manv => event[]
    for (const r of logRows || []) {
        const manv = normalizeManv(r.manv);
        const ngay = vnDateKeyFromTimestamp(r.created_at);
        if (!manv || !ngay) continue;
        const key = `${ngay}|${manv}`;
        if (!map[key]) map[key] = [];
        map[key].push(r);
    }

    const out = {};
    for (const [key, rows] of Object.entries(map)) {
        rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        out[key] = rows.map(r => {
            const ev = bcSafeUpper(r.su_kien);
            const label = bcEventLabels[ev] || ev || "Sự kiện";
            const t = vnTimeHMFromTimestamp(r.created_at);
            return `${label} ${t}`.trim();
        }).join(" · ");
    }
    return out;
}

function buildActualHoursMap(congData) {
    const map = {};
    for (const r of congData || []) {
        const manv = normalizeManv(r.manv);
        const dateYmd = String(r.ngay_ymd || "").slice(0, 10);
        if (!manv || !dateYmd) continue;
        map[`${dateYmd}|${manv}`] = Number(r.gio_cong || 0);
    }
    return map;
}

function bangCongRenderer(instance, td, row, col, prop, value, cellProperties) {
    window.Handsontable.renderers.NumericRenderer.apply(this, arguments);
    td.style.background = "";
    td.style.color = "";
    td.style.fontWeight = "";
    td.style.cursor = "";
    td.title = "";

    const meta = bangCongCellMeta?.[row]?.[col];
    if (!meta) return td;

    const colors = {
        under: { bg: "#fff3b0", fg: "#7a5a00" },
        over: { bg: "#ffcdd2", fg: "#8e0000" },
        missing_actual: { bg: "#bbdefb", fg: "#0d47a1" },
        no_schedule: { bg: "#e1bee7", fg: "#6a1b9a" },
    };

    if (meta.extreme) {
        td.style.background = "#ff1744";
        td.style.color = "#ffffff";
        td.style.fontWeight = "800";
    } else {
        const c = colors[meta.type];
        if (c) {
            td.style.background = c.bg;
            td.style.color = c.fg;
            td.style.fontWeight = "700";
        }
    }
    td.style.cursor = "help";
    td.title = meta.tooltip || "";
    return td;
}

function bangCongDetailTextRenderer(instance, td, row, col, prop, value, cellProperties) {
    window.Handsontable.renderers.TextRenderer.apply(this, arguments);
    td.style.whiteSpace = "normal";
    td.style.lineHeight = "1.35";
    td.style.verticalAlign = "top";
    td.title = cellProperties?.title || "";
    return td;
}

function bangCongDetailAlertRenderer(instance, td, row, col, prop, value, cellProperties) {
    window.Handsontable.renderers.TextRenderer.apply(this, arguments);
    td.style.whiteSpace = "normal";
    td.style.lineHeight = "1.35";
    td.style.verticalAlign = "top";
    td.style.background = "";
    td.style.color = "";
    td.style.fontWeight = "";
    const meta = bangCongCellMeta?.[row]?.[col];
    const colors = {
        under: { bg: "#fff3b0", fg: "#7a5a00" },
        over: { bg: "#ffcdd2", fg: "#8e0000" },
        missing_actual: { bg: "#bbdefb", fg: "#0d47a1" },
        no_schedule: { bg: "#e1bee7", fg: "#6a1b9a" },
    };
    if (meta?.extreme) {
        td.style.background = "#ff1744";
        td.style.color = "#ffffff";
        td.style.fontWeight = "800";
    } else {
        const c = colors[meta?.type];
        if (c) {
            td.style.background = c.bg;
            td.style.color = c.fg;
            td.style.fontWeight = "700";
        }
    }
    td.title = meta?.tooltip || "";
    return td;
}

function renderBangCongHot(colHeaders, data, mode = "summary") {
    if (!hotBangCongContainer) return;
    const HOT = window.Handsontable;
    if (!HOT) {
        console.error("Handsontable chưa được nạp.");
        setBangCongMessage("Không tải được thư viện hiển thị bảng công.", true);
        return;
    }

    const detailMode = mode === "detail";
    const mobile = window.innerWidth <= 600;
    const settings = {
        data,
        colHeaders,
        rowHeaders: true,
        rowHeaderWidth: mobile ? 38 : 46,
        width: "100%",
        height: mobile ? 520 : 430,
        stretchH: "all",
        manualColumnResize: true,
        manualRowResize: true,
        filters: true,
        dropdownMenu: true,
        columnSorting: true,
        readOnly: true,
        wordWrap: true,
        // Tiêu đề nhiều dòng trên điện thoại phải có đủ chiều cao để không che dòng dữ liệu đầu tiên.
        columnHeaderHeight: detailMode ? (mobile ? 88 : 72) : (mobile ? 72 : 58),
        rowHeights: detailMode ? (mobile ? 66 : 50) : 30,
        colWidths: detailMode ? (mobile ? [58, 48, 72, 150, 165, 78] : [70, 55, 85, 260, 310, 95]) : undefined,
        viewportRowRenderingOffset: 30,
        cells(row, col) {
            const cp = {};
            if (!detailMode) {
                if (row < data.length - 1 && col >= 2 && col < colHeaders.length - 1) {
                    cp.type = "numeric";
                    cp.numericFormat = { pattern: "0.00" };
                    cp.renderer = bangCongRenderer;
                }
            } else {
                if (col === 2 || col === 5) cp.renderer = bangCongDetailAlertRenderer;
                else if (col === 3 || col === 4) cp.renderer = bangCongDetailTextRenderer;
            }
            return cp;
        },
        licenseKey: "non-commercial-and-evaluation"
    };

    if (!hotBangCong) hotBangCong = new HOT(hotBangCongContainer, settings);
    else {
        hotBangCong.updateSettings(settings);
        hotBangCong.loadData(data);
        hotBangCong.render();
    }
}

function getThuLabel(year, month, day, fallback = "") {
    if (fallback) return fallback;
    const thuNames = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    return thuNames[new Date(year, month - 1, day).getDay()];
}

function populateBangCongEmployeeSelect(cache) {
    if (!bcEmployeeEl) return;
    const prev = bcEmployeeEl.value;
    const actualEmployees = new Map();
    for (const r of cache.congData || []) {
        const manv = normalizeManv(r.manv);
        if (!manv || Number(r.gio_cong || 0) <= 0) continue;
        const name = String(r.tennv || manv).trim();
        if (!actualEmployees.has(manv)) actualEmployees.set(manv, name);
    }

    const list = Array.from(actualEmployees.entries()).sort((a, b) =>
        String(a[1]).localeCompare(String(b[1]), "vi") || a[0].localeCompare(b[0], "vi")
    );
    bcEmployeeEl.innerHTML = `<option value="">-- Chọn nhân viên --</option>` + list.map(([manv, name]) =>
        `<option value="${bcEscapeHtml(manv)}">${bcEscapeHtml(name)} (${bcEscapeHtml(manv)})</option>`
    ).join("");

    if (prev && actualEmployees.has(prev)) bcEmployeeEl.value = prev;
    else if (list.length === 1) bcEmployeeEl.value = list[0][0];
}

function buildSummaryEmployeeList(cache) {
    const employeeMap = new Map();
    cache.congData.forEach(d => {
        const manv = normalizeManv(d.manv);
        if (!manv) return;
        if (!employeeMap.has(manv)) employeeMap.set(manv, d.tennv || d.manv || manv);
    });
    cache.lichRows.forEach(r => {
        const manv = normalizeManv(r.manv);
        if (!manv) return;
        if (!employeeMap.has(manv)) employeeMap.set(manv, manv);
    });
    return Array.from(employeeMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0], "vi"))
        .map(([manv, tennv]) => ({ manv, tennv }));
}

function renderBangCongSummary(cache) {
    const { fromDate, toDate, dateList, congData, registeredData } = cache;
    const tbody = document.getElementById("tbody-bangcong");
    const thead = document.getElementById("thead-bangcong");
    const nhanvien = buildSummaryEmployeeList(cache);

    if (bcDetailTitleEl) bcDetailTitleEl.style.display = "none";

    if (!nhanvien.length) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="50">Không có dữ liệu.</td></tr>`;
        if (thead) thead.innerHTML = "";
        bangCongCellMeta = [];
        renderBangCongHot([], []);
        setBangCongMessage(`Không có dữ liệu công hoặc lịch đã duyệt từ ${formatDateDM(fromDate)} đến ${formatDateDM(toDate)}.`);
        return;
    }

    const groupByDate = {};
    congData.forEach(d => {
        const dateYmd = String(d.ngay_ymd || "").slice(0, 10);
        if (!dateYmd) return;
        groupByDate[dateYmd] = groupByDate[dateYmd] || [];
        groupByDate[dateYmd].push(d);
    });

    const colHeaders = ["Ngày", "Thứ", ...nhanvien.map(x => x.tennv), "Tổng"];
    const hotData = [];
    bangCongCellMeta = [];
    const tongTheoNhanVien = {};
    nhanvien.forEach(n => { tongTheoNhanVien[n.manv] = 0; });
    let tongTatCa = 0;
    let countUnder = 0, countOver = 0, countMissing = 0, countNoSchedule = 0, countExtreme = 0;

    for (const dateYmd of dateList) {
        const p = parseYMDParts(dateYmd);
        const row = groupByDate[dateYmd] || [];
        const thu = getThuLabel(p.y, p.m, p.d, row[0]?.thu || "");
        let sum = 0;
        const rowData = [formatDateDM(dateYmd), thu];
        const metaRow = [{}, {}];

        nhanvien.forEach(n => {
            const found = row.find(r => normalizeManv(r.manv) === n.manv);
            const actual = found ? Number(found.gio_cong || 0) : 0;
            const registered = Number(registeredData.hoursMap[`${dateYmd}|${n.manv}`] || 0);
            const cmp = getCompareState(actual, registered, dateYmd);
            const extreme = actual > 13;

            if (cmp.type === "under") countUnder++;
            if (cmp.type === "over") countOver++;
            if (cmp.type === "missing_actual") countMissing++;
            if (cmp.type === "no_schedule") countNoSchedule++;
            if (extreme) countExtreme++;

            sum += actual;
            tongTheoNhanVien[n.manv] += actual;
            rowData.push(Number(actual.toFixed(2)));

            const tooltip = [
                `${n.tennv} (${n.manv}) - ${dateYmd}`,
                `Giờ thực tế: ${formatHour2(actual)}h`,
                `Giờ đăng ký đã duyệt: ${formatHour2(registered)}h`,
                `Chênh lệch: ${formatSignedHour(actual - registered)}`,
                extreme ? "Cảnh báo mạnh: giờ công thực tế lớn hơn 13.00h." : "",
                cmp.type === "under" ? "Cảnh báo: thực tế thiếu từ 30 phút." : "",
                cmp.type === "over" ? "Cảnh báo: thực tế vượt từ 30 phút." : "",
                cmp.type === "missing_actual" ? "Cảnh báo: có lịch đã duyệt nhưng chưa có giờ công thực tế." : "",
                cmp.type === "no_schedule" ? "Cảnh báo: có giờ công thực tế nhưng không có lịch đã duyệt." : "",
                dateYmd >= vietnamTodayYMD() ? "Ngày hôm nay/tương lai: chưa áp dụng màu cảnh báo thiếu/vượt." : "",
            ].filter(Boolean).join("\n");
            metaRow.push({ type: cmp.type, extreme, tooltip });
        });

        tongTatCa += sum;
        rowData.push(Number(sum.toFixed(2)));
        metaRow.push({});
        hotData.push(rowData);
        bangCongCellMeta.push(metaRow);
    }

    const totalRow = ["Tổng", "", ...nhanvien.map(n => Number((tongTheoNhanVien[n.manv] || 0).toFixed(2))), Number(tongTatCa.toFixed(2))];
    hotData.push(totalRow);
    bangCongCellMeta.push([]);
    renderBangCongHot(colHeaders, hotData, "summary");

    setBangCongMessage(
        `Đã tải ${formatDateDM(fromDate)}–${formatDateDM(toDate)}: ${nhanvien.length} NV | ` +
        `Thiếu ≥30p: ${countUnder} | Vượt ≥30p: ${countOver} | ` +
        `Có lịch không có công: ${countMissing} | Có công không có lịch: ${countNoSchedule} | ` +
        `Giờ công >13h: ${countExtreme}`
    );
}

function renderBangCongDetail(cache) {
    const { fromDate, toDate, dateList, congData, registeredData, actualEventMap, actualHoursMap } = cache;
    const manv = normalizeManv(bcEmployeeEl?.value);
    const onlyAbnormal = !!bcOnlyAbnormalEl?.checked;

    if (!manv) {
        bangCongCellMeta = [];
        renderBangCongHot(["Ngày", "Thứ", "Giờ công", "Giờ đăng ký", "Giờ thực hiện", "Chênh lệch"], [], "detail");
        if (bcDetailTitleEl) {
            bcDetailTitleEl.style.display = "block";
            bcDetailTitleEl.textContent = "Chọn một nhân viên để xem chi tiết bảng công.";
        }
        setBangCongMessage("Chế độ chi tiết: vui lòng chọn nhân viên.");
        return;
    }

    const nameRow = congData.find(r => normalizeManv(r.manv) === manv && String(r.tennv || "").trim());
    const tennv = String(nameRow?.tennv || manv).trim();
    if (bcDetailTitleEl) {
        bcDetailTitleEl.style.display = "block";
        bcDetailTitleEl.textContent = `CHI TIẾT BẢNG CÔNG – ${tennv} (${manv}) – ${formatDateRangeLabel(fromDate, toDate)}`;
    }

    const groupByDate = {};
    congData.filter(r => normalizeManv(r.manv) === manv).forEach(r => {
        const dateYmd = String(r.ngay_ymd || "").slice(0, 10);
        if (dateYmd) groupByDate[dateYmd] = r;
    });

    const hotData = [];
    bangCongCellMeta = [];
    let countShown = 0;
    let abnormalCount = 0;
    let extremeCount = 0;
    let totalActual = 0;
    let totalRegistered = 0;

    for (const dateYmd of dateList) {
        const p = parseYMDParts(dateYmd);
        const found = groupByDate[dateYmd];
        const actual = Number(actualHoursMap[`${dateYmd}|${manv}`] ?? found?.gio_cong ?? 0);
        const registered = Number(registeredData.hoursMap[`${dateYmd}|${manv}`] || 0);
        const cmp = getCompareState(actual, registered, dateYmd);
        const extreme = actual > 13;
        const isAbnormal = !!cmp.type || extreme;
        if (isAbnormal) abnormalCount++;
        if (extreme) extremeCount++;

        totalActual += actual;
        totalRegistered += registered;

        const hasAnyData = actual > 0 || registered > 0;
        if (!hasAnyData) continue;
        if (onlyAbnormal && !isAbnormal) continue;

        const thu = getThuLabel(p.y, p.m, p.d, found?.thu || "");
        const regText = registeredData.detailMap[`${dateYmd}|${manv}`] || (registered > 0 ? `${formatHour2(registered)}h` : "—");
        const events = actualEventMap[`${dateYmd}|${manv}`] || "";
        const actualText = actual > 0
            ? `${events || "Không đọc được log chi tiết"} / ${formatHour2(actual)}h`
            : (events ? `${events} / 0.00h` : "—");
        const diffText = (actual === 0 && registered === 0) ? "" : formatSignedMinutes(actual - registered);

        const tooltip = [
            `${tennv} (${manv}) - ${dateYmd}`,
            `Giờ thực tế: ${formatHour2(actual)}h`,
            `Giờ đăng ký: ${formatHour2(registered)}h`,
            `Chênh lệch: ${formatSignedMinutes(actual - registered)}`,
            extreme ? "Cảnh báo mạnh: giờ công thực tế lớn hơn 13.00h." : "",
            cmp.type === "under" ? "Thiếu từ 30 phút." : "",
            cmp.type === "over" ? "Vượt từ 30 phút." : "",
            cmp.type === "missing_actual" ? "Có lịch nhưng không có công." : "",
            cmp.type === "no_schedule" ? "Có công nhưng không có lịch đã duyệt." : ""
        ].filter(Boolean).join("\n");

        const rowIndex = hotData.length;
        hotData.push([
            formatDateDM(dateYmd),
            thu,
            actual > 0 ? formatHour2(actual) : "",
            regText,
            actualText,
            diffText
        ]);
        bangCongCellMeta[rowIndex] = [
            {}, {},
            { type: cmp.type, extreme, tooltip },
            {}, {},
            { type: cmp.type, extreme: false, tooltip }
        ];
        countShown++;
    }

    const totalDiff = totalActual - totalRegistered;
    hotData.push([
        "Tổng",
        "",
        formatHour2(totalActual),
        `Tổng lịch: ${formatHour2(totalRegistered)}h`,
        `Tổng thực tế: ${formatHour2(totalActual)}h`,
        formatSignedMinutes(totalDiff)
    ]);
    bangCongCellMeta.push([{}, {}, {}, {}, {}, {}]);

    renderBangCongHot(["Ngày", "Thứ", "Giờ công", "Giờ đăng ký", "Giờ thực hiện", "Chênh lệch"], hotData, "detail");
    setBangCongMessage(
        `Chi tiết ${tennv}: ${formatDateDM(fromDate)}–${formatDateDM(toDate)} | hiển thị ${countShown} ngày` +
        `${onlyAbnormal ? ` bất thường (tổng ${abnormalCount})` : ` | bất thường: ${abnormalCount}`}` +
        ` | >13h: ${extremeCount}` +
        ` | Tổng thực tế ${formatHour2(totalActual)}h / đăng ký ${formatHour2(totalRegistered)}h` +
        ` | Ngưỡng cảnh báo: ±30 phút.`
    );
}

function renderBangCongCurrentMode() {
    if (!bangCongCache) return;
    const detail = !!bcDetailModeEl?.checked;
    if (bcEmployeeWrapEl) bcEmployeeWrapEl.style.display = detail ? "block" : "none";
    if (bcAbnormalWrapEl) bcAbnormalWrapEl.style.display = detail ? "inline-flex" : "none";
    if (detail) renderBangCongDetail(bangCongCache);
    else renderBangCongSummary(bangCongCache);
}

async function taiBangCong() {
    const fromDate = String(bcFromDateEl?.value || "").trim();
    const toDate = String(bcToDateEl?.value || "").trim();
    const tbody = document.getElementById("tbody-bangcong");

    if (!fromDate) {
        setBangCongMessage("Vui lòng chọn Từ ngày.", true);
        bcFromDateEl?.focus();
        return;
    }
    if (!toDate) {
        setBangCongMessage("Vui lòng chọn Đến ngày. Nếu chọn Từ ngày là mùng 1, hệ thống sẽ tự chọn ngày cuối tháng.", true);
        bcToDateEl?.focus();
        return;
    }
    if (toDate < fromDate) {
        setBangCongMessage("Đến ngày không được nhỏ hơn Từ ngày.", true);
        bcToDateEl?.focus();
        return;
    }

    const dateList = listDatesBetween(fromDate, toDate);
    if (!dateList.length) {
        setBangCongMessage("Khoảng ngày không hợp lệ.", true);
        return;
    }
    if (dateList.length > 366) {
        setBangCongMessage("Để tránh tải quá nặng, mỗi lần chỉ nên xem tối đa 366 ngày.", true);
        return;
    }

    if (tbody) tbody.innerHTML = `<tr><td colspan="50">Đang tải...</td></tr>`;
    setBangCongMessage(`Đang tải dữ liệu từ ${formatDateDM(fromDate)} đến ${formatDateDM(toDate)}...`);

    const months = listMonthsBetweenDates(fromDate, toDate);
    const nextDate = addDaysYMD(toDate, 1);
    const logStart = `${fromDate}T00:00:00+07:00`;
    const logEnd = `${nextDate}T00:00:00+07:00`;

    const congPromise = Promise.all(months.map(({ y, m }) =>
        supabase.rpc("chamcong_bangcong_monthly", { p_month: m, p_year: y })
            .then(res => ({ ...res, y, m }))
    ));

    const [congMonthlyRes, lichRes, logRes] = await Promise.all([
        congPromise,
        supabase
            .from("lichlam_dangky")
            .select("ngay, diadiem, manv, loai_dang_ky, gio_bat_dau, gio_ket_thuc, tu_gio, den_gio, trang_thai")
            .gte("ngay", fromDate)
            .lte("ngay", toDate)
            .eq("trang_thai", "DA_DUYET"),
        supabase
            .from("chamcong_log")
            .select("manv, diadiem, su_kien, created_at")
            .gte("created_at", logStart)
            .lt("created_at", logEnd)
            .order("created_at", { ascending: true })
    ]);

    const badMonth = congMonthlyRes.find(x => x.error);
    if (badMonth) {
        console.error("Lỗi chamcong_bangcong_monthly:", badMonth.error);
        renderBangCongHot([], []);
        setBangCongMessage(`Lỗi tải bảng công tháng ${badMonth.m}/${badMonth.y}: ` + (badMonth.error.message || "Không xác định"), true);
        return;
    }
    if (lichRes.error) {
        console.error("Lỗi lichlam_dangky:", lichRes.error);
        renderBangCongHot([], []);
        setBangCongMessage("Lỗi tải lịch đăng ký: " + (lichRes.error.message || "Không xác định"), true);
        return;
    }

    let logRows = [];
    let logWarning = "";
    if (logRes.error) {
        console.warn("Không tải được chamcong_log:", logRes.error);
        logWarning = " (chưa đọc được log vào/ra chi tiết; kiểm tra quyền SELECT chamcong_log)";
    } else {
        logRows = logRes.data || [];
    }

    const congData = [];
    for (const monthRes of congMonthlyRes) {
        for (const r of (monthRes.data || [])) {
            const day = Number(r.ngay);
            if (!day) continue;
            const dateYmd = makeDateYMD(monthRes.y, monthRes.m, day);
            if (dateYmd < fromDate || dateYmd > toDate) continue;
            congData.push({ ...r, ngay_ymd: dateYmd });
        }
    }

    const lichRows = lichRes.data || [];
    const registeredData = buildRegisteredData(lichRows);
    const actualEventMap = buildActualEventMap(logRows);
    const actualHoursMap = buildActualHoursMap(congData);

    bangCongCache = {
        fromDate, toDate, dateList,
        congData, lichRows, logRows,
        registeredData, actualEventMap, actualHoursMap,
        logWarning
    };

    populateBangCongEmployeeSelect(bangCongCache);
    renderBangCongCurrentMode();
    if (logWarning && bcDetailModeEl?.checked) {
        setBangCongMessage((bangCongMsg?.textContent || "") + logWarning, true);
    }
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

  // ===== Bảng công nâng cấp: cùng chuẩn với trang Quản lý nhân viên =====
  const todayVn = vietnamTodayYMD();
  const pToday = parseYMDParts(todayVn);
  const defaultFrom = makeDateYMD(pToday.y, pToday.m, 1);
  const defaultTo = lastDayOfMonthYMD(defaultFrom);
  const btnBangCong = document.getElementById("btn-bangcong");

  if (bcFromDateEl && !bcFromDateEl.value) bcFromDateEl.value = defaultFrom;
  if (bcToDateEl && !bcToDateEl.value) bcToDateEl.value = defaultTo;

  if (bcFromDateEl) {
    bcFromDateEl.addEventListener("change", () => {
      const val = bcFromDateEl.value;
      const p = parseYMDParts(val);
      if (!p) return;
      if (p.d === 1) {
        if (bcToDateEl) bcToDateEl.value = lastDayOfMonthYMD(val);
        setBangCongMessage(`Đã tự chọn Đến ngày là ngày cuối tháng: ${formatDateDM(bcToDateEl?.value)}.`);
      } else {
        if (bcToDateEl) bcToDateEl.value = "";
        setBangCongMessage(`Đã chọn Từ ngày ${formatDateDM(val)}. Vui lòng chọn Đến ngày rồi bấm Tải bảng công.`);
      }
    });
  }
  if (bcToDateEl) {
    bcToDateEl.addEventListener("change", () => {
      if (bcFromDateEl?.value && bcToDateEl.value && bcToDateEl.value < bcFromDateEl.value) {
        setBangCongMessage("Đến ngày không được nhỏ hơn Từ ngày.", true);
      }
    });
  }
  if (btnBangCong) btnBangCong.addEventListener("click", taiBangCong);
  if (bcDetailModeEl) {
    bcDetailModeEl.addEventListener("change", () => {
      if (bcEmployeeWrapEl) bcEmployeeWrapEl.style.display = bcDetailModeEl.checked ? "block" : "none";
      if (bcAbnormalWrapEl) bcAbnormalWrapEl.style.display = bcDetailModeEl.checked ? "inline-flex" : "none";
      renderBangCongCurrentMode();
    });
  }
  if (bcEmployeeEl) bcEmployeeEl.addEventListener("change", renderBangCongCurrentMode);
  if (bcOnlyAbnormalEl) bcOnlyAbnormalEl.addEventListener("change", renderBangCongCurrentMode);

  // Đăng nhập dùng chung (NV: mã + mật khẩu; Admin: email + mật khẩu)
  authModule.khoiTaoDangNhapDungChung({
    appContainerId: "app-container",
    onLoginSuccess: async () => {
      const ok = await kiemTraQuyenXemTrang(window.location.pathname);
      // Nếu OK, bạn có thể tự động tải dữ liệu ở đây nếu muốn:
      // if (ok) taiBangLuong();
      taiDanhSachBangLuongDaLuu();
      if (ok) taiBangCong();
      return ok;
    }
  });
});

// Cho phép gọi từ bên ngoài
window.taiBangLuong = taiBangLuong;
window.taiBangCong = taiBangCong;
