import { supabase } from "./supabaseClient.js";

// ==== 1. ĐĂNG NHẬP SUPABASE ====
window.dangNhap = async function () {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const status = document.getElementById("authStatus");
    status.textContent = "";

    if (!email || !password) {
        status.textContent = "Nhập đầy đủ email và mật khẩu!";
        return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        status.textContent = "Sai email hoặc mật khẩu!";
        return;
    }
    status.style.color = "green";
    status.textContent = "Đăng nhập thành công!";
    document.getElementById("authBox").style.display = "none";
};

// ==== 2. Ẩn/hiện form đăng nhập khi load lại trang ====
window.onload = async function () {
    // Tự động ẩn/hiện box đăng nhập nếu đã đăng nhập
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        document.getElementById("authBox").style.display = "none";
    } else {
        document.getElementById("authBox").style.display = "block";
    }
};


// ==== Popup tìm kiếm mã sản phẩm (dùng chung) ====
window.openPopupSearch = async function (type) {
    window.currentPopupType = type;
    const popup = document.getElementById('popupSearch');
    const input = document.getElementById('popupSearchInput');
    popup.style.display = 'block';
    input.value = "";
    input.focus();
    searchPopup("");
};

window.closePopupSearch = function () {
    document.getElementById('popupSearch').style.display = 'none';
};

document.getElementById('popupSearchInput').addEventListener('input', function () {
    searchPopup(this.value.trim());
});

async function searchPopup(keyword) {
    const type = window.currentPopupType;
    let table = '', field = '', extraFields = '';
    if (type === 'mahang') { table = 'dmhanghoa'; field = 'masp'; extraFields = ', tensp'; }
    else return;

    let query = supabase.from(table).select(`${field}${extraFields}`).limit(100);
    if (keyword && keyword.length >= 1) query = query.ilike(field, `%${keyword}%`);
    const { data, error } = await query;
    if (error || !data || !data.length) {
        document.getElementById('popupSearchList').innerHTML = '<i>Không tìm thấy dữ liệu</i>';
        return;
    }
    document.getElementById('popupSearchList').innerHTML = data.map(row => `
        <div onclick="selectPopupValue('${type}', '${row[field].replace(/'/g, "\\'")}', this)">
            <b>${row[field]}</b>${row.tensp ? " - " + row.tensp : ""}
        </div>
    `).join('');
}
window.selectPopupValue = function (type, value, el) {
    if (type === 'mahang') {
        document.getElementById('maspInput').value = value;
        closePopupSearch();
        triggerSearch();
    }
};

// ==== Sự kiện Enter, Blur, Nút tìm kiếm ====
document.getElementById('maspInput').addEventListener('keydown', function (e) {
    if (e.key === "Enter") triggerSearch();
});
document.getElementById('maspInput').addEventListener('blur', function () {
    // triggerSearch();
});
document.getElementById('searchBtn').addEventListener('click', (e) => {
    e.preventDefault();
    triggerSearch();          // gọi KHÔNG truyền tham số
});


// ==== Hàm hiển thị rỗng nếu giá trị là 0 ====
function showEmptyIfZero(val) {
    return (val && Number(val) !== 0) ? val : "";
}


