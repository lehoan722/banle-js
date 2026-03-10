
// hoadon.js - phiên bản cải tiến: tự fetch mã nếu thiếu và tránh mở popup nếu đã có
import { capNhatBangHTML, resetFormBang, resetFormSauKhiNhapSize } from './bangketqua.js';

import { supabase } from './supabaseClient.js';
import { tinhKhuyenMai } from './khuyenmai.js';

function _data() {
    return (window.bangKetQua && Object.keys(window.bangKetQua).length)
        ? window.bangKetQua
        : bangKetQua;
}
function _sync(obj) {
    window.bangKetQua = obj;
    bangKetQua = obj;
}

// === Ensure: nếu dữ liệu vừa dán/sửa trực tiếp trên bảng DOM, đồng bộ về state trước khi thao tác
// === Ensure: nếu dữ liệu vừa dán/sửa trực tiếp trên bảng DOM,
// đồng bộ về state trước khi thao tác
function ensureStateFromDOM() {
    try { window.capNhatBangKetQuaTuDOM?.(); } catch (_) { }
    // CHỐT: nếu popup/Import đã cập nhật window.bangKetQua thì nhập về biến module luôn
    try {
        if (window.bangKetQua && typeof window.bangKetQua === 'object') {
            _sync(window.bangKetQua); // giữ 1 nguồn sự thật cho mọi hàm trong module
        }
    } catch (_) { }
}

// Cho phép module khác (popupNgang) chủ động sync từ window vào biến module
window.hoadonSyncFromWindow = () => {
    try { _sync(window.bangKetQua || {}); } catch (_) { }
};


// === BRANCH RESOLVER (ưu tiên tên trang/biến toàn cục), Fallback: localStorage (tương thích cũ) ===
function currentBranchUpper() {
    // 1) Ưu tiên window.diadiem do trang đã cài cứng (banlemtcs111: "cs1")
    try {
        const w = (window.diadiem || '').toString().toLowerCase();
        if (w === 'cs1' || w === 'cs2') return w.toUpperCase(); // -> 'CS1' | 'CS2'
    } catch (_) { }

    // 2) Thử ô #diadiem (nếu có sẵn trên trang)
    try {
        const el = document.getElementById('diadiem');
        if (el && /cs[12]/i.test(el.value)) return el.value.toUpperCase();
    } catch (_) { }

    // 3) Fallback tạm thời: localStorage (giữ an toàn cho trang cũ chưa đặt window.diadiem)
    try {
        const ls = (localStorage.getItem('diadiem') || '').toLowerCase();
        if (ls === 'cs1' || ls === 'cs2') return ls.toUpperCase();
    } catch (_) { }

    // 4) Mặc định an toàn
    return 'CS1';
}

// === GỢI Ý SIZE TỪ HÓA ĐƠN NHÂN VIÊN (bannvcs1_, bannvcs2_) ===
// === GỢI Ý SIZE TỪ HÓA ĐƠN NHÂN VIÊN (bannvcs1_, bannvcs2_) ===
// === GỢI Ý SIZE TỪ HÓA ĐƠN NHÂN VIÊN (bannvcs1_, bannvcs2_) ===
// Quy tắc:
// - Chỉ xét các dòng nhân viên trong 1 giờ gần nhất, used_for_mt = false
// - Nếu không có dòng nào -> không gợi ý
// - Nếu có > 1 dòng (kể cả cùng size hay khác size):
//     + KHÔNG gợi ý
//     + Đánh dấu used_for_mt = true cho TẤT CẢ các dòng đó (dọn rác mạnh tay)
// - Nếu CHỈ CÓ 1 dòng hợp lệ:
//     + Gợi ý size của dòng đó
//     + Đồng thời đánh dấu used_for_mt = true cho dòng đó (mỗi dòng dùng 1 lần)
// === GỢI Ý SIZE TỪ HÓA ĐƠN NHÂN VIÊN (bannvcs1_, bannvcs2_) ===
// Phiên bản READ-ONLY: chỉ đọc dữ liệu tư vấn, KHÔNG cập nhật used_for_mt.
// Quy tắc:
// - Chỉ xét các dòng nhân viên trong 1 giờ gần nhất, used_for_mt = false
// - Lọc những dòng có size hợp lệ (khác rỗng)
// - Nếu không có dòng nào -> không gợi ý
// - Nếu có TỪ 2 DÒNG TRỞ LÊN (kể cả cùng size hay khác size) -> không gợi ý
// - Chỉ khi CÓ ĐÚNG 1 DÒNG hợp lệ trong 1h -> trả về size của dòng đó
async function goiYSizeTuHoaDonNhanVien(maspBase) {
    const masp = String(maspBase || "").trim().toUpperCase();
    if (!masp) return null;

    // Xác định prefix hóa đơn nhân viên theo CƠ SỞ, ưu tiên URL trang bán lẻ MT
    const path = (location.pathname || "").toLowerCase();
    let prefix;

    if (path.includes("banlemtcs2")) {
        // Trang bán lẻ MT cơ sở 2 → chỉ lấy từ bannvcs2_
        prefix = "bannvcs2_";
    } else if (path.includes("banlemtcs1")) {
        // Trang bán lẻ MT cơ sở 1 → chỉ lấy từ bannvcs1_
        prefix = "bannvcs1_";
    } else {
        // Các trang khác fallback theo currentBranchUpper (giữ an toàn cho logic cũ)
        const branch = currentBranchUpper(); // 'CS1' | 'CS2'
        prefix = branch === "CS2" ? "bannvcs2_" : "bannvcs1_";
    }

    try {
        const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from("ct_hoadon_banle")
            .select("id, size, sohd, created_at, used_for_mt")
            .eq("masp", masp)
            .like("sohd", `${prefix}%`)
            .gte("created_at", oneHourAgoIso)
            .eq("used_for_mt", false)
            .order("id", { ascending: false })
            .limit(50);

        if (error) {
            console.error("Gợi ý size từ HĐ nhân viên lỗi:", error);
            return null;
        }

        if (!data || !data.length) return null;

        // Chỉ lấy những dòng có size hợp lệ
        const validRows = data.filter((r) => {
            const s = r && r.size != null ? String(r.size).trim() : "";
            return s !== "";
        });

        if (!validRows.length) return null;

        // Nếu có từ 2 dòng trở lên (kể cả trùng size) → không gợi ý gì
        if (validRows.length > 1) {
            return null;
        }

        // Đến đây chắc chắn chỉ có 1 dòng hợp lệ
        const row = validRows[0];
        const sizeStr = String(row.size || "").trim();
        if (!sizeStr) return null;

        return sizeStr;
    } catch (err) {
        console.error("Lỗi goiYSizeTuHoaDonNhanVien:", err);
        return null;
    }
}

