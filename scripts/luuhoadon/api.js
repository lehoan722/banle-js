
// scripts/luuhoadon/api.js
// Các hàm liên quan Supabase/API + session/caches
import { supabase } from '../supabaseClient.js';
export async function refreshSessionIfNeeded() {
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

export async function hoaDonDaTonTai(sohd) {
    if (!sohd) return false;
    const { data, error } = await supabase
        .from("hoadon_banle")
        .select("sohd")
        .eq("sohd", sohd)
        .maybeSingle();
    return !!data;
}

export async function hoaDonDaTonTaiAny(sohd) {
    if (!sohd) return false;
    const [r1, r2] = await Promise.all([
        supabase.from("hoadon_banle").select("sohd").eq("sohd", sohd).maybeSingle(),
        supabase.from("hoadon_banleT").select("sohd").eq("sohd", sohd).maybeSingle()
    ]);
    return !!(r1?.data || r2?.data);
}

export async function ensureCatalogsReady() {
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

export async function capNhatUsedTuVanSauKhiLuuCT(chitiet, loai, diadiemTrang) {
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
