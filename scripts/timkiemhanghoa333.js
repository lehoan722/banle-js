import { supabase } from "./supabaseClient.js";
import { playSuccessBeep, playAlertBeep, setupBeepUnlockOnce } from './soundBeep.js';

// ==== 1. ĐĂNG NHẬP SUPABASE ====
window.dangNhap = async function () {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const status = document.getElementById("authStatus");
    status.textContent = "";

    if (!email || !password) {
        status.textContent = "Nhập đầy đủ email và mật khẩu!";
        return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        status.textContent = "Sai email hoặc mật khẩu!";
        return;
    }
    status.style.color = "green";
    status.textContent = "Đăng nhập thành công!";
    document.getElementById("authBox").style.display = "none";
};

// ==== 2. Ẩn/hiện form đăng nhập khi load lại trang ==== 
window.onload = async function () {
    // Tự động ẩn/hiện box đăng nhập nếu đã đăng nhập
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        document.getElementById("authBox").style.display = "none";
    } else {
        document.getElementById("authBox").style.display = "block";
    }
};

// ====== CƠ SỞ ĐANG CHỌN (ưu tiên từ dropdown, nhớ lại qua localStorage) ======
window.CURRENT_BRANCH = null;

function installBranchPicker() {
    const sel = document.getElementById('branchPicker');
    const btn = document.getElementById('saveVitriBtn');
    const stt = document.getElementById('saveVitriStatus');

    if (!sel) return;
    sel.value = '';
    window.CURRENT_BRANCH = '';

    // Khi đổi dropdown
    sel.addEventListener('change', () => {
        window.CURRENT_BRANCH = sel.value || ''; // 'cs1' | 'cs2' | ''
        toggleVitriInputsByBranch();
        if (stt) stt.textContent = '';
    });

    // Nút lưu vị trí
    if (btn) {
        btn.addEventListener('click', () => saveAllVitriForPickedBranch());
    }

    // Lần đầu vào cũng set state khóa/mở input
    toggleVitriInputsByBranch();
}

// Mở khóa column vị trí đúng với CURRENT_BRANCH, còn cột cơ sở kia thì readonly


function toggleVitriInputsByBranch() {
    const inputs = document.querySelectorAll('.vitri-input');
    const picked = (window.CURRENT_BRANCH || ''); // '' = chưa chọn => khoá tất cả

    inputs.forEach(ip => {
        const branch = ip.getAttribute('data-branch');
        const val = (ip.value || '').trim();

        // Mặc định: khóa hết
        ip.disabled = true;

        // Chỉ mở khi: đã CHỌN CS + ô thuộc CS đó + ô đang TRỐNG
        if (picked && branch === picked && val === '') {
            ip.disabled = false;
        }
    });
}


async function saveAllVitriForPickedBranch() {
    const stt = document.getElementById('saveVitriStatus');
    if (stt) stt.textContent = '';

    const diadiem = (window.CURRENT_BRANCH || '').trim();
    if (!diadiem) {
        showToast('⚠️ Chưa chọn cơ sở trong dropdown!', 'warn');
        return;
    }

    // Gom các input thuộc cơ sở đang chọn (ô còn lại đang readonly, sẽ bỏ qua)
    const ips = Array.from(document.querySelectorAll('input.vitri-input'))
        .filter(ip => ip.getAttribute('data-branch') === diadiem);

    if (!ips.length) {
        showToast('Không có ô vị trí nào để lưu.', 'info');
        return;
    }

    // Dọn dữ liệu theo { masp, vitrikho1|2 }
    const updates = [];
    for (const ip of ips) {
        const masp = (ip.getAttribute('data-masp') || '').trim().toUpperCase();
        if (!masp) continue;
        const val = (ip.value || '').trim();

        if (diadiem === 'cs1') {
            updates.push({ masp, vitrikho1: val });
        } else {
            updates.push({ masp, vitrikho2: val });
        }
    }

    if (!updates.length) {
        showToast('Không có thay đổi vị trí.', 'info');
        return;
    }

    try {
        // Upsert theo khóa chính masp
        const { error } = await supabase.from('dmhanghoa').upsert(updates, { onConflict: 'masp' });
        if (error) throw error;

        showToast('✅ Đã lưu vị trí theo cơ sở đã chọn!', 'success');
        if (stt) { stt.style.color = 'green'; stt.textContent = 'Đã lưu!'; }
    } catch (err) {
        console.error(err);
        showToast('❌ Lưu vị trí thất bại!', 'error');
        if (stt) { stt.style.color = 'crimson'; stt.textContent = 'Lỗi lưu vị trí'; }
    }
}


// Gắn lắp đặt sau khi DOM sẵn sàng
window.addEventListener('DOMContentLoaded', installBranchPicker);
// Set cỡ chữ ô nhập mã sản phẩm chính
window.addEventListener('DOMContentLoaded', () => {
    const ip = document.getElementById('maspInput');
    if (ip) {
        ip.style.fontSize = '18px';
        ip.style.lineHeight = '2.5';
        ip.style.height = '60px'; // cho dễ bấm trên mobile
    }
});


// ==== Popup tìm kiếm mã sản phẩm (dùng chung) ====
// ==== Popup tìm kiếm mã sản phẩm (dùng chung) ====
// --- Helper: đoán "khung trong" của popup để bắt click ngoài ---
function _getPopupInner(popupEl) {
    if (!popupEl) return null;
    // thử các class đặt tên thường gặp; nếu không có thì lấy phần tử con đầu tiên
    return popupEl.querySelector('.popup-content, .popup-inner, .content, .dialog, .modal, .box')
        || popupEl.firstElementChild
        || popupEl;
}

// Lưu handle của listener để remove đúng
let _popupOutsideHandler = null;

window.openPopupSearch = async function (type) {


    window.currentPopupType = type || 'mahang';


    const popup = document.getElementById('popupSearch');
    const input = document.getElementById('popupSearchInput');
    if (!popup || !input) return;

    // Hiển thị popup
    popup.style.display = 'block';

    // Tăng kích cỡ & độ rộng ô nhập trong popup
    // (18px cho "lớn hơn nữa"; có thể chỉnh lại 16–20 tùy ý)
    input.style.fontSize = '18px';
    input.style.lineHeight = '1.4';
    input.style.padding = '10px 12px';

    // Mở rộng độ rộng: cố gắng ~ gấp đôi bình thường, nhưng không tràn màn hình
    // - min(92vw, 700px): rất rộng trên điện thoại & vừa phải trên desktop
    input.style.minWidth = 'min(92vw, 700px)';

    // Nếu khung trong có giới hạn, nới ra luôn cho đồng bộ
    const inner = _getPopupInner(popup);
    if (inner && inner !== popup) {
        inner.style.maxWidth = 'min(96vw, 760px)';
        inner.style.width = 'auto';
    }

    // Reset & focus
    input.value = "";
    input.focus();
    searchPopup("");

    // Bấm ESC để đóng
    const _escHandler = (e) => {
        if (e.key === 'Escape') {
            window.closePopupSearch();
        }
    };
    document.addEventListener('keydown', _escHandler, { once: true });



    // Click ra ngoài popup -> đóng (đặt sau khi render)
    _popupOutsideHandler = (e) => {
        const popupEl = document.getElementById('popupSearch');
        if (!popupEl) return;

        const t = e.target;
        // Nếu click nằm TRONG popup => không đóng
        if (popupEl.contains(t)) return;

        // Click thật sự ra ngoài => đóng
        window.closePopupSearch();
    };

    // Luôn dọn handler cũ trước khi gắn mới (tránh nhân bản)
    if (_popupOutsideHandler) {
        document.removeEventListener('click', _popupOutsideHandler);
        _popupOutsideHandler = null;
    }

    // Đăng ký sau một tick để không “ăn” cú click mở popup
    setTimeout(() => {
        document.addEventListener('click', _popupOutsideHandler);
    }, 0);

    // Đăng ký sau một tick để tránh bắt sự kiện click mở popup
    setTimeout(() => {
        document.addEventListener('click', _popupOutsideHandler); // dùng click, không dùng mousedown/touchstart
    }, 0);

};

window.closePopupSearch = function () {
    const popup = document.getElementById('popupSearch');
    if (popup) popup.style.display = 'none';

    // Gỡ đúng listener đã đăng ký
    if (_popupOutsideHandler) {
        document.removeEventListener('click', _popupOutsideHandler);
        _popupOutsideHandler = null;
    }
};



document.getElementById('popupSearchInput').addEventListener('input', function () {
    searchPopup(this.value.trim());
});

// ====== BUFFER QUÉT MÃ (giữ qua các lần đóng/mở) ======
window.scanBuffer = window.scanBuffer || []; // không xóa khi đóng modal

function normCode(s) {
    return (s || "").trim().toUpperCase();
}

// === CHẾ ĐỘ QUÉT 1 MÃ → ĐẨY VÀO TEXTAREA & TÌM NGAY (CẮT HẬU TỐ _SIZE) ===
function pushCodeToTextareaAndSearch(raw) {
    const strip = (typeof window !== 'undefined' && typeof window.stripSizeSuffixAtEnd === 'function')
        ? window.stripSizeSuffixAtEnd
        : function (s) { return String(s || ''); };
    const code = normCode(strip(raw));
    if (!code) return;

    // feedback nhẹ để biết đã quét
    showFlash();
    try { haptic(70); } catch (_) { }
    try { playSuccessBeep(); } catch (_) { }
    try { showToast(`✅ Đã quét ${code}`, 'info'); } catch (_) { }

    // ✅ Chỉ đẩy vào ô nhập mã
    const ip = document.getElementById('maspInput');
    if (ip) {
        ip.value = code;
        ip.focus();
        try { ip.select(); } catch (_) { }
    }

    // Đóng scanner (nếu đang mở) và tìm ngay
    try { closeScanner(); } catch (_) { }
    if (typeof triggerSearch === 'function') triggerSearch();
}