export let bangKetQua = {};

// Trong hoadon.js
let maspDangChon = null;
export function setMaspspDangChon(obj) {
    maspDangChon = obj; // obj = {masp, size}
}
export function getMaspspDangChon() {
    return maspDangChon;
}

function toInt(v) {
    if (v == null) return 0;
    return parseInt(String(v).replace(/[.,\s]/g, ""), 10) || 0;
}

function parseMoneyInt(v) {
    if (v == null) return 0;
    // bỏ dấu phẩy, chấm, khoảng trắng
    const s = String(v).trim().replace(/\./g, "").replace(/,/g, "").replace(/\s/g, "");
    const n = parseInt(s, 10);
    return isNaN(n) ? 0 : n;
}

// ===== Phân quyền UI: chỉ ADMIN được sửa giá/khuyến mại/thành tiền =====
function isAdminUser() {
    // Ưu tiên key riêng (tránh cache để không bị sai khi đăng nhập đổi tài khoản mà không reload)
    const v = localStorage.getItem('is_admin');
    if (v != null) {
        const s = String(v).trim().toLowerCase();
        return (s === 'true' || s === '1' || s === 'yes');
    }

    // Fallback: dò trong localStorage xem có object nào chứa is_admin không
    try {
        for (const k of Object.keys(localStorage)) {
            const raw = localStorage.getItem(k);
            if (!raw) continue;
            if (raw[0] !== '{' && raw[0] !== '[') continue;
            const obj = JSON.parse(raw);
            if (obj && typeof obj === 'object' && 'is_admin' in obj) {
                return (obj.is_admin === true || String(obj.is_admin).toLowerCase() === 'true');
            }
        }
    } catch (e) { /* ignore */ }

    return false;
}

function applyRoleLockToPriceFields() {
    const lock = !isAdminUser();
    ['gia', 'khuyenmai', 'thanhtien', 'chietkhau', 'chiet_khau'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        // chỉ khóa khi không phải admin
        el.readOnly = lock;
        if (lock) {
            el.dataset.lockedByRole = '1';
            el.title = 'Chỉ ADMIN được sửa';
        } else {
            delete el.dataset.lockedByRole;
            el.title = '';
        }
    });
}


// === Helper: Sản phẩm có bắt buộc quản lý size không? (GD hoặc quanlykichco=true)
function isQuanLySizeProduct(sp) {
    if (!sp) return false;
    const isGD = String(sp.chungloai || "").trim().toUpperCase() === "GD";
    return isGD || sp.quanlykichco === true;
}

function recalcThanhtienFromForm() {
    const sl = toInt(document.getElementById("soluong")?.value || "1");
    const gia = toInt(document.getElementById("gia")?.value || "0");
    const km = toInt(document.getElementById("khuyenmai")?.value || "0");
    const tt = (gia - km) * sl;
    const ttEl = document.getElementById("thanhtien");
    if (ttEl) ttEl.value = tt.toLocaleString();
}

/***** CCN HELPERS: xác định bối cảnh chuyển chi nhánh *****/
function isCCNMode() {
    const p = (location.pathname || "").toLowerCase();
    const loai = (window.loaihd || "").toLowerCase();
    // Trang CCN thường chứa "ccn"; hoặc loaihd “xcncs1/xcncs2” (phiếu xuất chuyển chi nhánh)
    return p.includes("ccn") || loai === "xcncs1" || loai === "xcncs2";
}

function isNhapMode() {
    // Nhập hàng / nhập tạm / đổi trả... (không áp dụng cho CCN)
    if (isCCNMode()) return false;
    const p = (location.pathname || "").toLowerCase();
    //if (p.includes("nhap") || p.includes("nhaptam") || p.includes("nhapmoi") || p.includes("doitra")) return true;
    if (p.includes("nhapmoi") || p.includes("doitra")) return true;

    const loai = (window.loaihd || "").toLowerCase();
    return loai.startsWith("nm") || loai.startsWith("nt") || loai.startsWith("ndoi") || loai.startsWith("ncn");
}

// SUY RA CHIỀU CHUYỂN (nguồn → đích)
function inferBranches() {
    const loai = (window.loaihd || "").toLowerCase();
    if (loai === "xcncs1") return { src: "CS1", dst: "CS2" }; // xuất CS1 → nhập CS2
    if (loai === "xcncs2") return { src: "CS2", dst: "CS1" }; // xuất CS2 → nhập CS1

    // fallback: lấy từ diadiem hiện tại (nếu có)
    const here = (localStorage.getItem("diadiem") || "").toUpperCase();
    if (here === "CS1") return { src: "CS1", dst: "CS2" };
    if (here === "CS2") return { src: "CS2", dst: "CS1" };
    return { src: "CS1", dst: "CS2" }; // an toàn
}

/* [MỚI] Nhận diện "quản size" theo CHỦNG LOẠI (GD = giày dép) & theo NHÓM (quanlysize + diadiem) */

function resolveGroupKeyFromSP(sp) {
    // Thử lần lượt các tên cột nhóm có thể gặp trong dự án
    const candidates = ["nhomhang", "manhom", "nhom", "group_code", "nhomsp"];
    for (const key of candidates) {
        if (sp && sp[key] != null && String(sp[key]).trim() !== "") {
            return String(sp[key]).toUpperCase().trim();
        }
    }
    return null;
}

function requireManagedAtBranch(masp, branch) {
    const upper = (s) => String(s || "").toUpperCase().trim();
    const sp = window.sanPhamData?.[upper(masp)];
    if (!sp) return false; // thiếu catalog → coi như không quản-size

    // 1) Theo CHỦNG LOẠI: Giày/Dép luôn quản-size
    if (upper(sp.chungloai || "") === "GD") return true;

    // 2) Theo CỜ SẢN PHẨM: dmhanghoa.quanlykichco = true → quản-size (áp cho cả 2 cơ sở)
    if (sp.quanlykichco === true) return true;

    // 3) Theo NHÓM + địa điểm: chỉ quản-size ở cơ sở được chỉ định
    if (!(window.danhMucNhom instanceof Map) || window.danhMucNhom.size === 0) return false;

    const groupKey = resolveGroupKeyFromSP(sp); // <-- CHỐT: lấy manhom/nhomhang linh hoạt
    if (!groupKey) return false;

    const nhom = window.danhMucNhom.get(groupKey);
    if (!nhom || !nhom.quanlysize) return false;

    const dia = String(nhom.diadiem || "ALL").toUpperCase().trim(); // 'ALL' | 'CS1' | 'CS2'
    return dia === "ALL" || dia === upper(branch);
}

