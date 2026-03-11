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
        // 1. XÁC ĐỊNH PATHNAME CỦA TRANG
        const pathname = window.location?.pathname || "";

        // 2. ƯU TIÊN XÁC ĐỊNH CƠ SỞ THEO TÊN TRANG
        //    - Nếu pathname chứa "cs1"  → luôn coi là cs1
        //    - Nếu pathname chứa "cs2"  → luôn coi là cs2
        //    (áp dụng cho TẤT CẢ các trang có cs1 / cs2 trong tên file)
        let branchFromPath = null;
        if (pathname.includes("cs1")) {
            branchFromPath = "cs1";
        } else if (pathname.includes("cs2")) {
            branchFromPath = "cs2";
        }

        // 3. LẤY ĐỊA ĐIỂM:
        //    - Nếu branchFromPath có giá trị → dùng luôn (khóa cứng theo tên trang)
        //    - Nếu KHÔNG (trang không chứa cs1/cs2) → fallback về window.diadiem / localStorage
        let diadiem;
        if (branchFromPath) {
            diadiem = branchFromPath;
        } else {
            try {
                diadiem =
                    window.diadiem ||
                    localStorage.getItem("diadiem") ||
                    "cs1";
            } catch (e) {
                diadiem = window.diadiem || "cs1";
            }
        }

        // 4. Xác định LOẠI CHỨNG TỪ dựa trên pathname + diadiem
        let loai = "";

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
            // Trang chuyển CN 1 → 2: luôn xuất từ CS1
            loai = "xcncs1";
        } else if (pathname.includes("ncncs1")) {
            // Trang chuyển NCN 1, 
            loai = "ncncs1";

        } else if (pathname.includes("ccn2v1")) {
            // Trang chuyển CN 2 → 1: luôn xuất từ CS2
            loai = "xcncs2";
        } else if (pathname.includes("ncncs2")) {
            // Trang chuyển NCN 2,
            loai = "ncncs2";

        } else if (pathname.includes("nhaptam")) {
            loai = diadiem === "cs1" ? "nhaptamcs1" : "nhaptamcs2";

        } else if (pathname.includes("kiemtam")) {
            loai = diadiem === "cs1" ? "kiemtamcs1" : "kiemtamcs2";

        } else if (pathname.includes("kiemkho")) {
            const isTang = document.title.includes("Tăng");
            loai = isTang
                ? (diadiem === "cs1" ? "tangkhocs1" : "tangkhocs2")
                : (diadiem === "cs1" ? "giamkhocs1" : "giamkhocs2");

        } else {
            alert("Không nhận diện được loại chứng từ từ giao diện.");
            return;
        }

        // 5. Lấy số hiện tại từ bảng sochungtu
        const { data } = await supabase
            .from("sochungtu")
            .select("so_hientai")
            .eq("loai", loai)
            .maybeSingle();

        let soMoi = data?.so_hientai ? data.so_hientai + 1 : 1;

        // 6. Kiểm tra số này đã có ai dùng chưa (trong bảng hóa đơn)
        while (await kiemTraSoHoaDonDaTonTai(loai, soMoi)) {
            soMoi++; // nếu đã tồn tại thì tăng lên tiếp
        }

        // KHÔNG cập nhật lại số_hientai vào bảng sochungtu ở đây!

        // 7. Ghép số hóa đơn đúng chuẩn
        const sohd = `${loai}_${String(soMoi).padStart(5, "0")}`;

        // 8. Cập nhật lên giao diện (có kiểm tra tồn tại phần tử)
        const sohdEl = document.getElementById("sohd");
        if (sohdEl) sohdEl.value = sohd;

        const ddEl = document.getElementById("diadiem");
        if (ddEl) ddEl.value = diadiem;

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
            .maybeSingle();  // <-- KHÔNG 406 khi 0 dòng

        let soMoi = data?.so_hientai ? data.so_hientai + 1 : 1;

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
