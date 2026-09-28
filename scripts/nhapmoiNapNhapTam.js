// HOAN TUYET - nhapmoiNapNhapTam.js V5
import {
    getNhapHangGroupedBangKetQua,
    replaceSize0WithBreakdown
} from "./nhapHangGroupedModel.js?v=500";

const U = (v) => String(v ?? "").trim().toUpperCase();

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

async function findNhapTamRows({ coSo, sohdNhapMoi, masps }) {
    if (!window.supabase) throw new Error("Không tìm thấy window.supabase");

    const { data: nm, error: nmErr } = await window.supabase
        .from("hoadon_banle")
        .select("created_at, diadiem")
        .eq("sohd", sohdNhapMoi)
        .single();

    if (nmErr || !nm?.created_at) {
        throw new Error("Không lấy được created_at của hóa đơn nhập mới. Hãy lưu hóa đơn nmcs trước.");
    }

    const nmCreatedAt = new Date(nm.created_at);
    const dayStart = new Date(nmCreatedAt);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 2);

    const cs = String(nm.diadiem || coSo || "").trim() || coSo;
    const tamPrefix = coSo === "cs1" ? "nhaptamcs1_%" : "nhaptamcs2_%";

    const { data: hdsTam, error: hdErr } = await window.supabase
        .from("hoadon_banle")
        .select("sohd, created_at")
        .eq("diadiem", cs)
        .ilike("sohd", tamPrefix)
        .gte("created_at", dayStart.toISOString())
        .lt("created_at", dayEnd.toISOString());

    if (hdErr) throw new Error("Lỗi khi tìm hóa đơn nhập tạm: " + hdErr.message);

    const sohdTamList = (hdsTam || []).map((x) => x.sohd).filter(Boolean);
    if (!sohdTamList.length) return { rows: [], sohdTamList: [] };

    const maspSet = new Set(masps.map(U));
    let rows = [];

    for (const batch of chunk(sohdTamList, 200)) {
        const { data, error } = await window.supabase
            .from("ct_hoadon_banle")
            .select("sohd, masp, tensp, size, soluong, gia, km, dvt, diadiem")
            .eq("diadiem", cs)
            .in("sohd", batch)
            .neq("size", "0");

        if (error) throw new Error("Lỗi khi tải chi tiết nhập tạm: " + error.message);

        if (Array.isArray(data)) {
            rows.push(...data.filter((r) => maspSet.has(U(r.masp))));
        }
    }

    return { rows, sohdTamList };
}

function aggregateByMasp(rows) {
    const byMasp = new Map();

    (rows || []).forEach((r) => {
        const masp = U(r.masp);
        const size = String(r.size ?? "").trim();
        const sl = Number(r.soluong || 0);

        if (!masp || !size || size === "0" || sl <= 0) return;

        if (!byMasp.has(masp)) byMasp.set(masp, new Map());

        const sizeMap = byMasp.get(masp);
        sizeMap.set(size, Number(sizeMap.get(size) || 0) + sl);
    });

    const out = new Map();
    for (const [masp, sizeMap] of byMasp.entries()) {
        out.set(
            masp,
            Array.from(sizeMap.entries()).map(([size, soluong]) => ({ size, soluong }))
        );
    }
    return out;
}

export async function napNhapTamVaoNhapMoi({ coSo }) {
    coSo = String(coSo || localStorage.getItem("diadiem") || "cs1").toLowerCase();

    const sohd = String(document.getElementById("sohd")?.value || "").trim();
    const prefix = coSo === "cs1" ? "nmcs1_" : "nmcs2_";

    if (!sohd.startsWith(prefix)) {
        alert(`⚠️ Nút này chỉ dùng cho hóa đơn ${prefix}...`);
        return { ok: false, reason: "WRONG_INVOICE_TYPE" };
    }

    const bang = getNhapHangGroupedBangKetQua();
    const masps = Object.keys(bang).map(U).filter(Boolean);

    if (!masps.length) {
        alert("⚠️ Chưa có mã sản phẩm trong hóa đơn nhập mới.");
        return { ok: false, reason: "EMPTY" };
    }

    const found = await findNhapTamRows({
        coSo,
        sohdNhapMoi: sohd,
        masps
    });

    if (!found.sohdTamList.length) {
        alert("ℹ️ Không tìm thấy hóa đơn nhập tạm trong ngày tạo hóa đơn nhập mới và ngày hôm sau.");
        return { ok: false, reason: "NO_TEMP_INVOICE" };
    }

    if (!found.rows.length) {
        alert("ℹ️ Có hóa đơn nhập tạm nhưng không có mã sản phẩm trùng với hóa đơn nhập mới.");
        return { ok: false, reason: "NO_MATCHING_ROWS" };
    }

    const byMasp = aggregateByMasp(found.rows);

    let replaced = 0;
    const mismatches = [];
    const notFound = [];

    for (const masp of masps) {
        const breakdown = byMasp.get(masp);

        if (!breakdown?.length) {
            notFound.push(masp);
            continue;
        }

        const result = replaceSize0WithBreakdown(
            masp,
            breakdown,
            { requireExactTotal: true }
        );

        if (result.ok) replaced++;
        else if (result.reason === "TOTAL_MISMATCH") mismatches.push(result);
    }

    let msg =
        `✅ Đã xử lý nạp nhập tạm\n` +
        `- Hóa đơn tạm tìm thấy: ${found.sohdTamList.length}\n` +
        `- Mã đã thay size chi tiết: ${replaced}`;

    if (mismatches.length) {
        msg += `\n\n⚠️ ${mismatches.length} mã KHÔNG nạp vì lệch tổng:`;
        mismatches.slice(0, 10).forEach((x) => {
            msg += `\n${x.masp}: HĐ nhập=${x.oldTotal}, nhập tạm=${x.newTotal}`;
        });
    }

    if (notFound.length) {
        msg += `\n\nℹ️ ${notFound.length} mã chưa có breakdown nhập tạm.`;
    }

    alert(msg);

    return {
        ok: true,
        replaced,
        mismatches,
        notFound,
        tempInvoices: found.sohdTamList
    };
}

export function bindNapNhapTamButton({ coSo }) {
    const btn = document.getElementById("btnNapNhapTam");
    if (!btn || btn.dataset.napNhapTamV4Bound === "1") return;

    btn.dataset.napNhapTamV4Bound = "1";

    btn.addEventListener("click", () => {
        napNhapTamVaoNhapMoi({ coSo }).catch((err) => {
            console.error("[NHAP MOI NAP NHAP TAM V4]", err);
            alert("❌ Có lỗi khi nạp nhập tạm: " + (err?.message || err));
        });
    });
}