// ==== Hàm chính lấy và render dữ liệu ==== 
async function triggerSearch(_masp = null) {
    const msg = document.getElementById("statusMsg");
    msg.textContent = "Đang tìm kiếm mã sản phẩm...";
    document.getElementById("multiDetailBox").innerHTML = "";
    document.getElementById("multiDetailBox").style.display = "none";
    document.getElementById("singleDetailBox").style.display = "";

    // clear vùng hiển thị
    const tTop = document.getElementById("infoTopTable");
    const tRight = document.getElementById("infoTableRight");
    if (tTop) tTop.innerHTML = "";
    if (tRight) tRight.innerHTML = "";
    const img = document.getElementById("productImage");
    if (img) img.src = "";

    document.getElementById("maspInput").select();

    // 1) lấy danh sách mã từ textarea (nếu có) → ưu tiên
    const bulkCodes = parseBulkMasp(); // [ '11376-GDM', ... ]
    let candidates = [];

    if (bulkCodes.length > 0) {
        candidates = bulkCodes;
        msg.textContent = `Đang tìm ${candidates.length} mã từ Textarea...`;
    } else {
        // 2) nếu textarea trống → chạy như cũ (từ ô maspInput)
        let masp = _masp || document.getElementById("maspInput").value.trim().toUpperCase();
        if (!masp || masp.length < 3) {
            msg.textContent = "Vui lòng nhập tối thiểu 3 ký tự mã sản phẩm!";
            return;
        }
        let { data: list, error } = await supabase.from("dmhanghoa")
            .select("*").ilike("masp", `%${masp}%`).order("masp").limit(50);
        if (error || !list || !list.length) {
            msg.textContent = "SAI MÃ";
            return;
        }
        candidates = list.map(r => r.masp);
    }

    if (candidates.length === 0) {
        msg.textContent = "Không có mã hợp lệ để tìm!";
        return;
    }

    // === GỌI RPC BULK 1 LẦN ===
    const { data: bulkData, error: bulkErr } = await supabase.rpc("timkiemhanghoa_bulk", {
        masp_list: candidates
    });

    // --- Cache bulk theo mã để render không cần RPC phụ ---
    window.TKHH_BULK = Array.isArray(bulkData) ? bulkData : [];
    window.TKHH_BULK_BY_MASP = new Map();
    for (const row of window.TKHH_BULK) {
        const key = (row.masp || "").toUpperCase();
        if (!window.TKHH_BULK_BY_MASP.has(key)) window.TKHH_BULK_BY_MASP.set(key, []);
        window.TKHH_BULK_BY_MASP.get(key).push(row);
    }


    if (bulkErr || !bulkData) {
        msg.textContent = "❌ Lỗi khi gọi RPC bulk!";
        console.error(bulkErr);
        return;
    }

    // Gom danh sách mã có dữ liệu XNT
    const productWithXNT = Array.from(new Set(bulkData.map(r => r.masp)));

    if (productWithXNT.length === 0) {
        msg.textContent = "Không có mã sản phẩm nào phát sinh xuất nhập tồn!";
        document.getElementById("singleDetailBox").style.display = "none";
        return;
    }

    if (productWithXNT.length === 1) {
        document.getElementById("singleDetailBox").style.display = "";
        await renderOneProductDetail(productWithXNT[0]); // (giữ nguyên chữ ký, nhưng giờ sẽ đọc từ cache)

        msg.textContent = "Hoàn thành! Trả về 1 sản phẩm.";
        return;
    }

    // nhiều mã
    document.getElementById("singleDetailBox").style.display = "none";
    let html = "";
    for (const m of productWithXNT) {
        html += `<div style="margin-bottom:32px;border-bottom:1px dashed #90caf9;">${await renderProductDetailHTML(m)}</div>`;
    }
    const multi = document.getElementById("multiDetailBox");
    multi.innerHTML = html;
    multi.style.display = "";
    msg.textContent = `Hoàn thành! Trả về ${productWithXNT.length} sản phẩm.`;
}


