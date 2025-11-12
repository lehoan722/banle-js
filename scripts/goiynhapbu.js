/* goiynhapbu.js
 * Trang: goiynhapbu.html
 * Yêu cầu: đã include supabaseClient.js để có window.supabase
 * Logic:
 *  - Lấy dataset XNT17 từ sessionStorage (key: xnt17_rows / xnt17_filters)
 *  - Nếu không có → đọc query string → gọi RPC baocaoxnt17_paged để tái tạo dataset
 *  - Ghép nhà cung cấp từ dmhanghoa (map masp -> nhacc)
 *  - Tính sell-through, bán/ngày, rank, gợi ý, nhập đầu kỳ (ước tính)
 *  - Render bảng
 */

/* =========================
 * 1) Trợ giúp chung
 * ========================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const number = (v, digits = 0) => {
    if (v == null || isNaN(v)) return '';
    const f = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
    return f.format(+v);
};
const toCsv = (rows) => {
    const esc = (s) => {
        if (s == null) return '';
        s = String(s);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return rows.map(r => r.map(esc).join(',')).join('\n');
};
const download = (filename, content, mime = 'text/csv;charset=utf-8') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
};

/* =========================
 * 2) Đọc tham số & dataset
 * ========================= */
function getQueryParams() {
    const sp = new URLSearchParams(location.search);
    const p = {};
    for (const [k, v] of sp.entries()) p[k] = v;
    return p;
}

function daysBetween(tu, den) {
    if (!tu || !den) return 1;
    const d1 = new Date(tu); const d2 = new Date(den);
    const diff = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
    return diff;
}

function readDatasetFromSession() {
    try {
        const rows = JSON.parse(sessionStorage.getItem('xnt17_rows') || 'null');
        const filters = JSON.parse(sessionStorage.getItem('xnt17_filters') || 'null');
        if (!rows || !Array.isArray(rows) || !filters) return null;
        return { rows, filters, source: 'session' };
    } catch (e) { return null; }
}

/* =========================
 * 3) Fallback: gọi RPC XNT17
 * ========================= */
async function fetchXNT17ViaRPC(params) {
    // Bạn đã có supabaseClient.js → window.supabase sẵn
    // Lấy tối đa 10k dòng/lần. Nếu cần phân trang thì lặp offset.
    const payload = {
        tu_ngay: params.tu_ngay || params.tu || params.tuNgay,
        den_ngay: params.den_ngay || params.den || params.denNgay,
        p_dsmsp: null,
        p_diadiem_filter: params.diadiem || params.dd || null,
        p_nhomhang_filter: params.nhomhang || null,
        p_chungloai_filter: params.chungloai || null,
        p_mausac_filter: params.mausac || null,
        p_size_filter: params.size || null,
        p_nhacc_filter: params.nhacc || null,
        p_khachhang_filter: params.khachhang || null,
        p_nhanvien_filter: params.nhanvien || null,
        p_tu_gia: params.tu_gia ? +params.tu_gia : null,
        p_den_gia: params.den_gia ? +params.den_gia : null,
        loc_duong: params.loc_duong === 'true' ? true : false,
        loc_am: params.loc_am === 'true' ? true : false,
        loc_het: params.loc_het === 'true' ? true : false,
        loc_phatsinh_nhap: params.loc_ps_nhap === 'true' ? true : false,
        loc_phatsinh_xuat: params.loc_ps_xuat === 'true' ? true : false,
        p_tonghop_size: params.tonghop_size === 'true' ? true : false,
        p_limit: 10000,
        p_offset: 0
    };

    const rows = [];
    for (; ;) {
        const { data, error } = await window.supabase.rpc('baocaoxnt17_paged', payload);
        if (error) throw error;
        if (!data || !data.length) break;
        rows.push(...data);
        if (data.length < payload.p_limit) break;
        payload.p_offset += payload.p_limit;
    }

    const filters = {
        tu_ngay: payload.tu_ngay, den_ngay: payload.den_ngay,
        diadiem: payload.p_diadiem_filter || 'Tất cả',
        nhomhang: payload.p_nhomhang_filter || 'Tất cả',
        raw: payload
    };
    return { rows, filters, source: 'rpc' };
}

