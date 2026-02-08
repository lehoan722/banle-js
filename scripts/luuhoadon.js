// luuhoadon.js

/**
 * =========================
 * MODULE: LƯU HÓA ĐƠN MT
 * =========================
 * Mục tiêu: Lưu hóa đơn bán lẻ / nhập-xuất theo luồng chuẩn (NEW/EDIT),
 *           và có cơ chế đặc biệt "Lưu 2 bản" để gửi hóa đơn điện tử Viettel.
 *
 * Tổng quan luồng:
 * - luuhoadon.js là file điều phối chính: đọc UI → validate → quyết định NEW/EDIT →
 *   gọi RPC cấp số (NEW) → insert header + chi tiết → (nếu số đặc biệt) thì chuyển sang lưu 2 bản →
 *   in hóa đơn / reset form / thông báo.
 *
 * Danh sách file và nhiệm vụ: 
 *
 * 1) luuhoadon.js  (Orchestrator / Controller)
 *    - Điều phối toàn bộ thao tác bấm "Lưu"
 *    - Nhánh NEW/EDIT:
 *       + NEW: gọi RPC save_new_header_v2 để cấp số sohd 
 *       + EDIT: kiểm tra quyền sửa, xác thực sửa
 *    - Ghi dữ liệu:
 *       + Lưu 1 bản: hoadon_banle + ct_hoadon_banle
 *       + Lưu 2 bản: hoadon_banle + ct_hoadon_banle + hoadon_banleT + ct_hoadon_banleT
 *    - Sau khi lưu: in hóa đơn, reset UI, gọi các update phụ (nếu có)
 *
 * 2) builders.js  (Rules / Gating / Điều kiện đặc biệt)
 *    - Các hàm suy luận bối cảnh:
 *       + Lấy cơ sở từ pathname/title (cs1/cs2)
 *       + Lấy loại chứng từ (prefix) từ ô số hóa đơn hoặc từ trang
 *    - Cơ chế "SỐ ĐẶC BIỆT → LƯU 2 BẢN → GỬI VIETTEL":
 *       + Chỉ áp dụng cho bancs1/bancs2
 *       + Quy tắc chia hết theo cơ sở (cs1 mod 4, cs2 mod 6)
 *       + Khống chế hạn mức tiền theo ngày dựa trên bảng hoadon_banleT
 *       + Nếu đạt điều kiện → gọi luuHoaDonCaHaiBan() (hàm nằm trong luuhoadon.js)
 *
 * 3) pricing.js  (Tính tiền / Chuẩn hóa số liệu)
 *    - Chuẩn hóa dữ liệu tiền/số lượng từ bảng sản phẩm
 *    - Tính tổng thành tiền / tổng KM / phải thanh toán (nếu module dùng)
 *    - Nơi hợp lý để thống nhất cách tính thay vì rải rác trong luuhoadon.js
 *
 * 4) validators.js  (Ràng buộc / Kiểm tra đầu vào)
 *    - Các rule validate trước khi cho lưu:
 *       + Mã sản phẩm hợp lệ, size hợp lệ, số lượng hợp lệ
 *       + Các rule đặc thù theo cơ sở / nhóm hàng / quản lý kích cỡ
 *    - Nếu fail → chặn lưu + thông báo
 *
 * 5) api.js  (API helper / Các tác vụ phụ liên quan Supabase)
 *    - Các hàm gọi Supabase dùng chung:
 *       + kiểm tra hóa đơn tồn tại (hoaDonDaTonTai...)
 *       + refresh session / xử lý lỗi mạng (nếu có)
 *       + các update phụ sau lưu (capNhatUsedTuVan... / đồng bộ liên quan)
 *
 * Ghi chú quan trọng khi làm việc với module:
 * - Khi sửa logic "gửi Viettel / lưu 2 bản" → thường nằm ở builders.js + luuhoadon.js
 * - Khi sửa logic "tính tiền" → ưu tiên pricing.js
 * - Khi sửa rule chặn lưu (validate) → ưu tiên validators.js
 */