// Trong NGỮ CẢNH CCN: chỉ cần một trong hai đầu quản-size là phải nhập size
function requireManagedInTransfer(masp) {
    const branches = inferBranches();
    return (
        requireManagedAtBranch(masp, branches.src) ||
        requireManagedAtBranch(masp, branches.dst)
    );
}

// === BANLE MT HELPERS: xác định bối cảnh bán lẻ MT & gợi ý size từ hóa đơn nhân viên ===
function isBanLeMTMode() {
    const p = (location.pathname || "").toLowerCase();
    const loai = (window.loaihd || "").toLowerCase();

    // Các trang bán lẻ MT chính: banlemtcs1, banlemtcs2
    if (p.includes("banlemtcs1") || p.includes("banlemtcs2")) {
        return true;
    }

    // Dự phòng theo loại hóa đơn nếu sau này bạn có set
    if (loai === "bancs1" || loai === "bancs2") {
        return true;
    }

    return false;
}

// Helper: chỉ ghi size gợi ý vào #size nếu đang trống & vẫn đúng mã
// BẢN MỚI: nếu có size gợi ý hợp lệ → tự động thêm luôn vào bảng kết quả
function autoGoiYSizeNeuOTrong(maspBaseNow) {
    const maspSnap = String(maspBaseNow || "").trim().toUpperCase();
    if (!maspSnap) return;

    const maspAtTime = maspSnap;

    goiYSizeTuHoaDonNhanVien(maspSnap)
        .then((sizeGoiY) => {
            if (!sizeGoiY) return;

            const sizeInput = document.getElementById("size");
            const maspInput = document.getElementById("masp");
            if (!sizeInput || !maspInput) return;

            // Nếu trong lúc chờ, người dùng đã tự gõ size → KHÔNG làm gì
            if (sizeInput.value.trim()) return;

            // Nếu người dùng đã chuyển sang mã khác → KHÔNG làm gì
            const maspCurrent = maspInput.value.trim().toUpperCase();
            if (maspCurrent !== maspAtTime) return;

            // 1) Gán size gợi ý lên form
            const sizeValue = String(sizeGoiY).trim();
            sizeInput.value = sizeValue;

            // 2) Tự động thêm vào bảng kết quả
            const nhapSizeMode =
                document.getElementById("nhapsize")?.checked === true;

            if (nhapSizeMode) {
                // Chế độ nhập size liên tiếp: giữ mã & focus lại #size
                themVaoBang(sizeValue, { afterAdd: "keepMaspFocusSize" });
            } else {
                // Chế độ bình thường: thêm xong reset về #masp
                themVaoBang(sizeValue);
            }

            // Không cần focus/select #size nữa vì themVaoBang đã xử lý focus phù hợp
        })
        .catch((err) => {
            console.error("autoGoiYSizeNeuOTrong lỗi:", err);
        });
}


export async function chuyenFocus(e) {
    if (e.key !== "Enter") return;

    const nhapNhanh = document.getElementById("nhapnhanh").checked;
    const size45 = document.getElementById("size45").checked;

    if (e.target.id === "masp") {
        // Đóng gợi ý MASP ngay khi Enter ở #masp
        window.closePopupMasp && window.closePopupMasp();
        const maspVal = document.getElementById("masp").value.trim().toUpperCase();
        const quanLySizeTheoGia = document.getElementById("quanlysizetheogia")?.checked;
        const thanhCong = await xuLyMaSanPham(quanLySizeTheoGia, maspVal, size45, nhapNhanh);

        // Nếu không thành công → chỉ đưa con trỏ về lại ô MÃ SP (không mở popup)
        if (!thanhCong) {
            const maspInput = document.getElementById("masp");
            if (maspInput) {
                setTimeout(() => {
                    maspInput.focus();
                    maspInput.select();
                }, 600);
            }
        }

    } else if (e.target.id === "soluong") {
        // Đóng gợi ý nếu đang mở
        window.closePopupMasp && window.closePopupMasp();

        const sizeEl = document.getElementById("size");
        if (sizeEl) {
            sizeEl.focus();
            sizeEl.select();   // ✅ bôi đen để gõ tiếp
        }
        return;              // ✅ thoát nhánh cho rõ ràng
    } else if (e.target.id === "size") {
        // Đóng gợi ý MASP ngay khi Enter ở #masp
        window.closePopupMasp && window.closePopupMasp();

        const sizeInput = document.getElementById("size");
        const maspInput = document.getElementById("masp");
        const raw = String(sizeInput.value || "").trim();
        const val = raw.toUpperCase();

        // Danh mục size hợp lệ
        const dsSize = Array.isArray(window.danhMucSize)
            ? window.danhMucSize.map(s => String(s).trim().toUpperCase())
            : [];

        const isValidSize = val && dsSize.includes(val);
        const nhapSizeMode = document.getElementById("nhapsize")?.checked === true; // 🔴 CHẾ ĐỘ NHẬP SIZE LIÊN TIẾP
        ensureStateFromDOM();
        if (nhapSizeMode) {
            // ====== MODE A: Đang bật nhập size liên tiếp ======
            if (isValidSize) {
                // Thêm dòng, GIỮ MÃ SP, focus + select về #size để nhập liên tiếp
                themVaoBang(val, { afterAdd: "keepMaspFocusSize" });
                return;
            }

            // Không phải size hợp lệ nhưng >= 3 ký tự -> coi là MÃ SP MỚI
            if (val.length >= 3) {
                maspInput.value = layMaspGoc(val);   // ghi thẳng sang #masp (mã gốc, bỏ hậu tố)
                sizeInput.value = "";                 // xóa size vừa gõ
                // Giả lập Enter ở ô masp để tái sử dụng luồng xử lý mã
                const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
                maspInput.dispatchEvent(ev);
                return;
            }

            // Không hợp lệ và < 3 ký tự -> báo lỗi + focus lại #size
            alert("Bạn phải nhập size hợp lệ hoặc gõ một mã sản phẩm (từ 3 ký tự).");
            sizeInput.focus();
            sizeInput.select();
            return;

        } else {
            // ====== MODE B: Không bật nhập size liên tiếp (an toàn) ======
            if (isValidSize) {
                // Thêm dòng, SAU ĐÓ focus + select về #masp để nhập mã mới
                themVaoBang(val); // dùng luồng mặc định -> resetFormBang() sẽ focus #masp
                return;
            }

            // Không hợp lệ (dài hay ngắn đều coi là sai) -> chỉ báo lỗi + ở lại #size
            alert("Size không hợp lệ! Chỉ cho phép nhập: 38 -> 45");
            sizeInput.focus();
            sizeInput.select();
            return;
        }
    } else if (e.target.id === "khuyenmai") {
        // Chuẩn hoá khuyến mại: <=100 coi là %, >100 là tiền; cập nhật lại #thanhtien 
        const gia = parseInt((document.getElementById("gia")?.value || "0").replace(/[.,\s]/g, ""), 10) || 0;
        let km = parseFloat(String(document.getElementById("khuyenmai").value).replace(/\./g, "").replace(/,/g, "."));
        if (!isFinite(km)) km = 0;
        km = km <= 100 ? Math.round(gia * (km / 100)) : Math.round(km);
        document.getElementById("khuyenmai").value = km.toLocaleString();

        recalcThanhtienFromForm();

        // 🔑 Thay vì gọi themVaoBang → giả lập Enter trên #size
        const sizeInput = document.getElementById("size");
        if (sizeInput) {
            const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
            sizeInput.dispatchEvent(ev);
        }
        return;

    } else if (e.target.id === "gia") {
        const gia = parseInt((document.getElementById("gia")?.value || "0").replace(/[.,\s]/g, ""), 10) || 0;
        document.getElementById("gia").value = gia.toLocaleString();

        let kmIn = String(document.getElementById("khuyenmai").value).trim();
        let km = parseFloat(kmIn.replace(/\./g, "").replace(/,/g, "."));
        if (!isFinite(km)) km = 0;
        km = km <= 100 ? Math.round(gia * (km / 100)) : Math.round(km);
        document.getElementById("khuyenmai").value = km.toLocaleString();

        recalcThanhtienFromForm();

        // 🔑 Giả lập Enter trên #size
        const sizeInput = document.getElementById("size");
        if (sizeInput) {
            const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
            sizeInput.dispatchEvent(ev);
        }
        return;
    }

}

