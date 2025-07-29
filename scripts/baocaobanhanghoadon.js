const supabase = window.supabase;

let hot;
let currentPage = 0;
let pageSize = 1000;


function getLoaiHDFilters() {
    const checkboxes = document.querySelectorAll(".loaihd-filter:checked");
    return Array.from(checkboxes).map(cb => cb.value);
}

function readFilter() {
    return {
        tu_ngay: document.getElementById("tu_ngay").value,
        den_ngay: document.getElementById("den_ngay").value,
        khachhang: document.getElementById("khachhang").value || null,
        nhanvien: document.getElementById("nhanvien").value || null,
        diadiem: document.getElementById("diadiem").value || null,
        masp: document.getElementById("masp").value || null,
        sohd: document.getElementById("sohd").value || null,
        tonghop_ngay: document.getElementById("tonghop_ngay").checked,
        loaihd_filters: getLoaiHDFilters(),
        page_index: currentPage,
        page_size: pageSize
    };
}

async function taiDuLieu() {
    const filter = readFilter();
    const { data, error } = await supabase.rpc('baocaobanhanghoadon_paged', filter);

    if (error) return alert("❌ Lỗi tải dữ liệu: " + error.message);

    if (!hot) initTable();
    hot.loadData(data);
    document.getElementById("pageInfo").innerText = `Trang ${currentPage + 1}`;
}

function initTable() {
    const container = document.getElementById('hotContainer');
    hot = new Handsontable(container, {
        data: [],
        rowHeaders: true,
        colHeaders: [
            "Ngày", "Số HĐ", "Địa điểm", "Loại HĐ", "Nhân viên", "Khách hàng",
            "Mã SP", "Tên SP", "Size", "SL", "Giá", "Thành tiền", "KM"
        ],
        columns: [
            { data: "ngay" }, { data: "sohd" }, { data: "diadiem" }, { data: "loaihd" },
            { data: "tennv" }, { data: "khachhang" }, { data: "masp" }, { data: "tensp" },
            { data: "size" }, { data: "soluong", type: "numeric" },
            { data: "gia", type: "numeric" }, { data: "thanhtien", type: "numeric" },
            { data: "km", type: "numeric" }
        ],
        licenseKey: 'non-commercial-and-evaluation',
        stretchH: 'all',
        width: '100%',
        height: 500,
        selectionMode: 'single'
    });
}

function prevPage() {
    if (currentPage > 0) {
        currentPage--;
        taiDuLieu();
    }
}

function nextPage() {
    currentPage++;
    taiDuLieu();
}

async function xuatExcelToanBo() {
    const filter = readFilter();
    filter.page_index = 0;
    filter.page_size = 100000;

    const { data, error } = await supabase.rpc('baocaobanhanghoadon_paged', filter);
    if (error) return alert("❌ Lỗi xuất Excel: " + error.message);
    if (!data || data.length === 0) return alert("❌ Chưa có dữ liệu để xuất!");

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BaoCaoHoaDon");
    XLSX.writeFile(wb, "baocaobanhang.xlsx");
}

async function xoaHoaDon() {
    const selection = hot.getSelected();
    if (!selection || selection.length === 0) return alert("❌ Chưa chọn hóa đơn nào");

    const rowIndex = selection[0][0];
    const row = hot.getSourceDataAtRow(rowIndex);
    if (!row || !row.sohd) return alert("❌ Dữ liệu không hợp lệ");

    if (!confirm(`Bạn có chắc chắn muốn xóa hóa đơn ${row.sohd}?`)) return;

    await supabase.from('ct_hoadon_banle').delete().eq('sohd', row.sohd);
    await supabase.from('hoadon_banle').delete().eq('sohd', row.sohd);

    alert("✅ Đã xóa hóa đơn " + row.sohd);
    taiDuLieu();
}

window.onload = () => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById("tu_ngay").value = today;
    document.getElementById("den_ngay").value = today;
    taiDuLieu();
};

async function kiemTraDangNhap() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        document.getElementById("authBox").style.display = "block";
        return false;
    } else {
        document.getElementById("authBox").style.display = "none";
        return true;
    }
}

export async function dangNhap() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    document.getElementById("authStatus").innerText = "⏳ Đang đăng nhập...";

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        document.getElementById("authStatus").innerText = "❌ " + error.message;
        return;
    }

    document.getElementById("authBox").style.display = "none";
    taiDuLieu();
}

window.dangNhap = dangNhap;
window.taiDuLieu = taiDuLieu;
window.prevPage = prevPage;
window.nextPage = nextPage;
window.xuatExcelToanBo = xuatExcelToanBo;
window.xoaHoaDon = xoaHoaDon;


