// ===== 1. Khởi tạo Supabase Client ===== 

import { tinhKhuyenMai } from './khuyenmai.js';

const supabaseUrl = 'https://rddjrmbyftlcvrgzlyby.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// ===== 2. Biến toàn cục =====
let dsSanPham = [];
let spHienTai = null; // Lưu tạm object sản phẩm vừa tìm được
let currentLoai = 'bancs1'; // Có thể cấu hình nếu chuyển cơ sở
let currentCoso = 'cs1';
let currentSoHD = '';
let nhanvien = {}; // Lưu thông tin nhân viên nếu cần

// ===== 3. Hàm sinh số hóa đơn tự động =====
// ===== REPLACE: genSoHoaDon dùng RPC atomic =====
async function genSoHoaDon() {
    const loai = 'bancs1';   // hoặc suy ra theo cơ sở
    const coso = 'cs1';      // hiện tại mobile đang cố định cs1
    // Lấy số mới từ RPC (atomic)
    const so_moi = await getNextSoHDTuRPC(loai, coso);   // 👈 dùng RPC
    const sohd = `${loai}_${String(so_moi).padStart(5, '0')}`;
    document.getElementById('sohd').value = sohd;
    return sohd;
}


// ===== NEW (khuyến nghị): RPC tăng số HĐ atomic =====
async function getNextSoHDTuRPC(loai, coso) {
    const { data, error } = await _supabase.rpc('next_sohd', { p_loai: loai, p_coso: coso });
    if (error) throw new Error('RPC next_sohd lỗi: ' + error.message);
    return data; // data = số mới (INT)
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
const SIZE_HOP_LE = ["0", "38", "39", "40", "41", "42", "43", "44", "45"];

// Xử lý nhập mã sản phẩm (enter hoặc sau khi quét QR)
document.getElementById('masp').addEventListener('keydown', async function (e) {
    if (e.key === 'Enter') {
        let masp = document.getElementById('masp').value.trim().toUpperCase();
        if (!masp) return;
        let sp = await timSanPhamTheoMa(masp);
        if (!sp) {
            spHienTai = sp; // Lưu lại
            alert('Không tìm thấy mã sản phẩm!');
            resetInputSanPham();
            return;
        }
        document.getElementById('gia').value = sp.giale || 0;
        document.getElementById('soluong').value = 1;

        let chungloai = (sp.chungloai || '').toUpperCase();
        spHienTai = sp; // <- Gán lại để ô size dùng!
        if (chungloai === 'GD') {
            // Quản lý size → focus vào size, bắt nhập size mới thêm vào bảng
            document.getElementById('size').focus();
            // Lưu loại này vào input để sự kiện ở ô size biết đang là mã quản lý size
            document.getElementById('size').dataset.isGD = '1';
        } else {
            // Không quản lý size → thêm luôn vào bảng, size mặc định 0
            document.getElementById('size').value = '0';
            document.getElementById('size').dataset.isGD = '';
            let gia = Number(document.getElementById('gia').value);
            let soluong = Number(document.getElementById('soluong').value) || 1;
            themSanPhamVaoBang(sp, '0', gia, soluong); // truyền sp là object sản phẩm đã lấy ở trên!
            spHienTai = null;
        }
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
        themSanPhamVaoBang(sp, '', sp.giale, 1); // không cần nhập size
    }
}

// ===== 6. Sự kiện nhập size xong enter thì đẩy vào bảng =====
// Sự kiện nhập size (enter hoặc chọn size)
document.getElementById('size').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        // Chỉ xử lý thêm vào bảng nếu đang là mã quản lý size (chungloai = GD)
        if (this.dataset.isGD === '1') {
            let masp = document.getElementById('masp').value.trim().toUpperCase();
            let gia = Number(document.getElementById('gia').value);
            let soluong = Number(document.getElementById('soluong').value) || 1;
            let size = document.getElementById('size').value.trim();

            // Validate size hợp lệ
            const SIZE_HOP_LE = ["0", "38", "39", "40", "41", "42", "43", "44", "45"];
            if (!SIZE_HOP_LE.includes(size)) {
                alert('Size không hợp lệ! Chỉ cho phép nhập: 0, 38, 39, 40, 41, 42, 43, 44, 45');
                document.getElementById('size').focus();
                document.getElementById('size').select();
                return;
            }
            themSanPhamVaoBang(spHienTai, size, gia, soluong);
            spHienTai = null;
        }
    }
});


// ===== 7. Hàm thêm sản phẩm vào bảng kết quả =====
function themSanPhamVaoBang(sp, size, gia, soluong) {
    if (!sp || !sp.masp || !gia || !soluong) return;
    if (!size) size = "0";
    if (!masp || !gia || !soluong) return;

    // Lấy thông tin khuyến mại từ danh mục/khuyenmai.js
    // Tùy logic của bạn, có thể cần lấy thêm từ bảng dmhanghoa hoặc truyền sp
    let khuyenmai = 0;
    if (typeof tinhKhuyenMai === 'function') {
        // Có thể cần truyền thêm thông tin sản phẩm, ở đây chỉ có masp/gia
        khuyenmai = tinhKhuyenMai(sp, gia) || 0;
    }

    // Check lại size hợp lệ...
    const SIZE_HOP_LE = ["0", "38", "39", "40", "41", "42", "43", "44", "45"];
    if (!SIZE_HOP_LE.includes(size)) {
        alert('Size không hợp lệ! Chỉ cho phép nhập: 0, 38, 39, 40, 41, 42, 43, 44, 45');
        document.getElementById('size').focus();
        return;
    }

    // Kiểm tra trùng mã+size
    let idx = dsSanPham.findIndex(x => x.masp === sp.masp && (x.size || '') === (size || ''));
    if (idx >= 0) {
        dsSanPham[idx].soluong += soluong;
        dsSanPham[idx].thanhtien = (dsSanPham[idx].gia - dsSanPham[idx].khuyenmai) * dsSanPham[idx].soluong;
    } else {
        dsSanPham.push({
            masp: sp.masp,
            size,
            gia,
            soluong,
            khuyenmai,
            thanhtien: (gia - khuyenmai) * soluong
        });
    }
    renderBangSanPham();
    resetInputSanPham();
}


