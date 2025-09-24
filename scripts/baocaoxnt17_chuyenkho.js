// scripts/baocaoxnt17_chuyenkho.js
import { supabase } from './supabaseClient.js'; // dùng chung client đã có

// == CSS & LIGHTBOX cho lưới ảnh (port từ XNT17) ==
(function injectQuickViewCss() {
    const css = `
  #previewGrid { display:grid; gap:10px; overflow:auto; }
  .preview-card { border-radius:10px; background:#fff; box-shadow:0 0 0 1px #eee inset; padding:8px; }
  .preview-card.selected { box-shadow:0 0 0 2px #3b82f6 inset; }
  .preview-card img { width:100%; height:auto; aspect-ratio: 4/3; object-fit: cover; border-radius:8px; display:block; cursor: zoom-in; }
  .preview-cap { margin-top:6px; font-size:13px; color:#374151; text-align:center; }
  .preview-cap .cap-link { font-weight:700; color:#111; text-decoration:none; cursor:pointer; }
  .preview-cap .cap-link:hover { text-decoration:underline; }
  .lb-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.75); display:none; align-items:center; justify-content:center; z-index: 9999; }
  .lb-backdrop.show { display:flex; }
  .lb-wrap { max-width: 92vw; max-height: 92vh; }
  .lb-wrap img { width:100%; height:100%; object-fit:contain; }
  .lb-close { position:absolute; top:14px; right:18px; font-size:22px; color:#fff; cursor:pointer; }`;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);

    const lb = document.createElement('div');
    lb.className = 'lb-backdrop';
    lb.innerHTML = `<div class="lb-close" title="Đóng">✕</div><div class="lb-wrap"><img alt="Ảnh lớn"></div>`;
    document.body.appendChild(lb);
    lb.addEventListener('click', (e) => {
        if (e.target.classList.contains('lb-backdrop') || e.target.classList.contains('lb-close')) lb.classList.remove('show');
    });
    window.openLightbox = (src) => { const img = lb.querySelector('.lb-wrap img'); img.src = src; lb.classList.add('show'); };
})();

let hot;
const SIZE_ORDER = ['size 0', 'size 38', 'size 39', 'size 40', 'size 41', 'size 42', 'size 43', 'size 44', 'size 45']; // 9 dòng/1 mã

// ===== 1) Đọc filter do XNT17 gửi sang =====
function getFilters() {
    const raw = sessionStorage.getItem('xnt17_transfer_filters');
    if (!raw) return null;
    return JSON.parse(raw);
}

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


// ===== 2) Tải toàn bộ dữ liệu bằng RPC hiện có =====


// ===== 3) Gom theo masp → 9 size + 1 dòng “Tổng” =====
function buildTransferTable(rows) {
    const map = new Map();
    for (const r of rows) {
        const masp = String(r.masp || '').toUpperCase();
        if (!masp) continue;
        if (!map.has(masp)) map.set(masp, {});
        const g = map.get(masp);

        const szKey = normalizeSize(r.size);     // ⬅️ dùng chuẩn hoá
        const cs1 = Number(r.ton_cs1 || 0);
        const cs2 = Number(r.ton_cs2 || 0);

        g[szKey] = { masp, size: szKey || (r.size || ''), cs1, cs2 };
    }

    const out = [];
    for (const [masp, sizes] of map) {
        let sum1 = 0, sum2 = 0;
        for (const s of SIZE_ORDER) {
            const it = sizes[s] || { masp, size: s, cs1: 0, cs2: 0 };
            const goiy = calcGoiy(it.cs1, it.cs2);
            out.push({
                masp, size: it.size, cs1: it.cs1, cs2: it.cs2,
                goiy, tong: it.cs1 + it.cs2, vitri_cs1: '', vitri_cs2: '', __isSum: false
            });
            sum1 += it.cs1; sum2 += it.cs2;
        }
        out.push({
            masp, size: 'Tổng', cs1: sum1, cs2: sum2,
            goiy: calcGoiy(sum1, sum2), tong: sum1 + sum2, vitri_cs1: '', vitri_cs2: '', __isSum: true
        });
    }
    return out;
}

// Quy tắc gợi ý giữ nguyên tinh thần file chuyển kho Google Sheet  :contentReference[oaicite:7]{index=7}
function calcGoiy(cs1, cs2) {
    if (cs1 >= 1 && cs2 === 0) return '1v2';
    if (cs1 === 0 && cs2 >= 2) return '2v1';
    if (cs1 <= 1 && cs2 > 2) return '2v1';
    if (cs2 <= 1 && cs1 > 2) return '1v2';
    return 'cân bằng';
}