/* ====== HIỂN THỊ 1 MÃ (hai dòng/8 cột + bảng XNT + ảnh) ====== */
async function renderOneProductDetail(masp) {
    const m = (masp || "").toUpperCase();
    const rows = (window.TKHH_BULK_BY_MASP && window.TKHH_BULK_BY_MASP.get(m)) || [];

    const tTop = document.getElementById("infoTopTable");
    const tRight = document.getElementById("infoTableRight");
    const imgEl = document.getElementById("productImage");

    // fallbacks
    const fmtDate = (d) => {
        if (!d) return "";
        try {
            const dd = new Date(d);
            if (isNaN(dd)) return d;
            const y = dd.getFullYear(), mo = String(dd.getMonth() + 1).padStart(2, "0"), da = String(dd.getDate()).padStart(2, "0");
            return `${y}-${mo}-${da}`;
        } catch { return d; }
    };
    async function setImgByMasp(mcode) {
        if (!imgEl) return;
        if (typeof window.setProductImageByMasp === "function") {
            await window.setProductImageByMasp(mcode);
            return;
        }
        // fallback tùy dự án (bạn thay đường dẫn thực tế của bạn)
        imgEl.src = `/images/${mcode}.jpg`;
        imgEl.loading = "lazy";
        imgEl.onerror = () => { imgEl.src = ""; };
    }

    // dọn vùng hiển thị
    if (tTop) tTop.innerHTML = "";
    if (tRight) tRight.innerHTML = "";
    if (imgEl) imgEl.src = "";

    // Không có dữ liệu XNT → thoát sớm
    if (!rows.length) return;

    // Tổng hợp theo toàn mã (cộng mọi size)
    const totals = rows.reduce((acc, r) => {
        acc.nhapmua += r.nhapmua || 0;
        acc.tongnhap += r.tongnhap || 0;
        acc.xuatban += r.xuatban || 0;
        acc.tongxuat += r.tongxuat || 0;
        acc.toncuoi += r.toncuoi || 0;
        acc.ban_cs1 += r.ban_cs1 || 0;
        acc.ton_cs1 += r.ton_cs1 || 0;
        acc.ban_cs2 += r.ban_cs2 || 0;
        acc.ton_cs2 += r.ton_cs2 || 0;
        return acc;
    }, { nhapmua: 0, tongnhap: 0, xuatban: 0, tongxuat: 0, toncuoi: 0, ban_cs1: 0, ton_cs1: 0, ban_cs2: 0, ton_cs2: 0 });

    // —— Lấy thông tin mô tả (vị trí, NCC, giá) + ngày ND/NC/kiểm —— //
    // Bạn có thể tinh gọn/điều chỉnh field theo schema thực tế (vitrikho1 hoặc vitrikhocs1 …)
    const dmPromise = supabase.from("dmhanghoa")
        .select("masp, vitrikhocs1, vitrikhocs2, vitrikho1, vitrikho2, nhacc, giale")
        .eq("masp", m).maybeSingle();

    // ngày nhập đầu/cuối (nd/nc) — xét giao dịch tăng hàng (is_tang_giam=1)
    const ndPromise = supabase.rpc("exec_sql", {
        // Nếu bạn không có rpc exec_sql, thay bằng from + min/max
        // hoặc viết plpgsql gọn. Ở đây minh họa bằng from + aggregate:
    }).then(async () => {
        const { data: ndRow } = await supabase
            .from("ct_hoadon_banle").select("sohd")
            .eq("masp", m).limit(1); // gọi nhẹ để chắc bảng tồn tại
        const { data: nd } = await supabase
            .from("hoadon_banle")
            .select("ngay")
            .in("sohd",
                (await supabase.from("ct_hoadon_banle")
                    .select("sohd")
                    .eq("masp", m)).data?.map(x => x.sohd) || []
            )
            .order("ngay", { ascending: true })
            .limit(1);
        const { data: nc } = await supabase
            .from("hoadon_banle")
            .select("ngay")
            .in("sohd",
                (await supabase.from("ct_hoadon_banle")
                    .select("sohd")
                    .eq("masp", m)).data?.map(x => x.sohd) || []
            )
            .order("ngay", { ascending: false })
            .limit(1);
        return { nd: nd?.[0]?.ngay || null, nc: nc?.[0]?.ngay || null };
    });

    // ngày kiểm kho mới nhất mỗi cơ sở
    const kPromise = (async () => {
        const { data: k1 } = await supabase
            .from("kiemkho")
            .select("ngay").eq("masp", m).eq("diadiem", "cs1")
            .order("ngay", { ascending: false }).limit(1);
        const { data: k2 } = await supabase
            .from("kiemkho")
            .select("ngay").eq("masp", m).eq("diadiem", "cs2")
            .order("ngay", { ascending: false }).limit(1);
        return { k1: k1?.[0]?.ngay || null, k2: k2?.[0]?.ngay || null };
    })();

    const [{ data: dm }, ndnc, kk] = await Promise.all([dmPromise, ndPromise, kPromise]);

    const vitriCS1 = dm?.vitrikhocs1 || dm?.vitrikho1 || "";
    const vitriCS2 = dm?.vitrikhocs2 || dm?.vitrikho2 || "";
    const nhacc = dm?.nhacc || "";
    const giaLe = dm?.giale || 0;
    const ngayND = ndnc?.nd || null;
    const ngayNC = ndnc?.nc || null;
    const ngayK1 = kk?.k1 || null;
    const ngayK2 = kk?.k2 || null;

    // —— Bảng “hàng ngang” như giao diện cũ —— //
    if (tTop) {
        tTop.innerHTML = `
      <tr>
        <th>Mã hàng</th>
        <th>Vị trí CS1</th>
        <th>Vị trí CS2</th>
        <th>Nhà CC</th>
        <th>Giá</th>
        <th class="red">ND</th>
        <th class="red">NC</th>
        <th class="red">Kiểm CS1</th>
        <th class="red">Kiểm CS2</th>
      </tr>
      <tr>
        <td>${m}</td>
        <td>${vitriCS1}</td>
        <td>${vitriCS2}</td>
        <td>${nhacc}</td>
        <td>${(giaLe || 0).toLocaleString()}</td>
        <td>${fmtDate(ngayND)}</td>
        <td>${fmtDate(ngayNC)}</td>
        <td>${fmtDate(ngayK1)}</td>
        <td>${fmtDate(ngayK2)}</td>
      </tr>
    `;
    }

    // —— Bảng chi tiết size (giống bố cục cũ) —— //
    if (tRight) {
        const header = `
      <tr>
        <th>Size</th>
        <th>Tồn CS1</th>
        <th>Tồn CS2</th>
        <th>Bán CS1</th>
        <th>Bán CS2</th>
        <th>Tổng mua</th>
        <th>Tổng bán</th>
        <th>Tổng tồn</th>
      </tr>`;
        // tổng dòng “Tổng”
        const tongRow = `
      <tr class="row-sum">
        <td><strong>Tổng</strong></td>
        <td>${totals.ton_cs1}</td>
        <td>${totals.ton_cs2}</td>
        <td>${totals.ban_cs1}</td>
        <td>${totals.ban_cs2}</td>
        <td>${totals.tongnhap}</td>
        <td>${totals.tongxuat}</td>
        <td>${totals.toncuoi}</td>
      </tr>`;
        const body = rows.map(r => `
      <tr>
        <td>${r.size ?? ""}</td>
        <td>${r.ton_cs1 ?? 0}</td>
        <td>${r.ton_cs2 ?? 0}</td>
        <td>${r.ban_cs1 ?? 0}</td>
        <td>${r.ban_cs2 ?? 0}</td>
        <td>${r.tongnhap ?? 0}</td>
        <td>${r.tongxuat ?? 0}</td>
        <td>${r.toncuoi ?? 0}</td>
      </tr>`).join("");

        tRight.innerHTML = header + tongRow + body;
    }

    // —— Ảnh sản phẩm —— //
    await setImgByMasp(m);
}



