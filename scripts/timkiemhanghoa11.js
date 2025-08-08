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
document.getElementById('searchBtn').onclick = triggerSearch;

// ==== Hàm hiển thị rỗng nếu giá trị là 0 ====
function showEmptyIfZero(val) {
    return (val && Number(val) !== 0) ? val : "";
}

// ==== Hàm chính lấy và render dữ liệu ====
async function triggerSearch(_masp = null) {
    msg.textContent = "Dang tìm mã sản phẩm!";
    let masp = _masp || document.getElementById('maspInput').value.trim().toUpperCase();
    const msg = document.getElementById('statusMsg');
    msg.textContent = "";
    document.getElementById('multiDetailBox').innerHTML = "";
    document.getElementById('multiDetailBox').style.display = "none";
    document.getElementById('singleDetailBox').style.display = "";

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

    // Nếu chỉ 1 mã -> hiện chi tiết như cũ
    if (list.length === 1) {
        document.getElementById('singleDetailBox').style.display = "";
        await renderOneProductDetail(list[0].masp);
        return;
    }

    // Nhiều mã -> ẩn khung cũ, hiện nhiều bản kết quả
    document.getElementById('singleDetailBox').style.display = "none";
    let html = "";
    for (const row of list) {
        html += `<div style="margin-bottom:32px; border-bottom:1px dashed #90caf9;">` + await renderProductDetailHTML(row.masp) + `</div>`;
    }
    document.getElementById('multiDetailBox').innerHTML = html;
    document.getElementById('multiDetailBox').style.display = "";
    msg.textContent = "Hoan thanh tim kiem.";
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
