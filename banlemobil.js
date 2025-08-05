// banlemobil.js

// ====== 1. Khởi tạo Supabase Client ======
const supabaseUrl = 'https://rddjrmbyftlcvrgzlyby.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// ====== 2. Biến toàn cục ======
let dsSanPham = [];

// ====== 3. Tìm sản phẩm theo mã ======
async function timSanPhamTheoMa(masp) {
    masp = (masp || '').toUpperCase();
    let { data, error } = await _supabase
        .from('dmhanghoa')
        .select('masp, tensp, giale')
        .eq('masp', masp)
        .limit(1)
        .single();
    if (error || !data) return null;
    return data;
}

// 1. Khi load trang hoặc sau khi lưu hóa đơn xong:
genSoHoaDon();

async function genSoHoaDon() {
    let { data, error } = await _supabase
        .from('sochungtu')
        .select('so_hientai')
        .eq('loai', 'bancs1')
        .eq('coso', 'cs1')
        .order('so_hientai', { ascending: false })
        .limit(1)
        .single();
    let next = (data?.so_hientai || 0) + 1;
    let sohd = 'bancs1_' + String(next).padStart(5, '0');
    document.getElementById('sohd').value = sohd;
    return sohd;
}

// ====== 4. Xử lý nhập mã sản phẩm ======

// 2. Sửa sự kiện nhập mã sản phẩm
document.getElementById('masp').addEventListener('keydown', async function (e) {
    if (e.key === 'Enter') {
        let masp = this.value.trim().toUpperCase();
        if (!masp) return;
        let sp = await _supabase.from('dmhanghoa')
            .select('masp, tensp, giale, chungloai')
            .eq('masp', masp)
            .limit(1).single();
        if (!sp.data) {
            alert('Không tìm thấy mã sản phẩm!');
            return;
        }
        document.getElementById('gia').value = sp.data.giale || 0;
        let chungloai = (sp.data.chungloai || '').toUpperCase();
        if (chungloai === 'GD') {
            document.getElementById('size').style.display = '';
            document.getElementById('size').focus();
        } else {
            document.getElementById('size').style.display = 'none';
            themSanPhamVaoBang(masp, '', 1, sp.data.giale); // không có size
        }
    }
});

// 3. Sự kiện nhập size → tự động thêm vào bảng
document.getElementById('size').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        let masp = document.getElementById('masp').value.trim().toUpperCase();
        let size = document.getElementById('size').value.trim();
        let soluong = Number(document.getElementById('soluong').value);
        let gia = Number(document.getElementById('gia').value);
        if (!size) {
            alert('Bạn phải nhập size!');
            return;
        }
        themSanPhamVaoBang(masp, size, soluong, gia);
    }
});

// 4. Hàm thêm sản phẩm vào bảng
function themSanPhamVaoBang(masp, size, soluong, gia) {
    if (!masp || !gia || !soluong) return;
    dsSanPham.push({ masp, size, gia, soluong, thanhtien: gia * soluong });
    renderBangSanPham();
    // Reset input
    document.getElementById('masp').value = '';
    document.getElementById('size').value = '';
    document.getElementById('gia').value = '';
    document.getElementById('soluong').value = 1;
    document.getElementById('masp').focus();
}

