import { supabase } from "./supabaseClient.js";
let hotInstance;
let currentPage = 1;
let pageSize = 10000;


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


// ==== 2. LẤY DỮ LIỆU & HIỂN THỊ HANDSONTABLE ====
window.taiBaoCaoXNT = async function () {
    const loadingMsg = document.getElementById("loadingMsg");
    if (loadingMsg) loadingMsg.textContent = "⏳ Đang tải trang...";

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        alert("Bạn cần đăng nhập trước khi xem báo cáo!");
        document.getElementById("authBox").style.display = "block";
        return;
    }

    // Lấy filter từ giao diện
    const functionName = document.getElementById("selectFunction")?.value || "baocaoxnt13_paged";

    const diadiem = document.getElementById("diadiemSelect").value || null;
    const tuNgay = document.getElementById("tuNgay").value;
    const denNgay = document.getElementById("denNgay").value;
    const khachhang = document.getElementById("khachhangInput").value.trim() || null;
    const nhanvien = document.getElementById("nhanvienInput").value.trim() || null;
    const nhomhang = document.getElementById("nhomhangInput").value.trim() || null;
    const chungloai = document.getElementById("chungloaiInput").value.trim() || null;
    const mausac = document.getElementById("mausacInput").value.trim() || null;
    const size = document.getElementById("sizeInput").value.trim() || null;

    // Lấy danh sách mã sản phẩm từ textarea, chuẩn hóa in hoa và loại bỏ trùng, loại bỏ dòng rỗng
    let maspListRaw = document.getElementById("maspList").value;
    let maspListArr = maspListRaw
        ? maspListRaw.split('\n').map(s => s.trim().toUpperCase()).filter(s => !!s)
        : [];
    maspListArr = Array.from(new Set(maspListArr)); // Loại bỏ trùng

    const masp = document.getElementById("maspInput").value.trim().toUpperCase() || null;

    // Nếu nhập nhiều mã trong textarea thì ưu tiên danh sách này, còn lại dùng filter mã sản phẩm cũ
    let finalMaspList = maspListArr.length > 0 ? maspListArr : (masp ? [masp] : null);


    const tuGia = document.getElementById("tuGia").value || null;
    const denGia = document.getElementById("denGia").value || null;

    if (!tuNgay || !denNgay) return alert("Chọn đủ từ ngày và đến ngày!");

    const locDuong = document.getElementById('locDuong').checked;
    const locAm = document.getElementById('locAm').checked;
    const locHet = document.getElementById('locHet').checked;
    const locPhatSinhNhap = document.getElementById('locPhatSinhNhap').checked;
    const locPhatSinhXuat = document.getElementById('locPhatSinhXuat').checked;
    const tonghopSize = document.getElementById('tonghopSizeCheckbox').checked;
    const locNCC = document.getElementById("locNCCCheckbox").checked;
    const khInput = document.getElementById("khachhangInput");
    if (locNCC) {
        khInput.placeholder = "Mã nhà cung cấp";
    } else {
        khInput.placeholder = "Khách hàng";
    }



    // Gửi filter xuống function SQL    

    if (locNCC && khachhang) {
        // Nếu tích lọc theo nhà cung cấp thì lấy toàn bộ mã hàng có nhacc = khachhang
        const { data: dsmaspNCC, error: errNCC } = await supabase
            .from('dmhanghoa')
            .select('masp')
            .eq('nhacc', khachhang);

        if (errNCC) {
            alert("Lỗi truy vấn nhà cung cấp: " + errNCC.message);
            return;
        }
        if (!dsmaspNCC || dsmaspNCC.length === 0) {
            alert("Không có sản phẩm nào thuộc nhà cung cấp này!");
            return;
        }
        // Gán danh sách mã sản phẩm thuộc NCC
        finalMaspList = dsmaspNCC.map(x => x.masp.toUpperCase());
    }


    const params = {
        tu_ngay: tuNgay,
        den_ngay: denNgay,
        p_diadiem_filter: diadiem,
        p_nhomhang_filter: nhomhang,
        p_chungloai_filter: chungloai,
        p_mausac_filter: mausac,
        p_size_filter: size,

        p_khachhang_filter: khachhang,
        p_nhanvien_filter: nhanvien,
        p_tu_gia: tuGia ? Number(tuGia) : null,
        p_den_gia: denGia ? Number(denGia) : null,
        loc_duong: locDuong,
        loc_am: locAm,
        loc_het: locHet,
        loc_phatsinh_nhap: locPhatSinhNhap,
        loc_phatsinh_xuat: locPhatSinhXuat,
        p_dsmsp: finalMaspList,
        p_tonghop_size: tonghopSize,
        p_limit: pageSize,
        p_offset: (currentPage - 1) * pageSize

    };

    // Gọi function SQL mới
    const { data, error } = await supabase.rpc(functionName, params);

    // HIỂN THỊ HANDSONTABLE
    const container = document.getElementById('hot');
    if (hotInstance) {
        hotInstance.destroy();
        hotInstance = null;
    }

    if (error) {
        container.innerHTML = `<div style="color: red;">Lỗi: ${error.message}</div>`;
        document.getElementById('xntSummary').innerHTML = "";
        return;
    }
    if (!data || !data.length) {
        container.innerHTML = `<div style="color: orange;">Không có dữ liệu</div>`;
        document.getElementById('xntSummary').innerHTML = "";
        return;
    }

    // Tổng hợp số liệu tổng quan
    let tongDauKy = 0, tongNhapMua = 0, tongNhap = 0, tongXuatBan = 0, tongXuat = 0, tongCuoiKy = 0;
    data.forEach(row => {
        tongDauKy += row.dauky || 0;
        tongNhapMua += row.nhapmua || 0;
        tongNhap += row.tongnhap || 0;
        tongXuatBan += row.xuatban || 0;
        tongXuat += row.tongxuat || 0;
        tongCuoiKy += row.cuoiky || 0;
    });
    document.getElementById('xntSummary').innerHTML = `
  <span style="background:#e3f2fd;padding:7px 16px; border-radius:7px;">
    <b>TỔNG SỐ LIỆU:</b>
    Đầu kỳ: <b>${tongDauKy.toLocaleString()}</b>
    &nbsp;|&nbsp; Nhập mua: <b>${tongNhapMua.toLocaleString()}</b>
    &nbsp;|&nbsp; Tổng nhập: <b>${tongNhap.toLocaleString()}</b>
    &nbsp;|&nbsp; Xuất bán: <b>${tongXuatBan.toLocaleString()}</b>
    &nbsp;|&nbsp; Tổng xuất: <b>${tongXuat.toLocaleString()}</b>
    &nbsp;|&nbsp; Cuối kỳ: <b>${tongCuoiKy.toLocaleString()}</b>
  </span>
  `;

    // Định nghĩa cột cho Handsontable (ẩn hoàn toàn dvt, nhomhang, mausac)
    const columns = [
        { data: 'stt', title: '#', readOnly: true, width: 40 },
        { data: 'masp', title: 'Mã hàng', readOnly: true },
        { data: 'tensp', title: 'Tên hàng', readOnly: true },
        { data: 'size', title: 'Kích cỡ', readOnly: true },
        { data: 'dauky', title: 'Đầu kỳ', type: 'numeric', readOnly: true },
        { data: 'nhapmua', title: 'Nhập mua', type: 'numeric', readOnly: true },
        { data: 'nhapkhac', title: 'Nhập khác', type: 'numeric', readOnly: true },
        { data: 'tongnhap', title: 'Tổng nhập', type: 'numeric', readOnly: true },
        { data: 'xuatban', title: 'Xuất bán', type: 'numeric', readOnly: true },
        { data: 'xuatkhac', title: 'Xuất khác', type: 'numeric', readOnly: true },
        { data: 'tongxuat', title: 'Tổng xuất', type: 'numeric', readOnly: true },
        { data: 'cuoiky', title: 'Cuối kỳ', type: 'numeric', readOnly: true },
        { data: 'ton_cs1', title: 'Tồn CS1', type: 'numeric', readOnly: true },
        { data: 'ton_cs2', title: 'Tồn CS2', type: 'numeric', readOnly: true },
        { data: 'giale', title: 'Giá lẻ', type: 'numeric', readOnly: true },
        { data: 'gianhap', title: 'Ẩn - Giá nhập', readOnly: true, visible: false }
    ];

    const hotData = data.map((row, idx) => ({ stt: idx + 1, ...row }));

    hotInstance = new Handsontable(container, {
        data: hotData,
        columns: columns,
        colHeaders: columns.map(col => col.title),
        rowHeaders: true,
        width: '100%',
        height: 550,
        licenseKey: 'non-commercial-and-evaluation',
        stretchH: 'all',
        manualColumnResize: true,
        readOnly: true,
        hiddenColumns: { columns: [15], indicators: false },
        columnSorting: true,        // ✅ Thêm sắp xếp
        filters: true,              // ✅ Thêm lọc
        dropdownMenu: true          // ✅ Thêm menu filter dropdown
    });

    window.hotInstance = hotInstance;

    updatePageInfo();
    window.lastParams = { ...params }; // Ghi nhớ điều kiện lọc cho xuất toàn bộ

    if (loadingMsg) loadingMsg.textContent = "";  // Ẩn thông báo "Đang tải..."

};


