
// scripts/baocaoxnt16.js
import { supabase } from "./supabaseClient.js";

let hotInstance;
let currentPage = 1;
let pageSize = 1000;
let totalRows = 0;

// ===================== AUTH =====================
window.dangNhap = async function () {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const status = document.getElementById("authStatus");
  status.textContent = "";

  if (!email || !password) {
    status.textContent = "Nhập đầy đủ email và mật khẩu!";
    return;
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    status.textContent = "Đăng nhập thất bại: " + error.message;
    return;
  }
  status.style.color = "green";
  status.textContent = "Đăng nhập thành công!";
};

// ===================== HELPERS =====================
function val(id) { return document.getElementById(id)?.value ?? ""; }
function bool(id) { return document.getElementById(id)?.checked ?? false; }
function normMasp(s) { return (s || "").trim().toUpperCase(); }

function getDSMasp() {
  const raw = document.getElementById("maspList").value || "";
  const arr = raw.split(/\r?\n/).map(normMasp).filter(x => x.length > 0);
  return arr.length ? arr : null;
}

function buildParams(page = 1) {
  const tuNgay = val("tuNgay") || null;
  const denNgay = val("denNgay") || null;
  const p_dsmsp = getDSMasp();

  const params = {
    tu_ngay: tuNgay,
    den_ngay: denNgay,
    p_dsmsp,
    p_diadiem_filter: val("diadiemSelect") || null,
    p_nhomhang_filter: val("nhomhangInput") || null,
    p_chungloai_filter: val("chungloaiInput") || null,
    p_mausac_filter: val("mausacInput") || null,
    p_size_filter: val("sizeInput") || null,
    p_nhacc_filter: bool("locNCCCheckbox") ? (null) : null, // placeholder nếu sau này bạn lọc NCC theo input riêng
    p_khachhang_filter: val("khachhangInput") || null,
    p_nhanvien_filter: val("nhanvienInput") || null,
    p_tu_gia: val("tuGia") ? Number(val("tuGia")) : null,
    p_den_gia: val("denGia") ? Number(val("denGia")) : null,
    loc_duong: bool("locDuong"),
    loc_am: bool("locAm"),
    loc_het: bool("locHet"),
    loc_phatsinh_nhap: bool("locPhatSinhNhap"),
    loc_phatsinh_xuat: bool("locPhatSinhXuat"),
    p_tonghop_size: bool("tonghopSizeCheckbox"),
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  };
  return params;
}

function zeroBlankRenderer(instance, td, row, col, prop, value, cellProperties) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  if (value === 0 || value === "0") {
    td.textContent = "";
  } else if (typeof value === "number") {
    td.textContent = value.toLocaleString("vi-VN");
    td.style.textAlign = "right";
  }
}

function maspRenderer(instance, td, row, col, prop, value, cellProperties) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  const v = value ?? "";
  td.innerHTML = v
    ? `<span class="masp-link" data-masp="${v}">${v}</span>`
    : "";
}

function attachMaspLinkHandler(container) {
  container.addEventListener("click", (e) => {
    const el = e.target.closest(".masp-link");
    if (!el) return;
    const masp = el.dataset.masp;
    if (!masp) return;
    const url = `https://banle-js.vercel.app/timkiemhanghoa333.html?masp=${encodeURIComponent(masp)}`;
    window.open(url, "_blank");
  });
}

