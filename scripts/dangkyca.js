// dangkyca.js - Nhân viên đăng ký ca + login auth + lọc khoảng ngày

import { supabase } from "./supabaseClient.js";
import { khoiTaoDangNhapDungChung } from "./authModule.js";

// --- DOM element ---
const manvInput = document.getElementById("manv");
const diadiemSelect = document.getElementById("diadiem");
const ngayInput = document.getElementById("ngay");
const gioBdInput = document.getElementById("gio_bat_dau");
const gioKtInput = document.getElementById("gio_ket_thuc");
const lyDoInput = document.getElementById("ly_do");
const btnDangKy = document.getElementById("btn-dang-ky");
const tbodyLich = document.getElementById("tbody-lich");
const msgEl = document.getElementById("msg");

const fromDateInput = document.getElementById("from_date");
const toDateInput = document.getElementById("to_date");
const btnTaiDangKy = document.getElementById("btn-tai-dangky");
const dlManv = document.getElementById("dl-manv");
const loaiDangKySelect = document.getElementById("loai_dang_ky");

const wrapCaGoc = document.getElementById("wrap-ca-goc");
const caGocSelect = document.getElementById("ca_goc");

const wrapTuGio = document.getElementById("wrap-tu-gio");
const wrapDenGio = document.getElementById("wrap-den-gio");
const tuGioInput = document.getElementById("tu_gio");
const denGioInput = document.getElementById("den_gio");

const chkXemTatCa = document.getElementById("chk-xem-tatca");


const summaryHourlyEl = document.getElementById("summary-hourly");
const summaryTitleExtra = document.getElementById("summary-title-extra");


let daGanEvent = false; // tránh gắn event nhiều lần nếu onLoginSuccess được gọi lại 
let currentManv = null; // mã NV lấy từ login
let isAdmin = false; // admin hoặc có quyền đặc biệt (is_admin / sua_hoadon)

// --- Tiện ích chung ---

async function loadNhanVienDatalist() {
    if (!isAdmin) return;
    if (!dlManv) return;

    const manvActor = currentManv;
    if (!manvActor) return;

    const { data, error } = await supabase.rpc("rpc_dmnhanvien_list", {
        p_manv_actor: manvActor
    });

    if (error) {
        console.warn("Không load được danh sách nhân viên:", error);
        return;
    }

    dlManv.innerHTML = "";
    (data || []).forEach((r) => {
        const opt = document.createElement("option");
        opt.value = r.out_manv;
        opt.label = `${r.out_manv} - ${r.out_tennv || ""}`;
        dlManv.appendChild(opt);
    });
}


function formatISODate(d) {
    return d.toISOString().slice(0, 10);
}

function getDefaultRange7Days() {
    const today = new Date();

    // 3 ngày trước hôm nay
    const threeDaysAgo = new Date(
        today.getTime() - 1 * 24 * 60 * 60 * 1000
    );

    // 7 ngày sau hôm nay
    const sevenDaysAfter = new Date(
        today.getTime() + 1 * 24 * 60 * 60 * 1000
    );

    return {
        fromDate: formatISODate(threeDaysAgo),
        toDate: formatISODate(sevenDaysAfter)
    };
}


function setTodayAndDefaultRange() {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    ngayInput.value = formatISODate(tomorrow);

    const { fromDate, toDate } = getDefaultRange7Days();
    if (!fromDateInput.value) fromDateInput.value = fromDate;
    if (!toDateInput.value) toDateInput.value = toDate;
}

function setMsg(text, isError = false) {
    msgEl.textContent = text || "";
    msgEl.style.color = isError ? "#c62828" : "#555";
}
async function kiemTraQuyenAdmin() {
    try {
        const manv = currentManv;
        if (!manv) {
            isAdmin = false;
            return;
        }

        const { data, error } = await supabase
            .from("dmnhanvien")
            .select("is_admin, sua_hoadon")
            .eq("manv", manv)
            .maybeSingle();

        if (error) {
            console.warn("Không kiểm tra được quyền admin:", error);
            isAdmin = false;
            return;
        }

        isAdmin = !!(data?.is_admin || data?.sua_hoadon);
    } catch (e) {
        console.warn("Lỗi kiemTraQuyenAdmin:", e);
        isAdmin = false;
    }
}