function layMaspGoc(str) {
    return String(str || "").toUpperCase().replace(/\(\d+\)\s*$/, "").trim();
}

// [MỚI] Tách mã & size hậu tố: "ABC12-DG38_38" -> { masp:"ABC12-DG38", size:"38" }
function tachMaspVaSizeHauTo(raw) {
    const s = String(raw || "").trim().toUpperCase();
    // Nhận "_xxx" ở cuối. Ví dụ "…_38", "…_40", "…_L", v.v.
    const m = s.match(/^(.*)\_([A-Z0-9\-]+)$/);
    if (!m) return { masp: s, size: null };
    return { masp: m[1], size: m[2] };
}

// === REPLACE THIS WHOLE FUNCTION IN hoadon.js ===
async function xuLyMaSanPham(quanlysizetheogia, maspVal, size45, nhapNhanh) {

    // --- [NEW SIZE SUFFIX] Tách hậu tố _NN (ví dụ abc12-dg38_38) ---
    // Lấy danh sách size hợp lệ: ưu tiên window.danhMucSize, fallback 38–45
    const allowedFromDM = Array.isArray(window.danhMucSize)
        ? new Set(window.danhMucSize.map(s => String(s).trim().toUpperCase()))
        : null;
    const fallbackAllowed = new Set(["38", "39", "40", "41", "42", "43", "44", "45"]);

    let typedSize = null;
    let baseCode = String(maspVal || "").trim().toUpperCase();
    const mSuffix = baseCode.match(/^(.*)_([0-9]{2})$/); // bắt hậu tố _NN
    if (mSuffix) {
        const candidate = mSuffix[2].toUpperCase();
        const ok = allowedFromDM ? allowedFromDM.has(candidate) : fallbackAllowed.has(candidate);
        if (ok) {
            baseCode = mSuffix[1].trim().toUpperCase(); // mã gốc
            typedSize = candidate;                      // size người dùng gõ
            // Ghi sẵn về form để các nhánh dưới dùng
            const maspEl = document.getElementById("masp");
            const sizeEl = document.getElementById("size");
            if (maspEl) maspEl.value = baseCode;
            if (sizeEl) sizeEl.value = typedSize;
        }
    }
    // Chuẩn hoá kiểu "MASP(3)" → "MASP"
    maspVal = layMaspGoc(baseCode);

    // --- Tải dữ liệu sản phẩm (cache trước, supabase sau) ---
    let spData = window.sanPhamData?.[maspVal];

    if (!spData) {
        const { data, error } = await supabase
            .from("dmhanghoa")
            .select("*")
            .eq("masp", maspVal)
            .single();

        if (data) {
            spData = data;
            window.sanPhamData[maspVal] = data; // cache lại
        }
    }

    // Guard dữ liệu nền
    if (!window.sanPhamData || !Object.keys(window.sanPhamData).length) {
        alert("Đang tải danh mục sản phẩm... vui lòng thử lại sau 1–2 giây.");
        const maspInput = document.getElementById("masp");
        if (maspInput) { setTimeout(() => { maspInput.focus(); maspInput.select(); }, 600); }
        return false;
    }
    // BẢO VỆ MỀM với danh mục nhóm: luôn là Map, rỗng thì coi như "không quản size theo nhóm"
    if (!(window.danhMucNhom instanceof Map)) {
        window.danhMucNhom = new Map();
        // thử reload nền nếu có expose
        try { window.reloadDanhMucNhom?.(); } catch (e) { }
    }
    // KHÔNG alert, KHÔNG return; tiếp tục xử lý bình thường

    // (danhMucSize có thể rỗng)

    /***** NHÁNH SỚM CHO CCN: nếu ít nhất một đầu quản-size → bắt nhập size *****/
    if (isCCNMode()) {
        try {
            if (requireManagedInTransfer(maspVal) || isQuanLySizeProduct(spData)) {  // ✅ thêm vế phải isQuanLySizeProduct
                // Nếu người dùng có gõ hậu tố size thì đã điền sẵn #size ở trên
                const sizeEl = document.getElementById("size");
                if (!sizeEl.value.trim()) {
                    // Focus & bíp như cũ
                    sizeEl.focus();
                    sizeEl.select?.();
                    window.soundWaitSize?.();
                    return true; // chỉ bắt nhập size tay, KHÔNG gợi ý

                    // 🔔 Gợi ý size từ hóa đơn nhân viên bannvcs1_/bannvcs2_
                    // Chạy bất đồng bộ, KHÔNG chặn người dùng gõ tay
                    const maspBaseNow = String(baseCode || maspVal || "").trim().toUpperCase();
                    const maspAtTime = maspBaseNow; // chụp lại mã tại thời điểm này

                    goiYSizeTuHoaDonNhanVien(maspBaseNow)
                        .then((sizeGoiY) => {
                            if (!sizeGoiY) return;

                            const sizeInput = document.getElementById("size");
                            const maspInput = document.getElementById("masp");
                            if (!sizeInput || !maspInput) return;

                            // Nếu trong lúc chờ, người dùng đã gõ size → KHÔNG ghi đè
                            if (sizeInput.value.trim()) return;

                            // Nếu đã chuyển sang mã sản phẩm khác → KHÔNG ghi đè
                            const maspCurrent = maspInput.value.trim().toUpperCase();
                            if (maspCurrent !== maspAtTime) return;

                            // Gán size gợi ý + bôi đen để nhấn Enter là xong
                            sizeInput.value = sizeGoiY;
                            sizeInput.focus();
                            sizeInput.select?.();
                        })
                        .catch((err) => {
                            console.error("Gợi ý size từ hóa đơn nhân viên lỗi:", err);
                        });

                    return true; // đợi người dùng nhập size hoặc nhấn Enter với size gợi ý
                }

                // Có size rồi → ép SL=1 và thêm ngay
                const slEl = document.getElementById("soluong");
                if (!slEl.value || parseInt(slEl.value, 10) <= 0) slEl.value = "1";

                const nhapSizeMode = document.getElementById("nhapsize")?.checked === true;
                if (nhapSizeMode) {
                    themVaoBang(sizeEl.value.trim(), { afterAdd: "keepMaspFocusSize" });
                } else {
                    themVaoBang(sizeEl.value.trim()); // mặc định: reset về #masp
                }
                return true;
            }
        } catch (e) {
            console.warn("CCN size-check fallback:", e);
        }
    }

    // Không tìm thấy sp
    if (!spData) {
        alert("❌ Mã sản phẩm không hợp lệ. Vui lòng nhập lại.");
        const maspInput = document.getElementById("masp");
        if (maspInput) {
            setTimeout(() => { maspInput.focus(); maspInput.select(); }, 600);
        }
        return false;
    }

    // [NEW giữ nguyên] Chuẩn hoá form từ spData
    const giaEl = document.getElementById("gia");
    const kmEl = document.getElementById("khuyenmai");
    const giaNguon = isNhapMode() ? (spData.gianhap || 0) : (spData.giale || 0);
    const giaInt = Math.round(parseMoneyInt(giaNguon));
    giaEl.value = giaInt.toLocaleString();

    // Nhập hàng: không tự động chèn khuyến mại
    let kmDef = 0;
    if (!isNhapMode()) {
        kmDef = tinhKhuyenMai(spData, giaInt) || 0;
    }
    kmEl.value = (kmDef || 0).toLocaleString();

    const slEl = document.getElementById("soluong");
    if (!slEl.value || parseInt(slEl.value, 10) <= 0) slEl.value = "1";
    recalcThanhtienFromForm();

    // vị trí kho theo cơ sở
    const cs = document.getElementById("diadiem").value;
    const vitri = cs === "cs1" ? spData.vitrikho1 : spData.vitrikho2;
    document.getElementById("vitri").value = vitri || "";

    // -------------- [NEW SIZE SUFFIX] TỰ ĐỘNG THÊM NẾU CÓ HẬU TỐ --------------
    // Tính xem hàng này hiện tại có thuộc diện "quản size" không
    const isGD = String(spData.chungloai || "").trim().toUpperCase() === "GD";
    const isQLSize = isQuanLySizeProduct(spData);   // ✅ mới
    const giaHangHoa = Number(spData.giale) || 0;

    // trạng thái checkbox hiện tại
    const size45On = !!size45;
    const qlSizeTheoGiaOn = !!quanlysizetheogia;
    const qlTheoNhomOn = !!document.getElementById("quanlysizetheonhom")?.checked;

    // nhóm có quanlysize hợp lệ tại cơ sở?
    let groupRequires = false;
    if (qlTheoNhomOn && spData.nhomhang && window.danhMucNhom) {
        const nhom = window.danhMucNhom.get(String(spData.nhomhang).toUpperCase());
        if (nhom && nhom.quanlysize) {
            const diadiemHienTai = currentBranchUpper(); // 'CS1'|'CS2'
            groupRequires = (nhom.diadiem === "ALL" || nhom.diadiem === diadiemHienTai);
        }
    }

    // theo giá: siết nếu là giày hoặc giá ≥ 170000
    const managedByGia = qlSizeTheoGiaOn && (isQLSize || giaHangHoa >= 170000);  // ✅ dùng isQLSize

    // Tổng điều kiện cần quản-size (size45 bật thì ép cho mọi mã quản-size)
    const requireManagedSizeNow = (size45On && isQLSize) || groupRequires || managedByGia; // ✅ dùng isQLSize
    // 👉 Nếu đang ở trang BÁN LẺ MT (không phải CCN),
    // và mã hàng này thuộc diện QUẢN SIZE,
    // và ô #size hiện đang trống → chạy gợi ý size từ hóa đơn nhân viên bannvcs1_/bannvcs2_
    if (!isCCNMode() && isBanLeMTMode() && requireManagedSizeNow) {
        const sizeEl = document.getElementById("size");
        if (sizeEl && !sizeEl.value.trim()) {
            autoGoiYSizeNeuOTrong(baseCode || maspVal);
        }
    }

    // --- thay thế toàn bộ khối này trong xuLyMaSanPham ---
    if (typedSize) {
        const sizeEl = document.getElementById("size");
        const sizeChosen = String(typedSize).trim();
        const nhapSizeMode = document.getElementById("nhapsize")?.checked === true;

        if (requireManagedSizeNow) {
            // → Hàng QUẢN-SIZE: thêm đúng size người dùng chọn
            if (sizeEl) sizeEl.value = sizeChosen;
            if (!slEl.value || parseInt(slEl.value, 10) <= 0) slEl.value = "1";

            if (nhapSizeMode) {
                themVaoBang(sizeChosen, { afterAdd: "keepMaspFocusSize" }); // giữ ở #size để nhập tiếp
            } else {
                themVaoBang(sizeChosen); // reset về #masp như yêu cầu
            }
            return true;
        } else {
            // → Hàng KHÔNG QUẢN-SIZE: bỏ hậu tố, thêm với size=0
            if (sizeEl) sizeEl.value = "0";
            if (!slEl.value || parseInt(slEl.value, 10) <= 0) slEl.value = "1";
            themVaoBang("0"); // mặc định: resetFormBang() → focus #masp
            return true;
        }
    }
    // --- hết khối thay thế ---
    // ------------------- END [NEW SIZE SUFFIX] -------------------

    // ===== QUẢN LÝ SIZE THEO NHÓM (giữ nguyên hành vi cũ) =====
    var checkboxQuanLySizeTheoNhom = document.getElementById("quanlysizetheonhom");
    var qlTheoNhom = (checkboxQuanLySizeTheoNhom && checkboxQuanLySizeTheoNhom.checked) ? true : false;

    if (qlTheoNhom && String(spData.nhomhang || "").trim() && window.danhMucNhom) {
        const nhom = window.danhMucNhom.get(String(spData.nhomhang).toUpperCase());
        if (nhom && nhom.quanlysize) {
            const diadiemHienTai = currentBranchUpper();
            if (nhom.diadiem === "ALL" || nhom.diadiem === diadiemHienTai) {
                const sizeInput = document.getElementById("size");
                const sizeValue = (sizeInput?.value || "").trim();
                if (!sizeValue) {
                    sizeInput.focus();
                    sizeInput.select();
                    if (window.soundWaitSize) window.soundWaitSize();
                    return true;
                } else {
                    document.getElementById("soluong").value = 1;
                    themVaoBang(sizeValue, { afterAdd: "keepMaspFocusSize" });
                    return true;
                }
            }
        }
    }

    // ==== BÁN SIÊU NHANH (giữ nguyên) ====
    const banSieuNhanh = document.getElementById("bansieunhanh")?.checked;
    if (banSieuNhanh) {
        document.getElementById("soluong").value = "1";
        document.getElementById("size").value = "0";
        themVaoBang("");
        document.getElementById("masp").focus();
        document.getElementById("masp").select();
        return true;
    }

    // === BẮT NHẬP SIZE VỚI GIÀY DÉP KHI BẬT CỜ (giữ nguyên) ===
    if (
        quanlysizetheogia &&
        ((spData.chungloai && spData.chungloai.toLowerCase() === "gd") || (Number(spData.giale) >= 170000))
    ) {
        const sizeInput = document.getElementById("size");
        if (!sizeInput.value.trim()) {
            sizeInput.focus();
            sizeInput.select();
            window.soundWaitSize?.();
            return true;
        }
        document.getElementById("soluong").value = "1";
        themVaoBang(sizeInput.value.trim(), { afterAdd: "keepMaspFocusSize" });
        return true;
    }

    if (size45 && isQuanLySizeProduct(spData)) {
        const sizeInput = document.getElementById("size");
        if (!sizeInput.value.trim()) {
            sizeInput.focus();
            sizeInput.select();
            window.soundWaitSize?.(); // 🔔 Beep chờ size — giữ nguyên như GD
            return true;
        }
        document.getElementById("soluong").value = "1";
        themVaoBang(sizeInput.value.trim(), { afterAdd: "keepMaspFocusSize" });
        return true;
    }

    // === Các trường hợp khác (giữ nguyên) ===
    if (size45) {
        if (isQuanLySizeProduct(spData)) {
            // hàng quản-size (GD hoặc quanlykichco) thì KHÔNG chèn "0"
            const sizeEl = document.getElementById("size");
            sizeEl.focus(); sizeEl.select?.();
            return true;
        }
        document.getElementById("soluong").value = "1";
        themVaoBang("0"); // chỉ dành cho hàng KHÔNG quản-size
    } else {
        const nextId = nhapNhanh ? "size" : "soluong";
        const nextInput = document.getElementById(nextId);
        nextInput.focus();
        nextInput.select();
        if (nextId === "soluong") nextInput.select();
    }

    return true;
}

