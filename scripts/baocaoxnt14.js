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

// Ảnh sản phẩm: .JPG -> .png nếu lỗi
const BASE_IMG = "https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/";

function showProdImage(masp) {
    const modal = document.getElementById('imgModal');
    const img = document.getElementById('prodImg');
    const cap = document.getElementById('imgCaption');

    const code = String(masp || '').trim().toUpperCase();
    cap.textContent = code;

    img.onerror = null;
    img.src = BASE_IMG + encodeURIComponent(code) + ".JPG";
    img.onerror = () => {
        if (img.src.endsWith(".JPG")) {
            img.src = BASE_IMG + encodeURIComponent(code) + ".png";
        } else {
            cap.textContent = code + " (không có ảnh)";
        }
    };

    modal.style.display = 'flex';
}
// đóng modal
(function attachModalHandlers() {
    const modal = document.getElementById('imgModal');
    const btn = document.getElementById('imgClose');
    if (!modal || !btn) return;
    btn.addEventListener('click', () => modal.style.display = 'none');
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none'; // click nền để đóng
    });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.style.display = 'none'; });
})();



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
    const functionName = document.getElementById("selectFunction")?.value || "baocaoxnt14_paged";

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
    // Xác định p_nhacc_filter vs p_khachhang_filter
    let nhaccFilter = null;
    let khachhangFilter = (khachhang && khachhang.trim()) ? khachhang.trim() : null;

    if (locNCC) {
        // Khi TÍCH "Lọc theo nhà cung cấp":
        //  - KHÔNG dùng p_khachhang_filter
        //  - Dùng p_nhacc_filter = giá trị người dùng nhập (ưu tiên mã NCC). Chuẩn hoá in hoa nếu cột nhacc là in hoa.
        nhaccFilter = (khachhang && khachhang.trim()) ? khachhang.trim().toUpperCase() : null;
        khachhangFilter = null;
    }



    // Gửi filter xuống function SQL    

    if (locNCC && khachhang) {
        // Nếu tích lọc theo nhà cung cấp thì lấy toàn bộ mã hàng có nhacc = khachhang
        // Dùng giá trị đã chuẩn hoá
        const keyNCC = nhaccFilter || (khachhang ? khachhang.trim().toUpperCase() : null);
        const { data: dsmaspNCC, error: errNCC } = await supabase
            .from('dmhanghoa')
            .select('masp')
            .eq('nhacc', keyNCC);


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

        p_nhacc_filter: nhaccFilter,
        p_khachhang_filter: khachhangFilter,

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

    // Hiển thị LINK sang trang tìm kiếm, mở tab mới
    const maspRenderer = function (instance, td, row, col, prop, value) {
        const code = (value ?? '').toString().trim().toUpperCase();
        td.innerHTML = '';
        if (!code) return;

        const url = `https://banle-js.vercel.app/timkiemhanghoa333.html?masp=${encodeURIComponent(code)}`;
        const a = document.createElement('a');
        a.className = 'masp-link';
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        // Nếu muốn hiện nguyên URL trong ô:
        a.textContent = code;

        td.appendChild(a);
    };


    // Renderer hiển thị trống nếu giá trị = 0
    const zeroBlankRenderer = function (instance, td, row, col, prop, value) {
        const v = value;
        // Xóa nội dung mặc định
        td.innerHTML = '';

        // Trống nếu 0 / "0" / null / undefined
        if (v === 0 || v === '0' || v === null || v === undefined) {
            return;
        }

        // Nếu là số thì format, còn lại thì hiển thị nguyên văn
        const num = typeof v === 'number' ? v : parseFloat(v);
        if (!Number.isNaN(num) && Number.isFinite(num)) {
            td.textContent = num.toLocaleString();
            td.classList.add('htRight');
        } else {
            td.textContent = v ?? '';
        }
    };


    // Định nghĩa cột cho Handsontable (ẩn hoàn toàn dvt, nhomhang, mausac)
    const columns = [
        { data: 'masp', title: 'Mã hàng', width: 110, renderer: maspRenderer },
        { data: 'size', title: 'Kích cỡ', width: 50, className: 'htCenter' },

        { data: 'xuatban', title: 'Xuất bán', width: 70, className: 'htRight', renderer: zeroBlankRenderer },
        { data: 'ton_cs1', title: 'Tồn CS1', width: 70, className: 'htRight', renderer: zeroBlankRenderer },
        { data: 'ton_cs2', title: 'Tồn CS2', width: 70, className: 'htRight', renderer: zeroBlankRenderer },
        { data: 'nhapmua', title: 'Nhập mua', width: 72, className: 'htRight', renderer: zeroBlankRenderer },
        { data: 'cuoiky', title: 'Cuối kỳ', width: 70, className: 'htRight', renderer: zeroBlankRenderer },
        { data: 'giale', title: 'Giá lẻ', width: 78, className: 'htRight', renderer: zeroBlankRenderer },
        { data: 'dauky', title: 'Đầu kỳ', width: 70, className: 'htRight', renderer: zeroBlankRenderer },
        { data: 'xuatkhac', title: 'Xuất khác', width: 76, className: 'htRight', renderer: zeroBlankRenderer },
        { data: 'tongxuat', title: 'Tổng xuất', width: 76, className: 'htRight', renderer: zeroBlankRenderer },
        { data: 'nhapkhac', title: 'Nhập khác', width: 76, className: 'htRight', renderer: zeroBlankRenderer },
        { data: 'tongnhap', title: 'Tổng nhập', width: 76, className: 'htRight', renderer: zeroBlankRenderer },

        { data: 'tensp', title: 'Tên hàng', width: 110 },
        // { data: 'gianhap', title: 'Ẩn - Giá nhập', width: 90 }
    ];


    const hotData = data.map((row, idx) => ({ stt: idx + 1, ...row }));

    hotInstance = new Handsontable(container, {
        data: hotData,
        columns,
        // Header 2 dòng
        colHeaders: columns.map(col => col.title),

        rowHeaders: true,
        width: '100%',

        height: 100,            // ✅ chỉ tạm thời; sẽ cập nhật ngay sau bằng resizeHotHeight()
        stretchH: 'all',

        readOnly: true,
        manualColumnResize: true,
        columnSorting: true,
        filters: true,
        dropdownMenu: true,

        copyPaste: { copyColumnHeaders: true },
        hiddenColumns: { columns: [15], indicators: false },
        licenseKey: 'non-commercial-and-evaluation',
    });


    window.hotInstance = hotInstance;

    updatePageInfo();
    window.lastParams = { ...params }; // Ghi nhớ điều kiện lọc cho xuất toàn bộ

    if (loadingMsg) loadingMsg.textContent = "";  // Ẩn thông báo "Đang tải..."

    resizeHotHeight(); // tính lại chiều cao ngay sau khi render bảng

};