function validateDangKyUI(keepMsg = false) {
    const now = new Date();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const selectedDate = new Date(ngayInput.value);
    selectedDate.setHours(0, 0, 0, 0);

    // Chặn ngày quá khứ cho tất cả
    if (selectedDate < today) {
        btnDangKy.style.display = "none";
        if (!keepMsg) setMsg("Không được đăng ký cho ngày quá khứ.", true);
        return;
    }

    btnDangKy.style.display = "";

    // ✅ Quan trọng: đừng tự xóa msg nếu đang muốn giữ msg (ví dụ lỗi RPC)
    if (!keepMsg) setMsg("");
}


// Chuyển "HH:MM" -> phút
function timeToMinutes(hhmm) {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
}

// --- Quy chế: cho phép đăng ký nhưng đánh dấu VI PHẠM ---
// Vi phạm nếu: (1) đăng ký ca NGÀY HÔM NAY; hoặc (2) sau 19:00 mà đăng ký ca NGÀY MAI
function isDangKyViPham(ngayISO) {
    if (!ngayISO) return false;
    const now = new Date();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const selected = new Date(ngayISO);
    selected.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const isToday = selected.getTime() === today.getTime();
    const isTomorrow = selected.getTime() === tomorrow.getTime();

    const after19 = now.getHours() >= 19;
    return isToday || (after19 && isTomorrow);
}

function appendLyDoTag(lydoRaw, tag) {
    const lydo = (lydoRaw || "").trim();
    if (!tag) return lydo;

    // Tránh trùng tag
    const reTag = new RegExp(`(^|\\s|\\||,)${tag}(\\s|\\||,|$)`, "i");
    if (reTag.test(lydo)) return lydo;

    if (!lydo) return tag;
    return `${tag} | ${lydo}`;
}


// --- Tự điền mã NV sau khi đăng nhập và khóa ô ---
function autoFillManvFromLogin(thongTinNguoiDung) {
    try {
        const info =
            thongTinNguoiDung ||
            window.thongTinNguoiDung ||
            window.thongTinDangNhap ||
            window.currentUserInfo ||
            null;

        if (!info) {
            console.warn("Không có thông tin đăng nhập để lấy manv");
            return;
        }

        const manv =
            info.manv ||
            info.ma_nv ||
            info.maNhanVien ||
            info.ma_nhan_vien ||
            null;

        if (manv) {
            currentManv = String(manv).trim(); // lưu lại mã NV đăng nhập
            manvInput.value = currentManv;

            // tạm thời khóa theo mặc định; sẽ được mở lại nếu là admin ở onLoginSuccess()
            manvInput.readOnly = true;
            manvInput.disabled = true;
            manvInput.title = "Mã nhân viên được lấy từ tài khoản đăng nhập.";

        } else {
            console.warn(
                "Không tìm được trường manv trong thongTinNguoiDung:",
                info
            );
        }
    } catch (e) {
        console.warn("Lỗi khi autoFillManvFromLogin:", e);
    }
}
function getLoaiDangKy() {
    return String(loaiDangKySelect?.value || "CA_LAM").trim().toUpperCase();
}

async function loadCaGocForNgay() {
    const loai = getLoaiDangKy();
    if (loai !== "DI_MUON" && loai !== "VE_SOM") return;

    const manv = (isAdmin ? String(manvInput.value || "").trim() : currentManv || "").trim();
    const ngay = ngayInput.value;
    const diadiem = diadiemSelect.value;

    caGocSelect.innerHTML = `<option value="">-- Chọn ca --</option>`;

    if (!manv || !ngay || !diadiem) return;

    // lấy các ca CA_LAM của chính NV trong ngày để chọn
    const { data, error } = await supabase
        .from("lichlam_dangky")
        .select("id, gio_bat_dau, gio_ket_thuc, trang_thai")
        .eq("manv", manv)
        .eq("diadiem", diadiem)
        .eq("ngay", ngay)
        .eq("loai_dang_ky", "CA_LAM")
        .order("gio_bat_dau", { ascending: true });

    if (error) {
        console.warn("loadCaGocForNgay error:", error);
        return;
    }

    (data || []).forEach(r => {
        const opt = document.createElement("option");
        opt.value = `${r.gio_bat_dau}|${r.gio_ket_thuc}`;
        opt.textContent = `${r.gio_bat_dau?.slice(0, 5)} - ${r.gio_ket_thuc?.slice(0, 5)} (${r.trang_thai})`;
        caGocSelect.appendChild(opt);
    });
}