import { supabase } from './supabaseClient.js';
import { resetBangKetQua, getBangKetQua } from './hoadon.js';

import { capNhatThongTinTong } from './utils.js';
import { capNhatSoHoaDonTuDong } from './sohoadon.js';

import { guiHoaDonViettel } from './viettelInvoice.js';

import { refreshSessionIfNeeded, hoaDonDaTonTai, hoaDonDaTonTaiAny, ensureCatalogsReady, capNhatUsedTuVanSauKhiLuuCT } from './luuhoadon/api.js';
import { buildCCNCtxFromPathname, ensureExistDialog, showExistDialog, getDiaDiemFromLoai, getDiaDiemFromPageName, getLoaiFromSoHDInput, handleSpecialSoHoaDon, inferBranches } from './luuhoadon/builders.js';
import { normalizeBangKetQua, calcTongThanhTienFromBangKetQua } from './luuhoadon/pricing.js';
import { resolveGroupKeyFromSP, requireManagedAtBranch } from './luuhoadon/validators.js';

// ===== Toast fallback (tránh lỗi ReferenceError nếu chưa có UI toast) =====
function toastError(msg) {
    alert('❌ ' + msg);
}



// =========================
// TỔNG THÀNH TIỀN (ẩn)
// tongthanhtien = SUM( (gia - km) * soluong ) theo từng size/dòng
// =========================


// === HD_CTX: trạng thái NEW/EDIT cho luồng lưu hóa đơn ===
window.HD_CTX = window.HD_CTX || { mode: 'NEW', version: null };

// === Helpers chung, dùng lại toàn file ===
const getInt = (id) => parseInt((document.getElementById(id)?.value || "").replace(/[.,]/g, "") || "0", 10);

// Chuẩn hoá mảng size: rỗng -> "0"
// Lấy địa điểm từ prefix loại
// Kiểm tra trùng số ở cả 2 bảng bán lẻ (chính và T)
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

// ===== Modal "Số hóa đơn đã tồn tại" với 2 nút to (Tạo mới / Sửa) =====





let choPhepSua = false;

// --- BẮT BUỘC: nạp catalog nếu chưa có (dùng riêng cho trang CCN) ---
// --- BẮT BUỘC: nạp catalog nếu chưa có (dùng riêng cho trang CCN) ---
// [ADD – đặt gần đầu file luuhoadon.js, trước khi dùng tới trong xacNhanSuaHoaDon()]

/***** CCN HELPERS (kiểm tra nếu là ccn thì goi inferBranches chuyển đổi size theo từng cơ sở) *****/
/* ========================= CCN CONTEXT (ĐÓNG BĂNG CHIỀU CHUYỂN) ========================= */
/* [MỚI] Đóng băng bối cảnh CCN theo chính tên trang, không dùng localStorage ở trang CCN */
// [MỚI] Tạo context 1 lần, giữ cố định cho toàn phiên của tab
const CCN_CTX = buildCCNCtxFromPathname();

/* [MỚI] inferBranches() nay trả về từ CCN_CTX nếu là trang CCN,
   còn trang khác (bán lẻ/nhập) giữ nguyên suy luận cũ theo prefix số chứng từ */
/* [MỚI] Nhận diện "quản size" theo CHỦNG LOẠI (GD = giày dép) & theo NHÓM (quanlysize + diadiem) */