function resizeHotHeight() {
    const hotEl = document.getElementById('hot');
    const pagEl = document.getElementById('pagination');
    if (!hotEl) return;

    const rectTop = hotEl.getBoundingClientRect().top;   // vị trí đỉnh bảng so với viewport
    const vh = window.innerHeight;
    const pagH = pagEl ? pagEl.offsetHeight : 0;
    const gap = 4;                                      // sát hơn để không mất chỗ

    // Chiều cao phù hợp với viewport, trừ thanh phân trang
    const newH = Math.max(220, vh - rectTop - pagH - gap);

    // ✅ cập nhật chiều cao THỰC của Handsontable
    if (window.hotInstance) {
        hotInstance.updateSettings({ height: newH });
    }

    // ✅ chừa padding đáy ngay trên vùng cuộn thực tế (.wtHolder) để không bị che
    const holder = document.querySelector('#hot .ht_master .wtHolder');
    if (holder) holder.style.paddingBottom = (pagH + 6) + 'px';
}


window.addEventListener('resize', resizeHotHeight);
window.addEventListener('orientationchange', resizeHotHeight);
document.addEventListener('DOMContentLoaded', resizeHotHeight);
// Gọi thêm 1 lần sau khi dữ liệu/pagination hiện ra:
setTimeout(resizeHotHeight, 100);


// ==== HIỂN THỊ ẢNH TỪ DANH SÁCH ĐANG CÓ TRÊN XNT14 ====
window.moTrangAnh = function () {
    if (!window.hotInstance) {
        alert("Chưa có dữ liệu để hiển thị ảnh.");
        return;
    }
    // Lấy toàn bộ data đang nạp vào bảng (object có khóa masp, giale, ...)
    const src = hotInstance.getSourceData(); // mảng object
    const list = src
        .map(r => ({
            masp: String(r.masp || "").trim().toUpperCase(),
            giale: Number(r.giale || 0) // giá lẻ nằm trong kết quả RPC và cột của bảng
        }))
        .filter(x => x.masp);

    if (!list.length) {
        alert("Không có mã hàng hợp lệ trong bảng.");
        return;
    }
    // Truyền sang trang ảnh
    sessionStorage.setItem("XNT14_MASP_LIST", JSON.stringify(list));
    window.open("xemanhxnt14.html", "_blank");
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
        list.innerHTML = '<i>Nhập từ khóa (≥0 ký tự)...</i>';
    }
};
window.closePopupSearch = function () {
    document.getElementById('popupSearch').style.display = 'none';
};

