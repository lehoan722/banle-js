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
async function triggerSearch() {
    const masp = document.getElementById('maspInput').value.trim().toUpperCase();
    const msg = document.getElementById('statusMsg');
    msg.textContent = "";

    if (!masp) {
        msg.textContent = "Vui lòng nhập mã sản phẩm!";
        return;
    }

    // 1. Lấy thông tin hàng hóa từ dmhanghoa
    let { data: hanghoa, error: err1 } = await supabase.from("dmhanghoa").select("*").eq("masp", masp).single();
    if (err1 || !hanghoa) {
        msg.textContent = "Không tìm thấy mã sản phẩm!";
        document.getElementById('maspInput').select();
        return;
    }

    // 2. Lấy dữ liệu xuất nhập tồn theo size từ function SQL mới


    // 3. Lấy lịch sử nhập (5 lần gần nhất, hoặc tất cả, phân biệt nhập đầu/cuối...)
    // 3. Lấy ngày nhập đầu/cuối từ các phiếu nhập mới (nmcs1, nmcs2)

    let { data: nhapList, error: err3 } = await supabase
        .from("hoadon_banle")
        .select("ngay, sohd")
        .in("loaihd", ["nmcs1", "nmcs2"])
        .order("ngay", { ascending: true }); // order asc để lấy nhập đầu ở đầu

    // Lọc các chứng từ chứa mã sản phẩm này
    let ngay_nhapdau = "";
    let ngay_nhapcuoi = "";
    if (nhapList && nhapList.length) {
        // Lọc theo mã sản phẩm xuất hiện trong ct_hoadon_banle
        let sohdArr = nhapList.map(e => e.sohd);
        let { data: cts, error: ctErr } = await supabase
            .from("ct_hoadon_banle")
            .select("sohd, masp")
            .in("sohd", sohdArr)
            .eq("masp", masp);

        let sohdHasMasp = new Set(cts.map(e => e.sohd));
        // Lấy các phiếu nhập có mã sản phẩm này
        let filtered = nhapList.filter(e => sohdHasMasp.has(e.sohd));
        if (filtered.length > 0) {
            ngay_nhapdau = filtered[0].ngay;
            ngay_nhapcuoi = filtered[filtered.length - 1].ngay;
        }
    }

    // 4. Lấy ngày kiểm kho gần nhất tại CS1 và CS2 từ bảng kiemkho
    let ngay_kiem_cs1 = "";
    let ngay_kiem_cs2 = "";
    {
        // Kiểm kho CS1
        let { data: kiem1 } = await supabase
            .from("kiemkho")
            .select("ngaygio")
            .eq("masp", masp)
            .eq("diadiem", "cs1")
            .order("ngaygio", { ascending: false })
            .limit(1);
        if (kiem1 && kiem1.length) ngay_kiem_cs1 = kiem1[0].ngaygio;

        // Kiểm kho CS2
        let { data: kiem2 } = await supabase
            .from("kiemkho")
            .select("ngaygio")
            .eq("masp", masp)
            .eq("diadiem", "cs2")
            .order("ngaygio", { ascending: false })
            .limit(1);
        if (kiem2 && kiem2.length) ngay_kiem_cs2 = kiem2[0].ngaygio;
    }



    // ==== Chuẩn bị bảng dữ liệu ====
    // Lấy danh sách size, tổng nhập/xuất/tồn

    // Gọi function mới
    let { data: xntdata, error: err2 } = await supabase.rpc("timkiemhanghoa", { masp_query: masp });
    if (err2 || !xntdata || !xntdata.length) {
        msg.textContent = "Không có dữ liệu xuất nhập tồn!";
        return;
    }

    // Duyệt mảng size, chuẩn hóa dữ liệu
    // Lấy size list, map dữ liệu
    let htmlLeft = "";
    htmlLeft += `<tr><td class="label">Mã hàng</td><td>${hanghoa.masp}</td></tr>`;
    htmlLeft += `<tr><td class="label">Tên hàng</td><td>${hanghoa.tensp}</td></tr>`;
    htmlLeft += `<tr><td class="label">Vị trí kệ hàng CS1</td><td>${hanghoa.vitrikho1 || ""}</td></tr>`;
    htmlLeft += `<tr><td class="label">Vị trí kệ hàng CS2</td><td>${hanghoa.vitrikho2 || ""}</td></tr>`;
    htmlLeft += `<tr><td class="label">Giá lẻ</td><td>${hanghoa.giale?.toLocaleString() || ""}</td></tr>`;
    htmlLeft += `<tr><td class="label">Nhà cung cấp</td><td>${hanghoa.nhacc || ""}</td></tr>`;
    htmlLeft += `<tr><td class="label">Nhập cuối</td><td>${ngay_nhapcuoi || ""}</td></tr>`;
    htmlLeft += `<tr><td class="label">Nhập đầu</td><td>${ngay_nhapdau || ""}</td></tr>`;
    htmlLeft += `<tr><td class="label">Kiểm CS1</td><td>${ngay_kiem_cs1 || ""}</td></tr>`;
    htmlLeft += `<tr><td class="label">Kiểm CS2</td><td>${ngay_kiem_cs2 || ""}</td></tr>`;
    document.getElementById('infoTableLeft').innerHTML = htmlLeft;


    // ===== THÊM 2 DÒNG NÀY NGAY SAU =====
    // Tổng từng cột theo size (size khác null/0)

    let sizeRows = xntdata.filter(row => row.size !== 'Tổng');

    let fields = ["nhapmua", "xuatban", "toncuoi", "ban_cs1", "ton_cs1", "ton_cs2", "ban_cs2"];
    let totalRow = {};
    fields.forEach(f => {
        totalRow[f] = sizeRows.reduce((sum, row) => sum + (Number(row[f]) || 0), 0);
    });

    // ... Tiếp tục render bảng như bạn đang làm
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
    // Dòng tổng
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
    // Dòng từng size
    sizeRows.forEach(row => {
        htmlRight += `
    <tr>
        <td class="size">${row.size}</td>
        <td class="number">${showEmptyIfZero(row.nhapmua)}</td>
        <td class="number">${showEmptyIfZero(row.xuatban)}</td>
        <td class="number">${showEmptyIfZero(row.toncuoi)}</td>
        <td class="number">${showEmptyIfZero(row.ban_cs1)}</td>
        <td class="number">${showEmptyIfZero(row.ton_cs1)}</td>
        <td class="number">${showEmptyIfZero(row.ton_cs2)}</td>
        <td class="number">${showEmptyIfZero(row.ban_cs2)}</td>
    </tr>
    `;
    });
    document.getElementById('infoTableRight').innerHTML = htmlRight;


    document.getElementById('maspInput').select();
}
