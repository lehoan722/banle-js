function formatDateTimeVN(value) {
    if (!value) return "";
    try {
        return new Date(value).toLocaleString("vi-VN");
    } catch {
        return String(value);
    }
}

function ensureSupabase() {
    if (!window.supabase) {
        throw new Error("Chưa khởi tạo được window.supabase.");
    }
    return window.supabase;
}

function detectNhapTamCoSo() {
    const diadiemInput = document.getElementById("diadiem");
    const v1 = String(diadiemInput?.value || "").trim().toLowerCase();
    if (v1 === "cs1" || v1 === "cs2") return v1;

    const v2 = String(localStorage.getItem("diadiem") || "").trim().toLowerCase();
    if (v2 === "cs1" || v2 === "cs2") return v2;

    const path = String(location.pathname || "").toLowerCase();
    if (path.includes("cs2")) return "cs2";

    return "cs1";
}

function getNhapTamRpcNames() {
    const coSo = detectNhapTamCoSo();

    return {
        coSo,
        findCandidatesRpc:
            coSo === "cs1"
                ? "rpc_find_nhapmoi_candidates_for_nhaptam_cs1"
                : "rpc_find_nhapmoi_candidates_for_nhaptam_cs2",
        syncRpc:
            coSo === "cs1"
                ? "rpc_sync_nhaptam_sizes_to_nhapmoi_cs1"
                : "rpc_sync_nhaptam_sizes_to_nhapmoi_cs2"
    };
}

function rebuildBangKetQua() {
    if (typeof window.capNhatBangKetQuaTuDOM === "function") {
        window.capNhatBangKetQuaTuDOM();
    }
    return window.bangKetQua || {};
}

function extractSingleProductFromBangKetQua() {
    const bang = rebuildBangKetQua();
    const masps = Object.keys(bang).filter(Boolean);

    if (masps.length === 0) {
        throw new Error("Chưa có dữ liệu trong bảng kết quả.");
    }

    if (masps.length > 1) {
        throw new Error("Phiếu nhập tạm chỉ được phép có 1 mã sản phẩm.");
    }

    const item = bang[masps[0]];
    const detailsMap = new Map();
    let hasZeroSize = false;

    (item.sizes || []).forEach((rawSize, idx) => {
        const size = String(rawSize ?? "").trim();
        const soluong = Number(item.soluongs?.[idx] || 0);

        if (!size || soluong <= 0) return;

        if (size === "0") {
            hasZeroSize = true;
            return;
        }

        detailsMap.set(size, (detailsMap.get(size) || 0) + soluong);
    });

    if (hasZeroSize) {
        throw new Error("Không được phép nhập size 0/x trên hóa đơn nhập tạm.");
    }

    const details = Array.from(detailsMap.entries()).map(([size, soluong]) => ({
        size,
        soluong
    }));

    if (details.length === 0) {
        throw new Error("Chưa có size chi tiết để kiểm tra đồng bộ.");
    }

    const totalQty = details.reduce((sum, x) => sum + Number(x.soluong || 0), 0);

    return {
        masp: String(item.masp || "").trim().toUpperCase(),
        tensp: item.tensp || "",
        details,
        totalQty
    };
}

function buildCandidateCardHtml(c, i, allowSelect) {
    const badge = c.is_exact_match
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#dff5df;color:#155724;font-weight:bold;margin-left:8px;">Khớp</span>`
        : `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#fff3cd;color:#856404;font-weight:bold;margin-left:8px;">Gần đúng</span>`;

    return `
        <label style="display:block; border:1px solid #ccc; border-radius:8px; padding:10px; margin:8px 0; cursor:${allowSelect ? "pointer" : "default"}; background:${c.is_exact_match ? "#f7fff7" : "#fffdf5"};">
            ${allowSelect ? `<input type="radio" name="chonHoaDonDongBo" value="${i}" ${i === 0 ? "checked" : ""} />` : ""}
            <span style="margin-left:${allowSelect ? "8px" : "0"};">
                <b>${c.sohd}</b>
                ${badge}
                <br>
                Ngày: ${c.ngay || ""} |
                Giờ tạo: ${formatDateTimeVN(c.created_at)} |
                NV: ${c.manv || ""} - ${c.tennv || ""}
                <br>
                Quản lý nhập: <b>${c.size0_qty}</b> |
                Nhân viên nhập: <b>${c.input_qty}</b> |
                Lệch: <b style="color:${c.qty_diff === 0 ? "green" : "#d35400"};">${c.qty_diff}</b>
            </span>
        </label>
    `;
}

