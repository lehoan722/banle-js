// baocaoxntmini.js – giao diện & luồng giống XNT14, gọi hàm mini
import { supabase } from "./supabaseClient.js";

let hotInstance;
let currentPage = 1;
let pageSize = 1000;         // 1000 dòng / trang như yêu cầu
let hasNextPage = false;
let lastParams = null;       // nhớ tham số lần gọi gần nhất để chuyển trang


// ====== Đăng nhập ======
window.dangNhap = async function () {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const status = document.getElementById("authStatus");
    status.textContent = "";

    if (!email || !password) {
        status.textContent = "Nhập đầy đủ email và mật khẩu!";
        return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        status.textContent = "Sai email hoặc mật khẩu!";
        return;
    }
    status.style.color = "green";
    status.textContent = "Đăng nhập thành công!";
    document.getElementById("authBox").style.display = "none";
};

// ====== Helpers ======
const $ = (s, r = document) => r.querySelector(s);
function toUpper(v) { return (v || "").toString().trim().toUpperCase() || null; }
function num(v) { return v === "" || v == null ? null : Number(v); }
function uniqueListFromTextarea(id) {
    const raw = $(id)?.value || "";
    const arr = raw.split(/\r?\n/).map(s => s.trim().toUpperCase()).filter(Boolean);
    return arr.length ? Array.from(new Set(arr)) : null;
}

// ====== Lấy dữ liệu & hiển thị ======
window.taiBaoCaoXNT_Mini = async function () {
    const loadingMsg = $("#loadingMsg");
    if (loadingMsg) loadingMsg.textContent = "⏳ Đang tải...";

    // bắt buộc đăng nhập
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        alert("Bạn cần đăng nhập trước khi xem báo cáo!");
        $("#authBox").style.display = "block";
        if (loadingMsg) loadingMsg.textContent = "";
        return;
    }

    // đọc input
    const diadiem = $("#diadiemSelect").value || 'all';
    const tuNgay = $("#tuNgay").value;
    const denNgay = $("#denNgay").value;
    if (!tuNgay || !denNgay) { alert("Chọn đủ Từ ngày / Đến ngày!"); return; }

    const nhacc = $("#khachhangInput").value.trim() || null;
    const nhanvien = $("#nhanvienInput").value.trim() || null;
    const nhomhang = $("#nhomhangInput").value.trim() || null;
    const chungloai = $("#chungloaiInput").value.trim() || null;
    const mausac = $("#mausacInput").value.trim() || null;
    const size = $("#sizeInput").value.trim() || null;

    // danh sách mã
    let maspList = uniqueListFromTextarea("#maspList");
    const maspSingle = $("#maspInput").value.trim().toUpperCase();
    if (!maspList && maspSingle) maspList = [maspSingle];

    const tuGia = $("#tuGia").value || null;
    const denGia = $("#denGia").value || null;

    // build params & lưu lại để chuyển trang
    lastParams = {
        tu_ngay: tuNgay,
        den_ngay: denNgay,
        p_diadiem: diadiem,
        p_nhacc_filter: toUpper(nhacc),
        p_khachhang_filter: null,
        p_nhanvien_filter: toUpper(nhanvien),
        p_nhomhang_filter: toUpper(nhomhang),
        p_chungloai_filter: toUpper(chungloai),
        p_mausac_filter: toUpper(mausac),
        p_size_filter: toUpper(size),
        p_tu_gia: num(tuGia),
        p_den_gia: num(denGia),
        p_dsmsp: maspList
    };

    await loadPage(1); // luôn quay về trang 1 khi bấm "Xem báo cáo"
    if (loadingMsg) loadingMsg.textContent = "";
};