//Gọi rung trong addToScanBuffer + Flash + Toast
function addToScanBuffer(raw) {
    const code = normCode(raw);
    if (!code) return false;

    showFlash();

    if (!window.scanBuffer.includes(code)) {
        window.scanBuffer.unshift(code);
        renderScanBuffer();
        showToast(`✅ Đã quét ${code}`, 'info');
        haptic(70);
        playSuccessBeep();   // ✅ beep khi mã mới
        return true;
    } else {
        showToast(`⚠️ Mã ${code} đã tồn tại`, 'warn');
        haptic([40, 80, 40]);
        playAlertBeep();     // ⚠️ beep cảnh báo khi trùng
        return false;
    }
}


// ====== FEEDBACK QUÉT ======
function showFlash() {
    const flash = document.getElementById('flashOverlay');
    if (!flash) return;
    flash.style.opacity = '1';
    setTimeout(() => { flash.style.opacity = '0'; }, 120); // 120ms chớp
}

function showToast(msg, type = 'info') {
    const toast = document.getElementById('toastMsg');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.background = type === 'warn' ? 'rgba(211,47,47,0.9)' : 'rgba(25,118,210,0.9)';
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 1800); // tự ẩn sau 1.8s
}

// ========== Device helpers ==========
function isDesktopDevice() {
    const ua = navigator.userAgent || '';
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Windows Phone/i.test(ua);
    const hasTouchOnly = navigator.maxTouchPoints > 0 && !/Macintosh/.test(ua); // iPadOS có thể giả Mac
    return !(isMobileUA || hasTouchOnly);
}