// ===================== RENDER TABLE =====================
function renderTable(rows) {
  const container = document.getElementById("hot");
  if (!hotInstance) {
    const columns = [
      { data: 'masp', title: 'Mã hàng', width: 110, renderer: maspRenderer },
      { data: 'size', title: 'Kích cỡ', width: 60, className: 'htCenter' },
      { data: 'xuatban_cs1', title: 'Xuất bán CS1', width: 90, className: 'htRight', renderer: zeroBlankRenderer },
      { data: 'xuatban_cs2', title: 'Xuất bán CS2', width: 90, className: 'htRight', renderer: zeroBlankRenderer },
      { data: 'xuatban', title: 'Xuất bán (gộp)', width: 96, className: 'htRight', renderer: zeroBlankRenderer },
      { data: 'ton_cs1', title: 'Tồn CS1', width: 76, className: 'htRight', renderer: zeroBlankRenderer },
      { data: 'ton_cs2', title: 'Tồn CS2', width: 76, className: 'htRight', renderer: zeroBlankRenderer },
      { data: 'nhapmua', title: 'Nhập mua', width: 80, className: 'htRight', renderer: zeroBlankRenderer },
      { data: 'cuoiky', title: 'Cuối kỳ', width: 80, className: 'htRight', renderer: zeroBlankRenderer },
      { data: 'giale', title: 'Giá lẻ', width: 86, className: 'htRight', renderer: zeroBlankRenderer },
      { data: 'dauky', title: 'Đầu kỳ', width: 80, className: 'htRight', renderer: zeroBlankRenderer },
      { data: 'xuatkhac', title: 'Xuất khác', width: 86, className: 'htRight', renderer: zeroBlankRenderer },
      { data: 'tongxuat', title: 'Tổng xuất', width: 86, className: 'htRight', renderer: zeroBlankRenderer },
      { data: 'nhapkhac', title: 'Nhập khác', width: 86, className: 'htRight', renderer: zeroBlankRenderer },
      { data: 'tongnhap', title: 'Tổng nhập', width: 86, className: 'htRight', renderer: zeroBlankRenderer },
      { data: 'tensp', title: 'Tên hàng', width: 180 },
    ];

    hotInstance = new Handsontable(container, {
      data: rows,
      columns,
      rowHeaders: true,
      colHeaders: columns.map(c => c.title),
      stretchH: 'all',
      licenseKey: 'non-commercial-and-evaluation',
      height: 'calc(100vh - 280px)',
      manualColumnResize: true,
      manualRowResize: true,
      contextMenu: true,
      columnSorting: true,
      renderAllRows: false,
      autoColumnSize: { samplingRatio: 23 },
      afterRender() {
        // nothing
      }
    });

    attachMaspLinkHandler(container);
  } else {
    hotInstance.updateSettings({ data: rows });
  }
}

// ===================== SUMMARY =====================
function renderSummary(rows) {
  const el = document.getElementById("xntSummary");
  if (!rows || !rows.length) { el.innerHTML = ""; return; }
  const s = rows.reduce((a, r) => {
    a.dauky += r.dauky || 0;
    a.nhapmua += r.nhapmua || 0;
    a.tongnhap += r.tongnhap || 0;
    a.xuatban_cs1 += r.xuatban_cs1 || 0;
    a.xuatban_cs2 += r.xuatban_cs2 || 0;
    a.xuatban += r.xuatban || 0;
    a.tongxuat += r.tongxuat || 0;
    a.cuoiky += r.cuoiky || 0;
    return a;
  }, { dauky: 0, nhapmua: 0, tongnhap: 0, xuatban_cs1: 0, xuatban_cs2: 0, xuatban: 0, tongxuat: 0, cuoiky: 0 });

  el.innerHTML = `<span style="background:#e3f2fd;padding:7px 14px;border-radius:8px;">
    <b>TỔNG:</b>
    Đầu kỳ: <b>${s.dauky.toLocaleString('vi-VN')}</b> |
    Nhập mua: <b>${s.nhapmua.toLocaleString('vi-VN')}</b> |
    Tổng nhập: <b>${s.tongnhap.toLocaleString('vi-VN')}</b> |
    Xuất bán CS1: <b>${s.xuatban_cs1.toLocaleString('vi-VN')}</b> |
    Xuất bán CS2: <b>${s.xuatban_cs2.toLocaleString('vi-VN')}</b> |
    Xuất bán (gộp): <b>${s.xuatban.toLocaleString('vi-VN')}</b> |
    Tổng xuất: <b>${s.tongxuat.toLocaleString('vi-VN')}</b> |
    Cuối kỳ: <b>${s.cuoiky.toLocaleString('vi-VN')}</b>
  </span>`;
}

// ===================== PAGINATION BAR =====================
function updatePagingBar() {
  const psEl = document.getElementById("pageSize");
  pageSize = Number(psEl?.value || pageSize || 1000);
  const totalPages = Math.max(1, Math.ceil((totalRows || 0) / pageSize));
  document.getElementById("pageInfo").textContent = `Trang ${currentPage}/${totalPages} (Tổng: ${totalRows.toLocaleString('vi-VN')})`;
  document.getElementById("btnPrev").disabled = currentPage <= 1;
  document.getElementById("btnNext").disabled = currentPage >= totalPages;
}
window.prevPage = async function () { if (currentPage > 1) { currentPage--; await taiBaoCaoXNT(); } };
window.nextPage = async function () { const max = Math.max(1, Math.ceil(totalRows / pageSize)); if (currentPage < max) { currentPage++; await taiBaoCaoXNT(); } };
window.gotoPage = async function () {
  const n = Number(document.getElementById("gotoPage").value || "1");
  const max = Math.max(1, Math.ceil(totalRows / pageSize));
  if (n >= 1 && n <= max) { currentPage = n; await taiBaoCaoXNT(); }
};

