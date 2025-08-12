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
    const msg = document.getElementById('statusMsg');
    msg.textContent = "Đang tìm kiếm mã sản phẩm...";
    document.getElementById('multiDetailBox').innerHTML = "";
    document.getElementById('multiDetailBox').style.display = "none";
    document.getElementById('singleDetailBox').style.display = "";
    document.getElementById('maspInput').select();

    let masp = _masp || document.getElementById('maspInput').value.trim().toUpperCase();
    if (!masp || masp.length < 3) {
        msg.textContent = "Vui lòng nhập tối thiểu 3 ký tự mã sản phẩm!";
        return;
    }

    // Tìm tất cả mã sản phẩm phù hợp
    let { data: list, error } = await supabase
        .from("dmhanghoa")
        .select("*")
        .ilike("masp", `%${masp}%`)
        .order("masp")
        .limit(20);

    if (error || !list || !list.length) {
        msg.textContent = "Không tìm thấy mã sản phẩm!";
        return;
    }

    // Mảng chứa các mã thực sự có phát sinh xuất nhập tồn
    let productWithXNT = [];

    // Lặp từng mã sản phẩm, chỉ giữ lại mã có phát sinh XNT
    for (const row of list) {
        let { data: xntdata, error: xntErr } = await supabase.rpc("timkiemhanghoa", { masp_query: row.masp });
        if (xntErr) continue;
        if (xntdata && xntdata.length > 0) {
            productWithXNT.push(row.masp);
        }
    }

    if (productWithXNT.length === 0) {
        msg.textContent = "Không có mã sản phẩm nào phát sinh xuất nhập tồn!";
        document.getElementById('singleDetailBox').style.display = "none";
        document.getElementById('multiDetailBox').style.display = "none";
        return;
    }

    // Nếu chỉ 1 mã, hiển thị như cũ
    if (productWithXNT.length === 1) {
        document.getElementById('singleDetailBox').style.display = "";
        await renderOneProductDetail(productWithXNT[0]);
        msg.textContent = "Hoàn thành! Trả về 1 sản phẩm.";
        return;
    }

    // Nếu nhiều mã, hiển thị tất cả
    document.getElementById('singleDetailBox').style.display = "none";
    let html = "";
    for (const masp of productWithXNT) {
        html += `<div style="margin-bottom:32px; border-bottom:1px dashed #90caf9;">${await renderProductDetailHTML(masp)}</div>`;
    }
    document.getElementById('multiDetailBox').innerHTML = html;
    document.getElementById('multiDetailBox').style.display = "";
    msg.textContent = `Hoàn thành! Trả về ${productWithXNT.length} sản phẩm.`;
}