function applyLoaiDangKyUI() {
    const loai = getLoaiDangKy();

    // reset hiển thị
    wrapCaGoc.style.display = "none";
    wrapTuGio.style.display = "none";
    wrapDenGio.style.display = "none";

    // mặc định cho nhập giờ ca
    gioBdInput.disabled = false;
    gioKtInput.disabled = false;

    if (loai === "NGHI_CA_NGAY") {
        gioBdInput.value = "00:00";
        gioKtInput.value = "23:59";
        gioBdInput.disabled = true;
        gioKtInput.disabled = true;
    }

    if (loai === "NGHI_THEO_GIO") {
        wrapTuGio.style.display = "";
        wrapDenGio.style.display = "";
    }

    if (loai === "DI_MUON") {
        wrapCaGoc.style.display = "";
        wrapDenGio.style.display = ""; // den_gio = giờ vào dự kiến
        gioBdInput.disabled = true;
        gioKtInput.disabled = true;
    }

    if (loai === "VE_SOM") {
        wrapCaGoc.style.display = "";
        wrapTuGio.style.display = ""; // tu_gio = giờ về dự kiến
        gioBdInput.disabled = true;
        gioKtInput.disabled = true;
    }
}


// --- Load đăng ký theo mã NV + khoảng ngày ---