// ====== 5. Thêm sản phẩm vào bảng kết quả ======
document.getElementById('btn-add').onclick = function () {
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
window.xoaDongSanPham = function (idx) {
    dsSanPham.splice(idx, 1);
    renderBangSanPham();
};

// ====== 7. Render bảng sản phẩm ======

// 5. Render bảng sản phẩm: mã, size, giá, sl, tiền
function renderBangSanPham() {
    const tbody = document.querySelector('#bangketqua tbody');
    tbody.innerHTML = '';
    dsSanPham.forEach((sp, idx) => {
        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${sp.masp}</td>
            <td>${sp.size}</td>
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
document.getElementById('btn-luu').onclick = async function () {  
 
    capNhatThongTinTong(getBangKetQua()); // Đảm bảo input tổng cập nhật lại trước khi lấy dữ liệu
    const maspChuaNhap = document.getElementById("masp")?.value.trim();
    if (maspChuaNhap) {
      alert("❌ Bạn còn mã sản phẩm chưa thêm vào bảng! Hãy kiểm tra lại trước khi lưu hóa đơn.");
      document.getElementById("masp").focus();
      return;
    }
    const bangKetQua = getBangKetQua();
    const sohd = document.getElementById("sohd").value.trim();
    if (!sohd) return alert("❌ Chưa có số hóa đơn.");
    const tennv = document.getElementById("tennv").value.trim();
    if (!tennv) return alert("❌ Bạn chưa nhập tên nhân viên bán hàng.");
  
    //const diadiem = localStorage.getItem("diadiem");
    const prefix = sohd.split("_")[0] || "";
    let diadiem = "cs1";
    if (prefix.includes("cs2")) diadiem = "cs2";
    else if (prefix.includes("cs1")) diadiem = "cs1";
  
    // ---- CHỈ GỌI CHO HÓA ĐƠN MỚI, KHÔNG PHẢI SỬA ----
    const { data: tonTai } = await supabase
      .from("hoadon_banle")
      .select("sohd")
      .eq("sohd", sohd)
      .maybeSingle();
  
    if (!tonTai && await handleSpecialSoHoaDon(sohd)) return;
  
    if (tonTai && !choPhepSua) {
      document.getElementById("popupXacThucSua").style.display = "block";
      return;
    }
  
    if (tonTai && choPhepSua) {
      await supabase.from("ct_hoadon_banle").delete().eq("sohd", sohd);
      await supabase.from("hoadon_banle").delete().eq("sohd", sohd);
    }
  
  
    const createdAt = new Date().toISOString();
  
    const getIntValue = (id) =>
      parseInt(document.getElementById(id).value.replace(/[.,]/g, "") || "0", 10);
  
    const hoadon = {
      sohd,
      ngay: document.getElementById("ngay").value,
      manv: document.getElementById("manv").value,
      tennv: document.getElementById("tennv").value,
      diadiem: diadiem,
      khachhang: document.getElementById("khachhang").value,
      tongsl: getIntValue("tongsl"),
      tongkm: getIntValue("tongkm"),
      chietkhau: getIntValue("chietkhau"),
      thanhtoan: getIntValue("phaithanhtoan"),
      hinhthuctt: document.getElementById("hinhthuctt").value,
      ghichu: document.getElementById("ghichu")?.value || "",
      created_at: createdAt,
      loai: "",
      dvt: "",
      loaihd: sohd.split("_")[0],   // <-- CHỈNH ĐOẠN NÀY!
      nhacc: ""
    };
  
  
  
    const chitiet = [];
    Object.values(bangKetQua).forEach(item => {
      item.sizes.forEach((sz, i) => {
        const sl = item.soluongs[i];
        chitiet.push({
          sohd,
          masp: item.masp,
          tensp: item.tensp,
          size: sz,
          soluong: sl,
          gia: item.gia,
          km: item.km,
          thanhtien: (item.gia - item.km) * sl,
          dvt: item.dvt || '',
          diadiem: diadiem,
          created_at: createdAt,
          ngay: document.getElementById("ngay").value
        });
  
      });
    });
  
    const { error: errHD } = await supabase.from("hoadon_banle").insert([hoadon]);
    const { error: errCT } = await supabase.from("ct_hoadon_banle").insert(chitiet);
  
    if (!errHD && !errCT) {
      // Cập nhật lại số_hientai vào bảng sochungtu theo đúng loại và số mới lưu
      const [loai, so] = sohd.split('_');
      const soMoi = parseInt(so, 10);
  
      // Đọc số hiện tại của loại này từ bảng sochungtu
      const { data: currSoChungTu } = await supabase
        .from("sochungtu")
        .select("so_hientai")
        .eq("loai", loai)
        .single();
  
      // Chỉ update nếu số mới lớn hơn số hiện tại
      if (!currSoChungTu || soMoi > currSoChungTu.so_hientai) {
        await supabase
          .from("sochungtu")
          .update({ so_hientai: soMoi })
          .eq("loai", loai);
      }
  
      //alert("✅ Đã lưu hóa đơn thành công!");
      inHoaDon(hoadon, chitiet);
      await lamMoiSauKhiLuu();
      choPhepSua = false;
    }
    else {
      alert("❌ Lỗi khi lưu hóa đơn");
      console.error(errHD || errCT);
    }
  }

// ====== 10. Thêm sự kiện cho nút "Thêm mới" (reset form) ======
document.getElementById('btn-them-moi').onclick = function () {
    dsSanPham = [];
    renderBangSanPham();
    document.getElementById('makh').value = '';
    document.getElementById('manv').value = '';
    document.getElementById('masp').focus();
};

// ====== 11. Có thể bổ sung popup tìm kiếm khách hàng, nhân viên... sau ======

