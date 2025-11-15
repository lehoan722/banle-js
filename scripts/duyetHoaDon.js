// duyetHoaDon.js
import { supabase } from './supabaseClient.js';
import { capNhatBangHTML } from './bangketqua.js';
import { capNhatThongTinTong } from './utils.js';
import { bangKetQua, resetBangKetQua } from './hoadon.js';

/**
 * Xác định loại chứng từ (loaihd) của TRANG HIỆN TẠI,
 * dựa trên pathname + diadiem, giống hệt logic trong sohoadon.js
 */
function getLoaiChungTuHienTai() {
  try {
    const diadiem = window.diadiem || localStorage.getItem("diadiem") || "cs1";
    const pathname = window.location.pathname || "";
    let loai = null;

    if (pathname.includes("banle")) {
      loai = diadiem === "cs1" ? "bancs1" : "bancs2";

    } else if (pathname.includes("bannv")) {
      loai = diadiem === "cs1" ? "bannvcs1" : "bannvcs2";

    } else if (pathname.includes("nhapmoi")) {
      loai = diadiem === "cs1" ? "nmcs1" : "nmcs2";

    } else if (pathname.includes("nhapdoi")) {
      loai = diadiem === "cs1" ? "nhapdoics1" : "nhapdoics2";

    } else if (pathname.includes("nhapnhanvien")) {
      loai = diadiem === "cs1" ? "nhapnhanviencs1" : "nhapnhanviencs2";

    } else if (pathname.includes("tralaincc")) {
      loai = diadiem === "cs1" ? "tralaincccs1" : "tralaincccs2";

    } else if (pathname.includes("xuathuy")) {
      loai = diadiem === "cs1" ? "xuathuycs1" : "xuathuycs2";

    } else if (pathname.includes("xuatkiem")) {
      loai = diadiem === "cs1" ? "xuatkiemcs1" : "xuatkiemcs2";

    } else if (pathname.includes("nhapkiem")) {
      loai = diadiem === "cs1" ? "nhapkiemcs1" : "nhapkiemcs2";

    } else if (pathname.includes("ccn1v2")) {
      loai = "xcncs1";

    } else if (pathname.includes("ccn2v1")) {
      loai = "xcncs2";

    } else if (pathname.includes("nhaptam")) {
      // QUAN TRỌNG: nhập tạm CS1/CS2
      loai = diadiem === "cs1" ? "nhaptamcs1" : "nhaptamcs2";

    } else if (pathname.includes("kiemkho")) {
      const isTang = document.title.includes("Tăng");
      loai = isTang
        ? (diadiem === "cs1" ? "tangkhocs1" : "tangkhocs2")
        : (diadiem === "cs1" ? "giamkhocs1" : "giamkhocs2");
    }

    return loai; // có thể null nếu không nhận diện được
  } catch (e) {
    console.warn("Không xác định được loai chứng từ hiện tại:", e);
    return null;
  }
}

/** Gán sự kiện cho nút Quay lại / Tiếp tục / Enter ở ô số HĐ */
export function ganSuKienDuyetHoaDon() {
  document.getElementById("quaylai")?.addEventListener("click", taiHoaDonTruoc);
  document.getElementById("tieptuc")?.addEventListener("click", taiHoaDonTiep);
  document.getElementById("sohd")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") taiHoaDonTuSo();
  });
}

/** Tải hóa đơn theo số nhập vào ô sohd (có khóa loaihd của trang) */
async function taiHoaDonTuSo() {
  const sohd = document.getElementById("sohd").value.trim();
  if (!sohd) return;

  const loai = getLoaiChungTuHienTai();

  let query = supabase
    .from("hoadon_banle")
    .select("*")
    .eq("sohd", sohd);

  // Nếu nhận diện được loaihd của trang thì KHÓA theo loaihd đó
  if (loai) {
    query = query.eq("loaihd", loai);
  }

  const { data, error } = await query.maybeSingle();

  if (!error && data) {
    napHoaDonVaoTrang(data);
  } else {
    alert("❌ Không tìm thấy hóa đơn phù hợp trên trang này.");
  }
}

/** Quay lại hóa đơn trước đó – luôn trong cùng loaihd của trang */
async function taiHoaDonTruoc() {
  const sohd = document.getElementById("sohd").value;
  if (!sohd) return;

  const loai = getLoaiChungTuHienTai();

  let query = supabase
    .from("hoadon_banle")
    .select("*");

  if (loai) {
    query = query.eq("loaihd", loai);
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

/** Tiếp tục hóa đơn tiếp theo – luôn trong cùng loaihd của trang */
async function taiHoaDonTiep() {
  const sohd = document.getElementById("sohd").value;
  if (!sohd) return;

  const loai = getLoaiChungTuHienTai();

  let query = supabase
    .from("hoadon_banle")
    .select("*");

  if (loai) {
    query = query.eq("loaihd", loai);
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

/** Đổ dữ liệu hóa đơn + chi tiết lên giao diện như cũ */
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

  if (!error && ct && ct.length > 0) {
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