// --- Load đăng ký theo mã NV + khoảng ngày (hoặc xem toàn bộ theo cơ sở) ---
async function loadMyRequests(manvOverride = null, keepMsg = false) {
    const manv = (manvOverride || currentManv || "").trim();

    // Nếu không xác định được manv thì vẫn cho xem “toàn bộ” nếu user tick xem tất cả?
    // Nhưng để an toàn theo logic cũ của bạn: bắt buộc login để xem.
    if (!manv) {
        const colspan = 8;
        tbodyLich.innerHTML = `<tr><td colspan="${colspan}">Vui lòng đăng nhập để xem lịch đăng ký ca.</td></tr>`;
        setMsg("Không xác định được Mã NV từ phiên đăng nhập. Vui lòng đăng nhập lại.", true);
        return;
    }

    let fromDate = fromDateInput.value;
    let toDate = toDateInput.value;

    // Nếu chưa chọn thì tự set mặc định 7 ngày gần đây
    if (!fromDate || !toDate) {
        const def = getDefaultRange7Days();
        if (!fromDate) {
            fromDate = def.fromDate;
            fromDateInput.value = fromDate;
        }
        if (!toDate) {
            toDate = def.toDate;
            toDateInput.value = toDate;
        }
    }

    if (fromDate > toDate) {
        setMsg("'Từ ngày' phải nhỏ hơn hoặc bằng 'Đến ngày'.", true);
        return;
    }

    if (!keepMsg) setMsg("Đang tải đăng ký...");

    // ======= QUERY MỚI (theo hướng dẫn) =======
    let q = supabase
        .from("lichlam_dangky")
        .select("*")
        .gte("ngay", fromDate)
        .lte("ngay", toDate)
        .order("ngay", { ascending: true })
        .order("gio_bat_dau", { ascending: true });

    const xemTatCa = !!chkXemTatCa?.checked;

    if (!xemTatCa) {
        q = q.eq("manv", manv);
    } else {
        // xem toàn bộ theo cơ sở đang chọn (để né trùng & lấp chỗ trống đúng cơ sở)
        const dia = diadiemSelect.value;
        if (dia) q = q.eq("diadiem", dia);
    }

    const { data, error } = await q;
    // ======= /QUERY MỚI =======

    const colspan = 8; // bạn đã nâng bảng lên 8 cột: Ngày, Cơ sở, Mã NV, Loại, Giờ, Trạng thái, Lý do, Ghi chú QL

    if (error) {
        console.error("Lỗi load lichlam_dangky:", error);
        tbodyLich.innerHTML = `<tr><td colspan="${colspan}" style="color:red;">Lỗi tải dữ liệu.</td></tr>`;
        setMsg("Lỗi tải dữ liệu.", true);
        return;
    }

    if (!data || data.length === 0) {
        tbodyLich.innerHTML = `<tr><td colspan="${colspan}">Không có đăng ký nào trong khoảng ngày đã chọn.</td></tr>`;
        if (!keepMsg) setMsg("");
        return;
    }

    // helper format time: 'HH:MM:SS' -> 'HH:MM'
    const t5 = (t) => (t ? String(t).slice(0, 5) : "");

    // helper hiển thị giờ theo loại
    function buildGioText(row) {
        const loai = String(row.loai_dang_ky || "CA_LAM").toUpperCase();

        if (loai === "NGHI_THEO_GIO") {
            // ưu tiên tu/den; nếu null thì fallback gio_bat_dau/ket_thuc
            const tu = t5(row.tu_gio) || t5(row.gio_bat_dau);
            const den = t5(row.den_gio) || t5(row.gio_ket_thuc);
            return `${tu} - ${den}`;
        }

        if (loai === "DI_MUON") {
            // quy ước: gio_bat_dau = giờ ca, den_gio = giờ vào dự kiến
            const caBd = t5(row.gio_bat_dau);
            const vao = t5(row.den_gio);
            return `${caBd} → ${vao}`;
        }

        if (loai === "VE_SOM") {
            // quy ước: tu_gio = giờ về dự kiến, gio_ket_thuc = giờ ca
            const ve = t5(row.tu_gio);
            const caKt = t5(row.gio_ket_thuc);
            return `${ve} → ${caKt}`;
        }

        if (loai === "NGHI_CA_NGAY") {
            return "Cả ngày";
        }

        // CA_LAM hoặc loại khác
        return `${t5(row.gio_bat_dau)} - ${t5(row.gio_ket_thuc)}`;
    }

    tbodyLich.innerHTML = "";

    data.forEach((row) => {
        const tr = document.createElement("tr");

        // 1) Ngày
        const tdNgay = document.createElement("td");
        tdNgay.textContent = row.ngay || "";
        tr.appendChild(tdNgay);

        // 2) Cơ sở
        const tdDia = document.createElement("td");
        tdDia.textContent = row.diadiem || "";
        tr.appendChild(tdDia);

        // 3) Mã NV
        const tdManv = document.createElement("td");
        tdManv.textContent = row.manv || "";
        tr.appendChild(tdManv);

        // 4) Loại
        const tdLoai = document.createElement("td");
        tdLoai.textContent = row.loai_dang_ky || "CA_LAM";
        tr.appendChild(tdLoai);

        // 5) Giờ
        const tdGio = document.createElement("td");
        tdGio.textContent = buildGioText(row);
        tr.appendChild(tdGio);

        // 6) Trạng thái
        const tdTrangThai = document.createElement("td");
        tdTrangThai.textContent = row.trang_thai || "";
        tdTrangThai.className = `status-${row.trang_thai}`;
        tr.appendChild(tdTrangThai);

        // 7) Lý do (ẩn lý do người khác nếu xem tất cả và không phải admin)
        const tdLyDo = document.createElement("td");
        const isOther = xemTatCa && String(row.manv || "").trim() !== manv;
        if (isOther && !isAdmin) {
            tdLyDo.textContent = ""; // ẩn
        } else {
            tdLyDo.textContent = row.ly_do || "";
        }
        tr.appendChild(tdLyDo);

        // 8) Ghi chú quản lý
        const tdNote = document.createElement("td");
        tdNote.textContent = row.ghi_chu_admin || "";
        tr.appendChild(tdNote);

        tbodyLich.appendChild(tr);
    });

    if (!keepMsg) setMsg("");
}

async function loadHourlySummary() {
    const ngay = ngayInput.value;
    const diadiem = diadiemSelect.value;

    if (!ngay || !diadiem) {
        summaryHourlyDiv.textContent = "Chưa chọn ngày hoặc cơ sở.";
        return;
    }

    summaryTitleExtra.textContent = `(${diadiem.toUpperCase()} – ${ngay})`;
    summaryHourlyDiv.textContent = "Đang tải tổng hợp...";

    const { data, error } = await supabase
        .from("lichlam_dangky")
        .select("manv, gio_bat_dau, gio_ket_thuc")
        .eq("ngay", ngay)
        .eq("diadiem", diadiem)
        .eq("loai_dang_ky", "CA_LAM")
        .in("trang_thai", ["CHO_DUYET", "DA_DUYET"])
        .order("gio_bat_dau", { ascending: true });

    if (error) {
        console.error(error);
        summaryHourlyDiv.textContent = "Lỗi tải dữ liệu tổng hợp.";
        return;
    }

    if (!data || data.length === 0) {
        summaryHourlyDiv.textContent = "Chưa có ca làm nào.";
        return;
    }

    // ====== TỔNG HỢP THEO KHUNG GIỜ ======
    const map = {}; // { "07:30-12:00": [HOAN, QUYNH...] }

    data.forEach(r => {
        const key = `${r.gio_bat_dau.slice(0, 5)} - ${r.gio_ket_thuc.slice(0, 5)}`;
        if (!map[key]) map[key] = [];
        map[key].push(r.manv);
    });

    let out = "";
    Object.keys(map).forEach(k => {
        const list = map[k];
        out += `${k} : ${list.length} người (${list.join(", ")})\n`;
    });

    summaryHourlyDiv.textContent = out.trim();
}


