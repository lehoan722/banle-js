// duyetHoaDon.js
import { supabase } from './supabaseClient.js';
import { capNhatBangHTML } from './bangketqua.js';
import { capNhatThongTinTong } from './utils.js';
import { bangKetQua, resetBangKetQua } from './hoadon.js';

// ====== THÊM MỚI: helper đọc cấu hình loaihd theo từng trang ======
function getAllowedLoaihd() {
  const cfg = window.DUYET_HOADON_LOAIHD;
  if (Array.isArray(cfg) && cfg.length > 0) return cfg;
  return null; // không cấu hình -> không lọc
}

function applyLoaihdFilter(query) {
  const allowed = getAllowedLoaihd();
  if (!allowed || allowed.length === 0) return query;

  if (allowed.length === 1) {
    return query.eq('loaihd', allowed[0]);
  }
  return query.in('loaihd', allowed);
}
// ================================================================

export function ganSuKienDuyetHoaDon() {
  document.getElementById("quaylai")?.addEventListener("click", taiHoaDonTruoc);
  document.getElementById("tieptuc")?.addEventListener("click", taiHoaDonTiep);
  document.getElementById("sohd")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") taiHoaDonTuSo();
  });
}

async function taiHoaDonTuSo() {
  const sohd = document.getElementById("sohd").value.trim();
  if (!sohd) return;

  let query = supabase
    .from("hoadon_banle")
    .select("*")
    .eq("sohd", sohd);

  query = applyLoaihdFilter(query);   // <== CHỈ LẤY ĐÚNG LOẠI HÓA ĐƠN CỦA TRANG

  const { data, error } = await query.maybeSingle();

  if (!error && data) napHoaDonVaoTrang(data);
  else alert("❌ Không tìm thấy hóa đơn: " + sohd);
}


async function taiHoaDonTruoc() {
  const sohd = document.getElementById("sohd").value;

  let query = supabase
    .from("hoadon_banle")
    .select("*");

  query = applyLoaihdFilter(query);              // <== LỌC THEO LOẠI
  query = query
    .lt("sohd", sohd)
    .order("sohd", { ascending: false })
    .limit(1);

  const { data, error } = await query;

  if (!error && data.length) napHoaDonVaoTrang(data[0]);
  else alert("❌ Không còn hóa đơn trước đó.");
}


async function taiHoaDonTiep() {
  const sohd = document.getElementById("sohd").value;

  let query = supabase
    .from("hoadon_banle")
    .select("*");

  query = applyLoaihdFilter(query);            // <== LỌC THEO LOẠI
  query = query
    .gt("sohd", sohd)
    .order("sohd", { ascending: true })
    .limit(1);

  const { data, error } = await query;

  if (!error && data.length) napHoaDonVaoTrang(data[0]);
  else alert("❌ Không còn hóa đơn tiếp theo.");
}


async function napHoaDonVaoTrang(hoadon) {
  if (!hoadon) return;

  document.getElementById("sohd").value = hoadon.sohd || "";
  document.getElementById("ngay").value = hoadon.ngay || "";
  document.getElementById("manv").value = hoadon.manv || "";
  document.getElementById("tennv").value = hoadon.tennv || "";
  document.getElementById("diadiem").value = hoadon.diadiem || "";
  document.getElementById("khachhang").value = hoadon.khachhang || "";
  document.getElementById("hinhthuctt").value = hoadon.hinhthuctt || "";
  document.getElementById("chietkhau").value = hoadon.chietkhau || "0";
  document.getElementById("tongkm").value = hoadon.tongkm || "0";
  document.getElementById("phaithanhtoan").value = hoadon.phaithanhtoan || "0";
  document.getElementById("khachtra").value = hoadon.khachtra || hoadon.phaithanhtoan || "0";
  document.getElementById("conlai").value = hoadon.conlai || "0";
  document.getElementById("tongsl").value = hoadon.tongsl || "0";

  resetBangKetQua();

  const { data: ct, error } = await supabase
    .from("ct_hoadon_banle")
    .select("*")
    .eq("sohd", hoadon.sohd);

  if (!error && ct.length > 0) {
    ct.forEach(row => {
      const masp = row.masp;
      const size = row.size;
      const sl = row.soluong;

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

      bangKetQua[masp].sizes.push(size);
      bangKetQua[masp].soluongs.push(sl);
      bangKetQua[masp].tong += sl;
    });
  }

  capNhatBangHTML(bangKetQua);
  capNhatThongTinTong(bangKetQua);
}