function showExactCandidatePicker(candidates) {
    return new Promise((resolve) => {
        const old = document.getElementById("popupChonHoaDonDongBo");
        if (old) old.remove();

        const overlay = document.createElement("div");
        overlay.id = "popupChonHoaDonDongBo";
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,.35);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const box = document.createElement("div");
        box.style.cssText = `
            width: min(780px, 92vw);
            max-height: 82vh;
            overflow: auto;
            background: #fff;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,.25);
            padding: 16px;
            font-family: Arial, sans-serif;
        `;

        const rowsHtml = candidates.map((c, i) => buildCandidateCardHtml(c, i, true)).join("");

        box.innerHTML = `
            <div style="font-size:20px; font-weight:bold; margin-bottom:12px;">Chọn hóa đơn nhập mới để đồng bộ</div>
            <div style="font-size:15px; margin-bottom:10px;">
                Các hóa đơn dưới đây khớp đúng số lượng. Chọn đúng hóa đơn cần đồng bộ.
            </div>
            <div>${rowsHtml}</div>
            <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:14px;">
                <button id="btnHuyChonDongBo" type="button" style="padding:8px 14px;">Hủy</button>
                <button id="btnDongYChonDongBo" type="button" style="padding:8px 14px;">Đồng bộ</button>
            </div>
        `;

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        box.querySelector("#btnHuyChonDongBo").onclick = () => {
            overlay.remove();
            resolve(null);
        };

        box.querySelector("#btnDongYChonDongBo").onclick = () => {
            const checked = box.querySelector('input[name="chonHoaDonDongBo"]:checked');
            const idx = Number(checked?.value ?? -1);
            overlay.remove();
            resolve(idx >= 0 ? candidates[idx] : null);
        };

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(null);
            }
        });
    });
}

function showNearMatchPopup(candidates, masp) {
    return new Promise((resolve) => {
        const old = document.getElementById("popupGanDungNhapMoi");
        if (old) old.remove();

        const overlay = document.createElement("div");
        overlay.id = "popupGanDungNhapMoi";
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,.35);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const box = document.createElement("div");
        box.style.cssText = `
            width: min(820px, 94vw);
            max-height: 84vh;
            overflow: auto;
            background: #fff;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,.25);
            padding: 16px;
            font-family: Arial, sans-serif;
        `;

        const rowsHtml = candidates.map((c, i) => buildCandidateCardHtml(c, i, false)).join("");

        box.innerHTML = `
            <div style="font-size:20px; font-weight:bold; margin-bottom:12px;">Có hóa đơn gần đúng cho mã ${masp}</div>
            <div style="font-size:15px; margin-bottom:10px; color:#8a5a00;">
                Không có hóa đơn nào khớp tuyệt đối số lượng, nên hệ thống chưa đồng bộ tự động.
                Dưới đây là các hóa đơn gần đúng để nhân viên đối chiếu và báo quản lý.
            </div>
            <div>${rowsHtml}</div>
            <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:14px;">
                <button id="btnDongGanDung" type="button" style="padding:8px 14px;">Đã hiểu</button>
            </div>
        `;

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        box.querySelector("#btnDongGanDung").onclick = () => {
            overlay.remove();
            resolve();
        };

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve();
            }
        });
    });
}

