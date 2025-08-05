// ===== 1. Khởi tạo Supabase Client =====
const supabaseUrl = 'https://rddjrmbyftlcvrgzlyby.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// ===== 2. Biến toàn cục =====
let dsSanPham = [];
let currentLoai = 'bancs1'; // Có thể cấu hình nếu chuyển cơ sở
let currentCoso = 'cs1';
let currentSoHD = '';
let nhanvien = {}; // Lưu thông tin nhân viên nếu cần

// ===== 3. Hàm sinh số hóa đơn tự động =====
async function genSoHoaDon() {
    let { data, error } = await _supabase
        .from('sochungtu')
        .select('so_hientai')
        .eq('loai', currentLoai)
        .eq('coso', currentCoso)
        .order('so_hientai', { ascending: false })
        .limit(1)
        .single();
    let next = (data?.so_hientai || 0) + 1;
    currentSoHD = currentLoai + '_' + String(next).padStart(5, '0');
    document.getElementById('sohd').value = currentSoHD;
    return currentSoHD;
}

// ===== 4. Hàm tìm sản phẩm và xác định loại quản lý size =====
async function timSanPhamTheoMa(masp) {
    masp = (masp || '').toUpperCase();
    let { data, error } = await _supabase
        .from('dmhanghoa')
        .select('masp, tensp, giale, chungloai')
        .eq('masp', masp)
        .limit(1)
        .single();
    if (error || !data) return null;
    return data;
}

// ===== 5. Sự kiện nhập mã sản phẩm (enter hoặc sau khi quét QR) =====
document.getElementById('masp').addEventListener('keydown', async function(e) {
    if (e.key === 'Enter') {
        await xuLyNhapMaSP();
    }
});
// Nếu dùng quét QR thì khi quét xong cũng gọi lại hàm này!
async function xuLyNhapMaSP() {
    let masp = document.getElementById('masp').value.trim().toUpperCase();
    if (!masp) return;
    let sp = await timSanPhamTheoMa(masp);
    if (!sp) {
        alert('Không tìm thấy mã sản phẩm!');
        resetInputSanPham();
        return;
    }
    document.getElementById('gia').value = sp.giale || 0;
    document.getElementById('soluong').value = 1;
    // Nếu là giày dép (chungloai = GD) thì show ô size và focus vào đó
    let chungloai = (sp.chungloai || '').toUpperCase();
    if (chungloai === 'GD') {
        document.getElementById('size').style.display = '';
        document.getElementById('size').focus();
    } else {
        document.getElementById('size').style.display = 'none';
        themSanPhamVaoBang(masp, '', sp.giale, 1); // không cần nhập size
    }
}

// ===== 6. Sự kiện nhập size xong enter thì đẩy vào bảng =====
document.getElementById('size').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        let masp = document.getElementById('masp').value.trim().toUpperCase();
        let gia = Number(document.getElementById('gia').value);
        let soluong = Number(document.getElementById('soluong').value) || 1;
        let size = document.getElementById('size').value.trim().toUpperCase();
        if (!masp || !gia || !size) {
            alert('Thiếu mã SP, size hoặc giá!');
            return;
        }
        themSanPhamVaoBang(masp, size, gia, soluong);
    }
});

// ===== 7. Hàm thêm sản phẩm vào bảng kết quả =====
function themSanPhamVaoBang(masp, size, gia, soluong) {
    // Không cho thêm thiếu thông tin
    if (!masp || !gia || !soluong) return;
    // Kiểm tra trùng mã+size, nếu trùng thì cộng dồn số lượng
    let idx = dsSanPham.findIndex(x => x.masp === masp && (x.size || '') === (size || ''));
    if (idx >= 0) {
        dsSanPham[idx].soluong += soluong;
        dsSanPham[idx].thanhtien = dsSanPham[idx].gia * dsSanPham[idx].soluong;
    } else {
        dsSanPham.push({
            masp, size, gia, soluong,
            thanhtien: gia * soluong
        });
    }
    renderBangSanPham();
    resetInputSanPham();
}

// ===== 8. Reset input nhập sản phẩm =====
function resetInputSanPham() {
    document.getElementById('masp').value = '';
    document.getElementById('size').value = '';
    document.getElementById('gia').value = '';
    document.getElementById('soluong').value = 1;
    document.getElementById('size').style.display = 'none';
    document.getElementById('masp').focus();
}