// ==== 3. POPUP TÌM KIẾM (DÙNG CHUNG CHO TẤT CẢ INPUT) ====
// Có thể giữ nguyên đoạn code popup cũ (nếu dùng chung với file baocaoxnt.js) hoặc copy lại nguyên xi
window.openPopupSearch = function (type, keyword = "") {
    window.currentPopupType = type;
    const popup = document.getElementById('popupSearch');
    const input = document.getElementById('popupSearchInput');
    const list = document.getElementById('popupSearchList');
    popup.style.display = 'block';
    input.value = keyword || '';
    input.focus();
    if (!keyword || keyword.trim().length === 0) {
        searchPopup(""); // Hiển thị 100 bản đầu
    } else if (keyword.trim().length >= 1) {
        searchPopup(keyword.trim());
    } else {
        list.innerHTML = '<i>Nhập từ khóa (≥2 ký tự)...</i>';
    }
};
window.closePopupSearch = function () {
    document.getElementById('popupSearch').style.display = 'none';
};
window.clearInput = function (inputId) {
    document.getElementById(inputId).value = '';
};

document.getElementById('popupSearchInput').addEventListener('input', async function () {
    let keyword = this.value.trim();
    if (keyword.length < 2) {
        document.getElementById('popupSearchList').innerHTML = '<i>Nhập từ khóa (≥2 ký tự)...</i>';
        return;
    }
    let type = window.currentPopupType;
    let table = '', field = '', extraFields = '';
    if (type === 'khachhang') { table = 'dmkhachhang'; field = 'makh'; extraFields = ', tenkh'; }
    else if (type === 'mahang') { table = 'dmhanghoa'; field = 'masp'; extraFields = ', tensp'; }
    else if (type === 'nhomhang') { table = 'dmhanghoa'; field = 'nhomhang'; }
    else if (type === 'chungloai') { table = 'dmhanghoa'; field = 'chungloai'; }
    else if (type === 'mausac') { table = 'dmhanghoa'; field = 'mausac'; }
    else if (type === 'nhanvien') { table = 'dmnhanvien'; field = 'manv'; extraFields = ', tennv'; }
    else if (type === 'size') { table = 'dmhanghoa'; field = 'size'; }
    else return;

    let { data, error } = await supabase
        .from(table)
        .select(`${field}${extraFields}`)
        .ilike(field, `%${keyword}%`)
        .limit(100);

    if (error || !data || data.length === 0) {
        document.getElementById('popupSearchList').innerHTML = '<i>Không tìm thấy dữ liệu</i>';
        return;
    }
    document.getElementById('popupSearchList').innerHTML = data.map(row => `
    <div style="padding:5px 10px;cursor:pointer;border-bottom:1px solid #eee;"
         onclick="selectPopupValue('${type}', '${row[field].replace(/'/g, "\\'")}', this)">
      ${row[field]}${row.tensp ? " - " + row.tensp : ""}${row.tenkh ? " - " + row.tenkh : ""}${row.tennv ? " - " + row.tennv : ""}
    </div>
  `).join('');
});
window.selectPopupValue = function (type, value, el) {
    let inputId = '';
    if (type === 'khachhang') inputId = 'khachhangInput';
    else if (type === 'mahang') inputId = 'maspInput';
    else if (type === 'nhomhang') inputId = 'nhomhangInput';
    else if (type === 'chungloai') inputId = 'chungloaiInput';
    else if (type === 'mausac') inputId = 'mausacInput';
    else if (type === 'nhanvien') inputId = 'nhanvienInput';
    else if (type === 'size') inputId = 'sizeInput';
    if (inputId) document.getElementById(inputId).value = value;
    closePopupSearch();
};

