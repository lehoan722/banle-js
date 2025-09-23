
// hoadon.js - phiên bản cải tiến: tự fetch mã nếu thiếu và tránh mở popup nếu đã có
import { capNhatBangHTML, resetFormBang, resetFormSauKhiNhapSize } from './bangketqua.js';

import { supabase } from './supabaseClient.js';
import { tinhKhuyenMai } from './khuyenmai.js';

export let bangKetQua = {};

// Trong hoadon.js
let maspDangChon = null;
export function setMaspspDangChon(obj) {
    maspDangChon = obj; // obj = {masp, size}
}
export function getMaspspDangChon() {
    return maspDangChon;
}

function toInt(v) {
    if (v == null) return 0;
    return parseInt(String(v).replace(/[.,\s]/g, ""), 10) || 0;
}

function parseMoneyInt(v) {
    if (v == null) return 0;
    // bỏ dấu phẩy, chấm, khoảng trắng
    const s = String(v).trim().replace(/\./g, "").replace(/,/g, "").replace(/\s/g, "");
    const n = parseInt(s, 10);
    return isNaN(n) ? 0 : n;
}


function recalcThanhtienFromForm() {
    const sl = toInt(document.getElementById("soluong")?.value || "1");
    const gia = toInt(document.getElementById("gia")?.value || "0");
    const km = toInt(document.getElementById("khuyenmai")?.value || "0");
    const tt = (gia - km) * sl;
    const ttEl = document.getElementById("thanhtien");
    if (ttEl) ttEl.value = tt.toLocaleString();
}