/* ====== KHỐI HTML CHO NHIỀU MÃ (dùng cùng layout mới) ====== */
async function renderProductDetailHTML(masp) {
    const m = (masp || "").toUpperCase();
    const rows = (window.TKHH_BULK_BY_MASP && window.TKHH_BULK_BY_MASP.get(m)) || [];

    const fmtDate = (d) => {
        if (!d) return "";
        try {
            const dd = new Date(d);
            if (isNaN(dd)) return d;
            const y = dd.getFullYear(), mo = String(dd.getMonth() + 1).padStart(2, "0"), da = String(dd.getDate()).padStart(2, "0");
            return `${y}-${mo}-${da}`;
        } catch { return d; }
    };
    const imgTag = (code) => {
        // Nếu có window.getProductImgUrl thì dùng, còn không dùng fallback
        if (typeof window.getProductImgUrl === "function") {
            const url = window.getProductImgUrl(code);
            return `<img class="product-img" src="${url}" loading="lazy" onerror="this.src='';" alt="${code}">`;
        }
        return `<img class="product-img" src="/images/${code}.jpg" loading="lazy" onerror="this.src='';" alt="${code}">`;
    };

    if (!rows.length) {
        return `<div class="product-block"><div class="product-head"><strong>${m}</strong></div><div>Không có dữ liệu XNT.</div></div>`;
    }

    const totals = rows.reduce((acc, r) => {
        acc.nhapmua += r.nhapmua || 0;
        acc.tongnhap += r.tongnhap || 0;
        acc.xuatban += r.xuatban || 0;
        acc.tongxuat += r.tongxuat || 0;
        acc.toncuoi += r.toncuoi || 0;
        acc.ban_cs1 += r.ban_cs1 || 0;
        acc.ton_cs1 += r.ton_cs1 || 0;
        acc.ban_cs2 += r.ban_cs2 || 0;
        acc.ton_cs2 += r.ton_cs2 || 0;
        return acc;
    }, { nhapmua: 0, tongnhap: 0, xuatban: 0, tongxuat: 0, toncuoi: 0, ban_cs1: 0, ton_cs1: 0, ban_cs2: 0, ton_cs2: 0 });

    // Lấy mô tả + ngày giống renderOne…
    const [{ data: dm }] = await Promise.all([
        supabase.from("dmhanghoa")
            .select("masp, vitrikhocs1, vitrikhocs2, vitrikho1, vitrikho2, nhacc, giale")
            .eq("masp", m).maybeSingle()
    ]);

    // Độc lập: tính ngày ND/NC và kiểm (đơn giản hóa, nếu bạn đã có helper thì thay vào)
    const { data: sohdList } = await supabase.from("ct_hoadon_banle").select("sohd").eq("masp", m);
    let nd = null, nc = null;
    if (sohdList?.length) {
        const soArr = sohdList.map(x => x.sohd);
        const { data: minDay } = await supabase.from("hoadon_banle").select("ngay").in("sohd", soArr).order("ngay", { ascending: true }).limit(1);
        const { data: maxDay } = await supabase.from("hoadon_banle").select("ngay").in("sohd", soArr).order("ngay", { ascending: false }).limit(1);
        nd = minDay?.[0]?.ngay || null;
        nc = maxDay?.[0]?.ngay || null;
    }
    const { data: k1 } = await supabase.from("kiemkho").select("ngay").eq("masp", m).eq("diadiem", "cs1").order("ngay", { ascending: false }).limit(1);
    const { data: k2 } = await supabase.from("kiemkho").select("ngay").eq("masp", m).eq("diadiem", "cs2").order("ngay", { ascending: false }).limit(1);

    const vitriCS1 = dm?.vitrikhocs1 || dm?.vitrikho1 || "";
    const vitriCS2 = dm?.vitrikhocs2 || dm?.vitrikho2 || "";
    const nhacc = dm?.nhacc || "";
    const giaLe = dm?.giale || 0;

    const tableTop = `
    <table class="t-info-top">
      <tr>
        <th>Mã hàng</th>
        <th>Vị trí CS1</th>
        <th>Vị trí CS2</th>
        <th>Nhà CC</th>
        <th>Giá</th>
        <th class="red">ND</th>
        <th class="red">NC</th>
        <th class="red">Kiểm CS1</th>
        <th class="red">Kiểm CS2</th>
      </tr>
      <tr>
        <td>${m}</td>
        <td>${vitriCS1}</td>
        <td>${vitriCS2}</td>
        <td>${nhacc}</td>
        <td>${(giaLe || 0).toLocaleString()}</td>
        <td>${fmtDate(nd)}</td>
        <td>${fmtDate(nc)}</td>
        <td>${fmtDate(k1?.[0]?.ngay)}</td>
        <td>${fmtDate(k2?.[0]?.ngay)}</td>
      </tr>
    </table>`;

    const header = `
    <tr>
      <th>Size</th>
      <th>Tồn CS1</th>
      <th>Tồn CS2</th>
      <th>Bán CS1</th>
      <th>Bán CS2</th>
      <th>Tổng mua</th>
      <th>Tổng bán</th>
      <th>Tổng tồn</th>
    </tr>`;
    const body = rows.map(r => `
    <tr>
      <td>${r.size ?? ""}</td>
      <td>${r.ton_cs1 ?? 0}</td>
      <td>${r.ton_cs2 ?? 0}</td>
      <td>${r.ban_cs1 ?? 0}</td>
      <td>${r.ban_cs2 ?? 0}</td>
      <td>${r.tongnhap ?? 0}</td>
      <td>${r.tongxuat ?? 0}</td>
      <td>${r.toncuoi ?? 0}</td>
    </tr>`).join("");

    const tableRight = `
    <table class="t-info-right">
      ${header}
      <tr class="row-sum">
        <td><strong>Tổng</strong></td>
        <td>${totals.ton_cs1}</td>
        <td>${totals.ton_cs2}</td>
        <td>${totals.ban_cs1}</td>
        <td>${totals.ban_cs2}</td>
        <td>${totals.tongnhap}</td>
        <td>${totals.tongxuat}</td>
        <td>${totals.toncuoi}</td>
      </tr>
      ${body}
    </table>`;

    return `
    <div class="product-block">
      <div class="product-head"><strong>${m}</strong></div>
      <div class="product-top card-like">
        <div class="left">
          ${tableTop}
        </div>
        <div class="right">
          ${imgTag(m)}
        </div>
      </div>
      <div class="product-detail">
        ${tableRight}
      </div>
    </div>
  `;
}