// --- Gửi đăng ký ca ---
async function handleDangKy() {
    // Bắt buộc phải có mã NV từ login
    if (!currentManv) {
        setMsg(
            "Không xác định được Mã NV từ phiên đăng nhập. Vui lòng đăng nhập lại.",
            true
        );
        return;
    }

    const loai_dang_ky = getLoaiDangKy();
    const tu_gio = (tuGioInput?.value || "") || null;
    const den_gio = (denGioInput?.value || "") || null;


    const manv = currentManv;
    const diadiem = diadiemSelect.value;
    const ngay = ngayInput.value;
    const gio_bd = gioBdInput.value;
    const gio_kt = gioKtInput.value;
    const ly_do = lyDoInput.value.trim();
    let ly_do_final = ly_do;

    // ✅ Nếu vi phạm quy chế (hôm nay / sau 19:00 đăng ký ngày mai) thì cảnh báo & tự gắn DK_ADMIN
    if (loai_dang_ky === "CA_LAM" && isDangKyViPham(ngay)) {
        const ok = window.confirm(
            "Việc đăng ký ca của bạn đang vi phạm quy chế đăng ký ca nên bạn sẽ bị trừ 20k tiền thưởng.\n\nBạn có muốn tiếp tục đăng ký không?"
        );
        if (!ok) return;
        ly_do_final = appendLyDoTag(ly_do_final, "-20.000");
    }


    if (!manv || !ngay || !gio_bd || !gio_kt || !diadiem) {
        setMsg(
            "Vui lòng nhập đủ Cơ sở, Ngày, Giờ bắt đầu/kết thúc.",
            true
        );
        return;
    }

    if (gio_bd >= gio_kt) {
        setMsg("Giờ bắt đầu phải nhỏ hơn giờ kết thúc.", true);
        return;
    }

    setMsg("Đang gửi đăng ký...");

    const actor = currentManv;
    const target = isAdmin ? String(manvInput.value || "").trim() : currentManv;

    if (!target) {
        setMsg("Vui lòng nhập mã nhân viên cần đăng ký.", true);
        return;
    }

    if ((loai_dang_ky === "DI_MUON" || loai_dang_ky === "VE_SOM") && !caGocSelect.value) {
        setMsg("Xin muộn/về sớm: vui lòng chọn ca gốc.", true);
        return;
    }

    if (loai_dang_ky === "NGHI_THEO_GIO") {
        if (!tu_gio || !den_gio) {
            setMsg("Nghỉ theo giờ: vui lòng nhập Từ giờ và Đến giờ.", true);
            return;
        }
        if (tu_gio >= den_gio) {
            setMsg("Nghỉ theo giờ: Từ giờ phải nhỏ hơn Đến giờ.", true);
            return;
        }
    }

    if (loai_dang_ky === "DI_MUON") {
        if (!den_gio) {
            setMsg("Xin đi muộn: vui lòng nhập Đến giờ (giờ vào dự kiến).", true);
            return;
        }
    }

    if (loai_dang_ky === "VE_SOM") {
        if (!tu_gio) {
            setMsg("Xin về sớm: vui lòng nhập Từ giờ (giờ về dự kiến).", true);
            return;
        }
    }


    const { data, error } = await supabase.rpc("rpc_lichlam_dangky_create_v4", {
        p_manv_actor: actor,
        p_manv_target: target,
        p_diadiem: diadiem,
        p_ngay: ngay,

        p_loai_dang_ky: loai_dang_ky,
        p_gio_bat_dau: gio_bd,
        p_gio_ket_thuc: gio_kt,

        p_tu_gio: tu_gio,
        p_den_gio: den_gio,

        p_ly_do: ly_do_final
    });



    if (error) {
        console.error("RPC error:", error);
        setMsg(error?.message || "Lỗi hệ thống khi gửi đăng ký.", true);
        return;
    }

    if (!data || data.ok !== true) {
        setMsg(data?.message || "Không đăng ký được ca. Vui lòng thử lại.", true);
        validateDangKyUI(true); // ✅ giữ msg lỗi, không bị xóa
        return;
    }

    setMsg(data.message, false);
    await loadMyRequests(target, true); // ✅ giờ sẽ không ghi đè msg nữa
    validateDangKyUI(true);             // ✅ giữ msg thành công

    loadHourlySummaryForRegisterPage();

}

