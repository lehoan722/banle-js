import { supabase } from "./supabaseClient.js";
import { khoiTaoDangNhapDungChung } from "./authModule.js";

let hot; // Handsontable instance
let maNhanVien = '';
let tenNhanVien = '';
let coSo = window.coSo || 'cs1'; // Lấy từ HTML truyền vào

// ====== AUTH STATE (theo chuẩn authModule.js) ======
let AUTH = {
  isLoggedIn: false,
  isAdmin: false,
  canEdit: false,
  manv: "",
  tennv: "",
  diadiem: coSo,
  userId: null
};

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function lockAppUI(isLocked) {
  const ids = ["kiemtraBtn", "themmoiBtn", "kiemtontBtn", "btnXoaKiemTon", "luuBtn"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !!isLocked;
  });

  const txt = document.getElementById("maspInput");
  if (txt) txt.disabled = !!isLocked;

  const manvInput = document.getElementById("manvInput");
  if (manvInput && isLocked) {
    // trước login: cho phép nhập tay để test (nếu bạn muốn)
    // nhưng mặc định khóa vì sẽ lấy từ authModule
    manvInput.disabled = true;
  }
}


//let coSo = 'cs1'; // cs1 hoặc cs2

const SIZE_FIELDS = ['0', '38', '39', '40', '41', '42', '43', '44', '45'];

// Cho phép dấu . và / trong mã
const MASP_ALLOWED_REGEX = /^[A-Z0-9.\-\/]+$/;

// Chuẩn hóa 1 dòng: cắt hậu tố _SIZE (nếu có) và đưa về UPPER
function normalizeMaspLine(line) {
  let s = (line || "").toUpperCase().trim();
  // Nếu có dạng NG200_40 hoặc 5572-K/XANH_39 thì cắt phần sau dấu _
  const idx = s.lastIndexOf("_");
  if (idx > 0) {
    const tail = s.substring(idx + 1);
    if (SIZE_FIELDS.includes(tail)) {
      s = s.substring(0, idx);
    }
  }
  return s;
}

// Dòng này có phải là "mã sp" hợp lệ? (không phải size rời, và ký tự nằm trong whitelist)
function isMaspLine(line) {
  const s = normalizeMaspLine(line);
  return !SIZE_FIELDS.includes(s) && MASP_ALLOWED_REGEX.test(s);
}

const COLS = [
    { data: 'masp', type: 'text', title: 'Mã SP', width: 100 },
    { data: 'tong', type: 'numeric', title: 'Tổng', readOnly: true, width: 48 },
    ...SIZE_FIELDS.map(s => ({ data: 'size' + s, type: 'numeric', title: s, width: 40 })),
    { data: 'vitri', type: 'text', title: 'Vị trí', width: 70, readOnly: true },
    { data: 'ghichu', type: 'text', title: 'Ghi chú', width: 90 }
];
const COL_HEADERS = ['Mã SP', 'Tổng', ...SIZE_FIELDS, 'Vị trí', 'Ghi chú'];

document.addEventListener("DOMContentLoaded", () => {
    initUI();
    lockAppUI(true);
    initAuth();
});

function uniqueMasps(rows) {
    const s = new Set();
    for (const r of rows) {
        const m = (r.masp || '').toUpperCase().trim();
        if (m) s.add(m);
    }
    return Array.from(s);
}

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

async function initAuth() {
  // coSo: cố định theo trang (cs1 hoặc cs2) -> khóa dropdown cơ sở trong form login
  const branch = (window.coSo || coSo || "cs1").toString().toLowerCase();

  khoiTaoDangNhapDungChung({
    loginContainerId: "login-container",
    appContainerId: "app-container",
    macDinhDiaDiem: branch,
    tuDongKhoaCoSo: true,
    loginApiPath: `/api/login-${branch}`,
    onLoginSuccess: async (nhanvienLike, context) => {
      await onAuthSuccess(nhanvienLike, context);
    }
  });
}

