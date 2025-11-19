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


async function taiHoaDonTruoc() {
  const sohd = document.getElementById("sohd").value;
  if (!sohd) return;

  const prefix = getSohdPrefix(sohd); // ví dụ: "bancs1"

  let query = supabase
    .from("hoadon_banle")
    .select("*");

  // Khóa theo đúng tiền tố số chứng từ của trang hiện hành
  if (prefix) {
    query = query.like("sohd", `${prefix}_%`);
  }

  query = query
    .lt("sohd", sohd)
    .order("sohd", { ascending: false })
    .limit(1);

  const { data, error } = await query;

  if (!error && data && data.length) {
    napHoaDonVaoTrang(data[0]);
  } else {
    alert("❌ Không còn hóa đơn trước đó trong loại này.");
  }
}


async function taiHoaDonTiep() {
  const sohd = document.getElementById("sohd").value;
  if (!sohd) return;

  const prefix = getSohdPrefix(sohd); // ví dụ: "bancs1"

  let query = supabase
    .from("hoadon_banle")
    .select("*");

  // Khóa theo đúng tiền tố số chứng từ hiện hành
  if (prefix) {
    query = query.like("sohd", `${prefix}_%`);
  }

  query = query
    .gt("sohd", sohd)
    .order("sohd", { ascending: true })
    .limit(1);

  const { data, error } = await query;

  if (!error && data && data.length) {
    napHoaDonVaoTrang(data[0]);
  } else {
    alert("❌ Không còn hóa đơn tiếp theo trong loại này.");
  }
}


async function napHoaDonVaoTrang(hoadon) {
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