// ==== 4. AUTO FILL NGÀY, ẨN HIỆN ĐĂNG NHẬP ====
window.onload = async function () {
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('tuNgay').value = today;
    document.getElementById('denNgay').value = today;
    // Ẩn/hiện form đăng nhập
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        document.getElementById("authBox").style.display = "none";
    } else {
        document.getElementById("authBox").style.display = "block";
    }
};

// ==== 5. (Optional) Gán phím tắt Enter cho các ô popup ====
const popupTypes = [
    { id: "khachhangInput", type: "khachhang" },
    { id: "maspInput", type: "mahang" },
    { id: "nhomhangInput", type: "nhomhang" },
    { id: "chungloaiInput", type: "chungloai" },
    { id: "mausacInput", type: "mausac" },
    { id: "nhanvienInput", type: "nhanvien" },
    { id: "sizeInput", type: "size" }
];
popupTypes.forEach(item => {
    const input = document.getElementById(item.id);
    if (!input) return;
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            window.openPopupSearch(item.type, input.value);
        }
    });
});

// ==== 6. Tìm kiếm nhanh khi popup mở ====
async function searchPopup(keyword) {
    let type = window.currentPopupType;
    let table = '', field = '', extraFields = '';
    if (type === 'khachhang') { table = 'dmkhachhang'; field = 'tenkh'; extraFields = ', tenkh'; }
    else if (type === 'mahang') { table = 'dmhanghoa'; field = 'masp'; extraFields = ', tensp'; }
    else if (type === 'nhomhang') { table = 'dmhanghoa'; field = 'nhomhang'; }
    else if (type === 'chungloai') { table = 'dmhanghoa'; field = 'chungloai'; }
    else if (type === 'mausac') { table = 'dmhanghoa'; field = 'mausac'; }
    else if (type === 'nhanvien') { table = 'dmnhanvien'; field = 'tennv'; extraFields = ', tennv'; }
    else if (type === 'size') { table = 'dmhanghoa'; field = 'size'; }
    else return;

    let query = supabase.from(table).select(`${field}${extraFields}`).limit(500);
    if (keyword && keyword.length >= 2) {
        query = query.ilike(field, `%${keyword}%`);
    }
    const { data, error } = await query;
    if (error || !data || data.length === 0) {
        document.getElementById('popupSearchList').innerHTML = '<i>Không tìm thấy dữ liệu</i>';
        return;
    }
    // Lọc unique cho các field không unique
    let uniqueData = data;
    if (['nhomhang', 'chungloai', 'mausac', 'size'].includes(field)) {
        const seen = new Set();
        uniqueData = data.filter(row => {
            const val = row[field];
            if (!val || seen.has(val)) return false;
            seen.add(val);
            return true;
        });
    }
    document.getElementById('popupSearchList').innerHTML = uniqueData.map(row => `
    <div style="padding:5px 10px;cursor:pointer;border-bottom:1px solid #eee;"
         onclick="selectPopupValue('${type}', '${row[field] ? row[field].replace(/'/g, "\\'") : ""}', this)">
      ${row[field] ? row[field] : ""}
      ${row.tensp ? " - " + row.tensp : ""}
      ${row.tenkh ? " - " + row.tenkh : ""}
      ${row.tennv ? " - " + row.tennv : ""}
    </div>
  `).join('');
}

