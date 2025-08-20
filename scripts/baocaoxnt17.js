
// scripts/baocaoxnt16.js 
import { supabase } from "./supabaseClient.js";

let hotInstance;
let currentPage = 1;
let pageSize = 1000;
let totalRows = 0;

// ===================== AUTH =====================
(function injectQuickViewCss() {
    const css = `
    #previewGrid { display:grid; gap:10px; overflow:auto; }
    .preview-card { border-radius:10px; background:#fff; box-shadow:0 0 0 1px #eee inset; padding:8px; }
    .preview-card.selected { box-shadow:0 0 0 2px #3b82f6 inset; }
    .preview-card img { width:100%; height:auto; aspect-ratio: 4/3; object-fit: cover; border-radius:8px; display:block; }
    .preview-cap { margin-top:6px; font-size:13px; color:#374151; font-weight:600; text-align:center;}
  `;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
})();

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
    const ss = sessionStorage.getItem("XNT17_MASPS");
    if (ss) {
        const arr = JSON.parse(ss).map(x => normMasp(x?.masp || x)); // nhận cả dạng {masp}
        // đổ về textarea để user nhìn thấy & có thể lọc lại
        const ta = document.getElementById("maspList");
        if (ta) ta.value = arr.join("\n");
        sessionStorage.removeItem("XNT17_MASPS");
    }
    const raw = document.getElementById("maspList")?.value || "";
    const list = raw.split(/\r?\n/).map(normMasp).filter(Boolean);
    if (list.length) return list;
    const one = normMasp(document.getElementById("maspInput")?.value);
    return one ? [one] : null;
}


function buildParams(page = 1) {
    return {
        tu_ngay: val("tuNgay") || null,
        den_ngay: val("denNgay") || null,
        p_dsmsp: getDSMasp(),
        p_diadiem_filter: val("diadiemSelect") || null,
        p_nhomhang_filter: val("nhomhangInput") || null,
        p_chungloai_filter: val("chungloaiInput") || null,
        p_mausac_filter: val("mausacInput") || null,
        p_size_filter: val("sizeInput") || null,
        p_nhacc_filter: (bool("locNCCCheckbox") ? (val("khachhangInput").trim() || null) : null),
        p_khachhang_filter: (!bool("locNCCCheckbox") ? (val("khachhangInput").trim() || null) : null),
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
        p_offset: (page - 1) * pageSize
    };
}

