// luuhoadon.js
import { supabase } from './supabaseClient.js';
import { resetBangKetQua, getBangKetQua } from './hoadon.js';

import { capNhatThongTinTong } from './utils.js';
import { capNhatSoHoaDonTuDong } from './sohoadon.js';

import { guiHoaDonViettel } from './viettelInvoice.js';

async function refreshSessionIfNeeded() {
    // 1) phải có session
    const { data: s1, error: e1 } = await supabase.auth.getSession();
    if (e1) console.warn("getSession error:", e1);

    let session = s1?.session;
    if (!session) {
        // Không còn session => bắt đăng nhập lại
        alert("⚠️ Phiên đăng nhập đã hết. Vui lòng đăng nhập lại!");
        throw new Error("NO_SESSION");
    }

    // 2) nếu sắp hết hạn (<= 90s) thì refresh
    const expiresAtMs = (session.expires_at || 0) * 1000;
    if (expiresAtMs && expiresAtMs - Date.now() <= 90_000) {
        const { data: s2, error: e2 } = await supabase.auth.refreshSession();
        if (e2 || !s2?.session) {
            console.warn("refreshSession error:", e2);
            alert("⚠️ Không làm mới được phiên đăng nhập. Vui lòng đăng nhập lại!");
            throw new Error("REFRESH_FAILED");
        }
        session = s2.session;
    }

    return session;
}


async function hoaDonDaTonTai(sohd) {
    if (!sohd) return false;
    const { data, error } = await supabase
        .from("hoadon_banle")
        .select("sohd")
        .eq("sohd", sohd)
        .maybeSingle();
    return !!data;
}


// === HD_CTX: trạng thái NEW/EDIT cho luồng lưu hóa đơn ===
window.HD_CTX = window.HD_CTX || { mode: 'NEW', version: null };

// === Helpers chung, dùng lại toàn file ===
const getInt = (id) => parseInt((document.getElementById(id)?.value || "").replace(/[.,]/g, "") || "0", 10);

// Chuẩn hoá mảng size: rỗng -> "0"
function normalizeBangKetQua(bkq) {
    if (!bkq) return;
    Object.values(bkq).forEach(item => {
        if (Array.isArray(item?.sizes)) {
            item.sizes = item.sizes.map(sz => {
                const s = String(sz ?? "").trim();
                return s === "" ? "0" : s;
            });
        }
    });
}

// Lấy địa điểm từ prefix loại
function getDiaDiemFromLoai(loai) {
    return (String(loai).toLowerCase().includes("cs2")) ? "cs2" : "cs1";
}

// Kiểm tra trùng số ở cả 2 bảng bán lẻ (chính và T)
async function hoaDonDaTonTaiAny(sohd) {
    if (!sohd) return false;
    const [r1, r2] = await Promise.all([
        supabase.from("hoadon_banle").select("sohd").eq("sohd", sohd).maybeSingle(),
        supabase.from("hoadon_banleT").select("sohd").eq("sohd", sohd).maybeSingle()
    ]);
    return !!(r1?.data || r2?.data);
}

// === SAU KHI LƯU HÓA ĐƠN: CẬP NHẬT used_for_mt CHO DÒNG TƯ VẤN NHÂN VIÊN ===
// Quy tắc:
// - Chỉ chạy cho hóa đơn bán lẻ MT chính: loai = 'bancs1' hoặc 'bancs2'
// - Chỉ xét các dòng tư vấn trong ct_hoadon_banle có:
//      + masp trùng với masp trong chi tiết hóa đơn vừa lưu
//      + sohd bắt đầu bằng bannvcs1_ / bannvcs2_ (tùy cơ sở)
//      + created_at trong 1 giờ gần nhất
//      + used_for_mt = false
// - Nếu trong 1h không có dòng hợp lệ → bỏ qua
// - Nếu chỉ có 1 dòng hợp lệ & size trùng với size trên hóa đơn MT → set used_for_mt = true cho đúng dòng đó
// - Nếu có từ 2 dòng hợp lệ trở lên (kể cả trùng size hay khác size) và hóa đơn MT có bán mã đó:
//      → coi là dữ liệu mập mờ → set used_for_mt = true cho TẤT CẢ các dòng đó (dọn rác)
// Lưu ý: HÀM NÀY KHÔNG ẢNH HƯỞNG TỚI LUỒNG LƯU CHÍNH nếu có lỗi, chỉ log ra console.
async function capNhatUsedTuVanSauKhiLuuCT(chitiet, loai, diadiemTrang) {
    try {
        if (!Array.isArray(chitiet) || chitiet.length === 0) return;

        // Chỉ áp dụng cho bán lẻ MT chính
        const loaiNorm = String(loai || "").toLowerCase();
        if (loaiNorm !== "bancs1" && loaiNorm !== "bancs2") return;

        // Xác định prefix hóa đơn nhân viên theo địa điểm
        const dia = String(diadiemTrang || "").toLowerCase();
        const prefixNV = dia === "cs2" ? "bannvcs2_" : "bannvcs1_";

        const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        // Tập mã sản phẩm duy nhất có trong hóa đơn vừa lưu
        const maspSet = new Set();
        chitiet.forEach((ct) => {
            const m = String(ct.masp || "").trim().toUpperCase();
            if (m) maspSet.add(m);
        });

        if (!maspSet.size) return;

        for (const masp of maspSet) {
            const { data, error } = await supabase
                .from("ct_hoadon_banle")
                .select("id, size, sohd, created_at, used_for_mt, masp")
                .eq("masp", masp)
                .like("sohd", `${prefixNV}%`)
                .gte("created_at", oneHourAgoIso)
                .eq("used_for_mt", false)
                .order("id", { ascending: false })
                .limit(50);

            if (error) {
                console.error("Lỗi truy vấn tư vấn NV cho masp", masp, error);
                continue;
            }
            if (!data || !data.length) continue;

            const validRows = data.filter((r) => {
                const s = r && r.size != null ? String(r.size).trim() : "";
                return s !== "";
            });
            if (!validRows.length) continue;

            // Nếu hóa đơn MT KHÔNG bán mã này thì không dọn rác nhóm này
            const usedAny = chitiet.some(
                (ct) => String(ct.masp || "").trim().toUpperCase() === masp
            );
            if (!usedAny) continue;

            if (validRows.length === 1) {
                // Chỉ dùng khi size trùng với size trên hóa đơn MT
                const nvSize = String(validRows[0].size || "").trim();
                const usedInMT = chitiet.some(
                    (ct) =>
                        String(ct.masp || "").trim().toUpperCase() === masp &&
                        String(ct.size ?? "").trim() === nvSize
                );
                if (!usedInMT) continue;

                await supabase
                    .from("ct_hoadon_banle")
                    .update({ used_for_mt: true })
                    .eq("id", validRows[0].id);
            } else {
                // Có từ 2 dòng trở lên (kể cả cùng size hay khác size) → dọn rác toàn bộ nếu có phát sinh bán MT
                const ids = validRows.map((r) => r.id);
                if (ids.length) {
                    await supabase
                        .from("ct_hoadon_banle")
                        .update({ used_for_mt: true })
                        .in("id", ids);
                }
            }
        }
    } catch (err) {
        console.error("Lỗi capNhatUsedTuVanSauKhiLuuCT:", err);
    }
}