/* =========================
 * 4) Bổ sung Nhà cung cấp
 * ========================= */
async function fetchNhaccMapByMasps(masps) {
    if (!masps || !masps.length) return {};
    if (!window.supabase || !window.supabase.from) {
        console.warn('Supabase client chưa sẵn sàng — bỏ qua ghép Nhà CC.');
        return {};
    }
    const uniq = Array.from(new Set(masps)).slice(0, 10000);
    const { data, error } = await window.supabase
        .from('dmhanghoa')
        .select('masp, nhacc')
        .in('masp', uniq);
    if (error) { console.warn('fetchNhaccMap error', error); return {}; }
    const map = {};
    (data || []).forEach(r => { map[r.masp] = r.nhacc || ''; });
    return map;
}


/* =========================
 * 5) Tính toán chỉ số nhập bù
 * ========================= */
function computeMetrics(rows, filters, options) {
    const days = daysBetween(filters.tu_ngay, filters.den_ngay);
    const valid = [];
    const enriched = rows.map(r => {
        const nhapKy = +r.nhapmua || 0;
        const banCs1 = +r.xuatban_cs1 || 0;
        const banCs2 = +r.xuatban_cs2 || 0;
        const xuatChiNhanh1 = +r.xuatchinhanh_cs1 || 0;
        const xuatChiNhanh2 = +r.xuatchinhanh_cs2 || 0;
        const banKy = banCs1 + banCs2; // bán lẻ
        const tonCuoi = +r.cuoiky || 0;

        // ƯỚC TÍNH tồn đầu kỳ (sẽ thay bằng server khi có):
        // ton_dau ≈ ton_cuoi + (tổng xuất trong kỳ) - (tổng nhập trong kỳ)
        const tongXuatKy = banKy + xuatChiNhanh1 + xuatChiNhanh2;
        const tonDauKy = tonCuoi + tongXuatKy - nhapKy;

        const sellThrough = nhapKy > 0 ? (banKy / nhapKy) : 0;
        const sellPerDay = days > 0 ? (banKy / days) : 0;

        const row = {
            masp: r.masp,
            nhacc: '', // sẽ ghép sau
            nhap_dau_ky: tonDauKy,
            nhap_ky: nhapKy,
            ban_ky: banKy,
            ton_cuoi: tonCuoi,
            sell_through: sellThrough, // 0..1
            sell_per_day: sellPerDay,
            rank: 0, // tạm, sẽ set sau
            goi_y: 0, // tạm, sẽ set sau
            raw: r
        };
        if (nhapKy > 0) valid.push(row);
        return row;
    });

    // Trung bình sell-through trên các dòng valid
    const avgST = valid.length
        ? valid.reduce((a, b) => a + b.sell_through, 0) / valid.length
        : 0.0001;

    enriched.forEach(row => {
        row.rank = avgST > 0 ? (row.sell_through / avgST) : 0;

        // Gợi ý số lượng nhập = daily * targetDays * safety - tồn cuối
        const targetDays = +options.targetDays || 14;
        const safety = +options.safety || 1.2;
        let suggest = Math.ceil(row.sell_per_day * targetDays * safety - row.ton_cuoi);
        if (!isFinite(suggest) || suggest < 0) suggest = 0;
        row.goi_y = suggest;
    });

    // Lọc theo ngưỡng người dùng
    const stMin = (+options.stMin || 0) / 100; // % → fraction
    const perDayMin = +options.perDayMin || 0;
    const nhapMin = +options.nhapMin || 0;
    let out = enriched.filter(r =>
        r.nhap_ky >= nhapMin &&
        r.sell_through >= stMin &&
        r.sell_per_day >= perDayMin
    );

    // Sắp xếp: rank desc → sell_per_day desc
    out.sort((a, b) => (b.rank - a.rank) || (b.sell_per_day - a.sell_per_day));
    return { rows: out, avgST, days };
}
async function ensureHOTLoaded() {
    if (window.Handsontable) return true;
    // Nếu vì lý do nào đó script UMD chưa sẵn sàng, tự nạp lại:
    await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/handsontable@14.3.0/dist/handsontable.full.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
    });
    return !!window.Handsontable;
}


