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
        if (error || !list || !list.length) { msg.textContent = "SAI MÃ"; return; }
        candidates = list.map(r => r.masp);
    }

    // Lọc những mã thật sự có XNT qua RPC
    const productWithXNT = [];
    for (const code of candidates) {
        const { data: xntdata, error: xErr } = await supabase.rpc("timkiemhanghoa", { masp_query: code });
        if (!xErr && xntdata && xntdata.length > 0) productWithXNT.push(code);
    }

    if (productWithXNT.length === 0) {
        msg.textContent = "Không có mã sản phẩm nào phát sinh xuất nhập tồn!";
        document.getElementById("singleDetailBox").style.display = "none";
        return;
    }

    if (productWithXNT.length === 1) {
        document.getElementById("singleDetailBox").style.display = "";
        await renderOneProductDetail(productWithXNT[0]);
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

const productWithXNT = [];
for (const row of list) {
    const { data: xntdata, error: xntErr } = await supabase.rpc("timkiemhanghoa", { masp_query: row.masp });
    if (!xntErr && xntdata && xntdata.length > 0) productWithXNT.push(row.masp);
}

if (productWithXNT.length === 0) {
    msg.textContent = "Không có mã sản phẩm nào phát sinh xuất nhập tồn!";
    document.getElementById("singleDetailBox").style.display = "none";
    return;
}

if (productWithXNT.length === 1) {
    document.getElementById("singleDetailBox").style.display = "";
    await renderOneProductDetail(productWithXNT[0]);
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
    // thông tin hàng hóa
    const { data: hanghoa, error: err1 } = await supabase.from("dmhanghoa").select("*").eq("masp", masp).single();
    if (err1 || !hanghoa) return;

    // ngày nhập đầu/cuối (chỉ khi sản phẩm có trong hóa đơn nhập)
    const { data: nhapList } = await supabase.from("hoadon_banle").select("ngay,sohd").in("loaihd", ["nmcs1", "nmcs2"]).order("ngay", { ascending: true });
    let ngay_nhapdau = "", ngay_nhapcuoi = "";
    if (nhapList && nhapList.length) {
        const sohdArr = nhapList.map(e => e.sohd);
        const { data: cts } = await supabase.from("ct_hoadon_banle").select("sohd,masp").in("sohd", sohdArr).eq("masp", masp);
        const setSohd = new Set(cts.map(e => e.sohd));
        const filtered = nhapList.filter(e => setSohd.has(e.sohd));
        if (filtered.length) { ngay_nhapdau = filtered[0].ngay; ngay_nhapcuoi = filtered[filtered.length - 1].ngay; }
    }

    // ngày kiểm gần nhất CS1/CS2
    let ngay_kiem_cs1 = "", ngay_kiem_cs2 = "";
    {
        const { data: k1 } = await supabase.from("kiemkho").select("ngaygio").eq("masp", masp).eq("diadiem", "cs1").order("ngaygio", { ascending: false }).limit(1);
        if (k1?.length) ngay_kiem_cs1 = k1[0].ngaygio;
        const { data: k2 } = await supabase.from("kiemkho").select("ngaygio").eq("masp", masp).eq("diadiem", "cs2").order("ngaygio", { ascending: false }).limit(1);
        if (k2?.length) ngay_kiem_cs2 = k2[0].ngaygio;
    }

    // xuất nhập tồn
    const { data: xntdata } = await supabase.rpc("timkiemhanghoa", { masp_query: masp });
    if (!xntdata || !xntdata.length) {
        document.getElementById("infoTopTable").innerHTML = "";
        document.getElementById("infoTableRight").innerHTML = "";
        document.getElementById("statusMsg").textContent = "Không có dữ liệu xuất nhập tồn!";
        return false;
    }

    // map size & tổng dòng đầu
    const SIZE_LIST = ['Tổng', '0', '38', '39', '40', '41', '42', '43', '44', '45'];
    const rowMap = {};
    xntdata.forEach(r => { rowMap[r.size === null ? '' : r.size] = r; });
    const totalRow = {};
    ["nhapmua", "xuatban", "toncuoi", "ban_cs1", "ton_cs1", "ton_cs2", "ban_cs2"].forEach(f => {
        totalRow[f] = SIZE_LIST.slice(1).reduce((s, sz) => s + (Number(rowMap[sz]?.[f]) || 0), 0);
    });

    // 2 dòng / 8 cột (KHÔNG hiển thị tên sản phẩm)
    const top = document.getElementById("infoTopTable");
    top.innerHTML = `
    <tr>
      <th>Mã hàng</th>
      <th>Vị trí CS1</th>
      <th>Vị trí CS2</th>
      <th>Giá lẻ</th>
      <th class="red">ND</th>
      <th class="red">NC</th>
      <th class="red">Kiểm CS1</th>
      <th class="red">Kiểm CS2</th>
    </tr>
    <tr>
      <td>${hanghoa.masp || ""}</td>
      <td>${hanghoa.vitrikho1 || ""}</td>
      <td>${hanghoa.vitrikho2 || ""}</td>
      <td>${hanghoa.giale?.toLocaleString() || ""}</td>
      <td>${formatDateOnly(ngay_nhapdau) || ""}</td>
      <td>${formatDateOnly(ngay_nhapcuoi) || ""}</td>
      <td>${formatDateOnly(ngay_kiem_cs1) || ""}</td>
      <td>${formatDateOnly(ngay_kiem_cs2) || ""}</td>
    </tr>
  `;

    // Bảng XNT
    let htmlRight = `
    <tr>
      <th class="size">Size</th>
      <th class="blue">Tổng mua</th>
      <th class="blue">Tổng bán</th>
      <th class="blue">Tổng tồn</th>
      <th class="red">Bán CS1</th>
      <th class="red">Tồn CS1</th>
      <th class="red">Tồn CS2</th>
      <th class="red">Bán CS2</th>
    </tr>
    <tr>
      <td class="size">Tổng</td>
      <td class="number">${showEmptyIfZero(totalRow.nhapmua)}</td>
      <td class="number">${showEmptyIfZero(totalRow.xuatban)}</td>
      <td class="number">${showEmptyIfZero(totalRow.toncuoi)}</td>
      <td class="number">${showEmptyIfZero(totalRow.ban_cs1)}</td>
      <td class="number">${showEmptyIfZero(totalRow.ton_cs1)}</td>
      <td class="number">${showEmptyIfZero(totalRow.ton_cs2)}</td>
      <td class="number">${showEmptyIfZero(totalRow.ban_cs2)}</td>
    </tr>`;
    SIZE_LIST.slice(1).forEach(sz => {
        const r = rowMap[sz];
        htmlRight += `
      <tr>
        <td class="size">${sz === '0' ? 'Sai không' : sz}</td>
        <td class="number">${showEmptyIfZero(r?.nhapmua)}</td>
        <td class="number">${showEmptyIfZero(r?.xuatban)}</td>
        <td class="number">${showEmptyIfZero(r?.toncuoi)}</td>
        <td class="number">${showEmptyIfZero(r?.ban_cs1)}</td>
        <td class="number">${showEmptyIfZero(r?.ton_cs1)}</td>
        <td class="number">${showEmptyIfZero(r?.ton_cs2)}</td>
        <td class="number">${showEmptyIfZero(r?.ban_cs2)}</td>
      </tr>`;
    });
    document.getElementById("infoTableRight").innerHTML = htmlRight;

    // Ảnh sản phẩm dưới bảng
    setProductImageByMasp(hanghoa.masp);
    document.getElementById("maspInput").select();
}

/* ====== KHỐI HTML CHO NHIỀU MÃ (dùng cùng layout mới) ====== */
async function renderProductDetailHTML(masp) {
    const { data: hanghoa, error: err1 } = await supabase.from("dmhanghoa").select("*").eq("masp", masp).single();
    if (err1 || !hanghoa) return `<div style="color:red">Không lấy được thông tin sản phẩm</div>`;

    // ngày nhập đầu/cuối
    const { data: nhapList } = await supabase.from("hoadon_banle").select("ngay,sohd").in("loaihd", ["nmcs1", "nmcs2"]).order("ngay", { ascending: true });
    let ngay_nhapdau = "", ngay_nhapcuoi = "";
    if (nhapList?.length) {
        const sohdArr = nhapList.map(e => e.sohd);
        const { data: cts } = await supabase.from("ct_hoadon_banle").select("sohd,masp").in("sohd", sohdArr).eq("masp", masp);
        const setSohd = new Set(cts.map(e => e.sohd));
        const filtered = nhapList.filter(e => setSohd.has(e.sohd));
        if (filtered.length) { ngay_nhapdau = filtered[0].ngay; ngay_nhapcuoi = filtered[filtered.length - 1].ngay; }
    }

    // ngày kiểm gần nhất
    let ngay_kiem_cs1 = "", ngay_kiem_cs2 = "";
    {
        const { data: k1 } = await supabase.from("kiemkho").select("ngaygio").eq("masp", masp).eq("diadiem", "cs1").order("ngaygio", { ascending: false }).limit(1);
        if (k1?.length) ngay_kiem_cs1 = k1[0].ngaygio;
        const { data: k2 } = await supabase.from("kiemkho").select("ngaygio").eq("masp", masp).eq("diadiem", "cs2").order("ngaygio", { ascending: false }).limit(1);
        if (k2?.length) ngay_kiem_cs2 = k2[0].ngaygio;
    }

    // XNT
    const { data: xntdata } = await supabase.rpc("timkiemhanghoa", { masp_query: masp });
    if (!xntdata || !xntdata.length) return `<div style="color:#c62828">Không có dữ liệu xuất nhập tồn!</div>`;

    const SIZE_LIST = ['Tổng', '0', '38', '39', '40', '41', '42', '43', '44', '45'];
    const rowMap = {};
    xntdata.forEach(r => { rowMap[r.size === null ? '' : r.size] = r; });
    const totalRow = {};
    ["nhapmua", "xuatban", "toncuoi", "ban_cs1", "ton_cs1", "ton_cs2", "ban_cs2"].forEach(f => {
        totalRow[f] = SIZE_LIST.slice(1).reduce((s, sz) => s + (Number(rowMap[sz]?.[f]) || 0), 0);
    });

    let html = `
    <div class="top-info">
      <table class="info-table">
        <tr>
          <th>Mã hàng</th>
          <th>Vị trí CS1</th>
          <th>Vị trí CS2</th>
          <th>Giá lẻ</th>
          <th class="red">ND</th>
          <th class="red">NC</th>
          <th class="red">Kiểm CS1</th>
          <th class="red">Kiểm CS2</th>
        </tr>
        <tr>
          <td>${hanghoa.masp || ""}</td>
          <td>${hanghoa.vitrikho1 || ""}</td>
          <td>${hanghoa.vitrikho2 || ""}</td>
          <td>${hanghoa.giale?.toLocaleString() || ""}</td>
          <td>${formatDateOnly(ngay_nhapdau) || ""}</td>
          <td>${formatDateOnly(ngay_nhapcuoi) || ""}</td>
          <td>${formatDateOnly(ngay_kiem_cs1) || ""}</td>
          <td>${formatDateOnly(ngay_kiem_cs2) || ""}</td>
        </tr>
      </table>
    </div>
    <div class="right-xnt">
      <table class="info-table">
        <tr>
          <th class="size">Size</th>
          <th class="blue">Tổng mua</th>
          <th class="blue">Tổng bán</th>
          <th class="blue">Tổng tồn</th>
          <th class="red">Bán CS1</th>
          <th class="red">Tồn CS1</th>
          <th class="red">Tồn CS2</th>
          <th class="red">Bán CS2</th>
        </tr>
        <tr>
          <td class="size">Tổng</td>
          <td class="number">${showEmptyIfZero(totalRow.nhapmua)}</td>
          <td class="number">${showEmptyIfZero(totalRow.xuatban)}</td>
          <td class="number">${showEmptyIfZero(totalRow.toncuoi)}</td>
          <td class="number">${showEmptyIfZero(totalRow.ban_cs1)}</td>
          <td class="number">${showEmptyIfZero(totalRow.ton_cs1)}</td>
          <td class="number">${showEmptyIfZero(totalRow.ton_cs2)}</td>
          <td class="number">${showEmptyIfZero(totalRow.ban_cs2)}</td>
        </tr>`;
    SIZE_LIST.slice(1).forEach(sz => {
        const r = rowMap[sz];
        html += `
        <tr>
          <td class="size">${sz === '0' ? 'Sai không' : sz}</td>
          <td class="number">${showEmptyIfZero(r?.nhapmua)}</td>
          <td class="number">${showEmptyIfZero(r?.xuatban)}</td>
          <td class="number">${showEmptyIfZero(r?.toncuoi)}</td>
          <td class="number">${showEmptyIfZero(r?.ban_cs1)}</td>
          <td class="number">${showEmptyIfZero(r?.ton_cs1)}</td>
          <td class="number">${showEmptyIfZero(r?.ton_cs2)}</td>
          <td class="number">${showEmptyIfZero(r?.ban_cs2)}</td>
        </tr>`;
    });
    html += `
      </table>
    </div>
    <div class="img-wrap">
      <img alt="Ảnh sản phẩm" src="${IMG_BASE}${encodeURIComponent(hanghoa.masp)}.JPG"
           onerror="this.onerror=null;this.src='${IMG_BASE}${encodeURIComponent(hanghoa.masp)}.png';" />
    </div>`;
    return html;
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
};


/* ====== TIỆN ÍCH ====== */




// Base ảnh sản phẩm
const IMG_BASE = "https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/";

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

document.getElementById('bulkTextarea')?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') triggerSearch();
});