function toMinutes2(t) {
  if (!t) return null;
  const s = String(t).slice(0, 5); // HH:MM
  const [hh, mm] = s.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}
function minutesToHHMM2(m) {
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
function addActive2(map, manv) {
  map.set(manv, (map.get(manv) || 0) + 1);
}
function removeActive2(map, manv) {
  const v = (map.get(manv) || 0) - 1;
  if (v <= 0) map.delete(manv);
  else map.set(manv, v);
}
function buildTimelineForRows2(rows) {
  const events = new Map();   // minute -> {starts:[], ends:[]}
  const points = new Set();

  for (const r of rows) {
    const sMin = toMinutes2(r.gio_bat_dau);
    const eMin = toMinutes2(r.gio_ket_thuc);
    if (sMin == null || eMin == null) continue;
    if (eMin <= sMin) continue;

    points.add(sMin);
    points.add(eMin);

    if (!events.has(sMin)) events.set(sMin, { starts: [], ends: [] });
    if (!events.has(eMin)) events.set(eMin, { starts: [], ends: [] });

    events.get(sMin).starts.push(r.manv);
    events.get(eMin).ends.push(r.manv);
  }

  const sorted = Array.from(points).sort((a, b) => a - b);
  if (sorted.length < 2) return [];

  const active = new Map(); // manv -> count
  const lines = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const t = sorted[i];
    const next = sorted[i + 1];

    // kết thúc tại t -> bỏ trước; bắt đầu tại t -> thêm sau
    const ev = events.get(t);
    if (ev?.ends?.length) ev.ends.forEach(m => removeActive2(active, m));
    if (ev?.starts?.length) ev.starts.forEach(m => addActive2(active, m));

    const manvs = Array.from(active.keys()).sort();
    lines.push({
      from: minutesToHHMM2(t),
      to: minutesToHHMM2(next),
      count: manvs.length,
      manvs
    });
  }

  return lines;
}

async function loadHourlySummaryForRegisterPage() {
  if (!summaryHourlyEl) return;

  const ngay = ngayInput.value;
  const dia = diadiemSelect.value; // nếu rỗng => lấy cả 2 cơ sở

  if (!ngay) {
    summaryHourlyEl.textContent = "Chưa chọn ngày.";
    if (summaryTitleExtra) summaryTitleExtra.textContent = "";
    return;
  }

  if (summaryTitleExtra) {
    summaryTitleExtra.textContent = dia ? `(${dia.toUpperCase()} – ${ngay})` : `(CS1+CS2 – ${ngay})`;
  }
  summaryHourlyEl.textContent = "Đang tải tổng hợp...";

  let q = supabase
    .from("lichlam_dangky")
    .select("manv, diadiem, gio_bat_dau, gio_ket_thuc, trang_thai, loai_dang_ky")
    .eq("ngay", ngay)
    .eq("loai_dang_ky", "CA_LAM")
    .in("trang_thai", ["CHO_DUYET", "DA_DUYET"])   // ✅ đây là điểm FIX thiếu người
    .order("diadiem", { ascending: true })
    .order("gio_bat_dau", { ascending: true });

  if (dia) q = q.eq("diadiem", dia);

  const { data, error } = await q;
  if (error) {
    console.error(error);
    summaryHourlyEl.textContent = "Lỗi tải tổng hợp.";
    return;
  }

  const rows = data || [];
  if (rows.length === 0) {
    summaryHourlyEl.textContent = "Chưa có đăng ký CA_LAM.";
    return;
  }

  // nếu không chọn cơ sở -> hiển thị cả 2 cơ sở
  const sites = dia ? [dia] : ["cs1", "cs2"];
  let out = "";

  for (const site of sites) {
    const siteRows = rows.filter(r => r.diadiem === site);
    out += `${site}:\n`;

    if (siteRows.length === 0) {
      out += `  (không có dữ liệu)\n\n`;
      continue;
    }

    const lines = buildTimelineForRows2(siteRows);
    for (const ln of lines) {
      const txt =
        ln.count === 0
          ? `${ln.from} - ${ln.to} : 0 người`
          : `${ln.from} - ${ln.to} : ${ln.count} người (${ln.manvs.join(", ")})`;
      out += `  ${txt}\n`;
    }
    out += `\n`;
  }

  summaryHourlyEl.textContent = out.trim();
}