// ===== 9. Render bảng sản phẩm: mã, size, giá, sl, tiền =====
function renderBangSanPham() {
    const tbody = document.querySelector('#bangketqua tbody');
    tbody.innerHTML = '';
    dsSanPham.forEach((sp, idx) => {
        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${sp.masp}</td>
            <td>${sp.size || ''}</td>
            <td>${sp.gia}</td>
            <td>${sp.soluong}</td>
            <td>${sp.thanhtien}</td>
            <td><button class="btn-delete-row" onclick="xoaDongSanPham(${idx})">🗑️</button></td>
        `;
        tbody.appendChild(tr);
    });
    capNhatTongKet();
}

// ===== 10. Tính tổng & cập nhật giao diện =====
function capNhatTongKet() {
    let tongtien = dsSanPham.reduce((sum, x) => sum + Number(x.thanhtien), 0);
    let tongsl = dsSanPham.reduce((sum, x) => sum + Number(x.soluong), 0);
    document.getElementById('tongtien').textContent = tongtien.toLocaleString();
    document.getElementById('phaithanhtoan').textContent = tongtien.toLocaleString();
    document.getElementById('tongkm').textContent = '0';
    document.getElementById('chietkhau').textContent = '0';
    // Bạn có thể cập nhật thêm trường tổng số lượng ở đây nếu muốn
}

// ===== 11. Xóa sản phẩm khỏi bảng kết quả =====
window.xoaDongSanPham = function(idx) {
    dsSanPham.splice(idx, 1);
    renderBangSanPham();
};

// ===== 12. Sự kiện "Thêm mới" (reset form) =====
document.getElementById('btn-them-moi').onclick = function() {
    dsSanPham = [];
    renderBangSanPham();
    document.getElementById('makh').value = '';
    document.getElementById('manv').value = '';
    genSoHoaDon();
    document.getElementById('masp').focus();
};

// ===== 13. Sự kiện lưu hóa đơn =====
document.getElementById('btn-luu').onclick = async function() {
    if (dsSanPham.length === 0) {
        alert('Chưa có sản phẩm nào!');
        return;
    }
    let sohd = document.getElementById('sohd').value.trim();
    let makh = document.getElementById('makh').value.trim();
    let manv = document.getElementById('manv').value.trim();
    let tennv = ''; // Nếu bạn tra tên nhân viên từ mã thì bổ sung ở đây
    let diadiem = currentCoso;
    let tongtien = dsSanPham.reduce((sum, x) => sum + Number(x.thanhtien), 0);
    let tongsl = dsSanPham.reduce((sum, x) => sum + Number(x.soluong), 0);
    let hinhthuctt = document.getElementById('hinhthuctt').value;
    let ngay = new Date().toISOString().slice(0,10);
    let now = new Date().toISOString();
    let tongkm = 0; // Nếu có tính khuyến mại thì bổ sung logic
    let chietkhau = 0; // Nếu có logic thì bổ sung

    // 1. Lưu hoadon_banle
    let { data: hd, error: errHD } = await _supabase
        .from('hoadon_banle')
        .insert([{
            sohd, ngay, created_at: now, manv, tennv, diadiem, khachhang: makh,
            tongsl, tongkm, chietkhau, thanhtoan: tongtien, hinhthuctt,
            loaihd: currentLoai // hoặc loại khác tùy setup
        }])
        .select()
        .single();
    if (errHD || !hd) {
        alert('Lỗi lưu hóa đơn: ' + (errHD?.message || ''));
        return;
    }

    // 2. Lưu ct_hoadon_banle
    let chitiet = dsSanPham.map(sp => ({
        sohd,
        masp: sp.masp,
        tensp: '', // Nếu muốn lấy tên thì tra lại bảng dmhanghoa, hoặc bổ sung trong dsSanPham ở bước thêm
        size: sp.size || '',
        soluong: sp.soluong,
        gia: sp.gia,
        km: 0, // Nếu có khuyến mại thì cập nhật
        thanhtien: sp.thanhtien,
        dvt: '', // Nếu có đơn vị tính lấy theo mã SP
        diadiem,
        created_at: now,
        ngay
    }));
    let { error: errCT } = await _supabase
        .from('ct_hoadon_banle')
        .insert(chitiet);
    if (errCT) {
        alert('Lỗi lưu chi tiết: ' + errCT.message);
        return;
    }

    // 3. Cập nhật lại bảng số chứng từ (tăng số hóa đơn lên)
    await _supabase
        .from('sochungtu')
        .update({ so_hientai: parseInt(sohd.split('_')[1]) })
        .eq('loai', currentLoai)
        .eq('coso', currentCoso);

    alert('Đã lưu hóa đơn thành công!');
    dsSanPham = [];
    renderBangSanPham();
    document.getElementById('makh').value = '';
    document.getElementById('manv').value = '';
    genSoHoaDon();
    document.getElementById('masp').focus();
};

// ===== 14. Khi load trang, sinh số hóa đơn mới =====
window.addEventListener('DOMContentLoaded', function() {
    genSoHoaDon();    
    document.getElementById('masp').focus();
});

// ===== 15. Bổ sung: Khi chọn mã sản phẩm từ popup tìm kiếm, hoặc quét QR xong, hãy gọi xuLyNhapMaSP() =====

// Nếu bạn có popup chọn sp, khi chọn xong, gán mã vào ô #masp rồi gọi xuLyNhapMaSP()

// ====== KẾT THÚC ======
