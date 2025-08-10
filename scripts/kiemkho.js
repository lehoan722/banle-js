import { supabase } from "./supabaseClient.js";

let hot; // Handsontable instance
let maNhanVien = '';
let tenNhanVien = '';
let coSo = window.coSo || 'cs1'; // Lấy từ HTML truyền vào
//let coSo = 'cs1'; // cs1 hoặc cs2

const SIZE_FIELDS = ['0', '38', '39', '40', '41', '42', '43', '44', '45'];
const COLS = [
    { data: 'masp', type: 'text', title: 'Mã SP', width: 100 },
    { data: 'tong', type: 'numeric', title: 'Tổng', readOnly: true, width: 48 },
    ...SIZE_FIELDS.map(s => ({ data: 'size' + s, type: 'numeric', title: s, width: 40 })),
    { data: 'vitri', type: 'text', title: 'Vị trí', width: 70, readOnly: true },
    { data: 'ghichu', type: 'text', title: 'Ghi chú', width: 90 }
];
const COL_HEADERS = ['Mã SP', 'Tổng', ...SIZE_FIELDS, 'Vị trí', 'Ghi chú'];

window.onload = function () {
    initUI();
};

function initUI() {
    //document.getElementById('cosoSelect').addEventListener('change', onChangeCoSo);
    document.getElementById('manvInput').addEventListener('blur', onManvBlur);
    document.getElementById('kiemtraBtn').onclick = onKiemTra;
    document.getElementById('themmoiBtn').onclick = onThemMoi;
    document.getElementById('kiemtontBtn').onclick = onKiemTon;
    document.getElementById('btnXoaKiemTon').onclick = window.xoaKiemTon;
    document.getElementById('luuBtn').onclick = onLuu;
    document.getElementById('maspInput').addEventListener('keydown', onMaspInputEnter);
    document.getElementById('danhsachTextarea').addEventListener('keydown', onTextareaTab);
    // Tạo handsontable trống
    createHotTable([]);
    document.getElementById('popupSearchInput').addEventListener('input', onPopupInput);
}

// Popup tìm kiếm dùng chung
window.openPopupSearch = async function (type) {
    window.currentPopupType = type;
    const popup = document.getElementById('popupSearch');
    const input = document.getElementById('popupSearchInput');
    popup.style.display = 'block';
    input.value = "";
    input.focus();
    searchPopup("");
};
window.closePopupSearch = function () {
    document.getElementById('popupSearch').style.display = 'none';
};

async function onPopupInput(e) {
    searchPopup(e.target.value.trim());
}
async function searchPopup(keyword) {
    const type = window.currentPopupType;
    let table = '', field = '', extraFields = '';
    if (type === 'mahang') { table = 'dmhanghoa'; field = 'masp'; extraFields = ', tensp'; }
    else if (type === 'nhanvien') { table = 'dmnhanvien'; field = 'manv'; extraFields = ', tennv'; }
    else return;
    let query = supabase.from(table).select(`${field}${extraFields}`).limit(100);
    if (keyword && keyword.length >= 1) query = query.ilike(field, `%${keyword}%`);
    const { data, error } = await query;
    const listDiv = document.getElementById('popupSearchList');
    if (error || !data || !data.length) {
        listDiv.innerHTML = '<i>Không tìm thấy dữ liệu</i>'; return;
    }
    listDiv.innerHTML = data.map(row => `
        <div onclick="selectPopupValue('${type}', '${row[field].replace(/'/g, "\\'")}', '${row.tensp || row.tennv || ""}')">
            <b>${row[field]}</b>${row.tensp ? " - " + row.tensp : (row.tennv ? " - " + row.tennv : "")}
        </div>
    `).join('');
}
window.selectPopupValue = function (type, value, value2) {
    if (type === 'mahang') {
        document.getElementById('maspInput').value = value;
        closePopupSearch();
        document.getElementById('maspInput').focus();
    }
    if (type === 'nhanvien') {
        document.getElementById('manvInput').value = value;
        document.getElementById('tennvDisplay').innerHTML = "Tên: <b style='color:blue'>" + value2 + "</b>";
        closePopupSearch();
    }
};