export async function chuyenFocus(e) {
    if (e.key !== "Enter") return;

    const nhapNhanh = document.getElementById("nhapnhanh").checked;
    const size45 = document.getElementById("size45").checked;

    if (e.target.id === "masp") {
        // Đóng gợi ý MASP ngay khi Enter ở #masp
        window.closePopupMasp && window.closePopupMasp();
        const maspVal = document.getElementById("masp").value.trim().toUpperCase();
        const quanLySizeTheoGia = document.getElementById("quanlysizetheogia")?.checked;
        const thanhCong = await xuLyMaSanPham(quanLySizeTheoGia, maspVal, size45, nhapNhanh);

        // Nếu không thành công → chỉ đưa con trỏ về lại ô MÃ SP (không mở popup)
        if (!thanhCong) {
            const maspInput = document.getElementById("masp");
            if (maspInput) {
                setTimeout(() => {
                    maspInput.focus();
                    maspInput.select();
                }, 600);
            }
        }

    } else if (e.target.id === "soluong") {
        // Đóng gợi ý nếu đang mở
        window.closePopupMasp && window.closePopupMasp();

        const sizeEl = document.getElementById("size");
        if (sizeEl) {
            sizeEl.focus();
            sizeEl.select();   // ✅ bôi đen để gõ tiếp
        }
        return;              // ✅ thoát nhánh cho rõ ràng
    } else if (e.target.id === "size") {
        // Đóng gợi ý MASP ngay khi Enter ở #masp
        window.closePopupMasp && window.closePopupMasp();

        const sizeInput = document.getElementById("size");
        const maspInput = document.getElementById("masp");
        const raw = String(sizeInput.value || "").trim();
        const val = raw.toUpperCase();

        // Danh mục size hợp lệ
        const dsSize = Array.isArray(window.danhMucSize)
            ? window.danhMucSize.map(s => String(s).trim().toUpperCase())
            : [];

        const isValidSize = val && dsSize.includes(val);
        const nhapSizeMode = document.getElementById("nhapsize")?.checked === true; // 🔴 CHẾ ĐỘ NHẬP SIZE LIÊN TIẾP

        if (nhapSizeMode) {
            // ====== MODE A: Đang bật nhập size liên tiếp ======
            if (isValidSize) {
                // Thêm dòng, GIỮ MÃ SP, focus + select về #size để nhập liên tiếp
                themVaoBang(val, { afterAdd: "keepMaspFocusSize" });
                return;
            }

            // Không phải size hợp lệ nhưng >= 3 ký tự -> coi là MÃ SP MỚI
            if (val.length >= 3) {
                maspInput.value = layMaspGoc(val);   // ghi thẳng sang #masp (mã gốc, bỏ hậu tố)
                sizeInput.value = "";                 // xóa size vừa gõ
                // Giả lập Enter ở ô masp để tái sử dụng luồng xử lý mã
                const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
                maspInput.dispatchEvent(ev);
                return;
            }

            // Không hợp lệ và < 3 ký tự -> báo lỗi + focus lại #size
            alert("Bạn phải nhập size hợp lệ hoặc gõ một mã sản phẩm (từ 3 ký tự).");
            sizeInput.focus();
            sizeInput.select();
            return;

        } else {
            // ====== MODE B: Không bật nhập size liên tiếp (an toàn) ======
            if (isValidSize) {
                // Thêm dòng, SAU ĐÓ focus + select về #masp để nhập mã mới
                themVaoBang(val); // dùng luồng mặc định -> resetFormBang() sẽ focus #masp
                return;
            }

            // Không hợp lệ (dài hay ngắn đều coi là sai) -> chỉ báo lỗi + ở lại #size
            alert("Size không hợp lệ! Chỉ cho phép nhập: 38 -> 45");
            sizeInput.focus();
            sizeInput.select();
            return;
        }
    } else if (e.target.id === "khuyenmai") {
        // Chuẩn hoá khuyến mại: <=100 coi là %, >100 là tiền; cập nhật lại #thanhtien 
        const gia = parseInt((document.getElementById("gia")?.value || "0").replace(/[.,\s]/g, ""), 10) || 0;
        let km = parseFloat(String(document.getElementById("khuyenmai").value).replace(/\./g, "").replace(/,/g, "."));
        if (!isFinite(km)) km = 0;
        km = km <= 100 ? Math.round(gia * (km / 100)) : Math.round(km);
        document.getElementById("khuyenmai").value = km.toLocaleString();

        recalcThanhtienFromForm();

        // 🔑 Thay vì gọi themVaoBang → giả lập Enter trên #size
        const sizeInput = document.getElementById("size");
        if (sizeInput) {
            const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
            sizeInput.dispatchEvent(ev);
        }
        return;

    } else if (e.target.id === "gia") {
        const gia = parseInt((document.getElementById("gia")?.value || "0").replace(/[.,\s]/g, ""), 10) || 0;
        document.getElementById("gia").value = gia.toLocaleString();

        let kmIn = String(document.getElementById("khuyenmai").value).trim();
        let km = parseFloat(kmIn.replace(/\./g, "").replace(/,/g, "."));
        if (!isFinite(km)) km = 0;
        km = km <= 100 ? Math.round(gia * (km / 100)) : Math.round(km);
        document.getElementById("khuyenmai").value = km.toLocaleString();

        recalcThanhtienFromForm();

        // 🔑 Giả lập Enter trên #size
        const sizeInput = document.getElementById("size");
        if (sizeInput) {
            const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
            sizeInput.dispatchEvent(ev);
        }
        return;
    }

}

function layMaspGoc(str) {
    return String(str || "").toUpperCase().replace(/\(\d+\)\s*$/, "").trim();
}