async function loadPage(pageNo) {
    currentPage = Math.max(1, pageNo);
    const offset = (currentPage - 1) * pageSize;
    const limit = pageSize + 1;            // lấy dư 1 dòng để biết còn trang sau không

    const params = { ...lastParams, p_limit: limit, p_offset: offset };

    const container = $("#hot");
    if (hotInstance) { hotInstance.destroy(); hotInstance = null; }
    container.innerHTML = "";

    const { data, error } = await supabase.rpc("baocaoxntmini_paged", params);
    if (error) {
        container.innerHTML = `<div style="color:red">Lỗi: ${error.message}</div>`;
        updatePagerUI(false, false, 0);
        $("#xntSummary").innerHTML = "";
        return;
    }

    hasNextPage = data && data.length > pageSize;
    const pageData = hasNextPage ? data.slice(0, pageSize) : data;

    if (!pageData || !pageData.length) {
        container.innerHTML = `<div style="color:orange">Không có dữ liệu</div>`;
        updatePagerUI(currentPage > 1, hasNextPage, 0);
        $("#xntSummary").innerHTML = "";
        return;
    }

    // Tính tổng giống XNT14
    let tongDauKy = 0, tongNhapMua = 0, tongBan = 0, tongCuoiKy = 0;
    pageData.forEach(r => {
        tongDauKy += r.dauky || 0;
        tongNhapMua += r.nhapmua || 0;
        tongBan += r.tongban || 0;
        tongCuoiKy += r.cuoiky || 0;
    });
    $("#xntSummary").innerHTML = `
    <span style="background:#e3f2fd;padding:7px 16px;border-radius:7px;">
      <b>TỔNG SỐ LIỆU (trang ${currentPage}):</b>
      Đầu kỳ: <b>${tongDauKy.toLocaleString()}</b>
      &nbsp;|&nbsp; Nhập mua: <b>${tongNhapMua.toLocaleString()}</b>
      &nbsp;|&nbsp; Xuất bán: <b>${tongBan.toLocaleString()}</b>
      &nbsp;|&nbsp; Cuối kỳ: <b>${tongCuoiKy.toLocaleString()}</b>
    </span>
  `;

    // ===== THỨ TỰ CỘT đúng như ảnh =====
    const columns = [
        { data: 'stt', title: '#', readOnly: true, width: 44 },
        { data: 'tensp', title: 'Tên hàng', readOnly: true, width: 200 },
        { data: 'masp', title: 'Mã hàng', readOnly: true, width: 140 },
        { data: 'size', title: 'Kích cỡ', readOnly: true, width: 70 },
        { data: 'ban_cs1', title: 'Bán cs1', type: 'numeric', className: 'htRight', readOnly: true, width: 80 },
        { data: 'ban_cs2', title: 'Bán cs2', type: 'numeric', className: 'htRight', readOnly: true, width: 80 },
        { data: 'ton_cs1', title: 'Tồn CS1', type: 'numeric', className: 'htRight', readOnly: true, width: 90 },
        { data: 'ton_cs2', title: 'Tồn CS2', type: 'numeric', className: 'htRight', readOnly: true, width: 90 },
        { data: 'cuoiky', title: 'Cuối kỳ', type: 'numeric', className: 'htRight', readOnly: true, width: 90 },
        { data: 'tongban', title: 'Tổng bán', type: 'numeric', className: 'htRight', readOnly: true, width: 90 },
        { data: 'dauky', title: 'Đầu kỳ', type: 'numeric', className: 'htRight', readOnly: true, width: 90 },
        { data: 'nhapmua', title: 'Nhập mua', type: 'numeric', className: 'htRight', readOnly: true, width: 90 },
        { data: 'giale', title: 'Giá lẻ', type: 'numeric', className: 'htRight', readOnly: true, width: 90 }
    ];
    const hotData = pageData.map((r, i) => ({ stt: (offset + i + 1), ...r }));

    hotInstance = new Handsontable(container, {
        data: hotData,
        columns,
        colHeaders: columns.map(c => c.title),
        rowHeaders: false,
        width: '100%',
        height: 560,
        copyPaste: { copyColumnHeaders: true },
        licenseKey: 'non-commercial-and-evaluation',
        stretchH: 'all',
        manualColumnResize: true,
        readOnly: true,
        columnSorting: true,
        filters: true,
        dropdownMenu: true
    });

    updatePagerUI(currentPage > 1, hasNextPage, hotData.length);
}