// Thay đổi cơ sở (cs1/cs2)
function onChangeCoSo() {
    coSo = document.getElementById('cosoSelect').value;
    // Xử lý reload vị trí kho cho từng mã nếu cần
}
// Xác thực mã NV, show tên
async function onManvBlur() {
    const manv = document.getElementById('manvInput').value.trim();
    if (!manv) { document.getElementById('tennvDisplay').innerText = ""; return; }
    const { data, error } = await supabase.from('dmnhanvien').select('tennv').eq('manv', manv).maybeSingle();

    if (!data) { document.getElementById('tennvDisplay').innerText = "Mã không hợp lệ!"; return; }
    maNhanVien = manv; tenNhanVien = data.tennv;
    document.getElementById('tennvDisplay').innerHTML = "Tên: <b style='color:blue'>" + data.tennv + "</b>";
}

// Nhập mã + size vào ô input, enter sẽ đẩy xuống textarea
function onMaspInputEnter(e) {
    if (e.key === "Enter") {
        const val = e.target.value.trim();
        if (!val) return;
        document.getElementById('danhsachTextarea').value += (document.getElementById('danhsachTextarea').value ? '\n' : '') + val;
        e.target.value = "";
        document.getElementById('danhsachTextarea').focus();
    }
}

// Hỗ trợ tab để xuống dòng trong textarea
function onTextareaTab(e) {
    if (e.key === "Tab") {
        e.preventDefault();
        const ta = e.target, start = ta.selectionStart, end = ta.selectionEnd;
        ta.value = ta.value.substring(0, start) + "\t" + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = start + 1;
    }
}

// Phân tích dữ liệu nhập nhanh: từ textarea => mảng kiểm kho [{masp, size0, size38...}]
function parseTextareaData() {
    const lines = document.getElementById('danhsachTextarea').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const validSizes = ['0', '38', '39', '40', '41', '42', '43', '44', '45'];
    const itemsMap = {}; // Dùng object để gộp mã trùng
    let current = null;
    for (let line of lines) {
        if (/^[\w\-]+$/i.test(line) && !validSizes.includes(line)) { // là mã sp
            if (current) {
                // Gộp mã nếu đã có
                const key = current.masp.toUpperCase();
                if (!itemsMap[key]) {
                    itemsMap[key] = { ...current };
                } else {
                    SIZE_FIELDS.forEach(s => itemsMap[key]['size' + s] += current['size' + s]);
                }
            }
            current = { masp: line.toUpperCase() };
            SIZE_FIELDS.forEach(s => current['size' + s] = 0);
        } else if (validSizes.includes(line)) {
            if (current) current['size' + line] = (current['size' + line] || 0) + 1;
        }
    }
    if (current) {
        const key = current.masp.toUpperCase();
        if (!itemsMap[key]) {
            itemsMap[key] = { ...current };
        } else {
            SIZE_FIELDS.forEach(s => itemsMap[key]['size' + s] += current['size' + s]);
        }
    }
    // Convert object về mảng và tính tổng
    const items = Object.values(itemsMap);
    items.forEach(it => { it.tong = SIZE_FIELDS.reduce((sum, s) => sum + (Number(it['size' + s]) || 0), 0); });
    return items;
}



// Xử lý nút "Kiểm tra" – đẩy dữ liệu từ textarea xuống bảng kiểm kho
async function onKiemTra() {
    const rows = parseTextareaData();
    if (!rows.length) { showMsg("Chưa có dữ liệu kiểm!"); return; }

    const masps = rows.map(r => r.masp);
    const { data: vitri } = await supabase
        .from('dmhanghoa')
        .select('masp, vitrikho1, vitrikho2')
        .in('masp', masps);

    const map = Object.fromEntries((vitri || []).map(d => [
        d.masp, (coSo === 'cs1' ? d.vitrikho1 : d.vitrikho2) || ''
    ]));

    rows.forEach(r => r.vitri = map[r.masp] || '');
    createHotTable(rows);
    showMsg("");
}