// luuhoadon.js


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
    // =========================
    // GUARD: CHẶN manv KHÔNG HỢP LỆ (ADMIN / rỗng)
    // =========================
    const manvGuard =
        document.getElementById("manv")?.value?.trim() ||
        localStorage.getItem("manv");

    if (!manvGuard || manvGuard.toUpperCase() === "ADMIN") {
        alert("❌ Lỗi xác định nhân viên (manv). Vui lòng đăng nhập lại.");
        console.error("GUARD BLOCKED SAVE – manv =", manvGuard);
        return;
    }

    // ✅ trạng thái UI: "moi" | "xem"
    const hdState = (document.getElementById("hd_state")?.value || "moi").trim().toLowerCase();

    // ✅ chốt an toàn: chỉ coi là EDIT khi đã xác thực
    const IS_EDIT = (window.HD_CTX?.mode === 'EDIT') || !!choPhepSua;

    // ✅ đang xem hóa đơn cũ => không cho lưu trực tiếp, bắt xác thực sửa
    if (hdState === "xem" && !IS_EDIT) {
        const p = document.getElementById("popupXacThucSua");
        if (p) {
            p.style.display = "block";
            document.getElementById("xacmanv")?.focus();
        } else {
            alert("❌ Bạn đang xem hóa đơn cũ. Vui lòng bấm SỬA để xác thực trước khi lưu.");
        }
        return;
    }


    // 2) KHỐI SỐ ĐẶC BIỆT (phải đứng SAU dòng trên)
    if (!IS_EDIT) {
        const existed = await hoaDonDaTonTaiAny(sohd);
        if (!existed && await handleSpecialSoHoaDon(supabase, sohd)) {
            return; // đã lưu 2 bản xong thì thoát sớm
        }
    }

    // ✅ Nếu số đang gõ bị trùng:
    // - hd_state="moi"  => vẫn cho NEW (RPC sẽ tự cấp số mới, không hỏi)
    // - hd_state="xem"  => bắt xác thực sửa (đã chặn ở đầu hàm)
    // - IS_EDIT=true    => cho đi sửa
    if (!IS_EDIT) {
        const existed = await hoaDonDaTonTaiAny(sohd);
        if (existed && hdState !== "moi") {
            const p = document.getElementById("popupXacThucSua");
            if (p) {
                p.style.display = "block";
                document.getElementById("xacmanv")?.focus();
            } else {
                alert("❌ Hóa đơn đã tồn tại. Vui lòng xác thực sửa trước khi lưu.");
            }
            return;
        }
    }

    // === NHÁNH NEW: dùng RPC save_new_header_v2 cấp số & insert header ===

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
            tongthanhtien: calcTongThanhTienFromBangKetQua(bangKetQua),
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

        const { data: rpcRes, error: rpcErr } = await supabase.rpc('save_new_header_v2', {
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
        const createdAt = new Date().toISOString();
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
        .select("sohd, created_at")
        .eq("sohd", sohd)
        .maybeSingle();

    if (!tonTai) {
        alert("❌ Không tìm thấy hóa đơn để sửa. Vui lòng kiểm tra lại số HĐ hoặc chuyển sang tạo mới.");
        return;
    }

    if (tonTai && !choPhepSua) {
        const ok = confirm("Hóa đơn đã tồn tại. Bạn có chắc muốn SỬA / GHI ĐÈ hóa đơn này không?");
        if (!ok) return;

        // CHỐT: chỉ MIN/Admin mới được sửa (tránh nhân viên thường vô tình ghi đè)
        let isAdmin = false;
        try {
            const { data, error } = await supabase.rpc('is_admin');
            isAdmin = !error && data === true;
        } catch (e) {
            isAdmin = false;
        }
        if (!isAdmin) {
            alert("❌ Bạn không có quyền sửa hóa đơn. Chỉ tài khoản MIN/Admin mới được sửa/xóa.");
            return;
        }

        choPhepSua = true;
        window.choPhepSua = true;
        if (window.HD_CTX) window.HD_CTX.mode = "EDIT";
    }

    // ===== EDIT MODE (ghi đè) =====
    // Nếu đang sửa hóa đơn (đã tồn tại + đã được cho phép sửa), ta KHÔNG delete/insert trực tiếp ở client nữa.
    // Thay vào đó sẽ gọi RPC (transaction) để: log diff + replace an toàn.
    const isEditMode = !!(tonTai && choPhepSua);

    const isConfirmEdit = (window.HD_CTX?.fromConfirm === true) && (window.HD_CTX?.mode === "EDIT");
    const updatedAt = isConfirmEdit ? (window.HD_CTX?.edit_at || new Date().toISOString()) : null;
    const createdAt = (tonTai && choPhepSua && tonTai.created_at) ? tonTai.created_at : new Date().toISOString();

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
        tongthanhtien: calcTongThanhTienFromBangKetQua(bangKetQua),
        tongkm: getIntValue("tongkm"),
        chietkhau: getIntValue("chietkhau"),
        thanhtoan: getIntValue("phaithanhtoan"),
        hinhthuctt: document.getElementById("hinhthuctt").value,
        ghichu: document.getElementById("ghichu")?.value || "",
        created_at: createdAt,
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
                created_at: createdAt,
                ngay: document.getElementById("ngay").value
            });
        });
    });


    if (updatedAt) {
        hoadon.updated_at = updatedAt;
        chitiet.forEach(r => r.updated_at = updatedAt);
    }

    // ===== LƯU HÓA ĐƠN =====
    // - Nếu isEditMode: gọi RPC để log + replace trong 1 transaction
    // - Nếu không: insert như cũ
    let errHD = null;
    let errCT = null;

    if (isEditMode) {
        const { error: rpcErr } = await supabase.rpc('admin_edit_invoice_replace_with_log', {
            p_sohd: sohd,
            p_source: location.pathname,
            p_new_header: hoadon,
            p_new_details: chitiet
        });
        if (rpcErr) {
            alert('❌ Sửa hóa đơn thất bại: ' + (rpcErr.message || rpcErr));
            console.error(rpcErr);
            return;
        }
    } else {
        const r1 = await supabase.from("hoadon_banle").insert([hoadon]);
        errHD = r1.error;
        if (errHD) {
            alert("❌ Lỗi khi lưu hóa đơn (header). Có thể bạn không có quyền sửa, hoặc số HĐ bị trùng.");
            console.error(errHD);
            return;
        }

        const r2 = await supabase.from("ct_hoadon_banle").insert(chitiet);
        errCT = r2.error;
        if (errCT) {
            alert("❌ Lỗi khi lưu chi tiết hóa đơn.");
            console.error(errCT);
            // rollback best-effort để tránh header không có chi tiết
            try { await supabase.from("hoadon_banle").delete().eq("sohd", sohd); } catch (e) { }
            return;
        }
    }

    // Nếu tới đây là OK
    {
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


    // === NHÁNH NEW: dùng RPC save_new_header_v2 cấp số & insert header ===

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
            tongthanhtien: calcTongThanhTienFromBangKetQua(bangKetQua),
            tongkm: 0,
            chietkhau: getIntValue("chietkhau"),
            thanhtoan: getIntValue("phaithanhtoan"),
            hinhthuctt: document.getElementById("hinhthuctt").value,
            ghichu: document.getElementById("ghichu")?.value || "",
            dvt: "",
            loaihd: loai,
            loai: loai,
            nhacc: "",
            updated_at: null
        };

        await refreshSessionIfNeeded();

        const { data: rpcRes, error: rpcErr } = await supabase.rpc('save_new_header_v2', {
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
        .select("sohd, created_at")
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

    if (tonTai && choPhepSua) {
        await supabase.from("ct_hoadon_banle").delete().eq("sohd", sohd);
        await supabase.from("hoadon_banle").delete().eq("sohd", sohd);
    }
    const isConfirmEdit = (window.HD_CTX?.fromConfirm === true) && (window.HD_CTX?.mode === "EDIT");
    const updatedAt = isConfirmEdit ? (window.HD_CTX?.edit_at || new Date().toISOString()) : null;
    const createdAt = (tonTai && choPhepSua && tonTai.created_at) ? tonTai.created_at : new Date().toISOString();

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
        tongthanhtien: calcTongThanhTienFromBangKetQua(bangKetQua),
        tongkm: 0, // Nhập mới không có khuyến mại
        chietkhau: getIntValue("chietkhau"),
        thanhtoan: getIntValue("phaithanhtoan"),
        hinhthuctt: document.getElementById("hinhthuctt").value,
        ghichu: document.getElementById("ghichu")?.value || "",
        created_at: createdAt,
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
                created_at: createdAt,
                ngay: document.getElementById("ngay").value
            });
        });
    });

    if (updatedAt) {
        hoadon.updated_at = updatedAt;
        chitiet2.forEach((r) => r.updated_at = updatedAt);
    }

    const { error: errHD } = await supabase.from("hoadon_banle").insert([hoadon]);
    if (errHD) {
        alert("❌ Lỗi khi lưu hóa đơn nhập (header). Có thể bạn không có quyền sửa, hoặc số HĐ bị trùng.");
        console.error(errHD);
        return;
    }

    const { error: errCT } = await supabase.from("ct_hoadon_banle").insert(chitiet2);
    if (errCT) {
        alert("❌ Lỗi khi lưu chi tiết hóa đơn nhập.");
        console.error(errCT);
        try { await supabase.from("hoadon_banle").delete().eq("sohd", sohd); } catch (e) { }
        return;
    }

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

    choPhepSua = false;
    window.HD_CTX = null;

}

