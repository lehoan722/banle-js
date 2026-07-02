import { supabase } from "../../scripts/supabaseClient.js";

const SCHEMA = "cafe";

const el = {
    tuNgay: document.getElementById("tuNgay"),
    denNgay: document.getElementById("denNgay"),
    locSoHD: document.getElementById("locSoHD"),
    locNV: document.getElementById("locNV"),
    locBan: document.getElementById("locBan"),
    locKhuVuc: document.getElementById("locKhuVuc"),
    locMon: document.getElementById("locMon"),
    locTrangThaiMon: document.getElementById("locTrangThaiMon"),
    locTrangThaiHD: document.getElementById("locTrangThaiHD"),
    chiHoaDonCoMonHuy: document.getElementById("chiHoaDonCoMonHuy"),

    btnLoc: document.getElementById("btnLoc"),
    btnCopyTable: document.getElementById("btnCopyTable"),

    dsChiTiet: document.getElementById("dsChiTiet"),
    dsHoaDonCanhBao: document.getElementById("dsHoaDonCanhBao"),
    dsMonHayHuy: document.getElementById("dsMonHayHuy"),

    tongDongMon: document.getElementById("tongDongMon"),
    tongMonBinhThuong: document.getElementById("tongMonBinhThuong"),
    tongMonHuy: document.getElementById("tongMonHuy"),
    tongTienBinhThuong: document.getElementById("tongTienBinhThuong"),
    tongTienHuy: document.getElementById("tongTienHuy"),
    tongHoaDonCoHuy: document.getElementById("tongHoaDonCoHuy"),
};

let rowsCache = [];

function formatMoney(value) {
    return Number(value || 0).toLocaleString("vi-VN");
}

function formatDateTime(value) {
    if (!value) return "";
    const d = new Date(value);

    const datePart = new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(d);

    const timePart = new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(d);

    return `${datePart} ${timePart.replace(":", "h")}`;
}

function getToday() {
    return new Date().toISOString().slice(0, 10);
}

function getStartDate(dateValue) {
    if (!dateValue) return null;
    return new Date(`${dateValue}T00:00:00`).toISOString();
}