async function xuLyMaSanPham(quanlysizetheogia, maspVal, size45, nhapNhanh) {

    maspVal = layMaspGoc(maspVal);

    let spData = window.sanPhamData?.[maspVal];

    // Nếu không có trong cache, gọi Supabase để tìm chính xác
    if (!spData) {
        const { data, error } = await supabase
            .from("dmhanghoa")
            .select("*")
            .eq("masp", maspVal)
            .single();

        if (data) {
            spData = data;
            window.sanPhamData[maspVal] = data; // cache lại
        }
    }

    // Không tìm thấy → chỉ cảnh báo và đưa con trỏ về lại ô MÃ SP
    if (!spData) {
        alert("❌ Mã sản phẩm không hợp lệ. Vui lòng nhập lại.");
        const maspInput = document.getElementById("masp");
        if (maspInput) {
            // main.js có patch alert phát âm + delay 500ms; đặt 600ms để focus xảy ra ngay sau khi đóng alert
            setTimeout(() => {
                maspInput.focus();
                maspInput.select();
            }, 600);
        }
        return false;
    }

    // [NEW] Chuẩn hoá form từ spData (đặt TRƯỚC mọi nhánh early-return)
    const giaEl = document.getElementById("gia");
    const kmEl = document.getElementById("khuyenmai");

    const giaInt = Math.round(parseMoneyInt(spData.giale || 0));
    giaEl.value = giaInt.toLocaleString();

    // KM mặc định theo rule hiện tại
    const kmDef = tinhKhuyenMai(spData, giaInt);
    kmEl.value = (kmDef || 0).toLocaleString();

    // số lượng mặc định = 1 nếu trống/<=0
    const slEl = document.getElementById("soluong");
    if (!slEl.value || parseInt(slEl.value, 10) <= 0) slEl.value = "1";
    recalcThanhtienFromForm();

    // vị trí kho theo cơ sở đang chọn
    const cs = document.getElementById("diadiem").value;
    const vitri = cs === "cs1" ? spData.vitrikho1 : spData.vitrikho2;
    document.getElementById("vitri").value = vitri || "";


    // 4) ✅ QUẢN LÝ SIZE THEO NHÓM — ƯU TIÊN CAO HƠN SIZE45
    //    Điều kiện: checkbox đang bật + sản phẩm có manhom + đã cache dmnhomhang
    var checkboxQuanLySizeTheoNhom = document.getElementById("quanlysizetheonhom");
    var qlTheoNhom = (checkboxQuanLySizeTheoNhom && checkboxQuanLySizeTheoNhom.checked) ? true : false;

    if (qlTheoNhom && String(spData.nhomhang || "").trim() && window.danhMucNhom) {
        const nhom = window.danhMucNhom.get(String(spData.nhomhang).toUpperCase());
        if (nhom && nhom.quanlysize) {
            const diadiemHienTai = (localStorage.getItem("diadiem") || "").toUpperCase(); // 'CS1' | 'CS2'
            if (nhom.diadiem === "ALL" || nhom.diadiem === diadiemHienTai) {
                const sizeInput = document.getElementById("size");
                const sizeValue = (sizeInput?.value || "").trim();

                if (!sizeValue) {
                    // Chưa nhập size → ép nhập (focus + beep), DỪNG HẲN để không rơi xuống size45
                    sizeInput.focus();
                    sizeInput.select();
                    if (window.soundWaitSize) window.soundWaitSize();
                    return true; // báo đã xử lý cho chuyenFocus
                } else {
                    // Đã có size → ép SL=1 và thêm ngay, DỪNG HẲN
                    document.getElementById("soluong").value = 1;
                    themVaoBang(sizeValue, { afterAdd: "keepMaspFocusSize" });
                    return true;
                }
            }
        }
    }



    // ==== ⚡️ THÊM XỬ LÝ BÁN SIÊU NHANH Ở ĐÂY ====
    const banSieuNhanh = document.getElementById("bansieunhanh")?.checked;
    if (banSieuNhanh) {
        document.getElementById("soluong").value = "1";
        document.getElementById("size").value = "0"; // size rỗng
        themVaoBang(""); // Bỏ qua kiểm tra size, số lượng
        document.getElementById("masp").focus();
        document.getElementById("masp").select();
        return true; // Không chạy các logic kiểm tra khác nữa!
    }
    // ==== ⚡️ END ====

    // ... Các xử lý logic size45, nhập nhanh cũ giữ nguyên ...
    // === BẮT BUỘC NHẬP SIZE VỚI GIÀY DÉP KHI BẬT SIZE 45 ===

    if (
        quanlysizetheogia &&
        (
            (spData.chungloai && spData.chungloai.toLowerCase() === "gd")
            ||
            (Number(spData.giale) >= 170000)
        )
    ) {
        const sizeInput = document.getElementById("size");
        if (!sizeInput.value.trim()) {
            sizeInput.focus();
            sizeInput.select();
            window.soundWaitSize?.();   // ✅ phát "tút" báo cần nhập size
            return true; // Dừng lại, không tự thêm vào bảng
        }
        document.getElementById("soluong").value = "1";
        themVaoBang(sizeInput.value.trim(), { afterAdd: "keepMaspFocusSize" });  // ✅
        return true;
    }

    if (
        size45 &&
        spData.chungloai &&
        spData.chungloai.toLowerCase() === "gd"
    ) {
        const sizeInput = document.getElementById("size");
        if (!sizeInput.value.trim()) {
            sizeInput.focus();
            sizeInput.select();
            window.soundWaitSize?.();   // ✅ phát "tút" báo cần nhập size
            return true; // Dừng lại, không tự thêm vào bảng
        }
        document.getElementById("soluong").value = "1";
        themVaoBang(sizeInput.value.trim(), { afterAdd: "keepMaspFocusSize" });  // ✅
        return true;
    }

    // === CŨ: ĐỐI VỚI CÁC TRƯỜNG HỢP KHÁC ===
    if (size45) {
        document.getElementById("soluong").value = "1";
        themVaoBang("0");
    } else {
        const nextId = nhapNhanh ? "size" : "soluong";
        const nextInput = document.getElementById(nextId);
        nextInput.focus();
        nextInput.select();  // ✅ luôn select, không cần if
        if (nextId === "soluong") nextInput.select();
    }

    return true;
}

