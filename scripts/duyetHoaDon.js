// duyetHoaDon.js
import { supabase } from './supabaseClient.js';
import { capNhatBangHTML } from './bangketqua.js';
import { capNhatThongTinTong } from './utils.js';
import { bangKetQua, resetBangKetQua } from './hoadon.js';

function formatTimeHHMM(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}


// Thêm biến cờ ở gần đầu file (trước export function cũng được)
let __duyetHoaDonBound = false;

export function ganSuKienDuyetHoaDon() {
  if (__duyetHoaDonBound) return;   // ✅ tránh bind lặp
  __duyetHoaDonBound = true;

  document.getElementById("quaylai")?.addEventListener("click", taiHoaDonTruoc);
  document.getElementById("tieptuc")?.addEventListener("click", taiHoaDonTiep);

  const sohdEl = document.getElementById("sohd");
  sohdEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") taiHoaDonTuSo();
  });
}


async function taiHoaDonTuSo() {
  const sohd = document.getElementById("sohd").value.trim();
  if (!sohd) return;

  const { data, error } = await supabase
    .from("hoadon_banle")
    .select("*")
    .eq("sohd", sohd)
    .maybeSingle();

  if (!error && data) napHoaDonVaoTrang(data);
  else alert("❌ Không tìm thấy hóa đơn: " + sohd);
}

// Lấy tiền tố của số hóa đơn, ví dụ "bancs1_00003" -> "bancs1" 
function getSohdPrefix(sohd) {
  if (!sohd) return null;
  const idx = sohd.indexOf('_');
  if (idx === -1) return null;
  return sohd.substring(0, idx);
}

