
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
        // Đóng gợi ý MASP ngay khi Enter ở #masp
        window.closePopupMasp && window.closePopupMasp();

        document.getElementById("size").focus();
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

        // 1) Size hợp lệ -> thêm dòng, giữ nguyên #masp, focus + select() về #size
        if (isValidSize) {
            // đảm bảo số lượng = 1 cho luồng nhập nhanh size
            //document.getElementById("soluong").value = "1";
            // Gọi với tùy chọn hậu xử lý để KHÔNG xóa masp và focus về size
            themVaoBang(val, { afterAdd: "keepMaspFocusSize" });
            return;
        }

        // 2) Không phải size hợp lệ nhưng >= 3 ký tự -> coi là MÃ SẢN PHẨM MỚI
        if (val.length >= 3) {
            maspInput.value = layMaspGoc(val);   // ghi mã mới luôn là mã gốc

            sizeInput.value = "";    // xóa size cũ
            // Giả lập Enter ở ô masp để tái sử dụng luồng cũ
            const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
            maspInput.dispatchEvent(ev);
            return;
        }

        // 3) Không hợp lệ và ≤ 2 ký tự -> cảnh báo theo yêu cầu
        alert("Bạn phải nhập size hoặc mã sản phẩm hợp lệ.");
        sizeInput.focus();
        sizeInput.select();
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

    // Gán thông tin sản phẩm vào form (giữ nguyên các dòng dưới)
    document.getElementById("gia").value = spData.giale || "";
    document.getElementById("khuyenmai").value = spData.khuyenmai || "";

    const cs = document.getElementById("diadiem").value;
    const vitri = cs === "cs1" ? spData.vitrikho1 : spData.vitrikho2;
    document.getElementById("vitri").value = vitri || "";

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

    const size = forcedSize !== null ? String(forcedSize).trim() : String(document.getElementById("size").value).trim();
    const soluong = parseInt(document.getElementById("soluong").value.trim()) || 1;

    const sp = window.sanPhamData?.[masp];

    // --- Kiểm tra trạng thái bán siêu nhanh ---
    const banSieuNhanh = document.getElementById("bansieunhanh")?.checked;

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
    const gia = parseFloat(document.getElementById("gia").value) || 0;
    let km = tinhKhuyenMai(sp, gia);

    const key = masp;
    const bang = bangKetQua[key] || {
        masp,
        tensp: sp.tensp,
        sizes: [],
        soluongs: [],
        tong: 0,
        gia,
        km,
        dvt: ""
    };

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

  // ✅ Nếu CHƯA chọn dòng nào: tự chọn dòng đầu tiên trong bảng kết quả
  if (!dangChon) {
    const firstRow = document.querySelector("#bangketqua tbody tr");
    if (!firstRow) {
      alert("Không có dòng nào để sửa.");
      return;
    }
    // Cột 1 = Mã SP, cột 3 = Size (theo cấu trúc bảng hiện tại)
    const tds = firstRow.querySelectorAll("td");
    const masp = (tds[0]?.textContent || "").trim();
    const size = (tds[2]?.textContent || "").trim();
    if (!masp || !size) {
      alert("Không đọc được dữ liệu dòng đầu tiên để sửa.");
      return;
    }
    // Ghi nhận lựa chọn ảo, để tái dùng logic hiện có
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
  document.getElementById("masp").value = item.masp || "";
  document.getElementById("size").value = item.sizes[idx] || "";
  document.getElementById("soluong").value = item.soluongs[idx] || "1";
  document.getElementById("dvt").value = item.dvt || "";
  document.getElementById("gia").value = item.gia || "";
  document.getElementById("khuyenmai").value = item.km || "";

  // Xóa đúng dòng đang chọn (đúng size) khỏi bảng
  item.sizes.splice(idx, 1);
  item.soluongs.splice(idx, 1);
  item.tong -= parseInt(document.getElementById("soluong").value) || 0;
  if (item.sizes.length === 0) delete bangKetQua[masp];

  // Xóa trạng thái chọn, render lại, focus về MASP để bạn sửa/nhập
  setMaspspDangChon(null);
  capNhatBangHTML(bangKetQua, window.lastAdded);
  document.getElementById("masp").focus();
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

