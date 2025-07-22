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
    let { data: xntdata, error: err2 } = await supabase.rpc("timkiemhanghoa", {
        masp_query: masp
    });
    if (err2 || !xntdata || !xntdata.length) {
        msg.textContent = "Không có dữ liệu xuất nhập tồn!";
        return;
    }

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
    let sizeArr = xntdata.map(r => r.size).filter(s => !!s && s !== 'Tổng');
    if (sizeArr.length === 0) sizeArr = ["38", "39", "40", "41", "42", "43", "44", "45"]; // fallback nếu dữ liệu trống
    let bySize = {};
    xntdata.forEach(row => {
        bySize[row.size] = row;
    });
    let sum = (arr, key) => arr.reduce((a, b) => a + (b[key] || 0), 0);

    // Tách riêng dữ liệu tổng (size = 'Tổng')
    let totalRow = xntdata.find(r => r.size === 'Tổng');
    if (!totalRow) totalRow = { tongnhap: sum(xntdata, 'tongnhap'), tongban: sum(xntdata, 'tongban'), tongton: sum(xntdata, 'tongton') };

    // Hiển thị bảng đúng layout mẫu
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

    // Thêm các dòng nhập tiếp theo nếu muốn (n2, n3, ...)
    for (let i = 1; i < nhapList.length - 1; i++) {
        html += `<tr>
            <td class="label">n${i}</td>
            <td>${nhapList[i].ngay || ""}</td>
            <td colspan="${sizeArr.length + 1}"></td>
        </tr>`;
    }

    // Dòng tiêu đề tổng xuất nhập tồn
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
    </tr>
    `;

    // (Tuỳ ý, có thể mở rộng: bán CS1, tồn CS1, bán CS2, tồn CS2 nếu tách riêng từng trường CS)
    // Bạn có thể thêm vào đây nếu muốn lấy chi tiết bán/tồn từng cơ sở, chỉ cần lấy thêm trường ở SQL.

    table.innerHTML = html;
}