export function themVaoBang(forcedSize = null, opts = {}) {
    // luôn đóng popup ngay khi bắt đầu thêm
    window.closePopupMasp && window.closePopupMasp();
    // 🔒 CHỐT: luôn đồng bộ state từ DOM (trường hợp vừa dán Excel / nhập ngang / edit trực tiếp)
    ensureStateFromDOM();
    const masp = layMaspGoc(document.getElementById("masp").value);
    const isNewGroup = !bangKetQua[masp]; // 🔔 nhóm mới hay không

    let size = forcedSize !== null ? String(forcedSize).trim()
        : String(document.getElementById("size").value).trim();
    const soluong = parseInt(document.getElementById("soluong").value.trim()) || 1;

    const sp = window.sanPhamData?.[masp];

    // --- Kiểm tra trạng thái bán siêu nhanh ---
    const banSieuNhanh = document.getElementById("bansieunhanh")?.checked;

    // quản lý việc tất cả các mã hàng thuộc điều kiện quản lý theo size thì
    //  không được phép nhập sai bằng 0 chỉ được phép nhập (38–45):    
    // ===== CỬA CUỐI: khóa size cho mọi đường vào =====
    {
        if (sp) {
            const size45On = !!document.getElementById("size45")?.checked;
            const qlSizeTheoGiaOn = !!document.getElementById("quanlysizetheogia")?.checked;
            const qlTheoNhomOn = !!document.getElementById("quanlysizetheonhom")?.checked;

            // nhóm có quanlysize hợp lệ tại cơ sở hiện tại?
            let groupRequires = false;
            if (qlTheoNhomOn && sp.nhomhang && window.danhMucNhom) {
                const nhom = window.danhMucNhom.get(String(sp.nhomhang).toUpperCase());
                if (nhom && nhom.quanlysize) {
                    const diadiemHienTai = currentBranchUpper(); // 'CS1' | 'CS2' cố định theo trang

                    groupRequires = (nhom.diadiem === "ALL" || nhom.diadiem === diadiemHienTai);
                }
            }

            // size45 chỉ siết với giày; theo giá siết nếu là giày hoặc giale ≥ 170000
            const isGD = String(sp.chungloai || "").trim().toUpperCase() === "GD";
            const isQLSize = isQuanLySizeProduct(sp);        // ✅ mới
            const giaHangHoa = Number(sp.giale) || 0;
            const managedByGia = qlSizeTheoGiaOn && (isQLSize || giaHangHoa >= 170000); // ✅

            // 🔒 Chỉ khi thực sự thuộc diện quản lý size mới kiểm tra 38–45
            const requireManagedSize = (size45On && isQLSize) || groupRequires || managedByGia;  // ✅

            if (requireManagedSize) {
                const allowed = new Set(["38", "39", "40", "41", "42", "43", "44", "45"]);
                const rawSize = (forcedSize ?? size ?? "").toString().trim().toUpperCase();

                const invalid = (!rawSize || rawSize === "0" || !allowed.has(rawSize));
                if (invalid) {
                    alert("Size không hợp lệ! Chỉ cho phép nhập size 38–45.");
                    const sizeEl = document.getElementById("size");
                    if (sizeEl) { sizeEl.focus(); sizeEl.select(); }
                    window.soundWaitSize?.();   // beep cảnh báo
                    return; // ❌ dừng thêm dòng
                }

                // chuẩn hoá size hợp lệ để dùng tiếp phía dưới
                size = rawSize;
            }
        }
    }

    // ==== KIỂM TRA SIZE HỢP LỆ (áp dụng cho mọi trường hợp, TRỪ bán siêu nhanh) ====

    if (!banSieuNhanh) {
        const dsSize = Array.isArray(window.danhMucSize)
            ? window.danhMucSize.map(s => String(s).trim().toUpperCase())
            : [];

        const sizeUC = String(size || "").trim().toUpperCase();

        // Thiếu masp hoặc không tìm thấy sản phẩm -> không thể thêm
        if (!masp || !sp) {
            alert("Phải nhập mã sản phẩm hợp lệ.");
            document.getElementById("masp").focus();
            document.getElementById("masp").select();
            return;
        }

        // Nếu đã vào được đây từ ô #size, ta chỉ chấp nhận khi size nằm trong danh mục
        // (trường hợp không hợp lệ đã được điều hướng/cảnh báo ở chuyenFocus)
        if (dsSize.length && !dsSize.includes(sizeUC)) {
            // Không alert ở đây để tránh gián đoạn thao tác;
            // chỉ quay lại #size nếu đang có trường này.
            const sizeEl = document.getElementById("size");
            if (sizeEl) {
                sizeEl.focus();
                sizeEl.select();
            }
            return;
        }
    }

    // ==== END KIỂM TRA ====
    // Lấy giá & khuyến mại từ form
    const toInt = (v) => parseInt(String(v || "0").replace(/[.,\s]/g, ""), 10) || 0;
    let giaForm = toInt(document.getElementById("gia")?.value || "0");
    let kmForm = toInt(document.getElementById("khuyenmai")?.value || "0");

    // [SAFE GUARD] Nếu giá form vẫn = 0, fallback theo dm hàng hoá
    if (giaForm === 0 && sp) {
        const giaSP = Math.round(parseMoneyInt(isNhapMode() ? (sp.gianhap || 0) : (sp.giale || 0)));
        let kmAuto = 0;
        if (!isNhapMode()) {
            try { kmAuto = tinhKhuyenMai(sp, giaSP) || 0; } catch (e) { }
        }

        giaForm = giaSP;
        if (!kmForm || kmForm < 0) kmForm = kmAuto;

        // ghi ngược lại lên form để người dùng thấy đúng
        const giaEl = document.getElementById("gia");
        const kmEl = document.getElementById("khuyenmai");
        if (giaEl) giaEl.value = giaSP.toLocaleString();
        if (kmEl) kmEl.value = (kmForm || 0).toLocaleString();
    }


    // Nếu nhập khuyến mại < 100 → coi là %
    if (kmForm > 0 && kmForm < 100) {
        kmForm = Math.round((giaForm * kmForm) / 100);
    }

    const key = masp;
    const bang = bangKetQua[key] || {
        masp,
        tensp: sp.tensp,
        sizes: [],
        soluongs: [],
        tong: 0,
        gia: giaForm,
        km: kmForm,
        dvt: sp.dvt || ""
    };

    // Nếu không phải ADMIN: luôn lấy giá/km theo danh mục & rule hệ thống (không tin dữ liệu gõ tay)
    if (!isAdminUser()) {
        const giaNguonSys = isNhapMode() ? (sp.gianhap || 0) : (sp.giale || 0);
        const giaSys = Math.round(parseMoneyInt(giaNguonSys));
        let kmSys = 0;
        if (!isNhapMode()) kmSys = tinhKhuyenMai(sp, giaSys) || 0;
        giaForm = giaSys;
        kmForm = kmSys;
        // Đồng bộ lại form để người dùng thấy đúng
        const _giaEl = document.getElementById('gia');
        const _kmEl = document.getElementById('khuyenmai');
        if (_giaEl) _giaEl.value = giaSys.toLocaleString();
        if (_kmEl) _kmEl.value = (kmSys || 0).toLocaleString();
    }

    // Cập nhật giá/km cho nhóm
    bang.gia = giaForm;
    bang.km = kmForm;


    // === CHỐT LẠI PHẦN NÀY: so sánh chuẩn hóa size ===
    const normSize = String(size).trim();
    const index = bang.sizes.findIndex(sz => String(sz).trim() === normSize);
    if (index !== -1) {
        bang.soluongs[index] += soluong;
    } else {
        bang.sizes.push(normSize);
        bang.soluongs.push(soluong);
    }

    bang.tong += soluong;
    bangKetQua[key] = bang;
    // Cập nhật thứ tự nhóm (mới nhất ở TRÊN CÙNG)
    if (!Array.isArray(window.groupOrder)) {
        // khởi tạo: newest-first từ trạng thái hiện có
        window.groupOrder = Object.keys(bangKetQua).slice().reverse();
    }

    if (isNewGroup) {
        // nhóm mới: đưa lên đầu
        window.groupOrder = [masp, ...window.groupOrder.filter(m => m !== masp)];
    } else {
        // nhóm cũ: giữ nguyên vị trí; nhưng nếu vì lý do gì chưa có thì thêm vào cuối
        if (!window.groupOrder.includes(masp)) {
            window.groupOrder.push(masp);
        }
    }

    // ⚡️ Lưu lại thông tin dòng vừa thêm + cờ nhóm mới/cũ
    window.lastAdded = { masp, size: normSize, isNewGroup };

    // Render bảng theo luật mới
    capNhatBangHTML(bangKetQua, window.lastAdded);

    // "Tinh" báo thêm thành công
    window.soundSuccess?.();


    if (opts.afterAdd === "keepMaspFocusSize") {
        // Đóng gợi ý MASP ngay khi Enter ở #masp
        window.closePopupMasp && window.closePopupMasp();
        // ✅ Tăng bộ đếm (xx) ngay trên ô #masp
        const maspEl = document.getElementById("masp");
        const raw = String(maspEl.value || "").trim().toUpperCase();
        const base = raw.replace(/\(\d+\)\s*$/, "");       // bỏ (xx) nếu có
        const m = raw.match(/\((\d+)\)\s*$/);
        const next = m ? (parseInt(m[1], 10) + 1) : 1;
        maspEl.value = `${base}(${next})`;

        // Rồi mới reset size + select để nhập tiếp
        if (typeof resetFormSauKhiNhapSize === "function") {
            resetFormSauKhiNhapSize();
        }
    } else {
        // Luồng cũ: thêm xong thì xóa masp và focus về #masp
        resetFormBang();
    }

}