// Gọi 1 RPC để lấy XNT cho nhiều mã cùng lúc
async function fetchXNTBatch(masps) {
    // chuẩn hóa: UPPER + loại trùng + loại rỗng
    const cleaned = Array.from(
        new Set((masps || []).map(x => String(x || '').trim().toUpperCase()).filter(Boolean))
    );
    if (!cleaned.length) return {};

    // Supabase có giới hạn payload → chia lô (ví dụ 200 mã/lô)
    const chunkSize = 200;
    const chunks = [];
    for (let i = 0; i < cleaned.length; i += chunkSize) {
        chunks.push(cleaned.slice(i, i + chunkSize));
    }

    const map = {};
    for (const c of chunks) {
        const { data, error } = await supabase.rpc('timkiemhanghoa_multi', { masps: c });
        if (error) {
            console.error('timkiemhanghoa_multi error:', error);
            continue;
        }
        (data || []).forEach(r => {
            const key = r.masp.toUpperCase();
            if (!map[key]) map[key] = [];
            map[key].push(r); // r = { masp, size, nhapmua, xuatban, toncuoi, ban_cs1, ton_cs1, ton_cs2, ban_cs2 }
        });
    }
    return map;
}


// Thêm mới dòng rỗng
function onThemMoi() {
    if (!hot) return;
    hot.alter('insert_row');
}

window.xoaKiemTon = function () {
    if (!hot) return;
    let data = hot.getSourceData();
    // Xóa tất cả các dòng có type là 'Tồn hệ thống' HOẶC 'Chênh lệch'
    // hoặc ghi chú là 'tồn hệ thống' HOẶC 'nhập / xuất'
    data = data.filter(
        r =>
            (r.type !== "Tồn hệ thống" && r.type !== "Chênh lệch") &&
            (r.ghichu !== "tồn hệ thống" && r.ghichu !== "nhập / xuất")
    );
    createHotTable(data);
};


document.getElementById('btnXoaKiemTon').onclick = window.xoaKiemTon;


// Nút "Kiểm tồn" – chèn dòng tồn kho hệ thống dưới từng mã đang kiểm
async function onKiemTon() {
    window.xoaKiemTon();
    if (!hot) return;
    const rows = hot.getSourceData().filter(r => r.masp);
    const masps = rows.map(r => r.masp);
    const xntMap = await fetchXNTBatch(masps, 10); // chạy song song 10 luồng

    const resultRows = [];
    for (const row of rows) {
        resultRows.push({ ...row, type: "Kiểm thực tế" });

        const xnt = xntMap[row.masp] || [];
        const rowSys = { masp: row.masp, type: "Tồn hệ thống", vitri: row.vitri, ghichu: "tồn hệ thống" };
        SIZE_FIELDS.forEach(s => rowSys['size' + s] = 0);
        for (const item of xnt) {
            if (item.size && SIZE_FIELDS.includes(item.size)) {
                const field = (coSo === 'cs1') ? 'ton_cs1' : 'ton_cs2';
                rowSys['size' + item.size] = Number(item[field] || 0);
            }
        }
        rowSys.tong = SIZE_FIELDS.reduce((sum, s) => sum + (Number(rowSys['size' + s]) || 0), 0);
        resultRows.push(rowSys);

        const rowDiff = { masp: row.masp, type: "Chênh lệch", vitri: row.vitri, ghichu: "nhập / xuất" };
        SIZE_FIELDS.forEach(s => rowDiff['size' + s] =
            (Number(row['size' + s]) || 0) - (Number(rowSys['size' + s]) || 0));
        rowDiff.tong = SIZE_FIELDS.reduce((sum, s) => sum + (Number(rowDiff['size' + s]) || 0), 0);
        resultRows.push(rowDiff);
    }
    createHotTable(resultRows, true);
    showMsg("Đã chèn dòng tồn kho hệ thống và dòng nhập/xuất để đối chiếu.");
}