function formatDateOnly(val) {
    if (!val) return "";
    // Xử lý cho cả dạng string ISO hoặc Date object
    let d = new Date(val);
    if (isNaN(d)) return val;
    return d.toISOString().slice(0, 10); // yyyy-mm-dd
    // Hoặc nếu muốn dd/mm/yyyy:
    // return d.getDate().toString().padStart(2, "0") + "/" + (d.getMonth()+1).toString().padStart(2, "0") + "/" + d.getFullYear();
}

function getQuery(name) {
    const p = new URLSearchParams(window.location.search);
    const v = p.get(name);
    return v ? v.trim() : "";
}

// ==== QUÉT MÃ VẠCH / QR BẰNG CAMERA (hỗ trợ iPhone) ====
let ZXING = null, codeReader = null, scanControls = null;
let torchOn = false;

async function ensureZXing() {
    if (ZXING) return;
    // load ESM từ CDN khi cần
    ZXING = await import('https://cdn.jsdelivr.net/npm/@zxing/browser@latest/+esm');
}

function scoreCameraLabel(label = '') {
    const s = label.toLowerCase();
    let score = 0;

    // Ưu tiên camera sau
    if (/(back|rear|mặt sau|environment)/.test(s)) score += 50;

    // ƯU TIÊN CAO NHẤT: cực rộng / ultra wide / 0.5x
    if (/(cực rộng|siêu rộng|ultra\s*wide|0\.5x|0,5x|0\.5|0,5)/.test(s)) score += 200;

    // Tránh tele/chụp xa làm mặc định
    if (/(tele|chụp xa|zoom|2x|3x)/.test(s)) score -= 120;

    // Tránh camera trước
    if (/(front|trước|mặt trước)/.test(s)) score -= 200;

    return score;
}