window.prevPage = function () {
    if (currentPage > 1) {
        currentPage--;
        taiBaoCaoXNT();
    }
};

window.nextPage = function () {
    currentPage++;
    taiBaoCaoXNT();
};

function updatePageInfo() {
    document.getElementById("pageInfo").textContent = `Trang ${currentPage}`;
}

// ==== 7. CHỨC NĂNG XUẤT EXCEL ====
window.chonXuatExcel = function () {
    const box = document.getElementById("excelOptions");
    box.style.display = box.style.display === "none" ? "block" : "none";
};

window.xuatExcelTrangHienTai = function () {
    if (!window.hotInstance) return alert("❌ Chưa có dữ liệu để xuất!");
    const data = hotInstance.getData();
    const headers = hotInstance.getColHeader();
    const exportData = [headers, ...data];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "Trang hien tai");

    XLSX.writeFile(wb, "baocaoxnt_tranghientai.xlsx");
};

window.xuatExcelToanBo = async function () {
    const totalData = [];
    const pageSize = 10000;
    let currentOffset = 0;
    let hasMore = true;
    let page = 1;

    const loadingMsg = document.getElementById("loadingMsg");
    if (loadingMsg) loadingMsg.textContent = "⏳ Đang tải toàn bộ dữ liệu để xuất Excel...";

    while (hasMore) {
        const { data, error } = await supabase.rpc("baocaoxnt13_paged", {
            ...window.lastParams,
            p_limit: pageSize,
            p_offset: currentOffset,
        });

        if (error) {
            alert("❌ Lỗi tải trang " + page + ": " + error.message);
            break;
        }

        if (data && data.length > 0) {
            totalData.push(...data);
            currentOffset += pageSize;
            page++;
            if (data.length < pageSize) hasMore = false;
        } else {
            hasMore = false;
        }
    }

    if (loadingMsg) loadingMsg.textContent = "";

    if (totalData.length === 0) return alert("❌ Không có dữ liệu để xuất!");

    const headers = Object.keys(totalData[0]);
    const rows = totalData.map(obj => headers.map(key => obj[key]));
    const exportData = [headers, ...rows];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "Toan bo du lieu");

    XLSX.writeFile(wb, "baocaoxnt_toanbo.xlsx");
};
