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

function renderTable(rows) {
    const tbody = $('#tblGoiYNhapBu tbody');
    tbody.innerHTML = '';
    rows.forEach((r, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${idx + 1}</td>
      <td class="nowrap">${r.masp}</td>
      <td class="nowrap">${r.nhacc || ''}</td>
      <td class="num">${number(r.nhap_dau_ky)}</td>
      <td class="num">${number(r.nhap_ky)}</td>
      <td class="num">${number(r.ban_ky)}</td>
      <td class="num">${number(r.ton_cuoi)}</td>
      <td class="num">${number(r.sell_through * 100, 1)}</td>
      <td class="num">${number(r.sell_per_day, 1)}</td>
      <td class="num">${number(r.rank, 2)}</td>
      <td class="num">${number(r.goi_y)}</td>
      <td><a class="link" href="#" data-masp="${r.masp}">Xem</a></td>
    `;
        tbody.appendChild(tr);
    });
    $('#countRows').textContent = `${rows.length} dòng`;
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

    // TÍNH toán
    let { rows } = computeMetrics(ctx.rows, ctx.filters, options);

    // Gắn NHÀ CC vào dòng
    rows.forEach(r => { r.nhacc = nhaccMap[r.masp] || ''; });

    // Render
    renderTable(rows);

    // Vẽ ảnh theo danh sách mã đang hiển thị
    const maspsUnique = Array.from(new Set(rows.map(r => r.masp))).filter(Boolean);
    renderPreviewForMasps(maspsUnique);


    // SỰ KIỆN: Áp dụng / Về mặc định
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
        renderTable(res.rows);
    });

    const maspsUnique2 = Array.from(new Set(res.rows.map(r => r.masp))).filter(Boolean);
    renderPreviewForMasps(maspsUnique2);


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
        const header = ['STT', 'MASP', 'NHACC', 'NHAP_DAU_KY', 'NHAP_KY', 'BAN_KY', 'TON_CUOI', 'PCT_BAN_NHAP', 'BAN_NGAY', 'RANK', 'GOIY'];
        const body = rows.map((r, i) => ([
            i + 1, r.masp, r.nhacc,
            r.nhap_dau_ky, r.nhap_ky, r.ban_ky, r.ton_cuoi,
            +(r.sell_through * 100).toFixed(1),
            +r.sell_per_day.toFixed(2),
            +r.rank.toFixed(2),
            r.goi_y
        ]));
        const csv = toCsv([header, ...body]);
        download(`goi_y_nhap_bu_${Date.now()}.csv`, csv);
    });

    // Gắn handler "Xem" chi tiết (mở XNT17 lọc theo mã)
    $('#tblGoiYNhapBu').addEventListener('click', (e) => {
        const a = e.target.closest('a[data-masp]');
        if (!a) return;
        e.preventDefault();
        const masp = a.getAttribute('data-masp');
        // Lưu nhanh để XNT17 đọc (tuỳ bạn đang triển khai filter như nào)
        sessionStorage.setItem('xnt17_focus_masp', masp);
        // Điều hướng (cập nhật đúng path của bạn)
        location.href = '/baocaoxnt17.html?masp=' + encodeURIComponent(masp);
    });

    // Đưa ảnh mã được click lên đầu lưới ảnh
    $('#tblGoiYNhapBu tbody').addEventListener('click', (e) => {
        const tr = e.target.closest('tr');
        if (!tr) return;
        // cột 2 = MASP theo renderTable()
        const masp = tr.children?.[1]?.textContent?.trim();
        if (masp) promotePreviewToTop(masp);
    });

    document.querySelector('#tblGoiYNhapBu').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-masp]');
  if (!a) return;
  e.preventDefault();
  promotePreviewToTop(a.dataset.masp);
});


}

// Khởi chạy
document.addEventListener('DOMContentLoaded', main);
