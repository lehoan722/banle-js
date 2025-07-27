
import { supabase } from "./supabaseClient.js";
let hotInstance;

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

window.taiBaoCaoXNT = async function () {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        alert("Bạn cần đăng nhập trước khi xem báo cáo!");
        document.getElementById("authBox").style.display = "block";
        return;
    }

    const functionName = "baocaoxnt12";
    const tuNgay = document.getElementById("tuNgay").value;
    const denNgay = document.getElementById("denNgay").value;
    const diadiem = document.getElementById("diadiemSelect").value || null;

    if (!tuNgay || !denNgay) return alert("Chọn đủ từ ngày và đến ngày!");

    const params = {
        tu_ngay: tuNgay,
        den_ngay: denNgay,
        p_diadiem_filter: diadiem,
        p_dsmsp: null,
        p_nhomhang_filter: null,
        p_chungloai_filter: null,
        p_mausac_filter: null,
        p_size_filter: null,
        p_khachhang_filter: null,
        p_nhanvien_filter: null,
        p_tu_gia: null,
        p_den_gia: null,
        loc_duong: false,
        loc_am: false,
        loc_het: false,
        loc_phatsinh_nhap: false,
        loc_phatsinh_xuat: false,
        p_tonghop_size: false
    };

    const { data, error } = await supabase.rpc(functionName, params);

    const container = document.getElementById("hot");
    if (hotInstance) {
        hotInstance.destroy();
        hotInstance = null;
    }

    if (error) {
        container.innerHTML = `<div style="color:red;">Lỗi: ${error.message}</div>`;
        return;
    }

    if (!data || !data.length) {
        container.innerHTML = `<div style="color:orange;">Không có dữ liệu</div>`;
        return;
    }

    const columns = [
        { data: 'stt', title: '#', type: 'numeric', readOnly: true, width: 40 },
        { data: 'masp', title: 'Mã SP', readOnly: true },
        { data: 'tensp', title: 'Tên SP', readOnly: true },
        { data: 'size', title: 'Size', readOnly: true },
        { data: 'dauky', title: 'Tồn đầu', type: 'numeric', readOnly: true },
        { data: 'nhapmua', title: 'Nhập mua', type: 'numeric', readOnly: true },
        { data: 'nhapkhac', title: 'Nhập khác', type: 'numeric', readOnly: true },
        { data: 'tongnhap', title: 'Tổng nhập', type: 'numeric', readOnly: true },
        { data: 'xuatban', title: 'Xuất bán', type: 'numeric', readOnly: true },
        { data: 'xuatkhac', title: 'Xuất khác', type: 'numeric', readOnly: true },
        { data: 'tongxuat', title: 'Tổng xuất', type: 'numeric', readOnly: true },
        { data: 'cuoiky', title: 'Tồn cuối', type: 'numeric', readOnly: true },
        { data: 'ton_cs1', title: 'Tồn CS1', type: 'numeric', readOnly: true },
        { data: 'ton_cs2', title: 'Tồn CS2', type: 'numeric', readOnly: true },
    ];

    const hotData = data.map((row, idx) => ({
        stt: idx + 1,
        ...row
    }));

    hotInstance = new Handsontable(container, {
        data: hotData,
        columns: columns,
        colHeaders: columns.map(col => col.title),
        rowHeaders: true,
        width: '100%',
        height: 500,
        licenseKey: 'non-commercial-and-evaluation',
        stretchH: 'all',
        manualColumnResize: true,
        readOnly: true,
    });
};

window.onload = () => {
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById("tuNgay").value = today;
    document.getElementById("denNgay").value = today;
};