function updatePagerUI(canPrev, canNext, count) {
    $("#btnPrev").disabled = !canPrev;
    $("#btnNext").disabled = !canNext;
    $("#pageIndex").textContent = String(currentPage);
    $("#pageInfo").textContent = count ? `— Hiển thị ${count.toLocaleString()} dòng` : '';
}

window.nextPage = async function () {
    if (!hasNextPage) return;
    await loadPage(currentPage + 1);
};
window.prevPage = async function () {
    if (currentPage <= 1) return;
    await loadPage(currentPage - 1);
};



// ====== Popup tìm kiếm (tái dùng logic từ XNT14) ======
window.openPopupSearch = function (type, keyword = "") {
    window.currentPopupType = type;
    const popup = $("#popupSearch");
    const input = $("#popupSearchInput");
    const list = $("#popupSearchList");
    popup.style.display = 'block';
    input.value = keyword || '';
    input.focus();
    if (!keyword) searchPopup("");
    else searchPopup(keyword.trim());
};
window.closePopupSearch = function () { $("#popupSearch").style.display = 'none'; };

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { const p = $("#popupSearch"); if (p && p.style.display === 'block') window.closePopupSearch(); }
});
document.addEventListener('click', (e) => {
    const overlay = $("#popupSearch");
    if (!overlay || overlay.style.display !== 'block') return;
    if (e.target === overlay) window.closePopupSearch();
});
const box = document.getElementById('popupSearchContent');
if (box) box.addEventListener('click', e => e.stopPropagation());

window.clearInput = function (id) { document.getElementById(id).value = ''; };

document.getElementById('popupSearchInput').addEventListener('input', function () {
    let keyword = this.value.trim();
    if (keyword.length < 1) {
        $("#popupSearchList").innerHTML = '<i>Nhập từ khóa…</i>';
        return;
    }
    searchPopup(keyword);
});

async function searchPopup(keyword) {
    const type = window.currentPopupType;
    let table = '', field = '', extra = '';
    if (type === 'khachhang') { table = 'dmkhachhang'; field = 'makh'; extra = ', tenkh'; }
    else if (type === 'mahang') { table = 'dmhanghoa'; field = 'masp'; extra = ', tensp'; }
    else if (type === 'nhomhang') { table = 'dmnhomhang'; field = 'manhom'; extra = ', tennhom'; }
    else if (type === 'chungloai') { table = 'dmchungloai'; field = 'machungloai'; extra = ', tenchungloai'; }
    else if (type === 'mausac') { table = 'dmmausac'; field = 'mamau'; extra = ', tenmau'; }
    else if (type === 'nhanvien') { table = 'dmnhanvien'; field = 'manv'; extra = ', tennv'; }
    else if (type === 'size') { table = 'dm_size'; field = 'size'; extra = ', mota'; }
    else return;

    let { data, error } = await supabase.from(table)
        .select(`${field}${extra}`).ilike(field, `%${keyword}%`).limit(100);
    if (error || !data || !data.length) {
        $("#popupSearchList").innerHTML = '<i>Không tìm thấy dữ liệu</i>'; return;
    }
    $("#popupSearchList").innerHTML = data.map(row => `
    <div style="padding:5px 10px;cursor:pointer;border-bottom:1px solid #eee;"
      onclick="selectPopupValue('${type}', '${String(row[field]).replace(/'/g, "\\'")}')">
      ${row[field]}${row.tensp ? " - " + row.tensp : ""}${row.tenkh ? " - " + row.tenkh : ""}
      ${row.tennv ? " - " + row.tennv : ""}${row.tennhom ? " - " + row.tennhom : ""}${row.tenchungloai ? " - " + row.tenchungloai : ""}
      ${row.tenmau ? " - " + row.tenmau : ""}${row.mota ? " - " + row.mota : ""}
    </div>`).join('');
}
window.selectPopupValue = function (type, value) {
    const map = {
        khachhang: "khachhangInput", mahang: "maspInput", nhomhang: "nhomhangInput",
        chungloai: "chungloaiInput", mausac: "mausacInput", nhanvien: "nhanvienInput", size: "sizeInput"
    };
    const id = map[type]; if (id) document.getElementById(id).value = value;
    closePopupSearch();
};

