// /scripts/services/ccnTransferRuleGuard.js

import { supabase } from '../supabaseClient.js';
import {
    normSize,
    calcSuggestionsFromRows,
    hasNegativeStockRows
} from './luatChuyenKho.js';

function getExpectedDir() {
    const p = String(location.pathname || '').toLowerCase();
    if (p.includes('ccn2v1')) return '2v1';
    return '1v2';
}

function getTodayVN() {
    return new Date().toISOString().slice(0, 10);
}

function flattenBangKetQua(bangKetQua) {
    const rows = [];

    Object.values(bangKetQua || {}).forEach(item => {
        const masp = String(item?.masp || '').trim().toUpperCase();
        if (!masp) return;

        const sizes = Array.isArray(item.sizes) ? item.sizes : [];
        const soluongs = Array.isArray(item.soluongs) ? item.soluongs : [];

        sizes.forEach((sz, i) => {
            const size = normSize(sz);
            const sl = Number(soluongs[i] || 0);
            if (!size || sl <= 0) return;

            rows.push({ masp, size, sl });
        });
    });

    return rows;
}

function clearRuleMark() {
    document.querySelectorAll('#bangketqua tbody tr').forEach(tr => {
        tr.style.backgroundColor = '';
        tr.style.color = '';
        tr.style.fontWeight = '';
        tr.title = '';
        tr.dataset.ccnRuleError = '';
    });
}

function markRuleErrors(errors) {
    const badMap = new Map();

    errors.forEach(e => {
        badMap.set(`${e.masp}|${normSize(e.size)}`, e.reason);
    });

    document.querySelectorAll('#bangketqua tbody tr').forEach(tr => {
        const masp = String(tr.cells[0]?.innerText || '').trim().toUpperCase();
        const sizeText = String(tr.cells[2]?.innerText || '');

        let reason = '';

        for (const [key, val] of badMap.entries()) {
            const [m, s] = key.split('|');
            if (m === masp && sizeText.includes(s)) {
                reason = val;
                break;
            }
        }

        if (reason) {
            tr.style.backgroundColor = '#ffcccc';
            tr.style.color = '#900';
            tr.style.fontWeight = '700';
            tr.title = reason;
            tr.dataset.ccnRuleError = '1';
        }
    });

    document
        .querySelector('#bangketqua tbody tr[data-ccn-rule-error="1"]')
        ?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
}

async function fetchSuggestionByMasp(masp) {
    const code = String(masp || '').trim().toUpperCase();

    const [snapRes, kiemRes] = await Promise.all([
        supabase.rpc('xntnhanh', {
            p_masps: [code],
            p_den_ngay: getTodayVN(),
            p_tonghop_size: false
        }),
        supabase.rpc('rpc_stockquick_kiemton', {
            p_masp: code
        })
    ]);

    if (snapRes.error) {
        throw new Error(`Không đọc được tồn/bán hiện tại của mã ${code}`);
    }

    const kiemton = kiemRes?.data || { cs1: {}, cs2: {} };
    const data = Array.isArray(snapRes.data) ? snapRes.data : [];

    const rows = data.map(r => {
        const sizeKey = normSize(r.size);

        return {
            masp: String(r.masp || code).toUpperCase(),
            size: r.size,
            ton_cs1: Number(r.ton_cs1 || 0),
            ton_cs2: Number(r.ton_cs2 || 0),
            lech_cs1: Number(kiemton?.cs1?.lech?.[sizeKey] || 0),
            lech_cs2: Number(kiemton?.cs2?.lech?.[sizeKey] || 0),
            ban_cs1: Number(r.ban_cs1 || 0),
            ban_cs2: Number(r.ban_cs2 || 0),
            tong_ban: Number(r.tong_ban || 0),
            tong_nhap: Number(r.tong_nhap || 0),
            tong_ton: Number(r.tong_ton || 0)
        };
    });

    const hasNegative = hasNegativeStockRows(rows);
    const suggestions = hasNegative ? [] : calcSuggestionsFromRows(rows, code);

    return { hasNegative, suggestions };
}

export async function checkCCNTransferRuleBeforeSave(bangKetQua) {
    clearRuleMark();

    const rows = flattenBangKetQua(bangKetQua || window.bangKetQua || {});
    if (!rows.length) return true;

    const expectedDir = getExpectedDir();
    const masps = [...new Set(rows.map(r => r.masp))];
    const errors = [];

    for (const masp of masps) {
        let info;

        try {
            info = await fetchSuggestionByMasp(masp);
        } catch (e) {
            alert('❌ ' + (e?.message || e));
            return false;
        }

        if (info.hasNegative) {
            rows.filter(r => r.masp === masp).forEach(r => {
                errors.push({
                    ...r,
                    reason: 'Tồn sau kiểm đang âm, cần kiểm kho lại trước khi chuyển.'
                });
            });
            continue;
        }

        const allowMap = new Map();

        info.suggestions.forEach(s => {
            const key = `${String(s.masp).toUpperCase()}|${normSize(s.size)}|${s.huong_chuyen}`;
            allowMap.set(key, Number(s.soluong || 0));
        });

        rows.filter(r => r.masp === masp).forEach(r => {
            const key = `${r.masp}|${normSize(r.size)}|${expectedDir}`;
            const allowQty = Number(allowMap.get(key) || 0);

            if (allowQty <= 0) {
                errors.push({
                    ...r,
                    reason: `Luật chuyển kho không gợi ý chuyển hướng ${expectedDir} cho size này.`
                });
                return;
            }

            if (Number(r.sl || 0) > allowQty) {
                errors.push({
                    ...r,
                    reason: `Chuyển quá số lượng luật cho phép. Được chuyển ${allowQty}, đang chuyển ${r.sl}.`
                });
            }
        });
    }

    if (errors.length) {
        markRuleErrors(errors);

        return {
            ok: false,
            hasErrors: true,
            errors
        };
    }

    return {
        ok: true,
        hasErrors: false,
        errors: []
    };
}

window.validateCCNTransferRuleBeforeSave = validateCCNTransferRuleBeforeSave;