// --- Gắn event sau khi login thành công ---
function attachEventsOnce() {
    if (daGanEvent) return;
    daGanEvent = true;

    btnDangKy.addEventListener("click", (e) => {
        e.preventDefault();
        handleDangKy();
    });

    btnTaiDangKy.addEventListener("click", (e) => {
        e.preventDefault();
        loadMyRequests();
    });

    loaiDangKySelect.addEventListener("change", async () => {
        applyLoaiDangKyUI();
        await loadCaGocForNgay();
    });

    ngayInput.addEventListener("change", async () => {
        validateDangKyUI();
        await loadCaGocForNgay();
    });

    diadiemSelect.addEventListener("change", async () => {
        await loadCaGocForNgay();
    });

    manvInput.addEventListener("change", async () => {
        // admin đổi target -> load lại ca gốc
        if (isAdmin) await loadCaGocForNgay();
    });

    caGocSelect.addEventListener("change", () => {
        const v = String(caGocSelect.value || "");
        if (!v) return;
        const [bd, kt] = v.split("|");
        if (bd && kt) {
            gioBdInput.value = bd.slice(0, 5);
            gioKtInput.value = kt.slice(0, 5);
        }
    });

    chkXemTatCa.addEventListener("change", () => {
        loadMyRequests(); // reload theo mode cá nhân / toàn bộ
    });

    ngayInput.addEventListener("change", loadHourlySummaryForRegisterPage);
diadiemSelect.addEventListener("change", loadHourlySummaryForRegisterPage);
btnTaiDangKy?.addEventListener("click", () => setTimeout(loadHourlySummaryForRegisterPage, 150));


    ngayInput.addEventListener("change", loadHourlySummary);
    diadiemSelect.addEventListener("change", loadHourlySummary);


}

// --- onLoginSuccess từ authModule ---
async function onLoginSuccess(thongTinNguoiDung) {
    // Lưu global giống trang duyệt ca để chỗ khác dùng nếu cần
    window.thongTinNguoiDung = thongTinNguoiDung;

    // Tự set ngày hôm nay + khoảng 7 ngày mặc định
    setTodayAndDefaultRange();

    // Lấy manv từ thông tin đăng nhập, điền vào form và khóa lại
    autoFillManvFromLogin(thongTinNguoiDung);

    // Gắn event các nút (chỉ gắn 1 lần)
    attachEventsOnce();

    // Tải đăng ký mặc định 7 ngày gần đây cho đúng manv
    loadMyRequests();
    // kiểm tra quyền admin
    await kiemTraQuyenAdmin();
    await loadNhanVienDatalist();

    if (isAdmin) {
        // admin có thể nhập mã NV để đăng ký hộ
        manvInput.disabled = false;
        manvInput.readOnly = false;
        manvInput.title = "Admin có thể nhập mã NV để đăng ký hộ.";
        setMsg("Chế độ Admin: có thể đăng ký hộ nhân viên khác.");
    }

    validateDangKyUI();
    // Admin: nếu đang để mặc định ngày mai thì chuyển về hôm nay để đăng ký nhanh
    const todayISO = formatISODate(new Date());
    const tomorrowISO = formatISODate(new Date(Date.now() + 24 * 60 * 60 * 1000));
    if (!ngayInput.value || ngayInput.value === tomorrowISO) {
        ngayInput.value = todayISO;
    }
    loadHourlySummary();

}

// --- Khởi tạo login giống trang up ảnh nhanh ---
document.addEventListener("DOMContentLoaded", () => {
    khoiTaoDangNhapDungChung({
        loginContainerId: "login-container",
        appContainerId: "app-container",
        macDinhDiaDiem: "cs1", // chỉ config cho module login, không ảnh hưởng select cơ sở ở form
        tuDongKhoaCoSo: false, // để người dùng TỰ chọn cơ sở khi đăng ký ca
        loginApiPath: "/api/login-cs1",
        onLoginSuccess
    });
});


