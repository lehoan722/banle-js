// luuhoadon.js
import { supabase } from './supabaseClient.js';
import { resetBangKetQua, getBangKetQua } from './hoadon.js';
import { capNhatBangHTML } from './bangketqua.js';
import { capNhatThongTinTong } from './utils.js';
import { capNhatSoHoaDonTuDong, phatSinhSoHDTMoi } from './sohoadon.js';
import { guiHoaDonViettel } from './viettelInvoice.js';
import { napLaiChiTietHoaDon } from './hoadon.js';


let choPhepSua = false;

async function handleSpecialSoHoaDon(sohd) {
  const parts = sohd.split('_');
  if (parts.length < 2) return false;
  const num = parseInt(parts[1], 10);

  // Xác định cơ sở và điều kiện chia hết
  const diadiem = localStorage.getItem("diadiem");
  let modulus = 6; // Mặc định cho cs2
  if (diadiem === "cs1") modulus = 4;

  // Kiểm tra có phải hóa đơn đặc biệt không
  if (num % modulus !== 0) return false;

  // Giới hạn tiền theo cơ sở
  const ngay = document.getElementById("ngay").value;
  let hanMuc = 6000000;
  let loaiT = "bancs2T";
  if (diadiem === "cs1") {
    hanMuc = 1700000;
    loaiT = "bancs1T";
  }

  // Truy vấn tổng số tiền đã lưu qua hai bản trong ngày và cơ sở này
  const { data, error } = await supabase
    .from("hoadon_banleT")
    .select("thanhtoan")
    .eq("ngay", ngay)
    .eq("diadiem", diadiem);

  let tongTien = 0;
  if (data && data.length) {
    tongTien = data.reduce((sum, hd) => sum + (Number(hd.thanhtoan) || 0), 0);
  }

  // Lấy số tiền hóa đơn chuẩn bị lưu
  const getIntValue = (id) =>
    parseInt(document.getElementById(id).value.replace(/[.,]/g, "") || "0", 10);
  const tienHoaDon = getIntValue("phaithanhtoan");

  if (tongTien + tienHoaDon > hanMuc) {
    //alert(`🚫 Đã đạt hạn mức ${hanMuc.toLocaleString()}₫ cho cơ sở này trong ngày!\nChỉ cho phép lưu thường.`);
    return false;
  }

  // Nếu chưa vượt hạn mức thì gọi lưu hai bản
  await luuHoaDonCaHaiBan();
  return true;
}