function getSohdNumber(sohd) {
  const raw = String(sohd || "").trim();
  const idx = raw.indexOf("_");
  if (idx === -1) return null;

  const n = Number(raw.slice(idx + 1).replace(/\D/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function taiHoaDonTruoc() {
  const sohd = document.getElementById("sohd").value.trim();
  if (!sohd) return;

  const prefix = getSohdPrefix(sohd);
  const currentNum = getSohdNumber(sohd);

  if (!prefix || currentNum == null) {
    alert("❌ Số hóa đơn không hợp lệ.");
    return;
  }

  const { data, error } = await supabase
    .from("hoadon_banle")
    .select("*")
    .like("sohd", `${prefix}_%`);

  if (error || !data?.length) {
    alert("❌ Không còn hóa đơn trước đó trong loại này.");
    return;
  }

  const prev = data
    .map(hd => ({ ...hd, __num: getSohdNumber(hd.sohd) }))
    .filter(hd => hd.__num != null && hd.__num < currentNum)
    .sort((a, b) => b.__num - a.__num)[0];

  if (prev) {
    napHoaDonVaoTrang(prev);
  } else {
    alert("❌ Không còn hóa đơn trước đó trong loại này.");
  }
}


async function taiHoaDonTiep() {
  const sohd = document.getElementById("sohd").value.trim();
  if (!sohd) return;

  const prefix = getSohdPrefix(sohd);
  const currentNum = getSohdNumber(sohd);

  if (!prefix || currentNum == null) {
    alert("❌ Số hóa đơn không hợp lệ.");
    return;
  }

  const { data, error } = await supabase
    .from("hoadon_banle")
    .select("*")
    .like("sohd", `${prefix}_%`);

  if (error || !data?.length) {
    alert("❌ Không còn hóa đơn tiếp theo trong loại này.");
    return;
  }

  const next = data
    .map(hd => ({ ...hd, __num: getSohdNumber(hd.sohd) }))
    .filter(hd => hd.__num != null && hd.__num > currentNum)
    .sort((a, b) => a.__num - b.__num)[0];

  if (next) {
    napHoaDonVaoTrang(next);
  } else {
    alert("❌ Không còn hóa đơn tiếp theo trong loại này.");
  }
}


export async function napHoaDonVaoTrang(hoadon) {
  if (!hoadon) return;

  document.getElementById("sohd").value = hoadon.sohd || "";
  document.getElementById("ngay").value = hoadon.ngay || "";


  const gioEl = document.getElementById("gio");
  if (gioEl) {
    if (hoadon.created_at) {
      gioEl.value = formatTimeHHMM(hoadon.created_at);
    } else {
      gioEl.value = "";
    }
  }
  document.getElementById("manv").value = hoadon.manv || "";
  document.getElementById("tennv").value = hoadon.tennv || "";
  document.getElementById("diadiem").value = hoadon.diadiem || "";
  document.getElementById("khachhang").value = hoadon.khachhang || "";
  document.getElementById("hinhthuctt").value = hoadon.hinhthuctt || "";
  // ✅ NẠP GHI CHÚ HÓA ĐƠN
  const ghichuEl = document.getElementById("ghichu");
  if (ghichuEl) ghichuEl.value = hoadon.ghichu || "";

  const thanhToan = Number(hoadon.thanhtoan || 0);
  const tienDoiDiem = Number(hoadon.tien_doi_diem || 0);
  const diemTru = Number(hoadon.diem_tru || 0);

  document.getElementById("chietkhau").value = hoadon.chietkhau || "0";
  document.getElementById("tongkm").value = Number(hoadon.tongkm || 0).toLocaleString("vi-VN");

  document.getElementById("phaithanhtoan").value = thanhToan.toLocaleString("vi-VN");
  document.getElementById("khachtra").value = thanhToan.toLocaleString("vi-VN");
  document.getElementById("conlai").value = "0";

  document.getElementById("tongsl").value = hoadon.tongsl || "0";

  ["diem_tru", "diemdung"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = diemTru;
  });

  ["tien_doi_diem", "giamdiem"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = tienDoiDiem.toLocaleString("vi-VN");
  });

  resetBangKetQua();

  const { data: ct, error } = await supabase
    .from("ct_hoadon_banle")
    .select("*")
    .eq("sohd", hoadon.sohd);

  if (!error && ct.length > 0) {
    ct.forEach(row => {
      const masp = String(row.masp || "").trim().toUpperCase();
      const size = (row.size != null) ? String(row.size).trim() : "";
      const sl = parseInt(row.soluong || 0, 10) || 0;

      if (!masp || !size || sl === 0) return;

      if (!bangKetQua[masp]) {
        bangKetQua[masp] = {
          masp,
          tensp: row.tensp || "",
          sizes: [],
          soluongs: [],
          tong: 0,
          gia: row.gia || 0,
          km: row.km || 0,
          dvt: ""
        };
      }

      const item = bangKetQua[masp];
      const idx = item.sizes.findIndex(s => String(s).trim() === size);

      if (idx === -1) {
        item.sizes.push(size);
        item.soluongs.push(sl);
      } else {
        const old = parseInt(item.soluongs[idx] || 0, 10) || 0;
        item.soluongs[idx] = old + sl;   // ✅ gộp nếu trùng size
      }

      item.tong += sl;
    });

  }

  // ✅ Chuyển sang chế độ XEM khi nạp hóa đơn cũ
  const st = document.getElementById("hd_state");
  if (st) st.value = "xem";

  // ✅ đồng thời chặn “vô tình sửa” bằng cách reset HD_CTX về VIEW/NEW
  window.HD_CTX = { mode: "VIEW", version: hoadon?.updated_at || null };
  window.choPhepSua = false;
  window.dangSuaHoaDon = false;


  capNhatBangHTML(bangKetQua);

  // Không cho tính lại từ chi tiết khi đang xem hóa đơn cũ
  document.getElementById("phaithanhtoan").value = thanhToan.toLocaleString("vi-VN");
  document.getElementById("khachtra").value = thanhToan.toLocaleString("vi-VN");
  document.getElementById("conlai").value = "0";

  ["diem_tru", "diemdung"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = diemTru;
  });

  ["tien_doi_diem", "giamdiem"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = tienDoiDiem.toLocaleString("vi-VN");
  });
}
