// danhMucHangHoa.js

import { supabase } from "./supabaseClient.js";

let cacheDanhMuc = [];
let cacheMap = new Map();
let dangTai = false;

function normalizeMasp(v) {
    return String(v || "")
        .trim()
        .toUpperCase()
        .split("_")[0];
}

// ======================
// NẠP DANH MỤC
// ======================

export async function napDanhMucHangHoa(force = false) {

    if (!force && cacheDanhMuc.length) {
        return cacheDanhMuc;
    }

    if (dangTai) {
        while (dangTai) {
            await new Promise(r => setTimeout(r, 100));
        }
        return cacheDanhMuc;
    }

    dangTai = true;

    const { data, error } = await supabase
        .from("dmhanghoa")
        .select(`
            masp,
            tensp,
            mangan,
            nhomhang,
            chungloai,
            nhacc,
            vitrikho1,
            vitrikho2,
            vitrikho3,
            treomaucs1,
            treomaucs2,
            quanlykichco,
            active
        `)
        .order("masp")
        .limit(100000);

    dangTai = false;

    if (error) {
        console.error(error);
        throw error;
    }

    cacheDanhMuc = data || [];
    cacheMap.clear();

    cacheDanhMuc.forEach(row => {
        cacheMap.set(normalizeMasp(row.masp), row);
    });

    return cacheDanhMuc;
}

// ======================
// KIỂM TRA MÃ
// ======================

export async function kiemTraMasp(masp) {

    await napDanhMucHangHoa();

    return cacheMap.has(normalizeMasp(masp));
}

// ======================
// LẤY THÔNG TIN HÀNG
// ======================

export async function layHangHoa(masp) {

    await napDanhMucHangHoa();

    return cacheMap.get(
        normalizeMasp(masp)
    ) || null;
}

// ======================
// DANH SÁCH MÃ SP
// ======================

export async function layDanhSachMasp() {

    await napDanhMucHangHoa();

    return cacheDanhMuc.map(
        x => normalizeMasp(x.masp)
    );
}

// ======================
// XÓA CACHE
// ======================

export function xoaCacheDanhMuc() {

    cacheDanhMuc = [];
    cacheMap.clear();
}
