 
        (function () {
            const VALID_SIZES = ["0", "38", "39", "40", "41", "42", "43", "44", "45"];

            window.ccnKiemTraState = {
                goc: {},
                kiem: {},
                ok: false,
                lastMasp: "",
                selectedMasp: ""
            };

            function normMasp(v) {
                return String(v || "").trim().toUpperCase();
            }

            function normSize(v) {
                const s = String(v || "").trim();
                const m = s.match(/\d{1,2}/);
                return m ? m[0] : "0";
            }

            function toNum(v) {
                return Number(String(v || "").replace(/[^\d.-]/g, "")) || 0;
            }

            function makeKey(masp, size) {
                return normMasp(masp) + "@@" + normSize(size);
            }

            function splitKey(key) {
                const arr = String(key || "").split("@@");
                return {
                    masp: arr[0] || "",
                    size: arr[1] || ""
                };
            }

            function setHdStateCCN(state) {
                const el = document.getElementById("hd_state");
                if (!el) return;
                el.value = state;
                el.setAttribute("data-state", state);
            }

            function layDuLieuGocTuHoaDon() {
                if (typeof window.capNhatBangKetQuaTuDOM === "function") {
                    window.capNhatBangKetQuaTuDOM();
                }

                const bang = window.bangKetQua || {};
                const out = {};

                Object.values(bang).forEach(item => {
                    const masp = normMasp(item.masp);
                    if (!masp) return;

                    (item.sizes || []).forEach((sz, i) => {
                        const size = normSize(sz);
                        const sl = toNum((item.soluongs || [])[i]);
                        if (sl <= 0) return;

                        const key = makeKey(masp, size);
                        out[key] = (out[key] || 0) + sl;
                    });
                });

                return out;
            }

            function groupTheoMasp(mapObj) {
                const out = {};

                Object.keys(mapObj || {}).forEach(key => {
                    const { masp, size } = splitKey(key);
                    const sl = toNum(mapObj[key]);
                    if (!masp || sl <= 0) return;

                    if (!out[masp]) {
                        out[masp] = {
                            masp,
                            items: [],
                            tong: 0
                        };
                    }

                    out[masp].items.push({ size, sl });
                    out[masp].tong += sl;
                });

                Object.values(out).forEach(g => {
                    g.items.sort((a, b) => Number(a.size) - Number(b.size));
                });

                return out;
            }

            function formatSizeSl(items) {
                if (!items || !items.length) return "";
                return items.map(x => `<div>${x.size}/${x.sl}</div>`).join("");
            }

            function buildKetQuaTheoMasp(masp, gocGroup, kiemGroup) {
                const allSizes = new Set();

                (gocGroup?.items || []).forEach(x => allSizes.add(x.size));
                (kiemGroup?.items || []).forEach(x => allSizes.add(x.size));

                let tongThieu = 0;
                let tongThua = 0;
                const thieuParts = [];
                const thuaParts = [];

                allSizes.forEach(size => {
                    const slGoc = (gocGroup?.items || [])
                        .filter(x => x.size === size)
                        .reduce((s, x) => s + toNum(x.sl), 0);

                    const slKiem = (kiemGroup?.items || [])
                        .filter(x => x.size === size)
                        .reduce((s, x) => s + toNum(x.sl), 0);

                    if (slGoc > slKiem) {
                        const diff = slGoc - slKiem;
                        tongThieu += diff;
                        thieuParts.push(`${size}/${diff}`);
                    }

                    if (slKiem > slGoc) {
                        const diff = slKiem - slGoc;
                        tongThua += diff;
                        thuaParts.push(`${size}/${diff}`);
                    }
                });

                if (tongThieu === 0 && tongThua === 0) {
                    return { trangthai: "OK", chitiet: "" };
                }

                if (tongThieu > 0 && tongThua === 0) {
                    return { trangthai: "THIẾU", chitiet: thieuParts.join(" ") };
                }

                if (tongThua > 0 && tongThieu === 0) {
                    return { trangthai: "THỪA", chitiet: thuaParts.join(" ") };
                }

                return {
                    trangthai: "LỆCH",
                    chitiet: `Thiếu: ${thieuParts.join(" ")} | Thừa: ${thuaParts.join(" ")}`
                };
            }

            function ensurePopupKiemTraCCN() {
                if (document.getElementById("ccnKiemTraWrap")) return;

                const style = document.createElement("style");
                style.textContent = `
            .ccnkt-overlay {
                display:none;
                position:fixed;
                inset:0;
                background:rgba(0,0,0,.25);
                z-index:20000;
            }

            .ccnkt-wrap {
                display:none;
                position:fixed;
                inset:0;
                background:#fff;
                z-index:20001;
                flex-direction:column;
                font-family:Arial, sans-serif;
            }

            .ccnkt-head {
                background:#ff9800;
                color:white;
                padding:8px;
                display:flex;
                gap:8px;
                align-items:center;
                flex-wrap:wrap;
                font-size:22px;
                font-weight:bold;
            }

            .ccnkt-head button {
                height:40px;
                padding:0 12px;
                border:0;
                border-radius:8px;
                font-weight:bold;
            }

            .ccnkt-inputs {
                display:grid;
                grid-template-columns: 1fr 70px 85px 86px;
                gap:6px;
                padding:8px;
                background:#f5f5f5;
                position:relative;
            }

            .ccnkt-inputs input {
                height:46px;
                font-size:24px;
                box-sizing:border-box;
                padding:4px 8px;
            }

            #ccnktMasp {
                background:#f2ccff;
            }

            #ccnktSL,
            #ccnktSize {
                background:#fff59d;
                text-align:center;
            }

            #ccnktScan {
                background:#2196f3;
                color:white;
                border:0;
                border-radius:8px;
                font-weight:bold;
                font-size:18px;
            }

            #ccnktSuggest,
            #ccnktSizePopup {
                position:absolute;
                background:white;
                border:1px solid #ccc;
                max-height:220px;
                overflow:auto;
                z-index:20005;
                display:none;
                box-shadow:0 4px 12px rgba(0,0,0,.2);
            }

            .ccnkt-suggest-row {
                padding:9px;
                border-bottom:1px solid #eee;
                font-size:18px;
                cursor:pointer;
            }

            .ccnkt-body {
                flex:1;
                overflow:auto;
            }

            .ccnkt-table {
                width:100%;
                border-collapse:collapse;
                font-size:17px;
            }

            .ccnkt-table th,
            .ccnkt-table td {
                border:1px solid #ddd;
                padding:6px 4px;
                text-align:center;
                vertical-align:middle;
            }

            .ccnkt-table th {
                position:sticky;
                top:0;
                background:#fff3cd;
                z-index:1;
            }

            .ccnkt-table td:first-child {
                text-align:left;
                font-weight:bold;
                color:#0047cc;
                word-break:break-word;
            }            

            .ccnkt-bad {
                background:#ffebee;
                color:#b00020;
                font-weight:bold;
            }

            .ccnkt-table tr.ccnkt-selected > td {
              background: #ffe082 !important;
              color: #000 !important;
              font-weight: 900 !important;
              box-shadow: inset 0 0 0 3px #ff6f00 !important;
            }

            .ccnkt-foot {
                display:grid;
                grid-template-columns:1fr 1fr;
                gap:8px;
                padding:8px;
                background:#eef6ff;
            }

            .ccnkt-foot button {
                height:52px;
                font-size:18px;
                font-weight:bold;
                border-radius:10px;
                border:1px solid #ccc;
            }

            @media (max-width: 480px) {
                .ccnkt-head {
                    font-size:20px;
                }

                .ccnkt-inputs {
                    grid-template-columns: 1fr 60px 75px 78px;
                    gap:5px;
                    padding:6px;
                }

                .ccnkt-inputs input {
                    height:44px;
                    font-size:22px;
                    padding:3px 5px;
                }

                .ccnkt-table {
                    font-size:15px;
                }

                .ccnkt-table th,
                .ccnkt-table td {
                    padding:5px 3px;
                }
            }
        `;
                document.head.appendChild(style);

                const overlay = document.createElement("div");
                overlay.id = "ccnKiemTraOverlay";
                overlay.className = "ccnkt-overlay";

                const wrap = document.createElement("div");
                wrap.id = "ccnKiemTraWrap";
                wrap.className = "ccnkt-wrap";

                wrap.innerHTML = `
            <div class="ccnkt-head">
                ✅ Kiểm tra phiếu chuyển chi nhánh
                <button type="button" id="ccnktClose">Đóng</button>
            </div>

            <div class="ccnkt-inputs">
                <input id="ccnktMasp" placeholder="Mã SP" autocomplete="off">
                <input id="ccnktSL" value="1" placeholder="SL">
                <input id="ccnktSize" placeholder="SIZE" autocomplete="off">
                <button id="ccnktScan" type="button">📷 QUÉT</button>

                <div id="ccnktSuggest"></div>
                <div id="ccnktSizePopup"></div>
            </div>

            <div class="ccnkt-body">
                <table class="ccnkt-table">
                    <thead>
                        <tr>
                            <th>Mã hàng</th>
                            <th>Size/SL</th>
                            <th>Tổng SL</th>
                            <th>Size/SL kiểm</th>
                            <th>Tổng SL kiểm</th>
                            <th>Trạng thái</th>
                            <th>Chi tiết</th>
                        </tr>
                    </thead>
                    <tbody id="ccnktTbody"></tbody>
                </table>
            </div>

            <div class="ccnkt-foot">
                <button type="button" id="ccnktClear">Xóa kiểm</button>
                <button type="button" id="ccnktConfirm">Xác nhận kiểm đúng</button>
            </div>
        `;

                document.body.appendChild(overlay);
                document.body.appendChild(wrap);

                const maspEl = document.getElementById("ccnktMasp");
                const slEl = document.getElementById("ccnktSL");
                const sizeEl = document.getElementById("ccnktSize");

                document.getElementById("ccnktClose").onclick = closePopupKiemTraCCN;
                overlay.onclick = closePopupKiemTraCCN;

                document.getElementById("ccnktClear").onclick = function () {
                    xoaDuLieuKiemTheoMaspDangChon();
                };

                document.getElementById("ccnktConfirm").onclick = function () {
                    renderPopupKiemTraCCN();

                    if (!window.ccnKiemTraState.ok) {
                        alert("❌ Dữ liệu kiểm chưa khớp. Vui lòng kiểm tra lại dòng THIẾU / THỪA / LỆCH.");
                        focusMaspKiemTra();
                        return;
                    }

                    setHdStateCCN("kiemtra");
                    // alert("✅ Phiếu đã kiểm đúng. Bây giờ có thể lưu.");
                    closePopupKiemTraCCN();
                };

                maspEl.addEventListener("input", function () {
                    const m = normMasp(maspEl.value);

                    if (m) {
                        window.ccnKiemTraState.lastMasp = m;
                        window.ccnKiemTraState.selectedMasp = m;
                        renderPopupKiemTraCCN();
                    }

                    showMaspSuggestKiemTra();
                });

                maspEl.addEventListener("keydown", function (e) {
                    if (e.key !== "Enter") return;
                    e.preventDefault();

                    const m = normMasp(maspEl.value);
                    if (m) {
                        chonMaspTrongPopupKiemTra(m, true);
                        return;
                    }

                    sizeEl.focus();
                    sizeEl.select();
                    showSizePopupKiemTra();
                });

                sizeEl.addEventListener("focus", showSizePopupKiemTra);

                sizeEl.addEventListener("keydown", function (e) {
                    if (e.key !== "Enter") return;
                    e.preventDefault();

                    const raw = String(sizeEl.value || "").trim();
                    const size = normSize(raw);

                    if (!VALID_SIZES.includes(size)) {
                        if (raw.length >= 3) {
                            const maspQuet = normMasp(raw);
                            sizeEl.value = "";

                            chonMaspTrongPopupKiemTra(maspQuet, true);
                            return;
                        }

                        alert("Bạn phải nhập size hợp lệ hoặc quét/nhập mã sản phẩm.");
                        sizeEl.focus();
                        sizeEl.select();
                        return;
                    }

                    themDongKiemTra(true);
                });

                slEl.addEventListener("keydown", function (e) {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    sizeEl.focus();
                    sizeEl.select();
                    showSizePopupKiemTra();
                });

                document.getElementById("ccnktScan").onclick = async function () {
                    alert("Nút QUÉT sẽ gắn ở bước tiếp theo theo scanner.js hiện tại. Bản này ưu tiên làm đúng luồng kiểm tra trước.");
                };
            }

            function showMaspSuggestKiemTra() {
                const box = document.getElementById("ccnktSuggest");
                const maspEl = document.getElementById("ccnktMasp");
                if (!box || !maspEl) return;

                const kw = normMasp(maspEl.value);
                if (!kw) {
                    box.style.display = "none";
                    return;
                }

                const dsGoc = Array.from(new Set(
                    Object.keys(window.ccnKiemTraState.goc || {}).map(k => splitKey(k).masp)
                ));

                let list = dsGoc.filter(m => m.includes(kw)).slice(0, 30);

                if (!list.length && window.sanPhamData) {
                    list = Object.keys(window.sanPhamData)
                        .filter(m => normMasp(m).includes(kw))
                        .slice(0, 30);
                }

                if (!list.length) {
                    box.style.display = "none";
                    return;
                }

                box.innerHTML = list.map(m => `<div class="ccnkt-suggest-row" data-masp="${m}">${m}</div>`).join("");

                const rect = maspEl.getBoundingClientRect();
                const wrapRect = document.querySelector(".ccnkt-inputs").getBoundingClientRect();

                box.style.left = (rect.left - wrapRect.left) + "px";
                box.style.top = (rect.bottom - wrapRect.top) + "px";
                box.style.width = rect.width + "px";
                box.style.display = "block";

                box.querySelectorAll(".ccnkt-suggest-row").forEach(row => {
                    row.onclick = function () {
                        const m = this.dataset.masp;

                        maspEl.value = m;
                        box.style.display = "none";

                        chonMaspTrongPopupKiemTra(m, true);
                    };
                });
            }

            let ccnktSizeDropdown = null;

            function showSizePopupKiemTra() {
                const sizeEl = document.getElementById("ccnktSize");
                if (!sizeEl) return;

                if (typeof window.openMenuSizeDropdownFor !== "function") {
                    alert("Chưa tải được popup size từ menu-component.js");
                    return;
                }

                ccnktSizeDropdown = window.openMenuSizeDropdownFor(sizeEl, function (val) {
                    sizeEl.value = String(val);
                    themDongKiemTra(true);

                    setTimeout(() => {
                        sizeEl.focus();
                        sizeEl.select();
                    }, 30);
                });

                setTimeout(() => {
                    const dd = document.getElementById("sizeDropdown");
                    if (!dd) return;

                    const wrap = document.getElementById("ccnKiemTraWrap");
                    const wrapRect = wrap ? wrap.getBoundingClientRect() : null;

                    dd.style.zIndex = "999999";
                    dd.style.maxWidth = "calc(100vw - 20px)";
                    dd.style.overflow = "auto";

                    const rect = dd.getBoundingClientRect();
                    const padding = 10;

                    if (rect.right > window.innerWidth - padding) {
                        dd.style.left = Math.max(padding, window.innerWidth - rect.width - padding) + "px";
                    }

                    if (rect.left < padding) {
                        dd.style.left = padding + "px";
                    }

                    if (wrapRect && rect.top < wrapRect.top + 10) {
                        dd.style.top = wrapRect.top + 60 + "px";
                    }
                }, 30);
            }

            function chonMaspTrongPopupKiemTra(masp, focusSize = true) {
                const m = normMasp(masp);
                if (!m) return;

                window.ccnKiemTraState.lastMasp = m;
                window.ccnKiemTraState.selectedMasp = m;

                const maspEl = document.getElementById("ccnktMasp");
                const sizeEl = document.getElementById("ccnktSize");

                if (maspEl) maspEl.value = m;

                renderPopupKiemTraCCN();

                if (focusSize && sizeEl) {
                    setTimeout(() => {
                        sizeEl.focus();
                        sizeEl.select();
                        showSizePopupKiemTra();
                    }, 30);
                }
            }

            function xoaDuLieuKiemTheoMaspDangChon() {
                const masp = normMasp(
                    window.ccnKiemTraState.selectedMasp ||
                    document.getElementById("ccnktMasp")?.value
                );

                if (!masp) {
                    alert("Bạn chưa chọn mã sản phẩm để xóa kiểm.");
                    return;
                }

                if (!confirm(`Xóa toàn bộ dữ liệu kiểm lại của mã ${masp}?`)) return;

                Object.keys(window.ccnKiemTraState.kiem || {}).forEach(key => {
                    const k = splitKey(key);
                    if (normMasp(k.masp) === masp) {
                        delete window.ccnKiemTraState.kiem[key];
                    }
                });

                window.ccnKiemTraState.lastMasp = masp;
                window.ccnKiemTraState.selectedMasp = masp;

                renderPopupKiemTraCCN();

                const maspEl = document.getElementById("ccnktMasp");
                const sizeEl = document.getElementById("ccnktSize");

                if (maspEl) maspEl.value = masp;
                if (sizeEl) {
                    sizeEl.value = "";
                    setTimeout(() => {
                        sizeEl.focus();
                        sizeEl.select();
                        showSizePopupKiemTra();
                    }, 30);
                }
            }

            function themDongKiemTra(giuPopupSize = false) {
                const maspEl = document.getElementById("ccnktMasp");
                const slEl = document.getElementById("ccnktSL");
                const sizeEl = document.getElementById("ccnktSize");

                maspEl.addEventListener("focus", function () {
                    setTimeout(() => {
                        maspEl.select();
                    }, 0);
                });

                maspEl.addEventListener("click", function () {
                    setTimeout(() => {
                        maspEl.select();
                    }, 0);
                });

                const masp = normMasp(maspEl.value);
                const size = normSize(sizeEl.value || "0");
                const sl = toNum(slEl.value || "1") || 1;

                if (!masp) {
                    alert("Bạn chưa nhập mã sản phẩm.");
                    focusMaspKiemTra();
                    return;
                }

                if (!VALID_SIZES.includes(size)) {
                    alert("Size không hợp lệ.");
                    sizeEl.focus();
                    sizeEl.select();
                    return;
                }

                const key = makeKey(masp, size);
                window.ccnKiemTraState.kiem[key] = (window.ccnKiemTraState.kiem[key] || 0) + sl;
                window.ccnKiemTraState.lastMasp = masp;
                window.ccnKiemTraState.selectedMasp = masp;

                sizeEl.value = "";
                slEl.value = "1";

                renderPopupKiemTraCCN();

                if (giuPopupSize) {
                    setTimeout(() => {
                        sizeEl.focus();
                        sizeEl.select();
                    }, 30);
                } else {
                    focusMaspKiemTra();
                }
            }

            function getSortWeightCCN(trangthai) {
                const tt = String(trangthai || "").trim().toUpperCase();

                if (tt === "THIẾU" || tt === "THIEU") return 1;
                if (tt === "LỆCH" || tt === "LECH") return 2;
                if (tt === "THỪA" || tt === "THUA") return 3;
                if (tt === "OK") return 4;

                return 5;
            }

            function renderPopupKiemTraCCN() {
                const tbody = document.getElementById("ccnktTbody");
                if (!tbody) return;

                const gocGroup = groupTheoMasp(window.ccnKiemTraState.goc || {});
                const kiemGroup = groupTheoMasp(window.ccnKiemTraState.kiem || {});
                const lastMasp = normMasp(window.ccnKiemTraState.lastMasp || "");

                let rowsData = Array.from(new Set([
                    ...Object.keys(gocGroup),
                    ...Object.keys(kiemGroup)
                ])).map(masp => {
                    const g = gocGroup[masp];
                    const k = kiemGroup[masp];
                    const kq = buildKetQuaTheoMasp(masp, g, k);

                    return {
                        masp,
                        g,
                        k,
                        trangthai: kq.trangthai,
                        chitiet: kq.chitiet || ""
                    };
                });

                rowsData.sort((a, b) => {
                    const aM = normMasp(a.masp);
                    const bM = normMasp(b.masp);

                    // 1) Mã vừa nhập luôn lên đầu tiên
                    if (lastMasp && aM === lastMasp && bM !== lastMasp) return -1;
                    if (lastMasp && bM === lastMasp && aM !== lastMasp) return 1;

                    // 2) Dòng sai lệch lên trên, OK xuống dưới
                    const wa = getSortWeightCCN(a.trangthai);
                    const wb = getSortWeightCCN(b.trangthai);
                    if (wa !== wb) return wa - wb;

                    // 3) Còn lại sắp xếp theo mã
                    return String(a.masp).localeCompare(String(b.masp), "vi");
                });

                tbody.innerHTML = "";

                let allOk = rowsData.length > 0;

                rowsData.forEach(row => {
                    if (row.trangthai !== "OK") allOk = false;

                    const tr = document.createElement("tr");
                    const isSelected = normMasp(row.masp) === normMasp(window.ccnKiemTraState.selectedMasp);

                    if (row.trangthai !== "OK") {
                        tr.classList.add("ccnkt-bad");
                    }

                    if (isSelected) {
                        tr.classList.add("ccnkt-selected");
                    }

                    // OK không tô màu, sai lệch mới tô màu
                    if (row.trangthai !== "OK") {
                        tr.className = "ccnkt-bad";
                    }

                    tr.innerHTML = `
            <td>${row.masp}</td>
            <td>${formatSizeSl(row.g?.items || [])}</td>
            <td>${row.g?.tong || ""}</td>
            <td>${formatSizeSl(row.k?.items || [])}</td>
            <td>${row.k?.tong || ""}</td>
            <td>${row.trangthai}</td>
            <td>${row.chitiet || ""}</td>
        `;

                    tr.addEventListener("click", function () {
                        chonMaspTrongPopupKiemTra(row.masp, true);
                    });

                    tbody.appendChild(tr);
                });

                window.ccnKiemTraState.ok = allOk;

                const btn = document.getElementById("ccnktConfirm");
                if (btn) {
                    btn.disabled = !allOk;
                    btn.style.opacity = allOk ? "1" : ".45";
                }
            }

            function focusMaspKiemTra() {
                const el = document.getElementById("ccnktMasp");
                if (!el) return;
                setTimeout(() => {
                    el.focus();
                    el.select();
                }, 50);
            }

            function openPopupKiemTraCCN() {
                ensurePopupKiemTraCCN();

                window.ccnKiemTraState.goc = layDuLieuGocTuHoaDon();
                window.ccnKiemTraState.kiem = {};
                window.ccnKiemTraState.ok = false;

                if (!Object.keys(window.ccnKiemTraState.goc).length) {
                    alert("⚠️ Chưa có dữ liệu hóa đơn để kiểm tra.");
                    return;
                }

                document.getElementById("ccnKiemTraOverlay").style.display = "block";
                document.getElementById("ccnKiemTraWrap").style.display = "flex";

                renderPopupKiemTraCCN();
                focusMaspKiemTra();
            }

            function closePopupKiemTraCCN() {
                const overlay = document.getElementById("ccnKiemTraOverlay");
                const wrap = document.getElementById("ccnKiemTraWrap");
                if (overlay) overlay.style.display = "none";
                if (wrap) wrap.style.display = "none";
            }

            window.moPopupKiemTraCCN = openPopupKiemTraCCN;

            document.addEventListener("DOMContentLoaded", function () {
                document.getElementById("btnKiemTraCCN")?.addEventListener("click", function () {
                    window.moPopupKiemTraCCN?.();
                });
            });
        })();
    
        /* =========================
   WRAPPER CHẶN LƯU CCN
========================= */

