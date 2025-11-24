// bangluongthang.js - Bảng lương tháng tất cả nhân viên
import { supabase } from "./supabaseClient.js";

const tuNgayInput = document.getElementById("tu_ngay");
const denNgayInput = document.getElementById("den_ngay");
const diadiemSelect = document.getElementById("diadiem");
const luongGioInput = document.getElementById("luong_gio");
const khoanGioInput = document.getElementById("khoan_gio");
const pctThuongInput = document.getElementById("pct_thuong");
const btnTai = document.getElementById("btn-tai");
const tbody = document.getElementById("tbody-bangluong");
const statusEl = document.getElementById("status");

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function setDefaultDates() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  tuNgayInput.value = toIsoDate(firstDay);
  denNgayInput.value = toIsoDate(lastDay);
}

function fmt(n, d = 0) {
  if (n == null || Number.isNaN(Number(n))) return "0";
  return Number(n).toLocaleString("vi-VN", {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  });
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg || "";
  statusEl.style.color = isError ? "#c62828" : "#555";
}

async function taiBangLuong() {
  const tu_ngay = tuNgayInput.value;
  const den_ngay = denNgayInput.value;
  const diadiem = diadiemSelect.value || null;
  const luong_gio = parseFloat(luongGioInput.value || "0") || 0;
  const khoan_gio = parseFloat(khoanGioInput.value || "0") || 0;
  const pct_thuong = parseFloat(pctThuongInput.value || "0") || 0;

  if (!tu_ngay || !den_ngay) {
    alert("Vui lòng chọn khoảng Từ ngày - Đến ngày.");
    return;
  }

  setStatus("Đang tải dữ liệu lương...");
  tbody.innerHTML = `<tr><td colspan="13">Đang tải...</td></tr>`;

  try {
    // 1) Lấy chấm công tháng tất cả NV
    const { data: congData, error: congErr } = await supabase.rpc(
      "chamcong_tinhcong_monthly",
      {
        tu_ngay,
        den_ngay,
        p_diadiem: diadiem,
        p_manv: null
      }
    );

    if (congErr) {
      console.error("Lỗi chamcong_tinhcong_monthly:", congErr);
      setStatus("Lỗi lấy dữ liệu chấm công.", true);
      tbody.innerHTML = `<tr><td colspan="13" style="color:red;">Lỗi chamcong_tinhcong_monthly.</td></tr>`;
      return;
    }

    if (!congData || congData.length === 0) {
      setStatus("Không có dữ liệu chấm công trong khoảng này.");
      tbody.innerHTML = `<tr><td colspan="13">Không có dữ liệu.</td></tr>`;
      return;
    }

    // 2) Lấy tên nhân viên từ dmnhanvien
    const manvSet = new Set(congData.map(r => r.manv));
    const manvArr = Array.from(manvSet);
    let mapTen = {};

    if (manvArr.length > 0) {
      const { data: nvData, error: nvErr } = await supabase
        .from("dmnhanvien")
        .select("manv, tennv")
        .in("manv", manvArr);

      if (!nvErr && nvData) {
        nvData.forEach(n => {
          mapTen[String(n.manv)] = n.tennv || "";
        });
      }
    }

    // 3) Tính lương cho từng nhân viên
    tbody.innerHTML = "";
    let tongLuongAll = 0;

    congData.forEach(row => {
      const manv = row.manv;
      const ten = mapTen[String(manv)] || "";
      const dia = row.diadiem;

      const gio_cong = Number(row.tong_gio_cong || 0);
      const so_ngay_tanca_lich = Number(row.so_ngay_tanca_lich || 0);
      const gio_phat_tanca_lich = so_ngay_tanca_lich * 1.0;
      const gio_tinh = Math.max(gio_cong - gio_phat_tanca_lich, 0);

      const doanhthu = Number(row.tong_doanhso || 0);
      const khoan_thang = gio_tinh * khoan_gio;
      const tien_vuot = Math.max(doanhthu - khoan_thang, 0);
      const tien_thuong = tien_vuot * (pct_thuong / 100.0);

      const luong_cung = gio_tinh * luong_gio;
      const tong_luong = luong_cung + tien_thuong;
      tongLuongAll += tong_luong;

      const tr = document.createElement("tr");
      const add = txt => {
        const td = document.createElement("td");
        td.textContent = txt;
        tr.appendChild(td);
      };

      add(manv);
      add(ten);
      add(dia);
      add(fmt(gio_cong, 2));
      add(fmt(gio_phat_tanca_lich, 2));
      add(fmt(gio_tinh, 2));
      add(fmt(doanhthu, 0));
      add(fmt(khoan_gio, 0));
      add(fmt(khoan_thang, 0));
      add(fmt(tien_vuot, 0));
      add(fmt(tien_thuong, 0));
      add(fmt(luong_cung, 0));
      add(fmt(tong_luong, 0));

      tbody.appendChild(tr);
    });

    // Dòng tổng
    const trSum = document.createElement("tr");
    trSum.style.fontWeight = "bold";
    const tdLabel = document.createElement("td");
    tdLabel.colSpan = 12;
    tdLabel.textContent = "TỔNG LƯƠNG";
    trSum.appendChild(tdLabel);
    const tdVal = document.createElement("td");
    tdVal.textContent = fmt(tongLuongAll, 0);
    trSum.appendChild(tdVal);
    tbody.appendChild(trSum);

    setStatus(`Đã tải ${congData.length} dòng. Tổng lương: ${fmt(tongLuongAll,0)} đ.`);
  } catch (err) {
    console.error("Lỗi không mong muốn:", err);
    setStatus("Có lỗi xảy ra, xem console.", true);
    tbody.innerHTML = `<tr><td colspan="13" style="color:red;">Lỗi JS.</td></tr>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setDefaultDates();
  setStatus("Chọn tháng, lương/giờ, khoán/giờ và % thưởng rồi bấm Tải bảng lương.");
  btnTai.addEventListener("click", taiBangLuong);
});

async function taiBangCong() {
    const thang = parseInt(document.getElementById("bc-thang").value);
    const nam = parseInt(document.getElementById("bc-nam").value);
    const tbody = document.getElementById("tbody-bangcong");
    const thead = document.getElementById("thead-bangcong");

    tbody.innerHTML = `<tr><td colspan="50">Đang tải...</td></tr>`;

    const { data, error } = await supabase.rpc("chamcong_bangcong_monthly", {
        p_month: thang,
        p_year: nam
    });

    if (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="50">Lỗi tải dữ liệu</td></tr>`;
        return;
    }

    // lấy danh sách nhân viên
    const nhanvien = [...new Set(data.map(d => `${d.manv}|${d.tennv}`))];

    // dựng header
    let header = `<th>Ngày</th><th>Thứ</th>`;
    nhanvien.forEach(n => {
        const [, tennv] = n.split('|');
        header += `<th>${tennv}</th>`;
    });
    header += `<th>Tổng</th>`;
    thead.innerHTML = `<tr>${header}</tr>`;

    // dựng nội dung bảng
    const groupByNgay = {};
    data.forEach(d => {
        if (!groupByNgay[d.ngay]) groupByNgay[d.ngay] = [];
        groupByNgay[d.ngay].push(d);
    });

    let html = "";
    Object.keys(groupByNgay).forEach(ng => {
        const row = groupByNgay[ng];
        const thu = row[0].thu;
        let sum = 0;
        let cells = "";

        nhanvien.forEach(n => {
            const manv = n.split('|')[0];
            const found = row.find(r => r.manv == manv);
            if (!found || found.gio_cong == 0) {
                cells += `<td class="text-danger">N</td>`;
            } else {
                sum += found.gio_cong;
                cells += `<td>${found.gio_cong}</td>`;
            }
        });

        html += `<tr>
            <td>${ng}</td>
            <td class="${thu=='CN'?'text-danger fw-bold':''}">${thu}</td>
            ${cells}
            <td class="fw-bold">${sum}</td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

window.taiBangCong = taiBangCong;
