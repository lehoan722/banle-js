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
let currentRows = []; // tập dòng hiện đang hiển thị trong HOT (để các hàm filter/ảnh dùng)

const SIZE_ORDER = ['size 0', 'size 38', 'size 39', 'size 40', 'size 41', 'size 42', 'size 43', 'size 44', 'size 45']; // 9 dòng/1 mã

// --- Cấu hình mặc định cho tính SL chuyển ---
const CFG = {
    keep_min_src: 1,   // giữ tối thiểu tại nguồn
    dest_min: 2,       // mục tiêu tối thiểu tại đích
    max_move: 999999,  // trần chuyển mỗi size (mặc định: không giới hạn)
    prefer_cs2: true   // ưu tiên CS2 >= CS1 sau chuyển
};

// Trả về SL chuyển mặc định cho 1 dòng size
// Trả về SL chuyển mặc định cho 1 dòng size
// Trả về SL chuyển cho 1 dòng size — phiên bản theo tỷ lệ mới
function calcMoveQty(cs1, cs2, goiy) {
    const keep = CFG.keep_min_src;
    const maxm = CFG.max_move;

    const total = (cs1 || 0) + (cs2 || 0);

    // ==== QUY TẮC ĐẶC BIỆT BẠN YÊU CẦU ====

    // (A) Tổng = 1  → chuyển về CS2 (nếu món đang ở CS1 và hướng là 1v2)
    if (total === 1) {
        if (goiy === '1v2' && cs1 === 1) {
            // Cho phép vượt qua keep_min_src trong case đặc biệt này để đảm bảo về CS2
            return Math.min(1, maxm);
        }
        return 0; // đã ở CS2 hoặc không đúng hướng hiển thị
    }

    // (B) Tổng = 5  → mục tiêu sau chuyển: CS1=2, CS2=3
    if (total === 5) {
        const t1 = 2; // target CS1
        if (goiy === '1v2') {
            const srcCap = Math.max(0, cs1 - keep);
            return Math.max(0, Math.min(cs1 - t1, srcCap, maxm));
        }
        if (goiy === '2v1') {
            const srcCap = Math.max(0, cs2 - keep);
            return Math.max(0, Math.min(t1 - cs1, srcCap, maxm));
        }
        return 0;
    }

    // (C) Tổng > 5 → mục tiêu ~ CS1 ≈ 1/3, CS2 ≈ 2/3 tổng
    if (total > 5) {
        // Dùng làm tròn gần nhất cho "≈ 1/3"
        const t1 = Math.round(total / 3); // target cho CS1
        if (goiy === '1v2') {
            // Chuyển từ CS1 -> CS2 để đưa CS1 về ≈ 1/3
            const srcCap = Math.max(0, cs1 - keep);
            return Math.max(0, Math.min(cs1 - t1, srcCap, maxm));
        }
        if (goiy === '2v1') {
            // Chuyển từ CS2 -> CS1 để kéo CS1 lên ≈ 1/3
            const srcCap = Math.max(0, cs2 - keep);
            return Math.max(0, Math.min(t1 - cs1, srcCap, maxm));
        }
        return 0;
    }

    // ==== CÒN LẠI (tổng < 5 nhưng không phải 1): GIỮ NGUYÊN LOGIC CŨ ====
    // Ưu tiên đơn giản: nếu CS1=0 và CS2>1 thì bơm 1 về CS1 (giữ nguyên hành vi trước)
    if (cs1 === 0 && cs2 > 1) {
        const srcCap = Math.max(0, cs2 - keep);
        return Math.min(1, srcCap);
    }

    if (goiy === '1v2') {
        const need_min = Math.max(0, CFG.dest_min - cs2);
        const need_bias = CFG.prefer_cs2
            ? Math.ceil((cs1 - cs2 + 1) / 2)   // sau chuyển CS2 > CS1
            : Math.ceil((cs1 - cs2) / 2);      // cho phép bằng
        const q0 = Math.max(need_min, need_bias, 0);
        const srcCap = Math.max(0, cs1 - keep);
        return Math.max(0, Math.min(q0, srcCap, maxm));
    }

    if (goiy === '2v1') {
        const need_min = Math.max(0, CFG.dest_min - cs1);
        const bias_limit = CFG.prefer_cs2
            ? Math.floor((cs2 - cs1 - 1) / 2)  // giữ CS2 > CS1
            : Math.floor((cs2 - cs1) / 2);     // cho phép bằng
        const srcCap = Math.max(0, cs2 - keep);
        const q0 = Math.max(need_min, 0);
        return Math.max(0, Math.min(q0, bias_limit, srcCap, maxm));
    }

    return 0; // "cân bằng"
}

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

        function getNum(o, keys, def = 0) {
            for (const k of keys) {
                if (o != null && o[k] != null && o[k] !== '') return Number(o[k]);
            }
            return def;
        }
        const cs1 = getNum(r, ['ton_cs1', 'toncs1', 'cs1', 'cs_1']);
        const cs2 = getNum(r, ['ton_cs2', 'toncs2', 'cs2', 'cs_2']);




        g[szKey] = { masp, size: szKey || (r.size || ''), cs1, cs2 };
    }

    const out = [];
    for (const [masp, sizes] of map) {
        let sum1 = 0, sum2 = 0;
        for (const s of SIZE_ORDER) {
            const it = sizes[s] || { masp, size: s, cs1: 0, cs2: 0 };
            const goiy = calcGoiy(it.cs1, it.cs2);
            const sl = calcMoveQty(it.cs1, it.cs2, goiy);
            out.push({
                masp, size: it.size, cs1: it.cs1, cs2: it.cs2,
                goiy, sl_chuyen: sl,
                tong: it.cs1 + it.cs2, vitri_cs1: '', vitri_cs2: '', __isSum: false
            });

            sum1 += it.cs1; sum2 += it.cs2;
        }
        // tính tổng SL chuyển của 9 size trong block vừa add
        const startIdx = out.length - SIZE_ORDER.length;
        let sumMove = 0;
        for (let i = 0; i < SIZE_ORDER.length; i++) {
            sumMove += Number(out[startIdx + i].sl_chuyen || 0);
        }

        out.push({
            masp, size: 'Tổng', cs1: sum1, cs2: sum2,
            goiy: calcGoiy(sum1, sum2),
            sl_chuyen: sumMove,     // tổng SL chuyển cho mã này
            tong: sum1 + sum2, vitri_cs1: '', vitri_cs2: '', __isSum: true
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

// === SNAPSHOT TỒN THẬT (RPC) + OVERLAY VÀO RAW ===
async function rpcTonSnapshot(masps, denNgay, tonghopSize = false) {
    if (!Array.isArray(masps) || masps.length === 0) return [];
    const { data, error } = await supabase.rpc('xnt17_ton_snapshot', {
        p_masps: masps,
        p_den_ngay: denNgay,
        p_tonghop_size: tonghopSize
    });
    if (error) { console.warn('xnt17_ton_snapshot error:', error); return []; }
    return (data || []).map(r => ({
        masp: String(r.masp || '').toUpperCase(),
        size: normalizeSize(r.size),
        ton_cs1: Number(r.ton_cs1 || 0),
        ton_cs2: Number(r.ton_cs2 || 0)
    }));
}

// Lấy danh sách masp từ raw, gọi snapshot tồn thật, rồi ghi đè/thêm size còn thiếu
async function overlayTonThat(raw, denNgay) {
    const masps = Array.from(new Set((raw || [])
        .map(r => String(r.masp || '').toUpperCase())
        .filter(Boolean)));
    if (!masps.length) return raw;

    const snap = await rpcTonSnapshot(masps, denNgay, false);

    // map raw theo key "MASP|size"
    const byKey = new Map((raw || []).map(r => {
        const masp = String(r.masp || '').toUpperCase();
        const size = normalizeSize(r.size);
        return [masp + '|' + size, { ...r, masp, size }];
    }));

    // merge snapshot: có thì ghi đè ton_cs1/ton_cs2, chưa có thì thêm dòng mới
    for (const s of snap) {
        const k = s.masp + '|' + normalizeSize(s.size);
        if (byKey.has(k)) {
            const it = byKey.get(k);
            it.ton_cs1 = s.ton_cs1;
            it.ton_cs2 = s.ton_cs2;
        } else {
            byKey.set(k, { masp: s.masp, size: normalizeSize(s.size), ton_cs1: s.ton_cs1, ton_cs2: s.ton_cs2 });
        }
    }
    return Array.from(byKey.values());
}


function renderOnlySizeNumber(instance, td, row, col, prop, value) {
    const s = String(value ?? '');
    const m = s.match(/\d{1,2}/);
    td.textContent = m ? m[0] : '';           // chỉ hiện số 0 / 38..45
    td.className = 'htDimmed';
}

// Hiển thị trống nếu giá trị là 0 (không đụng dữ liệu gốc)
function zeroBlankRenderer(instance, td, row, col, prop, value, cellProperties) {
    const display = (value === 0 || value === '0') ? '' : value;
    Handsontable.renderers.TextRenderer.apply(this, [instance, td, row, col, prop, display, cellProperties]);
}


// ===== 4) Render Handsontable + đồng bộ ảnh =====
function renderHOT(rows) {
    const container = document.getElementById('hot');
    if (hot && !hot.isDestroyed) { hot.destroy(); }
    hot = null;


    hot = new Handsontable(container, {
        data: rows,
        licenseKey: 'non-commercial-and-evaluation',
        rowHeaders: true,
        colHeaders: ['Mã SP', 'Size', 'CS1', 'CS2', 'Gợi ý', 'SL chuyển', 'Tổng', 'Vị trí CS1', 'Vị trí CS2'],
        columns: [
            { data: 'masp', readOnly: true },
            { data: 'size', readOnly: true, renderer: renderOnlySizeNumber }, // ⬅️ thay cho cột Size
            { data: 'cs1', readOnly: true, type: 'numeric' },
            { data: 'cs2', readOnly: true, type: 'numeric' },
            { data: 'goiy', readOnly: true },
            { data: 'sl_chuyen', type: 'numeric' },
            { data: 'tong', readOnly: true, type: 'numeric' },
            { data: 'vitri_cs1', readOnly: true },
            { data: 'vitri_cs2', readOnly: true },
        ],

        filters: true,
        dropdownMenu: true,
        columnSorting: true,
        height: '100%',
        stretchH: 'all',
        cells(row, col, prop) {
            const cell = {};
            const r = rows[row];

            // DÒNG TỔNG: giữ readonly cho cột sl_chuyen nếu bạn đã có logic này
            if (r && r.__isSum) {
                cell.className = 'sumRow';
                if (prop === 'sl_chuyen') cell.readOnly = true;
            }

            // Áp renderer 0→trống cho các cột số
            const numericProps = [
                'cs1', 'cs2', 'tong', 'sl_chuyen',
                'nhapmua', 'cuoiky',
                'xuatban_cs1', 'xuatban_cs2',
                'xuatchinhanh_cs1', 'xuatchinhanh_cs2'
            ];
            if (numericProps.includes(prop)) {
                cell.renderer = zeroBlankRenderer;
                cell.type = 'numeric'; // vẫn để type numeric để tính toán/sort/validate như cũ
            }
            return cell;
        },



        afterSelectionEnd(r) {
            // 'this' là instance hiện tại của Handsontable
            const inst = this;
            if (!inst || inst.isDestroyed) return;

            const colMasp = inst.propToCol('masp');
            const masp = String(inst.getDataAtCell(r, colMasp) || '').toUpperCase();
            if (!masp) return;

            promotePreviewToTop(masp);

            const tr = inst.getCell(r, 0)?.parentElement;
            if (tr) tr.scrollIntoView({ block: 'center' });
        },
        afterChange(changes, source) {
            if (!changes || source === 'loadData') return;

            // nếu có thay đổi ở cột sl_chuyen => cộng lại dòng Tổng của mã đó
            for (const [rIdx, prop] of changes.map(c => [c[0], c[1]])) {
                if (prop !== 'sl_chuyen') continue;
                const r = rows[rIdx];
                if (!r || r.__isSum) continue;

                // tìm dòng "Tổng" liền sau block 9 size
                let sumIndex = rIdx;
                while (sumIndex < rows.length && rows[sumIndex].masp === r.masp && !rows[sumIndex].__isSum) sumIndex++;
                if (sumIndex < rows.length && rows[sumIndex].__isSum && rows[sumIndex].masp === r.masp) {
                    let s = 0;
                    for (let i = sumIndex - SIZE_ORDER.length; i < sumIndex; i++) s += Number(rows[i]?.sl_chuyen || 0);
                    rows[sumIndex].sl_chuyen = s;
                    this.render();
                    updateStatusTotals(rows);
                }
            }
        },


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



    // Sau khi khởi tạo HOT
    const btn1v2 = document.getElementById('btnFilter1v2');
    const btn2v1 = document.getElementById('btnFilter2v1');
    const btnShowAll = document.getElementById('btnShowAll');
    const btnTaoPhieuCN = document.getElementById('btnTaoPhieuCN');
    if (btnTaoPhieuCN) btnTaoPhieuCN.onclick = onTaoPhieuChuyenCN;

    if (btn1v2) btn1v2.onclick = () => applyGoiyFilter('1v2');
    if (btn2v1) btn2v1.onclick = () => applyGoiyFilter('2v1');
    if (btnShowAll) btnShowAll.onclick = clearAllFilters;

    currentRows = rows; // cập nhật dữ liệu đang hiển thị cho các hàm filter/ảnh

}

function clearAllFilters() {
    if (!hot || hot.isDestroyed) return;

    const filters = hot.getPlugin('filters');
    filters.clearConditions();
    filters.filter();

    // Khôi phục panel ảnh về toàn bộ mã
    renderPreviewForMasps(allMasps);
    if (allMasps.length) focusPreview(allMasps[0]);
}


function updateStatusTotals(rows) {
    let t12 = 0, t21 = 0;
    for (const r of rows) {
        if (!r || r.__isSum) continue;
        const q = Number(r.sl_chuyen || 0);
        if (!q) continue;
        if (r.goiy === '1v2') t12 += q;
        else if (r.goiy === '2v1') t21 += q;
    }
    const el = document.getElementById('status');
    if (el) el.textContent = `Đã tải ${rows.length} dòng • Tổng SL chuyển 1→2: ${t12} | 2→1: ${t21}`;
}
// Lọc ra danh sách MASP theo giá trị gợi ý (1v2 / 2v1), chỉ lấy dòng size (không lấy dòng Tổng)
function getFilteredMaspsByGoiy(value) {
    const picked = new Set();
    for (const r of currentRows) {
        if (!r || r.__isSum) continue;          // bỏ dòng "Tổng"
        if (r.goiy === value) picked.add(r.masp);
    }
    // Giữ nguyên thứ tự như lưới ảnh ban đầu
    return allMasps.filter(m => picked.has(m));
}


// Áp bộ lọc theo cột "goiy" và ẩn dòng Tổng ("size" !== "Tổng")
function applyGoiyFilter(value) {
    if (!hot || hot.isDestroyed) return;

    const filters = hot.getPlugin('filters');
    filters.clearConditions();

    const colGoiy = hot.propToCol('goiy');
    const colSize = hot.propToCol('size');

    // Lọc theo gợi ý + ẩn dòng Tổng
    filters.addCondition(colGoiy, 'eq', [value]);
    filters.addCondition(colSize, 'neq', ['Tổng']);
    filters.addCondition(colSize, 'neq', ['size 0']); // ⬅️ mới thêm
    filters.filter();

    // Đồng bộ ảnh đúng với dữ liệu đang hiển thị
    const list = getVisibleMaspsByGoiy(value);
    renderPreviewForMasps(list);
    if (list.length) focusPreview(list[0]);  // focus ảnh đầu tiên cho UX
}

// Trả về '1v2' hoặc '2v1' nếu toàn bộ các dòng đang hiển thị có cùng Gợi ý (và không có "Tổng"); ngược lại trả null
function getVisibleDirection() {
    if (!hot) return null;
    const colSize = hot.propToCol('size');
    const colGoiy = hot.propToCol('goiy');
    const n = hot.countRows();

    let has1v2 = false, has2v1 = false, anyRow = false;
    for (let r = 0; r < n; r++) {
        const size = hot.getDataAtCell(r, colSize);
        if (size === 'Tổng') continue; // bỏ dòng Tổng
        anyRow = true;
        const g = hot.getDataAtCell(r, colGoiy);
        if (g === '1v2') has1v2 = true;
        else if (g === '2v1') has2v1 = true;
    }
    if (!anyRow) return null;
    if (has1v2 && !has2v1) return '1v2';
    if (has2v1 && !has1v2) return '2v1';
    return null; // lẫn lộn hoặc không có
}

// Gom dữ liệu hiển thị sau filter thành payload: [{ masp, items:[{size, sl}] }, ...]
function collectVisibleTransferItems(dir) {
    if (!hot) return [];
    const colMasp = hot.propToCol('masp');
    const colSize = hot.propToCol('size');
    const colGoiy = hot.propToCol('goiy');
    const colMove = hot.propToCol('sl_chuyen');

    const n = hot.countRows();
    const map = new Map(); // masp -> [{size, sl}...]

    for (let r = 0; r < n; r++) {
        const size = hot.getDataAtCell(r, colSize);
        if (size === 'Tổng') continue; // bỏ dòng Tổng
        const goiy = hot.getDataAtCell(r, colGoiy);
        if (goiy !== dir) continue;

        const sl = Number(hot.getDataAtCell(r, colMove) || 0);
        if (!sl || sl <= 0) continue; // chỉ lấy size có SL chuyển > 0

        const masp = String(hot.getDataAtCell(r, colMasp) || '').toUpperCase();
        if (!masp) continue;

        if (!map.has(masp)) map.set(masp, []);
        map.get(masp).push({ size: size, sl: sl });
    }

    // giữ thứ tự theo lưới ảnh ban đầu để người dùng dễ đối chiếu
    const list = [];
    for (const m of allMasps) {
        if (map.has(m)) list.push({ masp: m, items: map.get(m) });
    }
    return list;
}

// Gom dữ liệu hiển thị để dùng cho popup ảnh chuyển CN
// Gom dữ liệu hiển thị để dùng cho popup ảnh chuyển CN
// Mỗi size có SL chuyển > 0 sẽ thành 1 bản ghi riêng
function buildCkGalleryData() {
    const dir = getVisibleDirection();
    if (!dir) {
        alert('Vui lòng lọc cột "Gợi ý" sao cho chỉ còn 1 hướng (1v2 hoặc 2v1) và đã ẩn dòng "Tổng".');
        return null;
    }

    // collectVisibleTransferItems vẫn trả [{ masp, items:[{size, sl}] }, ...]
    const groups = collectVisibleTransferItems(dir);
    if (!groups.length) {
        alert('Không có dòng nào có "SL chuyển" > 0 để hiển thị trong popup ảnh.');
        return null;
    }

    // map lấy vị trí cs1/cs2 của từng mã từ currentRows
    const vitriMap = new Map();
    for (const r of currentRows || []) {
        if (!r || r.__isSum) continue;
        const k = String(r.masp || '').toUpperCase();
        if (!k || vitriMap.has(k)) continue;
        vitriMap.set(k, {
            vitri_cs1: r.vitri_cs1 || '',
            vitri_cs2: r.vitri_cs2 || ''
        });
    }

    // ckGalleryData: mỗi phần tử = 1 mã + 1 size
    ckGalleryData = [];
    for (const g of groups) {
        const masp = String(g.masp || '').toUpperCase();
        const vitri = vitriMap.get(masp) || { vitri_cs1: '', vitri_cs2: '' };

        for (const it of (g.items || [])) {
            const sl = Number(it.sl || 0);
            if (!sl || sl <= 0) continue; // chỉ lấy size có SL chuyển > 0

            ckGalleryData.push({
                masp,
                dir,
                size: it.size,          // ví dụ "size 39"
                sl_chuyen: sl,          // số lượng chuyển cho size này
                vitri_cs1: vitri.vitri_cs1 || '',
                vitri_cs2: vitri.vitri_cs2 || ''
            });
        }
    }

    if (!ckGalleryData.length) {
        alert('Không có size nào có SL chuyển > 0 để hiển thị trong popup.');
        return null;
    }

    return { dir, list: ckGalleryData };
}


function onTaoPhieuChuyenCN() {
    const dir = getVisibleDirection();
    if (!dir) {
        alert('Vui lòng lọc cột "Gợi ý" sao cho chỉ còn 1 hướng (1v2 hoặc 2v1) và đã ẩn dòng "Tổng".');
        return;
    }
    const items = collectVisibleTransferItems(dir);
    if (!items.length) {
        alert('Không có dòng nào có "SL chuyển" > 0 để tạo phiếu.');
        return;
    }

    // Lưu payload sang localStorage (để dùng được ở tab mới)
    const payload = {
        dir,                       // '1v2' hoặc '2v1'
        items,                     // [{masp, items:[{size, sl}]}]
        created_at: new Date().toISOString()
    };
    localStorage.setItem('ccn_prefill_payload', JSON.stringify(payload));

    // Log kiểm tra
    console.log('[XNT17→CCN] Gửi payload:', { dir, count: items.length, sample: items[0] });

    // Mở đúng trang đích
    const url = (dir === '1v2') ? 'ccn1v2cs1.html' : 'ccn2v1cs2.html';
    window.open(url, '_blank');

}

// Chuyển kho theo danh sách MASP trong textarea (độc lập với XNT17)
async function onChuyenKhoFromTextarea() {
    const ta = document.getElementById('maspTextarea');
    if (!ta) { alert('Không tìm thấy ô nhập mã sản phẩm'); return; }

    const masps = Array.from(new Set(
        ta.value.split(/\r?\n/).map(s => s.trim().toUpperCase()).filter(Boolean)
    ));

    if (masps.length === 0) {
        alert('Vui lòng nhập danh sách mã sản phẩm (mỗi mã một dòng)');
        return;
    }

    document.getElementById('status').textContent = 'Đang tính tồn thật…';

    const filters4den = getFilters() || {};
    const denNgay = filters4den.den_ngay || new Date().toISOString().slice(0, 10);

    // lấy snapshot tồn thật cho list MASP
    const snap = await rpcTonSnapshot(masps, denNgay, false);

    // chuyển snapshot thành raw giống cấu trúc buildTransferTable đang dùng
    const raw = snap.map(s => ({
        masp: s.masp, size: s.size, ton_cs1: s.ton_cs1, ton_cs2: s.ton_cs2
    }));

    // dựng bảng + render
    const rows = buildTransferTable(raw);

    currentRows = rows;


    // cập nhật lưới ảnh theo danh sách masp mới
    allMasps = Array.from(new Set(raw.map(r => r.masp)));
    renderPreviewForMasps(allMasps);

    await patchVitri(rows);
    renderHOT(rows);
    if (allMasps.length) focusPreview(allMasps[0]);
    updateStatusTotals(rows);

    document.getElementById('status').textContent =
        `Đã tải ${rows.length} dòng từ danh sách MASP (tồn thật)`;
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
// cho inline onerror trong HTML nhìn thấy được (vì file là type="module")
window.handleImageError = handleImageError;


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

const IMAGES_PER_ROW = 1; // số cột trong lưới ảnh

// Lưu danh sách mã của panel ảnh để scroll/focus
let currentMaspsList = [];
let allMasps = []; // danh sách mã đầy đủ dùng để vẽ lại ảnh khi "Hiện tất cả"
// Dữ liệu dùng cho popup ảnh chuyển CN
let ckGalleryData = []; // [{masp, dir, sizes:[{size,sl}], vitri_cs1, vitri_cs2, total}]


// Lấy danh sách MASP đang hiển thị sau khi lọc (đọc trực tiếp từ HOT)
function getVisibleMaspsByGoiy(value) {
    if (!hot) return [];
    const colMasp = hot.propToCol('masp');
    const colSize = hot.propToCol('size');
    const colGoiy = hot.propToCol('goiy');

    const n = hot.countRows();   // số dòng đang hiển thị (sau filter)
    const picked = new Set();

    for (let r = 0; r < n; r++) {
        const size = hot.getDataAtCell(r, colSize);
        const goiy = hot.getDataAtCell(r, colGoiy);
        if (size === 'Tổng') continue;        // bỏ dòng Tổng
        if (goiy === value) {
            const masp = String(hot.getDataAtCell(r, colMasp) || '').toUpperCase();
            if (masp) picked.add(masp);
        }
    }

    // Giữ thứ tự như lưới ảnh ban đầu
    return allMasps.filter(m => picked.has(m));
}

function displaySizeLabel(size) {
    // size đang ở dạng "size 39" -> trả "39"
    const s = String(size || '').toLowerCase();
    const m = s.match(/(\d{1,2})/);
    return m ? m[1] : size;
}


function renderPreviewForMasps(list) {
    currentMaspsList = (list || []).map(x => String(x || "").toUpperCase());
    const box = document.getElementById("previewGrid");
    const title = document.getElementById("previewTitle");
    if (!box) return;

    box.style.gridTemplateColumns = `repeat(${IMAGES_PER_ROW}, minmax(0, 1fr))`;
    title.textContent = `Ảnh nhanh (${currentMaspsList.length.toLocaleString('vi-VN')} mã)`;

    const DETAIL_URL = "https://banle-js.vercel.app/timkiemhanghoa333.html";

    box.innerHTML = currentMaspsList.map((m, i) => {
        const src = getImageUrl(m);
        return `
      <figure id="img-${m}" class="preview-card" data-masp="${m}">
        <img loading="lazy"
             src="${src}" data-try="0" alt="${m}"
             onclick="openLightbox(this.src)"
             onerror="(function(img,masp){ const next = (parseInt(img.dataset.try||'0',10)+1);
                const exts=['jpg','jpeg','png','webp','JPG','JPEG','PNG','WEBP'];
                if(next<exts.length){ img.dataset.try=String(next); img.src='${IMG_BASE}'+encodeURIComponent(masp)+'.'+exts[next];}
                else{ img.onerror=null; img.src='${PLACEHOLDER_SVG}'; } })(this,'${m}')">
        <figcaption class="preview-cap">
          <span class="cap-link" onclick="window.open('${DETAIL_URL}?masp=${encodeURIComponent(m)}','_blank')">
            ${i + 1}. ${m}
          </span>
        </figcaption>
      </figure>`;
    }).join("");
}

// Di chuyển MASP về đầu danh sách (giữ thứ tự phần còn lại)
function moveMaspToFront(list, masp) {
    const M = String(masp || '').toUpperCase();
    const idx = list.indexOf(M);
    if (idx <= 0) return list;     // đã ở đầu hoặc không tồn tại
    list.splice(idx, 1);
    list.unshift(M);
    return list;
}

// Cập nhật lại STT trong caption sau khi reorder DOM
function renumberPreviewCards() {
    const box = document.getElementById('previewGrid');
    if (!box) return;
    const cards = box.querySelectorAll('.preview-card');
    let i = 0;
    for (const fig of cards) {
        const masp = fig?.dataset?.masp || '';
        const cap = fig.querySelector('.preview-cap .cap-link');
        if (cap) cap.textContent = `${++i}. ${masp}`;
    }
}

// Đưa card ảnh của MASP lên đầu lưới + cuộn lên
function promotePreviewToTop(masp) {
    const box = document.getElementById('previewGrid');
    if (!box || !masp) return;

    const id = `img-${String(masp).toUpperCase()}`;
    const el = document.getElementById(id);   // card ảnh của mã đang chọn
    if (!el) return;                          // không có trong lưới hiện tại (ví dụ không thỏa filter)

    const first = box.firstElementChild;
    if (el !== first) {
        box.insertBefore(el, first);            // kéo card lên vị trí đầu
        renumberPreviewCards();                 // đánh số lại caption 1.,2.,3.,…
    }

    // Cập nhật mảng danh sách đang hiển thị (nếu bạn có biến currentMaspsList)
    if (typeof currentMaspsList !== 'undefined' && Array.isArray(currentMaspsList)) {
        currentMaspsList = moveMaspToFront(currentMaspsList, masp);
    }

    // Bôi viền chọn & cuộn lên đầu để dễ nhìn
    const old = box.querySelector('.preview-card.selected');
    if (old && old !== el) old.classList.remove('selected');
    el.classList.add('selected');
    box.scrollTo({ top: 0, behavior: 'smooth' });
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

// ===== Popup tồn kho theo size cho từng mã trong popup ảnh =====

// Lấy toàn bộ dòng tồn kho (9 size + Tổng) theo MASP từ currentRows
function getTonKhoRowsByMasp(masp) {
  const M = String(masp || '').toUpperCase();
  if (!M || !Array.isArray(currentRows)) return [];
  return currentRows.filter(r => String(r.masp || '').toUpperCase() === M);
}

// Dựng HTML bảng tồn kho theo size cho MASP
function buildTonKhoTableHtml(masp) {
  const rows = getTonKhoRowsByMasp(masp);
  if (!rows.length) {
    return `
      <div class="ck-stock-popup">
        <div>Không có dữ liệu tồn kho.</div>
      </div>
    `;
  }

  const body = rows.map(r => {
    const isSum = !!r.__isSum;
    const sizeLabel = (r.size === 'Tổng')
      ? 'Tổng'
      : displaySizeLabel(r.size); // “size 38” -> “38”

    const cs1 = r.cs1 ?? 0;
    const cs2 = r.cs2 ?? 0;

    return `
      <tr class="${isSum ? 'sum-row' : ''}">
        <td>${sizeLabel}</td>
        <td class="num">${cs1 || ''}</td>
        <td class="num">${cs2 || ''}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="ck-stock-popup">
      <table>
        <thead>
          <tr>
            <th>Size</th>
            <th>CS1</th>
            <th>CS2</th>
          </tr>
        </thead>
        <tbody>
          ${body}
        </tbody>
      </table>
    </div>
  `;
}

// Phát hiện thiết bị cảm ứng (điện thoại/tablet)
function isTouchDevice() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

function hideAllStockPopups() {
  document.querySelectorAll('.ck-stock-popup.show').forEach(p => {
    p.classList.remove('show');
  });
}

function showStockPopupForCard(card) {
  if (!card) return;
  hideAllStockPopups();
  const popup = card.querySelector('.ck-stock-popup');
  if (popup) popup.classList.add('show');
}

function hideStockPopupForCard(card) {
  if (!card) return;
  const popup = card.querySelector('.ck-stock-popup');
  if (popup) popup.classList.remove('show');
}

function attachStockPopupEvents() {
  const touch = isTouchDevice();
  const cards = document.querySelectorAll('#ckGalGrid .ck-item');

  cards.forEach(card => {
    const img = card.querySelector('.ck-pic img');
    if (!img) return;

    if (!touch) {
      // PC: hover chuột để xem tồn kho
      card.addEventListener('mouseenter', () => showStockPopupForCard(card));
      card.addEventListener('mouseleave', () => hideStockPopupForCard(card));
    } else {
      // Điện thoại: chạm 1 lần mở, chạm lại đóng / chạm ảnh khác thì đổi
      img.addEventListener('click', () => {
        const popup = card.querySelector('.ck-stock-popup');
        const isShown = popup && popup.classList.contains('show');
        hideAllStockPopups();
        if (!isShown) {
          showStockPopupForCard(card);
        }
      });
    }
  });

  // Trên mobile: chạm nền đen ngoài card để đóng hết popup tồn kho
  const modal = document.getElementById('ckGalleryModal');
  if (touch && modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        hideAllStockPopups();
      }
    });
  }
}

// ===== POPUP ẢNH CHUYỂN CHI NHÁNH =====

// ===== POPUP ẢNH CHUYỂN CHI NHÁNH =====
function openAnhChuyenPopup() {
  const data = buildCkGalleryData();
  if (!data) return;
  const { dir, list } = data;

  const modal = document.getElementById('ckGalleryModal');
  const grid = document.getElementById('ckGalGrid');
  const title = document.getElementById('ckGalTitle');
  const info = document.getElementById('ckInfo');
  if (!modal || !grid || !title) {
    alert('Không tìm thấy popup ảnh trên trang.');
    return;
  }

  // đếm thêm số mã duy nhất để hiển thị cho dễ hiểu
  const uniqMasps = Array.from(new Set(list.map(it => it.masp)));
  title.textContent =
    `Ảnh chuyển chi nhánh (${dir === '1v2' ? 'CS1 → CS2' : 'CS2 → CS1'}) – ${list.length} ảnh / ${uniqMasps.length} mã`;

  const DETAIL_URL = "https://banle-js.vercel.app/timkiemhanghoa333.html";

  grid.innerHTML = list.map(item => {
    const masp = item.masp;
    const sizeLabel = displaySizeLabel(item.size);   // "size 39" -> "39"
    const src = getImageUrl(masp);
    const tonKhoHtml = buildTonKhoTableHtml(masp);   // 👈 bảng tồn kho theo size

    return `
      <div class="ck-item" data-masp="${masp}" data-size="${item.size}">
        <div class="ck-pic">
          <img loading="lazy"
               src="${src}" data-try="0" alt="${masp}"
               onerror="(function(img,masp){handleImageError(img,masp,'');})(this,'${masp}')">
        </div>
        ${tonKhoHtml}
        <div class="ck-body">
          <div class="ck-row">
            <b>Mã SP:</b>
            <a href="${DETAIL_URL}?masp=${encodeURIComponent(masp)}" target="_blank">${masp}</a>
          </div>
          <div class="ck-row">
            <!-- ❌ BỎ checked: không còn tự chọn tạo phiếu cho tất cả -->
            <label><input type="checkbox" class="ck-create"> tạo phiếu</label>
          </div>
          <div class="ck-row">
            <b>Size:</b> <span class="ck-size">${sizeLabel}</span>
          </div>
          <div class="ck-row">
            <b>SL chuyển:</b>
            <input type="number" class="ck-sl" min="0" value="${item.sl_chuyen}">
          </div>
          <div class="ck-row">
            <b>Vị trí CS1:</b> <span class="ck-v1">${item.vitri_cs1 || ''}</span>
          </div>
          <div class="ck-row">
            <b>Vị trí CS2:</b> <span class="ck-v2">${item.vitri_cs2 || ''}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  if (info) {
    info.textContent =
      `Đang hiển thị ${list.length} ảnh của ${uniqMasps.length} mã – nhập chữ để lọc nhanh theo mã SP.`;
  }

  modal.style.display = 'flex';

  // Gắn sự kiện hover / click để hiển thị popup tồn kho theo size
  attachStockPopupEvents();
}



function closeAnhChuyenPopup() {
    const modal = document.getElementById('ckGalleryModal');
    if (modal) modal.style.display = 'none';
}

// Tìm nhanh theo mã SP trong popup
function onCkSearchInput() {
    const q = String(this.value || '').trim().toUpperCase();
    const cards = document.querySelectorAll('#ckGalGrid .ck-item');
    cards.forEach(card => {
        const masp = String(card.dataset.masp || '').toUpperCase();
        card.style.display = (!q || masp.includes(q)) ? '' : 'none';
    });
}

// Chọn tất cả / Bỏ chọn
function ckSelectAll(val) {
    document.querySelectorAll('#ckGalGrid .ck-create').forEach(chk => {
        chk.checked = !!val;
    });
}

// Tạo phiếu từ dữ liệu đã chỉnh sửa trong popup (mỗi card = 1 size)
function applyAnhChuyenToPhieu() {
    if (!ckGalleryData || !ckGalleryData.length) {
        alert('Không có dữ liệu trong popup.');
        return;
    }

    const dir = ckGalleryData[0]?.dir || getVisibleDirection();
    if (!dir) {
        alert('Không xác định được hướng chuyển (1v2 / 2v1).');
        return;
    }

    const cards = document.querySelectorAll('#ckGalGrid .ck-item');
    const byMasp = new Map();   // masp -> [{size, sl}, ...]

    cards.forEach(card => {
        const chk = card.querySelector('.ck-create');
        if (!chk || !chk.checked) return;

        const masp = String(card.dataset.masp || '').toUpperCase();
        const size = card.dataset.size || '';
        if (!masp || !size) return;

        const sl = Number(card.querySelector('.ck-sl')?.value || 0);
        if (!sl || sl <= 0) return; // bỏ size không có SL chuyển

        if (!byMasp.has(masp)) byMasp.set(masp, []);
        byMasp.get(masp).push({ size, sl });
    });

    const payloadItems = Array.from(byMasp.entries()).map(([masp, items]) => ({
        masp,
        items
    }));

    if (!payloadItems.length) {
        alert('Chưa chọn size nào có SL chuyển > 0 để tạo phiếu.');
        return;
    }

    const payload = {
        dir,
        items: payloadItems,
        created_at: new Date().toISOString()
    };
    localStorage.setItem('ccn_prefill_payload', JSON.stringify(payload));

    console.log('[XNT17→CCN từ POPUP] Gửi payload:', {
        dir,
        countMasps: payloadItems.length,
        sample: payloadItems[0]
    });

    const url = (dir === '1v2') ? 'ccn1v2cs1.html' : 'ccn2v1cs2.html';
    // Mở trang chuyển chi nhánh ở TAB MỚI, KHÔNG đóng popup để người dùng đối chiếu
    window.open(url, '_blank');
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

    // 1.5) Vá TỒN THẬT cho tất cả size của các mã đã nhận
    const filters4den = getFilters() || {};
    const denNgay = filters4den.den_ngay || new Date().toISOString().slice(0, 10);
    raw = await overlayTonThat(raw, denNgay);


    // 2) Dựng bảng chuyển kho
    const rows = buildTransferTable(raw);   // 9 dòng size + 1 dòng “Tổng”

    currentRows = rows;


    // Lập danh sách MASP duy nhất theo thứ tự xuất hiện trong raw
    const masps = Array.from(new Map((raw || []).map(r => [String(r.masp || '').toUpperCase(), 1])).keys());
    allMasps = masps;               // ⬅️ lưu lại để dùng cho "Hiện tất cả"
    renderPreviewForMasps(allMasps);


    await patchVitri(rows);                 // lấy vị trí từ dmhanghoa (đọc trực tiếp table)

    renderHOT(rows);
    if (masps.length) focusPreview(masps[0]);
    updateStatusTotals(rows);


    // 3) Tuỳ chọn: dọn storage (tránh chiếm bộ nhớ phiên)
    // sessionStorage.removeItem('xnt17_transfer_rows');

    document.getElementById('status').textContent =
        `Đã tải ${rows.length} dòng (đã có dòng Tổng cho từng mã)`;
}


document.getElementById('btnReload').onclick = boot;
boot();

const btnCK = document.getElementById('btnChuyenKho');
if (btnCK) btnCK.onclick = onChuyenKhoFromTextarea;

// Gắn sự kiện cho popup ảnh chuyển CN
const btnAnh = document.getElementById('btnAnhChuyen');
if (btnAnh) btnAnh.onclick = openAnhChuyenPopup;

const ckSearch = document.getElementById('ckSearch');
if (ckSearch) ckSearch.oninput = onCkSearchInput;

const ckClose = document.getElementById('ckClose');
if (ckClose) ckClose.onclick = closeAnhChuyenPopup;

const ckSelectAllBtn = document.getElementById('ckSelectAll');
if (ckSelectAllBtn) ckSelectAllBtn.onclick = () => ckSelectAll(true);

const ckClearAllBtn = document.getElementById('ckClearAll');
if (ckClearAllBtn) ckClearAllBtn.onclick = () => ckSelectAll(false);

const ckApplyBtn = document.getElementById('ckApply');
if (ckApplyBtn) ckApplyBtn.onclick = applyAnhChuyenToPhieu;



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