export function getBangKetQua() {
    if (window.bangKetQua && Object.keys(window.bangKetQua).length > 0) {
        return window.bangKetQua;
    }
    return bangKetQua;
}

export function resetBangKetQua() {
    bangKetQua = {};
    if (window.bangKetQua) window.bangKetQua = {};

    // ✅ reset luôn các state điều khiển thứ tự/hiển thị
    window.groupOrder = [];
    window.lastAdded = null;

    capNhatBangHTML(bangKetQua, null);
}


export function ganTenNV() {
    const manv = document.getElementById("manv").value.trim();
    document.getElementById("tennv").value = window.nhanVienData?.[manv] || "";
}

export function xoaDongDangChon() {
    // ✅ Đồng bộ lại dữ liệu từ bảng DOM (trường hợp vừa “nhập ngang”)
    try { window.capNhatBangKetQuaTuDOM?.(); } catch (_) { }

    const dang = getMaspspDangChon();
    if (!dang) { alert("Vui lòng chọn dòng cần xóa."); return; }

    const masp = String(dang.masp || "").trim();
    const size = (dang.size != null) ? String(dang.size).trim() : null;
    if (!masp) { alert("Không xác định được mã sản phẩm đang chọn để xóa."); return; }

    const data = _data();
    const item = data[masp];
    if (!item) { alert("Không tìm thấy dòng để xóa."); return; }

    const msg = size
        ? `Bạn có chắc muốn xóa size "${size}" của mã "${masp}"?`
        : `Bạn có chắc muốn xóa toàn bộ mã "${masp}"?`;
    if (!confirm(msg)) return;

    if (size) {
        const idx = item.sizes.findIndex(s => String(s).trim() === size);
        if (idx !== -1) {
            const sl = parseInt(item.soluongs[idx] || 0, 10) || 0;
            item.tong = Math.max(0, (item.tong || 0) - sl);
            item.sizes.splice(idx, 1);
            item.soluongs.splice(idx, 1);
        }
        if (item.sizes.length === 0) delete data[masp];
    } else {
        delete data[masp];
    }

    setMaspspDangChon(null);
    capNhatBangHTML(data, window.lastAdded);
}


