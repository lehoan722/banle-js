// bangketqua.js

import { getMaspspDangChon, setMaspspDangChon } from './hoadon.js';
import { capNhatThongTinTong } from './utils.js';

function getVitriTheoKho(masp) {
    if (!masp) return "";
    const sp =
        (window.sanPhamData && (window.sanPhamData[masp] || window.sanPhamData[masp.toUpperCase()])) || null;

    // Xác định cơ sở từ input #diadiem (ưu tiên) hoặc localStorage
    const diadiem = (document.getElementById('diadiem')?.value ||
        localStorage.getItem('diadiem') || '').toLowerCase();

    if (!sp) return "";
    if (diadiem === 'cs1') return sp.vitrikho1 || "";
    if (diadiem === 'cs2') return sp.vitrikho2 || "";
    if (diadiem === 'cs3') return sp.vitrikho3 || "";
    return sp.vitrikho1 || sp.vitrikho2 || sp.vitrikho3 || "";
}


export function capNhatBangHTML(bangKetQua, lastAdded = null) {
    const tbody = document.querySelector("#bangketqua tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    // Trang "nhập mới" thì cách tính giá/khuyến mại khác
    const isNhap = window.location.pathname.includes("nhapmoi");

    // 1) Thứ tự nhóm mã:
    // - Nếu vừa thêm NHÓM MỚI (lastAdded.isNewGroup === true) -> đẩy nhóm đó lên đầu
    // - Nếu thêm vào mã đã có -> giữ nguyên thứ tự hiện tại
    // 1) Thứ tự nhóm mã: dùng groupOrder (mới-trên-cùng)
    const maspList = Object.keys(bangKetQua);

    // xây orderedMasps từ groupOrder nhưng CHỈ lấy những mã còn tồn tại
    let orderedMasps = [];
    if (Array.isArray(window.groupOrder) && window.groupOrder.length) {
        orderedMasps = window.groupOrder.filter(m => maspList.includes(m));
        // nêu còn mã mới mà chưa có trong groupOrder thì nối thêm ở cuối
        orderedMasps.push(...maspList.filter(m => !orderedMasps.includes(m)));
    } else {
        orderedMasps = maspList.slice().reverse();
        window.groupOrder = orderedMasps.slice();
    }

    // đảm bảo nhóm mới đứng đầu nếu vừa thêm nhóm mới
    if (lastAdded && lastAdded.isNewGroup === true && lastAdded.masp) {
        orderedMasps = [lastAdded.masp, ...orderedMasps.filter(m => m !== lastAdded.masp)];
        window.groupOrder = orderedMasps.slice();
    }

    // --- khi render từng nhóm ---
    orderedMasps.forEach(masp => {
        const item = bangKetQua[masp];
        if (!item) return; // ⚠️ an toàn: bỏ qua mã không còn

        // Sắp xếp size tăng dần theo danh mục; fallback numeric nếu không có trong danh mục
        const sizes = item.sizes.map(s => String(s).trim());
        const counts = item.soluongs.slice(); // song song với sizes

        const toIndex = (sz) => {
            const s = String(sz).trim().toUpperCase();

            // 1) Size là số -> sắp xếp tăng dần tuyệt đối (38 < 39 < ... < 45)
            if (/^\d+(\.\d+)?$/.test(s)) {
                return parseFloat(s);                  // ví dụ "38" -> 38
            }

            // 2) Size KHÔNG phải số -> theo thứ tự trong danh mục (nếu có)
            if (Array.isArray(window.danhMucSize) && window.danhMucSize.length) {
                const idx = window.danhMucSize
                    .map(x => String(x).trim().toUpperCase())
                    .indexOf(s);
                if (idx !== -1) return 1000 + idx;     // đẩy nhóm “chữ” xuống sau nhóm số
            }

            // 3) Không biết -> xuống cuối
            return Number.POSITIVE_INFINITY;
        };

        const orderIdx = sizes.map((_, i) => i).sort((i, j) => toIndex(sizes[i]) - toIndex(sizes[j]));

        orderIdx.forEach(i => {
            const sz = sizes[i];
            const sl = counts[i];

            // Tính giá/km theo nghiệp vụ
            let gia = item.gia || 0;
            let kmDonVi = item.km || 0;

            if (isNhap) {
                if (window.sanPhamData && window.sanPhamData[item.masp]) {
                    gia = window.sanPhamData[item.masp].gianhap || 0;
                } else {
                    gia = 0;
                }
                kmDonVi = 0;
            }

            const kmTongDong = kmDonVi * sl;
            const thanhtien = (gia * sl) - kmTongDong;

            const tr = tbody.insertRow();
            const vitri = getVitriTheoKho(item.masp);

            tr.innerHTML = `
        <td>${item.masp}</td>
        <td>${item.tensp}</td>
        <td>${sz}</td>
        <td>${sl}</td>
        <td>${item.dvt || ""}</td>
        <td>${gia}</td>
        <td>${kmTongDong.toLocaleString()}</td>
        <td>${thanhtien.toLocaleString()}</td>        
        <td>${vitri}</td>
      `;

            // Chọn/sửa theo cặp (masp, size)
            tr.addEventListener("click", () => {
                setMaspspDangChon({ masp: item.masp, size: sz });
                highlightRow(tr);
            });

            // 3) Highlight dòng vừa thêm (giữ tới lần thêm kế tiếp)
            if (
                lastAdded &&
                String(lastAdded.masp).toUpperCase() === String(item.masp).toUpperCase() &&
                String(lastAdded.size).trim().toUpperCase() === String(sz).trim().toUpperCase()
            ) {
                tr.classList.add("highlight");
            }
        });
    });

    // 4) Cập nhật tổng
    capNhatThongTinTong(bangKetQua);

    // 5) Nếu có adapter sau render (dùng cho các trang đặc biệt như CCN1V2)
    if (typeof window.ccnAfterRenderAdapter === "function") {
        try {
            window.ccnAfterRenderAdapter({ bangKetQua, lastAdded });
        } catch (err) {
            console.error("Lỗi trong ccnAfterRenderAdapter:", err);
        }
    }
}


function highlightRow(selectedRow) {
    document.querySelectorAll("#bangketqua tbody tr").forEach(row => {
        row.style.backgroundColor = row === selectedRow ? "#e6f3ff" : "";
    });
}

export function resetFormBang() {
    const maspInput = document.getElementById("masp");
    const soluongInput = document.getElementById("soluong");
    const sizeInput = document.getElementById("size");

    // LƯU lại mã sản phẩm vừa nhập trước khi xóa trắng
    window.masp_last = maspInput.value || window.masp_last || "";

    // Xóa nội dung, đặt lại giá trị
    maspInput.value = "";
    soluongInput.value = "1";
    sizeInput.value = "";

    // Gọi hàm hiển thị ảnh vừa nhập cuối cùng (sẽ ưu tiên từ masp_last)
    if (window.hienThiAnhSanPhamTuMasp) window.hienThiAnhSanPhamTuMasp();

    // Làm mất focus, rồi mới focus lại để đảm bảo nhận diện lại sự kiện
    maspInput.blur();
    setTimeout(() => maspInput.focus(), 50);
}

export function resetFormSauKhiNhapSize() {
    const maspInput = document.getElementById("masp");
    const soluongInput = document.getElementById("soluong");
    const sizeInput = document.getElementById("size");

    // LƯU lại masp vừa dùng để hiển thị ảnh nếu cần
    window.masp_last = maspInput.value || window.masp_last || "";

    // KHÔNG xóa masp; chỉ reset size & số lượng
    soluongInput.value = "1";
    sizeInput.value = "";

    // Cập nhật ảnh (ưu tiên masp hiện tại)
    if (window.hienThiAnhSanPhamTuMasp) window.hienThiAnhSanPhamTuMasp();

    // Tiếp tục nhập size cho cùng mã
    sizeInput.focus();
    sizeInput.select();
}

export function capNhatBangKetQuaTuDOM() {
    const tbody = document.querySelector("#bangketqua tbody");
    if (!tbody) return;

    const bang = {};

    Array.from(tbody.rows).forEach(row => {
        const masp = (row.cells[0]?.innerText || "").trim().toUpperCase();
        const tensp = (row.cells[1]?.innerText || "").trim();
        const sizeText = (row.cells[2]?.innerText || "").trim();
        const slCell = parseFloat(row.cells[3]?.innerText || "0"); // SL của cả dòng
        const gia = parseFloat((row.cells[5]?.innerText || "").replace(/,/g, "")) || 0;
        const km = parseFloat((row.cells[6]?.innerText || "").replace(/,/g, "")) || 0;

        if (!masp) return;

        // Lấy ĐVT từ danh mục hàng hóa (sanPhamData)
        let dvt = "";
        if (window.sanPhamData && window.sanPhamData[masp]) {
            dvt = window.sanPhamData[masp].dvt || "";
        }

        if (!bang[masp]) {
            bang[masp] = {
                masp,
                tensp,
                sizes: [],
                soluongs: [],
                gia,
                km,
                dvt,
            };
        }

        // 🔍 PHẦN QUAN TRỌNG: phân tích cột size
        // Hỗ trợ 2 kiểu:
        // 1) Gộp:  "38/5 39/1 40/1 ..."
        // 2) Cũ:   "39"  + SL = 1
        const entries = [];

        if (sizeText) {
            const parts = sizeText.split(/\s+/).filter(Boolean);

            parts.forEach(tok => {
                // dạng "38/5" -> size=38, sl=5
                const m = tok.match(/^(\d+)\s*\/\s*(\d+)$/);
                if (m) {
                    entries.push({
                        size: m[1],
                        sl: Number(m[2]) || 0,
                    });
                }
            });

            // Nếu KHÔNG tìm được token dạng "38/5" → coi như dạng cũ: 1 size, SL = slCell
            if (entries.length === 0) {
                entries.push({
                    size: sizeText,
                    sl: slCell,
                });
            }
        }

        // Ghi các cặp size/sl vào bang[masp]
        entries.forEach(({ size, sl }) => {
            bang[masp].sizes.push(String(size).trim());
            bang[masp].soluongs.push(Number(sl) || 0);
        });
    });

    // Đẩy lên global
    window.bangKetQua = bang;
}


window.capNhatBangKetQuaTuDOM = capNhatBangKetQuaTuDOM;