// ===================== LOAD DATA =====================
async function fetchCount(params) {
  const { data, error } = await supabase.rpc("baocaoxnt16_count", params);
  if (error) throw error;
  return data;
}


async function fetchPaged(params) {
  const fn = "baocaoxnt16_paged";
  const { data, error } = await supabase.rpc(fn, params);
  if (error) throw error;
  return data || [];
}


window.taiBaoCaoXNT = async function () {
  const loading = document.getElementById("loadingMsg");
  loading.textContent = "Đang tải dữ liệu...";

  try {
    // Cập nhật pageSize và tham số gọi RPC
    pageSize = Number(document.getElementById("pageSize")?.value || 1000);
    const params = buildParams(currentPage);

    // Đếm tổng số dòng để cập nhật phân trang
    totalRows = await fetchCount({
      tu_ngay: params.tu_ngay,
      den_ngay: params.den_ngay,
      p_dsmsp: params.p_dsmsp,
      p_diadiem_filter: params.p_diadiem_filter,
      p_nhomhang_filter: params.p_nhomhang_filter,
      p_chungloai_filter: params.p_chungloai_filter,
      p_mausac_filter: params.p_mausac_filter,
      p_size_filter: params.p_size_filter,
      p_nhacc_filter: params.p_nhacc_filter,
      p_khachhang_filter: params.p_khachhang_filter,
      p_nhanvien_filter: params.p_nhanvien_filter,
      p_tu_gia: params.p_tu_gia,
      p_den_gia: params.p_den_gia,
      loc_duong: params.loc_duong,
      loc_am: params.loc_am,
      loc_het: params.loc_het,
      loc_phatsinh_nhap: params.loc_phatsinh_nhap,
      loc_phatsinh_xuat: params.loc_phatsinh_xuat,
      p_tonghop_size: params.p_tonghop_size
    });

    // Lấy dữ liệu trang hiện tại
    const rows = await fetchPaged(params);

    // Render
    renderTable(rows);
    renderSummary(rows);
    updatePagingBar();
    loading.textContent = "";
  } catch (err) {
    console.error(err);
    loading.textContent = "Lỗi tải dữ liệu: " + (err?.message || err);
  }
};