export function themVaoBang(forcedSize = null, opts = {}) {
    // luôn đóng popup ngay khi bắt đầu thêm
    window.closePopupMasp && window.closePopupMasp();
    const masp = layMaspGoc(document.getElementById("masp").value);
    const isNewGroup = !bangKetQua[masp]; // 🔔 nhóm mới hay không

    let size = forcedSize !== null ? String(forcedSize).trim()
        : String(document.getElementById("size").value).trim();
    const soluong = parseInt(document.getElementById("soluong").value.trim()) || 1;

    const sp = window.sanPhamData?.[masp];

    // --- Kiểm tra trạng thái bán siêu nhanh ---
    const banSieuNhanh = document.getElementById("bansieunhanh")?.checked;

    // quản lý việc tất cả các mã hàng thuộc điều kiện quản lý theo size thì
    //  không được phép nhập sai bằng 0 chỉ được phép nhập (38–45):    
    // ===== CỬA CUỐI: khóa size cho mọi đường vào =====
    {
        if (sp) {
            const size45On = !!document.getElementById("size45")?.checked;
            const qlSizeTheoGiaOn = !!document.getElementById("quanlysizetheogia")?.checked;
            const qlTheoNhomOn = !!document.getElementById("quanlysizetheonhom")?.checked;

            // nhóm có quanlysize hợp lệ tại cơ sở hiện tại?
            let groupRequires = false;
            if (qlTheoNhomOn && sp.nhomhang && window.danhMucNhom) {
                const nhom = window.danhMucNhom.get(String(sp.nhomhang).toUpperCase());
                if (nhom && nhom.quanlysize) {
                    const diadiemHienTai = (localStorage.getItem("diadiem") || "").toUpperCase(); // CS1/CS2
                    groupRequires = (nhom.diadiem === "ALL" || nhom.diadiem === diadiemHienTai);
                }
            }

            // size45 chỉ siết với giày; theo giá siết nếu là giày hoặc giale ≥ 170000
            const isGD = String(sp.chungloai || "").trim().toLowerCase() === "gd";
            const giaHangHoa = Number(sp.giale) || 0;
            const managedByGia = qlSizeTheoGiaOn && (isGD || giaHangHoa >= 170000);

            // 🔒 Chỉ khi thực sự thuộc diện quản lý size mới kiểm tra 38–45
            const requireManagedSize = (size45On && isGD) || groupRequires || managedByGia;

            if (requireManagedSize) {
                const allowed = new Set(["38", "39", "40", "41", "42", "43", "44", "45"]);
                const rawSize = (forcedSize ?? size ?? "").toString().trim().toUpperCase();

                const invalid = (!rawSize || rawSize === "0" || !allowed.has(rawSize));
                if (invalid) {
                    alert("Size không hợp lệ! Chỉ cho phép nhập size 38–45.");
                    const sizeEl = document.getElementById("size");
                    if (sizeEl) { sizeEl.focus(); sizeEl.select(); }
                    window.soundWaitSize?.();   // beep cảnh báo
                    return; // ❌ dừng thêm dòng
                }

                // chuẩn hoá size hợp lệ để dùng tiếp phía dưới
                size = rawSize;
            }
        }
    }

    // ==== KIỂM TRA SIZE HỢP LỆ (áp dụng cho mọi trường hợp, TRỪ bán siêu nhanh) ====

    if (!banSieuNhanh) {
        const dsSize = Array.isArray(window.danhMucSize)
            ? window.danhMucSize.map(s => String(s).trim().toUpperCase())
            : [];

        const sizeUC = String(size || "").trim().toUpperCase();

        // Thiếu masp hoặc không tìm thấy sản phẩm -> không thể thêm
        if (!masp || !sp) {
            alert("Phải nhập mã sản phẩm hợp lệ.");
            document.getElementById("masp").focus();
            document.getElementById("masp").select();
            return;
        }

        // Nếu đã vào được đây từ ô #size, ta chỉ chấp nhận khi size nằm trong danh mục
        // (trường hợp không hợp lệ đã được điều hướng/cảnh báo ở chuyenFocus)
        if (dsSize.length && !dsSize.includes(sizeUC)) {
            // Không alert ở đây để tránh gián đoạn thao tác;
            // chỉ quay lại #size nếu đang có trường này.
            const sizeEl = document.getElementById("size");
            if (sizeEl) {
                sizeEl.focus();
                sizeEl.select();
            }
            return;
        }
    }

    // ==== END KIỂM TRA ====
    // Lấy giá & khuyến mại từ form
    const toInt = (v) => parseInt(String(v || "0").replace(/[.,\s]/g, ""), 10) || 0;
    let giaForm = toInt(document.getElementById("gia")?.value || "0");
    let kmForm = toInt(document.getElementById("khuyenmai")?.value || "0");

    // [SAFE GUARD] Nếu giá form vẫn = 0, fallback theo dm hàng hoá
    if (giaForm === 0 && sp) {
        const giaSP = Math.round(parseMoneyInt(sp.giale || 0));
        let kmAuto = 0;
        try { kmAuto = tinhKhuyenMai(sp, giaSP) || 0; } catch (e) { }

        giaForm = giaSP;
        if (!kmForm || kmForm < 0) kmForm = kmAuto;

        // ghi ngược lại lên form để người dùng thấy đúng
        const giaEl = document.getElementById("gia");
        const kmEl = document.getElementById("khuyenmai");
        if (giaEl) giaEl.value = giaSP.toLocaleString();
        if (kmEl) kmEl.value = (kmForm || 0).toLocaleString();
    }


    // Nếu nhập khuyến mại < 100 → coi là %
    if (kmForm > 0 && kmForm < 100) {
        kmForm = Math.round((giaForm * kmForm) / 100);
    }

    const key = masp;
    const bang = bangKetQua[key] || {
        masp,
        tensp: sp.tensp,
        sizes: [],
        soluongs: [],
        tong: 0,
        gia: giaForm,
        km: kmForm,
        dvt: sp.dvt || ""
    };

    // Nếu nhóm đã tồn tại → cập nhật giá/km theo form (ưu tiên người dùng nhập tay)
    bang.gia = giaForm;
    bang.km = kmForm;


    // === CHỐT LẠI PHẦN NÀY: so sánh chuẩn hóa size ===
    const normSize = String(size).trim();
    const index = bang.sizes.findIndex(sz => String(sz).trim() === normSize);
    if (index !== -1) {
        bang.soluongs[index] += soluong;
    } else {
        bang.sizes.push(normSize);
        bang.soluongs.push(soluong);
    }

    bang.tong += soluong;
    bangKetQua[key] = bang;
    // Cập nhật thứ tự nhóm (mới nhất ở TRÊN CÙNG)
    if (!Array.isArray(window.groupOrder)) {
        // khởi tạo: newest-first từ trạng thái hiện có
        window.groupOrder = Object.keys(bangKetQua).slice().reverse();
    }

    if (isNewGroup) {
        // nhóm mới: đưa lên đầu
        window.groupOrder = [masp, ...window.groupOrder.filter(m => m !== masp)];
    } else {
        // nhóm cũ: giữ nguyên vị trí; nhưng nếu vì lý do gì chưa có thì thêm vào cuối
        if (!window.groupOrder.includes(masp)) {
            window.groupOrder.push(masp);
        }
    }

    // ⚡️ Lưu lại thông tin dòng vừa thêm + cờ nhóm mới/cũ
    window.lastAdded = { masp, size: normSize, isNewGroup };

    // Render bảng theo luật mới
    capNhatBangHTML(bangKetQua, window.lastAdded);

    // "Tinh" báo thêm thành công
    window.soundSuccess?.();


    if (opts.afterAdd === "keepMaspFocusSize") {
        // Đóng gợi ý MASP ngay khi Enter ở #masp
        window.closePopupMasp && window.closePopupMasp();
        // ✅ Tăng bộ đếm (xx) ngay trên ô #masp
        const maspEl = document.getElementById("masp");
        const raw = String(maspEl.value || "").trim().toUpperCase();
        const base = raw.replace(/\(\d+\)\s*$/, "");       // bỏ (xx) nếu có
        const m = raw.match(/\((\d+)\)\s*$/);
        const next = m ? (parseInt(m[1], 10) + 1) : 1;
        maspEl.value = `${base}(${next})`;

        // Rồi mới reset size + select để nhập tiếp
        if (typeof resetFormSauKhiNhapSize === "function") {
            resetFormSauKhiNhapSize();
        }
    } else {
        // Luồng cũ: thêm xong thì xóa masp và focus về #masp
        resetFormBang();
    }

}