async function pickBestBackCamera() {
    await ensureZXing();
    const devices = await ZXING.BrowserCodeReader.listVideoInputDevices();
    if (!devices || !devices.length) return undefined;
    // Sắp xếp để “cực rộng” đứng đầu
    devices.sort((a, b) => scoreCameraLabel(b.label) - scoreCameraLabel(a.label));
    return devices[0].deviceId;
}


async function startScanner(deviceId) {
    await ensureZXing();
    const videoEl = document.getElementById('scannerVideo');
    const status = document.getElementById('scannerStatus');

    // giảm trễ giữa các lần decode để phản hồi nhanh
    codeReader = new ZXING.BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 25 });

    // dùng 720p cho tốc độ cao (thường đủ nét để quét nhanh hơn 1080p)
    const fastConstraints = {
        video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 }, height: { ideal: 720 },
            frameRate: { ideal: 30 }
        }
    };

    try {
        if (deviceId) {
            // mở trực tiếp theo deviceId đã chọn (cực rộng)
            scanControls = await codeReader.decodeFromVideoDevice(deviceId, videoEl, onScanResult);
        } else {
            scanControls = await codeReader.decodeFromConstraints(fastConstraints, videoEl, onScanResult);
        }

        // cố gắng bật continuous-focus (nếu hỗ trợ)
        try {

            await track?.applyConstraints?.({ advanced: [{ focusMode: 'continuous' }] });
        } catch (_) { }

        status.textContent = 'Đang quét... đưa mã vào khung.';
        await populateCameraList();

        // set dropdown trỏ ngay camera tốt nhất (cực rộng)
        try {
            const sel = document.getElementById('cameraSelect');
            const bestId = deviceId || await pickBestBackCamera();
            if (sel && bestId) sel.value = bestId;
        } catch (_) { }
    } catch (err) {
        console.error('startScanner error:', err);
        status.textContent = 'Không mở được camera. Kiểm tra quyền camera và tắt Live Text nếu đang bật.';
    }
}

// === SỰ KIỆN UPLOAD ẢNH ===
const fileInput = document.getElementById('imgFileInput');
const saveImgBtn = document.getElementById('saveImgBtn');
const resizeCheckbox = document.getElementById('resizeCheckbox');
const uploadStatus = document.getElementById('uploadStatus');

fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const imgEl = document.getElementById('productImage');

    // luôn chuẩn hoá kích thước trước khi upload
    _pendingBlob = await resizeToStandardBlob(file);   // → Blob JPEG 640x480 or 480x640
    if (imgEl) imgEl.src = URL.createObjectURL(_pendingBlob); // xem trước đè lên ảnh cũ

    const sts = document.getElementById('uploadStatus');
    if (sts) { sts.style.color = '#444'; sts.textContent = 'Đã chọn ảnh (chưa lưu)'; }
});


saveImgBtn?.addEventListener('click', async () => {
    try {
        uploadStatus.style.color = '#c62828';
        if (!CURRENT_MASP) { uploadStatus.textContent = 'Chưa có mã sản phẩm!'; return; }
        if (!_pendingBlob) { uploadStatus.textContent = 'Chưa chọn ảnh!'; return; }

        const fileName = `${CURRENT_MASP}.JPG`; // luôn in hoa
        uploadStatus.textContent = 'Đang lưu ảnh...';

        const { error } = await supabase
            .storage.from(STORAGE_BUCKET)
            .upload(fileName, _pendingBlob, { upsert: true, contentType: 'image/jpeg' });

        if (error) throw error;

        // refresh ảnh với cache-busting
        const imgEl = document.getElementById('productImage');
        imgEl.src = `${IMG_BASE}${encodeURIComponent(CURRENT_MASP)}.JPG?t=${Date.now()}`;

        uploadStatus.style.color = 'green';
        uploadStatus.textContent = 'Đã lưu ảnh thành công!';
        // NEW: dọn trạng thái + focus & bôi đen ô nhập mã để nhập tiếp
        const fi = document.getElementById('imgFileInput');
        if (fi) fi.value = '';
        _pendingBlob = null;

        const ip = document.getElementById('maspInput');
        if (ip) { ip.focus(); ip.select(); }   // <<< bôi đen để gõ mã tiếp
    } catch (e) {
        console.error(e);
        uploadStatus.style.color = '#c62828';
        uploadStatus.textContent = 'Lưu ảnh thất bại!';
    }
});

