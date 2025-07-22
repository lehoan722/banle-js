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

// ==== Hàm chính lấy và render dữ liệu ====
async function triggerSearch() {
    const masp = document.getElementById('maspInput').value.trim().toUpperCase();
    const table = document.getElementById('infoTable');
    const msg = document.getElementById('statusMsg');
    table.innerHTML = "";
    msg.textContent = "";

    if (!masp) {
        msg.textContent = "Vui lòng nhập mã sản phẩm!";
        return;
    }

    // 1. Lấy thông tin hàng hóa từ dmhanghoa
    let { data: hanghoa, error: err1 } = await supabase.from("dmhanghoa").select("*").eq("masp", masp).single();
    if (err1 || !hanghoa) {
        msg.textContent = "Không tìm thấy mã sản phẩm!";
        return;
    }

    // 2. Lấy dữ liệu xuất nhập tồn theo size từ function SQL mới
   

    // 3. Lấy lịch sử nhập (5 lần gần nhất, hoặc tất cả, phân biệt nhập đầu/cuối...)
    let { data: nhapList, error: err3 } = await supabase
        .from("ct_hoadon_banle")
        .select("ngay")
        .eq("masp", masp)
        .order("ngay", { ascending: false })
        .limit(5);
    let ngay_nhapcuoi = nhapList && nhapList.length ? nhapList[0].ngay : "";
    let ngay_nhapdau = nhapList && nhapList.length ? nhapList[nhapList.length - 1].ngay : "";

    // ==== Chuẩn bị bảng dữ liệu ====
    // Lấy danh sách size, tổng nhập/xuất/tồn

    // Gọi function mới
    let { data: xntdata, error: err2 } = await supabase.rpc("timkiemhanghoa", { masp_query: masp });
    if (err2 || !xntdata || !xntdata.length) {
        msg.textContent = "Không có dữ liệu xuất nhập tồn!";
        return;
    }

    // Duyệt mảng size, chuẩn hóa dữ liệu
    let sizeArr = xntdata.filter(r => r.size !== 'Tổng').map(r => r.size);
    let bySize = {};
    xntdata.forEach(row => { bySize[row.size] = row; });
    let totalRow = xntdata.find(r => r.size === 'Tổng');

    // Render bảng đúng mẫu
    let html = `
    <tr>
        <td class="title label">Mã hàng</td>
        <td>${hanghoa.masp}</td>
        <td class="size">Tổng</td>
        ${sizeArr.map(s => `<td class="size">${s}</td>`).join("")}
    </tr>
    <tr>
        <td class="label">Tên hàng</td>
        <td>${hanghoa.tensp}</td>
        <td colspan="${sizeArr.length + 1}"></td>
    </tr>
    <tr>
        <td class="label">Vị trí (Kệ hàng)</td>
        <td>${hanghoa.vitrikho1 || ""}</td>
        <td colspan="${sizeArr.length + 1}"></td>
    </tr>
    <tr>
        <td class="label">Vị trí (Kệ hàng) CS2</td>
        <td>${hanghoa.vitrikho2 || ""}</td>
        <td colspan="${sizeArr.length + 1}"></td>
    </tr>
    <tr>
        <td class="label">Giá lẻ</td>
        <td>${hanghoa.giale?.toLocaleString() || ""}</td>
        <td colspan="${sizeArr.length + 1}"></td>
    </tr>
    <tr>
        <td class="label">Nhà cung cấp</td>
        <td>${hanghoa.nhacc || ""}</td>
        <td colspan="${sizeArr.length + 1}"></td>
    </tr>
    <tr>
        <td class="label">Nhập cuối</td>
        <td>${ngay_nhapcuoi || ""}</td>
        <td colspan="${sizeArr.length + 1}"></td>
    </tr>
    <tr>
        <td class="label">Nhập đầu</td>
        <td>${ngay_nhapdau || ""}</td>
        <td colspan="${sizeArr.length + 1}"></td>
    </tr>
`;

    // Dòng n1, n2, n3...
    for (let i = 1; i < nhapList.length - 1; i++) {
        html += `<tr>
        <td class="label">n${i}</td>
        <td>${nhapList[i].ngay || ""}</td>
        <td colspan="${sizeArr.length + 1}"></td>
    </tr>`;
    }

    // Tổng XNT
    html += `<tr>
    <td class="title label" rowspan="3" style="vertical-align:middle;">Tổng XNT</td>
    <td class="blue">Tổng nhập</td>
    <td class="number">${totalRow.tongnhap || 0}</td>
    ${sizeArr.map(s => `<td class="number">${bySize[s]?.tongnhap || 0}</td>`).join("")}
</tr>
<tr>
    <td class="blue">Tổng bán</td>
    <td class="number">${totalRow.tongban || 0}</td>
    ${sizeArr.map(s => `<td class="number">${bySize[s]?.tongban || 0}</td>`).join("")}
</tr>
<tr>
    <td class="blue">Tổng tồn</td>
    <td class="number">${totalRow.tongton || 0}</td>
    ${sizeArr.map(s => `<td class="number">${bySize[s]?.tongton || 0}</td>`).join("")}
</tr>`;

    // CS1
    html += `<tr>
    <td class="title label" rowspan="2" style="vertical-align:middle;">cs1</td>
    <td class="blue">ban cs1</td>
    <td class="number">${totalRow.ban_cs1 || 0}</td>
    ${sizeArr.map(s => `<td class="number">${bySize[s]?.ban_cs1 || 0}</td>`).join("")}
</tr>
<tr>
    <td class="blue">ton cs1</td>
    <td class="number">${totalRow.ton_cs1 || 0}</td>
    ${sizeArr.map(s => `<td class="number">${bySize[s]?.ton_cs1 || 0}</td>`).join("")}
</tr>`;

    // CS2
    html += `<tr>
    <td class="title label" rowspan="2" style="vertical-align:middle;">cs2</td>
    <td class="blue">ton cs2</td>
    <td class="number">${totalRow.ton_cs2 || 0}</td>
    ${sizeArr.map(s => `<td class="number">${bySize[s]?.ton_cs2 || 0}</td>`).join("")}
</tr>
<tr>
    <td class="blue">ban cs2</td>
    <td class="number">${totalRow.ban_cs2 || 0}</td>
    ${sizeArr.map(s => `<td class="number">${bySize[s]?.ban_cs2 || 0}</td>`).join("")}
</tr>`;


    // (Tuỳ ý, có thể mở rộng: bán CS1, tồn CS1, bán CS2, tồn CS2 nếu tách riêng từng trường CS)
    // Bạn có thể thêm vào đây nếu muốn lấy chi tiết bán/tồn từng cơ sở, chỉ cần lấy thêm trường ở SQL.

    table.innerHTML = html;
}