// ===== Modal "Số hóa đơn đã tồn tại" với 2 nút to (Tạo mới / Sửa) =====
function ensureExistDialog() {
    if (document.getElementById('exist-dialog')) return;

    const css = document.createElement('style');
    css.id = 'exist-dialog-css';
    css.textContent = `
  .exist-mask{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:9998}
  .exist-box{position:fixed;z-index:9999;left:50%;top:50%;transform:translate(-50%,-50%);
    width:560px;max-width:92vw;background:#fff;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.2);
    font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial}
  .exist-hd{padding:14px 18px;border-bottom:1px solid #eee;font-weight:700;font-size:16px}
  .exist-bd{padding:16px 18px;line-height:1.5;color:#333}
  .exist-actions{display:flex;gap:16px;justify-content:center;padding:16px 18px 22px}
  .exist-btn{min-width:210px;padding:12px 18px;border-radius:999px;border:2px solid transparent;
    font-weight:700;font-size:16px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.08)}
  .exist-btn.new{background:#1e88e5;color:#fff}
  .exist-btn.new:focus,.exist-btn.new:hover{filter:brightness(1.05)}
  .exist-btn.edit{background:#e8f5e9;color:#1b5e20;border-color:#a5d6a7}
  .exist-btn.edit:focus,.exist-btn.edit:hover{filter:brightness(1.03)}
  .exist-note{margin-top:8px;color:#666;font-size:13px}
  `;
    document.head.appendChild(css);

    const wrap = document.createElement('div');
    wrap.id = 'exist-dialog';
    wrap.style.display = 'none';
    wrap.innerHTML = `
    <div class="exist-mask" data-role="mask"></div>
    <div class="exist-box" role="dialog" aria-modal="true" aria-labelledby="exist-title">
      <div class="exist-hd" id="exist-title">Số hóa đơn đã tồn tại</div>
      <div class="exist-bd">
        <div>Hóa đơn có số <b id="exist-sohd"></b> đã có trong hệ thống.</div>
        <div class="exist-note">Chọn <b>Tạo hóa đơn mới</b> để hệ thống tự cấp số mới, hoặc
        <b>Sửa hóa đơn này</b> (yêu cầu xác thực) nếu bạn muốn chỉnh hóa đơn cũ.</div>
      </div>
      <div class="exist-actions">
        <button class="exist-btn new"  id="exist-new-btn">Tạo hóa đơn mới</button>
        <button class="exist-btn edit" id="exist-edit-btn">Sửa hóa đơn này</button>
      </div>
    </div>`;
    document.body.appendChild(wrap);

    // Đóng khi click nền mờ
    wrap.querySelector('[data-role="mask"]').addEventListener('click', () => {
        wrap.style.display = 'none';
    });
}

function showExistDialog(sohd) {
    ensureExistDialog();
    const wrap = document.getElementById('exist-dialog');
    document.getElementById('exist-sohd').textContent = sohd;
    wrap.style.display = 'block';

    return new Promise(resolve => {
        const ok = document.getElementById('exist-new-btn');
        const edt = document.getElementById('exist-edit-btn');

        const cleanup = () => {
            ok.removeEventListener('click', onNew);
            edt.removeEventListener('click', onEdit);
            wrap.style.display = 'none';
        };
        const onNew = () => { cleanup(); resolve('new'); };
        const onEdit = () => { cleanup(); resolve('edit'); };

        ok.addEventListener('click', onNew);
        edt.addEventListener('click', onEdit);
    });
}



function getLoaiFromSoHDInput() {
    const raw = document.getElementById('sohd')?.value?.trim().toLowerCase() || '';
    if (raw && raw.includes('_')) {
        // nếu ô sohd đã có dạng hợp lệ thì cứ cắt prefix
        return raw.split('_')[0];
    }
    // Fallback theo đường dẫn trang – KHÔNG phụ thuộc ô #sohd
    const path = location.pathname.toLowerCase();
    if (path.includes('nhaptamcs1')) return 'ntcs1';
    if (path.includes('nhapmoimtcs1')) return 'nmcs1';
    if (path.includes('nhaptamcs2')) return 'ntcs2';
    if (path.includes('nhapmoimtcs2')) return 'nmcs2';
    // thêm các trang khác nếu cần …
    return '';
}




let choPhepSua = false;

// --- BẮT BUỘC: nạp catalog nếu chưa có (dùng riêng cho trang CCN) ---
// --- BẮT BUỘC: nạp catalog nếu chưa có (dùng riêng cho trang CCN) ---
async function ensureCatalogsReady() {
    // Sản phẩm
    if (!window.sanPhamData || Object.keys(window.sanPhamData).length === 0) {
        const { data: dssp, error } = await supabase
            .from("dmhanghoa")
            .select("*"); // DÙNG * để nhận được cả manhom/nhomhang tùy DB của bạn

        if (!error && Array.isArray(dssp)) {
            window.sanPhamData = {};
            dssp.forEach(sp => {
                const key = String(sp.masp || "").toUpperCase().trim();
                window.sanPhamData[key] = sp;
            });
        } else {
            console.warn("⚠️ Không tải được dmhanghoa, requireManagedAtBranch có thể sai.", error);
            window.sanPhamData = window.sanPhamData || {};
        }
    }

    // Nhóm hàng (Map)
    if (!(window.danhMucNhom instanceof Map) || window.danhMucNhom.size === 0) {
        const { data, error } = await supabase
            .from("dmnhomhang")
            .select("manhom, quanlysize, diadiem"); // dmnhomhang có cột manhom là PK

        if (!error && Array.isArray(data)) {
            window.danhMucNhom = new Map();
            data.forEach(row => {
                window.danhMucNhom.set(String(row.manhom).toUpperCase().trim(), {
                    quanlysize: !!row.quanlysize,
                    diadiem: String(row.diadiem || "ALL").toUpperCase().trim() // ALL | CS1 | CS2
                });
            });
        } else {
            console.warn("⚠️ Không tải được dmnhomhang, requireManagedAtBranch sẽ trả false.", error);
            window.danhMucNhom = window.danhMucNhom instanceof Map ? window.danhMucNhom : new Map();
        }
    }
}

// [ADD – đặt gần đầu file luuhoadon.js, trước khi dùng tới trong xacNhanSuaHoaDon()]
function getDiaDiemFromPageName() {
    const t = ((document?.title || '') + ' ' + (window?.location?.pathname || '')).toLowerCase();

    // Ưu tiên pathname có 'cs1'/'cs2' (vd: /banlemtcs1.html, /nhaptamcs2.html)
    if (t.includes('cs2')) return 'cs2';
    if (t.includes('cs1')) return 'cs1';

    // Fallback: tiêu đề trang chứa 'cơ sở 1/2' (không dấu)
    const normalized = t
        .replace(/cơ\s*sở/gi, 'co so')
        .replace(/[^\w\s]/g, ' ') // bỏ ký tự đặc biệt
        .replace(/\s+/g, ' ')
        .trim();

    if (normalized.includes('co so 2')) return 'cs2';
    if (normalized.includes('co so 1')) return 'cs1';

    // Cuối cùng: nếu không đoán được, trả rỗng để caller tự xử lý
    return '';
}


/***** CCN HELPERS (kiểm tra nếu là ccn thì goi inferBranches chuyển đổi size theo từng cơ sở) *****/
/* ========================= CCN CONTEXT (ĐÓNG BĂNG CHIỀU CHUYỂN) ========================= */
/* [MỚI] Đóng băng bối cảnh CCN theo chính tên trang, không dùng localStorage ở trang CCN */
function buildCCNCtxFromPathname() {
    const p = (window.location.pathname || '').toLowerCase();
    // Mặc định
    let ctx = {
        isCCN: false,
        src: 'CS1',
        dst: 'CS2',
        loaihdGoc: '',     // xcncs1 | xcncs2
        loaihdDoiUng: '',  // ncncs2 | ncncs1
        page: p
    };

    if (p.includes('ccn1v2')) {
        ctx.isCCN = true;
        ctx.src = 'CS1';
        ctx.dst = 'CS2';
        ctx.loaihdGoc = 'xcncs1';
        ctx.loaihdDoiUng = 'ncncs2';
        return ctx;
    }
    if (p.includes('ccn2v1')) {
        ctx.isCCN = true;
        ctx.src = 'CS2';
        ctx.dst = 'CS1';
        ctx.loaihdGoc = 'xcncs2';
        ctx.loaihdDoiUng = 'ncncs1';
        return ctx;
    }
    return ctx; // không phải trang CCN
}

// [MỚI] Tạo context 1 lần, giữ cố định cho toàn phiên của tab
const CCN_CTX = buildCCNCtxFromPathname();

/* [MỚI] inferBranches() nay trả về từ CCN_CTX nếu là trang CCN,
   còn trang khác (bán lẻ/nhập) giữ nguyên suy luận cũ theo prefix số chứng từ */
