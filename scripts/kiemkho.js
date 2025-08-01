import { supabase } from "./supabaseClient.js";

let hot; // Handsontable instance
let maNhanVien = '';
let tenNhanVien = '';
let coSo = 'cs1'; // cs1 hoặc cs2

const SIZE_FIELDS = ['0','38','39','40','41','42','43','44','45'];
const COLS = [
    {data: 'masp', type: 'text', title: 'Mã SP', width: 100},
    {data: 'tong', type: 'numeric', title: 'Tổng', readOnly: true, width: 48},
    ...SIZE_FIELDS.map(s=>({data: 'size'+s, type:'numeric', title: s, width: 40})),
    {data: 'vitri', type: 'text', title: 'Vị trí', width: 70, readOnly: true},
    {data: 'ghichu', type: 'text', title: 'Ghi chú', width: 90}
];
const COL_HEADERS = ['Mã SP', 'Tổng', ...SIZE_FIELDS, 'Vị trí', 'Ghi chú'];

window.onload = function() {
    initUI();
};

function initUI() {
    document.getElementById('cosoSelect').addEventListener('change', onChangeCoSo);
    document.getElementById('manvInput').addEventListener('blur', onManvBlur);
    document.getElementById('kiemtraBtn').onclick = onKiemTra;
    document.getElementById('themmoiBtn').onclick = onThemMoi;
    document.getElementById('kiemtontBtn').onclick = onKiemTon;
    document.getElementById('luuBtn').onclick = onLuu;
    document.getElementById('maspInput').addEventListener('keydown', onMaspInputEnter);
    document.getElementById('danhsachTextarea').addEventListener('keydown', onTextareaTab);
    // Tạo handsontable trống
    createHotTable([]);
    document.getElementById('popupSearchInput').addEventListener('input', onPopupInput);
}

