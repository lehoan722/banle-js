// duyetHoaDon.js
import { supabase } from './supabaseClient.js';
import { getBangKetQua, resetBangKetQua } from './hoadon.js';
import { capNhatBangHTML } from './bangketqua.js';
import { capNhatThongTinTong } from './utils.js';

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

async function taiHoaDonTruoc() {
  const sohd = document.getElementById("sohd").value;
  const { data, error } = await supabase
    .from("hoadon_banle")
    .select("*")
    .lt("sohd", sohd)
    .order("sohd", { ascending: false })
    .limit(1);

  if (!error && data.length) napHoaDonVaoTrang(data[0]);
  else alert("❌ Không còn hóa đơn trước đó.");
}

async function taiHoaDonTiep() {
  const sohd = document.getElementById("sohd").value;
  const { data, error } = await supabase
    .from("hoadon_banle")
    .select("*")
    .gt("sohd", sohd)
    .order("sohd", { ascending: true })
    .limit(1);

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

  const bangKetQua = {};
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