// hoadon.js
export function suaDongDangChon() {
    // 1) Đồng bộ lại data từ DOM
    try { window.capNhatBangKetQuaTuDOM?.(); } catch (_) { }

    // 2) Lấy dòng đang chọn; nếu chưa có thì lấy dòng đầu tiên
    let dangChon = getMaspspDangChon();
    if (!dangChon) {
        const firstRow = document.querySelector("#bangketqua tbody tr");
        if (!firstRow) {
            alert("Không có dòng nào để sửa.");
            return;
        }

        const tds = firstRow.querySelectorAll("td");
        const masp = (tds[0]?.textContent || "").trim();

        if (!masp) {
            alert("Không đọc được mã sản phẩm của dòng đầu tiên để sửa.");
            return;
        }

        // Chỉ lưu masp, không cần size nữa
        setMaspspDangChon({ masp });
        dangChon = { masp };
    }

    const masp = String(dangChon.masp || "").trim().toUpperCase();
    if (!masp) {
        alert("Không xác định được mã sản phẩm để sửa.");
        return;
    }

    const data = _data();
    const item = data[masp];

    if (!item) {
        alert("Không tìm thấy dòng để sửa.");
        return;
    }

    // 3) Đẩy dữ liệu nhóm mã về form nhập
    const maspEl = document.getElementById("masp");
    const soluongEl = document.getElementById("soluong");
    const giaEl = document.getElementById("gia");
    const kmEl = document.getElementById("khuyenmai");
    const thanhtienEl = document.getElementById("thanhtien");
    const sizeEl = document.getElementById("size");

    const tong = parseInt(item.tong || 0, 10) || 0;
    const gia = parseInt(item.gia || 0, 10) || 0;
    const km = parseInt(item.km || 0, 10) || 0;
    const thanhtien = (gia - km) * tong;

    if (maspEl) {
        maspEl.value = masp;

        try {
            maspEl.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (_) { }
    }

    if (soluongEl) soluongEl.value = tong > 0 ? String(tong) : "1";
    if (giaEl) giaEl.value = gia.toLocaleString();
    if (kmEl) kmEl.value = km.toLocaleString();
    if (thanhtienEl) thanhtienEl.value = thanhtien.toLocaleString();

    // Không dùng cột kích cỡ nữa → xóa trắng size
    if (sizeEl) sizeEl.value = "";

    // 4) Xóa cả nhóm mã khỏi state để người dùng nhập lại
    delete data[masp];

    // 5) Ghi lại state và render bảng
    setMaspspDangChon(null);
    _sync(data);
    capNhatBangHTML(data, null);

    // 6) Focus lại ô mã sản phẩm và bôi đen như cũ
    if (maspEl) {
        setTimeout(() => {
            maspEl.focus();
            maspEl.select();
        }, 50);
    }
}

// Chạy Sửa với lớp bọc _wrapEnsureState (nếu trang đã khai báo), fallback gọi trực tiếp
export function runSuaDongDangChon() {
    const runner = window._wrapEnsureState ? window._wrapEnsureState(suaDongDangChon) : suaDongDangChon;
    return runner();
}



export async function napLaiChiTietHoaDon(sohd) {
    // Lấy chi tiết từ bảng ct_hoadon_banle
    const { data: chitiet, error } = await supabase
        .from("ct_hoadon_banle")
        .select("*")
        .eq("sohd", sohd);

    if (error || !chitiet || chitiet.length === 0) {
        alert("❌ Không tìm thấy chi tiết hóa đơn để sửa.");
        return;
    }

    // Reset lại bảng tạm
    resetBangKetQua();

    // Ghép lại đúng cấu trúc của bangKetQua
    chitiet.forEach(ct => {
        const masp = ct.masp;
        if (!bangKetQua[masp]) {
            bangKetQua[masp] = {
                masp: ct.masp,
                tensp: ct.tensp,
                sizes: [],
                soluongs: [],
                tong: 0,
                gia: ct.gia,
                km: ct.km,
                dvt: ct.dvt || ""
            };
        }
        const index = bangKetQua[masp].sizes.indexOf(ct.size);
        if (index === -1) {
            bangKetQua[masp].sizes.push(String(ct.size)); // luôn lưu về kiểu string

            bangKetQua[masp].soluongs.push(ct.soluong);
        } else {
            bangKetQua[masp].soluongs[index] += ct.soluong;
        }
        bangKetQua[masp].tong += ct.soluong;
    });

    capNhatBangHTML(bangKetQua, window.lastAdded);
}


// ===== Chuyển focus về #size khi Enter ở #gia hoặc #khuyenmai =====
document.addEventListener("DOMContentLoaded", () => {
    applyRoleLockToPriceFields();
    ["gia", "khuyenmai"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                const sizeEl = document.getElementById("size");
                if (sizeEl) {
                    sizeEl.focus();
                    sizeEl.select();
                }
            }
        });
    });
});