// (Tối giản) Lấy vị trí kho từ dmhanghoa — bạn có thể thay bằng JOIN RPC riêng nếu muốn
// (Chuẩn) Lấy vị trí kho từ dmhanghoa (vitrikho1/vitrikho2) và map sang vitri_cs1/vitri_cs2
async function patchVitri(outArr) {
    const uniq = [...new Set(outArr.map(r => r.masp))];

    const { data, error } = await supabase
        .from('dmhanghoa')
        .select('masp, vitri_cs1:vitrikho1, vitri_cs2:vitrikho2') // alias về tên chuẩn dùng trong bảng kết quả
        .in('masp', uniq);

    if (error) {
        console.warn('patchVitri error:', error);
        return;
    }

    const vitriMap = new Map((data || []).map(d => [String(d.masp || '').toUpperCase(), d]));
    for (const r of outArr) {
        const v = vitriMap.get(r.masp);
        if (!v) continue;
        r.vitri_cs1 = v.vitri_cs1 || '';
        r.vitri_cs2 = v.vitri_cs2 || '';
    }
}

// ===== 4) Render Handsontable + đồng bộ ảnh =====
function renderHOT(rows) {
    const container = document.getElementById('hot');
    if (hot) hot.destroy();

    hot = new Handsontable(container, {
        data: rows,
        licenseKey: 'non-commercial-and-evaluation',
        rowHeaders: true,
        colHeaders: ['Mã SP', 'Size', 'CS1', 'CS2', 'Gợi ý', 'Tổng', 'Vị trí CS1', 'Vị trí CS2'],
        columns: [
            { data: 'masp', readOnly: true },
            { data: 'size', readOnly: true },
            { data: 'cs1', readOnly: true, type: 'numeric' },
            { data: 'cs2', readOnly: true, type: 'numeric' },
            { data: 'goiy', readOnly: true },
            { data: 'tong', readOnly: true, type: 'numeric' },
            { data: 'vitri_cs1', readOnly: true },
            { data: 'vitri_cs2', readOnly: true },
        ],
        filters: true,
        dropdownMenu: true,
        columnSorting: true,
        height: '100%',
        stretchH: 'all',
        cells: (row, col) => {
            const cell = {};
            const r = rows[row];
            if (r?.__isSum) cell.className = 'sumRow';
            return cell;
        },
        afterSelectionEnd: (r) => {
            const row = rows[r];
            if (!row) return;
            focusPreview(row.masp);  // ⬅️ chỉ focus/scroll tới ảnh tương ứng
            const tr = hot.getCell(r, 0)?.parentElement;
            if (tr) tr.scrollIntoView({ block: 'center' });
        }
    });

    // Copy
    document.getElementById('btnCopy').onclick = () => {
        const headers = hot.getColHeader();
        const tsv = [headers.join('\t')]
            .concat(hot.getData().map(row => row.map(v => v ?? '').join('\t')))
            .join('\n');
        navigator.clipboard.writeText(tsv).then(() => alert('Đã copy bảng'));
    };

    // Export
    document.getElementById('btnExport').onclick = () => {
        const headers = hot.getColHeader();
        const aoa = [headers, ...hot.getData()];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        XLSX.utils.book_append_sheet(wb, ws, 'ChuyenKho');
        XLSX.writeFile(wb, `goi_y_chuyen_kho_${Date.now()}.xlsx`);
    };
}

// ===== 5) Đồng bộ ảnh (reuse pattern của XNT17) =====
// ==== ẢNH: copy từ XNT17 ====
const IMG_BASE = "https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/";
const IMG_EXTS = ["jpg", "jpeg", "png", "webp", "JPG", "JPEG", "PNG", "WEBP"];

const PLACEHOLDER_SVG = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360">' +
    '<rect width="100%" height="100%" fill="#f3f4f6"/>' +
    '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-size="18">Chưa có ảnh</text></svg>'
);

// Thử lần lượt các đuôi ảnh
function handleImageError(img, masp, suffix = "") {
    const next = (parseInt(img.dataset.try || "0", 10) + 1);
    if (next < IMG_EXTS.length) {
        img.dataset.try = String(next);
        img.src = IMG_BASE + encodeURIComponent(masp + suffix) + "." + IMG_EXTS[next];
    } else {
        img.onerror = null;
        img.src = PLACEHOLDER_SVG;
    }
}
function getImageUrl(masp, suffix = "") {
    // Thử JPG trước, onerror sẽ thử đuôi khác
    return IMG_BASE + encodeURIComponent(masp + suffix) + ".JPG";
}

// Bạn có thể thay bằng đúng hàm tải ảnh đang dùng ở XNT17 (cùng cấu trúc). Dưới đây là placeholder:
function updateImagesByMasp(masp) {
    const img1 = document.getElementById('img1');
    const img2 = document.getElementById('img2');
    if (!img1 || !img2) return;

    // link tra cứu nhanh như XNT17
    setTimKiemLinks(masp);

    // Ảnh 1: mã gốc
    img1.dataset.try = "0";
    img1.onerror = () => handleImageError(img1, masp, "");
    img1.src = getImageUrl(masp, "");
    img1.title = `Xem nhanh: ${masp}`;

    // Ảnh 2: ưu tiên hậu tố _2
    img2.dataset.try = "0";
    img2.onerror = () => handleImageError(img2, masp, "_2");
    img2.src = getImageUrl(masp, "_2");
    img2.title = `Xem nhanh: ${masp} (ảnh 2)`;
}