/* =========================
 * 5.9) Handsontable for result table
 * ========================= */
let hot = null;           // instance Handsontable
let hotData = [];         // dữ liệu đang hiển thị (sau tính toán)
const hotCols = [
    { data: 'stt', title: 'STT', type: 'numeric', width: 60 },
    { data: 'masp', title: 'MÃ SP', type: 'text', width: 160 },
    { data: 'nhacc', title: 'NHÀ CC', type: 'text', width: 160 },
    { data: 'nhap_dau_ky', title: 'NHẬP ĐẦU KỲ', type: 'numeric', width: 120 },
    { data: 'nhap_ky', title: 'NHẬP KỲ', type: 'numeric', width: 100 },
    { data: 'ban_ky', title: 'BÁN KỲ', type: 'numeric', width: 100 },
    { data: 'ton_cuoi', title: 'TỒN CUỐI', type: 'numeric', width: 100 },
    { data: 'pct_bn', title: '% BÁN/NHẬP', type: 'numeric', width: 110, numericFormat: { pattern: '0.0' } },
    { data: 'ban_ngay', title: 'BÁN/NGÀY', type: 'numeric', width: 110, numericFormat: { pattern: '0.0' } },
    { data: 'rank', title: 'ĐIỂM', type: 'numeric', width: 90, numericFormat: { pattern: '0.00' } },
    { data: 'goi_y', title: 'GỢI Ý', type: 'numeric', width: 90 },
    // cột ẩn “Xem” sẽ mở chi tiết/đẩy ảnh khi click hàng
];

function buildHotData(rows) {
    // Chuẩn hoá dữ liệu cho HOT
    return rows.map((r, i) => ({
        stt: i + 1,
        masp: r.masp,
        nhacc: r.nhacc || '',
        nhap_dau_ky: r.nhap_dau_ky ?? 0,
        nhap_ky: r.nhap_ky ?? 0,
        ban_ky: r.ban_ky ?? 0,
        ton_cuoi: r.ton_cuoi ?? 0,
        pct_bn: +(r.sell_through * 100).toFixed(1),
        ban_ngay: +(+r.sell_per_day).toFixed(1),
        rank: +(+r.rank).toFixed(2),
        goi_y: r.goi_y ?? 0
    }));
}

function renderHOT(rows) {
    hotData = buildHotData(rows);
    const container = document.getElementById('hotGoiY');
    if (!container) return;

    const HOT = window.Handsontable;
    if (!HOT) { console.warn('Handsontable chưa sẵn sàng'); return; }

    // TÍNH CHIỀU CAO THỰC
    const wrap = document.getElementById('hotWrap');
    const h = Math.max(360, (wrap?.clientHeight || 0));

    if (hot) {
        hot.updateSettings({ data: hotData, height: h });
        hot.render();
        return;
    }

    hot = new HOT(container, {
        data: hotData,
        columns: hotCols,
        colHeaders: hotCols.map(c => c.title),
        rowHeaders: true,
        stretchH: 'all',
        height: h,                              // <— dùng chiều cao thật
        licenseKey: 'non-commercial-and-evaluation',
        filters: true,
        dropdownMenu: true,
        columnSorting: true,
        manualColumnMove: true,
        manualColumnResize: true,
        contextMenu: ['copy', 'cut', '---------', 'freeze_column', 'unfreeze_column', '---------', 'alignment'],
        hiddenColumns: { indicators: true },
        cells: (row, col) => {
            const props = {};
            const key = hotCols[col]?.data;
            if (['nhap_dau_ky', 'nhap_ky', 'ban_ky', 'ton_cuoi', 'pct_bn', 'ban_ngay', 'rank', 'goi_y', 'stt'].includes(key)) {
                props.className = 'htRight';
            }
            return props;
        },
        afterSelection: (r1) => {
            const rec = hot.getSourceDataAtRow(r1);
            if (rec?.masp) promotePreviewToTop(rec.masp);
        },
        afterOnCellMouseDown: (event, coords) => {
            if (coords?.row != null) {
                const rec = hot.getSourceDataAtRow(coords.row);
                if (rec?.masp && event?.domEvent?.detail >= 2) {
                    sessionStorage.setItem('xnt17_focus_masp', rec.masp);
                    location.href = '/baocaoxnt17.html?masp=' + encodeURIComponent(rec.masp);
                }
            }
        }
    });
}