// ===== 8. Reset input nhập sản phẩm =====
function resetInputSanPham() {
    document.getElementById('masp').value = '';
    document.getElementById('size').value = '';
    document.getElementById('size').dataset.isGD = '';
    document.getElementById('gia').value = '';
    document.getElementById('soluong').value = 1;
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
            <td>${Number(sp.gia).toLocaleString('vi-VN')}</td>
            <td>${sp.soluong}</td>
            <td>${Number(sp.thanhtien).toLocaleString('vi-VN')}</td>
            <td><button class="btn-delete-row" onclick="xoaDongSanPham(${idx})">🗑️</button></td>
        `;
        tbody.appendChild(tr);
    });
    capNhatTongKet();
}


// ===== 10. Tính tổng & cập nhật giao diện =====
function capNhatTongKet() {
    let tongkm = dsSanPham.reduce((sum, x) => sum + (Number(x.khuyenmai || 0) * Number(x.soluong)), 0);
    let tongtien = dsSanPham.reduce((sum, x) => sum + Number(x.thanhtien), 0);

    // Đọc chiết khấu, chuẩn hóa số
    let chietkhau_raw = document.getElementById('chietkhau_input') ? document.getElementById('chietkhau_input').value : "0";
    let chietkhau = Number(chietkhau_raw.toString().replace(/\D/g, '') || 0);

    // Format lại input chiết khấu sau mỗi lần render
    if (document.getElementById('chietkhau_input')) {
        document.getElementById('chietkhau_input').value = chietkhau.toLocaleString('vi-VN');
    }

    let phaitra = tongtien - chietkhau;

    document.getElementById('tongkm').textContent = tongkm.toLocaleString('vi-VN');
    document.getElementById('phaithanhtoan').textContent = phaitra.toLocaleString('vi-VN');
    // Bạn có thể lưu tổng tiền, tổng km, chietkhau cho mục ghi hóa đơn ở đây nếu cần
}


// ===== 11. Xóa sản phẩm khỏi bảng kết quả =====
window.xoaDongSanPham = function (idx) {
    dsSanPham.splice(idx, 1);
    renderBangSanPham();
};

// ===== 12. Sự kiện "Thêm mới" (reset form) =====
document.getElementById('btn-them-moi').onclick = function () {
    dsSanPham = [];
    renderBangSanPham();
    document.getElementById('makh').value = '';
    document.getElementById('manv').value = '';
    genSoHoaDon();
    document.getElementById('masp').focus();
    document.getElementById('chietkhau_input').value = 0;
    document.getElementById('tongkm').textContent = '0';
    document.getElementById('phaithanhtoan').textContent = '0';
    document.getElementById('tongtien').textContent = '0';

};

// ===== 13. Sự kiện lưu hóa đơn =====
document.getElementById('btn-luu').onclick = async function () {
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
    let ngay = new Date().toISOString().slice(0, 10);
    let now = new Date().toISOString();
    let tongkm = dsSanPham.reduce((sum, x) => sum + (Number(x.khuyenmai || 0) * Number(x.soluong)), 0);
    let chietkhau = Number(document.getElementById('chietkhau_input').value.replace(/\D/g, '') || 0);
    let phaitra = tongtien - tongkm - chietkhau;
    if (phaitra < 0) phaitra = 0;



    // 1. Lưu hoadon_banle
    let { data: hd, error: errHD } = await _supabase
        .from('hoadon_banle')
        .insert([{
            sohd, ngay, created_at: now, manv, tennv, diadiem, khachhang: makh,
            tongsl, tongkm, chietkhau, thanhtoan: phaitra, hinhthuctt,
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
        km: sp.khuyenmai || 0,
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

    
    alert('Đã lưu hóa đơn thành công!');
    dsSanPham = [];
    renderBangSanPham();
    document.getElementById('makh').value = '';
    document.getElementById('manv').value = '';
    genSoHoaDon();
    document.getElementById('masp').focus();
    document.getElementById('chietkhau_input').value = 0;
};

// ===== 14. Khi load trang, sinh số hóa đơn mới =====
window.addEventListener('DOMContentLoaded', function () {
    genSoHoaDon();
    document.getElementById('masp').focus();
});

window.addEventListener('DOMContentLoaded', function () {
    genSoHoaDon();
    document.getElementById('masp').focus();

    // ==== Thêm đoạn này để tự tính lại tổng khi nhập chiết khấu ====
    if (document.getElementById('chietkhau_input')) {
        document.getElementById('chietkhau_input').addEventListener('input', function () {
            capNhatTongKet();
        });
    }
});


// ===== 15. Bổ sung: Khi chọn mã sản phẩm từ popup tìm kiếm, hoặc quét QR xong, hãy gọi xuLyNhapMaSP() =====

// Nếu bạn có popup chọn sp, khi chọn xong, gán mã vào ô #masp rồi gọi xuLyNhapMaSP()

// ====== KẾT THÚC ======
s
