// sohoadon.js - cập nhật số hóa đơn tự động theo loại chứng từ và giao diện

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
      // Tùy theo logic tăng hay giảm kho (cần xử lý riêng nếu phân biệt giao diện)
      const isTang = document.title.includes("Tăng"); // VD: tiêu đề trang chứa từ "Tăng"
      loai = isTang
        ? (diadiem === "cs1" ? "tangkhocs1" : "tangkhocs2")
        : (diadiem === "cs1" ? "giamkhocs1" : "giamkhocs2");
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

    // Ghi ngược vào bảng sochungtu
    await supabase
      .from("sochungtu")
      .upsert([{ loai, sott }], { onConflict: "loai" });

  } catch (err) {
    console.error("Lỗi khi cập nhật số chứng từ:", err);
    alert("Không thể tạo số chứng từ tự động.");
  }
};