async function resizeToStandardBlob(file) {
    // đọc file → Image
    const dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(file);
    });
    const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = dataUrl;
    });

    // chọn size đích theo hướng ảnh
    const isLandscape = img.width > img.height;
    const targetW = isLandscape ? 640 : 480;
    const targetH = isLandscape ? 480 : 640;

    const canvas = document.createElement('canvas');
    canvas.width = targetW; canvas.height = targetH;
    const ctx = canvas.getContext('2d');

    const scale = Math.min(targetW / img.width, targetH / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const offX = (targetW - drawW) / 2;
    const offY = (targetH - drawH) / 2;
    ctx.drawImage(img, offX, offY, drawW, drawH);

    return await new Promise((res) => canvas.toBlob(
        (blob) => res(blob), 'image/jpeg'
    ));
}




function onScanResult(result, err, controls) {
    if (result) {
        const text = result.getText ? result.getText() : (result.rawValue || '');
        if (text) {
            try { navigator.vibrate?.(80); } catch (_) { }
            // đưa kết quả vào ô nhập & tìm
            const ip = document.getElementById('maspInput');
            ip.value = text.trim().toUpperCase();
            closeScanner();
            // gọi search như bình thường
            triggerSearch();
        }
    }
    // lỗi decode vặt thì bỏ qua để tiếp tục quét
}

async function stopScanner() {
    try { scanControls?.stop(); } catch (_) { }
    const v = document.getElementById('scannerVideo');

    try { track?.stop(); } catch (_) { }
    if (v) v.srcObject = null;
    codeReader = null; scanControls = null; torchOn = false;
}

async function populateCameraList() {
    await ensureZXing();
    const sel = document.getElementById('cameraSelect');
    sel.innerHTML = '';
    try {
        const devices = await ZXING.BrowserCodeReader.listVideoInputDevices();
        devices.sort((a, b) => scoreCameraLabel(b.label) - scoreCameraLabel(a.label));
        devices.forEach((d, i) => {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.textContent = d.label || `Camera ${i + 1}`;
            sel.appendChild(opt);
        });
    } catch (_) { }
}



async function switchCamera(deviceId) {
    await stopScanner();
    await startScanner(deviceId);
}

async function toggleTorch() {
    const v = document.getElementById('scannerVideo');

    if (!track) return;

    try {
        torchOn = !torchOn;
        // iOS 17.4+ có thể hỗ trợ; không phải máy nào cũng được → bọc try/catch
        await track.applyConstraints({ advanced: [{ torch: torchOn }] });
        document.getElementById('flashBtn').textContent = torchOn ? '🔦 Tắt đèn' : '🔦 Đèn';
    } catch (e) {
        document.getElementById('scannerStatus').textContent = 'Thiết bị không hỗ trợ bật đèn.';
        torchOn = false;
    }
}

async function decodeFromFile(file) {
    if (!file) return;
    await ensureZXing();
    const reader = new ZXING.BrowserMultiFormatReader();
    const url = URL.createObjectURL(file);
    try {
        const res = await reader.decodeFromImageUrl(url);
        const text = res.getText ? res.getText() : (res.rawValue || '');
        if (text) {
            document.getElementById('maspInput').value = text.trim().toUpperCase();
            closeScanner();
            triggerSearch();
            return;
        }
        document.getElementById('scannerStatus').textContent = 'Không đọc được mã từ ảnh.';
    } catch (e) {
        console.error('decodeFromFile error:', e);
        document.getElementById('scannerStatus').textContent = 'Không đọc được mã từ ảnh.';
    } finally {
        URL.revokeObjectURL(url);
    }
}



// ==== Open/Close modal
window.openScanner = async function () {
    try { document.activeElement?.blur(); } catch (_) { } // tránh Live Text chiếm camera
    document.getElementById('scannerModal').style.display = 'block';
    const status = document.getElementById('scannerStatus');
    status.textContent = 'Đang chuẩn bị camera...';

    try {
        await ensureZXing();

        // mồi quyền & lộ labels (để thấy “cực rộng”)
        try {
            const pre = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
            pre.getTracks().forEach(t => t.stop());
        } catch (_) { }

        const bestId = await pickBestBackCamera();     // → sẽ ưu tiên “cực rộng”
        await startScanner(bestId || null);
    } catch (e) {
        console.error('openScanner error:', e);
        status.textContent = 'Không mở được camera. Hãy kiểm tra quyền camera và đóng Live Text.';
    }
};



window.closeScanner = async function () {
    document.getElementById('scannerModal').style.display = 'none';
    await stopScanner();
};