// ====== HAPTIC (rung) ======
function haptic(pattern = 60) {
    try {
        // Android Chrome hỗ trợ tốt; iOS Safari có thể bỏ qua (không lỗi)
        if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (_) { }
}

function removeFromScanBufferAt(idx) {
    if (idx >= 0 && idx < window.scanBuffer.length) {
        window.scanBuffer.splice(idx, 1);
        renderScanBuffer();
    }
}

function clearScanBuffer() {
    window.scanBuffer = [];
    renderScanBuffer();
}

// Đẩy buffer → textarea (mỗi mã 1 dòng, mã mới ở trên) rồi gọi tìm kiếm
function flushScanBufferToTextareaAndSearch() {
    const ta = document.getElementById('bulkTextarea');
    if (!ta) return;

    const existing = (ta.value || "")
        .split(/[\r\n]+/)
        .map(normCode)
        .filter(Boolean);

    // Loại phần trùng với buffer để không lặp
    const existingFiltered = existing.filter(c => !window.scanBuffer.includes(c));
    // Mã mới ở trên, giữ thứ tự như trong buffer
    const merged = [...window.scanBuffer, ...existingFiltered];

    ta.value = merged.join('\n');
    ta.scrollTop = 0;

    // đóng modal quét nhưng KHÔNG xóa buffer (theo yêu cầu)
    closeScanner();

    // gọi tìm kiếm 1 lần cho tất cả
    triggerSearch();
}


async function searchPopup(keyword) {
    const type = window.currentPopupType;
    let table = '', field = '', extraFields = '';
    if (type === 'mahang') { table = 'dmhanghoa'; field = 'masp'; extraFields = ', tensp'; }
    else return;

    let query = supabase.from(table).select(`${field}${extraFields}`).limit(100);
    if (keyword && keyword.length >= 1) query = query.ilike(field, `%${keyword}%`);
    const { data, error } = await query;
    if (error || !data || !data.length) {
        document.getElementById('popupSearchList').innerHTML = '<i>Không tìm thấy dữ liệu</i>';
        return;
    }
    document.getElementById('popupSearchList').innerHTML = data.map(row => `
        <div onclick="selectPopupValue('${type}', '${row[field].replace(/'/g, "\\'")}', this)">
            <b>${row[field]}</b>${row.tensp ? " - " + row.tensp : ""}
        </div>
    `).join('');
}
window.selectPopupValue = function (type, value, el) {
    if (type === 'mahang') {
        document.getElementById('maspInput').value = value;
        closePopupSearch();
        triggerSearch();
    }
};

// ==== Sự kiện Enter, Blur, Nút tìm kiếm ====
document.getElementById('maspInput').addEventListener('keydown', function (e) {
    if (e.key === "Enter") triggerSearch();
});
document.getElementById('maspInput').addEventListener('blur', function () {
    // triggerSearch();
});
document.getElementById('searchBtn').addEventListener('click', (e) => {
    e.preventDefault();
    triggerSearch();          // gọi KHÔNG truyền tham số
});


// ==== Hàm hiển thị rỗng nếu giá trị là 0 ====
function showEmptyIfZero(val) {
    return (val && Number(val) !== 0) ? val : "";
}


// ==== Hàm chính lấy và render dữ liệu ==== 
// ==== Hàm chính lấy và render dữ liệu ==== 
async function triggerSearch(_masp = null) {
    const msg = document.getElementById("statusMsg");
    msg.textContent = "Đang tìm kiếm mã sản phẩm...";
    document.getElementById("multiDetailBox").innerHTML = "";
    document.getElementById("multiDetailBox").style.display = "none";
    document.getElementById("singleDetailBox").style.display = "";

    // clear vùng hiển thị
    const tTop = document.getElementById("infoTopTable");
    const tRight = document.getElementById("infoTableRight");
    if (tTop) tTop.innerHTML = "";
    if (tRight) tRight.innerHTML = "";
    const img = document.getElementById("productImage");
    if (img) img.src = "";

    document.getElementById("maspInput").select();

    // 1) lấy danh sách mã từ textarea (nếu có) → ưu tiên 
    const bulkCodes = parseBulkMasp(); // [ '11376-GDM', ... ]
    let candidates = [];

    if (bulkCodes.length > 0) {
        candidates = bulkCodes;
        msg.textContent = `Đang tìm ${candidates.length} mã từ Textarea...`;
    } else {
        // 2) nếu textarea trống → chạy như cũ (từ ô maspInput)
        let masp = _masp || document.getElementById("maspInput").value.trim().toUpperCase();
        if (!masp || masp.length < 3) {
            msg.textContent = "Vui lòng nhập tối thiểu 3 ký tự mã sản phẩm!";
            return;
        }
        let { data: list, error } = await supabase.from("dmhanghoa")
            .select("*").ilike("masp", `%${masp}%`).order("masp").limit(50);
        if (error || !list || !list.length) {
            msg.textContent = "SAI MÃ";
            return;
        }
        candidates = list.map(r => r.masp);
    }

    if (candidates.length === 0) {
        msg.textContent = "Không có mã hợp lệ để tìm!";
        return;
    }

    // === GỌI RPC BULK 1 LẦN ===
    const { data: bulkData, error: bulkErr } = await supabase.rpc("timkiemhanghoa_bulk", {
        masp_list: candidates
    });

    if (bulkErr || !bulkData) {
        msg.textContent = "❌ Lỗi khi gọi RPC bulk!";
        console.error(bulkErr);
        return;
    }

    // 👉 Cache XNT theo từng mã (chuẩn hoá masp: trim + toUpperCase)
    window.XNT_BULK_MAP = {};
    for (const row of bulkData) {
        const key = String(row.masp || "").trim().toUpperCase();
        if (!key) continue;
        if (!window.XNT_BULK_MAP[key]) window.XNT_BULK_MAP[key] = [];
        window.XNT_BULK_MAP[key].push(row);
    }

    // Gom danh sách mã có dữ liệu XNT (dùng key đã chuẩn hoá)
    let productWithXNT = Object.keys(window.XNT_BULK_MAP);

    // Nếu đang ở chế độ nhiều mã (textarea) → sắp xếp đúng thứ tự người dùng nhập
    if (Array.isArray(candidates) && candidates.length > 0) {
        const norm = s => String(s || "").trim().toUpperCase();

        const orderMap = new Map(candidates.map((m, i) => [norm(m), i]));

        productWithXNT.sort((a, b) => {
            const ia = orderMap.get(norm(a));
            const ib = orderMap.get(norm(b));
            return (ia ?? Number.MAX_SAFE_INTEGER) - (ib ?? Number.MAX_SAFE_INTEGER);
        });
    }

    if (productWithXNT.length === 0) {
        msg.textContent = "Không có mã sản phẩm nào phát sinh xuất nhập tồn!";
        document.getElementById("singleDetailBox").style.display = "none";
        return;
    }

    if (productWithXNT.length === 1) {
        document.getElementById("singleDetailBox").style.display = "";
        await renderOneProductDetail(productWithXNT[0]);
        msg.textContent = "Hoàn thành! Trả về 1 sản phẩm.";
        clearBulkTextareaAfterSuccess();
        return;
    }

    // nhiều mã → render từng block + HOT editable
    document.getElementById("singleDetailBox").style.display = "none";
    const multi = document.getElementById("multiDetailBox");
    multi.innerHTML = "";

    const hotList = [];
    for (const m of productWithXNT) {
        const html = await renderProductDetailHTML(m);
        const wrap = document.createElement("div");
        wrap.innerHTML = html;
        multi.appendChild(wrap);
        toggleVitriInputsByBranch();

        const safeId = _safeIdFromMasp(m);
        const el = wrap.querySelector(`#xntHot_${safeId}`);
        const rowMap = window.XNT_ROW_MAPS[m];
        if (el && rowMap) {
            const hot = initXntHot(el, rowMap, m);
            hotList.push(hot);
        }
    }

    requestAnimationFrame(() => {
        for (const hot of hotList) {
            try {
                hot.refreshDimensions();
                hot.render();
            } catch (e) { }
        }
    });

    multi.style.display = "";
    msg.textContent = `Hoàn thành! Trả về ${productWithXNT.length} sản phẩm.`;
    clearBulkTextareaAfterSuccess();
}


/* ====== HIỂN THỊ 1 MÃ (hai dòng/8 cột + bảng XNT + ảnh) ====== */
/* ====== HIỂN THỊ 1 MÃ (hai dòng/8 cột + bảng XNT + ảnh) ====== */
async function renderOneProductDetail(masp) {
    const normMasp = (masp || '').toUpperCase();
    masp = normMasp;

    CURRENT_MASP = normMasp;              // luôn IN HOA để đặt tên file .JPG
    _pendingBlob = null;                  // reset blob chờ upload
    const sts = document.getElementById('uploadStatus');
    if (sts) sts.textContent = '';

    // --- Chuẩn bị các query chạy song song ---
    const hanghoaPromise = supabase
        .from("dmhanghoa")
        .select("*")
        .eq("masp", masp)
        .single();

    const nhapListPromise = supabase
        .from("hoadon_banle")
        .select("ngay,sohd")
        .in("loaihd", ["nmcs1", "nmcs2"])
        .order("ngay", { ascending: true });

    const k1Promise = supabase
        .from("kiemkho")
        .select("ngaygio")
        .eq("masp", masp)
        .eq("diadiem", "cs1")
        .order("ngaygio", { ascending: false })
        .limit(1);

    const k2Promise = supabase
        .from("kiemkho")
        .select("ngaygio")
        .eq("masp", masp)
        .eq("diadiem", "cs2")
        .order("ngaygio", { ascending: false })
        .limit(1);

    // XNT: ưu tiên lấy từ cache bulk, nếu không có thì mới gọi RPC đơn
    let cachedXnt = (window.XNT_BULK_MAP && window.XNT_BULK_MAP[normMasp]) || null;
    const xntPromise = cachedXnt
        ? null
        : supabase.rpc("timkiemhanghoa", { masp_query: masp });

    const [
        hanghoaRes,
        nhapListRes,
        k1Res,
        k2Res,
        xntRes
    ] = await Promise.all([
        hanghoaPromise,
        nhapListPromise,
        k1Promise,
        k2Promise,
        xntPromise ? xntPromise : Promise.resolve({ data: cachedXnt, error: null })
    ]);

    const { data: hanghoa, error: err1 } = hanghoaRes;
    if (err1 || !hanghoa) {
        return `<div style="color:red">Không lấy được thông tin sản phẩm ${masp}</div>`;
    }

    // Lưu nhóm hàng để dùng cho chức năng "tìm sản phẩm tương đồng theo size"
    const groupVal = getHanghoaGroup(hanghoa);
    window.PRODUCT_GROUP_MAP = window.PRODUCT_GROUP_MAP || {};
    window.PRODUCT_GROUP_MAP[masp] = groupVal || '';

    const nhapList = nhapListRes.data || [];

    const k1 = k1Res.data || [];
    const k2 = k2Res.data || [];
    let xntdata = cachedXnt || (xntRes && xntRes.data) || [];

    // ND lấy từ dmhanghoa.nhapdau; fallback tính từ hóa đơn nếu thiếu
    let ngay_nhapdau = hanghoa.nhapdau || "";
    let ngay_nhapcuoi = "";

    if ((!ngay_nhapdau || !ngay_nhapcuoi) && nhapList.length) {
        const sohdArr = nhapList.map(e => e.sohd);
        const { data: cts } = await supabase
            .from("ct_hoadon_banle")
            .select("sohd,masp")
            .in("sohd", sohdArr)
            .eq("masp", masp);

        const setSohd = new Set((cts || []).map(e => e.sohd));
        const filtered = nhapList.filter(e => setSohd.has(e.sohd));
        if (filtered.length) {
            if (!ngay_nhapdau) ngay_nhapdau = filtered[0].ngay;
            ngay_nhapcuoi = filtered[filtered.length - 1].ngay;
        }
    }

    // ngày kiểm gần nhất CS1/CS2
    let ngay_kiem_cs1 = "";
    let ngay_kiem_cs2 = "";
    if (k1.length) ngay_kiem_cs1 = k1[0].ngaygio;
    if (k2.length) ngay_kiem_cs2 = k2[0].ngaygio;

    // xuất nhập tồn
    if (!xntdata || !xntdata.length) {
        document.getElementById("infoTopTable").innerHTML = "";
        document.getElementById("infoTableRight").innerHTML = "";
        document.getElementById("statusMsg").textContent = "Không có dữ liệu xuất nhập tồn!";
        return false;
    }

    // EU/US/JP/height (dùng EU làm key tính toán)
    const SIZE_LIST = ['0', '38/S/46/165', '39/M/48/170', '40/L/50/175', '41/XL/52/180', '42/2X/54/185', '43/3X/56/190', '44/4X/58/195', '45/5X/60/200'];

    // Tách metadata để vừa có "key" (EU) vừa có "label" (US/JP/height)
    const SIZE_META = SIZE_LIST.map(x => {
        const parts = String(x).split('/');
        const eu = parts[0];
        const label = parts.slice(1).join('/');
        return { key: eu, label };
    });

    const SIZE_KEYS = SIZE_META.map(s => s.key);

    const rowMap = {};
    xntdata.forEach(r => { rowMap[r.size === null ? '' : r.size] = r; });
    const totalRow = {};
    const KEYS_NO_ZERO = SIZE_KEYS.filter(k => k !== '0');
    ["nhapmua", "xuatban", "toncuoi", "ban_cs1", "ton_cs1", "ton_cs2", "ban_cs2"].forEach(f => {
        totalRow[f] = KEYS_NO_ZERO.reduce((s, k) => s + (Number(rowMap[k]?.[f]) || 0), 0);
    });

    const top = document.getElementById("infoTopTable");
    if (!top) return;

    top.innerHTML = `   
    <tr>
      <th>Mã hàng</th>
      <th>Vị trí CS1</th>
      <th>Vị trí CS2</th>
      <th>${hanghoa.nhacc || ""}</th>
      <th class="red">ND</th>
      <th class="red">NC</th>
      <th class="red">Kiểm CS1</th>
      <th class="red">Kiểm CS2</th>
    </tr>
    <tr>
      <td>
        <a href="#"
           class="order-link"
           onclick="return openDatHangFor('${(hanghoa.masp || '').replace(/'/g, "\\'")}', this)">
           ${(hanghoa.masp || '')}
        </a>
      </td>
      <td>
        <input class="vitri-input"
               data-masp="${hanghoa.masp}"
               data-branch="cs1"
               value="${(hanghoa.vitrikho1 || '').replace(/"/g, '&quot;')}"
               style="width:120px;text-align:center;">
      </td>
      <td>
        <input class="vitri-input"
               data-masp="${hanghoa.masp}"
               data-branch="cs2"
               value="${(hanghoa.vitrikho2 || '').replace(/"/g, '&quot;')}"
               style="width:120px;text-align:center;">
      </td>
      <td>${hanghoa.giale?.toLocaleString() || ""}</td>
      <td>${formatDateOnly(ngay_nhapdau) || ""}</td>
      <td>${formatDateOnly(ngay_nhapcuoi) || ""}</td>
      <td>${formatDateOnly(ngay_kiem_cs1) || ""}</td>
      <td>${formatDateOnly(ngay_kiem_cs2) || ""}</td>
    </tr>
  `;

    toggleVitriInputsByBranch();

    // Bảng XNT (Editable)
    const rightBox = document.querySelector('.right-xnt');
    if (rightBox) {
        rightBox.innerHTML = '<div id="xntHot" style="max-width:100%;"></div>';
        const el = document.getElementById('xntHot');
        initXntHot(el, rowMap, masp);
    }


    // Ảnh sản phẩm dưới bảng
    setProductImageByMasp(hanghoa.masp);
    document.getElementById("maspInput").select();
}

// Lưu rowMap tạm để khởi tạo HOT sau khi gán HTML vào DOM
window.XNT_ROW_MAPS = window.XNT_ROW_MAPS || {};

function _safeIdFromMasp(masp) {
    // id an toàn cho DOM (#xntHot_<id>)
    return String(masp || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
}

/**
 * Tạo block HTML cho 1 sản phẩm (dùng trong chế độ nhiều mã)
 * - Trả về string HTML (chưa khởi tạo HOT)
 * - Lưu rowMap vào window.XNT_ROW_MAPS[masp] để lát nữa init HOT
 */
/**
 * Tạo block HTML cho 1 sản phẩm (dùng trong chế độ nhiều mã)
 * - Trả về string HTML (chưa khởi tạo HOT)
 * - Lưu rowMap vào window.XNT_ROW_MAPS[masp] để lát nữa init HOT
 */
async function renderProductDetailHTML(masp) {
    const normMasp = (masp || '').toUpperCase();
    masp = normMasp;

    // Chạy song song dmhanghoa, hoadon, kiểm kho, XNT
    const hanghoaPromise = supabase
        .from("dmhanghoa")
        .select("*")
        .eq("masp", masp)
        .single();

    const nhapListPromise = supabase
        .from("hoadon_banle")
        .select("ngay,sohd")
        .in("loaihd", ["nmcs1", "nmcs2"])
        .order("ngay", { ascending: true });

    const k1Promise = supabase
        .from("kiemkho")
        .select("ngaygio")
        .eq("masp", masp)
        .eq("diadiem", "cs1")
        .order("ngaygio", { ascending: false })
        .limit(1);

    const k2Promise = supabase
        .from("kiemkho")
        .select("ngaygio")
        .eq("masp", masp)
        .eq("diadiem", "cs2")
        .order("ngaygio", { ascending: false })
        .limit(1);

    // XNT: dùng cache bulk nếu có, fallback RPC đơn
    let cachedXnt = (window.XNT_BULK_MAP && window.XNT_BULK_MAP[normMasp]) || null;
    const xntPromise = cachedXnt
        ? null
        : supabase.rpc("timkiemhanghoa", { masp_query: masp });

    const [
        hanghoaRes,
        nhapListRes,
        k1Res,
        k2Res,
        xntRes
    ] = await Promise.all([
        hanghoaPromise,
        nhapListPromise,
        k1Promise,
        k2Promise,
        xntPromise ? xntPromise : Promise.resolve({ data: cachedXnt, error: null })
    ]);

    const { data: hanghoa, error: err1 } = hanghoaRes;
    if (err1 || !hanghoa) return;

    // Lưu nhóm hàng để dùng cho chức năng "tìm sản phẩm tương đồng theo size"
    const groupVal = getHanghoaGroup(hanghoa);
    CURRENT_GROUP = groupVal || '';
    window.PRODUCT_GROUP_MAP = window.PRODUCT_GROUP_MAP || {};
    window.PRODUCT_GROUP_MAP[masp] = CURRENT_GROUP;

    const nhapList = nhapListRes.data || [];

    const k1 = k1Res.data || [];
    const k2 = k2Res.data || [];
    let xntdata = cachedXnt || (xntRes && xntRes.data) || [];

    // ngày nhập đầu/cuối
    let ngay_nhapdau = "";
    let ngay_nhapcuoi = "";
    if (nhapList.length) {
        const sohdArr = nhapList.map(e => e.sohd);
        const { data: cts } = await supabase
            .from("ct_hoadon_banle")
            .select("sohd,masp")
            .in("sohd", sohdArr)
            .eq("masp", masp);
        const setSohd = new Set((cts || []).map(e => e.sohd));
        const filtered = nhapList.filter(e => setSohd.has(e.sohd));
        if (filtered.length) {
            ngay_nhapdau = filtered[0].ngay;
            ngay_nhapcuoi = filtered[filtered.length - 1].ngay;
        }
    }

    // ngày kiểm
    let ngay_kiem_cs1 = "";
    let ngay_kiem_cs2 = "";
    if (k1.length) ngay_kiem_cs1 = k1[0].ngaygio;
    if (k2.length) ngay_kiem_cs2 = k2[0].ngaygio;

    // Nếu không có XNT vẫn trả block với message
    if (!xntdata || !xntdata.length) {
        return `
      <div class="detail-grid">
        <div class="top-info">
          <table class="info-table">
            <tr>
              <th>Mã hàng</th><th>Vị trí CS1</th><th>Vị trí CS2</th><th>${hanghoa.nhacc || ""}</th>
              <th class="red">ND</th><th class="red">NC</th><th class="red">Kiểm CS1</th><th class="red">Kiểm CS2</th>
            </tr>
            <tr>
              <td>
                <a href="#"
                   class="order-link"
                   onclick="return openDatHangFor('${(hanghoa.masp || '').replace(/'/g, "\\'")}', this)">
                   ${(hanghoa.masp || '')}
                </a>
              </td>
              <td>
                <input class="vitri-input"
                       data-masp="${hanghoa.masp}"
                       data-branch="cs1"
                       value="${(hanghoa.vitrikho1 || '').replace(/"/g, '&quot;')}"
                       style="width:120px;text-align:center;">
              </td>
              <td>
                <input class="vitri-input"
                       data-masp="${hanghoa.masp}"
                       data-branch="cs2"
                       value="${(hanghoa.vitrikho2 || '').replace(/"/g, '&quot;')}"
                       style="width:120px;text-align:center;">
              </td>
              <td>${hanghoa.giale?.toLocaleString() || ""}</td>
              <td>${formatDateOnly(ngay_nhapdau) || ""}</td>
              <td>${formatDateOnly(ngay_nhapcuoi) || ""}</td>
              <td>${formatDateOnly(ngay_kiem_cs1) || ""}</td>
              <td>${formatDateOnly(ngay_kiem_cs2) || ""}</td>
            </tr>
          </table>
        </div>
        <div class="right-xnt"><i>Không có dữ liệu xuất nhập tồn!</i></div>
        <div class="img-wrap">
          <img alt="Ảnh sản phẩm" src="${IMG_BASE}${encodeURIComponent(hanghoa.masp)}.JPG"
               onerror="this.onerror=null;this.src='${IMG_BASE}${encodeURIComponent(hanghoa.masp)}.png';" />
        </div>
      </div>`;
    }

    // rowMap + id placeholder HOT
    const rowMap = {};
    xntdata.forEach(r => { rowMap[r.size === null ? '' : r.size] = r; });
    window.XNT_ROW_MAPS[masp] = rowMap;

    const safeId = _safeIdFromMasp(masp);
    return `
    <div class="detail-grid">
      <div class="top-info">
        <table class="info-table">
          <tr>
            <th>Mã hàng</th><th>Vị trí CS1</th><th>Vị trí CS2</th><th>${hanghoa.nhacc || ""}</th>
            <th class="red">ND</th><th class="red">NC</th><th class="red">Kiểm CS1</th><th class="red">Kiểm CS2</th>
          </tr>
          <tr>
            <td>
              <a href="#"
                 class="order-link"
                 onclick="return openDatHangFor('${(hanghoa.masp || '').replace(/'/g, "\\'")}', this)">
                 ${(hanghoa.masp || '')}
              </a>
            </td>
            <td>
              <input class="vitri-input"
                     data-masp="${hanghoa.masp}"
                     data-branch="cs1"
                     value="${(hanghoa.vitrikho1 || '').replace(/"/g, '&quot;')}"
                     style="width:120px;text-align:center;">
            </td>
            <td>
              <input class="vitri-input"
                     data-masp="${hanghoa.masp}"
                     data-branch="cs2"
                     value="${(hanghoa.vitrikho2 || '').replace(/"/g, '&quot;')}"
                     style="width:120px;text-align:center;">
            </td>
            <td>${hanghoa.giale?.toLocaleString() || ""}</td>
            <td>${formatDateOnly(ngay_nhapdau) || ""}</td>
            <td>${formatDateOnly(ngay_nhapcuoi) || ""}</td>
            <td>${formatDateOnly(ngay_kiem_cs1) || ""}</td>
            <td>${formatDateOnly(ngay_kiem_cs2) || ""}</td>
          </tr>
        </table>
      </div>
      <div class="right-xnt">
        <div id="xntHot_${safeId}" style="max-width:100%;"></div>
      </div>
      <div class="img-wrap">
        <img alt="Ảnh sản phẩm" src="${IMG_BASE}${encodeURIComponent(hanghoa.masp)}.JPG"
             onerror="this.onerror=null;this.src='${IMG_BASE}${encodeURIComponent(hanghoa.masp)}.png';" />
      </div>
    </div>
  `;
}

function formatDateOnly(val) {
    if (!val) return "";
    // Xử lý cho cả dạng string ISO hoặc Date object
    let d = new Date(val);
    if (isNaN(d)) return val;
    return d.toISOString().slice(0, 10); // yyyy-mm-dd
    // Hoặc nếu muốn dd/mm/yyyy:
    // return d.getDate().toString().padStart(2, "0") + "/" + (d.getMonth()+1).toString().padStart(2, "0") + "/" + d.getFullYear();
}

function getQuery(name) {
    const p = new URLSearchParams(window.location.search);
    const v = p.get(name);
    return v ? v.trim() : "";
}

// ==== QUÉT MÃ VẠCH / QR BẰNG CAMERA (hỗ trợ iPhone) ====
let ZXING = null, codeReader = null, scanControls = null;
let torchOn = false;
let track = null; // giữ MediaStreamTrack hiện tại để bật/tắt torch

async function ensureZXing() {
    if (ZXING) return;
    // load ESM từ CDN khi cần
    ZXING = await import('https://cdn.jsdelivr.net/npm/@zxing/browser@latest/+esm');
}

function scoreCameraLabel(label = '') {
    const s = label.toLowerCase();
    let score = 0;

    // Ưu tiên camera sau
    if (/(back|rear|mặt sau|environment)/.test(s)) score += 50;

    // ƯU TIÊN CAO NHẤT: cực rộng / ultra wide / 0.5x
    if (/(cực rộng|siêu rộng|ultra\s*wide|0\.5x|0,5x|0\.5|0,5)/.test(s)) score += 200;

    // Tránh tele/chụp xa làm mặc định
    if (/(tele|chụp xa|zoom|2x|3x)/.test(s)) score -= 120;

    // Tránh camera trước
    if (/(front|trước|mặt trước)/.test(s)) score -= 200;

    return score;
}


async function pickBestBackCamera() {
    await ensureZXing();
    const devices = await ZXING.BrowserCodeReader.listVideoInputDevices();
    if (!devices || !devices.length) return undefined;
    // Sắp xếp để “cực rộng” đứng đầu
    devices.sort((a, b) => scoreCameraLabel(b.label) - scoreCameraLabel(a.label));
    return devices[0].deviceId;
}


async function startScanner(deviceId) {
    await ensureZXing();
    const videoEl = document.getElementById('scannerVideo');
    const status = document.getElementById('scannerStatus');

    // giảm trễ giữa các lần decode để phản hồi nhanh
    codeReader = new ZXING.BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 25 });

    // dùng 720p cho tốc độ cao (thường đủ nét để quét nhanh hơn 1080p)
    const fastConstraints = {
        video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 }, height: { ideal: 720 },
            frameRate: { ideal: 30 }
        }
    };

    try {

        if (deviceId) {
            scanControls = await codeReader.decodeFromVideoDevice(deviceId, videoEl, onScanResult);
        } else {
            scanControls = await codeReader.decodeFromConstraints(fastConstraints, videoEl, onScanResult);
        }

        // Lưu track video để bật/tắt torch
        const stream = videoEl.srcObject;
        if (stream) {
            track = stream.getVideoTracks()[0] || null;
        }

        // cố gắng bật continuous-focus (nếu hỗ trợ)
        try {

            await track?.applyConstraints?.({ advanced: [{ focusMode: 'continuous' }] });
        } catch (_) { }

        status.textContent = 'Đang quét... đưa mã vào khung.';
        await populateCameraList();

        // set dropdown trỏ ngay camera tốt nhất (cực rộng)
        try {
            const sel = document.getElementById('cameraSelect');
            const bestId = deviceId || await pickBestBackCamera();
            if (sel && bestId) sel.value = bestId;
        } catch (_) { }
    } catch (err) {
        console.error('startScanner error:', err);
        status.textContent = 'Không mở được camera. Kiểm tra quyền camera và tắt Live Text nếu đang bật.';
    }
}