/* =========================
 * 6) Render giao diện
 * ========================= */
function fillChips(filters, totalRows) {
    $('#chipTuNgay').textContent = `Từ ngày: ${filters?.tu_ngay || '--/--/----'}`;
    $('#chipDenNgay').textContent = `Đến ngày: ${filters?.den_ngay || '--/--/----'}`;
    $('#chipDiaDiem').textContent = `Địa điểm: ${filters?.diadiem || 'Tất cả'}`;
    $('#chipNhomHang').textContent = `Nhóm hàng: ${filters?.nhomhang || 'Tất cả'}`;
    $('#chipBoLocKhac').textContent = `Bộ lọc: ${totalRows ?? 0} dòng nền`;
}



/* =========================
 * 6.5) ẢNH NHANH (reuse từ Chuyển kho)
 * ========================= */
const IMG_BASE = "https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/";
const IMG_EXTS = ["jpg", "jpeg", "png", "webp", "JPG", "JPEG", "PNG", "WEBP"];
const PLACEHOLDER_SVG = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360"><rect width="100%" height="100%" fill="#f3f4f6"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-size="18">Chưa có ảnh</text></svg>'
);

function getImageUrl(masp, suffix = "") { return IMG_BASE + encodeURIComponent(masp + suffix) + ".JPG"; }
function handleImageError(img, masp, suffix = "") {
    const next = (parseInt(img.dataset.try || "0", 10) + 1);
    if (next < IMG_EXTS.length) {
        img.dataset.try = String(next);
        img.src = IMG_BASE + encodeURIComponent(masp + suffix) + "." + IMG_EXTS[next];
    } else {
        img.onerror = null; img.src = PLACEHOLDER_SVG;
    }
}

function renderPreviewForMasps(list) {
    const box = document.getElementById("previewGrid");
    const title = document.getElementById("previewTitle");
    if (!box) return;
    const masps = (list || []).map(s => String(s || "").toUpperCase());
    title.textContent = `Ảnh nhanh (${masps.length.toLocaleString('vi-VN')} mã)`;

    const DETAIL_URL = "/timkiemhanghoa333.html"; // link chi tiết

    box.innerHTML = masps.map((m, i) => `
    <figure id="img-${m}" class="preview-card" data-masp="${m}">
      <img loading="lazy"
           src="${getImageUrl(m)}" data-try="0" alt="${m}"
           onclick="openLightbox(this.src)"
           onerror="(function(img,masp){ const next=(parseInt(img.dataset.try||'0',10)+1);
             const exts=['jpg','jpeg','png','webp','JPG','JPEG','PNG','WEBP'];
             if(next<exts.length){ img.dataset.try=String(next); img.src='${IMG_BASE}'+encodeURIComponent(masp)+'.'+exts[next];}
             else{ img.onerror=null; img.src='${PLACEHOLDER_SVG}'; } })(this,'${m}')">
      <figcaption class="preview-cap">
        <span class="cap-link" onclick="window.open('${DETAIL_URL}?masp=${encodeURIComponent(m)}','_blank')">
          ${i + 1}. ${m}
        </span>
      </figcaption>
    </figure>
  `).join("");
}

function promotePreviewToTop(masp) {
    const box = document.getElementById('previewGrid');
    if (!box || !masp) return;
    const id = `img-${String(masp).toUpperCase()}`;
    const el = document.getElementById(id);
    if (!el) return;
    const first = box.firstElementChild;
    if (el !== first) {
        box.insertBefore(el, first);
        // đánh số lại
        box.querySelectorAll('.preview-card').forEach((fig, idx) => {
            const m = fig.dataset.masp || '';
            const cap = fig.querySelector('.preview-cap .cap-link');
            if (cap) cap.textContent = `${idx + 1}. ${m}`;
        });
    }
    const old = box.querySelector('.preview-card.selected');
    if (old && old !== el) old.classList.remove('selected');
    el.classList.add('selected');
    box.scrollTo({ top: 0, behavior: 'smooth' });
}