async function findCandidates({ masp, totalQty }) {
    const supabase = ensureSupabase();
    const { findCandidatesRpc } = getNhapTamRpcNames();

    const { data, error } = await supabase.rpc(findCandidatesRpc, {
        p_masp: masp,
        p_total_qty: totalQty
    });

    if (error) {
        throw error;
    }

    return Array.isArray(data) ? data : [];
}

async function syncToNhapMoi({ sohdNhapMoi, masp, details }) {
    const supabase = ensureSupabase();
    const { syncRpc } = getNhapTamRpcNames();

    const manv = localStorage.getItem("manv") || "";
    const tennv = localStorage.getItem("tennv") || "";

    const { data, error } = await supabase.rpc(syncRpc, {
        p_sohd_nhapmoi: sohdNhapMoi,
        p_masp: masp,
        p_sizes_json: details,
        p_actor_manv: manv,
        p_actor_tennv: tennv
    });

    if (error) {
        throw error;
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
        throw new Error("RPC đồng bộ không trả về kết quả.");
    }

    if (!row.success) {
        throw new Error(row.message || "Đồng bộ thất bại.");
    }

    return row;
}

function appendNhapMoiSohdToGhiChu(sohdNhapMoi) {
    const input = document.getElementById("ghichu");
    if (!input || !sohdNhapMoi) return;

    const current = String(input.value || "").trim();
    const marker = `Đã đồng bộ vào ${sohdNhapMoi}`;

    if (current.includes(sohdNhapMoi)) return;

    input.value = current ? `${current} | ${marker}` : marker;
}
function appendNhapMoiSohdToGhiChu(sohdNhapMoi) {
    const input = document.getElementById("ghichu");
    if (!input || !sohdNhapMoi) return;

    const current = String(input.value || "").trim();
    const marker = `Đã đồng bộ vào ${sohdNhapMoi}`;

    if (current.includes(sohdNhapMoi)) return;

    input.value = current ? `${current} | ${marker}` : marker;
}

// ===== NEW: lưu thật, không click lồng nhau nữa =====
async function saveNhapTamDirect() {
    if (typeof window.saveNhapTam !== "function") {
        throw new Error("Không tìm thấy hàm window.saveNhapTam.");
    }
    return await window.saveNhapTam();
}