window.saveHoaDonCCNCoKiemTra = async function (source = "BTN-LUU-CCN") {

    const hdState =
        String(
            document.getElementById("hd_state")?.value || "moi"
        )
            .trim()
            .toLowerCase();

    if (hdState === "moi") {

        alert(
            "Phiếu chuyển chi nhánh phải kiểm tra trước khi lưu."
        );

        if (typeof window.moPopupKiemTraCCN === "function") {
            window.moPopupKiemTraCCN();
        }

        return {
            ok: false,
            reason: "CHUA_KIEM_TRA"
        };
    }

    if (
        hdState !== "kiemtra" &&
        hdState !== "xem" &&
        hdState !== "sua"
    ) {

        alert(
            "Trạng thái phiếu không hợp lệ."
        );

        return {
            ok: false,
            reason: "STATE_INVALID"
        };
    }

    if (
        typeof window.__SAVE_CCN_GOC__ !== "function"
    ) {

        alert(
            "Không tìm thấy hàm lưu gốc."
        );

        return {
            ok: false,
            reason: "NO_SAVE_FN"
        };
    }

    return await window.__SAVE_CCN_GOC__(source);
};

window.saveHoaDonCCN =
    window.saveHoaDonCCNCoKiemTra;

    window.saveHoaDonCCNCoKiemTra = async function (source = "BTN-LUU-CCN") {
    const hdState = String(document.getElementById("hd_state")?.value || "moi")
        .trim()
        .toLowerCase();

    if (hdState === "moi") {
        alert("Phiếu mới bắt buộc phải kiểm tra trước khi lưu.");
        window.moPopupKiemTraCCN?.();
        return { ok: false, reason: "CHUA_KIEM_TRA" };
    }

    if (hdState !== "kiemtra" && hdState !== "xem" && hdState !== "sua") {
        alert("Trạng thái phiếu không hợp lệ. Chỉ được lưu khi trạng thái là KIỂM TRA, XEM hoặc SỬA.");
        return { ok: false, reason: "STATE_INVALID" };
    }

    return await window.__SAVE_CCN_GOC__(source);
};