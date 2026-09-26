
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

export async function getServerNowISO() {
    const { data, error } = await supabase.rpc("server_now_iso");
    if (error || !data) {
        console.error("server_now_iso error:", error);
        throw new Error("GET_SERVER_NOW_FAILED");
    }
    return String(data);
}

export async function getServerTodayVN() {
    const { data, error } = await supabase.rpc("server_today_vn");
    if (error || !data) {
        console.error("server_today_vn error:", error);
        throw new Error("GET_SERVER_TODAY_FAILED");
    }
    return String(data);
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

        const loaiNorm = String(loai || "").toLowerCase();
        if (loaiNorm !== "bancs1" && loaiNorm !== "bancs2") return;

        // V2: CHỈ claim theo ID nguồn đã match FIFO.
        // Tuyệt đối không "dọn rác" tất cả dòng cùng mã như phiên bản cũ.
        const ids = Array.from(new Set(
            chitiet
                .map(ct => Number(ct?.tu_van_ct_id || 0))
                .filter(id => Number.isInteger(id) && id > 0)
        ));

        if (!ids.length) return;

        const { error } = await supabase
            .from("ct_hoadon_banle")
            .update({
                used_for_mt: true,
                nvban_match: true
            })
            .in("id", ids)
            .eq("used_for_mt", false);

        if (error) {
            console.error("Lỗi claim tư vấn theo tu_van_ct_id:", error);
        }
    } catch (err) {
        console.error("Lỗi capNhatUsedTuVanSauKhiLuuCT:", err);
    }
}