function setTimKiemLinks(masp) {
    const u = `timkiemhanghoa333.html?masp=${encodeURIComponent(masp)}`;
    const a1 = document.getElementById('link1');
    const a2 = document.getElementById('link2');
    if (a1) a1.href = u;
    if (a2) a2.href = u;
}

const IMAGES_PER_ROW = 2; // số cột trong lưới ảnh

// Lưu danh sách mã của panel ảnh để scroll/focus
let currentMaspsList = [];

function makePreviewCard(masp, index) {
  const fig = document.createElement('figure');
  fig.id = `img-${masp}`;
  fig.className = 'preview-card';
  fig.dataset.masp = masp;

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = masp;
  img.dataset.try = '0';
  img.src = getImageUrl(masp);
  img.onclick = () => openLightbox(img.src);
  img.onerror = () => {
    const next = (parseInt(img.dataset.try || '0', 10) + 1);
    if (next < IMG_EXTS.length) {
      img.dataset.try = String(next);
      img.src = IMG_BASE + encodeURIComponent(masp) + '.' + IMG_EXTS[next];
    } else {
      img.onerror = null;
      img.src = PLACEHOLDER_SVG;
    }
  };

  const cap = document.createElement('figcaption');
  cap.className = 'preview-cap';

  const span = document.createElement('span');
  span.className = 'cap-link';
  span.textContent = `${index + 1}. ${masp}`;
  span.onclick = () =>
    window.open(`timkiemhanghoa333.html?masp=${encodeURIComponent(masp)}`, '_blank');

  cap.appendChild(span);
  fig.appendChild(img);
  fig.appendChild(cap);
  return fig;
}

function renderPreviewForMasps(list) {
  currentMaspsList = (list || []).map(x => String(x || '').toUpperCase());
  const box = document.getElementById('previewGrid');
  const title = document.getElementById('previewTitle');
  if (!box) return;

  box.style.gridTemplateColumns = `repeat(${IMAGES_PER_ROW}, minmax(0, 1fr))`;
  title.textContent = `Ảnh nhanh (${currentMaspsList.length.toLocaleString('vi-VN')} mã)`;

  // Xoá cũ, render mới bằng DOM API
  box.innerHTML = '';
  currentMaspsList.forEach((m, i) => box.appendChild(makePreviewCard(m, i)));
}

function focusPreview(masp) {
  const box = document.getElementById('previewGrid');
  if (!box || !masp) return;
  const old = box.querySelector('.preview-card.selected');
  if (old) old.classList.remove('selected');
  const el = document.getElementById(`img-${masp}`);
  if (el) {
    el.classList.add('selected');
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }
}


function focusPreview(masp) {
    const box = document.getElementById('previewGrid');
    if (!box || !masp) return;
    const old = box.querySelector('.preview-card.selected');
    if (old) old.classList.remove('selected');
    const el = document.getElementById(`img-${masp}`);
    if (el) {
        el.classList.add('selected');
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
}


// ===== 6) Entry point =====
async function boot() {
    document.getElementById('status').textContent = 'Đang tải dữ liệu…';

    // 1) Ưu tiên lấy data đã đẩy sẵn từ XNT17
    const rawRows = sessionStorage.getItem('xnt17_transfer_rows');
    let raw = [];
    if (rawRows) {
        raw = JSON.parse(rawRows);
    } else {
        // (fallback) nếu mở thẳng trang này không qua XNT17, mới gọi RPC
        const filters = getFilters();
        if (!filters) { document.getElementById('status').textContent = 'Thiếu dữ liệu/thiếu filter'; return; }
        raw = await fetchAllRows(filters); // giữ lại hàm này như phương án B
    }

    // 2) Dựng bảng chuyển kho
    const rows = buildTransferTable(raw);   // 9 dòng size + 1 dòng “Tổng”
    // Lập danh sách MASP duy nhất (giữ thứ tự xuất hiện trong raw)
    const masps = Array.from(new Map((raw || []).map(r => [String(r.masp || '').toUpperCase(), 1])).keys());
    renderPreviewForMasps(masps);

    await patchVitri(rows);                 // lấy vị trí từ dmhanghoa (đọc trực tiếp table)
    renderHOT(rows);
    if (masps.length) focusPreview(masps[0]);

    // 3) Tuỳ chọn: dọn storage (tránh chiếm bộ nhớ phiên)
    // sessionStorage.removeItem('xnt17_transfer_rows');

    document.getElementById('status').textContent =
        `Đã tải ${rows.length} dòng (đã có dòng Tổng cho từng mã)`;
}


document.getElementById('btnReload').onclick = boot;
boot();

function normalizeSize(v) {
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) return '';
    // nếu chỉ là số: "39" -> "size 39", "0" -> "size 0"
    if (/^\d+$/.test(s)) return 'size ' + s;
    // nếu đã có chữ size thì giữ nguyên
    if (s.startsWith('size ')) return s;
    // các trường hợp khác (ví dụ "SIZE 39") -> chuẩn về "size 39"
    return 'size ' + s.replace(/^size\s*/, '').trim();
}


