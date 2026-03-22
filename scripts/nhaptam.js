// nhaptam.js (phiên bản đầy đủ)
// Dùng cho trang nhaptamcs1.html – lưu/đọc nhập tạm độc lập 2 bảng nhaptam_hd / nhaptam_ct

const supabase = window.supabase; // dùng client chung đã đăng nhập

// ======= Helpers =======
const $ = (sel) => document.querySelector(sel);
const U = (s) => (s || "").toString().trim().toUpperCase();
const pad5 = (n) => String(n).padStart(5, "0");
// Nhận biết cơ sở (cs1/cs2) theo tên file HTML hiện tại
const getCS = () => {
    try {
        const path = window.location.pathname || "";
        const file = path.split("/").pop().toLowerCase(); // vd: nhaptamcs1.html
        const m = file.match(/nhaptam(cs\d+)/);
        if (m && m[1]) return m[1];
        return "cs1"; // mặc định nếu không nhận diện được
    } catch {
        return "cs1";
    }
};


// Hỏi DB lấy số chứng từ mới nhất theo cơ sở, rồi cộng 1
async function getNextSoctFromDB(coso) {
    const { data: last, error } = await supabase
        .from("nhaptam_hd")
        .select("soct")
        .ilike("soct", `nt${coso}_%`)
        .order("soct", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;

    let next = 1;
    if (last?.soct) {
        const n = parseInt(last.soct.split("_")[1], 10);
        if (!Number.isNaN(n)) next = n + 1;
    }
    return `nt${coso}_${pad5(next)}`;
}

// Parse số hiện tại trong ô #socttam → {prefix, num}
function parseSoctInput() {
    const soct = $("#socttam")?.value?.trim();
    if (!soct || !soct.includes("_")) return null;
    const [prefix, numStr] = soct.split("_");
    const num = parseInt(numStr, 10);
    if (Number.isNaN(num)) return null;
    return { soct, prefix, num };
}

// Xóa lưới trên UI
function clearGrid() {
    const tbody = $("#bangketqua tbody");
    if (tbody) tbody.innerHTML = "";
    if (window.MobileKQ && typeof MobileKQ.render === "function") MobileKQ.render();
}

// Nạp rows vào grid (ưu tiên qua MobileKQ nếu có)
// nhaptam.js
async function fillGrid(rows) {
    try {
        // ✅ Xóa lưới cũ trước khi nạp dữ liệu mới (tránh chồng)
        if (typeof clearGrid === "function") clearGrid();

        const SIZES = [0, 38, 39, 40, 41, 42, 43, 44, 45];

        if (!rows || !rows.length) {
            if (typeof MobileKQ?.render === "function") MobileKQ.render();
            return;
        }

        // Đảm bảo MobileKQ sẵn sàng
        const ready = () =>
            window.MobileKQ &&
            typeof MobileKQ.upsertRow === "function" &&
            typeof MobileKQ.setQty === "function";

        if (!ready()) {
            let cnt = 0;
            await new Promise((res) => {
                const tm = setInterval(() => {
                    if (ready() || ++cnt > 30) {
                        clearInterval(tm);
                        res();
                    }
                }, 200);
            });
            if (!ready()) return;
        }

        // 1) Đổ size
        for (const d of rows) {
            const masp = (d.masp || "").toString().trim().toUpperCase();
            if (!masp) continue;

            await MobileKQ.upsertRow(masp);

            for (const s of SIZES) {
                const key = `s${s}`;
                const val = Number(d[key] ?? 0) || 0;
                MobileKQ.setQty(masp, s, val);
            }
        }

        // 2) Vẽ để cập nhật "Tổng"
        if (typeof MobileKQ.render === "function") MobileKQ.render();

        // 3) Gán "Tổng nhập" từ DB
        const tbody = document.querySelector("#bangketqua tbody");
        for (const d of rows) {
            const masp = (d.masp || "").toString().trim().toUpperCase();
            if (!masp) continue;
            const tn = Number(d.tong_nhap ?? 0) || 0;

            if (typeof MobileKQ.setTongNhapByMasp === "function") {
                MobileKQ.setTongNhapByMasp(masp, tn);
                continue;
            }

            if (tbody) {
                for (const tr of tbody.rows) {
                    const cellMasp = (tr.cells[0]?.innerText || tr.cells[0]?.textContent || "")
                        .trim()
                        .toUpperCase();
                    if (cellMasp === masp && tr.cells[11]) {
                        tr.cells[11].textContent = String(tn);
                        break;
                    }
                }
            }
        }

        // 4) Vẽ lại lần nữa nếu cần
        if (typeof MobileKQ.render === "function") MobileKQ.render();
    } catch (err) {
        console.error("fillGrid error:", err);
    }
}
// ======= API chính =======

// Lưu hóa đơn nhập tạm (sinh số mới, chặn khi không có dữ liệu)
window.saveNhapTam = async function () {
    try {
        const cs = getCS();
        const today = new Date().toISOString().slice(0, 10);
        const tennv = localStorage.getItem("tennv") || "";
        const ghichu = $("#ghichu")?.value || "";

        // 1) sinh số chứng từ mới nhất + 1
        const soct = await getNextSoctFromDB(cs);
        if ($("#socttam")) $("#socttam").value = soct;

        // 2) lấy dữ liệu grid
        let rows = [];
        if (window.MobileKQ && typeof MobileKQ.getAll === "function") {
            rows = MobileKQ.getAll() || [];
        }

        if (!rows || !rows.length) {
            alert("⚠️ Không có dữ liệu để lưu!");
            return;
        }

        // 3) map sang cấu trúc bảng nhaptam_ct (s0, s38…)
        const details = rows.map((r) => ({
            soct,
            masp: U(r.masp),
            s0: +(r.s0 ?? 0),
            s38: +(r.s38 ?? 0),
            s39: +(r.s39 ?? 0),
            s40: +(r.s40 ?? 0),
            s41: +(r.s41 ?? 0),
            s42: +(r.s42 ?? 0),
            s43: +(r.s43 ?? 0),
            s44: +(r.s44 ?? 0),
            s45: +(r.s45 ?? 0),
            tong_nhap: +(r.tong_nhap ?? 0),
        }));

        // 4) insert header
        const { error: errHd } = await supabase.from("nhaptam_hd").insert([
            {
                soct,
                diadiem: cs, // bạn đã tạo cột 'diadiem' trong bảng hd
                ngay: today,
                nhanvien: tennv,
                ghichu,
                status: "draft",
            },
        ]);
        if (errHd) throw errHd;

        // 5) insert chi tiết
        const { error: errCt } = await supabase.from("nhaptam_ct").insert(details);
        if (errCt) throw errCt;

        alert(`✅ Đã lưu hóa đơn nhập tạm: ${soct}`);

        // 6) refresh lưới & xin số tiếp theo để sẵn sàng nhập tiếp
        clearGrid();
        if ($("#ghichu")) $("#ghichu").value = "";

        const nextSoct = `${soct.split("_")[0]}_${pad5(parseInt(soct.split("_")[1], 10) + 1)}`;
        if ($("#socttam")) $("#socttam").value = nextSoct;
    } catch (e) {
        console.error(e);
        alert("❌ Lưu hóa đơn nhập tạm thất bại!");
    }
};

// Nạp hóa đơn theo số chứng từ
window.loadNhapTam = async function (soct) {
    try {
        const { data, error } = await supabase
            .from("nhaptam_ct")
            .select("masp,dvt,vitrikho,s0,s38,s39,s40,s41,s42,s43,s44,s45,tong,tong_nhap")
            .eq("soct", soct)
            .order("masp", { ascending: true });
        if (error) throw error;

        if (!data || !data.length) {
            alert("⚠️ Không tìm thấy hóa đơn nhập tạm!");
            return;
        }

        await fillGrid(data);

        if ($("#socttam")) $("#socttam").value = soct;
    } catch (e) {
        console.error(e);
        alert("❌ Lỗi khi tải hóa đơn nhập tạm!");
    }
};

// quay lai chứng từ trước (nhỏ hơn 1)
async function openPrevDoc() {
    const parsed = parseSoctInput();
    if (!parsed) {
        alert("⚠️ Chưa có số chứng từ hiện tại!");
        return;
    }
    if (parsed.num <= 1) {
        alert("⚠️ Đây là hóa đơn đầu tiên, không còn hóa đơn trước đó!");
        return;
    }
    const prevSoct = `${parsed.prefix}_${pad5(parsed.num - 1)}`;
    await window.loadNhapTam(prevSoct);
}

// tiep tuc chứng từ sau (lớn hơn 1)
async function openNextDoc() {
    const parsed = parseSoctInput();
    if (!parsed) {
        alert("⚠️ Chưa có số chứng từ hiện tại!");
        return;
    }
    const nextSoct = `${parsed.prefix}_${pad5(parsed.num + 1)}`;
    await window.loadNhapTam(nextSoct); // Nếu không tồn tại, loadNhapTam sẽ alert
}


// Thêm mới: xóa lưới + xin số mới nhất + 1 từ DB
async function newDoc() {
    try {
        clearGrid();
        if ($("#ghichu")) $("#ghichu").value = "";
        const soct = await getNextSoctFromDB(getCS());
        if ($("#socttam")) $("#socttam").value = soct;
    } catch (e) {
        console.error("Lỗi khi lấy số chứng từ mới:", e);
    }
}

// ======= Gắn sự kiện UI =======
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const soct = await getNextSoctFromDB(getCS());
        if ($("#socttam")) $("#socttam").value = soct;
    } catch (e) {
        console.error("Không lấy được số chứng từ ban đầu:", e);
    }

    // KHÔNG gắn nút Lưu ở đây nữa.
    // Nút #btn-luu sẽ được nhaptamAutoSync.js điều khiển theo flow chuẩn.
    // File này chỉ giữ các hàm nghiệp vụ lõi.

    $("#btn-quaylai-nt")?.addEventListener("click", () => openPrevDoc());
    $("#tieptuc")?.addEventListener("click", () => openNextDoc());
    $("#them")?.addEventListener("click", () => newDoc());
});

