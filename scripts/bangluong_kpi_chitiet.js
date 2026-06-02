import { supabase } from "./supabaseClient.js";
import * as authModule from "./authModule.js";

const tuNgayInput = document.getElementById("tu_ngay");
const denNgayInput = document.getElementById("den_ngay");
const diadiemSelect = document.getElementById("diadiem");

const luongGioBanInput = document.getElementById("luong_gio_ban");
const luongGioTaskInput = document.getElementById("luong_gio_task");
const luongGioDonDepInput = document.getElementById("luong_gio_dondep");
const khoanDtGioInput = document.getElementById("khoan_dt_gio");
const pctThuongInput = document.getElementById("pct_thuong");

const btnTai = document.getElementById("btn-tai");
const btnCopy = document.getElementById("btn-copy");
const statusEl = document.getElementById("status");
const hotContainer = document.getElementById("hotLuongKpi");

let hot = null;

function fmtNumber(n) {
  return Number(n || 0);
}

function normalizeManv(v) {
  return String(v || "").trim().toUpperCase();
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg || "";
  statusEl.style.color = isError ? "#b00020" : "#222";
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
  tuNgayInput.value = toIsoDate(firstDay);
  denNgayInput.value = toIsoDate(today);
}

async function loadGioKpi(tu_ngay, den_ngay, diadiem) {
  const { data, error } = await supabase
    .schema("qlnv")
    .rpc("rpc_staff_work_hours_kpi_v1", {
      tu_ngay,
      den_ngay,
      p_diadiem: diadiem || null,
      p_manv: null
    });

  if (error) {
    console.error("Lỗi loadGioKpi:", error);
    throw error;
  }

  return data || [];
}

async function loadCongCu(tu_ngay, den_ngay, diadiem) {
  const { data, error } = await supabase.rpc("chamcong_tinhcong_monthly", {
    tu_ngay,
    den_ngay,
    p_diadiem: diadiem || null,
    p_manv: null
  });

  if (error) {
    console.error("Lỗi loadCongCu:", error);
    return {};
  }

  const map = {};
  (data || []).forEach(r => {
    const key = `${normalizeManv(r.manv)}__${r.diadiem || ""}`;
    map[key] = {
      gio_cong_cu: fmtNumber(r.tong_gio_cong),
      so_ngay_cong: fmtNumber(r.so_ngay_cong),
      so_ngay_vang: fmtNumber(r.so_ngay_vang),
      so_ngay_tanca_lich: fmtNumber(r.so_ngay_tanca_lich)
    };
  });

  return map;
}

async function loadKhoanTru(tu_ngay, den_ngay, diadiem, manvArr) {
  const map = {};
  const list = manvArr.map(normalizeManv).filter(Boolean);
  if (!list.length) return map;

  let q = supabase
    .from("cackhoantru")
    .select("manv, so_tien, diadiem")
    .gte("ngay_phatsinh", tu_ngay)
    .lte("ngay_phatsinh", den_ngay)
    .in("manv", list);

  if (diadiem) {
    q = q.or(`diadiem.eq.${diadiem},diadiem.is.null,diadiem.eq.""`);
  }

  const { data, error } = await q;

  if (error) {
    console.error("Lỗi loadKhoanTru:", error);
    return map;
  }

  (data || []).forEach(r => {
    const key = normalizeManv(r.manv);
    map[key] = (map[key] || 0) + fmtNumber(r.so_tien);
  });

  return map;
}

async function loadDoanhThuKpi(manvArr, tu_ngay, den_ngay) {
  const map = {};
  const list = manvArr.map(normalizeManv).filter(Boolean);

  let done = 0;

  for (const manv of list) {
    try {
      const { data, error } = await supabase.rpc("nv_match2h_summary_all_v2", {
        tu_ngay,
        den_ngay,
        p_manv: manv,
        p_masp_list: null,
        p_min_price: 0,
        p_size: null
      });

      if (error) {
        console.error("Lỗi KPI:", manv, error);
        map[manv] = { doanh_thu: 0, hoa_hong: 0 };
      } else {
        map[manv] = {
          doanh_thu: fmtNumber(data?.[0]?.tong_doanh_thu),
          hoa_hong: fmtNumber(data?.[0]?.tong_hoa_hong)
        };
      }
    } catch (e) {
      console.error("Exception KPI:", manv, e);
      map[manv] = { doanh_thu: 0, hoa_hong: 0 };
    }

    done++;
    setStatus(`Đang tải doanh thu KPI... ${done}/${list.length}`);
  }

  return map;
}

function renderHot(rows) {
  const HOT = window.Handsontable;

  const colHeaders = [
    "Mã NV",
    "Tên NV",
    "Cơ sở",
    "Giờ công cũ",
    "Giờ bán",
    "Giờ task",
    "Giờ dọn dẹp",
    "Giờ nghỉ/off",
    "Tổng giờ log",
    "Doanh thu KPI",
    "Hoa hồng KPI",
    "Khoán DT",
    "Vượt khoán",
    "Thưởng vượt",
    "Lương bán",
    "Lương task",
    "Lương dọn dẹp",
    "Tổng lương",
    "Khoản trừ",
    "Thực lĩnh"
  ];

  const columns = colHeaders.map((_, idx) => {
    if (idx <= 2) return { data: idx, type: "text" };
    return { data: idx, type: "numeric", numericFormat: { pattern: "0,0.00" } };
  });

  const settings = {
    data: rows,
    colHeaders,
    columns,
    rowHeaders: true,
    filters: true,
    dropdownMenu: true,
    columnSorting: true,
    wordWrap: true,

    stretchH: "none",
    fixedColumnsStart: 3,
    manualColumnResize: true,
    manualRowResize: true,
    width: "100%",
    height: 520,

    columnHeaderHeight: 44,
    rowHeights: 26,
    colWidths: [
      70, 50, 60, 80, 80, 80, 90, 90, 90,
      110, 100, 100, 100, 100, 100, 100, 110,
      110, 100, 110
    ],
    licenseKey: "non-commercial-and-evaluation"
  };

  if (!hot) {
    hot = new HOT(hotContainer, settings);
  } else {
    hot.updateSettings(settings);
    hot.render();
  }
}