// ===================== EXCEL EXPORT (song song) =====================
window.xuatExcelToanBoXNT16 = async function () {
  if (typeof XLSX === "undefined") { alert("Thiếu thư viện XLSX."); return; }
  const psEl = document.getElementById("pageSize");
  const ps = psEl ? Number(psEl.value) || 1000 : 1000;
  const fn = "baocaoxnt16_paged";
  const ok = confirm(`Xuất XLSX nhanh (song song 3 luồng, ${ps}/trang). Tiếp tục?`);
  if (!ok) return;

  async function fetchPage(p) {
    const par = buildParams(p);
    const { data, error } = await supabase.rpc(fn, par);
    if (error) {
      const msg = error?.message || String(error || "");
      // PostgREST 404 / PGRST202: hàm chưa có trong schema cache
      if (msg.includes("PGRST202") || msg.includes("Not Found")) {
        alert("Không tìm thấy RPC 'baocaoxnt16_paged'. Hãy tạo hàm và cấp quyền EXECUTE.");
        throw error;
      }
      throw error;
    }
    return data || [];
  }

  // lấy total
  const cnt = await fetchCount(buildParams(1));

  const totalPages = Math.max(1, Math.ceil(cnt / ps));
  const all = new Array(totalPages);
  const concurrency = 3;
  let nextPage = 1;
  let ended = false;

  async function worker() {
    while (!ended) {
      const myP = nextPage++;
      if (myP > totalPages) break;
      const rows = await fetchPage(myP);
      all[myP - 1] = rows;
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);

  const headers = [
    "STT", "Mã hàng", "Kích cỡ",
    "Xuất bán CS1", "Xuất bán CS2", "Xuất bán (gộp)",
    "Tồn CS1", "Tồn CS2",
    "Nhập mua", "Cuối kỳ", "Giá lẻ", "Đầu kỳ", "Xuất khác", "Tổng xuất",
    "Nhập khác", "Tổng nhập", "Tên hàng"
  ];
  const aoa = [headers];

  let sttOffset = 0;
  for (let p = 0; p < all.length; p++) {
    const pageRows = all[p];
    if (!pageRows) break;
    for (let i = 0; i < pageRows.length; i++) {
      const r = pageRows[i];
      aoa.push([
        sttOffset + i + 1,
        r.masp ?? "", r.size ?? "",
        r.xuatban_cs1 ?? 0, r.xuatban_cs2 ?? 0, r.xuatban ?? 0,
        r.ton_cs1 ?? 0, r.ton_cs2 ?? 0,
        r.nhapmua ?? 0, r.cuoiky ?? 0, r.giale ?? 0,
        r.dauky ?? 0, r.xuatkhac ?? 0, r.tongxuat ?? 0,
        r.nhapkhac ?? 0, r.tongnhap ?? 0, r.tensp ?? ""
      ]);
    }
    sttOffset += pageRows.length;
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "XNT16");
  XLSX.writeFile(wb, `baocaoxnt16_${Date.now()}.xlsx`, { compression: false });
};

// ===================== COPY BẢNG =====================
window.copyBang = function () {
  if (!hotInstance) return;
  const data = hotInstance.getData();
  const headers = hotInstance.getSettings().colHeaders;
  const tsv = [headers.join("\t")]
    .concat(data.map(row => row.map(v => (v ?? "")).join("\t")))
    .join("\n");
  navigator.clipboard.writeText(tsv).then(() => {
    alert("Đã copy bảng vào clipboard.");
  }).catch(err => alert("Không copy được: " + err));
};

// ===================== POPUP tìm kiếm (stubs, bạn nối API sau) =====================
window.openPopupSearch = function (kind) {
  const el = document.getElementById("popupSearch");
  el.style.display = "block";
};
window.closePopupSearch = function () {
  document.getElementById("popupSearch").style.display = "none";
};
window.clearInput = function (id) {
  const el = document.getElementById(id); if (el) el.value = "";
};

// Hiển thị ảnh cho toàn bộ mã đang có trong bảng (trang hiện tại) — đã lọc trùng theo MASP
window.moTrangAnh = function () {
  if (!hotInstance) {
    alert("Chưa có dữ liệu để hiển thị ảnh.");
    return;
  }

  // Lấy nguồn dữ liệu gốc của Handsontable (đúng theo thứ tự/đang có trong trang)
  const src = hotInstance.getSourceData() || [];

  // Gom theo mã sản phẩm, ưu tiên giữ bản ghi có giale khác 0 nếu có
  const map = new Map(); // key = MASP, value = { masp, giale }
  for (const r of src) {
    const code = String(r?.masp || "").trim().toUpperCase();
    if (!code) continue;
    const price = Number(r?.giale || 0) || 0;

    if (!map.has(code)) {
      map.set(code, { masp: code, giale: price });
    } else {
      // nếu đã có rồi nhưng giale đang 0, mà bản mới có giá > 0 → ưu tiên bản có giá
      const cur = map.get(code);
      if ((cur.giale || 0) === 0 && price > 0) {
        map.set(code, { masp: code, giale: price });
      }
    }
  }

  const list = Array.from(map.values());
  if (!list.length) {
    alert("Không có mã hàng hợp lệ trong bảng.");
    return;
  }

  // Dùng cùng key sessionStorage như XNT15 để trang xem ảnh dùng chung được ngay
  sessionStorage.setItem("XNT14_MASP_LIST", JSON.stringify(list));

  // Mở trang xem ảnh XNT14 (đang dùng chung cho 15) ở tab mới
  window.open("xemanhxnt14.html", "_blank");
};


// ===================== INIT =====================
window.addEventListener("DOMContentLoaded", () => {
  // giá trị mặc định ngày
  const d = new Date();
  const toISO = (dt) => dt.toISOString().slice(0, 10);
  const den = toISO(d);
  const tu = toISO(new Date(d.getFullYear(), d.getMonth(), 1));
  if (document.getElementById("tuNgay")) document.getElementById("tuNgay").value = tu;
  if (document.getElementById("denNgay")) document.getElementById("denNgay").value = den;
});