// === SỰ KIỆN UPLOAD ẢNH ===
const fileInput = document.getElementById('imgFileInput');
const saveImgBtn = document.getElementById('saveImgBtn');
const resizeCheckbox = document.getElementById('resizeCheckbox');
const uploadStatus = document.getElementById('uploadStatus');

fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const imgEl = document.getElementById('productImage');

    // luôn chuẩn hoá kích thước trước khi upload
    _pendingBlob = await resizeToStandardBlob(file);
    if (imgEl) imgEl.src = URL.createObjectURL(_pendingBlob);

    const sts = document.getElementById('uploadStatus');
    if (sts) { sts.style.color = '#444'; sts.textContent = 'Đã chọn ảnh (chưa lưu)'; }

    // NEW: nếu đang đi theo luồng Đặt hàng → tự upload ngay và mở popup
    if (_orderAutoFlow) {
        await uploadCurrentPendingImage(/*autoOpenAfter=*/true);
    }
});


saveImgBtn?.addEventListener('click', async () => {
    await uploadCurrentPendingImage(/*autoOpenAfter=*/false);
});

function waitForProductImageLoad() {
    return new Promise((resolve) => {
        const img = document.getElementById('productImage');
        if (!img) return resolve(false);
        if (img.complete && img.naturalWidth > 0) return resolve(true);

        const onLoad = () => { cleanup(); resolve(true); };
        const onErr = () => { cleanup(); resolve(false); };
        const cleanup = () => {
            img.removeEventListener('load', onLoad);
            img.removeEventListener('error', onErr);
        };

        img.addEventListener('load', onLoad, { once: true });
        img.addEventListener('error', onErr, { once: true });
    });
}


