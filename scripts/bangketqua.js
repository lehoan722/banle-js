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
            let km = item.km || 0;
            if (isNhap) {
                if (window.sanPhamData && window.sanPhamData[item.masp]) {
                    gia = window.sanPhamData[item.masp].gianhap || 0;
                } else {
                    gia = 0;
                }
                km = 0;
            }
            const thanhtien = (gia - km) * sl;

            const tr = tbody.insertRow();
            const vitri = getVitriTheoKho(item.masp);

            tr.innerHTML = `
        <td>${item.masp}</td>
        <td>${item.tensp}</td>
        <td>${sz}</td>
        <td>${sl}</td>
        <td>${item.dvt || ""}</td>
        <td>${gia}</td>
        <td>${km}</td>
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
        // Chú ý: cập nhật lại chỉ số cột nếu bảng có thay đổi thứ tự
        const masp = (row.cells[0]?.innerText || "").trim().toUpperCase();
        const tensp = (row.cells[1]?.innerText || "").trim();
        const size = (row.cells[2]?.innerText || "").trim();
        const soluong = parseFloat(row.cells[3]?.innerText || "0");
        // cells[4] là ĐVT nhưng sẽ không lấy trực tiếp
        const gia = parseFloat(row.cells[5]?.innerText?.replace(/,/g, "") || "0");
        const km = parseFloat(row.cells[6]?.innerText?.replace(/,/g, "") || "0");
        // cells[7] là Thành tiền, không cần dùng

        if (!masp) return; // Bỏ qua dòng rỗng

        // Lấy dvt từ danh mục hàng hóa (window.sanPhamData)
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
        bang[masp].sizes.push(size);
        bang[masp].soluongs.push(soluong);
        // Có thể bổ sung logic cộng dồn size nếu cần
    });

    // Gán vào window để getBangKetQua() có thể đọc
    window.bangKetQua = bang;
}

// ====== HIỂN THỊ DẠNG NGANG (0–45) ======
window.dangXemBangNgang = false;

export function toggleBangKetQua() {
    // luôn đồng bộ dữ liệu trước khi chuyển
    if (typeof window.capNhatBangKetQuaTuDOM === "function") {
        window.capNhatBangKetQuaTuDOM();
    }
    const bang = window.bangKetQua || {};
    window.dangXemBangNgang = !window.dangXemBangNgang;

    const btn = document.getElementById("btnChuyenBang");
    const table = document.getElementById("bangketqua");

    if (window.dangXemBangNgang) {
        // đặt cờ ngay trên bảng
        table?.setAttribute("data-mode", "ngang");
        renderBangNgang(bang);
        if (btn) btn.textContent = "🔁 Dạng dọc";
    } else {
        table?.removeAttribute("data-mode");
        capNhatBangHTML(bang);
        if (btn) btn.textContent = "🔁 Dạng ngang";
    }

    if (typeof capNhatThongTinTong === "function") capNhatThongTinTong(bang);
}

function renderBangNgang(bangKetQua) {
    const tbody = document.querySelector("#bangketqua tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const thead = document.querySelector("#bangketqua thead");
    if (thead) {
        // ⚠️ Không có cột Tên SP, thêm size 0
        thead.innerHTML = `
      <tr>
        <th>Mã SP</th>
        <th>0</th><th>38</th><th>39</th><th>40</th>
        <th>41</th><th>42</th><th>43</th><th>44</th><th>45</th>
        <th>Tổng SL</th>
      </tr>`;
    }

    const arrSize = ["0", "38", "39", "40", "41", "42", "43", "44", "45"];

    Object.values(bangKetQua).forEach(item => {
        if (!item) return;
        const tr = document.createElement("tr");

        // Gộp số lượng theo size
        const mapSL = {};
        (item.sizes || []).forEach((sz, i) => {
            const key = String(sz).trim();
            const sl = parseFloat(item.soluongs?.[i]) || 0;
            mapSL[key] = (mapSL[key] || 0) + sl;
        });

        let tong = 0;
        const cellsSize = arrSize.map(sz => {
            const val = mapSL[sz];
            if (val && val !== 0) { tong += val; return `<td>${val}</td>`; }
            return `<td></td>`; // để trống nếu size không có SL
        }).join("");

        tr.innerHTML = `
      <td>${item.masp}</td>
      ${cellsSize}
      <td>${tong || ""}</td>
    `;
        tbody.appendChild(tr);
    });
}

window.capNhatBangKetQuaTuDOM = capNhatBangKetQuaTuDOM;
