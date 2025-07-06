import { supabase } from './supabaseClient.js';

// Hàm kiểm tra số hóa đơn đã được dùng chưa
async function kiemTraSoHoaDonDaTonTai(loai, so) {
    const { data } = await supabase
        .from("hoadon_banle")
        .select("sohd")
        .eq("sohd", `${loai}_${String(so).padStart(5, "0")}`)
        .maybeSingle(); // dùng maybeSingle để không lỗi nếu không có bản ghi
    return !!data;
}

// Hàm phát sinh số hóa đơn động (chuẩn mới)
// Hàm phát sinh số hóa đơn động (KHÔNG cập nhật vào sochungtu)
export async function capNhatSoHoaDonTuDong() {
    try {
        // 1. Lấy địa điểm từ localStorage
        const diadiem = localStorage.getItem("diadiem") || "cs1";

        // 2. Xác định loại chứng từ như cũ
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

        // 3. Lấy số hiện tại từ bảng sochungtu
        const { data } = await supabase
            .from("sochungtu")
            .select("so_hientai")
            .eq("loai", loai)
            .single();

        let soMoi = data?.so_hientai ? data.so_hientai + 1 : 1;

        // 4. Kiểm tra số này đã có ai dùng chưa (trong bảng hóa đơn)
        while (await kiemTraSoHoaDonDaTonTai(loai, soMoi)) {
            soMoi++; // nếu đã tồn tại thì tăng lên tiếp
        }

        // KHÔNG cập nhật lại số_hientai vào bảng sochungtu ở đây!

        // 5. Ghép số hóa đơn đúng chuẩn
        const sohd = `${loai}_${String(soMoi).padStart(5, "0")}`;

        // 6. Cập nhật lên giao diện
        document.getElementById("sohd").value = sohd;
        document.getElementById("diadiem").value = diadiem;

        return sohd;
    } catch (err) {
        console.error("Lỗi phát sinh số hóa đơn:", err);
        alert("Không thể phát sinh số hóa đơn.");
        return null;
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