// Hàm hiển thị bảng kiểm kho với Handsontable
function createHotTable(data) {
    const container = document.getElementById('hotTable');
    if (hot) {
        hot.suspendRender();
        hot.loadData(data);
        hot.resumeRender();
        return;
    }
    hot = new Handsontable(container, {
        data,
        columns: COLS,
        colHeaders: COL_HEADERS,
        rowHeaders: true,
        width: "100%",
        height: 340,
        // Tắt auto đo kích thước để nhanh hơn với bảng lớn:
        autoColumnSize: false,
        autoRowSize: false,
        licenseKey: 'non-commercial-and-evaluation',
        manualRowMove: true,
        manualColumnResize: true,
        contextMenu: true,
        beforeChange(changes, source) {
            if (!changes) return;
            for (let i = 0; i < changes.length; i++) {
                const [row, prop, oldVal, newVal] = changes[i];
                if (prop === 'masp' && newVal != null) {
                    changes[i][3] = normMasp(newVal); // ép in hoa trước khi ghi vào bảng
                }
            }
        },
        beforePaste(data, coords) {
            // Nếu user paste bảng có cột masp là cột đầu tiên của hot (prop 'masp')
            // thì ép in hoa cột đó ngay lúc paste.
            // data: mảng 2D của clipboard
            const startColProp = this.colToProp(coords[0].startCol);
            for (let r = 0; r < data.length; r++) {
                for (let c = 0; c < data[r].length; c++) {
                    const prop = this.colToProp(coords[0].startCol + c);
                    if (prop === 'masp') data[r][c] = normMasp(data[r][c]);
                }
            }
        },
        cells(row, col) { /* giữ nguyên logic tô màu */ }
        // afterChange: dùng phiên bản đã tối ưu ở trên
    });
}


// Xử lý nút Lưu
async function onLuu() {
    // Nếu chưa có dòng tồn hệ thống, mới chạy kiểm tồn
    const hasSys = hot.getSourceData().some(r => r.type === "Tồn hệ thống");
    if (!hasSys) await onKiemTon();

    if (!hot) return;

    // Phân quyền
    const manv = document.getElementById('manvInput').value.trim();
    const { data: nvinfo } = await supabase.from('dmnhanvien')
        .select('sua_hoadon, tennv').eq('manv', manv).maybeSingle();
    if (!nvinfo) { showMsg("Mã nhân viên không hợp lệ!"); return; }
    const canEdit = nvinfo.sua_hoadon === true;

    // Dòng kiểm thực tế để ghi vào bảng kiểm kho
    const allRows = hot.getSourceData();
    const rowsKiem = allRows.filter(r => r.masp && (!r.type || r.type === "Kiểm thực tế"));
    if (!rowsKiem.length) { showMsg("Chưa có dữ liệu kiểm kho thực tế để lưu!"); return; }

    // Số chứng từ kiểm kho (bảng kiemkho)
    const sohd_kiem = await genSohd('kiemkhocs' + (coSo === 'cs1' ? '1' : '2'));
    const ngaygio = new Date().toISOString();

    // Insert bảng kiểm kho (1 lần)
    const insertKiemKho = rowsKiem.map(row => ({
        sohd: sohd_kiem,
        masp: row.masp,
        size0: Number(row.size0) || 0,
        size38: Number(row.size38) || 0,
        size39: Number(row.size39) || 0,
        size40: Number(row.size40) || 0,
        size41: Number(row.size41) || 0,
        size42: Number(row.size42) || 0,
        size43: Number(row.size43) || 0,
        size44: Number(row.size44) || 0,
        size45: Number(row.size45) || 0,
        tennv: nvinfo.tennv,
        user_id: null,
        ngaygio, diadiem: coSo,
        ghichu: row.ghichu || '',
        created_at: ngaygio
    }));
    let errorMsg = "";
    const resKiem = await supabase.from('kiemkho').insert(insertKiemKho);
    if (resKiem.error) errorMsg += "- Lỗi lưu kiểm kho: " + resKiem.error.message + "<br>";

    // Nếu không có quyền thì kết thúc tại đây
    if (!canEdit) {
        showMsg((errorMsg ? errorMsg : "✔️ Lưu dữ liệu kiểm kho xong!") + "<br><span style='color:red'>Trang sẽ tự tải lại…</span>");
        setTimeout(() => location.reload(), 2000);
        return;
    }

    // Tạo mảng chênh lệch để phát sinh phiếu theo LÔ
    const ctNhap = []; // {sohd, masp, size, soluong, diadiem, ngay, created_at}
    const ctXuat = [];
    for (const rK of rowsKiem) {
        const rTon = allRows.find(x => x.masp === rK.masp && x.type === "Tồn hệ thống");
        if (!rTon) continue;
        for (const sz of SIZE_FIELDS) {
            const k = Number(rK['size' + sz] || 0);
            const t = Number(rTon['size' + sz] || 0);
            if (k > t) ctNhap.push({ masp: rK.masp, size: sz, soluong: k - t });
            if (k < t) ctXuat.push({ masp: rK.masp, size: sz, soluong: t - k });
        }
    }

    // Hàm tạo header nếu cần
    async function ensureHeader(sohd, loaihd) {
        const { data: ex } = await supabase.from('hoadon_banle')
            .select('sohd').eq('sohd', sohd).maybeSingle();
        if (!ex) {
            await supabase.from('hoadon_banle').insert([{
                sohd, loaihd, diadiem: coSo, ngay: ngaygio, manv
            }]);
        }
    }

    // NHẬP KIỂM (1 header + 1 insert lô)
    if (ctNhap.length) {
        const sohd_nhap = await genSohd('nhapkiem' + coSo);
        await ensureHeader(sohd_nhap, 'nhapkiem' + coSo);
        const rows = ctNhap.map(x => ({
            sohd: sohd_nhap, masp: x.masp, size: x.size,
            soluong: x.soluong, diadiem: coSo, ngay: ngaygio, created_at: ngaygio
        }));
        const res = await supabase.from('ct_hoadon_banle').insert(rows);
        if (res.error) errorMsg += "- Lỗi tạo chi tiết NHẬP kiểm: " + res.error.message + "<br>";
    }

    // XUẤT KIỂM (1 header + 1 insert lô)
    if (ctXuat.length) {
        const sohd_xuat = await genSohd('xuatkiem' + coSo);
        await ensureHeader(sohd_xuat, 'xuatkiem' + coSo);
        const rows = ctXuat.map(x => ({
            sohd: sohd_xuat, masp: x.masp, size: x.size,
            soluong: x.soluong, diadiem: coSo, ngay: ngaygio, created_at: ngaygio
        }));
        const res = await supabase.from('ct_hoadon_banle').insert(rows);
        if (res.error) errorMsg += "- Lỗi tạo chi tiết XUẤT kiểm: " + res.error.message + "<br>";
    }

    // Ghi 'đã kiểm' nếu phát sinh phiếu thành công (không có lỗi insert lô)
    if (!errorMsg) {
        await supabase.from('kiemkho').update({ ghichu: 'đã kiểm' }).eq('sohd', sohd_kiem);
    }

    showMsg((errorMsg ? errorMsg : "✔️ Lưu & phát sinh phiếu xong!") + "<br><span style='color:red'>Trang sẽ tự tải lại…</span>");
    setTimeout(() => location.reload(), 2000);
}