// === Gắn sự kiện sau khi trang load (gộp vào onload cũ)
const _oldOnload_scan = window.onload;
window.onload = async function () {
    if (typeof _oldOnload_scan === 'function') await _oldOnload_scan();

    const btn = document.getElementById('scanBtn');
    const btnClose = document.getElementById('closeScanner');
    const btnFlash = document.getElementById('flashBtn');
    const selCam = document.getElementById('cameraSelect');
    const filePick = document.getElementById('filePicker');

    btn?.addEventListener('click', () => openScanner());
    btnClose?.addEventListener('click', () => closeScanner());
    btnFlash?.addEventListener('click', () => toggleTorch());
    selCam?.addEventListener('change', (e) => switchCamera(e.target.value));
    filePick?.addEventListener('change', (e) => decodeFromFile(e.target.files?.[0]));
};


// Gộp cùng onload hiện có:
const _oldOnload = window.onload;
window.onload = async function () {
    // giữ hành vi cũ: kiểm tra session và ẩn/hiện box đăng nhập
    if (typeof _oldOnload === "function") await _oldOnload();

    // nhận mã từ URL và tìm kiếm luôn
    const q = getQuery("masp");
    if (q && q.length >= 3) {
        const masp = q.toUpperCase();
        const ip = document.getElementById("maspInput");
        if (ip) ip.value = masp;
        // nếu chưa đăng nhập RLS có thể chặn; vẫn cứ gọi,
        // user có thể đăng nhập rồi bấm tìm lại nếu cần
        try {
            await triggerSearch(masp);
        } catch (e) { /* bỏ qua lỗi */ }
    }

    // NHẬN DANH SÁCH MÃ TỪ localStorage (nếu được F8 truyền sang)
    const bulk = localStorage.getItem("TKHH333_BULK");
    if (bulk) {
        const ta = document.getElementById("bulkTextarea");
        if (ta) ta.value = bulk;
        localStorage.removeItem("TKHH333_BULK"); // dọn key
        try {
            await triggerSearch(); // chạy tìm luôn
        } catch (e) {
            console.error("Lỗi auto triggerSearch từ F8:", e);
        }
    }

};


/* ====== TIỆN ÍCH ====== */




// Base ảnh sản phẩm
const IMG_BASE = "https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/";
// === ẢNH SẢN PHẨM ===
const STORAGE_BUCKET = 'anhsanpham';

let CURRENT_MASP = null;        // đang hiển thị 1 sản phẩm nào
let _pendingBlob = null;        // blob đã resize (để upload)



// Thử .JPG → .jpg → .PNG → .png
function setProductImageByMasp(masp) {
    const img = document.getElementById("productImage");
    if (!img) return;
    const m = encodeURIComponent(masp);
    const candidates = [`${IMG_BASE}${m}.JPG`, `${IMG_BASE}${m}.jpg`, `${IMG_BASE}${m}.PNG`, `${IMG_BASE}${m}.png`];
    let i = 0;
    const tryNext = () => {
        if (i >= candidates.length) return;
        img.onerror = () => { i++; tryNext(); };
        img.src = candidates[i];
    };
    tryNext();
}

function parseBulkMasp() {
    const ta = document.getElementById('bulkTextarea');
    if (!ta) return [];
    const raw = ta.value || "";
    if (!raw.trim()) return [];
    // tách theo xuống dòng, tab, dấu phẩy/chấm phẩy → chuẩn hóa UPPERCASE
    const arr = raw.split(/[\r\n,;\t]+/)
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);
    // loại trùng, giữ thứ tự; giới hạn 50 mã để tránh quá nhiều RPC
    const seen = new Set(), out = [];
    for (const m of arr) if (!seen.has(m)) { seen.add(m); out.push(m); }
    return out.slice(0, 50);
}

document.getElementById('clearBulkBtn')?.addEventListener('click', () => {
    const ta = document.getElementById('bulkTextarea');
    if (ta) { ta.value = ''; ta.focus(); }

    // Dọn trạng thái hiển thị kết quả
    const msg = document.getElementById('statusMsg'); if (msg) msg.textContent = '';
    const multi = document.getElementById('multiDetailBox');
    if (multi) { multi.innerHTML = ''; multi.style.display = 'none'; }
    const top = document.getElementById('infoTopTable'); if (top) top.innerHTML = '';
    const right = document.getElementById('infoTableRight'); if (right) right.innerHTML = '';
    const img = document.getElementById('productImage'); if (img) img.src = '';
    // đảm bảo khối đơn hiển thị rỗng
    const single = document.getElementById('singleDetailBox'); if (single) single.style.display = '';
});

document.getElementById('bulkTextarea')?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        document.getElementById('clearBulkBtn')?.click();
    }
});