export async function luuHoaDonCaHaiBan() {
    const sohd = document.getElementById("sohd").value.trim();
    if (!sohd) return alert("❌2b Chưa có số hóa đơn.");

    const isConfirmEdit = (window.HD_CTX?.fromConfirm === true) && (window.HD_CTX?.mode === "EDIT");
    const updatedAt = isConfirmEdit ? (window.HD_CTX?.edit_at || new Date().toISOString()) : null;

    // Chuẩn hoá size trước khi build chi tiết
    normalizeBangKetQua(getBangKetQua());

    // Chặn trùng số ở cả 2 bảng ngay từ đầu
    if (!isConfirmEdit && await hoaDonDaTonTaiAny(sohd)) {
        alert("🚫 Số hóa đơn đã tồn tại ở hệ thống (bảng bán lẻ hoặc bán lẻ T). Vui lòng đổi số khác!");
        return;
    }

    // ==== CHẶN LƯU 2 BẢN NẾU LÀ HÓA ĐƠN CŨ (<=) NGAY ĐẦU HÀM ====
    if (!isConfirmEdit) {
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
    // =========================
    // GUARD: CHẶN manv KHÔNG HỢP LỆ (ADMIN / rỗng)
    // =========================
    const manvGuard =
        document.getElementById("manv")?.value?.trim() ||
        localStorage.getItem("manv");

    if (!manvGuard || manvGuard.toUpperCase() === "ADMIN") {
        alert("❌ Lỗi xác định nhân viên (manv). Vui lòng đăng nhập lại.");
        console.error("GUARD BLOCKED SAVE – manv =", manvGuard);
        return;
    }

    // Lấy địa điểm từ localStorage (không lấy từ input)
    //const diadiem = localStorage.getItem("diadiem");
    const prefix = sohd.split("_")[0] || "";
    let diadiem = "cs1";
    if (prefix.includes("cs2")) diadiem = "cs2";
    else if (prefix.includes("cs1")) diadiem = "cs1";

    // Nếu đang sửa: giữ nguyên created_at gốc + ghi updated_at
    let createdAtGoc = null;
    if (isConfirmEdit) {
        const { data: hdOld } = await supabase
            .from("hoadon_banle")
            .select("created_at")
            .eq("sohd", sohd)
            .maybeSingle();
        const { data: hdOldT } = await supabase
            .from("hoadon_banleT")
            .select("created_at")
            .eq("sohd", sohd)
            .maybeSingle();
        createdAtGoc = hdOld?.created_at || hdOldT?.created_at || null;

        // Xoá dữ liệu cũ để ghi lại (giữ nguyên luồng insert phía dưới)
        await supabase.from("ct_hoadon_banle").delete().eq("sohd", sohd);
        await supabase.from("ct_hoadon_banleT").delete().eq("sohd", sohd);
        await supabase.from("hoadon_banle").delete().eq("sohd", sohd);
        await supabase.from("hoadon_banleT").delete().eq("sohd", sohd);
    }

    const createdAt = (isConfirmEdit && createdAtGoc) ? createdAtGoc : new Date().toISOString();
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
        tongthanhtien: calcTongThanhTienFromBangKetQua(bangKetQua),
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


    if (updatedAt) {
        hoadonChinh.updated_at = updatedAt;
        hoadonPhu.updated_at = updatedAt;
        chitietChinh.forEach(r => r.updated_at = updatedAt);
        chitietPhu.forEach(r => r.updated_at = updatedAt);
    }

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
    // ✅ Lưu 2 bản = hóa đơn đặc biệt (gửi Viettel) ⇒ ép in template đặc biệt
    inHoaDon(hoadonChinh, chitietChinh, true);
    //inHoaDon(hoadonChinh, chitietChinh); 

    await lamMoiSauKhiLuu();
    guiHoaDonViettel(sohdT);

}

async function lamMoiSauKhiLuu() {
    const diadiemVal = document.getElementById("diadiem").value;
    const manvVal = document.getElementById("manv").value;
    const tennvVal = document.getElementById("tennv").value;

    document.querySelectorAll("input").forEach(input => {
        if (!["diadiem", "manv", "tennv", "hd_state"].includes(input.id)) input.value = "";
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
    // ✅ sau khi reset + cấp số mới => trạng thái mặc định là "moi"
    const st = document.getElementById("hd_state");
    if (st) st.value = "moi";

    document.getElementById("masp").focus();
}

export async function xacNhanSuaHoaDon() {
    const popup = document.getElementById("popupXacThucSua");
    const closePopup = () => {
        if (popup) popup.style.display = "none";
    };

    //const ok = confirm("Bạn có chắc muốn SỬA (ghi đè) hóa đơn này không?");
    //if (!ok) {
    //   closePopup();
    //  return;
    // }

    // 1) Bắt buộc phải có session đăng nhập
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            toastError("Phiên đăng nhập đã hết. Vui lòng đăng xuất và đăng nhập lại.");
            closePopup();
            return;
        }
    } catch (e) {
        toastError("Không kiểm tra được phiên đăng nhập. Vui lòng tải lại trang.");
        closePopup();
        return;
    }

    // 2) Kiểm tra quyền bằng RPC is_admin() để báo lỗi sớm
    try {
        const { data: isAdmin, error } = await supabase.rpc('is_admin');
        if (error || isAdmin !== true) {
            toastError("Bạn không có quyền sửa hóa đơn.");
            closePopup();
            return;
        }
    } catch (e) {
        toastError("Không kiểm tra được quyền sửa hóa đơn. Vui lòng đăng nhập lại bằng tài khoản MIN/Admin.");
        closePopup();
        return;
    }

    // 3) Đánh dấu đang sửa + cho phép ghi đè
    window.dangSuaHoaDon = true;
    window.choPhepSua = true;
    choPhepSua = true;

    // 4) Ghi thời điểm sửa để lưu vào updated_at (hoadon + chi tiết)
    const editAt = new Date().toISOString();
    window.HD_CTX = {
        ...(window.HD_CTX || {}),
        mode: "EDIT",
        fromConfirm: true,
        edit_at: editAt
    };

    // 5) Đóng popup (nếu đang mở) để người dùng không phải đóng thêm lần nữa
    closePopup();

    // 6) Tiếp tục lưu hóa đơn theo đúng loại trang
    // - Nếu là trang CHUYỂN CHI NHÁNH (CCN): phải gọi luuHoaDonccn1v2() để tự tạo/ghi đè hóa đơn đối ứng
    // - Các trang khác: giữ nguyên luuHoaDonQuaAPI()
    if (typeof CCN_CTX !== "undefined" && CCN_CTX?.isCCN && typeof luuHoaDonccn1v2 === "function") {
        await luuHoaDonccn1v2();
    } else {
        // UPDATE sẽ bị chặn bởi RLS nếu không đủ quyền
        await luuHoaDonQuaAPI();
    }
}

// forceSpecial = true ⇒ luôn in hóa đơn đặc biệt (/in-hoadon-db.html)
function inHoaDon(hoadon, chitiet, forceSpecial = false) {
    const data = { hoadon, chitiet };
    localStorage.setItem("data_hoadon_in", JSON.stringify(data));

    const iframe = document.createElement("iframe");
    iframe.style.display = "none";

    const isHoaDonDacBiet =
        forceSpecial || (document.getElementById("sohd")?.getAttribute("data-mod3") === "yes");

    iframe.src = isHoaDonDacBiet ? "/in-hoadon-db.html" : "/in-hoadon.html";

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

    const isConfirmEdit = (window.HD_CTX?.fromConfirm === true) && (window.HD_CTX?.mode === 'EDIT');
    const updatedAt = isConfirmEdit ? (window.HD_CTX?.edit_at || new Date().toISOString()) : null;
    let createdAtGoc = null;
    let createdAtDoiUngGoc = null;


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

                const { data: rpcRes, error: rpcErr } = await supabase.rpc('save_new_header_v2', {
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

        // Cho phép xoá để ghi lại (giữ nguyên logic xoá phiếu gốc + đối ứng của bạn)
        // --- COPY từ khối 'if (tonTai && choPhepSua) { ... }' cũ ---
        // Xác định số đối ứng trước (để còn lấy created_at gốc khi đang sửa)
        const base = sohd.endsWith("_IN") ? sohd.slice(0, -3) : sohd;
        const parts__ = base.split("_");
        const so__ = parts__[parts__.length - 1];
        const loaiGoc__ = parts__.slice(0, -1).join("_");
        const loaiDoiUng__ = (loaiGoc__ === "xcncs1") ? "ncncs2" : "ncncs1";
        const sohdDoiUng__ = `${loaiDoiUng__}_${so__}`;

        // Lấy created_at gốc (chỉ khi đang sửa qua xacNhanSuaHoaDon)
        if (isConfirmEdit) {
            const { data: hdOld } = await supabase
                .from("hoadon_banle")
                .select("created_at")
                .eq("sohd", sohd)
                .maybeSingle();
            const { data: hdOldDU } = await supabase
                .from("hoadon_banle")
                .select("created_at")
                .eq("sohd", sohdDoiUng__)
                .maybeSingle();
            createdAtGoc = hdOld?.created_at || null;
            createdAtDoiUngGoc = hdOldDU?.created_at || null;
        }

        // Xoá phiếu gốc
        await supabase.from("ct_hoadon_banle").delete().eq("sohd", sohd);
        await supabase.from("hoadon_banle").delete().eq("sohd", sohd);

        // Xoá phiếu đối ứng
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
    const createdAt = (isConfirmEdit && createdAtGoc) ? createdAtGoc : new Date().toISOString();
    const createdAtDoiUng = (isConfirmEdit && createdAtDoiUngGoc) ? createdAtDoiUngGoc : createdAt;
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
        tongthanhtien: calcTongThanhTienFromBangKetQua(bangKetQua),
        tongkm: getIntValue("tongkm"),
        chietkhau: getIntValue("chietkhau"),
        thanhtoan: getIntValue("phaithanhtoan"),
        hinhthuctt: document.getElementById("hinhthuctt").value,
        ghichu: document.getElementById("ghichu")?.value || "",
        created_at: createdAt,
        loai: "",
        dvt: "",
        loaihd: loaihd_thucte,
        nhacc: ""
    };

    if (updatedAt) {
        hoadon.updated_at = updatedAt;
    }

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
                created_at: createdAt,
                ngay: document.getElementById("ngay").value
            });
        });
    });


    if (updatedAt) {
        chitiet.forEach((r) => r.updated_at = updatedAt);
    }
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
        created_at: createdAtDoiUng
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
                created_at: createdAtDoiUng,
                ngay: document.getElementById("ngay").value
            });
        });
    });


    if (updatedAt) {
        chitietDoiUng.forEach((r) => r.updated_at = updatedAt);
    }
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