async function uploadCurrentPendingImage(autoOpenAfter = false) {
    try {
        uploadStatus.style.color = '#c62828';
        if (!CURRENT_MASP) { uploadStatus.textContent = 'Chưa có mã sản phẩm!'; return; }
        if (!_pendingBlob) { uploadStatus.textContent = 'Chưa chọn ảnh!'; return; }

        const fileName = `${CURRENT_MASP}.JPG`;
        uploadStatus.textContent = 'Đang lưu ảnh...';

        const { error } = await supabase
            .storage.from(STORAGE_BUCKET)
            .upload(fileName, _pendingBlob, { upsert: true, contentType: 'image/jpeg' });

        if (error) throw error;

        // refresh ảnh với cache-busting
        const imgEl = document.getElementById('productImage');
        imgEl.src = `${IMG_BASE}${encodeURIComponent(CURRENT_MASP)}.JPG?t=${Date.now()}`;
        // CHỜ ảnh thật sự load để uiHasProductImage() trả true
        await waitForProductImageLoad();
        uploadStatus.style.color = 'green';
        uploadStatus.textContent = 'Đã lưu ảnh thành công!';

        // dọn trạng thái chọn file
        const fi = document.getElementById('imgFileInput'); if (fi) fi.value = '';
        _pendingBlob = null;

        // nếu là luồng tự lưu → mở popup đặt hàng luôn
        if (autoOpenAfter) {
            try { await openDatHangPopup(); } catch (_) { }
        } else {
            // thủ công thì chỉ focus về ô mã cho tiện
            const ip = document.getElementById('maspInput');
            if (ip) { ip.focus(); ip.select(); }
        }
    } catch (e) {
        console.error(e);
        uploadStatus.style.color = '#c62828';
        uploadStatus.textContent = 'Lưu ảnh thất bại!';
    } finally {
        // tắt cờ auto flow (nếu có)
        _orderAutoFlow = false;
    }
}


async function resizeToStandardBlob(file) {
    // đọc file → Image
    const dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(file);
    });
    const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = dataUrl;
    });

    // chọn size đích theo hướng ảnh
    const isLandscape = img.width > img.height;
    const targetW = isLandscape ? 640 : 480;
    const targetH = isLandscape ? 480 : 640;

    const canvas = document.createElement('canvas');
    canvas.width = targetW; canvas.height = targetH;
    const ctx = canvas.getContext('2d');

    const scale = Math.min(targetW / img.width, targetH / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const offX = (targetW - drawW) / 2;
    const offY = (targetH - drawH) / 2;
    ctx.drawImage(img, offX, offY, drawW, drawH);

    return await new Promise((res) => canvas.toBlob(
        (blob) => res(blob), 'image/jpeg'
    ));
}

//gọi addToScanBuffer thôi, KHÔNG đóng, KHÔNG tìm:
function onScanResult(result, err, controls) {
    if (result) {
        const text = result.getText ? result.getText() : (result.rawValue || '');
        if (text) { pushCodeToTextareaAndSearch(text); }
    }
    // lỗi decode thì bỏ qua
}



async function stopScanner() {
    try { scanControls?.stop(); } catch (_) { }
    const v = document.getElementById('scannerVideo');

    try { track?.stop(); } catch (_) { }
    if (v) v.srcObject = null;
    codeReader = null; scanControls = null; torchOn = false;
}

async function populateCameraList() {
    await ensureZXing();
    const sel = document.getElementById('cameraSelect');
    sel.innerHTML = '';
    try {
        const devices = await ZXING.BrowserCodeReader.listVideoInputDevices();
        devices.sort((a, b) => scoreCameraLabel(b.label) - scoreCameraLabel(a.label));
        devices.forEach((d, i) => {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.textContent = d.label || `Camera ${i + 1}`;
            sel.appendChild(opt);
        });
    } catch (_) { }
}


async function switchCamera(deviceId) {
    await stopScanner();
    await startScanner(deviceId);
}


async function toggleTorch() {
    if (!track) return;

    try {
        torchOn = !torchOn;
        await track.applyConstraints({ advanced: [{ torch: torchOn }] });
        document.getElementById('flashBtn').textContent = torchOn ? '🔦 Tắt đèn' : '🔦 Đèn';
    } catch (e) {
        document.getElementById('scannerStatus').textContent = 'Thiết bị không hỗ trợ bật đèn.';
        torchOn = false;
    }
}


async function decodeFromFile(file) {
    if (!file) return;
    await ensureZXing();
    const reader = new ZXING.BrowserMultiFormatReader();
    const url = URL.createObjectURL(file);
    try {
        const res = await reader.decodeFromImageUrl(url);
        const text = res.getText ? res.getText() : (res.rawValue || '');
        if (text) { pushCodeToTextareaAndSearch(text); }
        document.getElementById('scannerStatus').textContent = 'Không đọc được mã từ ảnh.';
    } catch (e) {
        console.error('decodeFromFile error:', e);
        document.getElementById('scannerStatus').textContent = 'Không đọc được mã từ ảnh.';
    } finally {
        URL.revokeObjectURL(url);
    }
}



// ==== Open/Close modal
window.openScanner = async function () {
    try { document.activeElement?.blur(); } catch (_) { } // tránh Live Text chiếm camera
    document.getElementById('scannerModal').style.display = 'block';
    // Đặt modal “đè” toàn màn hình, đảm bảo z-index cao
    const modal = document.getElementById('scannerModal');
    Object.assign(modal.style, {
        position: 'fixed',
        inset: '0',               // top/right/bottom/left = 0
        zIndex: '9999',
    });

    // Thu nhỏ khung quét để chừa chỗ cho panel
    const video = document.getElementById('scannerVideo');
    if (video) {
        video.style.maxWidth = '72vw';
        video.style.maxHeight = '62vh';
        video.style.borderRadius = '10px';
        video.style.boxShadow = '0 4px 16px rgba(0,0,0,.25)';
    }



    const status = document.getElementById('scannerStatus');
    status.textContent = 'Đang chuẩn bị camera...';

    try {
        await ensureZXing();

        // mồi quyền & lộ labels (để thấy “cực rộng”)
        try {
            const pre = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
            pre.getTracks().forEach(t => t.stop());
        } catch (_) { }

        const bestId = await pickBestBackCamera();     // → sẽ ưu tiên “cực rộng”
        await startScanner(bestId || null);
    } catch (e) {
        console.error('openScanner error:', e);
        status.textContent = 'Không mở được camera. Hãy kiểm tra quyền camera và đóng Live Text.';
    }
};

function renderScanBuffer() {
    const box = document.getElementById('scanBufferBox');
    if (!box) return;
    if (!window.scanBuffer.length) {
        box.innerHTML = `<div class="empty">Chưa có mã nào.</div>`;
        return;
    }
    box.innerHTML = window.scanBuffer
        .map((c, i) => `
      <div class="scan-item">
        <span class="code">${c}</span>
        <button class="del" data-idx="${i}">×</button>
      </div>
    `).join('');
    // gắn click xóa từng mã
    box.querySelectorAll('.del').forEach(btn => {
        btn.onclick = () => removeFromScanBufferAt(+btn.dataset.idx);
    });
}


window.closeScanner = async function () {
    document.getElementById('scannerModal').style.display = 'none';
    await stopScanner();
};

// === Gắn sự kiện sau khi trang load (gộp vào onload cũ)
const _oldOnload_scan = window.onload;
window.onload = async function () {
    if (typeof _oldOnload_scan === 'function') await _oldOnload_scan();

    const btn = document.getElementById('scanBtn');
    const btnClose = document.getElementById('closeScanner');
    const btnFlash = document.getElementById('flashBtn');
    const selCam = document.getElementById('cameraSelect');
    const filePick = document.getElementById('filePicker');

    btn?.addEventListener('click', () => openScanner());
    btnClose?.addEventListener('click', () => closeScanner());
    btnFlash?.addEventListener('click', () => toggleTorch());
    selCam?.addEventListener('change', (e) => switchCamera(e.target.value));
    filePick?.addEventListener('change', (e) => decodeFromFile(e.target.files?.[0]));
};