async function onAuthSuccess(nhanvienLike, context) {
  AUTH.isLoggedIn = true;
  AUTH.isAdmin = (nhanvienLike && nhanvienLike.is_admin === true) || localStorage.getItem("is_admin") === "true";
  AUTH.manv = String(nhanvienLike?.manv || localStorage.getItem("manv") || "").trim().toUpperCase();
  AUTH.tennv = String(nhanvienLike?.tennv || localStorage.getItem("tennv") || "").trim();
  AUTH.diadiem = String(context?.diadiem || localStorage.getItem("diadiem") || window.coSo || coSo || "cs1").toLowerCase();
  AUTH.canEdit =
    AUTH.isAdmin ||
    nhanvienLike?.sua_hoadon === true ||
    localStorage.getItem("quyen_sua_hoadon") === "true";

  // lấy user id nếu có
  try {
    const { data } = await window.supabase?.auth?.getUser?.();
    AUTH.userId = data?.user?.id || null;
  } catch (e) {
    AUTH.userId = null;
  }

  // đồng bộ coSo theo session
  coSo = AUTH.diadiem;
  window.coSo = coSo;

  // update UI
  const manvInput = document.getElementById("manvInput");
  if (manvInput) {
    manvInput.value = AUTH.manv;
    manvInput.disabled = true;
  }

  const tennvDisplay = document.getElementById("tennvDisplay");
  if (tennvDisplay) {
    const badge = AUTH.isAdmin ? ' <span style="color:#d32f2f">(ADMIN)</span>' : "";
    tennvDisplay.innerHTML = `Tên: <b style="color:blue">${escapeHtml(AUTH.tennv || AUTH.manv)}</b>${badge}`;
  }

  const cosoSelect = document.getElementById("cosoSelect");
  if (cosoSelect) {
    cosoSelect.value = coSo;
    cosoSelect.disabled = true;
  }

  lockAppUI(false);
  showMsg(AUTH.isAdmin ? "✅ Đăng nhập ADMIN: có quyền phát sinh phiếu nhập/xuất kiểm kho." : "✅ Đăng nhập thành công.");
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
    const manvInputEl = document.getElementById("manvInput");
    if (!manvInputEl || manvInputEl.disabled || AUTH.isLoggedIn) return;
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
// Phân tích dữ liệu nhập nhanh: từ textarea => mảng kiểm kho [{masp, size0, size38...}]
function parseTextareaData() {
  const lines = document
    .getElementById('danhsachTextarea')
    .value.split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  const itemsMap = {}; // gộp mã trùng
  let current = null;

  for (let raw of lines) {
    const line = raw.toUpperCase().trim();

    if (isMaspLine(line)) {
      // là mã sp: chuẩn hóa (cắt _SIZE nếu có)
      const masp = normalizeMaspLine(line);

      // kết sổ mã trước (nếu có)
      if (current) {
        const key = current.masp;
        if (!itemsMap[key]) itemsMap[key] = { ...current };
        else SIZE_FIELDS.forEach(s => itemsMap[key]['size' + s] += current['size' + s]);
      }

      current = { masp };
      SIZE_FIELDS.forEach(s => current['size' + s] = 0);
      continue;
    }

    // nếu đúng là 1 dòng size (0, 38..45) thì cộng số lượng
    if (SIZE_FIELDS.includes(line)) {
      if (current) current['size' + line] = (current['size' + line] || 0) + 1;
    }
    // các dòng khác bỏ qua (ghi sai quy ước)
  }

  // dồn nốt mã cuối
  if (current) {
    const key = current.masp;
    if (!itemsMap[key]) itemsMap[key] = { ...current };
    else SIZE_FIELDS.forEach(s => itemsMap[key]['size' + s] += current['size' + s]);
  }

  const items = Object.values(itemsMap);
  items.forEach(it => {
    it.tong = SIZE_FIELDS.reduce((sum, s) => sum + (Number(it['size' + s]) || 0), 0);
  });
  return items;
}

// Xử lý nút "Kiểm tra" – đẩy dữ liệu từ textarea xuống bảng kiểm kho
async function onKiemTra() {
    const rows = parseTextareaData();
    if (!rows.length) { showMsg("Chưa có dữ liệu kiểm!"); return; }
    // Lấy vị trí từng mã
    for (let row of rows) {
        const { data } = await supabase.from('dmhanghoa').select(coSo === 'cs1' ? 'vitrikho1' : 'vitrikho2').eq('masp', row.masp).maybeSingle();
        row.vitri = data ? (coSo === 'cs1' ? data.vitrikho1 : data.vitrikho2) : "";
    }
    createHotTable(rows);
    showMsg("");
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
    const resultRows = [];
    for (let row of rows) {
        resultRows.push({ ...row, type: "Kiểm thực tế" });
        // 1. Lấy tồn kho hệ thống
        const { data: xnt, error } = await supabase.rpc("kiemton", { masp_query: row.masp });
        let rowSys = { masp: row.masp, type: "Tồn hệ thống", vitri: row.vitri, ghichu: "tồn hệ thống" };
        SIZE_FIELDS.forEach(s => rowSys['size' + s] = 0);
        if (xnt && xnt.length) {
            for (const item of xnt) {
                if (item.size && SIZE_FIELDS.includes(item.size)) {
                    let field = (coSo === 'cs1') ? 'ton_cs1' : 'ton_cs2';
                    rowSys['size' + item.size] = Number(item[field] || 0);
                }
            }
        }
        rowSys.tong = SIZE_FIELDS.reduce((sum, s) => sum + (Number(rowSys['size' + s]) || 0), 0);
        resultRows.push(rowSys);

        // 2. Chèn dòng nhập/xuất: kiểm thực tế - tồn hệ thống
        let rowDiff = { masp: row.masp, type: "Chênh lệch", vitri: row.vitri, ghichu: "nhập / xuất" };
        SIZE_FIELDS.forEach(s => {
            const val = (Number(row['size' + s]) || 0) - (Number(rowSys['size' + s]) || 0);
            rowDiff['size' + s] = val;
        });
        rowDiff.tong = SIZE_FIELDS.reduce((sum, s) => sum + (Number(rowDiff['size' + s]) || 0), 0);
        resultRows.push(rowDiff);
    }
    createHotTable(resultRows, true);
    showMsg("Đã chèn dòng tồn kho hệ thống và dòng nhập/xuất để đối chiếu.");
}


// Hàm hiển thị bảng kiểm kho với Handsontable
function createHotTable(data, readonlySysRows = false) {
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
        cells: function (row, col) {
            const d = this.instance.getSourceDataAtRow(row);
            if (d && d.type === "Tồn hệ thống")
                return { readOnly: true, className: "kiemton-hethong" };
            if (d && d.type === "Chênh lệch")
                return { readOnly: true, className: "kiemton-chenhlech" };
        },

        afterChange: function (changes, source) {
            // Tự động tính Tổng
            if (!changes) return;
            changes.forEach(([rowIdx, prop, oldV, newV]) => {
                if (SIZE_FIELDS.map(s => 'size' + s).includes(prop)) {
                    const d = hot.getSourceDataAtRow(rowIdx);
                    d.tong = SIZE_FIELDS.reduce((sum, s) => sum + (Number(d['size' + s]) || 0), 0);
                    hot.render();
                }
            });
        },
        rowHeaderWidth: 36
    });
}