// Hàm render detail cho 1 mã, chèn trực tiếp vào DOM (giữ nguyên khung trái/phải)
async function renderOneProductDetail(masp) {
    // Lấy thông tin hàng hóa
    let { data: hanghoa, error: err1 } = await supabase.from("dmhanghoa").select("*").eq("masp", masp).single();
    if (err1 || !hanghoa) return;

    // Lấy ngày nhập đầu/cuối
    let { data: nhapList } = await supabase
        .from("hoadon_banle")
        .select("ngay, sohd")
        .in("loaihd", ["nmcs1", "nmcs2"])
        .order("ngay", { ascending: true });
    let ngay_nhapdau = "", ngay_nhapcuoi = "";
    if (nhapList && nhapList.length) {
        let sohdArr = nhapList.map(e => e.sohd);
        let { data: cts } = await supabase
            .from("ct_hoadon_banle")
            .select("sohd, masp")
            .in("sohd", sohdArr)
            .eq("masp", masp);
        let sohdHasMasp = new Set(cts.map(e => e.sohd));
        let filtered = nhapList.filter(e => sohdHasMasp.has(e.sohd));
        if (filtered.length > 0) {
            ngay_nhapdau = filtered[0].ngay;
            ngay_nhapcuoi = filtered[filtered.length - 1].ngay;
        }
    }

    // Lấy ngày kiểm kho gần nhất tại CS1 và CS2
    let ngay_kiem_cs1 = "", ngay_kiem_cs2 = "";
    {
        let { data: kiem1 } = await supabase
            .from("kiemkho")
            .select("ngaygio")
            .eq("masp", masp)
            .eq("diadiem", "cs1")
            .order("ngaygio", { ascending: false })
            .limit(1);
        if (kiem1 && kiem1.length) ngay_kiem_cs1 = kiem1[0].ngaygio;

        let { data: kiem2 } = await supabase
            .from("kiemkho")
            .select("ngaygio")
            .eq("masp", masp)
            .eq("diadiem", "cs2")
            .order("ngaygio", { ascending: false })
            .limit(1);
        if (kiem2 && kiem2.length) ngay_kiem_cs2 = kiem2[0].ngaygio;
    }

    // Gọi function SQL lấy xuất nhập tồn
    let { data: xntdata } = await supabase.rpc("timkiemhanghoa", { masp_query: masp });
    if (!xntdata || !xntdata.length) {
        document.getElementById('infoTableLeft').innerHTML = "";
        document.getElementById('infoTableRight').innerHTML = "";
        document.getElementById('statusMsg').textContent = "Không có dữ liệu xuất nhập tồn!";
        return false;
    }

    // Map dữ liệu từng size, tính tổng dòng đầu
    const SIZE_LIST = ['Tổng', '0', '38', '39', '40', '41', '42', '43', '44', '45'];
    let rowMap = {};
    xntdata?.forEach(row => {
        rowMap[row.size === null ? '' : row.size] = row;
    });
    let totalRow = {};
    let fieldList = ["nhapmua", "xuatban", "toncuoi", "ban_cs1", "ton_cs1", "ton_cs2", "ban_cs2"];
    fieldList.forEach(field => {
        totalRow[field] = SIZE_LIST.slice(1).reduce((sum, sz) => sum + (Number(rowMap[sz]?.[field]) || 0), 0);
    });

    // Render khung trái (thông tin)
    let htmlLeft = "";
    htmlLeft += `<tr><td class="label">Mã hàng</td><td>${hanghoa.masp}</td></tr>`;
    htmlLeft += `<tr><td class="label">Tên hàng</td><td>${hanghoa.tensp}</td></tr>`;
    htmlLeft += `<tr><td class="label">Vị trí kệ hàng CS1</td><td>${hanghoa.vitrikho1 || ""}</td></tr>`;
    htmlLeft += `<tr><td class="label">Vị trí kệ hàng CS2</td><td>${hanghoa.vitrikho2 || ""}</td></tr>`;
    htmlLeft += `<tr><td class="label">Giá lẻ</td><td>${hanghoa.giale?.toLocaleString() || ""}</td></tr>`;
    htmlLeft += `<tr><td class="label">Nhà cung cấp</td><td>${hanghoa.nhacc || ""}</td></tr>`;
    htmlLeft += `<tr><td class="label">Nhập đầu</td><td>${formatDateOnly(ngay_nhapdau) || ""}</td></tr>`;
    htmlLeft += `<tr><td class="label">Nhập cuối</td><td>${formatDateOnly(ngay_nhapcuoi) || ""}</td></tr>`;
    htmlLeft += `<tr><td class="label">Kiểm CS1</td><td>${formatDateOnly(ngay_kiem_cs1) || ""}</td></tr>`;
    htmlLeft += `<tr><td class="label">Kiểm CS2</td><td>${formatDateOnly(ngay_kiem_cs2) || ""}</td></tr>`;

    document.getElementById('infoTableLeft').innerHTML = htmlLeft;

    // Render khung phải (tồn kho từng size)
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
    `;
    htmlRight += `
    <tr>
        <td class="size">Tổng</td>
        <td class="number">${showEmptyIfZero(totalRow.nhapmua)}</td>
        <td class="number">${showEmptyIfZero(totalRow.xuatban)}</td>
        <td class="number">${showEmptyIfZero(totalRow.toncuoi)}</td>
        <td class="number">${showEmptyIfZero(totalRow.ban_cs1)}</td>
        <td class="number">${showEmptyIfZero(totalRow.ton_cs1)}</td>
        <td class="number">${showEmptyIfZero(totalRow.ton_cs2)}</td>
        <td class="number">${showEmptyIfZero(totalRow.ban_cs2)}</td>
    </tr>
    `;
    SIZE_LIST.slice(1).forEach(sz => {
        let row = rowMap[sz];
        htmlRight += `
        <tr>
            <td class="size">${sz === '0' ? 'Sai không' : sz}</td>
            <td class="number">${showEmptyIfZero(row?.nhapmua)}</td>
            <td class="number">${showEmptyIfZero(row?.xuatban)}</td>
            <td class="number">${showEmptyIfZero(row?.toncuoi)}</td>
            <td class="number">${showEmptyIfZero(row?.ban_cs1)}</td>
            <td class="number">${showEmptyIfZero(row?.ton_cs1)}</td>
            <td class="number">${showEmptyIfZero(row?.ton_cs2)}</td>
            <td class="number">${showEmptyIfZero(row?.ban_cs2)}</td>
        </tr>
        `;
    });
    document.getElementById('infoTableRight').innerHTML = htmlRight;
    document.getElementById('maspInput').select();
}

// Hàm render 1 bản kết quả chi tiết trả về HTML (để dùng trong trường hợp nhiều mã)
async function renderProductDetailHTML(masp) {
    // Lấy thông tin hàng hóa
    let { data: hanghoa, error: err1 } = await supabase.from("dmhanghoa").select("*").eq("masp", masp).single();
    if (err1 || !hanghoa) return "<div style='color:red'>Không lấy được thông tin sản phẩm</div>";

    // Lấy ngày nhập đầu/cuối (giống trên)
    let { data: nhapList } = await supabase
        .from("hoadon_banle")
        .select("ngay, sohd")
        .in("loaihd", ["nmcs1", "nmcs2"])
        .order("ngay", { ascending: true });
    let ngay_nhapdau = "", ngay_nhapcuoi = "";
    if (nhapList && nhapList.length) {
        let sohdArr = nhapList.map(e => e.sohd);
        let { data: cts } = await supabase
            .from("ct_hoadon_banle")
            .select("sohd, masp")
            .in("sohd", sohdArr)
            .eq("masp", masp);
        let sohdHasMasp = new Set(cts.map(e => e.sohd));
        let filtered = nhapList.filter(e => sohdHasMasp.has(e.sohd));
        if (filtered.length > 0) {
            ngay_nhapdau = filtered[0].ngay;
            ngay_nhapcuoi = filtered[filtered.length - 1].ngay;
        }
    }

    // Lấy ngày kiểm kho gần nhất tại CS1 và CS2
    let ngay_kiem_cs1 = "", ngay_kiem_cs2 = "";
    {
        let { data: kiem1 } = await supabase
            .from("kiemkho")
            .select("ngaygio")
            .eq("masp", masp)
            .eq("diadiem", "cs1")
            .order("ngaygio", { ascending: false })
            .limit(1);
        if (kiem1 && kiem1.length) ngay_kiem_cs1 = kiem1[0].ngaygio;

        let { data: kiem2 } = await supabase
            .from("kiemkho")
            .select("ngaygio")
            .eq("masp", masp)
            .eq("diadiem", "cs2")
            .order("ngaygio", { ascending: false })
            .limit(1);
        if (kiem2 && kiem2.length) ngay_kiem_cs2 = kiem2[0].ngaygio;
    }

    // Gọi function SQL lấy xuất nhập tồn
    let { data: xntdata } = await supabase.rpc("timkiemhanghoa", { masp_query: masp });
    if (!xntdata || !xntdata.length) {
        document.getElementById('infoTableLeft').innerHTML = "";
        document.getElementById('infoTableRight').innerHTML = "";
        document.getElementById('statusMsg').textContent = "Không có dữ liệu xuất nhập tồn!";
        return false;
    }

    // Map dữ liệu từng size, tính tổng dòng đầu
    const SIZE_LIST = ['Tổng', '0', '38', '39', '40', '41', '42', '43', '44', '45'];
    let rowMap = {};
    xntdata?.forEach(row => {
        rowMap[row.size === null ? '' : row.size] = row;
    });
    let totalRow = {};
    let fieldList = ["nhapmua", "xuatban", "toncuoi", "ban_cs1", "ton_cs1", "ton_cs2", "ban_cs2"];
    fieldList.forEach(field => {
        totalRow[field] = SIZE_LIST.slice(1).reduce((sum, sz) => sum + (Number(rowMap[sz]?.[field]) || 0), 0);
    });

    let html = `
    <div class="flex-wrap" style="margin-bottom:12px;">
        <div class="left-info">
            <table class="info-table">
                <tr><td class="label">Mã hàng</td><td>${hanghoa.masp}</td></tr>
                <tr><td class="label">Tên hàng</td><td>${hanghoa.tensp}</td></tr>
                <tr><td class="label">Vị trí kệ hàng CS1</td><td>${hanghoa.vitrikho1 || ""}</td></tr>
                <tr><td class="label">Vị trí kệ hàng CS2</td><td>${hanghoa.vitrikho2 || ""}</td></tr>
                <tr><td class="label">Giá lẻ</td><td>${hanghoa.giale?.toLocaleString() || ""}</td></tr>
                <tr><td class="label">Nhà cung cấp</td><td>${hanghoa.nhacc || ""}</td></tr>
                <tr><td class="label">Nhập đầu</td><td>${formatDateOnly(ngay_nhapdau) || ""}</td></tr>
                <tr><td class="label">Nhập cuối</td><td>${formatDateOnly(ngay_nhapcuoi) || ""}</td></tr>
                <tr><td class="label">Kiểm CS1</td><td>${formatDateOnly(ngay_kiem_cs1) || ""}</td></tr>
                <tr><td class="label">Kiểm CS2</td><td>${formatDateOnly(ngay_kiem_cs2) || ""}</td></tr>
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
                </tr>
    `;
    SIZE_LIST.slice(1).forEach(sz => {
        let row = rowMap[sz];
        html += `
                <tr>
                    <td class="size">${sz === '0' ? 'Sai không' : sz}</td>
                    <td class="number">${showEmptyIfZero(row?.nhapmua)}</td>
                    <td class="number">${showEmptyIfZero(row?.xuatban)}</td>
                    <td class="number">${showEmptyIfZero(row?.toncuoi)}</td>
                    <td class="number">${showEmptyIfZero(row?.ban_cs1)}</td>
                    <td class="number">${showEmptyIfZero(row?.ton_cs1)}</td>
                    <td class="number">${showEmptyIfZero(row?.ton_cs2)}</td>
                    <td class="number">${showEmptyIfZero(row?.ban_cs2)}</td>
                </tr>
        `;
    });
    html += `
            </table>
        </div>
    </div>
    `;
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
    if (/(back|rear|mặt sau|environment)/.test(s)) score += 100; // camera sau
    if (/(tele|chụp xa|zoom)/.test(s)) score += 40;               // tele tốt cho barcode
    if (/(kép|triple|ba camera)/.test(s)) score += 10;
    if (/(cực rộng|ultra wide)/.test(s)) score -= 30;              // tránh ultra-wide
    if (/(front|trước|mặt trước)/.test(s)) score -= 100;           // tránh camera trước
    return score;
}

async function pickBestBackCamera() {
    await ensureZXing();
    const devices = await ZXING.BrowserCodeReader.listVideoInputDevices();
    if (!devices || !devices.length) return undefined;
    devices.sort((a, b) => scoreCameraLabel(b.label) - scoreCameraLabel(a.label));
    return devices[0].deviceId;
}


async function startScanner(deviceId) {
    await ensureZXing();
    const videoEl = document.getElementById('scannerVideo');
    const status = document.getElementById('scannerStatus');

    // giảm trễ giữa các lần decode để phản hồi nhanh hơn
    codeReader = new ZXING.BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 25 });

    const constraintsBack1080p = {
        video: {
            facingMode: { exact: 'environment' },
            width: { ideal: 1920 }, height: { ideal: 1080 },
            frameRate: { ideal: 30 }
        }
    };
    const constraintsFallback = {
        video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 }, height: { ideal: 720 }
        }
    };

    try {
        if (deviceId) {
            // mở thẳng bằng deviceId tốt nhất
            scanControls = await codeReader.decodeFromVideoDevice(deviceId, videoEl, onScanResult);
        } else {
            // ép back → nếu fail thì rơi xuống ideal
            try {
                scanControls = await codeReader.decodeFromConstraints(constraintsBack1080p, videoEl, onScanResult);
            } catch (_) {
                scanControls = await codeReader.decodeFromConstraints(constraintsFallback, videoEl, onScanResult);
            }
        }

        // cố gắng bật continuous-focus / exposure / WB (nếu hỗ trợ)
        try {
            const track = getVideoTrack();
            await track?.applyConstraints({
                advanced: [
                    { focusMode: 'continuous' },
                    { exposureMode: 'continuous' },
                    { whiteBalanceMode: 'continuous' }
                ]
            });
        } catch (_) { }

        status.textContent = 'Đang quét... đưa mã vào khung.';
        await populateCameraList();

        // set dropdown trỏ ngay về camera tốt nhất
        try {
            const sel = document.getElementById('cameraSelect');
            const bestId = deviceId || await pickBestBackCamera();
            if (sel && bestId) sel.value = bestId;
        } catch (_) { }

        // khởi tạo UI zoom (nếu máy hỗ trợ)
        await initZoomUI();

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
    const track = v?.srcObject?.getVideoTracks?.()[0];
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
        // sắp xếp để “camera tốt” đứng đầu
        devices.sort((a, b) => scoreCameraLabel(b.label) - scoreCameraLabel(a.label));
        devices.forEach((d, i) => {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.textContent = d.label || `Camera ${i + 1}`;
            sel.appendChild(opt);
        });
    } catch (_) { }
}

function getVideoTrack() {
    const v = document.getElementById('scannerVideo');
    return v?.srcObject?.getVideoTracks?.()[0];
}

async function initZoomUI() {
    const wrap = document.getElementById('zoomWrap');
    const range = document.getElementById('zoomRange');
    const track = getVideoTrack();
    if (!wrap || !range || !track || !track.getCapabilities) { wrap.style.display = 'none'; return; }
    const caps = track.getCapabilities();
    if (caps.zoom) {
        range.min = caps.zoom.min ?? 1;
        range.max = caps.zoom.max ?? 6;
        range.step = caps.zoom.step ?? 0.1;
        // set mức zoom nhẹ giúp đọc barcode tốt hơn
        const initZoom = Math.min(Math.max(1.5, range.min), range.max);
        try { await track.applyConstraints({ advanced: [{ zoom: initZoom }] }); } catch { }
        range.value = initZoom;
        range.oninput = async (e) => {
            try { await track.applyConstraints({ advanced: [{ zoom: parseFloat(e.target.value) }] }); } catch { }
        };
        wrap.style.display = 'flex';
    } else {
        wrap.style.display = 'none';
    }
}



async function switchCamera(deviceId) {
    await stopScanner();
    await startScanner(deviceId);
}

async function toggleTorch() {
    const v = document.getElementById('scannerVideo');
    const track = v?.srcObject?.getVideoTracks?.[0];
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
    try { document.activeElement?.blur(); } catch (_) { }  // tránh Live Text
    document.getElementById('scannerModal').style.display = 'block';
    const status = document.getElementById('scannerStatus');
    status.textContent = 'Đang chuẩn bị camera...';

    try {
        await ensureZXing();

        // mồi quyền + lộ labels
        try {
            const pre = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: 'environment' } } });
            pre.getTracks().forEach(t => t.stop());
        } catch (_) {
            try {
                const pre = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
                pre.getTracks().forEach(t => t.stop());
            } catch (_) { }
        }

        const bestId = await pickBestBackCamera();
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