export async function luuHoaDonQuaAPI() {
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

  const diadiem = localStorage.getItem("diadiem");

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


export async function luuHoaDonNhapQuaAPI() {
  capNhatThongTinTong(getBangKetQua()); // Đảm bảo input tổng cập nhật lại trước khi lấy dữ liệu
  // BỔ SUNG CHẶN LƯU Ở ĐÂY:
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
  if (!tennv) return alert("❌nhap Bạn chưa nhập tên nhân viên nhập hàng.");

  // Lấy cơ sở từ localStorage, không lấy từ input
  const diadiem = localStorage.getItem("diadiem");

  const { data: tonTai } = await supabase
    .from("hoadon_banle")
    .select("sohd")
    .eq("sohd", sohd)
    .maybeSingle();

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
    tongkm: 0, // Nhập mới không có khuyến mại
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

      // --- LUÔN ÉP LẠI GIÁ NHẬP, KHUYẾN MẠI = 0 ---
      let gia = 0;
      if (window.sanPhamData && window.sanPhamData[item.masp]) {
        gia = window.sanPhamData[item.masp].gianhap || 0;
      }
      const km = 0;

      chitiet.push({
        sohd,
        masp: item.masp,
        tensp: item.tensp,
        size: sz,
        soluong: sl,
        gia,
        km,
        thanhtien: (gia - km) * sl,
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

    alert("✅ Đã lưu hóa đơn nhập thành công!");
    inHoaDon(hoadon, chitiet);
    await lamMoiSauKhiLuu();
    choPhepSua = false;
  }
  else {
    alert("❌ Lỗi khi lưu hóa đơn nhập");
    console.error(errHD || errCT);
  }
}



export async function luuHoaDonCaHaiBan() {
  const sohd = document.getElementById("sohd").value.trim();
  if (!sohd) return alert("❌2b Chưa có số hóa đơn.");

  // ==== CHẶN LƯU 2 BẢN NẾU LÀ HÓA ĐƠN CŨ (<=) NGAY ĐẦU HÀM ====
  const [loai, soStr] = sohd.split('_');
  const so = parseInt(soStr, 10);
  const { data: currSoChungTu, error: errSoHienTai } = await supabase
    .from("sochungtu")
    .select("so_hientai")
    .eq("loai", loai)
    .single();
  if (errSoHienTai || !currSoChungTu) {
    alert("❌ Không lấy được số hiện tại từ bảng sochungtu.");
    return;
  }
  if (so <= currSoChungTu.so_hientai) {
    alert("🚫 Không được phép dùng chức năng này để sửa hóa đơn cũ!");
    return;
  }
  // ==== HẾT ĐOẠN CHẶN ====

  // Kiểm tra bảng kết quả có dữ liệu không
  const bangKetQua = getBangKetQua();
  if (!bangKetQua || Object.keys(bangKetQua).length === 0) {
    alert("⛔ Hóa đơn chưa có sản phẩm nào! Không thể lưu hai bản hóa đơn trắng.");
    return;
  }

  // Xác nhận với người dùng trước khi tiếp tục
  const xacNhan = confirm("Bạn có chắc chắn muốn lưu hóa đơn này ?\nNhấn OK để lưu, Huỷ để quay về giao diện hóa đơn.");
  if (!xacNhan) return;


  // ==== HẾT ĐOẠN CHẶN ====

  // TIẾP ĐÓ mới kiểm tra các dữ liệu nhập liệu khác

  // BỔ SUNG CHẶN LƯU Ở ĐÂY:
  const maspChuaNhap = document.getElementById("masp")?.value.trim();
  if (maspChuaNhap) {
    alert("❌ Bạn còn mã sản phẩm chưa thêm vào bảng! Hãy kiểm tra lại trước khi lưu hóa đơn.");
    document.getElementById("masp").focus();
    return;
  }
  const tennv = document.getElementById("tennv").value.trim();
  if (!tennv) return alert("❌ Bạn chưa nhập tên nhân viên bán hàng.");

  // Lấy địa điểm từ localStorage (không lấy từ input)
  const diadiem = localStorage.getItem("diadiem");
  const createdAt = new Date().toISOString();
  const loaiT = diadiem === "cs1" ? "bancs1T" : "bancs2T";

  // Lấy số hiện tại từ bảng sochungtu
  const { data: row, error } = await supabase
    .from("sochungtu")
    .select("so_hientai")
    .eq("loai", loaiT)
    .single();

  if (error || !row) {
    alert("❌ Không lấy được số chứng từ từ bảng sochungtu.");
    return;
  }

  const soMoi = row.so_hientai + 1;
  const sohdT = `${loaiT}_${String(soMoi).padStart(3, "0")}`;

  // Cập nhật lại số chứng từ mới
  await supabase
    .from("sochungtu")
    .update({ so_hientai: soMoi })
    .eq("loai", loaiT);

  const getIntValue = (id) =>
    parseInt(document.getElementById(id).value.replace(/[.,]/g, "") || "0", 10);

  const hoadon = {
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

  //const hoadonChinh = { ...hoadon, sohd };
  //const hoadonPhu = { ...hoadon, sohd: sohdT };

  const hoadonChinh = { ...hoadon, sohd, loaihd: diadiem === 'cs1' ? 'bancs1' : 'bancs2' };
  const hoadonPhu = { ...hoadon, sohd: sohdT, loaihd: diadiem === 'cs1' ? 'bancs1T' : 'bancs2T' };

  const chitietChinh = chitiet.map(ct => ({ ...ct, sohd }));
  const chitietPhu = chitiet.map(ct => ({ ...ct, sohd: sohdT }));

  const { error: errHD } = await supabase.from("hoadon_banle").insert([hoadonChinh]);
  const { error: errCT } = await supabase.from("ct_hoadon_banle").insert(chitietChinh);
  const { error: errHDT } = await supabase.from("hoadon_banleT").insert([hoadonPhu]);
  const { error: errCTT } = await supabase.from("ct_hoadon_banleT").insert(chitietPhu);

  if (!errHD && !errCT && !errHDT && !errCTT) {
    alert("✅ Đã lưu hóa đơn thành công!");
    //alert(`✅ Đã lưu hóa đơn vào cả hai bảng!\nSố CT chính: ${sohd}\nSố CT phụ: ${sohdT}`);
    inHoaDon(hoadonChinh, chitietChinh);
    await lamMoiSauKhiLuu();

    // ✅ Gửi hóa đơn điện tử sau khi lưu bảng T thành công
    guiHoaDonViettel(sohdT);
  }
}

async function lamMoiSauKhiLuu() {
  const diadiemVal = document.getElementById("diadiem").value;
  const manvVal = document.getElementById("manv").value;
  const tennvVal = document.getElementById("tennv").value;

  document.querySelectorAll("input").forEach(input => {
    if (!["diadiem", "manv", "tennv"].includes(input.id)) input.value = "";
  });

  resetBangKetQua();
  capNhatThongTinTong(getBangKetQua());

  document.getElementById("diadiem").value = diadiemVal;
  document.getElementById("manv").value = manvVal;
  document.getElementById("tennv").value = tennvVal;
  document.getElementById("ngay").value = new Date().toISOString().slice(0, 10);
  await capNhatSoHoaDonTuDong();
  document.getElementById("masp").focus();
}

export async function xacNhanSuaHoaDon() {
  const manv = document.getElementById("xacmanv").value.trim();
  const mk = document.getElementById("xacmatkhau").value.trim();
  const sohd = document.getElementById("sohd").value.trim();

  // 1. Kiểm tra mã nhân viên và mật khẩu
  const { data: nv, error: errNV } = await supabase
    .from("dmnhanvien")
    .select("matkhau, sua_hoadon")
    .eq("manv", manv)
    .maybeSingle();

  if (errNV || !nv || nv.matkhau !== mk) {
    alert("❌ Sai mã nhân viên hoặc mật khẩu.");
    return;
  }
  if (nv.sua_hoadon !== true) {
    alert("🚫 Bạn không có quyền sửa hóa đơn.");
    return;
  }

  // 2. Kiểm tra địa điểm lập hóa đơn
  const { data: hd, error: errHD } = await supabase
    .from("hoadon_banle")
    .select("diadiem")
    .eq("sohd", sohd)
    .maybeSingle();

  if (errHD || !hd) {
    alert("❌ Không tìm thấy hóa đơn cần sửa.");
    return;
  }

  // 3. Địa điểm đăng nhập phải trùng với địa điểm hóa đơn lập
  const diadiemDangNhap = localStorage.getItem("diadiem");
  if (hd.diadiem !== diadiemDangNhap) {
    alert("🚫 Bạn chỉ được sửa hóa đơn tại cơ sở mình đang đăng nhập!");
    return;
  }

  // 4. Nếu qua tất cả kiểm tra trên, cho phép sửa
  choPhepSua = true;
  document.getElementById("popupXacThucSua").style.display = "none";
  alert("✅ Xác thực thành công. Tiếp tục lưu hóa đơn.");

  luuHoaDonQuaAPI();
}


function inHoaDon(hoadon, chitiet) {
  const data = { hoadon, chitiet };
  localStorage.setItem("data_hoadon_in", JSON.stringify(data));

  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = "/in-hoadon.html";
  document.body.appendChild(iframe);

  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow.print();
      } catch (e) {
        console.error("Không thể gọi print() từ iframe:", e);
      }
      document.body.removeChild(iframe);
    }, 500);
  };
}