function inferBranches() {
    if (CCN_CTX.isCCN) {
        return { src: CCN_CTX.src, dst: CCN_CTX.dst };
    }
    // Non-CCN: đoán theo sohd/prefix (giữ logic cũ)
    const sohd = document.getElementById('sohd')?.value || '';
    const prefix = sohd.split('_')[0] || '';
    if (prefix.includes('cs2')) return { src: 'CS2', dst: 'CS1' };
    return { src: 'CS1', dst: 'CS2' };
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

// luuhoadon.js
function requireManagedAtBranch(masp, branch) {
    const upper = s => String(s || "").toUpperCase().trim();
    const sp = window.sanPhamData?.[upper(masp)];
    const br = upper(branch);

    // ❗Nếu chưa tra được catalog → giữ size (trả true)
    if (!sp) return true;

    // 1) Chủng loại GD => quản size
    if (upper(sp.chungloai || "") === "GD") return true;

    // 2) Cờ riêng của SP
    if (sp.quanlykichco === true) return true;

    // 3) Theo nhóm + địa điểm
    if (window.danhMucNhom instanceof Map && window.danhMucNhom.size) {
        const groupKey = resolveGroupKeyFromSP(sp); // manhom/nhomhang/...
        if (groupKey) {
            const nhom = window.danhMucNhom.get(upper(groupKey));
            if (nhom && nhom.quanlysize) {
                const dia = upper(nhom.diadiem || "ALL");
                return dia === "ALL" || dia === br;
            }
        }
    }

    // ✅ Không rơi vào case nào khẳng định “không size” → vẫn coi là có size
    return true;
}


async function handleSpecialSoHoaDon(sohd) {
    // Chỉ cho phép chạy cơ chế "số đặc biệt → lưu 2 bản" với bán lẻ cs1/cs2
    const prefixFull = (sohd.split("_")[0] || "").toLowerCase();
    if (prefixFull !== "bancs1" && prefixFull !== "bancs2") {
        // Không phải hóa đơn bán lẻ → không kích hoạt nhánh 2 bản
        return false;
    }

    // Lấy số thứ tự
    const parts = sohd.split("_");
    if (parts.length < 2) return false;
    const num = parseInt(parts[1], 10);

    // Xác định cơ sở và điều kiện chia hết
    const diadiem = (prefixFull === "bancs2") ? "cs2" : "cs1";
    const modulus = (diadiem === "cs1") ? 4 : 6;

    // Không phải số đặc biệt → thôi
    if (Number.isNaN(num) || num % modulus !== 0) return false;

    // Giới hạn tiền theo cơ sở
    const ngay = document.getElementById("ngay").value;
    let hanMuc = (diadiem === "cs1") ? 2500000 : 7000000;

    // Tổng đã lưu trong ngày của bảng T tại cơ sở này
    const { data, error } = await supabase
        .from("hoadon_banleT")
        .select("thanhtoan")
        .eq("ngay", ngay)
        .eq("diadiem", diadiem);

    let tongTien = 0;
    if (data && data.length) {
        tongTien = data.reduce((sum, hd) => sum + (Number(hd.thanhtoan) || 0), 0);
    }

    const getIntValue = (id) =>
        parseInt(document.getElementById(id).value.replace(/[.,]/g, "") || "0", 10);
    const tienHoaDon = getIntValue("phaithanhtoan");

    if (tongTien + tienHoaDon > hanMuc) {
        // Vượt hạn mức → chỉ lưu bản thường
        return false;
    }

    // ✅ Đủ điều kiện → lưu 2 bản và gọi Viettel (logic nằm trong luuHoaDonCaHaiBan)
    await luuHoaDonCaHaiBan();
    return true;
}


export async function luuHoaDonQuaAPI() {
    capNhatThongTinTong(getBangKetQua()); // Đảm bảo input tổng cập nhật lại trước khi lấy dữ liệu

    const maspChuaNhap = document.getElementById("masp")?.value.trim();
    if (maspChuaNhap && !/\(\d+\)\s*$/.test(maspChuaNhap)) {
        alert("❌ Bạn còn mã sản phẩm chưa thêm vào bảng! Hãy kiểm tra lại trước khi lưu hóa đơn.");
        document.getElementById("masp").focus();
        return;
    }

    const bangKetQua = getBangKetQua();
    const sohd = document.getElementById("sohd").value.trim();
    if (!sohd) return alert("❌ Chưa có số hóa đơn.");
    const tennv = document.getElementById("tennv").value.trim();
    if (!tennv) return alert("❌ Bạn chưa nhập tên nhân viên bán hàng.");

    // ... sau khi có const sohd = ...; const tennv = ...;

    // ... đã có sohd, tennv, bangKetQua ...

    // 1) Khai báo trước
    const IS_EDIT = (window.HD_CTX?.mode === 'EDIT') || !!choPhepSua;

    // 2) KHỐI SỐ ĐẶC BIỆT (phải đứng SAU dòng trên)
    if (!IS_EDIT) {
        const existed = await hoaDonDaTonTaiAny(sohd);
        if (!existed && await handleSpecialSoHoaDon(sohd)) {
            return; // đã lưu 2 bản xong thì thoát sớm
        }
    }

    // 3) Hỏi nếu số đang gõ bị trùng (vẫn đứng SAU) 
    if (!IS_EDIT) {
        const existed = await hoaDonDaTonTaiAny(sohd);
        if (existed) {
            const choice = await showExistDialog(sohd);
            if (choice === 'edit') {
                document.getElementById("popupXacThucSua").style.display = "block";
                document.getElementById("xacmanv")?.focus();
                return;
            }
            // choice === 'new' → để NEW tiếp, RPC sẽ cấp số mới
        }
    }


    // === NHÁNH NEW: dùng RPC save_new_header cấp số & insert header ===

    if (!IS_EDIT) {
        // LẤY LOẠI CHỨNG TỪ TỪ Ô #sohd (đã phát sinh sẵn bởi capNhatSoHoaDonTuDong)
        let loai = getLoaiFromSoHDInput();
        if (!loai) {
            // nếu ô #sohd chưa có, phát sinh lại rồi lấy
            await capNhatSoHoaDonTuDong();
            loai = getLoaiFromSoHDInput();
            if (!loai) { alert("❗Chưa xác định được loại chứng từ từ số hóa đơn."); return; }
        }
        const diadiemTrang = loai.includes('cs2') ? 'cs2' : 'cs1';


        const getIntValue = (id) => parseInt(document.getElementById(id).value.replace(/[.,]/g, "") || "0", 10);
        const header = {
            ngay: document.getElementById("ngay").value,
            manv: document.getElementById("manv").value,
            tennv: document.getElementById("tennv").value,
            diadiem: diadiemTrang,
            khachhang: document.getElementById("khachhang").value,
            tongsl: getIntValue("tongsl"),
            tongkm: getIntValue("tongkm"),
            chietkhau: getIntValue("chietkhau"),
            thanhtoan: getIntValue("phaithanhtoan"),
            hinhthuctt: document.getElementById("hinhthuctt").value,
            ghichu: document.getElementById("ghichu")?.value || "",
            dvt: "",
            loaihd: loai,
            loai: loai,
            nhacc: ""
        };

        await refreshSessionIfNeeded();

        const { data: rpcRes, error: rpcErr } = await supabase.rpc('save_new_header', {
            p_loai: loai,
            p_diadiem: diadiemTrang,
            p_header: header
        });

        if (rpcErr || !rpcRes || !rpcRes[0]?.sohd) {
            console.error(rpcErr);
            alert("❌ Lưu hóa đơn thất bại (cấp số).");
            return;
        }

        const sohdThucTe = rpcRes[0].sohd;
        document.getElementById("sohd").value = sohdThucTe;

        normalizeBangKetQua(getBangKetQua());
        const nowIso = new Date().toISOString();
    const createdAtToWrite = IS_EDIT ? (CREATED_AT_GOC || nowIso) : nowIso;
    const createdAtDoiUngToWrite = IS_EDIT ? (CREATED_AT_DOIUNG_GOC || createdAtToWrite) : createdAtToWrite;
        const bangKetQuaNEW = getBangKetQua();

        const chitiet = [];
        Object.values(bangKetQuaNEW).forEach(item => {
            item.sizes.forEach((sz, i) => {
                const sl = item.soluongs[i];
                chitiet.push({
                    sohd: sohdThucTe,
                    masp: item.masp,
                    tensp: item.tensp,
                    size: sz,
                    soluong: sl,
                    gia: item.gia,
                    km: item.km,
                    thanhtien: (item.gia - item.km) * sl,
                    dvt: item.dvt || '',
                    diadiem: diadiemTrang,
                    created_at: createdAt,
                    ngay: document.getElementById("ngay").value
                });
            });
        });

        const { error: errCT } = await supabase.from("ct_hoadon_banle").insert(chitiet);
        if (errCT) {
            alert("❌ Lỗi khi lưu chi tiết hóa đơn.");
            console.error(errCT);
            await supabase.from("hoadon_banle").delete().eq("sohd", sohdThucTe);
            return;
        }

        // Sau khi lưu chi tiết thành công: cập nhật used_for_mt cho các dòng tư vấn nhân viên (nếu có)
        await capNhatUsedTuVanSauKhiLuuCT(chitiet, loai, diadiemTrang);

        inHoaDon({ ...header, sohd: sohdThucTe }, chitiet);
        await lamMoiSauKhiLuu();

        choPhepSua = false;
        return;
    }

    // === PHẦN DƯỚI: Nhánh EDIT (giữ nguyên luồng cũ) ===
    const { data: tonTai } = await supabase
        .from("hoadon_banle")
        .select("sohd")
        .eq("sohd", sohd)
        .maybeSingle();

    if (!tonTai) {
        alert("❌ Không tìm thấy hóa đơn để sửa. Vui lòng kiểm tra lại số HĐ hoặc chuyển sang tạo mới.");
        return;
    }

    if (tonTai && !choPhepSua) {
        const p = document.getElementById("popupXacThucSua");
        p.style.display = "block";
        const manvEl = document.getElementById("xacmanv");
        if (manvEl) { manvEl.focus(); manvEl.select(); }
        return;
    }

    // --- FIX timestamp: EDIT không ghi đè created_at, chỉ ghi updated_at ---
    let createdAtGoc = null;
    if (tonTai && choPhepSua) {
        const { data: hdOld, error: eOld } = await supabase
            .from("hoadon_banle")
            .select("created_at")
            .eq("sohd", sohd)
            .maybeSingle();
        if (eOld) console.warn("⚠️ Không đọc được created_at cũ:", eOld);
        createdAtGoc = hdOld?.created_at || null;

        await supabase.from("ct_hoadon_banle").delete().eq("sohd", sohd);
        await supabase.from("hoadon_banle").delete().eq("sohd", sohd);
    }

    const nowIso = new Date().toISOString();
    const createdAtToWrite = createdAtGoc || nowIso;

    const getIntValue = (id) =>
        parseInt(document.getElementById(id).value.replace(/[.,]/g, "") || "0", 10);

    const hoadon = {
        sohd,
        ngay: document.getElementById("ngay").value,
        manv: document.getElementById("manv").value,
        tennv: document.getElementById("tennv").value,
        diadiem: (sohd.split("_")[0] || "").includes("cs2") ? "cs2" : "cs1",
        khachhang: document.getElementById("khachhang").value,
        tongsl: getIntValue("tongsl"),
        tongkm: getIntValue("tongkm"),
        chietkhau: getIntValue("chietkhau"),
        thanhtoan: getIntValue("phaithanhtoan"),
        hinhthuctt: document.getElementById("hinhthuctt").value,
        ghichu: document.getElementById("ghichu")?.value || "",
        created_at: createdAtToWrite,
        updated_at: nowIso,
        loai: "",
        dvt: "",
        loaihd: sohd.split("_")[0],
        nhacc: ""
    };

    const chitiet = [];
    Object.values(bangKetQua).forEach(item => {
        item.sizes.forEach((sz, i) => {
            const sl = item.soluongs[i];
            chitiet.push({
                sohd,
                masp: item.masp,
                tensp: item.tensp,
                size: sz,
                soluong: sl,
                gia: item.gia,
                km: item.km,
                thanhtien: (item.gia - item.km) * sl,
                dvt: item.dvt || '',
                diadiem: (sohd.split("_")[0] || "").includes("cs2") ? "cs2" : "cs1",
                created_at: createdAtToWrite,
                updated_at: nowIso,
                ngay: document.getElementById("ngay").value
            });
        });
    });

    const { error: errHD } = await supabase.from("hoadon_banle").insert([hoadon]);
    const { error: errCT } = await supabase.from("ct_hoadon_banle").insert(chitiet);

    if (!errHD && !errCT) {
        // Cập nhật lại số_hientai vào bảng sochungtu theo đúng loại và số mới lưu
        const [loai, so] = sohd.split('_');
        const soMoi = parseInt(so, 10);

        const { data: currSoChungTu } = await supabase
            .from("sochungtu")
            .select("so_hientai")
            .eq("loai", loai)
            .single();

        if (!currSoChungTu || soMoi > currSoChungTu.so_hientai) {
            await supabase
                .from("sochungtu")
                .update({ so_hientai: soMoi })
                .eq("loai", loai);
        }

        inHoaDon(hoadon, chitiet);
        await lamMoiSauKhiLuu();
        choPhepSua = false;
    }
    else {
        alert("❌ Lỗi khi lưu hóa đơn");
        console.error(errHD || errCT);
    }
}


export async function luuHoaDonNhapQuaAPI() {
    capNhatThongTinTong(getBangKetQua()); // Đảm bảo input tổng cập nhật lại trước khi lấy dữ liệu

    const maspChuaNhap = document.getElementById("masp")?.value.trim();
    if (maspChuaNhap && !/\(\d+\)\s*$/.test(maspChuaNhap)) {
        alert("❌ Bạn còn mã sản phẩm chưa thêm vào bảng! Hãy kiểm tra lại trước khi lưu hóa đơn.");
        document.getElementById("masp").focus();
        return;
    }

    const bangKetQua = getBangKetQua();
    const sohd = document.getElementById("sohd").value.trim();
    if (!sohd) return alert("❌ Chưa có số hóa đơn.");
    const tennv = document.getElementById("tennv").value.trim();
    if (!tennv) return alert("❌ Bạn chưa nhập tên nhân viên nhập hàng.");

    // Xác định ý đồ: chỉ SỬA khi đã xác thực (đặt cờ EDIT)
    const IS_EDIT = (window.HD_CTX?.mode === 'EDIT') || !!choPhepSua;
    if (!IS_EDIT) {
        const existed = await hoaDonDaTonTai(sohd);
        if (existed) {
            const choice = await showExistDialog(sohd); // 'new' | 'edit'
            if (choice === 'edit') {
                const p = document.getElementById("popupXacThucSua");
                if (p) {
                    p.style.display = "block";
                    document.getElementById("xacmanv")?.focus();
                }
                return; // dừng lại để người dùng xác thực rồi bấm Lưu lại → vào EDIT
            }
            // choice === 'new' → giữ IS_EDIT=false để đi nhánh NEW, RPC sẽ cấp số mới
        }
    }

    // (giữ nguyên nhánh EDIT nhập của bạn)


    // === NHÁNH NEW: dùng RPC save_new_header cấp số & insert header ===

    if (!IS_EDIT) {
        // LẤY LOẠI CHỨNG TỪ TỪ Ô #sohd (đã phát sinh sẵn bởi capNhatSoHoaDonTuDong)
        let loai = getLoaiFromSoHDInput();
        if (!loai) {
            await capNhatSoHoaDonTuDong();
            loai = getLoaiFromSoHDInput();
            if (!loai) { alert("❗Chưa xác định được loại chứng từ từ số hóa đơn."); return; }
        }
        const diadiemTrang = loai.includes('cs2') ? 'cs2' : 'cs1';


        const getIntValue = (id) => parseInt(document.getElementById(id).value.replace(/[.,]/g, "") || "0", 10);
        const header = {
            ngay: document.getElementById("ngay").value,
            manv: document.getElementById("manv").value,
            tennv: document.getElementById("tennv").value,
            diadiem: diadiemTrang,
            khachhang: document.getElementById("khachhang").value,
            tongsl: getIntValue("tongsl"),
            tongkm: 0,
            chietkhau: getIntValue("chietkhau"),
            thanhtoan: getIntValue("phaithanhtoan"),
            hinhthuctt: document.getElementById("hinhthuctt").value,
            ghichu: document.getElementById("ghichu")?.value || "",
            dvt: "",
            loaihd: loai,
            loai: loai,
            nhacc: ""
        };

        await refreshSessionIfNeeded();

        const { data: rpcRes, error: rpcErr } = await supabase.rpc('save_new_header', {
            p_loai: loai,
            p_diadiem: diadiemTrang,
            p_header: header
        });

        if (rpcErr || !rpcRes || !rpcRes[0]?.sohd) {
            console.error(rpcErr);
            alert("❌ Lưu HĐ nhập thất bại (cấp số).");
            return;
        }


        const sohdThucTe = rpcRes[0].sohd;
        document.getElementById("sohd").value = sohdThucTe;
        normalizeBangKetQua(getBangKetQua());
        const createdAt = new Date().toISOString();
        const bangKetQuaNEW = getBangKetQua();


        const chitiet = [];
        Object.values(bangKetQuaNEW).forEach(item => {
            item.sizes.forEach((sz, i) => {
                const sl = item.soluongs[i];
                let gia = 0;
                if (window.sanPhamData && window.sanPhamData[item.masp]) {
                    gia = window.sanPhamData[item.masp].gianhap || 0;
                }
                const km = 0;
                chitiet.push({
                    sohd: sohdThucTe,
                    masp: item.masp,
                    tensp: item.tensp,
                    size: sz,
                    soluong: sl,
                    gia,
                    km,
                    thanhtien: (gia - km) * sl,
                    dvt: item.dvt || '',
                    diadiem: diadiemTrang,
                    created_at: createdAt,
                    ngay: document.getElementById("ngay").value
                });
            });
        });

        const { error: errCT } = await supabase.from("ct_hoadon_banle").insert(chitiet);
        if (errCT) {
            alert("❌ Lỗi khi lưu chi tiết nhập.");
            console.error(errCT);
            await supabase.from("hoadon_banle").delete().eq("sohd", sohdThucTe);
            return;
        }

        alert("✅ Đã lưu hóa đơn nhập thành công!");
        inHoaDon({ ...header, sohd: sohdThucTe }, chitiet);
        await lamMoiSauKhiLuu();
        choPhepSua = false;
        return;
    }

    // === PHẦN DƯỚI: Nhánh EDIT (giữ nguyên luồng cũ) ===

    const { data: tonTai } = await supabase
        .from("hoadon_banle")
        .select("sohd")
        .eq("sohd", sohd)
        .maybeSingle();

    if (!tonTai) {
        alert("❌ Không tìm thấy hóa đơn để sửa (nhập).");
        return;
    }


    if (tonTai && !choPhepSua) {
        const p = document.getElementById("popupXacThucSua");
        p.style.display = "block";
        const manvEl = document.getElementById("xacmanv");
        if (manvEl) { manvEl.focus(); manvEl.select(); }
        return;
    }

    // --- FIX timestamp: EDIT không ghi đè created_at, chỉ ghi updated_at ---
    let createdAtGoc = null;
    if (tonTai && choPhepSua) {
        const { data: hdOld, error: eOld } = await supabase
            .from("hoadon_banle")
            .select("created_at")
            .eq("sohd", sohd)
            .maybeSingle();
        if (eOld) console.warn("⚠️ Không đọc được created_at cũ:", eOld);
        createdAtGoc = hdOld?.created_at || null;

        await supabase.from("ct_hoadon_banle").delete().eq("sohd", sohd);
        await supabase.from("hoadon_banle").delete().eq("sohd", sohd);
    }

    const nowIso = new Date().toISOString();
    const createdAtToWrite = createdAtGoc || nowIso;

    const getIntValue = (id) =>
        parseInt(document.getElementById(id).value.replace(/[.,]/g, "") || "0", 10);

    const hoadon = {
        sohd,
        ngay: document.getElementById("ngay").value,
        manv: document.getElementById("manv").value,
        tennv: document.getElementById("tennv").value,
        diadiem: (sohd.split("_")[0] || "").includes("cs2") ? "cs2" : "cs1",
        khachhang: document.getElementById("khachhang").value,
        tongsl: getIntValue("tongsl"),
        tongkm: 0, // Nhập mới không có khuyến mại
        chietkhau: getIntValue("chietkhau"),
        thanhtoan: getIntValue("phaithanhtoan"),
        hinhthuctt: document.getElementById("hinhthuctt").value,
        ghichu: document.getElementById("ghichu")?.value || "",
        created_at: createdAtToWrite,
        updated_at: nowIso,
        loai: "",
        dvt: "",
        loaihd: sohd.split("_")[0],
        nhacc: ""
    };

    const chitiet2 = [];
    Object.values(bangKetQua).forEach(item => {
        item.sizes.forEach((sz, i) => {
            const sl = item.soluongs[i];
            // Ép giá nhập từ dmhanghoa nếu có
            let gia = 0;
            if (window.sanPhamData && window.sanPhamData[item.masp]) {
                gia = window.sanPhamData[item.masp].gianhap || 0;
            }
            const km = 0;
            chitiet2.push({
                sohd,
                masp: item.masp,
                tensp: item.tensp,
                size: sz,
                soluong: sl,
                gia,
                km,
                thanhtien: (gia - km) * sl,
                dvt: item.dvt || '',
                diadiem: (sohd.split("_")[0] || "").includes("cs2") ? "cs2" : "cs1",
                created_at: createdAtToWrite,
                updated_at: nowIso,
                ngay: document.getElementById("ngay").value
            });
        });
    });

    const { error: errHD } = await supabase.from("hoadon_banle").insert([hoadon]);
    const { error: errCT } = await supabase.from("ct_hoadon_banle").insert(chitiet2);

    if (!errHD && !errCT) {
        // Cập nhật lại số_hientai vào bảng sochungtu theo đúng loại và số mới lưu
        const [loai, so] = sohd.split('_');
        const soMoi = parseInt(so, 10);

        const { data: currSoChungTu } = await supabase
            .from("sochungtu")
            .select("so_hientai")
            .eq("loai", loai)
            .single();

        if (!currSoChungTu || soMoi > currSoChungTu.so_hientai) {
            await supabase
                .from("sochungtu")
                .update({ so_hientai: soMoi })
                .eq("loai", loai);
        }

        alert("✅ Đã lưu hóa đơn nhập thành công!");
        inHoaDon(hoadon, chitiet2);
        await lamMoiSauKhiLuu();
        choPhepSua = false;
    }
    else {
        alert("❌ Lỗi khi lưu hóa đơn nhập");
        console.error(errHD || errCT);
    }
}

export async function luuHoaDonCaHaiBan() {
    const sohd = document.getElementById("sohd").value.trim();
    if (!sohd) return alert("❌2b Chưa có số hóa đơn.");
    // Chuẩn hoá size trước khi build chi tiết
    normalizeBangKetQua(getBangKetQua());

    // Chặn trùng số ở cả 2 bảng ngay từ đầu
    if (await hoaDonDaTonTaiAny(sohd)) {
        alert("🚫 Số hóa đơn đã tồn tại ở hệ thống (bảng bán lẻ hoặc bán lẻ T). Vui lòng đổi số khác!");
        return;
    }

    // ==== CHẶN LƯU 2 BẢN NẾU LÀ HÓA ĐƠN CŨ (<=) NGAY ĐẦU HÀM ====
    const [loai, soStr] = sohd.split('_');
    const so = parseInt(soStr, 10);
    const { data: currSoChungTu, error: errSoHienTai } = await supabase
        .from("sochungtu")
        .select("so_hientai")
        .eq("loai", loai)
        .single();
    if (errSoHienTai || !currSoChungTu) {
        alert("❌ Không lấy được số hiện tại từ bảng sochungtu.");
        return;
    }
    if (so <= currSoChungTu.so_hientai) {
        alert("🚫 Không được phép dùng chức năng này để sửa hóa đơn cũ!");
        return;
    }
    // ==== HẾT ĐOẠN CHẶN ====

    // Kiểm tra bảng kết quả có dữ liệu không
    const bangKetQua = getBangKetQua();
    if (!bangKetQua || Object.keys(bangKetQua).length === 0) {
        alert("⛔ Hóa đơn chưa có sản phẩm nào! Không thể lưu hai bản hóa đơn trắng.");
        return;
    }

    // Xác nhận với người dùng trước khi tiếp tục
    const xacNhan = confirm("Bạn có chắc chắn muốn lưu hóa đơn này ?\nNhấn OK để lưu, Huỷ để quay về giao diện hóa đơn.");
    if (!xacNhan) return;


    // ==== HẾT ĐOẠN CHẶN ====

    // TIẾP ĐÓ mới kiểm tra các dữ liệu nhập liệu khác

    // BỔ SUNG CHẶN LƯU Ở ĐÂY:

    const maspChuaNhap = document.getElementById("masp")?.value.trim();
    if (maspChuaNhap && !/\(\d+\)\s*$/.test(maspChuaNhap)) {
        alert("❌ Bạn còn mã sản phẩm chưa thêm vào bảng! Hãy kiểm tra lại trước khi lưu hóa đơn.");
        document.getElementById("masp").focus();
        return;
    }

    const tennv = document.getElementById("tennv").value.trim();
    if (!tennv) return alert("❌ Bạn chưa nhập tên nhân viên bán hàng.");

    // Lấy địa điểm từ localStorage (không lấy từ input)
    //const diadiem = localStorage.getItem("diadiem");
    const prefix = sohd.split("_")[0] || "";
    let diadiem = "cs1";
    if (prefix.includes("cs2")) diadiem = "cs2";
    else if (prefix.includes("cs1")) diadiem = "cs1";

    const createdAt = new Date().toISOString();
    const loaiT = diadiem === "cs1" ? "bancs1T" : "bancs2T";

    // Lấy số hiện tại từ bảng sochungtu
    const { data: row, error } = await supabase
        .from("sochungtu")
        .select("so_hientai")
        .eq("loai", loaiT)
        .single();

    if (error || !row) {
        alert("❌ Không lấy được số chứng từ từ bảng sochungtu.");
        return;
    }

    const soMoi = row.so_hientai + 1;
    const sohdT = `${loaiT}_${String(soMoi).padStart(3, "0")}`;

    // Cập nhật lại số chứng từ mới
    await supabase
        .from("sochungtu")
        .update({ so_hientai: soMoi })
        .eq("loai", loaiT);

    const getIntValue = (id) =>
        parseInt(document.getElementById(id).value.replace(/[.,]/g, "") || "0", 10);

    const hoadon = {
        ngay: document.getElementById("ngay").value,
        manv: document.getElementById("manv").value,
        tennv: document.getElementById("tennv").value,
        diadiem: diadiem,
        khachhang: document.getElementById("khachhang").value,
        tongsl: getIntValue("tongsl"),
        tongkm: getIntValue("tongkm"),
        chietkhau: getIntValue("chietkhau"),
        thanhtoan: getIntValue("phaithanhtoan"),
        hinhthuctt: document.getElementById("hinhthuctt").value,
        ghichu: document.getElementById("ghichu")?.value || "",
        created_at: createdAt,
    };

    const chitiet = [];
    Object.values(bangKetQua).forEach(item => {
        item.sizes.forEach((sz, i) => {
            const sl = item.soluongs[i];
            chitiet.push({
                sohd,
                masp: item.masp,
                tensp: item.tensp,
                size: sz,
                soluong: sl,
                gia: item.gia,
                km: item.km,
                thanhtien: (item.gia - item.km) * sl,
                dvt: item.dvt || '',
                diadiem: diadiem,
                created_at: createdAt,
                ngay: document.getElementById("ngay").value
            });

        });
    });

    //const hoadonChinh = { ...hoadon, sohd };
    //const hoadonPhu = { ...hoadon, sohd: sohdT };

    const hoadonChinh = { ...hoadon, sohd, loaihd: diadiem === 'cs1' ? 'bancs1' : 'bancs2' };
    const hoadonPhu = { ...hoadon, sohd: sohdT, loaihd: diadiem === 'cs1' ? 'bancs1T' : 'bancs2T' };

    const chitietChinh = chitiet.map(ct => ({ ...ct, sohd }));
    const chitietPhu = chitiet.map(ct => ({ ...ct, sohd: sohdT }));

    const { error: errHD } = await supabase.from("hoadon_banle").insert([hoadonChinh]);
    const { error: errCT } = await supabase.from("ct_hoadon_banle").insert(chitietChinh);
    const { error: errHDT } = await supabase.from("hoadon_banleT").insert([hoadonPhu]);
    const { error: errCTT } = await supabase.from("ct_hoadon_banleT").insert(chitietPhu);

    if (errHD || errCT || errHDT || errCTT) {
        // 🧹 Rollback bồi hoàn 4 bảng (an toàn khi một số lệnh có thể chưa chèn được)
        await supabase.from("ct_hoadon_banle").delete().eq("sohd", sohd);
        await supabase.from("hoadon_banle").delete().eq("sohd", sohd);
        await supabase.from("ct_hoadon_banleT").delete().eq("sohd", sohdT);
        await supabase.from("hoadon_banleT").delete().eq("sohd", sohdT);

        alert("❌ Lưu 2 bản thất bại, đã hoàn tác các bản ghi liên quan. Vui lòng thử lại.");
        console.error({ errHD, errCT, errHDT, errCTT });
        return;
    }

    // ✅ Thành công
    //alert("✅ Đã lưu hóa đơn thành công!");

    // Sau khi lưu chi tiết CHÍNH thành công: cập nhật used_for_mt cho tư vấn nhân viên
    await capNhatUsedTuVanSauKhiLuuCT(chitietChinh, hoadonChinh.loaihd, diadiem);

    inHoaDon(hoadonChinh, chitietChinh);
    await lamMoiSauKhiLuu();
    guiHoaDonViettel(sohdT);

}

async function lamMoiSauKhiLuu() {
    const diadiemVal = document.getElementById("diadiem").value;
    const manvVal = document.getElementById("manv").value;
    const tennvVal = document.getElementById("tennv").value;

    document.querySelectorAll("input").forEach(input => {
        if (!["diadiem", "manv", "tennv"].includes(input.id)) input.value = "";
    });

    resetBangKetQua();
    capNhatThongTinTong(getBangKetQua());

    document.getElementById("diadiem").value = diadiemVal;
    document.getElementById("manv").value = manvVal;
    document.getElementById("tennv").value = tennvVal;
    document.getElementById("ngay").value = new Date().toISOString().slice(0, 10);
    // Reset mode về NEW sau khi lưu
    window.HD_CTX = { mode: "NEW", version: null };
    await capNhatSoHoaDonTuDong();
    document.getElementById("masp").focus();
}

export async function xacNhanSuaHoaDon() {
    // 1. Lấy thông tin đăng nhập đã lưu bởi authModule (không dùng ô input nữa)
    const manv =
        localStorage.getItem('manv') ||
        localStorage.getItem('last_login_manv') ||
        '';
    const mk = localStorage.getItem('last_login_password') || '';
    const sohd = (document.getElementById("sohd")?.value || '').trim();

    if (!sohd) {
        alert("❌ Không xác định được số hóa đơn cần sửa.");
        return;
    }

    if (!manv || !mk) {
        alert(
            "❌ Không tìm thấy thông tin đăng nhập trong máy.\n" +
            "Vui lòng đăng xuất và đăng nhập lại, sau đó sửa hóa đơn."
        );
        return;
    }

    // 2. Kiểm tra nhân viên & mật khẩu trong bảng dmnhanvien
    const { data: nv, error: errNV } = await supabase
        .from("dmnhanvien")
        .select("matkhau, sua_hoadon")
        .eq("manv", manv)
        .maybeSingle();

    if (errNV || !nv || nv.matkhau !== mk) {
        alert("❌ Tài khoản đang đăng nhập không hợp lệ hoặc mật khẩu đã thay đổi.");
        return;
    }
    if (nv.sua_hoadon !== true) {
        alert("🚫 Tài khoản đang đăng nhập không có quyền sửa/xóa hóa đơn.");
        return;
    }

    // 3. Kiểm tra hóa đơn thuộc đúng cơ sở đang làm việc
    const { data: hd, error: errHD } = await supabase
        .from("hoadon_banle")
        .select("diadiem, updated_at")
        .eq("sohd", sohd)
        .maybeSingle();

    if (errHD || !hd) {
        alert("❌ Không tìm thấy hóa đơn cần sửa.");
        return;
    }

    const diadiemTrang = getDiaDiemFromPageName && getDiaDiemFromPageName();
    if (diadiemTrang && (hd.diadiem || "").toLowerCase() !== diadiemTrang) {
        alert("🚫 Bạn chỉ được sửa hóa đơn tại cơ sở mình đang đăng nhập!");
        return;
    }

    // 4. Đặt cờ cho phép sửa + context EDIT
    choPhepSua = true;
    window.HD_CTX = {
        mode: "EDIT",
        version: (hd && hd.updated_at) ? hd.updated_at : null
    };

    // Nếu popup tồn tại thì đóng lại (để dùng chung cho mọi trang)
    const popup = document.getElementById("popupXacThucSua");
    if (popup) popup.style.display = "none";

    //alert("✅ Xác thực sửa hóa đơn thành công. Đang lưu lại hóa đơn...");

    // 5. Gọi lại hàm lưu đúng theo loại chứng từ như logic cũ
    if (typeof CCN_CTX !== "undefined" && CCN_CTX.isCCN) {
        // Hóa đơn chuyển chi nhánh
        await luuHoaDonccn1v2();
    } else {
        const sohdNow = (document.getElementById("sohd")?.value || '').trim();
        const prefix = sohdNow.split("_")[0] || "";

        if (prefix.includes("nmcs1") || prefix.includes("nmcs2")) {
            await luuHoaDonNhapQuaAPI();
        } else if (prefix.endsWith("T")) {
            await luuHoaDonCaHaiBan();
        } else {
            await luuHoaDonQuaAPI();
        }
    }
}

function inHoaDon(hoadon, chitiet) {
    const data = { hoadon, chitiet };
    localStorage.setItem("data_hoadon_in", JSON.stringify(data));

    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = "/in-hoadon.html";
    document.body.appendChild(iframe);

    iframe.onload = () => {
        setTimeout(() => {
            try {
                iframe.contentWindow.print();
            } catch (e) {
                console.error("Không thể gọi print() từ iframe:", e);
            } finally {
                iframe.remove();
            }
        }, 500);
    };
}

/* ========================= LƯU CHUYỂN CHI NHÁNH – ĐÃ TÍCH HỢP CCN_CTX ========================= */
export async function luuHoaDonccn1v2() {
    if (!CCN_CTX.isCCN) {
        alert("❗Trang hiện tại không phải trang CCN. Vui lòng mở đúng trang ccn1v2 hoặc ccn2v1.");
        return;
    }
    const loaihd_thucte = CCN_CTX.loaihdGoc;
    const diadiemSRC = CCN_CTX.src.toLowerCase();

    capNhatThongTinTong(getBangKetQua());
    normalizeBangKetQua(getBangKetQua());

    const maspChuaNhap = document.getElementById("masp")?.value.trim();
    if (maspChuaNhap && !/\(\d+\)\s*$/.test(maspChuaNhap)) {
        alert("❌ Bạn còn mã sản phẩm chưa thêm vào bảng!");
        document.getElementById("masp").focus();
        return;
    }

    await ensureCatalogsReady();

    const bangKetQua = getBangKetQua();

    // Normalize sau dán (tránh size null/undefined hoặc số chưa được stringify)
    for (const k of Object.keys(bangKetQua)) {
        const item = bangKetQua[k];
        if (!Array.isArray(item.sizes) || !Array.isArray(item.soluongs)) continue;
        item.sizes = item.sizes.map(sz => {
            const s = String(sz ?? "").trim();
            return s === "" ? "0" : s;
        });
    }

    let sohd = document.getElementById("sohd").value.trim();
    if (!sohd) return alert("❌ Chưa có số hóa đơn.");
    const tennv = document.getElementById("tennv").value.trim();
    if (!tennv) return alert("❌ Bạn chưa nhập tên nhân viên.");

    const prefix = sohd.split("_")[0] || "";
    if (prefix !== loaihd_thucte) {
        alert(`🚫 Số chứng từ không khớp trang. Trang này yêu cầu prefix "${loaihd_thucte}_*".`);
        return;
    }

    // Xác định ý đồ: chỉ SỬA khi đã xác thực (đặt cờ EDIT)
    const IS_EDIT = (window.HD_CTX?.mode === 'EDIT') || !!choPhepSua;

    // Giữ created_at gốc khi SỬA (để không ghi đè created_at)
    let CREATED_AT_GOC = null;
    let CREATED_AT_DOIUNG_GOC = null;

    if (!IS_EDIT) {
        // NEW: nếu số đang nhập đã tồn tại → hỏi người dùng
        const existed = await hoaDonDaTonTai(sohd);
        if (existed) {
            const choice = await showExistDialog(sohd); // 'new' | 'edit'
            if (choice === 'edit') {
                // Người dùng chọn SỬA → bật popup xác thực và dừng
                const p = document.getElementById("popupXacThucSua");
                if (p) {
                    p.style.display = "block";
                    document.getElementById("xacmanv")?.focus();
                }
                return;
            }
            // Người dùng chọn TẠO MỚI → NHỜ RPC cấp số mới CHUẨN theo loaihd_thucte
            {
                const getInt = (id) => parseInt(document.getElementById(id).value.replace(/[.,]/g, "") || "0", 10);

                // Header tạm để RPC ghi dòng header và trả về sohd mới (đúng prefix)
                const headerTmp = {
                    ngay: document.getElementById("ngay").value,
                    manv: document.getElementById("manv").value,
                    tennv: document.getElementById("tennv").value,
                    diadiem: diadiemSRC,                  // 'cs1' hoặc 'cs2' theo CCN_CTX
                    khachhang: document.getElementById("khachhang").value,
                    tongsl: getInt("tongsl"),
                    tongkm: getInt("tongkm"),
                    chietkhau: getInt("chietkhau"),
                    thanhtoan: getInt("phaithanhtoan"),
                    hinhthuctt: document.getElementById("hinhthuctt").value,
                    ghichu: document.getElementById("ghichu")?.value || "",
                    dvt: "",
                    loaihd: loaihd_thucte,                // xcncs1 hoặc xcncs2
                    loai: loaihd_thucte,
                    nhacc: ""
                };

                await refreshSessionIfNeeded();

                const { data: rpcRes, error: rpcErr } = await supabase.rpc('save_new_header', {
                    p_loai: loaihd_thucte,                // <<< QUAN TRỌNG: loại CCN thật sự
                    p_diadiem: diadiemSRC,                // 'cs1'/'cs2'
                    p_header: headerTmp
                });

                if (rpcErr || !rpcRes || !rpcRes[0]?.sohd) {
                    console.error(rpcErr);
                    alert("❌ Không cấp được số hóa đơn mới cho chứng từ chuyển chi nhánh.");
                    return;
                }

                const sohdMoi = rpcRes[0].sohd;        // ví dụ: xcncs1_00052
                document.getElementById('sohd').value = sohdMoi; // cập nhật UI
                sohd = sohdMoi;                        // cập nhật biến làm việc
            }

        }
    } else {
        // EDIT: đảm bảo số đang sửa thực sự tồn tại, nếu không thì báo lỗi
        const existed = await hoaDonDaTonTai(sohd);
        if (!existed) { alert("❌ Không tìm thấy hóa đơn để sửa (CCN)."); return; }


        // Đọc created_at gốc của phiếu gốc + phiếu đối ứng (để giữ nguyên khi EDIT)
        const { data: hdOld, error: eOld } = await supabase
            .from("hoadon_banle")
            .select("created_at")
            .eq("sohd", sohd)
            .maybeSingle();
        if (eOld) console.warn("⚠️ CCN: Không đọc được created_at gốc:", eOld);
        CREATED_AT_GOC = hdOld?.created_at || null;

        // Cho phép xoá để ghi lại (giữ nguyên logic xoá phiếu gốc + đối ứng của bạn)
        // --- COPY từ khối 'if (tonTai && choPhepSua) { ... }' cũ ---
        // Xoá phiếu gốc
        await supabase.from("ct_hoadon_banle").delete().eq("sohd", sohd);
        await supabase.from("hoadon_banle").delete().eq("sohd", sohd);

        // Xoá phiếu đối ứng
        const base = sohd.endsWith("_IN") ? sohd.slice(0, -3) : sohd;
        const parts__ = base.split("_");
        const so__ = parts__[parts__.length - 1];
        const loaiGoc__ = parts__.slice(0, -1).join("_");
        const loaiDoiUng__ = (loaiGoc__ === "xcncs1") ? "ncncs2" : "ncncs1";
        const sohdDoiUng__ = `${loaiDoiUng__}_${so__}`;

        const { data: hdDUOld, error: eDUOld } = await supabase
            .from("hoadon_banle")
            .select("created_at")
            .eq("sohd", sohdDoiUng__)
            .maybeSingle();
        if (eDUOld) console.warn("⚠️ CCN: Không đọc được created_at đối ứng:", eDUOld);
        CREATED_AT_DOIUNG_GOC = hdDUOld?.created_at || null;


        await supabase.from("ct_hoadon_banle").delete().eq("sohd", sohdDoiUng__);
        await supabase.from("hoadon_banle").delete().eq("sohd", sohdDoiUng__);

        // Nối ghi chú sửa (giữ nguyên đoạn bạn đã có)
        let oldNote = document.getElementById("ghichu")?.value || "";
        const manv2 = document.getElementById("manv").value.trim();
        const timestamp2 = new Date().toISOString().slice(0, 19).replace("T", " ");
        const oldEdits2 = (oldNote.match(/Sửa lần/g) || []).length;
        const newEditCount2 = oldEdits2 + 1;
        const newNoteEntry2 = `Sửa lần ${newEditCount2} – ${timestamp2} – ${manv2}`;
        const finalNote2 = oldNote ? oldNote + "\n" + newNoteEntry2 : newNoteEntry2;
        document.getElementById("ghichu").value = finalNote2;
    }

    const createdAt = new Date().toISOString();
    const getIntValue = (id) =>
        parseInt(document.getElementById(id).value.replace(/[.,]/g, "") || "0", 10);

    const hoadon = {
        sohd,
        ngay: document.getElementById("ngay").value,
        manv: document.getElementById("manv").value,
        tennv: document.getElementById("tennv").value,
        diadiem: diadiemSRC,
        khachhang: document.getElementById("khachhang").value,
        tongsl: getIntValue("tongsl"),
        tongkm: getIntValue("tongkm"),
        chietkhau: getIntValue("chietkhau"),
        thanhtoan: getIntValue("phaithanhtoan"),
        hinhthuctt: document.getElementById("hinhthuctt").value,
        ghichu: document.getElementById("ghichu")?.value || "",
        created_at: createdAtToWrite,
        updated_at: IS_EDIT ? nowIso : null,
        loai: "",
        dvt: "",
        loaihd: loaihd_thucte,
        nhacc: ""
    };

    // Chi tiết xuất (SRC)
    const { src, dst } = inferBranches();
    const chitiet = [];
    Object.values(bangKetQua).forEach(item => {
        item.sizes.forEach((sz, i) => {
            const sl = item.soluongs[i];
            const masp = item.masp;
            const sizeInput = String(sz || "").trim() || "0";
            const managedAtSrc = requireManagedAtBranch(masp, src);
            const size_effective_src = managedAtSrc ? sizeInput : "0";

            chitiet.push({
                sohd,
                masp,
                tensp: item.tensp,
                size: size_effective_src,
                soluong: sl,
                gia: item.gia,
                km: item.km,
                thanhtien: (item.gia - item.km) * sl,
                dvt: item.dvt || '',
                diadiem: diadiemSRC,
                created_at: createdAtToWrite,
                updated_at: IS_EDIT ? nowIso : null,
                ngay: document.getElementById("ngay").value
            });
        });
    });

    const { error: errHD } = await supabase
        .from("hoadon_banle")
        .upsert([hoadon], { onConflict: "sohd" });
    const { error: errCT } = await supabase
        .from("ct_hoadon_banle")
        .upsert(chitiet);

    if (errHD || errCT) {
        alert("❌ Lỗi khi lưu hóa đơn (gốc).");
        console.error(errHD || errCT);
        return;
    }

    // Đối ứng (DST)
    const sohdBase = sohd.endsWith("_IN") ? sohd.slice(0, -3) : sohd;
    const parts = sohdBase.split("_");
    const loaiGoc = parts.slice(0, -1).join("_");
    const soStr = parts[parts.length - 1];
    const soMoi = parseInt(soStr, 10);

    const diadiemDoiUng = CCN_CTX.dst.toLowerCase();
    const loaiDoiUng = CCN_CTX.loaihdDoiUng;
    const sohdDoiUng = `${loaiDoiUng}_${soStr}`;

    const hoadonDoiUng = {
        ...hoadon,
        sohd: sohdDoiUng,
        loaihd: loaiDoiUng,
        diadiem: diadiemDoiUng,
        created_at: createdAtDoiUngToWrite,
        updated_at: IS_EDIT ? nowIso : null,
    };

    const chitietDoiUng = [];
    Object.values(bangKetQua).forEach(item => {
        item.sizes.forEach((sz, i) => {
            const sl = item.soluongs[i];
            const masp = item.masp;
            const sizeInput = String(sz || "").trim() || "0";
            const managedAtDst = requireManagedAtBranch(masp, dst);
            const size_effective_dst = managedAtDst ? sizeInput : "0";

            chitietDoiUng.push({
                sohd: sohdDoiUng,
                masp,
                tensp: item.tensp,
                size: size_effective_dst,
                soluong: sl,
                gia: item.gia,
                km: item.km,
                thanhtien: (item.gia - item.km) * sl,
                dvt: item.dvt || '',
                diadiem: diadiemDoiUng,
                created_at: createdAtDoiUngToWrite,
                updated_at: IS_EDIT ? nowIso : null,
                ngay: document.getElementById("ngay").value
            });
        });
    });

    const { error: errDU1 } = await supabase
        .from("hoadon_banle")
        .upsert([hoadonDoiUng], { onConflict: "sohd" });
    const { error: errDU2 } = await supabase
        .from("ct_hoadon_banle")
        .insert(chitietDoiUng); // đã xoá trước nên dùng insert thay vì upsert

    if (errDU1 || errDU2) {
        await supabase.from("ct_hoadon_banle").delete().eq("sohd", sohd);
        await supabase.from("hoadon_banle").delete().eq("sohd", sohd);
        alert("❗Không tạo được hóa đơn đối ứng. Đã huỷ hoá đơn vừa lưu.");
        return;
    }

    // Cập nhật sochungtu
    const { data: currSoChungTu } = await supabase
        .from("sochungtu")
        .select("so_hientai")
        .eq("loai", loaiGoc)
        .single();
    if (!currSoChungTu || soMoi > currSoChungTu.so_hientai) {
        await supabase.from("sochungtu").update({ so_hientai: soMoi }).eq("loai", loaiGoc);
    }
    const { data: currSoChungTuDoiUng } = await supabase
        .from("sochungtu")
        .select("so_hientai")
        .eq("loai", loaiDoiUng)
        .single();
    if (!currSoChungTuDoiUng || soMoi > currSoChungTuDoiUng.so_hientai) {
        await supabase.from("sochungtu").update({ so_hientai: soMoi }).eq("loai", loaiDoiUng);
    }

    alert("✅ Đã lưu hóa đơn CCN (cả gốc và đối ứng)!");
    inHoaDon(hoadon, chitiet);
    await lamMoiSauKhiLuu();
    choPhepSua = false;
}


/* ===== expose ===== */

window.luuHoaDonccn1v2 = luuHoaDonccn1v2; // expose đúng hàm lưu chuyển chi nhánh
window.luuHoaDonNhapQuaAPI = luuHoaDonNhapQuaAPI; // nếu muốn giữ hàm nhập qua API cho các trang khác
