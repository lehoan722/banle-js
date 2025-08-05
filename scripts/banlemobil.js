// banlemobil.js

// ====== 1. Khởi tạo Supabase Client ======
const supabaseUrl = 'https://rddjrmbyftlcvrgzlyby.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM';
const supabase = window.supabase = window.supabase || supabaseJs?.createClient?.(supabaseUrl, supabaseKey) || createClient(supabaseUrl, supabaseKey);

// ====== 2. Biến toàn cục ======
let dsSanPham = [];

// ====== 3. Tìm sản phẩm theo mã ======
async function timSanPhamTheoMa(masp) {
    masp = (masp || '').toUpperCase();
    let { data, error } = await supabase
        .from('dmhanghoa')
        .select('masp, tensp, giale')
        .eq('masp', masp)
        .limit(1)
        .single();
    if (error || !data) return null;
    return data;
}

// ====== 4. Xử lý nhập mã sản phẩm ======
document.getElementById('masp').addEventListener('keydown', async function(e) {
    if (e.key === 'Enter') {
        let masp = this.value.trim();
        if (!masp) return;
        let sp = await timSanPhamTheoMa(masp);
        if (!sp) {
            alert('Không tìm thấy mã sản phẩm!');
            document.getElementById('tensp').value = '';
            document.getElementById('gia').value = '';
            return;
        }
        document.getElementById('tensp').value = sp.tensp;
        document.getElementById('gia').value = sp.giale || 0;
        document.getElementById('soluong').focus();
    }
});

// ====== 5. Thêm sản phẩm vào bảng kết quả ======
document.getElementById('btn-add').onclick = function() {
    let masp = document.getElementById('masp').value.trim().toUpperCase();
    let tensp = document.getElementById('tensp').value.trim();
    let gia = Number(document.getElementById('gia').value);
    let soluong = Number(document.getElementById('soluong').value) || 1;
    if (!masp || !tensp || !gia) {
        alert('Phải nhập mã sản phẩm hợp lệ!');
        return;
    }
    // Check trùng mã -> cộng dồn số lượng
    let idx = dsSanPham.findIndex(x => x.masp === masp);
    if (idx >= 0) {
        dsSanPham[idx].soluong += soluong;
        dsSanPham[idx].thanhtien = dsSanPham[idx].gia * dsSanPham[idx].soluong;
    } else {
        dsSanPham.push({
            masp, tensp, gia, soluong,
            thanhtien: gia * soluong
        });
    }
    renderBangSanPham();
    // Reset input nhập sản phẩm
    document.getElementById('masp').value = '';
    document.getElementById('tensp').value = '';
    document.getElementById('gia').value = '';
    document.getElementById('soluong').value = 1;
    document.getElementById('masp').focus();
};

// ====== 6. Xóa sản phẩm khỏi bảng kết quả ======
window.xoaDongSanPham = function(idx) {
    dsSanPham.splice(idx, 1);
    renderBangSanPham();
};

// ====== 7. Render bảng sản phẩm ======
function renderBangSanPham() {
    const tbody = document.querySelector('#bangketqua tbody');
    tbody.innerHTML = '';
    dsSanPham.forEach((sp, idx) => {
        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${sp.masp}</td>
            <td>${sp.tensp}</td>
            <td>${sp.gia}</td>
            <td>${sp.soluong}</td>
            <td>${sp.thanhtien}</td>
            <td><button class="btn-delete-row" onclick="xoaDongSanPham(${idx})">🗑️</button></td>
        `;
        tbody.appendChild(tr);
    });
    capNhatTongKet();
}

// ====== 8. Tính tổng & cập nhật giao diện ======
function capNhatTongKet() {
    let tongtien = dsSanPham.reduce((sum, x) => sum + Number(x.thanhtien), 0);
    document.getElementById('tongtien').textContent = tongtien.toLocaleString();
    document.getElementById('phaithanhtoan').textContent = tongtien.toLocaleString();
    // Khuyến mại, chiết khấu nếu cần tính tiếp (bổ sung sau)
    document.getElementById('tongkm').textContent = '0';
    document.getElementById('chietkhau').textContent = '0';
}

// ====== 9. Lưu hóa đơn lên Supabase ======
document.getElementById('btn-luu').onclick = async function() {
    if (dsSanPham.length === 0) {
        alert('Chưa có sản phẩm nào!');
        return;
    }
    let makh = document.getElementById('makh').value.trim();
    let manv = document.getElementById('manv').value.trim();
    let hinhthuctt = document.getElementById('hinhthuctt').value;
    let tongtien = dsSanPham.reduce((sum, x) => sum + Number(x.thanhtien), 0);

    // Thêm hóa đơn
    let { data: hd, error: errHD } = await supabase
        .from('hoadon_banle')
        .insert([{
            makh, manv, hinhthuctt, tongtien, ngay: new Date().toISOString().slice(0,10)
        }])
        .select()
        .single();
    if (errHD || !hd) {
        alert('Lỗi lưu hóa đơn: ' + (errHD?.message || ''));
        return;
    }

    // Thêm chi tiết hóa đơn
    let chitiet = dsSanPham.map(sp => ({
        sohd: hd.sohd,
        masp: sp.masp,
        tensp: sp.tensp,
        gia: sp.gia,
        soluong: sp.soluong,
        thanhtien: sp.thanhtien
    }));
    let { error: errCT } = await supabase
        .from('ct_hoadon_banle')
        .insert(chitiet);
    if (errCT) {
        alert('Lỗi lưu chi tiết: ' + errCT.message);
        return;
    }
    alert('Đã lưu hóa đơn thành công!');
    dsSanPham = [];
    renderBangSanPham();
    // Xóa các ô nhập thông tin
    document.getElementById('makh').value = '';
    document.getElementById('manv').value = '';
};

// ====== 10. Thêm sự kiện cho nút "Thêm mới" (reset form) ======
document.getElementById('btn-them-moi').onclick = function() {
    dsSanPham = [];
    renderBangSanPham();
    document.getElementById('makh').value = '';
    document.getElementById('manv').value = '';
    document.getElementById('masp').focus();
};

// ====== 11. Có thể bổ sung popup tìm kiếm khách hàng, nhân viên... sau ======
