// sohoadon.js - Gộp đầy đủ: hỗ trợ cả hóa đơn chính và hóa đơn tạm

// Hàm sinh số hóa đơn cho các loại chứng từ chính
window.capNhatSoHoaDonTuDong = async function () {
  try {
    if (!diadiem) {
      alert("Chưa xác định được địa điểm (cs1/cs2)");
      return;
    }

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
      loai = isTang
        ? (diadiem === "cs1" ? "tangkhocs1" : "tangkhocs2")
        : (diadiem === "cs1" ? "giamkhocs1" : "giamkhocs2");
    } else if (pathname.includes("tam")) {
      loai = diadiem === "cs1" ? "tamcs1" : "tamcs2";
    } else {
      alert("Không nhận diện được loại chứng từ từ giao diện.");
      return;
    }

    const { data, error } = await supabase
      .from("sochungtu")
      .select("sott")
      .eq("loai", loai)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    let sott = data?.sott || 0;
    sott++;
    const sohd = `${loai}_${String(sott).padStart(5, "0")}`;
    document.getElementById("sohd").value = sohd;

    await supabase
      .from("sochungtu")
      .upsert([{ loai, sott }], { onConflict: "loai" });

  } catch (err) {
    console.error("Lỗi khi cập nhật số chứng từ:", err);
    alert("Không thể tạo số chứng từ tự động.");
  }
};

// Hàm sinh số hóa đơn tạm (mã theo ngày)
window.phatSinhSoHDTMoi = async function () {
  try {
    const today = new Date();
    const yy = today.getFullYear().toString().slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const loai = `blt${yy}${mm}`;

    const { data, error } = await supabase
      .from("sochungtu")
      .select("sott")
      .eq("loai", loai)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    let sott = data?.sott || 0;
    sott++;
    const sohd = `${loai}_${String(sott).padStart(3, "0")}`;

    await supabase
      .from("sochungtu")
      .upsert([{ loai, sott }], { onConflict: "loai" });

    return sohd;
  } catch (err) {
    console.error("Lỗi khi tạo số hóa đơn tạm:", err);
    alert("Không thể tạo số hóa đơn tạm.");
    return null;
  }
};