// ===== NEW: kiểm tra đồng bộ, cho phép chọn có tự lưu sau khi đồng bộ hay không =====
async function handleKiemTraDongBo(options = {}) {
    const {
        autoSaveAfterSync = false,
        triggerButton = null
    } = options;

    const btn =
        triggerButton ||
        document.getElementById("btn-kiemtra") ||
        document.getElementById("btn-luu");

    const oldText = btn ? btn.textContent : "";

    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = "Đang kiểm tra...";
        }

        const info = extractSingleProductFromBangKetQua();

        const candidates = await findCandidates({
            masp: info.masp,
            totalQty: info.totalQty
        });

        if (!candidates.length) {
            const { coSo } = getNhapTamRpcNames();
            alert(`Không tìm thấy hóa đơn nhập mới ${coSo} nào cho mã ${info.masp} trong hôm nay và hôm qua.`);
            return { ok: false, synced: false, saved: false, reason: "no_candidate" };
        }

        const exactMatches = candidates.filter(x => x.is_exact_match);
        const nearMatches = candidates.filter(x => !x.is_exact_match);

        if (exactMatches.length > 0) {
            let selected = null;

            if (exactMatches.length === 1) {
                const c = exactMatches[0];
                const ok = confirm(
                    `Tìm thấy hóa đơn nhập mới khớp đúng số lượng.\n\n` +
                    `Mã: ${info.masp}\n` +
                    `Hóa đơn: ${c.sohd}\n` +
                    `Ngày: ${c.ngay || ""}\n` +
                    `Giờ tạo: ${formatDateTimeVN(c.created_at)}\n` +
                    `Nhân viên: ${c.manv || ""} - ${c.tennv || ""}\n` +
                    `Quản lý nhập: ${c.size0_qty}\n` +
                    `Nhân viên nhập: ${c.input_qty}\n` +
                    `Lệch: ${c.qty_diff}\n\n` +
                    `Bạn có muốn đồng bộ size chi tiết sang hóa đơn này không?`
                );
                if (!ok) {
                    return { ok: false, synced: false, saved: false, reason: "user_cancel_sync" };
                }
                selected = c;
            } else {
                selected = await showExactCandidatePicker(exactMatches);
                if (!selected) {
                    return { ok: false, synced: false, saved: false, reason: "user_not_select_candidate" };
                }
            }

            const result = await syncToNhapMoi({
                sohdNhapMoi: selected.sohd,
                masp: info.masp,
                details: info.details
            });

            appendNhapMoiSohdToGhiChu(selected.sohd);

            if (autoSaveAfterSync) {
                await saveNhapTamDirect();

                alert(
                    (result.message || "Đồng bộ thành công.") +
                    `\n\nĐã ghi chú phiếu nhập mới: ${selected.sohd}` +
                    `\nPhiếu nhập tạm đã được lưu.`
                );

                return {
                    ok: true,
                    synced: true,
                    saved: true,
                    sohdNhapMoi: selected.sohd
                };
            }

            alert(
                (result.message || "Đồng bộ thành công.") +
                `\n\nĐã ghi chú phiếu nhập mới: ${selected.sohd}`
            );

            return {
                ok: true,
                synced: true,
                saved: false,
                sohdNhapMoi: selected.sohd
            };
        }

        await showNearMatchPopup(nearMatches, info.masp);
        return { ok: false, synced: false, saved: false, reason: "near_match_only" };

    } catch (err) {
        console.error("Lỗi kiểm tra/đồng bộ nhập tạm -> nhập mới:", err);
        alert("Lỗi: " + (err?.message || err));
        return { ok: false, synced: false, saved: false, reason: "exception", error: err };
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = oldText || "Kiểm tra";
        }
    }
}

// ===== NEW: API lưu chuẩn cho nút Lưu =====
async function runNhapTamSaveFlow() {
    const btnLuu = document.getElementById("btn-luu");
    const oldText = btnLuu ? btnLuu.textContent : "";

    try {
        if (btnLuu) {
            btnLuu.disabled = true;
            btnLuu.textContent = "Đang lưu...";
        }

        // Nếu chưa có dữ liệu thì saveNhapTam sẽ tự chặn.
        // Flow chuẩn: kiểm tra/đồng bộ trước, nếu đồng bộ thành công thì tự lưu.
        // Nếu không có candidate hoặc chỉ gần đúng thì dừng, không lưu.
        const result = await handleKiemTraDongBo({
            autoSaveAfterSync: true,
            triggerButton: btnLuu
        });

        return result;
    } finally {
        if (btnLuu) {
            btnLuu.disabled = false;
            btnLuu.textContent = oldText || "💾 Lưu";
        }
    }
}

function initNhapTamAutoSync() {
    const btnKiemTra = document.getElementById("btn-kiemtra");
    if (btnKiemTra) {
        btnKiemTra.addEventListener("click", async (e) => {
            e.preventDefault();
            await handleKiemTraDongBo({
                autoSaveAfterSync: false,
                triggerButton: btnKiemTra
            });
        });
    }

    const btnLuu = document.getElementById("btn-luu");
    if (btnLuu) {
        btnLuu.addEventListener("click", async (e) => {
            e.preventDefault();
            await runNhapTamSaveFlow();
        });
    }

    window.kiemTraDongBoNhapMoiTuNhapTam = handleKiemTraDongBo;
    window.runNhapTamSaveFlow = runNhapTamSaveFlow;
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNhapTamAutoSync);
} else {
    initNhapTamAutoSync();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNhapTamAutoSync);
} else {
    initNhapTamAutoSync();
}