// Xử lý nút Lưu
async function onLuu() {
    if (!AUTH.isLoggedIn) {
        showMsg("❌ Vui lòng đăng nhập trước khi lưu.");
        return;
    }

    // 1) Luôn chạy "Kiểm tồn" để đảm bảo có đủ dòng Tồn hệ thống / Chênh lệch
    await onKiemTon();
    if (!hot) {
        showMsg("⚠️ Chưa có dữ liệu để lưu.");
        return;
    }

    const manv = AUTH.manv;
    const tennv = AUTH.tennv || manv;
    const canEdit = AUTH.canEdit;
    const ngaygio = new Date().toISOString();

    const allRows = hot.getSourceData();
    const rowKiemList = allRows.filter(r => r && r.masp && (!r.type || r.type === "Kiểm thực tế"));

    if (!rowKiemList.length) {
        showMsg("⚠️ Chưa có dữ liệu kiểm kho thực tế để lưu!");
        return;
    }

    // 2) Sinh số chứng từ kiểm kho (loại: kiemkhocs1 / kiemkhocs2)
    const loaiKiem = "kiemkhocs" + (coSo === "cs1" ? "1" : "2");
    let sohd_kiem;
    try {
        sohd_kiem = await genSohd(loaiKiem);
    } catch (e) {
        console.error(e);
        // genSohd đã showMsg chi tiết
        return;
    }

    // 3) Ghi log kiểm kho vào bảng "kiemkho"
    // LƯU Ý: KHÔNG gửi cột "chenhlech" vì bảng kiemkho của bạn không có cột này => gây lỗi PGRST204
    const insertKiemKho = rowKiemList.map(row => ({
        sohd: sohd_kiem,
        masp: (row.masp || "").toString().trim(),
        size0: Number(row.size0) || 0,
        size38: Number(row.size38) || 0,
        size39: Number(row.size39) || 0,
        size40: Number(row.size40) || 0,
        size41: Number(row.size41) || 0,
        size42: Number(row.size42) || 0,
        size43: Number(row.size43) || 0,
        size44: Number(row.size44) || 0,
        size45: Number(row.size45) || 0,
        tennv: tennv,
        user_id: AUTH.userId,
        ngaygio,
        diadiem: coSo,
        ghichu: row.ghichu || "",
        created_at: ngaygio
    }));

    let errorMsg = "";
    let taoPhieuThanhCong = true;

    const res = await supabase.from("kiemkho").insert(insertKiemKho);
    if (res.error) {
        console.error(res.error);
        showMsg("❌ Lưu kiểm kho thất bại: " + res.error.message);
        return;
    }

    // 4) Nếu có quyền (ADMIN hoặc được cấp quyền) thì phát sinh phiếu nhập/xuất điều chỉnh
    if (canEdit) {
        let sohd_nhap = null;
        let sohd_xuat = null;

        for (const rowKiem of rowKiemList) {
            const rowTon = allRows.find(r => r && r.masp === rowKiem.masp && r.type === "Tồn hệ thống");
            if (!rowTon) continue;

            for (const sz of SIZE_FIELDS) {
                const k = Number(rowKiem["size" + sz] || 0);
                const t = Number(rowTon["size" + sz] || 0);
                if (k === t) continue;

                try {
                    if (k > t) {
                        if (!sohd_nhap) sohd_nhap = await genSohd("nhapkiem" + coSo);
                        await taoPhieuKiem("nhap", coSo, rowKiem.masp, sz, (k - t), sohd_nhap, manv, ngaygio);
                    } else {
                        if (!sohd_xuat) sohd_xuat = await genSohd("xuatkiem" + coSo);
                        await taoPhieuKiem("xuat", coSo, rowKiem.masp, sz, (t - k), sohd_xuat, manv, ngaygio);
                    }
                } catch (err) {
                    taoPhieuThanhCong = false;
                    errorMsg += `- Lỗi tạo phiếu (${rowKiem.masp}_${sz}): ${(err?.message || err)}<br>`;
                }
            }
        }

        if (taoPhieuThanhCong) {
            // Đánh dấu tất cả dòng kiểm kho của chứng từ này là "đã kiểm"
            await supabase.from("kiemkho").update({ ghichu: "đã kiểm" }).eq("sohd", sohd_kiem);
        }
    }

    // 5) ĐÁNH DẤU quản lý kích cỡ cho các mã vừa kiểm (giữ nguyên logic cũ)
    try {
        const maspToMark = uniqueMasps(rowKiemList);
        const chunks = [];
        const CHUNK_SIZE = 500;
        for (let i = 0; i < maspToMark.length; i += CHUNK_SIZE) {
            chunks.push(maspToMark.slice(i, i + CHUNK_SIZE));
        }

        const nowIso = new Date().toISOString();
        for (const c of chunks) {
            const { error } = await supabase
                .from("dmhanghoa")
                .update({ quanlykichco: true, ngaysua: nowIso })
                .in("masp", c);

            if (error) {
                errorMsg += "- Lỗi cập nhật 'quanlykichco' trong dmhanghoa: " + error.message + "<br>";
            }
        }
    } catch (e) {
        errorMsg += "- Lỗi đánh dấu 'quanlykichco': " + (e.message || e) + "<br>";
    }

    if (!canEdit) {
        showMsg("✅ Đã lưu dữ liệu kiểm kho. (Tài khoản này không có quyền phát sinh phiếu điều chỉnh)");
        return;
    }

    showMsg(errorMsg ? errorMsg : "✅ Đã lưu kiểm kho" + (canEdit ? " và đã xử lý phiếu điều chỉnh (nếu có chênh lệch)." : "."));
}



