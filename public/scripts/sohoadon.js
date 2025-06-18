import { supabase } from './supabaseClient.js';

// Hàm phát sinh số chứng từ động
export async function capNhatSoHoaDonTuDong() {
  try {
    const diadiem = document.getElementById("diadiem")?.value || "cs1";
    const pathname = window.location.pathname;
    let loai = "";

    if (pathname.includes("banle")) {
      loai = diadiem === "cs1" ? "bancs1" : "bancs2";
    } else if (pathname.includes("nhapmoi")) {
      loai = diadiem === "cs1" ? "nmcs1" : "nmcs2";
    } else if (pathname.includes("nhapdoikh")) {
      loai = diadiem === "cs1" ? "ndoics1" : "ndoics2";
    } else if (pathname.includes("tralaincc")) {
      loai = diadiem === "cs1" ? "tralaincccs1" : "tralaincccs2";
    } else if (pathname.includes("xuathuy")) {
      loai = diadiem === "cs1" ? "xuathuycs1" : "xuathuycs2";
    } else if (pathname.includes("ccn1v2")) {
      loai = "ccn1v2";
    } else if (pathname.includes("ccn2v1")) {
      loai = "ccn2v1";
    } else if (pathname.includes("kiemkho")) {
      const isTang = document.title.includes("Tăng");
      loai = isTang ? (diadiem === "cs1" ? "tangkhocs1" : "tangkhocs2")
                   : (diadiem === "cs1" ? "giamkhocs1" : "giamkhocs2");
    } else {
      alert("Không nhận diện được loại chứng từ từ giao diện.");
      return;
    }

    const { data, error } = await supabase
      .from("sochungtu")
      .select("so_hientai")
      .eq("loai", loai)
      .single();

    let soMoi = 1;
    if (!error && data) {
      soMoi = data.so_hientai + 1;
      await supabase
        .from("sochungtu")
        .update({ so_hientai: soMoi })
        .eq("loai", loai);
    } else {
      await supabase
        .from("sochungtu")
        .insert([{ loai, so_hientai: soMoi }]);
    }

    const sohd = `${loai}_${String(soMoi).padStart(5, "0")}`;
    document.getElementById("sohd").value = sohd;
  } catch (err) {
    console.error("Lỗi phát sinh số hóa đơn:", err);
    alert("Không thể phát sinh số hóa đơn.");
  }
}
window.capNhatSoHoaDonTuDong = capNhatSoHoaDonTuDong;

// Hàm phát sinh số hóa đơn tạm
export async function phatSinhSoHDTMoi() {
  try {
    const today = new Date();
    const yy = today.getFullYear().toString().slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const loai = `blt${yy}${mm}`;

    const { data, error } = await supabase
      .from("sochungtu")
      .select("so_hientai")
      .eq("loai", loai)
      .single();

    let soMoi = 1;
    if (!error && data) {
      soMoi = data.so_hientai + 1;
      await supabase
        .from("sochungtu")
        .update({ so_hientai: soMoi })
        .eq("loai", loai);
    } else {
      await supabase
        .from("sochungtu")
        .insert([{ loai, so_hientai: soMoi }]);
    }

    const sohd = `${loai}_${String(soMoi).padStart(3, "0")}`;
    return sohd;
  } catch (err) {
    console.error("Lỗi phát sinh số hóa đơn tạm:", err);
    alert("Không thể phát sinh số hóa đơn tạm.");
    return null;
  }
}
window.phatSinhSoHDTMoi = phatSinhSoHDTMoi;