// chỉ giữ đúng tham số mà baocaoxnt16_count cần (KHÔNG có p_limit, p_offset)
function buildCountParams(params) {
    const {
        tu_ngay, den_ngay, p_dsmsp,
        p_diadiem_filter, p_nhomhang_filter, p_chungloai_filter,
        p_mausac_filter, p_size_filter, p_nhacc_filter,
        p_khachhang_filter, p_nhanvien_filter,
        p_tu_gia, p_den_gia,
        loc_duong, loc_am, loc_het,
        loc_phatsinh_nhap, loc_phatsinh_xuat,
        p_tonghop_size
    } = params;

    return {
        tu_ngay, den_ngay, p_dsmsp,
        p_diadiem_filter, p_nhomhang_filter, p_chungloai_filter,
        p_mausac_filter, p_size_filter, p_nhacc_filter,
        p_khachhang_filter, p_nhanvien_filter,
        p_tu_gia, p_den_gia,
        loc_duong, loc_am, loc_het,
        loc_phatsinh_nhap, loc_phatsinh_xuat,
        p_tonghop_size
    };
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
function maspTextRenderer(instance, td, row, col, prop, value) {
    Handsontable.renderers.TextRenderer.apply(this, arguments);
    td.textContent = value ?? "";
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
    const columns = [
        { data: 'masp', title: 'Mã hàng', width: 110, renderer: maspTextRenderer },
        { data: 'size', title: 'Kích cỡ', width: 60, className: 'htCenter' },
        { data: 'xuatban_cs1', title: 'Xuất bán CS1', width: 90, className: 'htRight', renderer: zeroBlankRenderer },
        { data: 'xuatban_cs2', title: 'Xuất bán CS2', width: 90, className: 'htRight', renderer: zeroBlankRenderer },
        { data: 'xuatban', title: 'Xuất bán (gộp)', width: 96, className: 'htRight', renderer: zeroBlankRenderer },
        { data: 'ton_cs1', title: 'Tồn CS1', width: 76, className: 'htRight', renderer: zeroBlankRenderer },
        { data: 'ton_cs2', title: 'Tồn CS2', width: 76, className: 'htRight', renderer: zeroBlankRenderer },
        { data: 'nhapmua', title: 'Nhập mua', width: 80, className: 'htRight', renderer: zeroBlankRenderer },
        { data: 'cuoiky', title: 'Cuối kỳ', width: 80, className: 'htRight', renderer: zeroBlankRenderer },
        { data: 'giale', title: 'Giá lẻ', width: 86, className: 'htRight', renderer: zeroBlankRenderer },
    ];
    if (!hotInstance) {
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
            filters: true,
            dropdownMenu: true,
            autoColumnSize: { samplingRatio: 23 },
            afterRender() {
                // nothing
            },
            afterSelectionEnd(r) { showPreviewForRow(r); }
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

showPreviewForRow(0);

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
    const { data, error } = await supabase.rpc("baocaoxnt17_count", buildCountParams(params));
    if (error) throw error;
    return data;
}



async function fetchPaged(params) {
    const fn = "baocaoxnt17_paged";
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
        totalRows = await fetchCount(params);

        // Lấy dữ liệu trang hiện tại
        const rows = await fetchPaged(params);
        // Lấy danh sách mã theo thứ tự trang hiện tại rồi render ảnh
        const masps = Array.from(new Map((rows || []).map(r => [String(r.masp || '').toUpperCase(), 1])).keys());
        renderPreviewForMasps(masps);


        // Render
        renderTable(rows);
        renderSummary(rows);
        // focus ảnh của hàng đầu tiên (nếu có)
        if (rows && rows.length) {
            focusPreview(String(rows[0].masp || '').toUpperCase());
        }

        updatePagingBar();
        loading.textContent = "";
    } catch (err) {
        console.error(err);
        loading.textContent = "Lỗi tải dữ liệu: " + (err?.message || err);
    }
};

// ===================== EXCEL EXPORT (song song) =====================
window.xuatExcelToanBoXNT17 = async function () {
    if (typeof XLSX === "undefined") { alert("Thiếu thư viện XLSX."); return; }
    const psEl = document.getElementById("pageSize");
    const ps = psEl ? Number(psEl.value) || 1000 : 1000;
    const fn = "baocaoxnt17_paged";
    const ok = confirm(`Xuất XLSX nhanh (song song 3 luồng, ${ps}/trang). Tiếp tục?`);
    if (!ok) return;

    async function fetchPage(p) {
        const par = buildParams(p);
        const { data, error } = await supabase.rpc(fn, par);
        if (error) {
            const msg = error?.message || String(error || "");
            // PostgREST 404 / PGRST202: hàm chưa có trong schema cache
            if (msg.includes("PGRST202") || msg.includes("Not Found")) {
                alert("Không tìm thấy RPC 'baocaoxnt17_paged'. Hãy tạo hàm và cấp quyền EXECUTE.");
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
    XLSX.utils.book_append_sheet(wb, ws, "XNT17");
    XLSX.writeFile(wb, `baocaoxnt17_${Date.now()}.xlsx`, { compression: false });
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
// ===================== POPUP TÌM KIẾM (PORT từ XNT15, đã tinh gọn) =====================
window.currentPopupType = null;

// Mở popup + nạp danh sách (trống => show ~100-500 dòng đầu)
window.openPopupSearch = function (type, keyword = "") {
    window.currentPopupType = type;
    const popup = document.getElementById('popupSearch');
    const input = document.getElementById('popupSearchInput');
    const list = document.getElementById('popupSearchList');
    if (!popup || !input || !list) return alert("Thiếu phần tử popupSearch trong HTML!");

    popup.style.display = 'block';
    input.value = keyword || "";
    input.focus();

    // Nếu không có keyword -> hiện nhanh danh sách đầu tiên
    searchPopup(keyword || "");
};

window.closePopupSearch = function () {
    const popup = document.getElementById('popupSearch');
    if (popup) popup.style.display = 'none';
};

// ESC để đóng
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.closePopupSearch();
});

// Click nền để đóng
document.addEventListener('click', (e) => {
    const overlay = document.getElementById('popupSearch');
    const content = document.getElementById('popupSearchContent');
    if (!overlay || overlay.style.display !== 'block') return;
    if (content && content.contains(e.target)) return; // click trong khung -> không đóng
    if (e.target === overlay) window.closePopupSearch();
});

// Gõ trong ô tìm -> nạp danh sách
document.getElementById('popupSearchInput')?.addEventListener('input', () => {
    const keyword = document.getElementById('popupSearchInput').value.trim();
    // Cho phép trống để hiển thị danh sách đầu
    searchPopup(keyword);
});

// Gán phím Enter trên các input ngoài trang để mở popup
[
    { id: "khachhangInput", type: "khachhang" },
    { id: "nhanvienInput", type: "nhanvien" },
    { id: "nhomhangInput", type: "nhomhang" },
    { id: "chungloaiInput", type: "chungloai" },
    { id: "mausacInput", type: "mausac" },
    { id: "sizeInput", type: "size" },
    { id: "maspInput", type: "mahang" },
].forEach(({ id, type }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') window.openPopupSearch(type, el.value);
    });
});

// Render helper
function renderPopupList(rows, type, field, extra) {
    const list = document.getElementById('popupSearchList');
    if (!rows?.length) {
        list.innerHTML = '<i>Không có dữ liệu</i>';
        return;
    }
    // Unique nhẹ cho các trường có thể trùng (nhóm, chủng loại, màu, size)
    const needUniq = ['manhom', 'machungloai', 'mamau', 'size'].includes(field);
    let data = rows;
    if (needUniq) {
        const seen = new Set();
        data = rows.filter(r => {
            const v = r[field];
            if (!v || seen.has(v)) return false;
            seen.add(v);
            return true;
        });
    }

    list.innerHTML = data.map(row => {
        const val = row[field] ?? "";
        const more =
            row.tenkh ? " - " + row.tenkh :
                row.tennv ? " - " + row.tennv :
                    row.tennhom ? " - " + row.tennhom :
                        row.tenchungloai ? " - " + row.tenchungloai :
                            row.tenmau ? " - " + row.tenmau :
                                row.tensp ? " - " + row.tensp :
                                    row.mota ? " - " + row.mota : "";
        const safe = String(val).replace(/'/g, "\\'");
        return `
      <div style="padding:6px 10px;cursor:pointer;border-bottom:1px solid #eee;"
           onclick="selectPopupValue('${type}','${safe}',this)">
        ${val}${more}
      </div>`;
    }).join('');
}

// Render riêng cho nhân viên: chỉ hiển thị tên, nhưng giữ lại manv để trả về input
function renderNhanvienList(rows) {
    const list = document.getElementById('popupSearchList');
    if (!rows?.length) {
        list.innerHTML = '<i>Không có dữ liệu</i>';
        return;
    }
    list.innerHTML = rows.map(r => {
        const manv = (r.manv ?? '').replace(/'/g, "\\'");
        const tennv = (r.tennv ?? '').replace(/'/g, "\\'");
        return `
      <div style="padding:6px 10px;cursor:pointer;border-bottom:1px solid #eee;"
           onclick="selectPopupValue('nhanvien','${manv}','${tennv}')">
        ${r.tennv ?? ''}
      </div>`;
    }).join('');
}


// Hàm tìm kiếm chính cho popup

async function searchPopup(keyword) {
    const type = window.currentPopupType;
    const list = document.getElementById('popupSearchList');
    if (!type || !list) return;

    // Nhánh NCC (lọc trong dmkhachhang, chỉ NCC)
    if (type === 'khachhang' && document.getElementById('locNCCCheckbox')?.checked) {
        let q = supabase.from('dmkhachhang').select('makh, tenkh').eq('la_ncc', true).limit(500);
        if (keyword) q = q.or(`makh.ilike.%${keyword}%,tenkh.ilike.%${keyword}%`);
        const { data, error } = await q;
        if (error) { list.innerHTML = `<i>Lỗi: ${error.message}</i>`; return; }
        renderPopupList(data, 'khachhang', 'makh', ', tenkh');
        return;
    }

    // Bản đồ loại → bảng/field
    let table = '', field = '', extra = '';
    if (type === 'khachhang') { table = 'dmkhachhang'; field = 'makh'; extra = ', tenkh'; }
    else if (type === 'nhanvien') { table = 'dmnhanvien'; field = 'manv'; extra = ', tennv'; }  // sẽ chỉ HIỂN THỊ tennv
    else if (type === 'nhomhang') { table = 'dmnhomhang'; field = 'manhom'; extra = ', tennhom'; }
    else if (type === 'chungloai') { table = 'dmchungloai'; field = 'machungloai'; extra = ', tenchungloai'; }
    else if (type === 'mausac') { table = 'dmmausac'; field = 'mamau'; extra = ', tenmau'; }
    else if (type === 'size') { table = 'dm_size'; field = 'size'; extra = ', mota'; }
    else if (type === 'mahang') { table = 'dmhanghoa'; field = 'masp'; extra = ', tensp'; }
    else { list.innerHTML = '<i>Loại tìm chưa hỗ trợ</i>'; return; }

    // Truy vấn (trống keyword -> trả về danh sách đầu)
    let query = supabase.from(table).select(`${field}${extra}`).limit(500);
    if (keyword) {
        // Tìm linh hoạt: nếu có cột tên thì tìm trên cả mã + tên
        const hasName =
            extra.includes('tenkh') || extra.includes('tennv') ||
            extra.includes('tennhom') || extra.includes('tenchungloai') ||
            extra.includes('tenmau') || extra.includes('tensp');
        if (hasName) {
            const nameCol =
                extra.includes('tenkh') ? 'tenkh' :
                    extra.includes('tennv') ? 'tennv' :
                        extra.includes('tennhom') ? 'tennhom' :
                            extra.includes('tenchungloai') ? 'tenchungloai' :
                                extra.includes('tenmau') ? 'tenmau' :
                                    extra.includes('tensp') ? 'tensp' : field;
            query = query.or(`${field}.ilike.%${keyword}%,${nameCol}.ilike.%${keyword}%`);
        } else {
            query = query.ilike(field, `%${keyword}%`);
        }
    }

    const { data, error } = await query;
    if (error) { list.innerHTML = `<i>Lỗi: ${error.message}</i>`; return; }

    // ---- CHỈ áp dụng riêng cho Nhân viên: hiển thị TÊN, không lộ mã ----
    if (type === 'nhanvien') {
        if (!data?.length) { list.innerHTML = '<i>Không có dữ liệu</i>'; return; }
        list.innerHTML = data.map(r => {
            const manv = String(r.manv ?? '').replace(/'/g, "\\'");
            const tennv = String(r.tennv ?? '');
            return `
        <div style="padding:6px 10px;cursor:pointer;border-bottom:1px solid #eee;"
             onclick="selectPopupValue('nhanvien','${manv}')">
          ${tennv}
        </div>`;
        }).join('');
        return;
    }

    // Các loại khác dùng renderer chung
    renderPopupList(data, type, field, extra);
}


// Người dùng chọn 1 giá trị
window.selectPopupValue = function (type, value, label = '') {
    const map = {
        khachhang: 'khachhangInput',
        nhanvien: 'nhanvienInput',
        nhomhang: 'nhomhangInput',
        chungloai: 'chungloaiInput',
        mausac: 'mausacInput',
        size: 'sizeInput',
        mahang: 'maspInput',
    };
    const id = map[type];
    if (id && document.getElementById(id)) {
        // Giá trị trả về cho bộ lọc vẫn là "mã" để truy vấn chính xác
        document.getElementById(id).value = value;
    }

    // Nếu có ô hiển thị tên nhân viên riêng, điền thêm cho đẹp (không bắt buộc)
    if (type === 'nhanvien') {
        const nameBox = document.getElementById('nhanvienNameInput') || document.getElementById('nhanvienLabel');
        if (nameBox) nameBox.value = label || '';
    }

    window.closePopupSearch();
};


// Xoá nhanh 1 input bất kỳ
window.clearInput = function (id) { const el = document.getElementById(id); if (el) el.value = ''; };




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
    const d = new Date(); const toISO = dt => dt.toISOString().slice(0, 10);
    if (document.getElementById("denNgay")) document.getElementById("denNgay").value = toISO(d);
    if (document.getElementById("tuNgay")) document.getElementById("tuNgay").value = toISO(new Date(d.getFullYear(), d.getMonth(), 1));
    //taiBaoCaoXNT(); 
});


/* ===== PREVIEW ẢNH (40%) =====
 * Bạn nối nguồn ảnh của hệ thống tại hàm getImageUrl(masp).
 * Tạm thời: dựng URL theo quy ước hiện có hoặc dùng API lấy ảnh đầu tiên.
 */

// ====== ẢNH SẢN PHẨM ======
// ====== CẤU HÌNH LƯỚI ẢNH ======
const IMAGES_PER_ROW = 2;  // ← đổi 1/2/3... là xong

const IMG_BASE = "https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/";
const IMG_EXTS = ["jpg", "jpeg", "png", "webp", "JPG", "JPEG", "PNG", "WEBP"];

const PLACEHOLDER_SVG = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360">' +
    '<rect width="100%" height="100%" fill="#f3f4f6"/>' +
    '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-size="18">Chưa có ảnh</text></svg>'
);

// onerror: thử lần lượt các đuôi ảnh theo IMG_EXTS; hết thì đặt placeholder
window.handleImageError = function (img, masp) {
    const next = (parseInt(img.dataset.try || "0", 10) + 1);
    if (next < IMG_EXTS.length) {
        img.dataset.try = String(next);
        img.src = IMG_BASE + encodeURIComponent(masp) + "." + IMG_EXTS[next];
    } else {
        img.onerror = null;
        img.src = PLACEHOLDER_SVG;
    }
};

function getImageUrl(masp) {
    // Ảnh mặc định thử với .jpg trước; các đuôi khác sẽ được thử trong onerror
    return IMG_BASE + encodeURIComponent(masp) + ".JPG";
}


// Lưu danh sách hiện tại để không render lại khi chỉ đổi selection
let currentMaspsList = [];

function renderPreviewForMasps(list) {
    currentMaspsList = list || [];
    const box = document.getElementById("previewGrid");
    const title = document.getElementById("previewTitle");
    if (!box) return;

    // set số cột theo cấu hình
    box.style.gridTemplateColumns = `repeat(${IMAGES_PER_ROW}, minmax(0, 1fr))`;

    title.textContent = `Ảnh nhanh (${currentMaspsList.length.toLocaleString('vi-VN')} mã)`;

    const offset = (currentPage - 1) * pageSize; // STT toàn bộ kết quả
    box.innerHTML = currentMaspsList.map((m, i) => {
        const stt = offset + i + 1;                   // số thứ tự đang hiển thị
        const first = getImageUrl(m);
        // mỗi khối có id để cuộn tới được
        return `
      <figure id="img-${m}" class="preview-card" data-masp="${m}">
        <img loading="lazy"
             src="${first}"
             data-try="0"
             onerror="handleImageError(this,'${m}')"
             alt="${m}">
        <figcaption class="preview-cap">${stt}. ${m}</figcaption>
      </figure>`;
    }).join("");
}

function focusPreview(masp) {
    const box = document.getElementById('previewGrid');
    if (!box || !masp) return;
    // bỏ chọn cũ
    const old = box.querySelector('.preview-card.selected');
    if (old) old.classList.remove('selected');
    // tìm thẻ tương ứng và cuộn tới
    const el = document.getElementById(`img-${masp}`);
    if (el) {
        el.classList.add('selected');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
}



function showPreviewForRow(r) {
    if (!hotInstance) return;
    const row = hotInstance.getSourceDataAtRow(r);
    if (!row) return;
    const masp = String(row.masp || "").toUpperCase();
    if (!masp) return;
    // chỉ focus ảnh tương ứng, KHÔNG render lại lưới (tránh nhảy cuộn)
    focusPreview(masp);
}


/* ===== LOAD & PAGINATION ===== */
async function taiBaoCao() {
    const p = buildParams(currentPage);
    totalRows = await fetchCount(p);
    const rows = await fetchPaged(p);
    renderTable(rows);
    showPreviewForRow(0);
    updatePaging();
}
function updatePaging() {
    const psEl = document.getElementById("pageSize");
    pageSize = Number(psEl?.value || pageSize || 1000);
    const totalPages = Math.max(1, Math.ceil((totalRows || 0) / pageSize));
    document.getElementById("pageInfo").textContent =
        `Trang ${currentPage}/${totalPages} (Tổng: ${totalRows.toLocaleString('vi-VN')})`;
    document.getElementById("btnPrev").disabled = currentPage <= 1;
    document.getElementById("btnNext").disabled = currentPage >= totalPages;
}
window.prevPage = async () => { if (currentPage > 1) { currentPage--; await taiBaoCao(); } };
window.nextPage = async () => { const max = Math.max(1, Math.ceil(totalRows / pageSize)); if (currentPage < max) { currentPage++; await taiBaoCao(); } };
window.gotoPage = async () => {
    const n = Number(document.getElementById("gotoPage").value || "1");
    const max = Math.max(1, Math.ceil(totalRows / pageSize));
    if (n >= 1 && n <= max) { currentPage = n; await taiBaoCao(); }
};