// Sinh số chứng từ tự động theo loại phiếu
// Sinh số chứng từ đồng bộ với bảng sochungtu (dùng trường loai và so_hientai)
async function genSohd(loaihd) {
    // B1: Lấy số hiện tại
    let { data, error } = await supabase
        .from('sochungtu')
        .select('so_hientai')
        .eq('loai', loaihd)
        .maybeSingle();
    if (error || !data) {
        showMsg("❌ Không lấy được số chứng từ hiện tại cho loại: " + loaihd);
        throw new Error("Không lấy được số chứng từ hiện tại");
    }
    let num = (data.so_hientai || 0) + 1;

    // B2: Update số mới vào bảng (nhớ kiểm tra lỗi cập nhật)
    let { error: updateError } = await supabase
        .from('sochungtu')
        .update({ so_hientai: num })
        .eq('loai', loaihd);
    if (updateError) {
        showMsg("❌ Lỗi cập nhật số chứng từ mới: " + updateError.message);
        throw new Error("Không cập nhật được số chứng từ mới");
    }

    // B3: Ghép số hóa đơn chuẩn
    let sohd = loaihd + '_' + String(num).padStart(5, '0');
    return sohd;
}


// Tạo phiếu kiểm kho (nhập/xuất)
// Thay thế toàn bộ hàm này vào đúng vị trí cũ
// Tạo phiếu kiểm kho (nhập/xuất)
async function taoPhieuKiem(loai, coSo, masp, sz, sl, sohd, manv, ngaygio) {
    const loaihd = (loai === "nhap" ? "nhapkiem" : "xuatkiem") + coSo;

    // 1) Tạo header hóa đơn nếu chưa có
    const { data: exists, error: exErr } = await supabase
        .from("hoadon_banle")
        .select("sohd")
        .eq("sohd", sohd)
        .limit(1);

    if (exErr) throw new Error(exErr.message);

    if (!exists || !exists.length) {
        const { error: insHdErr } = await supabase.from("hoadon_banle").insert([{
            sohd,
            loaihd,
            diadiem: coSo,
            ngay: ngaygio,
            manv
        }]);
        if (insHdErr) throw new Error(insHdErr.message);
    }

    // 2) Ghi chi tiết (chỉ ghi khi sl khác 0)
    if (!sl || Number(sl) === 0) return;

    const { error: insCtErr } = await supabase.from("ct_hoadon_banle").insert([{
        sohd,
        masp,
        size: sz,
        soluong: Number(sl),
        diadiem: coSo,
        ngay: ngaygio,
        created_at: ngaygio
    }]);

    if (insCtErr) throw new Error(insCtErr.message);
}


// Hiển thị thông báo trạng thái
function showMsg(msg) {
    document.getElementById('statusMsg').innerHTML = msg;
}
