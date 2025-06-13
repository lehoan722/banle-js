// luuhoadon.js
import { supabase } from './supabaseClient.js';
import { resetBangKetQua, getBangKetQua } from './hoadon.js';
import { capNhatBangHTML } from './bangketqua.js';
import { capNhatThongTinTong } from './utils.js';
import { capNhatSoHoaDonTuDong, phatSinhSoHDTMoi } from './sohoadon.js';
import { guiHoaDonViettel } from './viettelInvoice.js';


let choPhepSua = false;

export async function luuHoaDonQuaAPI() {
  const bangKetQua = getBangKetQua();
  const sohd = document.getElementById("sohd").value.trim();
  if (!sohd) return alert("❌ Chưa có số hóa đơn.");

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

  const hoadon = {
    sohd,
    ngay: document.getElementById("ngay").value,
    manv: document.getElementById("manv").value,
    tennv: document.getElementById("tennv").value,
    diadiem: document.getElementById("diadiem").value,
    khachhang: document.getElementById("khachhang").value,
    tongsl: parseInt(document.getElementById("tongsl").value || "0"),
    tongkm: parseFloat(document.getElementById("tongkm").value || "0"),
    chietkhau: parseFloat(document.getElementById("chietkhau").value || "0"),
    hinhthuctt: document.getElementById("hinhthuctt").value,
    ghichu: document.getElementById("ghichu")?.value || ""
  };

  const diadiem = document.getElementById("diadiem").value;
  const createdAt = new Date().toISOString();

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
        diadiem,
        created_at: createdAt
      });
    });
  });


  const { error: errHD } = await supabase.from("hoadon_banle").insert([hoadon]);
  const { error: errCT } = await supabase.from("ct_hoadon_banle").insert(chitiet);

  if (!errHD && !errCT) {
    alert("✅ Đã lưu hóa đơn thành công!");
    inHoaDon(hoadon, chitiet);
    await lamMoiSauKhiLuu();
    choPhepSua = false;
  } else {
    alert("❌ Lỗi khi lưu hóa đơn");
    console.error(errHD || errCT);
  }
}

export async function luuHoaDonCaHaiBan() {
  const bangKetQua = getBangKetQua();
  const tennv = document.getElementById("tennv").value.trim();
  if (!tennv) return alert("❌ Bạn chưa nhập tên nhân viên bán hàng.");

  const sohd = document.getElementById("sohd").value.trim();
  if (!sohd) return alert("❌ Chưa có số hóa đơn.");
  const diadiem = document.getElementById("diadiem").value;
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


  const hoadon = {
    ngay: document.getElementById("ngay").value,
    manv: document.getElementById("manv").value,
    tennv,
    diadiem: document.getElementById("diadiem").value,
    khachhang: document.getElementById("khachhang").value,
    tongsl: parseInt(document.getElementById("tongsl").value || "0"),
    tongkm: parseFloat(document.getElementById("tongkm").value || "0"),
    chietkhau: parseFloat(document.getElementById("chietkhau").value || "0"),
    hinhthuctt: document.getElementById("hinhthuctt").value,
    ghichu: document.getElementById("ghichu")?.value || ""
  };

  const diadiem = document.getElementById("diadiem").value;
  const createdAt = new Date().toISOString();

  const chitiet = [];
  Object.values(bangKetQua).forEach(item => {
    item.sizes.forEach((sz, i) => {
      const sl = item.soluongs[i];
      chitiet.push({
        masp: item.masp,
        tensp: item.tensp,
        size: sz,
        soluong: sl,
        gia: item.gia,
        km: item.km,
        thanhtien: (item.gia - item.km) * sl,
        dvt: item.dvt || '',
        diadiem,
        created_at: createdAt
      });
    });
  });


  const hoadonChinh = { ...hoadon, sohd };
  const hoadonPhu = { ...hoadon, sohd: sohdT };
  const chitietChinh = chitiet.map(ct => ({ ...ct, sohd }));
  const chitietPhu = chitiet.map(ct => ({ ...ct, sohd: sohdT }));

  const { error: errHD } = await supabase.from("hoadon_banle").insert([hoadonChinh]);
  const { error: errCT } = await supabase.from("ct_hoadon_banle").insert(chitietChinh);
  const { error: errHDT } = await supabase.from("hoadon_banleT").insert([hoadonPhu]);
  const { error: errCTT } = await supabase.from("ct_hoadon_banleT").insert(chitietPhu);

  if (!errHD && !errCT && !errHDT && !errCTT) {
    alert(`✅ Đã lưu hóa đơn vào cả hai bảng!\nSố CT chính: ${sohd}\nSố CT phụ: ${sohdT}`);
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
  const loai = sohd.startsWith("bancs1") ? "hdbl" : "khac";

  const { data, error } = await supabase
    .from("dmnhanvien")
    .select("matkhau, sua_hoadon, loai_duoc_sua")
    .eq("manv", manv)
    .maybeSingle();

  if (error || !data || data.matkhau !== mk) {
    alert("❌ Sai mã nhân viên hoặc mật khẩu.");
    return;
  }

  const duocSua = data.sua_hoadon === true &&
    (data.loai_duoc_sua || []).includes(loai);

  if (!duocSua) {
    alert("🚫 Bạn không có quyền sửa loại chứng từ này.");
    return;
  }

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