// Gộp cùng onload hiện có:
const _oldOnload = window.onload;
window.onload = async function () {
    // giữ hành vi cũ: kiểm tra session và ẩn/hiện box đăng nhập
    if (typeof _oldOnload === "function") await _oldOnload();
    // 🔊 mở khóa audio một lần cho iOS/Safari
    try { setupBeepUnlockOnce(document); } catch (_) { }

    // nhận mã từ URL và tìm kiếm luôn
    const q = getQuery("masp");
    if (q && q.length >= 3) {
        const masp = q.toUpperCase();
        const ip = document.getElementById("maspInput");
        if (ip) ip.value = masp;
        // nếu chưa đăng nhập RLS có thể chặn; vẫn cứ gọi,
        // user có thể đăng nhập rồi bấm tìm lại nếu cần
        try {
            await triggerSearch(masp);
        } catch (e) { /* bỏ qua lỗi */ }
    }

    // NHẬN DANH SÁCH MÃ TỪ localStorage (nếu được F8 truyền sang)
    const bulk = localStorage.getItem("TKHH333_BULK");
    if (bulk) {
        const ta = document.getElementById("bulkTextarea");
        if (ta) ta.value = bulk;
        localStorage.removeItem("TKHH333_BULK"); // dọn key
        try {
            await triggerSearch(); // chạy tìm luôn
        } catch (e) {
            console.error("Lỗi auto triggerSearch từ F8:", e);
        }
    }

    // === ĐẶT HÀNG: gắn sự kiện ===
    document.getElementById('orderBtn')?.addEventListener('click', async () => {
        const singleBox = document.getElementById('singleDetailBox');
        const isSingleVisible = singleBox && getComputedStyle(singleBox).display !== 'none' && !!CURRENT_MASP;
        if (!isSingleVisible) { showToast('⚠️ Vui lòng tìm đúng 1 sản phẩm!', 'warn'); return; }

        if (!uiHasProductImage()) {
            // NEW: bật cờ auto-flow, mời người dùng chụp/chọn ảnh
            _orderAutoFlow = true;
            //showToast('⚠️ Sản phẩm chưa có ảnh. Mời chụp/chọn ảnh, hệ thống sẽ tự lưu & mở đặt hàng.', 'warn');
            document.getElementById('imgFileInput')?.click();
            return;
        }

        await openDatHangPopup();
    });


    // Popup Đặt hàng: nút/enter điều hướng
    document.getElementById('dhCloseBtn')?.addEventListener('click', closeDatHangPopup);
    document.getElementById('dhSaveBtn')?.addEventListener('click', saveDatHang);

    // Enter chuyển ô: Màu → Còn size → Hết size → Ghi chú → Lưu
    document.getElementById('dhMau')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('dhConSize').focus(); } });
    document.getElementById('dhConSize')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('dhHetSize').focus(); } });
    document.getElementById('dhHetSize')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('dhGhichu').focus(); } });
    document.getElementById('dhGhichu')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('dhSaveBtn').focus(); } });

    // Popup chọn Màu/Size
    document.getElementById('pickMauBtn')?.addEventListener('click', openPickMau);
    document.getElementById('mauCloseBtn')?.addEventListener('click', () => { document.getElementById('popupPickMau').style.display = 'none'; });

    document.getElementById('pickConSizeBtn')?.addEventListener('click', () => openPickSize('con'));
    document.getElementById('pickHetSizeBtn')?.addEventListener('click', () => openPickSize('het'));
    document.getElementById('sizeDoneBtn')?.addEventListener('click', closePickSizeAndFill);


};



// ====== XNT HOT (Handsontable) ======
const xntHotInstances = {};  // thay vì let xntHot = null

const XNT_COLS = [
    { header: 'Size', key: 'size' },
    { header: 'Tồn CS1', key: 'ton_cs1' },
    { header: 'Tồn CS2', key: 'ton_cs2' },
    { header: 'Bán CS1', key: 'ban_cs1' },
    { header: 'Bán CS2', key: 'ban_cs2' },
    { header: 'Tổng mua', key: 'nhapmua' },
    { header: 'Tổng bán', key: 'xuatban' },
    { header: 'Mua-Bán', key: 'toncuoi' },
];

// 0 -> hiển thị rỗng (dữ liệu vẫn là số)
function zeroBlankRenderer(instance, td, row, col, prop, value, cellProperties) {
    const v = (value === '' || value == null) ? '' : Number(value);
    Handsontable.renderers.TextRenderer.apply(this, arguments);
    td.textContent = (v === 0) ? '' : (Number.isFinite(v) ? String(v) : '');
}

// Tổng từ các hàng size (index 1..n) vào hàng 0
// Tổng từ các hàng size (index 1..n) vào hàng 0
// => Tổng tồn cuối = Tổng mua - Tổng bán
function recalcXntTotals(rows) {
    // chỉ cộng các cột cần thiết
    const total = { ton_cs1: 0, ton_cs2: 0, ban_cs1: 0, ban_cs2: 0, nhapmua: 0, xuatban: 0 };

    for (let i = 1; i < rows.length; i++) {
        for (const k of Object.keys(total)) {
            total[k] += Number(rows[i][k]) || 0;
        }
    }

    // Gán lại cho hàng "Tổng"
    Object.assign(rows[0], total);

    // TÍNH LẠI TỔNG TỒN = TỔNG MUA - TỔNG BÁN
    rows[0].toncuoi =
        (Number(rows[0].nhapmua) || 0) -
        (Number(rows[0].xuatban) || 0);
}


// Tạo data (hàng 0 là Tổng, dưới là các size chuẩn)
function buildXntRows(rowMap) {
    // EU/US/JP/height
    const SIZE_LIST = ['0',
        '38/S/46/165', '39/M/48/170', '40/L/50/175',
        '41/XL/52/180', '42/2X/54/185', '43/3X/56/190',
        '44/4X/58/195', '45/5X/60/200'
    ];

    // Tách key (EU) để TRA DỮ LIỆU, nhãn để HIỂN THỊ
    const SIZE_META = SIZE_LIST.map(x => {
        const parts = String(x).split('/');
        const eu = parts[0];               // key thực tế trong rowMap: '38','39',...
        const label = parts.slice(1).join('/'); // 'S/46/165' ...
        // size hiển thị = '38/S/46/165' (giống bạn đang thấy trên UI)
        const display = parts.length > 1 ? `${eu}/${label}` : eu;
        return { key: eu, display };
    });

    const rows = [{
        size: 'Tổng', ton_cs1: 0, ton_cs2: 0, ban_cs1: 0, ban_cs2: 0, nhapmua: 0, xuatban: 0, toncuoi: 0
    }];

    // HÀNG SIZE: lấy số liệu bằng EU key
    // HÀNG SIZE: lấy số liệu bằng EU key
    for (const s of SIZE_META) {
        const r = rowMap[s.key] || {};
        const nhapmua = Number(r.nhapmua) || 0;
        const xuatban = Number(r.xuatban) || 0;

        rows.push({
            size: s.display,                 // hiển thị nhãn mới
            ton_cs1: Number(r.ton_cs1) || 0,
            ton_cs2: Number(r.ton_cs2) || 0,
            ban_cs1: Number(r.ban_cs1) || 0,
            ban_cs2: Number(r.ban_cs2) || 0,
            nhapmua,
            xuatban,
            // Tồn theo size = Tổng mua - Tổng bán size đó
            toncuoi: nhapmua - xuatban,
        });
    }

    // CỘNG TỔNG (bỏ dòng 0 – 'Tổng')
    const total = { ton_cs1: 0, ton_cs2: 0, ban_cs1: 0, ban_cs2: 0, nhapmua: 0, xuatban: 0 };
    for (let i = 1; i < rows.length; i++) {
        for (const k in total) {
            total[k] += Number(rows[i][k]) || 0;
        }
    }
    Object.assign(rows[0], total);

    // Tổng tồn cuối = Tổng mua - Tổng bán
    rows[0].toncuoi =
        (Number(rows[0].nhapmua) || 0) -
        (Number(rows[0].xuatban) || 0);

    return rows;

}

function initXntHot(containerEl, rowMap, masp) {
    // Nếu không truyền masp (chế độ 1 mã cũ) thì dùng CURRENT_MASP hoặc gán key tạm
    if (!masp) {
        masp = (window.CURRENT_MASP || '').toUpperCase() || '_SINGLE_';
    }

    const data = buildXntRows(rowMap);


    const columns = XNT_COLS.map(c => {
        if (c.key === 'size') return { data: c.key, readOnly: true, className: 'htCenter htBold' };
        return {
            data: c.key,
            type: 'numeric',
            numericFormat: { pattern: '0' },
            allowInvalid: false,
            renderer: zeroBlankRenderer,
        };
    });

    // nếu đã có instance cho masp thì destroy trước
    if (xntHotInstances[masp]) {
        try { xntHotInstances[masp].destroy(); } catch (_) { }
        delete xntHotInstances[masp];
    }

    const hot = new Handsontable(containerEl, {
        data,
        columns,
        rowHeaders: false,
        colHeaders: XNT_COLS.map(c => c.header),
        licenseKey: 'non-commercial-and-evaluation',
        stretchH: 'all',
        height: 'auto',
        manualColumnResize: true,
        // 👇 Thêm 3 dòng này
        selectionMode: 'single',   // chỉ cho chọn 1 ô
        fillHandle: false,         // tắt ô vuông kéo fill
        dragToScroll: false,       // tắt auto scroll khi kéo
        contextMenu: ['row_above', 'row_below', 'remove_row', 'sep1', 'undo', 'redo'],
        cells: (row, col, prop) => {
            const meta = {};
            if (row === 0 || prop === 'size') { meta.readOnly = true; meta.className = 'htCenter htBold'; }
            else { meta.className = 'htRight'; }
            return meta;
        },
        afterChange: (changes, source) => {
            if (!changes || ['loadData', 'recalc', 'coerce'].includes(source)) return;
            let needRecalc = false;
            for (const [r, c, oldVal, newVal] of changes) {
                if (r > 0 && c !== 'size') {
                    const coerced = (newVal === '' || newVal == null) ? 0 : Number(newVal);
                    if (!Number.isFinite(coerced)) hot.setSourceDataAtCell(r, c, 0, 'coerce');
                    else if (String(coerced) !== String(newVal)) hot.setSourceDataAtCell(r, c, coerced, 'coerce');
                    needRecalc = true;
                }
            }
            if (needRecalc) {
                const curr = hot.getSourceData();
                recalcXntTotals(curr);
                for (const colDef of XNT_COLS) {
                    if (colDef.key !== 'size') {
                        hot.setSourceDataAtCell(0, colDef.key, curr[0][colDef.key], 'recalc');
                    }
                }
                hot.render();
            }
        },
        // 👉 Click vào bất kỳ ô nào trên dòng size (trừ dòng Tổng) để mở tìm tương đồng
        afterOnCellMouseDown: (event, coords) => {
            const row = coords?.row;
            if (row == null || row <= 0) return;   // bỏ hàng Tổng (row 0)

            const sourceData = hot.getSourceData();
            const rowObj = sourceData[row];
            if (!rowObj) return;

            const rawSize = rowObj.size || '';
            if (!rawSize) return;

            const sizeEU = String(rawSize).split('/')[0].trim(); // ví dụ "41" từ "41/XL/52/180"
            if (!sizeEU) return;

            const branch = (window.CURRENT_BRANCH || '').trim().toLowerCase();
            if (!branch) {
                showToast('⚠️ Chọn cơ sở (CS1/CS2) ở dropdown trước khi tìm tương đồng!', 'warn');
                return;
            }

            const groupMap = window.PRODUCT_GROUP_MAP || {};
            const groupVal = (masp && groupMap[masp]) || (window.CURRENT_GROUP || '');

            openSimilarSearchFromSize({
                masp,
                sizeEU,
                branch,
                group: groupVal
            });
        }
    });


    xntHotInstances[masp] = hot;  // lưu lại
    return hot;
}