/* =========================
 * 7) Khởi tạo trang
 * ========================= */
async function main() {

    await ensureHOTLoaded();
    await new Promise(r => requestAnimationFrame(r));   // đợi layout ổn định


    // Đọc dataset
    let ctx = readDatasetFromSession();
    if (!ctx) {
        const qp = getQueryParams();
        try {
            ctx = await fetchXNT17ViaRPC(qp);
        } catch (e) {
            alert('Không lấy được dữ liệu nền từ XNT17.\n' + e.message);
            return;
        }
    }

    // Điền chip tóm tắt
    fillChips(ctx.filters, ctx.rows?.length || 0);

    // GHÉP NHÀ CUNG CẤP
    const masps = (ctx.rows || []).map(r => r.masp).filter(Boolean);
    const nhaccMap = await fetchNhaccMapByMasps(masps);

    // ĐỌC tham số gợi ý từ form
    const options = {
        stMin: +$('#inpSellThroughMin').value || 60,
        perDayMin: +($('#inpBanNgayMin').value || '0.3'.replace(',', '.')),
        targetDays: +$('#inpTargetDays').value || 14,
        safety: +($('#inpSafetyFactor').value || '1.2'.replace(',', '.')),
        nhapMin: +$('#inpNhapToiThieu').value || 3
    };
    // ❶ Sau khi tính toán lần đầu
    let { rows } = computeMetrics(ctx.rows, ctx.filters, options);
    rows.forEach(r => { r.nhacc = nhaccMap[r.masp] || ''; });
    renderHOT(rows);
    document.getElementById('countRows').textContent = `${rows.length} dòng`;

    // giữ danh sách hiện hành để export/preview
    let currentRows = rows;

    // vẽ ảnh lần đầu
    renderPreviewForMasps(Array.from(new Set(currentRows.map(r => r.masp))).filter(Boolean));

    // ❷ Handler Áp dụng
    $('#btnApDung').addEventListener('click', () => {
        const opts = {
            stMin: +$('#inpSellThroughMin').value || 0,
            perDayMin: +($('#inpBanNgayMin').value || '0'.replace(',', '.')),
            targetDays: +$('#inpTargetDays').value || 14,
            safety: +($('#inpSafetyFactor').value || '1'.replace(',', '.')),
            nhapMin: +$('#inpNhapToiThieu').value || 0
        };
        const res = computeMetrics(ctx.rows, ctx.filters, opts);
        res.rows.forEach(r => { r.nhacc = nhaccMap[r.masp] || ''; });
        renderHOT(res.rows);
        document.getElementById('countRows').textContent = `${res.rows.length} dòng`;

        // CẬP NHẬT preview ảnh theo kết quả mới
        currentRows = res.rows;
        renderPreviewForMasps(Array.from(new Set(currentRows.map(r => r.masp))).filter(Boolean));
    });



    $('#btnMacDinh').addEventListener('click', () => {
        $('#inpSellThroughMin').value = 60;
        $('#inpBanNgayMin').value = 0.3;
        $('#inpTargetDays').value = 14;
        $('#inpSafetyFactor').value = 1.2;
        $('#inpNhapToiThieu').value = 3;
    });

    // Back về XNT17 (mở lại tab trước nếu còn history)
    $('#btnBackXNT17').addEventListener('click', () => {
        // Nếu có url nguồn trong sessionStorage thì dùng, không thì history.back()
        const backUrl = sessionStorage.getItem('xnt17_url');
        if (backUrl) location.href = backUrl;
        else history.back();
    });

    // Xuất CSV nhanh
    $('#btnExportExcel').addEventListener('click', () => {
        const header = hotCols.map(c => c.title);
        const body = hotData.map(r => hotCols.map(c => r[c.data]));
        const csv = toCsv([header, ...body]);
        download(`goi_y_nhap_bu_${Date.now()}.csv`, csv);
    });




}

// Khởi chạy
document.addEventListener('DOMContentLoaded', main);