// Đóng popup bằng phím ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const p = document.getElementById('popupSearch');
        if (p && p.style.display === 'block') window.closePopupSearch();
    }
});

// Đóng popup khi click ra ngoài khung content
document.addEventListener('click', (e) => {
    const overlay = document.getElementById('popupSearch');
    if (!overlay || overlay.style.display !== 'block') return;
    // Bỏ qua cú click vừa mở popup
    if (window._skipDocClickOnce) { window._skipDocClickOnce = false; return; }
    // Chỉ đóng khi click đúng overlay (vùng nền), không đóng khi click trong khung nội dung
    if (e.target === overlay) window.closePopupSearch();
});



// Ngăn sự kiện click bên trong box lan ra overlay
const box = document.getElementById('popupSearchContent');
if (box) {
    box.addEventListener('click', (e) => e.stopPropagation());
}

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

    // ⬇️ ĐOẠN MỚI (nhánh NCC cho popup gõ phím)
    // NHÁNH NCC: tìm trong dmkhachhang, lọc la_ncc = true, hiển thị MÃ - TÊN
    if (type === 'khachhang' && document.getElementById('locNCCCheckbox')?.checked) {
        const keyword = document.getElementById('popupSearchInput').value.trim();

        // Tìm theo mã hoặc tên NCC
        let query = supabase
            .from('dmkhachhang')
            .select('makh, tenkh')
            .eq('la_ncc', true)
            .limit(200);

        if (keyword) {
            // tìm gần đúng trên cả mã và tên
            query = query.or(`makh.ilike.%${keyword}%,tenkh.ilike.%${keyword}%`);
        }

        const { data, error } = await query;
        if (error || !data || data.length === 0) {
            document.getElementById('popupSearchList').innerHTML = '<i>Không tìm thấy NCC</i>';
            return;
        }

        // render MÃ - TÊN; click trả về MÃ (để lọc theo mã chuẩn)
        document.getElementById('popupSearchList').innerHTML = data.map(row => `
    <div style="padding:5px 10px;cursor:pointer;border-bottom:1px solid #eee;"
         onclick="selectPopupValue('khachhang', '${(row.makh || '').replace(/'/g, "\\'")}', this)"
         title="${row.tenkh ? row.tenkh.replace(/"/g, '\\"') : ''}">
      ${row.makh || ''}${row.tenkh ? ' - ' + row.tenkh : ''}
    </div>
  `).join('');

        return; // chặn luồng mặc định (khách hàng)
    }


    let table = '', field = '', extraFields = '';
    if (type === 'khachhang') { table = 'dmkhachhang'; field = 'makh'; extraFields = ', tenkh'; }
    else if (type === 'mahang') { table = 'dmhanghoa'; field = 'masp'; extraFields = ', tensp'; }
    else if (type === 'nhomhang') { table = 'dmnhomhang'; field = 'manhom'; extraFields = ', tennhom'; }
    else if (type === 'chungloai') { table = 'dmchungloai'; field = 'machungloai'; extraFields = ', tenchungloai'; }

    else if (type === 'mausac') { table = 'dmmausac'; field = 'mamau'; extraFields = ', tenmau'; }

    else if (type === 'nhanvien') { table = 'dmnhanvien'; field = 'manv'; extraFields = ', tennv'; }
    else if (type === 'size') { table = 'dm_size'; field = 'size'; extraFields = ', mota'; }
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

       ${row[field]}
 ${row.tensp ? " - " + row.tensp : ""}
 ${row.tenkh ? " - " + row.tenkh : ""}
 ${row.tennv ? " - " + row.tennv : ""}
 ${row.tennhom ? " - " + row.tennhom : ""}
 ${row.tenchungloai ? " - " + row.tenchungloai : ""}
 ${row.tenmau ? " - " + row.tenmau : ""}
 ${row.mota ? " - " + row.mota : ""}

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

    // ⬇️ ĐOẠN MỚI (nhánh NCC cho lần mở popup/bắn search mặc định)
    // NHÁNH NCC khi vừa mở popup (hoặc chạy search mặc định)
    if (type === 'khachhang' && document.getElementById('locNCCCheckbox')?.checked) {
        let query = supabase
            .from('dmkhachhang')
            .select('makh, tenkh')
            .eq('la_ncc', true)
            .limit(500);

        if (keyword && keyword.length >= 1) {
            query = query.or(`makh.ilike.%${keyword}%,tenkh.ilike.%${keyword}%`);
        }

        const { data, error } = await query;
        if (error || !data || data.length === 0) {
            document.getElementById('popupSearchList').innerHTML = '<i>Không tìm thấy NCC</i>';
            return;
        }

        document.getElementById('popupSearchList').innerHTML = data.map(row => `
    <div style="padding:5px 10px;cursor:pointer;border-bottom:1px solid #eee;"
         onclick="selectPopupValue('khachhang', '${(row.makh || '').replace(/'/g, "\\'")}', this)"
         title="${row.tenkh ? row.tenkh.replace(/"/g, '\\"') : ''}">
      ${row.makh || ''}${row.tenkh ? ' - ' + row.tenkh : ''}
    </div>
  `).join('');

        return; // chặn luồng mặc định
    }


    let table = '', field = '', extraFields = '';
    if (type === 'khachhang') {
        table = 'dmkhachhang'; field = 'tenkh'; extraFields = ', tenkh';
    } else if (type === 'mahang') {
        table = 'dmhanghoa'; field = 'masp'; extraFields = ', tensp';
    } else if (type === 'nhomhang') {
        // ĐỔI NGUỒN → BẢNG DANH MỤC NHÓM HÀNG
        table = 'dmnhomhang'; field = 'manhom'; extraFields = ', tennhom';
    } else if (type === 'chungloai') {
        // ĐỔI NGUỒN → BẢNG DANH MỤC CHỦNG LOẠI
        table = 'dmchungloai'; field = 'machungloai'; extraFields = ', tenchungloai';
    } else if (type === 'mausac') {
        table = 'dmmausac'; field = 'mamau'; extraFields = ', tenmau';
    } else if (type === 'nhanvien') {
        table = 'dmnhanvien'; field = 'tennv'; extraFields = ', tennv';
    } else if (type === 'size') {
        table = 'dm_size'; field = 'size'; extraFields = ', mota';
    } else return;


    let query = supabase.from(table).select(`${field}${extraFields}`).limit(500);
    if (keyword && keyword.length >= 1) {
        query = query.ilike(field, `%${keyword}%`);
    }
    const { data, error } = await query;
    if (error || !data || data.length === 0) {
        document.getElementById('popupSearchList').innerHTML = '<i>Không tìm thấy dữ liệu</i>';
        return;
    }
    // Lọc unique cho các field không unique
    let uniqueData = data;
    if (['manhom', 'machungloai', 'mamau', 'size'].includes(field)) {
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
       ${row.tennhom ? " - " + row.tennhom : ""}           <!-- ⬅️ THÊM -->
      ${row.tenchungloai ? " - " + row.tenchungloai : ""} <!-- ⬅️ THÊM -->
      ${row.tenmau ? " - " + row.tenmau : ""}
      ${row.mota ? " - " + row.mota : ""}
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
        const { data, error } = await supabase.rpc("baocaoxnt14_paged", {
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

// ==== 7b. COPY TOÀN BỘ BẢNG (KỂ CẢ TIÊU ĐỀ) ====
window.copyBang = async function () {
    if (!window.hotInstance) {
        alert("❌ Chưa có dữ liệu để copy!");
        return;
    }

    // Lấy tiêu đề cột theo đúng header đang hiển thị
    const headers = hotInstance.getColHeader();

    // Lấy toàn bộ data đang hiển thị (đã sắp xếp/lọc theo Handsontable)
    // getData() trả về ma trận dữ liệu theo thứ tự các cột hiển thị
    const data = hotInstance.getData();

    // Ghép tiêu đề + dữ liệu thành TSV (tab-separated) để dán thẳng vào Excel/Google Sheets
    const rows = [headers, ...data].map(row =>
        row.map(v => {
            if (v === null || v === undefined) return "";
            // Chuẩn hóa về text phẳng, tránh xuống dòng/tab phá định dạng khi dán
            return String(v).replace(/\t/g, " ").replace(/\r?\n/g, " ");
        }).join("\t")
    );
    const tsv = rows.join("\n");

    // Copy vào clipboard (ưu tiên Clipboard API, fallback textarea nếu bị chặn)
    try {
        await navigator.clipboard.writeText(tsv);
        alert("✅ Đã copy toàn bộ bảng (kể cả tiêu đề) vào clipboard!");
    } catch (e) {
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = tsv;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
            document.execCommand("copy");
            alert("✅ Đã copy toàn bộ bảng (kể cả tiêu đề) vào clipboard!");
        } catch (err) {
            alert("❌ Trình duyệt chặn copy. Hãy dán thủ công từ file Excel xuất ra.");
        }
        document.body.removeChild(ta);
    }
};