// Mở trang bán theo size và truyền điều kiện tìm tương đồng qua localStorage
function openSimilarSearchFromSize({ masp, sizeEU, branch, group }) {
    const normMasp = (masp || '').toUpperCase();
    const sizeKey = String(sizeEU || '').trim();
    if (!normMasp || !sizeKey) {
        showToast('Không lấy được thông tin sản phẩm / size để tìm tương đồng!', 'warn');
        return;
    }

    const branchClean = (branch || '').toLowerCase();
    if (!branchClean || (branchClean !== 'cs1' && branchClean !== 'cs2')) {
        showToast('⚠️ Chọn cơ sở (CS1/CS2) ở dropdown trước khi tìm tương đồng!', 'warn');
        return;
    }

    const payload = {
        masp: normMasp,
        sizeEU: sizeKey,
        branch: branchClean,   // 'cs1' | 'cs2'
        group: group || '',    // nhóm hàng (nếu lấy được)
        createdAt: Date.now()
    };

    try {
        localStorage.setItem('bantheosize_similar_params', JSON.stringify(payload));
    } catch (err) {
        console.error('Không lưu được tham số tìm tương đồng:', err);
    }

    // Mở trang bán theo size (cùng thư mục với trang 333)
    const url = 'bantheosize.html?mode=similar';
    window.open(url, '_blank');
}


/* ====== TIỆN ÍCH ====== */
/* ====== TIỆN ÍCH ====== */

// Helper: lấy "nhóm hàng" từ bản ghi dmhanghoa.
// Tùy tên cột thực tế trong bảng (ví dụ: nhomhang, nhom, chungloai, ...).
function getHanghoaGroup(hanghoa) {
    if (!hanghoa) return '';
    const candidates = [
        'nhomhang', 'nhom', 'nhom_hang',
        'nhomsp', 'nhom_sp',
        'chungloai', 'chung_loai',
        'nhom1', 'nhom2'
    ];
    for (const key of candidates) {
        if (Object.prototype.hasOwnProperty.call(hanghoa, key) && hanghoa[key]) {
            return String(hanghoa[key]);
        }
    }
    return '';
}

// Base ảnh sản phẩm
const IMG_BASE = "https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/";
// === ẢNH SẢN PHẨM ===
const STORAGE_BUCKET = 'anhsanpham';

let CURRENT_MASP = null;        // đang hiển thị 1 sản phẩm nào
let CURRENT_GROUP = '';         // nhóm hàng của sản phẩm đang hiển thị (để tìm tương đồng)
let _pendingBlob = null;        // blob đã resize (để upload)
// NEW: cờ điều khiển luồng tự lưu ảnh + mở đặt hàng
let _orderAutoFlow = false;     // true khi bấm Đặt hàng mà chưa có ảnh

// Map: masp -> nhóm hàng (dùng cho chế độ nhiều mã)
window.PRODUCT_GROUP_MAP = window.PRODUCT_GROUP_MAP || {};


// Thử .JPG → .jpg → .PNG → .png
function setProductImageByMasp(masp) {
    const img = document.getElementById("productImage");
    if (!img) return;
    const m = encodeURIComponent(masp);
    const candidates = [`${IMG_BASE}${m}.JPG`, `${IMG_BASE}${m}.jpg`, `${IMG_BASE}${m}.PNG`, `${IMG_BASE}${m}.png`];
    let i = 0;
    const tryNext = () => {
        if (i >= candidates.length) return;
        img.onerror = () => { i++; tryNext(); };
        img.src = candidates[i];
    };
    tryNext();
}

function parseBulkMasp() {
    const ta = document.getElementById('bulkTextarea');
    if (!ta) return [];
    const raw = ta.value || "";
    if (!raw.trim()) return [];
    // tách theo xuống dòng, tab, dấu phẩy/chấm phẩy → chuẩn hóa UPPERCASE
    const arr = raw.split(/[\r\n,;\t]+/)
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);
    // loại trùng, giữ thứ tự; giới hạn 50 mã để tránh quá nhiều RPC
    const seen = new Set(), out = [];
    for (const m of arr) if (!seen.has(m)) { seen.add(m); out.push(m); }
    return out.slice(0, 50);
}

function prependToBulkTextarea(code) {
    const ta = document.getElementById('bulkTextarea');
    if (!ta) return;

    const up = (code || "").trim().toUpperCase();
    if (!up) return;

    // Tách dòng hiện có, chuẩn hoá IN HOA, loại rỗng & loại trùng với mã mới
    const lines = (ta.value || "")
        .split(/[\r\n]+/)
        .map(s => s.trim().toUpperCase())
        .filter(Boolean)
        .filter(s => s !== up);

    // Chèn mã mới lên đầu, giữ lại các mã cũ bên dưới
    ta.value = up + (lines.length ? "\n" + lines.join("\n") : "");

    // Đưa textarea về đầu, giúp nhìn thấy mã mới
    ta.scrollTop = 0;
}


document.getElementById('clearBulkBtn')?.addEventListener('click', () => {
    const ta = document.getElementById('bulkTextarea');
    if (ta) { ta.value = ''; ta.focus(); }

    // Dọn trạng thái hiển thị kết quả
    const msg = document.getElementById('statusMsg'); if (msg) msg.textContent = '';
    const multi = document.getElementById('multiDetailBox');
    if (multi) { multi.innerHTML = ''; multi.style.display = 'none'; }
    const top = document.getElementById('infoTopTable'); if (top) top.innerHTML = '';
    const right = document.getElementById('infoTableRight'); if (right) right.innerHTML = '';
    const img = document.getElementById('productImage'); if (img) img.src = '';
    // đảm bảo khối đơn hiển thị rỗng
    const single = document.getElementById('singleDetailBox'); if (single) single.style.display = '';
});

document.getElementById('bulkTextarea')?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        document.getElementById('clearBulkBtn')?.click();
    }
});

function clearBulkTextareaAfterSuccess() {
    const ta = document.getElementById('bulkTextarea');
    if (ta) ta.value = '';
}


// === ĐẶT HÀNG: cấu hình ===
const SOHD_PREFIX = (diadiem) => `dathang${String(diadiem || '').toLowerCase()}_`; // vd: 'dathangcs1_'
const PAD5 = (n) => String(n).padStart(5, '0');


// ƯU TIÊN lấy địa điểm từ dropdown (CURRENT_BRANCH)
// LẤY THÔNG TIN NGƯỜI DÙNG + ĐỊA ĐIỂM TỪ DROPDOWN
function getCurrentUserInfo() {
    const tennv = localStorage.getItem('tennv') || '';
    const sel = document.getElementById('branchPicker');
    const diadiem = sel && sel.value ? sel.value : ''; // '' = chưa chọn
    return { tennv, diadiem };
}


// Kiểm tra UI đã có ảnh hay chưa (không gọi DB)
function uiHasProductImage() {
    const img = document.getElementById('productImage');
    return !!(img && img.complete && img.naturalWidth > 0);
}

// Sinh số HĐ (lấy max theo prefix rồi +1; 5 chữ số)
async function getNextSohd(diadiem) {
    const prefix = SOHD_PREFIX(diadiem);
    const { data, error } = await supabase.from('dathang')
        .select('sohd').ilike('sohd', `${prefix}%`)
        .order('sohd', { ascending: false }).limit(1);
    if (error) throw error;

    let next = 1;
    if (data && data.length) {
        const cur = data[0].sohd || '';
        const m = cur.match(/_(\d{1,5})$/);
        if (m) next = parseInt(m[1], 10) + 1;
    }
    return `${prefix}${PAD5(next)}`;
}

// Mở popup đặt hàng (đổ sẵn dữ liệu và focus đúng ô)
async function openDatHangPopup() {
    const { tennv, diadiem } = getCurrentUserInfo();
    if (!tennv || !diadiem) { showToast('⚠️ Chưa đăng nhập địa điểm/nhân viên!', 'warn'); return; }

    // phải có đúng 1 sản phẩm đang hiển thị
    if (!CURRENT_MASP) { showToast('⚠️ Vui lòng tìm đúng 1 sản phẩm!', 'warn'); return; }

    // yêu cầu có ảnh trên UI
    if (!uiHasProductImage()) {
        // NEW: nếu đang auto-flow, KHÔNG cảnh báo/không click input, chỉ return (caller sẽ gọi lại sau khi ảnh sẵn sàng)
        if (_orderAutoFlow) return;

        showToast('⚠️ Sản phẩm chưa có ảnh. Hãy chụp/chọn và Lưu ảnh trước!', 'warn');
        document.getElementById('imgFileInput')?.click();
        return;
    }

    // sinh số HĐ
    const sohd = await getNextSohd(diadiem).catch(() => null);
    if (!sohd) { showToast('❌ Không sinh được số HĐ!', 'warn'); return; }

    // đổ dữ liệu
    document.getElementById('dhSohd').value = sohd;
    document.getElementById('dhMasp').value = CURRENT_MASP || '';
    document.getElementById('dhMau').value = '';
    document.getElementById('dhConSize').value = '';
    document.getElementById('dhHetSize').value = '';
    document.getElementById('dhGhichu').value = '';

    // mở popup + focus vào ô Màu
    document.getElementById('popupDatHang').style.display = 'block';
    setTimeout(() => document.getElementById('dhMau')?.focus(), 0);
}