// Sinh số chứng từ tự động theo loại phiếu
// Sinh số chứng từ đồng bộ với bảng sochungtu (dùng trường loai và so_hientai)
// genSohd trong kiemkho.js
async function genSohd(loaihd) {
    const { data, error } = await supabase.rpc('next_sochungtu', { p_loai: loaihd });
    if (error || !data) throw new Error('Không lấy được số chứng từ: ' + loaihd);
    return data;
}



// Tạo phiếu kiểm kho (nhập/xuất)
// Thay thế toàn bộ hàm này vào đúng vị trí cũ
async function taoPhieuKiem(loai, coSo, masp, sz, sl, sohd, manv, ngaygio) {
    let loaihd = (loai === 'nhap' ? 'nhapkiem' : 'xuatkiem') + coSo;
    // Tạo hóa đơn nếu chưa tồn tại
    let { data: exists } = await supabase.from('hoadon_banle').select('sohd').eq('sohd', sohd);
    if (!exists || !exists.length) {
        await supabase.from('hoadon_banle').insert([{
            sohd, loaihd, diadiem: coSo, ngay: ngaygio, manv
        }]);
    }
    // Ghi từng size riêng biệt (chỉ ghi khi sl khác 0)
    if (sl !== 0) {
        await supabase.from('ct_hoadon_banle').insert([{
            sohd: sohd,
            masp: masp,
            size: sz,
            soluong: sl,
            diadiem: coSo,
            ngay: ngaygio,
            created_at: ngaygio
        }]);
    }
}


// Hiển thị thông báo trạng thái
function showMsg(msg) {
    document.getElementById('statusMsg').innerHTML = msg;
}