// Auto set ngày mặc định
window.onload = async function () {
    const today = new Date().toISOString().slice(0, 10);
    $("#tuNgay").value ||= today;
    $("#denNgay").value ||= today;
    // Ẩn/hiện form login
    const { data: { session } } = await supabase.auth.getSession();
    $("#authBox").style.display = session ? "none" : "block";
};

// ====== Xuất Excel & Copy bảng ======
window.chonXuatExcel_Mini = function () {
    const box = $("#excelOptionsMini");
    box.style.display = box.style.display === "none" ? "block" : "none";
};

window.xuatExcelTrangHienTai_Mini = function () {
    if (!window.hotInstance) return alert("❌ Chưa có dữ liệu để xuất!");
    const data = hotInstance.getData();
    const headers = hotInstance.getColHeader();
    const exportData = [headers, ...data];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "Trang hien tai");
    XLSX.writeFile(wb, "xnt_mini_tranghientai.xlsx");
};

window.xuatExcelToanBo_Mini = async function () {
    const totalData = [];
    const pz = 10000; let off = 0; let page = 1; let more = true;
    const loadingMsg = $("#loadingMsg");
    if (loadingMsg) loadingMsg.textContent = "⏳ Đang tải toàn bộ dữ liệu để xuất Excel...";
    // build params lần nữa theo trang hiện tại
    const diadiem = $("#diadiemSelect").value || 'all';
    const paramsBase = {
        tu_ngay: $("#tuNgay").value, den_ngay: $("#denNgay").value, p_diadiem: diadiem,
        p_nhacc_filter: toUpper($("#khachhangInput").value),
        p_khachhang_filter: null,
        p_nhanvien_filter: toUpper($("#nhanvienInput").value),
        p_nhomhang_filter: toUpper($("#nhomhangInput").value),
        p_chungloai_filter: toUpper($("#chungloaiInput").value),
        p_mausac_filter: toUpper($("#mausacInput").value),
        p_size_filter: toUpper($("#sizeInput").value),
        p_tu_gia: num($("#tuGia").value),
        p_den_gia: num($("#denGia").value),
        p_dsmsp: uniqueListFromTextarea("#maspList")
    };
    while (more) {
        const { data, error } = await supabase.rpc("baocaoxntmini_paged", { ...paramsBase, p_limit: pz, p_offset: off });
        if (error) { alert("❌ Lỗi tải trang " + page + ": " + error.message); break; }
        if (data && data.length) { totalData.push(...data); off += pz; page++; if (data.length < pz) more = false; }
        else more = false;
    }
    if (loadingMsg) loadingMsg.textContent = "";

    if (!totalData.length) return alert("❌ Không có dữ liệu để xuất!");
    const headers = Object.keys(totalData[0]);
    const rows = totalData.map(o => headers.map(k => o[k]));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, "Toan bo du lieu");
    XLSX.writeFile(wb, "xnt_mini_toanbo.xlsx");
};

// copy toàn bảng (kèm tiêu đề)
window.copyBang = async function () {
    if (!window.hotInstance) return alert("❌ Chưa có dữ liệu để copy!");
    const headers = hotInstance.getColHeader();
    const data = hotInstance.getData();
    const rows = [headers, ...data].map(r => r.map(v => v == null ? "" : String(v).replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"));
    try {
        await navigator.clipboard.writeText(rows.join("\n"));
        alert("✅ Đã copy toàn bộ bảng (kể cả tiêu đề)!");
    } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = rows.join("\n"); ta.style.position = "fixed"; ta.style.left = "-9999px";
        document.body.appendChild(ta); ta.focus(); ta.select();
        try { document.execCommand("copy"); alert("✅ Đã copy toàn bộ bảng!"); }
        catch (err) { alert("❌ Trình duyệt chặn copy."); }
        document.body.removeChild(ta);
    }
};