// ===== MỞ POPUP ĐẶT HÀNG CHO 1 MÃ TRONG CHẾ ĐỘ NHIỀU MÃ =====
// ===== MỞ POPUP ĐẶT HÀNG CHO 1 MÃ (hỗ trợ cả 1-mã & nhiều-mã) =====
window.openDatHangFor = async function (masp, anchorEl) {
    const { tennv, diadiem } = getCurrentUserInfo();
    if (!tennv || !diadiem) { showToast('⚠️ Chưa đăng nhập địa điểm/nhân viên!', 'warn'); return false; }

    CURRENT_MASP = (masp || '').toUpperCase();

    // 1) Thử tìm ảnh ngay trong block (nhiều mã)
    let hasImg = false;
    let block = anchorEl ? anchorEl.closest('.detail-grid') : null;
    if (block) {
        const imgEl = block.querySelector('.img-wrap img');
        hasImg = !!(imgEl && imgEl.complete && imgEl.naturalWidth > 0);
    } else {
        // 2) Không ở chế độ nhiều mã → fallback về ảnh lớn của trang (1 mã)
        hasImg = uiHasProductImage();
    }

    if (!hasImg) {
        if (isDesktopDevice()) {
            // Cho phép đặt hàng không ảnh khi dùng máy tính
            showToast('ℹ️ Đặt hàng trên máy tính: cho phép không có ảnh sản phẩm.', 'ok');
        } else {
            // Điện thoại: vẫn buộc chụp/chọn ảnh trước
            setProductImageByMasp(CURRENT_MASP);
            _orderAutoFlow = true; // lưu xong tự mở popup
            document.getElementById('imgFileInput')?.click();
            return false;
        }
    }


    // Sinh số HĐ & mở popup
    const sohd = await getNextSohd(diadiem).catch(() => null);
    if (!sohd) { showToast('❌ Không sinh được số HĐ!', 'warn'); return; }

    document.getElementById('dhSohd').value = sohd;
    document.getElementById('dhMasp').value = CURRENT_MASP;
    document.getElementById('dhMau').value = '';
    document.getElementById('dhConSize').value = '';
    document.getElementById('dhHetSize').value = '';
    document.getElementById('dhGhichu').value = '';

    document.getElementById('popupDatHang').style.display = 'block';
    setTimeout(() => document.getElementById('dhMau')?.focus(), 0);
    return true;
};

function closeDatHangPopup() {
    document.getElementById('popupDatHang').style.display = 'none';
}

// --- Popup Màu (chọn một) ---
async function openPickMau() {
    const wrap = document.getElementById('mauList');
    wrap.innerHTML = '<div style="padding:10px">Đang tải...</div>';
    document.getElementById('popupPickMau').style.display = 'block';
    const { data, error } = await supabase.from('dmmausac').select('tenmau').order('tenmau');
    if (error) { wrap.innerHTML = '<div style="padding:10px;color:red">Lỗi tải danh mục màu</div>'; return; }
    wrap.innerHTML = (data || []).map(r =>
        `<div class="row" style="padding:8px 10px;border-bottom:1px solid #eee;cursor:pointer"
          onclick="document.getElementById('dhMau').value='${(r.tenmau || '').replace(/'/g, "\\'")}';
                   document.getElementById('popupPickMau').style.display='none';
                   document.getElementById('dhConSize').focus();">
       ${r.tenmau || ''}
     </div>`
    ).join('');
}

// --- Popup Size (đa chọn, chung cho Còn/Hết) ---
let SIZE_PICK_TARGET = null;     // 'con' | 'het'
let SIZE_PICK_SELECTED = new Set();
let SIZE_PICK_DATA = [];

function renderSizeList(filter = '') {
    const list = document.getElementById('sizeList');
    const q = (filter || '').toLowerCase();
    const rows = SIZE_PICK_DATA.filter(x => !q || (x.size || '').toLowerCase().includes(q));
    list.innerHTML = rows.map(x => {
        const key = x.size || '';
        const on = SIZE_PICK_SELECTED.has(key);
        return `<div onclick="togglePickSize('${key.replace(/'/g, "\\'")}')"
                 style="padding:8px 10px;border-bottom:1px solid #eee;cursor:pointer;display:flex;justify-content:space-between;">
              <span>${key}</span>
              <span>${on ? '✓' : ''}</span>
            </div>`;
    }).join('') || '<div style="padding:10px">Không có dữ liệu</div>';
}

window.togglePickSize = function (key) {
    if (SIZE_PICK_SELECTED.has(key)) SIZE_PICK_SELECTED.delete(key);
    else SIZE_PICK_SELECTED.add(key);
    renderSizeList(document.getElementById('sizeFilter').value);
};

async function openPickSize(which) {
    SIZE_PICK_TARGET = which; // 'con' | 'het'
    SIZE_PICK_SELECTED = new Set();
    document.getElementById('popupPickSize').style.display = 'block';
    document.getElementById('sizeFilter').value = '';
    document.getElementById('sizeFilter').oninput = (e) => renderSizeList(e.target.value);

    const { data, error } = await supabase.from('dm_size').select('size').order('size');
    if (error) { document.getElementById('sizeList').innerHTML = '<div style="padding:10px;color:red">Lỗi tải danh mục size</div>'; return; }
    SIZE_PICK_DATA = data || [];
    renderSizeList('');
}

function closePickSizeAndFill() {
    const arr = Array.from(SIZE_PICK_SELECTED);
    const val = arr.join(', ');
    if (SIZE_PICK_TARGET === 'con') document.getElementById('dhConSize').value = val;
    else if (SIZE_PICK_TARGET === 'het') document.getElementById('dhHetSize').value = val;
    document.getElementById('popupPickSize').style.display = 'none';
    if (SIZE_PICK_TARGET === 'con') document.getElementById('dhHetSize').focus();
    else document.getElementById('dhGhichu').focus();
}

// Tách chuỗi size bởi dấu phẩy, chấm, chấm phẩy, gạch chéo hoặc khoảng trắng
function splitSizes(raw) {
    if (!raw) return [];
    return String(raw)
        .split(/[,\.;\/\s]+/g)
        .map(s => s.trim())
        .filter(Boolean);
}


// --- Lưu đặt hàng ---
// --- Lưu đặt hàng (tách HẾT SIZE thành nhiều dòng) ---
// Lưu đặt hàng: mỗi size -> một hóa đơn (sohd khác nhau)
async function saveDatHang() {
    const { tennv, diadiem } = getCurrentUserInfo();
    const sohdPreview = (document.getElementById('dhSohd').value || '').trim(); // chỉ là gợi ý
    const masp = (document.getElementById('dhMasp').value || '').trim().toUpperCase();
    const mau = (document.getElementById('dhMau').value || '').trim();
    const conSize = (document.getElementById('dhConSize').value || '').trim();
    const hetRaw = (document.getElementById('dhHetSize').value || '').trim();
    const ghichu = (document.getElementById('dhGhichu').value || '').trim();

    if (!tennv || !diadiem) { showToast('⚠️ Chưa đăng nhập!', 'warn'); return; }
    if (!masp) { showToast('❌ Thiếu mã SP!', 'warn'); return; }
    if (!mau) { showToast('⚠️ Chưa chọn/nhập màu!', 'warn'); return; }

    // Máy tính: cho phép không có ảnh; Điện thoại: bắt buộc có ảnh
    if (!isDesktopDevice() && !uiHasProductImage(masp)) {
        showToast('⚠️ Chưa có ảnh trên giao diện! Hãy chụp/chọn & lưu ảnh trước.', 'warn');
        return;
    }

    // Tách nhiều size bởi , . ; / hoặc khoảng trắng
    const sizes = (typeof splitSizes === 'function' ? splitSizes(hetRaw) :
        String(hetRaw).split(/[,\.;\/\s]+/).map(s => s.trim()).filter(Boolean));
    if (!sizes.length) { showToast('⚠️ Cần nhập Hết size!', 'warn'); return; }

    // Lưu tuần tự: mỗi size xin 1 số HĐ mới và insert 1 dòng
    let okCount = 0, failCount = 0, firstSohdUsed = null;

    for (let i = 0; i < sizes.length; i++) {
        const sz = sizes[i];
        let useSohd = null;
        let attempts = 0;

        while (attempts < 3) {
            try {
                // size đầu tiên ưu tiên dùng số HĐ đang hiển thị (nếu trống sẽ xin mới)
                if (attempts === 0 && i === 0 && sohdPreview) {
                    useSohd = sohdPreview;
                } else {
                    useSohd = await getNextSohd(diadiem); // sinh số mới theo cơ sở
                }

                const row = {
                    sohd: useSohd,
                    diadiem,
                    masp,
                    mau,
                    con_size: conSize || null,
                    het_size: sz,
                    tennv,
                    ghichu: ghichu || null,
                };

                const { error } = await supabase.from('dathang').insert(row);
                if (!error) {
                    okCount++;
                    if (!firstSohdUsed) firstSohdUsed = useSohd;
                    break; // xong size này
                }

                // Nếu trùng số HĐ (23505) -> thử xin số mới và lặp lại
                const msg = (error.message || '').toLowerCase();
                if (msg.includes('duplicate') || msg.includes('23505')) {
                    attempts++;
                    continue;
                } else {
                    console.error('Insert failed:', error);
                    failCount++;
                    break;
                }
            } catch (e) {
                console.error('Insert exception:', e);
                attempts++;
                if (attempts >= 3) failCount++;
            }
        }
    }

    if (okCount > 0) {
        showToast(`✅ Đã lưu ${okCount} hóa đơn (mỗi size 1 số HĐ).`, 'ok');
        closeDatHangPopup();
        // cập nhật số HĐ gợi ý cho lần kế tiếp
        try {
            const nextSohd = await getNextSohd(diadiem);
            document.getElementById('dhSohd').value = nextSohd;
        } catch { }
    }
    if (failCount > 0) {
        showToast(`⚠️ Có ${failCount} dòng không lưu được. Kiểm tra console.`, 'warn');
    }

    // reset các ô nhập trong popup (tuỳ ý)
    document.getElementById('dhMau').value = '';
    document.getElementById('dhConSize').value = '';
    document.getElementById('dhHetSize').value = '';
    document.getElementById('dhGhichu').value = '';
}