export function getBangKetQua() {
    if (window.bangKetQua && Object.keys(window.bangKetQua).length > 0) {
        return window.bangKetQua;
    }
    return bangKetQua;
}

export function resetBangKetQua() {
    bangKetQua = {};
    if (window.bangKetQua) window.bangKetQua = {};

    // ✅ reset luôn các state điều khiển thứ tự/hiển thị
    window.groupOrder = [];
    window.lastAdded = null;

    capNhatBangHTML(bangKetQua, null);
}


export function ganTenNV() {
    const manv = document.getElementById("manv").value.trim();
    document.getElementById("tennv").value = window.nhanVienData?.[manv] || "";
}

export function xoaDongDangChon() {
    if (!maspDangChon) {
        alert("Vui lòng chọn dòng cần xóa.");
        return;
    }

    if (confirm(`Bạn có chắc muốn xóa mã sản phẩm "${maspDangChon}"?`)) {
        delete bangKetQua[maspDangChon];
        maspDangChon = null;
        capNhatBangHTML(bangKetQua, window.lastAdded);
    }
}

export function suaDongDangChon() {
    let dangChon = getMaspspDangChon();

    // Nếu chưa chọn dòng nào -> tự lấy dòng đầu
    if (!dangChon) {
        const firstRow = document.querySelector("#bangketqua tbody tr");
        if (!firstRow) {
            alert("Không có dòng nào để sửa.");
            return;
        }
        const tds = firstRow.querySelectorAll("td");
        const masp = (tds[0]?.textContent || "").trim();
        const size = (tds[2]?.textContent || "").trim();
        if (!masp || !size) {
            alert("Không đọc được dữ liệu dòng đầu tiên để sửa.");
            return;
        }
        setMaspspDangChon({ masp, size });
        dangChon = { masp, size };
    }

    const { masp, size } = dangChon;
    const item = bangKetQua[masp];
    if (!item) {
        alert("Không tìm thấy dòng để sửa.");
        return;
    }
    const idx = item.sizes.findIndex(s => s == size);
    if (idx === -1) {
        alert("Không tìm thấy size để sửa.");
        return;
    }

    // Đưa thông tin về form nhập
    const maspEl = document.getElementById("masp");
    document.getElementById("size").value = item.sizes[idx] || "";
    document.getElementById("soluong").value = item.soluongs[idx] || "1";
    document.getElementById("dvt").value = item.dvt || "";
    document.getElementById("gia").value = item.gia || "";
    document.getElementById("khuyenmai").value = item.km || "";
    // ✅ tính lại thành tiền đưa lên form
    recalcThanhtienFromForm();   // <— THÊM DÒNG NÀY
    // Gán mã & BÔI ĐEN ngay để người dùng có thể nhấn Delete là xoá toàn bộ mã 🔴
    maspEl.value = item.masp || "";
    // Thay vì focus về #masp, ta chuyển sang #soluong để người dùng gõ số lượng ngay
    const slEl = document.getElementById("soluong");
    if (slEl) {
        slEl.focus();
        slEl.select();  // ✅ bôi đen để gõ luôn
       
    }    

    // Xoá đúng dòng đang chọn khỏi bảng (mã/size)
    item.sizes.splice(idx, 1);
    item.soluongs.splice(idx, 1);
    item.tong -= parseInt(document.getElementById("soluong").value) || 0;
    if (item.sizes.length === 0) delete bangKetQua[masp];

    // Clear trạng thái chọn + render lại bảng
    setMaspspDangChon(null);
    capNhatBangHTML(bangKetQua, window.lastAdded);
}