// Popup tìm kiếm dùng chung
window.openPopupSearch = async function(type) {
    window.currentPopupType = type;
    const popup = document.getElementById('popupSearch');
    const input = document.getElementById('popupSearchInput');
    popup.style.display = 'block';
    input.value = "";
    input.focus();
    searchPopup("");
};
window.closePopupSearch = function() {
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
        <div onclick="selectPopupValue('${type}', '${row[field].replace(/'/g, "\\'")}', '${row.tensp||row.tennv||""}')">
            <b>${row[field]}</b>${row.tensp ? " - " + row.tensp : (row.tennv ? " - " + row.tennv : "")}
        </div>
    `).join('');
}
window.selectPopupValue = function(type, value, value2) {
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
    const { data, error } = await supabase.from('dmnhanvien').select('tennv,quyen').eq('manv', manv).maybeSingle();
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
    const items = [];
    let current = null;
    for (let line of lines) {
        if (/^[\w\-]+$/i.test(line)) { // là mã sp
            if (current) items.push(current);
            current = { masp: line.toUpperCase() };
            SIZE_FIELDS.forEach(s=>current['size'+s]=0);
        } else if (/^(0|3[8-9]|4[0-5])$/.test(line)) { // là size
            if (current) current['size'+line] = (current['size'+line]||0) + 1;
        }
    }
    if (current) items.push(current);
    // Tính tổng
    items.forEach(it => { it.tong = SIZE_FIELDS.reduce((sum,s)=>sum+(Number(it['size'+s])||0),0); });
    return items;
}

// Xử lý nút "Kiểm tra" – đẩy dữ liệu từ textarea xuống bảng kiểm kho
async function onKiemTra() {
    const rows = parseTextareaData();
    if (!rows.length) { showMsg("Chưa có dữ liệu kiểm!"); return; }
    // Lấy vị trí từng mã
    for (let row of rows) {
        const { data } = await supabase.from('dmhanghoa').select(coSo==='cs1'?'vitrikho1':'vitrikho2').eq('masp', row.masp).maybeSingle();
        row.vitri = data ? (coSo==='cs1'?data.vitrikho1:data.vitrikho2) : "";
    }
    createHotTable(rows);
    showMsg("");
}

// Thêm mới dòng rỗng
function onThemMoi() {
    if (!hot) return;
    hot.alter('insert_row');
}

// Nút "Kiểm tồn" – chèn dòng tồn kho hệ thống dưới từng mã đang kiểm
async function onKiemTon() {
    if (!hot) return;
    const rows = hot.getSourceData().filter(r=>r.masp);
    // Lấy tồn kho từng mã
    const resultRows = [];
    for (let row of rows) {
        resultRows.push({...row, type:"Kiểm thực tế"});
        // Gọi function SQL lấy tồn kho hệ thống từng size
        const { data: xnt, error } = await supabase.rpc("timkiemhanghoa", { masp_query: row.masp });
        // Mapping tồn kho theo từng size, tìm đúng cơ sở
        let rowSys = { masp: row.masp, type: "Tồn hệ thống", vitri: row.vitri };
        SIZE_FIELDS.forEach(s => rowSys['size'+s]=0);
        if (xnt && xnt.length) {
            for (const item of xnt) {
                if (item.size && SIZE_FIELDS.includes(item.size)) {
                    // Tồn kho đúng cơ sở
                    let field = (coSo==='cs1') ? 'ton_cs1' : 'ton_cs2';
                    rowSys['size'+item.size] = Number(item[field]||0);
                }
            }
            rowSys.tong = SIZE_FIELDS.reduce((sum,s)=>sum+(Number(rowSys['size'+s])||0),0);
        }
        resultRows.push(rowSys);
    }
    createHotTable(resultRows, true);
    showMsg("Đã chèn dòng tồn kho hệ thống để đối chiếu.");
}

// Hàm hiển thị bảng kiểm kho với Handsontable
function createHotTable(data, readonlySysRows=false) {
    const container = document.getElementById('hotTable');
    if (hot) { hot.destroy(); }
    hot = new Handsontable(container, {
        data: data,
        columns: COLS,
        colHeaders: COL_HEADERS,
        rowHeaders: true,
        width: "100%",
        height: 340,
        licenseKey: 'non-commercial-and-evaluation',
        manualRowMove: true,
        manualColumnResize: true,
        contextMenu: true,
        cells: function(row, col) {
            // Disable edit dòng tồn hệ thống
            const d = this.instance.getSourceDataAtRow(row);
            if (readonlySysRows && d && d.type==="Tồn hệ thống") return { readOnly: true, className: "bg-tontt" };
            if (d && d.type==="Tồn hệ thống") return { className: "bg-tontt" };
        },
        afterChange: function(changes, source) {
            // Tự động tính Tổng
            if (!changes) return;
            changes.forEach(([rowIdx, prop, oldV, newV]) => {
                if (SIZE_FIELDS.map(s=>'size'+s).includes(prop)) {
                    const d = hot.getSourceDataAtRow(rowIdx);
                    d.tong = SIZE_FIELDS.reduce((sum,s)=>sum+(Number(d['size'+s])||0),0);
                    hot.render();
                }
            });
        },
        rowHeaderWidth: 36
    });
}

// Xử lý nút Lưu
async function onLuu() {
    if (!hot) return;
    // Phân quyền user (kiểm tra trên dmnhanvien, quyền = "sua" thì mới được phát sinh phiếu)
    const manv = document.getElementById('manvInput').value.trim();
    const { data: nvinfo } = await supabase.from('dmnhanvien').select('quyen,tennv').eq('manv', manv).maybeSingle();
    if (!nvinfo) { showMsg("Mã nhân viên không hợp lệ!"); return; }
    const canEdit = nvinfo.quyen && nvinfo.quyen.includes('sua');

    // Lấy dữ liệu kiểm kho thực tế (bỏ dòng tồn hệ thống)
    let rows = hot.getSourceData().filter(r=>r.masp && (!r.type || r.type==="Kiểm thực tế"));
    if (!rows.length) { showMsg("Chưa có dữ liệu kiểm kho thực tế để lưu!"); return; }
    // Sinh số chứng từ kiểm kho
    let sohd_kiem = await genSohd('kiemkhocs'+(coSo==='cs1'?'1':'2'));
    let ngaygio = new Date().toISOString();

    // Ghi vào bảng kiểm kho
    const insertKiemKho = rows.map(row => ({
        sohd: sohd_kiem,
        masp: row.masp,
        size0: Number(row.size0)||0,
        size38: Number(row.size38)||0,
        size39: Number(row.size39)||0,
        size40: Number(row.size40)||0,
        size41: Number(row.size41)||0,
        size42: Number(row.size42)||0,
        size43: Number(row.size43)||0,
        size44: Number(row.size44)||0,
        size45: Number(row.size45)||0,
        tennv: nvinfo.tennv,
        user_id: null, // bạn bổ sung user_id nếu dùng Supabase Auth
        ngaygio,
        diadiem: coSo,
        ghichu: row.ghichu||'',
        created_at: ngaygio
    }));
    let errorMsg = "";
    let res = await supabase.from('kiemkho').insert(insertKiemKho);
    if (res.error) errorMsg += "- Lỗi lưu kiểm kho: " + res.error.message + "<br>";

    // Nếu user có quyền chỉnh sửa thì phát sinh phiếu xuất/nhập kiểm kho
    if (canEdit) {
        // Lấy lại dòng tồn hệ thống để so sánh
        let allRows = hot.getSourceData();
        for (let i=0;i<allRows.length;i+=2) {
            const rowKiem = allRows[i], rowTon = allRows[i+1];
            if (!rowKiem || !rowTon || rowKiem.masp!==rowTon.masp) continue;
            for (let sz of SIZE_FIELDS) {
                const k = Number(rowKiem['size'+sz]||0), t = Number(rowTon['size'+sz]||0);
                if (k>t) {
                    // Phát sinh phiếu nhập kiểm kho
                    let sohd_nhap = await genSohd('nhapkiem'+coSo);
                    await taoPhieuKiem('nhap', coSo, rowKiem.masp, sz, k-t, sohd_nhap, manv, ngaygio);
                }
                if (k<t) {
                    // Phát sinh phiếu xuất kiểm kho
                    let sohd_xuat = await genSohd('xuatkiem'+coSo);
                    await taoPhieuKiem('xuat', coSo, rowKiem.masp, sz, t-k, sohd_xuat, manv, ngaygio);
                }
            }
        }
    }
    showMsg(errorMsg ? errorMsg : "✔️ Lưu dữ liệu thành công!");
}

// Sinh số chứng từ tự động theo loại phiếu
async function genSohd(loaihd) {
    let prefix = loaihd + '_';
    let { data } = await supabase.from('sochungtu').select('sohd').ilike('sohd', prefix+'%').order('sohd', { ascending: false }).limit(1);
    let num = 1;
    if (data && data.length && /\d+$/.test(data[0].sohd)) {
        num = parseInt(data[0].sohd.match(/\d+$/)[0],10) + 1;
    }
    let sohd = prefix + String(num).padStart(5, '0');
    // Lưu lại số chứng từ vừa tạo
    await supabase.from('sochungtu').insert([{ sohd, loai: loaihd, created_at: new Date().toISOString() }]);
    return sohd;
}

// Tạo phiếu kiểm kho (nhập/xuất)
async function taoPhieuKiem(loai, coSo, masp, sz, sl, sohd, manv, ngaygio) {
    let loaihd = (loai==='nhap'?'nhapkiem':'xuatkiem') + coSo;
    // Ghi hoadon_banle
    let r1 = await supabase.from('hoadon_banle').insert([{
        sohd, loaihd, diadiem: coSo, ngay: ngaygio, manv
    }]);
    // Ghi ct_hoadon_banle
    let r2 = await supabase.from('ct_hoadon_banle').insert([{
        sohd, masp, size: sz, soluong: sl, ngay: ngaygio
    }]);
    // Có thể bổ sung log/error nếu cần
}

// Hiển thị thông báo trạng thái
function showMsg(msg) {
    document.getElementById('statusMsg').innerHTML = msg;
}