async function taiBangLuongKpi() {
  const tu_ngay = tuNgayInput.value;
  const den_ngay = denNgayInput.value;
  const diadiem = diadiemSelect.value || null;

  if (!tu_ngay || !den_ngay) {
    alert("Vui lòng chọn từ ngày và đến ngày.");
    return;
  }

  try {
    setStatus("Đang tải giờ KPI...");

    const luongGioBan = fmtNumber(luongGioBanInput.value);
    const luongGioTask = fmtNumber(luongGioTaskInput.value);
    const luongGioDonDep = fmtNumber(luongGioDonDepInput.value);
    const khoanDtGio = fmtNumber(khoanDtGioInput.value);
    const pctThuong = fmtNumber(pctThuongInput.value) / 100;

    const gioRows = await loadGioKpi(tu_ngay, den_ngay, diadiem);

    const manvArr = [...new Set(gioRows.map(r => normalizeManv(r.manv)).filter(Boolean))];

    setStatus("Đang tải công cũ...");
    const mapCongCu = await loadCongCu(tu_ngay, den_ngay, diadiem);

    setStatus("Đang tải khoản trừ...");
    const mapKhoanTru = await loadKhoanTru(tu_ngay, den_ngay, diadiem, manvArr);

    setStatus("Đang tải doanh thu KPI...");
    const mapKpi = await loadDoanhThuKpi(manvArr, tu_ngay, den_ngay);

    const rows = gioRows.map(r => {
      const manv = normalizeManv(r.manv);
      const keyCong = `${manv}__${r.diadiem || ""}`;

      const gioCongCu = fmtNumber(mapCongCu[keyCong]?.gio_cong_cu);
      const gioBan = fmtNumber(r.gio_ban_hang);
      const gioTask = fmtNumber(r.gio_task);
      const gioDonDep = fmtNumber(r.gio_don_dep);
      const gioNghiOff = fmtNumber(r.gio_nghi_off);
      const tongGioLog = fmtNumber(r.tong_gio_log);

      const doanhThu = fmtNumber(mapKpi[manv]?.doanh_thu);
      const hoaHong = fmtNumber(mapKpi[manv]?.hoa_hong);

      const khoanDt = gioBan * khoanDtGio;
      const vuotKhoan = Math.max(0, doanhThu - khoanDt);
      const thuongVuot = vuotKhoan * pctThuong;

      const luongBan = gioBan * luongGioBan;
      const luongTask = gioTask * luongGioTask;
      const luongDonDep = gioDonDep * luongGioDonDep;

      const tongLuong = luongBan + luongTask + luongDonDep + thuongVuot + hoaHong;
      const khoanTru = fmtNumber(mapKhoanTru[manv]);
      const thucLinh = tongLuong - khoanTru;

      return [
        manv,
        r.tennv || manv,
        r.diadiem || "",
        gioCongCu,
        gioBan,
        gioTask,
        gioDonDep,
        gioNghiOff,
        tongGioLog,
        Math.round(doanhThu),
        Math.round(hoaHong),
        Math.round(khoanDt),
        Math.round(vuotKhoan),
        Math.round(thuongVuot),
        Math.round(luongBan),
        Math.round(luongTask),
        Math.round(luongDonDep),
        Math.round(tongLuong),
        Math.round(khoanTru),
        Math.round(thucLinh)
      ];
    });

    const total = rows.reduce((s, r) => {
      for (let i = 3; i < r.length; i++) {
        s[i] = (s[i] || 0) + Number(r[i] || 0);
      }
      return s;
    }, []);

    rows.push([
      "TỔNG",
      "",
      "",
      ...Array.from({ length: 17 }, (_, i) => Math.round(Number(total[i + 3] || 0)))
    ]);

    renderHot(rows);
    setStatus(`Đã tải xong ${gioRows.length} nhân viên.`);
  } catch (e) {
    console.error(e);
    alert("Lỗi tải bảng lương KPI.");
    setStatus("Lỗi tải bảng lương KPI: " + (e.message || e), true);
  }
}

function initPage() {
  setDefaultDates();

  if (btnTai) {
    btnTai.addEventListener("click", taiBangLuongKpi);
  }

  if (btnCopy) {
    btnCopy.addEventListener("click", () => {
      if (!hot) {
        alert("Chưa có dữ liệu để copy.");
        return;
      }

      const data = hot.getData();
      const headers = hot.getColHeader();
      const text = [headers, ...data]
        .map(row => row.join("\t"))
        .join("\n");

      navigator.clipboard.writeText(text).then(() => {
        alert("Đã copy bảng lương KPI.");
      });
    });
  }

}

initPage();
