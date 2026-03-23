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

const SUPABASE_PUBLIC_URL = "https://rddjrmbyftlcvrgzlyby.supabase.co";
const IMAGE_BUCKET_NAME = "anhsanpham";

// Lấy tất cả mã sản phẩm đang có trên bảng kết quả
function getAllMaspFromBangKetQua() {
    const bang = rebuildBangKetQua();
    const masps = Object.keys(bang || {})
        .map(x => String(x || "").trim().toUpperCase())
        .filter(Boolean);

    return [...new Set(masps)];
}

// Kiểm tra 1 mã có ảnh hay chưa
// Ưu tiên chuẩn MASP.JPG, nhưng cho phép dò thêm các đuôi phổ biến
async function checkImageExistsByMasp(masp) {
    const cleanMasp = String(masp || "").trim().toUpperCase();
    if (!cleanMasp) return false;

    const exts = ["JPG", "jpg", "JPEG", "jpeg", "PNG", "png", "WEBP", "webp"];

    for (const ext of exts) {
        const url =
            `${SUPABASE_PUBLIC_URL}/storage/v1/object/public/${IMAGE_BUCKET_NAME}/` +
            `${encodeURIComponent(cleanMasp)}.${ext}`;

        try {
            const res = await fetch(url, {
                method: "HEAD",
                cache: "no-store"
            });

            if (res.ok) return true;
        } catch (err) {
            console.error("Lỗi kiểm tra ảnh:", cleanMasp, ext, err);
        }
    }

    return false;
}

// Kiểm tra ảnh cho toàn bộ mã trên phiếu
async function kiemTraAnhSanPhamTrenPhieu() {
    const masps = getAllMaspFromBangKetQua();

    if (!masps.length) {
        throw new Error("Chưa có dữ liệu sản phẩm trên phiếu để kiểm tra ảnh.");
    }

    const missing = [];
    const existing = [];

    for (const masp of masps) {
        const ok = await checkImageExistsByMasp(masp);
        if (ok) existing.push(masp);
        else missing.push(masp);
    }

    return {
        allOk: missing.length === 0,
        existing,
        missing
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

function triggerSaveNhapTam() {
    const btnLuu = document.getElementById("btn-luu");
    if (!btnLuu) {
        throw new Error("Không tìm thấy nút Lưu của phiếu nhập tạm.");
    }
    btnLuu.click();
}

async function handleKiemTraDongBo() {
    const btn = document.getElementById("btn-kiemtra");
    const oldText = btn ? btn.textContent : "";

    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = "Đang kiểm tra ảnh...";
        }

        // BƯỚC 1: kiểm tra ảnh trước
        const kqAnh = await kiemTraAnhSanPhamTrenPhieu();

        if (!kqAnh.allOk) {
            alert(
                "Các mã sau chưa có ảnh sản phẩm trong cơ sở dữ liệu:\n\n" +
                kqAnh.missing.join("\n") +
                "\n\nVui lòng chụp ảnh cho các mã này rồi nhấn Kiểm tra lại."
            );
            return;
        }

        if (btn) {
            btn.textContent = "Đang kiểm tra dữ liệu...";
        }

        // BƯỚC 2: ảnh đã đủ thì mới chạy logic cũ
        const info = extractSingleProductFromBangKetQua();

        const candidates = await findCandidates({
            masp: info.masp,
            totalQty: info.totalQty
        });

        if (!candidates.length) {
            const { coSo } = getNhapTamRpcNames();
            alert(`Không tìm thấy hóa đơn nhập mới ${coSo} nào cho mã ${info.masp} trong hôm nay và hôm qua.`);
            return;
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
                if (!ok) return;
                selected = c;
            } else {
                selected = await showExactCandidatePicker(exactMatches);
                if (!selected) return;
            }

            const result = await syncToNhapMoi({
                sohdNhapMoi: selected.sohd,
                masp: info.masp,
                details: info.details
            });

            appendNhapMoiSohdToGhiChu(selected.sohd);

            alert(
                (result.message || "Đồng bộ thành công.") +
                `\n\nĐã ghi chú phiếu nhập mới: ${selected.sohd}` +
                `\nHệ thống sẽ tự lưu phiếu nhập tạm.`
            );

            setTimeout(() => {
                try {
                    triggerSaveNhapTam();
                } catch (e) {
                    alert("Đồng bộ xong nhưng không tự bấm Lưu được: " + (e.message || e));
                }
            }, 150);

            return;
        }

        await showNearMatchPopup(nearMatches, info.masp);

    } catch (err) {
        console.error("Lỗi kiểm tra/đồng bộ nhập tạm -> nhập mới:", err);
        alert("Lỗi: " + (err?.message || err));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = oldText || "Kiểm tra";
        }
    }
}

function initNhapTamAutoSync() {
    const btn = document.getElementById("btn-kiemtra");
    if (!btn) return;

    btn.addEventListener("click", (e) => {
        e.preventDefault();
        handleKiemTraDongBo();
    });

    window.kiemTraDongBoNhapMoiTuNhapTam = handleKiemTraDongBo;
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNhapTamAutoSync);
} else {
    initNhapTamAutoSync();
}