function getEndDatePlusOne(dateValue) {
    if (!dateValue) return null;
    const d = new Date(`${dateValue}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return d.toISOString();
}

function trangThaiMonText(value) {
    if (value === "binh_thuong") return "Bình thường";
    if (value === "da_huy") return "Đã hủy";
    return value || "";
}

function trangThaiHDText(value) {
    if (value === "dang_mo") return "Đang mở";
    if (value === "da_thanh_toan") return "Đã thanh toán";
    if (value === "da_huy") return "Đã hủy";
    return value || "";
}

async function taiBaoCao() {
    el.dsChiTiet.innerHTML = `<tr><td colspan="16">Đang tải dữ liệu...</td></tr>`;

    let query = supabase
        .schema(SCHEMA)
        .from("cafe_hoadon")
        .select(`
      id,
      so_hoadon,
      ban_id,
      khuvuc_id,
      trang_thai,
      gio_vao,
      gio_thanh_toan,
      ghi_chu,
      manv,
      tennv,
      cafe_ban:ban_id (
        ten_ban
      ),
      cafe_khuvuc:khuvuc_id (
        ten_khuvuc
      ),
      cafe_hoadon_ct (
        id,
        hoadon_id,
        ma_hang,
        ten_hang,
        so_luong,
        don_gia,
        thanh_tien,
        ghi_chu,
        trang_thai,
        created_at,
        updated_at,
        thu_tu
      ),
      
    `)
        .order("gio_vao", { ascending: false })
        .limit(1000);

    if (el.tuNgay.value) query = query.gte("gio_vao", getStartDate(el.tuNgay.value));
    if (el.denNgay.value) query = query.lt("gio_vao", getEndDatePlusOne(el.denNgay.value));

    const sohd = el.locSoHD.value.trim();
    const nv = el.locNV.value.trim();
    const trangThaiHD = el.locTrangThaiHD.value;

    if (sohd) query = query.ilike("so_hoadon", `%${sohd}%`);
    if (nv) query = query.or(`manv.ilike.%${nv}%,tennv.ilike.%${nv}%`);
    if (trangThaiHD) query = query.eq("trang_thai", trangThaiHD);

    const { data, error } = await query;

    const hoaDonIds = (data || []).map(x => x.id);

    let logMap = new Map();

    if (hoaDonIds.length) {

        const { data: logs } = await supabase
            .schema(SCHEMA)
            .from("cafe_hoadon_log")
            .select(`
      id,
      hoadon_id,
      hoadon_ct_id,
      hanh_dong,
      ghi_chu,
      created_at
    `)
            .in("hoadon_id", hoaDonIds);

        (logs || []).forEach(log => {

            const key = Number(log.hoadon_ct_id);

            if (!logMap.has(key))
                logMap.set(key, []);

            logMap.get(key).push(log);

        });

    }

    if (error) {
        console.error("Lỗi tải báo cáo chi tiết hóa đơn:", error);
        el.dsChiTiet.innerHTML = `<tr><td colspan="16">❌ ${error.message}</td></tr>`;
        return;
    }

    let detailRows = [];

    for (const hd of data || []) {
        const logs = [];

        for (const ct of hd.cafe_hoadon_ct || []) {
            const logGanNhat =

                (logMap.get(Number(ct.id)) || [])
                    .sort((a, b) =>
                        new Date(b.created_at) - new Date(a.created_at)
                    )[0];

            detailRows.push({
                hoadon_id: hd.id,
                so_hoadon: hd.so_hoadon,
                gio_vao: hd.gio_vao,
                gio_thanh_toan: hd.gio_thanh_toan,
                trang_thai_hd: hd.trang_thai,
                ghi_chu_hd: hd.ghi_chu,
                manv: hd.manv,
                tennv: hd.tennv,
                ten_ban: hd.cafe_ban?.ten_ban || "Mang về",
                ten_khuvuc: hd.cafe_khuvuc?.ten_khuvuc || "",
                ct_id: ct.id,
                ma_hang: ct.ma_hang,
                ten_hang: ct.ten_hang,
                so_luong: Number(ct.so_luong || 0),
                don_gia: Number(ct.don_gia || 0),
                thanh_tien: Number(ct.thanh_tien || 0),
                ghi_chu_mon: ct.ghi_chu || "",
                trang_thai_mon: ct.trang_thai,
                updated_at: ct.updated_at,
                thu_tu: ct.thu_tu || 0,
                log_gan_nhat: logGanNhat?.ghi_chu || logGanNhat?.hanh_dong || "",
            });
        }
    }

    detailRows = locPhiaClient(detailRows);
    rowsCache = detailRows;

    renderChiTiet(detailRows);
    renderTongHop(detailRows);
    renderCanhBaoHoaDon(detailRows);
    renderMonHayHuy(detailRows);
}

function locPhiaClient(rows) {
    const banText = el.locBan.value.trim().toLowerCase();
    const khuVucText = el.locKhuVuc.value.trim().toLowerCase();
    const monText = el.locMon.value.trim().toLowerCase();
    const trangThaiMon = el.locTrangThaiMon.value;
    const chiHoaDonCoMonHuy = el.chiHoaDonCoMonHuy.checked;

    let result = [...rows];

    if (banText) {
        result = result.filter((r) => String(r.ten_ban || "").toLowerCase().includes(banText));
    }

    if (khuVucText) {
        result = result.filter((r) => String(r.ten_khuvuc || "").toLowerCase().includes(khuVucText));
    }

    if (monText) {
        result = result.filter((r) => {
            const ma = String(r.ma_hang || "").toLowerCase();
            const ten = String(r.ten_hang || "").toLowerCase();
            return ma.includes(monText) || ten.includes(monText);
        });
    }

    if (trangThaiMon) {
        result = result.filter((r) => r.trang_thai_mon === trangThaiMon);
    }

    if (chiHoaDonCoMonHuy) {
        const hdCoHuy = new Set(
            rows.filter((r) => r.trang_thai_mon === "da_huy").map((r) => r.hoadon_id)
        );
        result = result.filter((r) => hdCoHuy.has(r.hoadon_id));
    }

    result.sort((a, b) => {
        const time = new Date(b.gio_vao) - new Date(a.gio_vao);
        if (time !== 0) return time;

        if (Number(a.hoadon_id) !== Number(b.hoadon_id)) {
            return Number(b.hoadon_id) - Number(a.hoadon_id);
        }

        return Number(a.thu_tu || 0) - Number(b.thu_tu || 0);
    });

    return result;
}

function renderChiTiet(rows) {
    if (!rows.length) {
        el.dsChiTiet.innerHTML = `<tr><td colspan="16">Không có dữ liệu phù hợp.</td></tr>`;
        return;
    }

    el.dsChiTiet.innerHTML = rows.map((r, index) => `
    <tr class="${r.trang_thai_mon === "da_huy" ? "status-da_huy" : ""}">
      <td>${index + 1}</td>
      <td>${formatDateTime(r.gio_vao)}</td>
      <td>${r.so_hoadon || ""}</td>
      <td>${r.ten_khuvuc || ""}</td>
      <td>${r.ten_ban || ""}</td>
      <td>${r.tennv || r.manv || ""}</td>
      <td>${r.ma_hang || ""}</td>
      <td>${r.ten_hang || ""}</td>
      <td class="text-right">${formatMoney(r.so_luong)}</td>
      <td class="text-right">${formatMoney(r.don_gia)}</td>
      <td class="text-right">${formatMoney(r.thanh_tien)}</td>
      <td>${trangThaiMonText(r.trang_thai_mon)}</td>
      <td>${trangThaiHDText(r.trang_thai_hd)}</td>
      <td>${r.ghi_chu_mon || ""}</td>
      <td>${r.log_gan_nhat || ""}</td>
      <td>${formatDateTime(r.updated_at)}</td>
    </tr>
  `).join("");
}

function renderTongHop(rows) {
    const tongDong = rows.length;
    const monBinhThuong = rows.filter((r) => r.trang_thai_mon === "binh_thuong");
    const monHuy = rows.filter((r) => r.trang_thai_mon === "da_huy");

    const hdCoHuy = new Set(monHuy.map((r) => r.hoadon_id));

    el.tongDongMon.textContent = formatMoney(tongDong);
    el.tongMonBinhThuong.textContent = formatMoney(monBinhThuong.length);
    el.tongMonHuy.textContent = formatMoney(monHuy.length);
    el.tongTienBinhThuong.textContent = formatMoney(monBinhThuong.reduce((s, r) => s + r.thanh_tien, 0));
    el.tongTienHuy.textContent = formatMoney(monHuy.reduce((s, r) => s + r.thanh_tien, 0));
    el.tongHoaDonCoHuy.textContent = formatMoney(hdCoHuy.size);
}

function renderCanhBaoHoaDon(rows) {
    const map = new Map();

    rows.filter((r) => r.trang_thai_mon === "da_huy").forEach((r) => {
        const key = r.hoadon_id;
        if (!map.has(key)) {
            map.set(key, {
                so_hoadon: r.so_hoadon,
                ten_ban: r.ten_ban,
                nv: r.tennv || r.manv || "",
                so_mon_huy: 0,
                tien_huy: 0,
            });
        }

        const item = map.get(key);
        item.so_mon_huy += 1;
        item.tien_huy += r.thanh_tien;
    });

    const list = Array.from(map.values())
        .sort((a, b) => b.so_mon_huy - a.so_mon_huy || b.tien_huy - a.tien_huy)
        .slice(0, 30);

    if (!list.length) {
        el.dsHoaDonCanhBao.innerHTML = `<tr><td colspan="5">Không có hóa đơn có món hủy.</td></tr>`;
        return;
    }

    el.dsHoaDonCanhBao.innerHTML = list.map((r) => `
    <tr>
      <td>${r.so_hoadon}</td>
      <td>${r.ten_ban}</td>
      <td>${r.nv}</td>
      <td class="text-right">${formatMoney(r.so_mon_huy)}</td>
      <td class="text-right">${formatMoney(r.tien_huy)}</td>
    </tr>
  `).join("");
}

function renderMonHayHuy(rows) {
    const map = new Map();

    rows.filter((r) => r.trang_thai_mon === "da_huy").forEach((r) => {
        const key = `${r.ma_hang}__${r.ten_hang}`;
        if (!map.has(key)) {
            map.set(key, {
                ma_hang: r.ma_hang,
                ten_hang: r.ten_hang,
                so_lan_huy: 0,
                tien_huy: 0,
            });
        }

        const item = map.get(key);
        item.so_lan_huy += 1;
        item.tien_huy += r.thanh_tien;
    });

    const list = Array.from(map.values())
        .sort((a, b) => b.so_lan_huy - a.so_lan_huy || b.tien_huy - a.tien_huy)
        .slice(0, 30);

    if (!list.length) {
        el.dsMonHayHuy.innerHTML = `<tr><td colspan="4">Không có món bị hủy.</td></tr>`;
        return;
    }

    el.dsMonHayHuy.innerHTML = list.map((r) => `
    <tr>
      <td>${r.ma_hang || ""}</td>
      <td>${r.ten_hang || ""}</td>
      <td class="text-right">${formatMoney(r.so_lan_huy)}</td>
      <td class="text-right">${formatMoney(r.tien_huy)}</td>
    </tr>
  `).join("");
}

async function copyText(text) {
    await navigator.clipboard.writeText(text);
}

function copyTable() {
    const rows = Array.from(document.querySelectorAll(".table-wrap table tr"));
    const text = rows.map((tr) =>
        Array.from(tr.cells).map((td) => td.innerText.replace(/\n/g, " ")).join("\t")
    ).join("\n");

    copyText(text);
}

function setDefaultDates() {
    const today = getToday();
    el.tuNgay.value = today;
    el.denNgay.value = today;
}

el.btnLoc.addEventListener("click", taiBaoCao);
el.btnCopyTable.addEventListener("click", copyTable);

document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") taiBaoCao();
});

setDefaultDates();
taiBaoCao();