export async function napLaiChiTietHoaDon(sohd) {
    // Lấy chi tiết từ bảng ct_hoadon_banle
    const { data: chitiet, error } = await supabase
        .from("ct_hoadon_banle")
        .select("*")
        .eq("sohd", sohd);

    if (error || !chitiet || chitiet.length === 0) {
        alert("❌ Không tìm thấy chi tiết hóa đơn để sửa.");
        return;
    }

    // Reset lại bảng tạm
    resetBangKetQua();

    // Ghép lại đúng cấu trúc của bangKetQua
    chitiet.forEach(ct => {
        const masp = ct.masp;
        if (!bangKetQua[masp]) {
            bangKetQua[masp] = {
                masp: ct.masp,
                tensp: ct.tensp,
                sizes: [],
                soluongs: [],
                tong: 0,
                gia: ct.gia,
                km: ct.km,
                dvt: ct.dvt || ""
            };
        }
        const index = bangKetQua[masp].sizes.indexOf(ct.size);
        if (index === -1) {
            bangKetQua[masp].sizes.push(String(ct.size)); // luôn lưu về kiểu string

            bangKetQua[masp].soluongs.push(ct.soluong);
        } else {
            bangKetQua[masp].soluongs[index] += ct.soluong;
        }
        bangKetQua[masp].tong += ct.soluong;
    });

    capNhatBangHTML(bangKetQua, window.lastAdded);
}


// ===== Chuyển focus về #size khi Enter ở #gia hoặc #khuyenmai =====
document.addEventListener("DOMContentLoaded", () => {
    ["gia", "khuyenmai"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                const sizeEl = document.getElementById("size");
                if (sizeEl) {
                    sizeEl.focus();
                    sizeEl.select();
                }
            }
        });
    });
});