export async function luuHoaDonccn1v2() {
  const pathname = window.location.pathname;
  let loaihd_thucte = "";
  if (pathname.includes("ccn1v2")) loaihd_thucte = "xcncs1";
  else if (pathname.includes("ccn2v1")) loaihd_thucte = "xcncs2";

  capNhatThongTinTong(getBangKetQua()); // Đảm bảo input tổng cập nhật lại trước khi lấy dữ liệu
  // BỔ SUNG CHẶN LƯU Ở ĐÂY:
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
  if (!tennv) return alert("❌1v2/2v1 Bạn chưa nhập tên nhân viên bán hàng.");

  // Lấy cơ sở từ localStorage, không lấy từ input
  const diadiem = localStorage.getItem("diadiem");
  if (!diadiem || (diadiem !== 'cs1' && diadiem !== 'cs2')) {
    alert("❌ Không xác định được địa điểm chi nhánh (cs1 hoặc cs2). Hãy kiểm tra lại!");
    return;
  }

  // ✅ Kiểm tra logic chi nhánh khớp với loại chứng từ
  const loaihd = sohd.split("_")[0];  // xcncs1 hoặc xcncs2

  if ((loaihd === "xcncs1" && diadiem !== "cs1") || (loaihd === "xcncs2" && diadiem !== "cs2")) {
    alert("🚫 Bạn đang tạo hóa đơn không đúng với chi nhánh đang đăng nhập.\nVui lòng kiểm tra lại!");
    return;
  }

  const { data: tonTai } = await supabase
    .from("hoadon_banle")
    .select("sohd")
    .eq("sohd", sohd)
    .maybeSingle();

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
    loaihd: loaihd_thucte,   // <-- CHỈNH ĐOẠN NÀY!
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
    // === LẤY ĐÚNG LOẠI GỐC DÙ sohd CÓ HẬU TỐ _IN ===
    let sohdBase = sohd.endsWith('_IN') ? sohd.slice(0, -3) : sohd; // Bỏ _IN nếu có
    const arr = sohdBase.split('_');
    const loai = arr.slice(0, -1).join('_'); // Lấy tất cả các phần trước dấu _ cuối cùng
    const so = arr[arr.length - 1];
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

    // === BẮT ĐẦU ĐOẠN PHÁT SINH CHỨNG TỪ ĐỐI ỨNG ===
    // === BẮT ĐẦU ĐOẠN PHÁT SINH CHỨNG TỪ ĐỐI ỨNG ===
    try {
      let sohdBaseDoiUng = sohd.endsWith('_IN') ? sohd.slice(0, -3) : sohd;
      const arrDoiUng = sohdBaseDoiUng.split('_');
      const so = arrDoiUng[arrDoiUng.length - 1];

      const diadiemGoc = hoadon.diadiem;
      const diadiemDoiUng = diadiemGoc === 'cs1' ? 'cs2' : 'cs1';
      const loaiDoiUng = diadiemDoiUng === 'cs1' ? 'ncncs1' : 'ncncs2';
      const sohdDoiUng = loaiDoiUng + '_' + so;  // Không còn _IN

      const { data: doiUngDaCo } = await supabase
        .from("hoadon_banle")
        .select("sohd")
        .eq("sohd", sohdDoiUng)
        .maybeSingle();

      if (!doiUngDaCo) {
        // Tạo hóa đơn đối ứng
        const hoadonDoiUng = {
          ...hoadon,
          sohd: sohdDoiUng,
          loaihd: loaiDoiUng,
          diadiem: diadiemDoiUng,
          created_at: new Date().toISOString(),
        };

        const chitietDoiUng = chitiet.map(ct => ({
          ...ct,
          sohd: sohdDoiUng,
          diadiem: diadiemDoiUng,
          created_at: new Date().toISOString(),
        }));

        await supabase.from("hoadon_banle").insert([hoadonDoiUng]);
        await supabase.from("ct_hoadon_banle").insert(chitietDoiUng);

        const soMoiDoiUng = parseInt(so, 10);
        const { data: currSoChungTuDoiUng } = await supabase
          .from("sochungtu")
          .select("so_hientai")
          .eq("loai", loaiDoiUng)
          .single();

        if (!currSoChungTuDoiUng || soMoiDoiUng > currSoChungTuDoiUng.so_hientai) {
          await supabase
            .from("sochungtu")
            .upsert([{ loai: loaiDoiUng, so_hientai: soMoiDoiUng }], { onConflict: 'loai' });
        }
      }
    } catch (e) {
      console.error("Lỗi khi phát sinh chứng từ đối ứng:", e);
    }
    // === KẾT THÚC CHỨNG TỪ ĐỐI ỨNG ===

    // === KẾT THÚC ĐOẠN PHÁT SINH CHỨNG TỪ ĐỐI ỨNG ===

    alert("✅ Đã lưu hóa đơn CCN !");
    inHoaDon(hoadon, chitiet);
    await lamMoiSauKhiLuu();
    choPhepSua = false;
  }

  else {
    alert("❌ Lỗi khi lưu hóa đơn");
    console.error(errHD || errCT);
  }
}

window.luuHoaDonccn1v2 = luuHoaDonccn1v2; // expose đúng hàm lưu chuyển chi nhánh
window.luuHoaDonNhapQuaAPI = luuHoaDonNhapQuaAPI; // nếu muốn giữ hàm nhập qua API cho các trang khác

