// caidatbanlevc.js — Dùng cho phiên bản giao diện bán lẻ trên Vercel

// ====== Khai báo dữ liệu toàn cục ======
let sanPhamData = {};
let bangKetQua = {};
let maspDangChon = null;

// ====== Khởi tạo Supabase ======
const supabase = window.supabase.createClient(
  'https://rddjrmbyftlcvrgzlyby.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM'
);

// ====== Khởi động khi trang tải xong ======
window.onload = () => {
  loadData();
  setupDOM();
};

function setupDOM() {
  const masp = document.getElementById("masp");
  const soluong = document.getElementById("soluong");
  const size = document.getElementById("size");

  if (masp) masp.addEventListener("keydown", chuyenFocus);
  if (soluong) soluong.addEventListener("keydown", chuyenFocus);
  if (size) size.addEventListener("keydown", chuyenFocus);

  document.getElementById("them")?.addEventListener("click", () => {
    document.querySelectorAll("input").forEach(input => {
      if (!['manv', 'tennv', 'ngay'].includes(input.id)) input.value = "";
    });
    bangKetQua = {};
    capNhatBangHTML();
  });

  document.getElementById("luu")?.addEventListener("click", luuHoaDonQuaAPI);
  document.getElementById("xoa")?.addEventListener("click", xoaDongDangChon);
  document.getElementById("masp-search")?.addEventListener("click", () => {
    const keyword = document.getElementById("masp").value.trim().toUpperCase();
    hienThiDanhMucSP(keyword);
    document.getElementById("popupDanhMuc").style.display = "block";
  });
  document.getElementById("timKiemMaspPopup")?.addEventListener("keydown", e => {
    if (e.key === "Enter") timLaiSPTrongPopup();
  });
}

function chuyenFocus(e) {
  if (e.key === "Enter") {
    if (e.target.id === "masp") {
      document.getElementById("soluong")?.focus();
    } else if (e.target.id === "soluong") {
      document.getElementById("size")?.focus();
    } else if (e.target.id === "size") {
      themVaoBang();
    }
  }
}

function themVaoBang() {
  const masp = document.getElementById("masp").value.trim().toUpperCase();
  const size = document.getElementById("size").value.trim();
  const soluong = parseInt(document.getElementById("soluong").value.trim()) || 1;

  if (!masp || !size || isNaN(soluong)) return;
  const sp = sanPhamData[masp];
  if (!sp) return alert("Mã sản phẩm không tồn tại!");

  const gia = parseFloat(document.getElementById("gia").value) || sp.gia;
  const km = parseFloat(document.getElementById("khuyenmai").value) || sp.km || 0;

  const key = masp;
  const bang = bangKetQua[key] || {
    masp,
    tensp: sp.tensp,
    sizes: [],
    soluongs: [],
    tong: 0,
    gia: gia,
    km: km,
    dvt: sp.dvt || ""
  };

  const index = bang.sizes.indexOf(size);
  if (index !== -1) bang.soluongs[index] += soluong;
  else {
    bang.sizes.push(size);
    bang.soluongs.push(soluong);
  }

  bang.tong += soluong;
  bangKetQua[key] = bang;
  capNhatBangHTML();
  document.getElementById("masp").value = "";
  document.getElementById("soluong").value = "1";
  document.getElementById("size").value = "";
  document.getElementById("masp").focus();
}

function capNhatBangHTML() {
  const tbody = document.querySelector("#bangketqua tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  Object.values(bangKetQua).forEach(item => {
    const thanhtien = (item.gia - item.km) * item.tong;
    const row = tbody.insertRow();
    row.innerHTML = `
<td>${item.masp}</td>
<td>${item.tensp}</td>
<td>${item.sizes.join(",")}</td>
<td>${item.soluongs.join(",")}</td>
<td>${item.tong}</td>
<td>${item.gia}</td>
<td>${item.km}</td>
<td>${thanhtien.toFixed(1)}</td>
<td>${item.dvt}</td>`;
  });
}

function xoaDongDangChon() {
  if (!maspDangChon) return alert("Vui lòng chọn dòng để xóa");
  delete bangKetQua[maspDangChon];
  maspDangChon = null;
  capNhatBangHTML();
}

function hienThiDanhMucSP(keyword) {
  const container = document.getElementById("danhSachSP");
  container.innerHTML = "";
  const danhSach = Object.values(sanPhamData)
    .filter(sp => sp.masp.includes(keyword) || sp.tensp.toUpperCase().includes(keyword))
    .slice(0, 100);

  danhSach.forEach(sp => {
    const div = document.createElement("div");
    div.textContent = `${sp.masp} - ${sp.tensp}`;
    div.className = "popup-item";
    div.addEventListener("click", () => {
      document.getElementById("masp").value = sp.masp;
      document.getElementById("gia").value = sp.gia || "";
      document.getElementById("khuyenmai").value = sp.km || "";
      dongPopupDM();
    });
    container.appendChild(div);
  });
}

function timLaiSPTrongPopup() {
  const keyword = document.getElementById("timKiemMaspPopup").value.trim().toUpperCase();
  hienThiDanhMucSP(keyword);
}

function dongPopupDM() {
  document.getElementById("popupDanhMuc").style.display = "none";
  document.getElementById("timKiemMaspPopup").value = "";
}

async function loadData() {
  const url = "https://script.google.com/macros/s/AKfycbwzFuA2f51Rkg5UV2dwySxtd3y8iDBtpX7LMq_z_ftE5cnQ6_HIRCHeCm-bteLChvUC/exec?action=getSP";
  const res = await fetch(url);
  const data = await res.json();

  data.forEach(sp => {
    sanPhamData[sp.masp] = {
      masp: sp.masp,
      tensp: sp.tensp,
      gia: Number(sp.gia),
      km: Number(sp.km) || 0,
      dvt: sp.dvt || ""
    };
  });
}

async function luuHoaDonQuaAPI() {
  const chitiet = [];
  const rows = document.querySelectorAll("#bangketqua tbody tr");
  rows.forEach(row => {
    const cells = row.querySelectorAll("td");
    chitiet.push({
      masp: cells[0].innerText,
      tensp: cells[1].innerText,
      size: cells[2].innerText,
      soluong: parseInt(cells[3].innerText),
      gia: parseFloat(cells[5].innerText),
      km: parseFloat(cells[6].innerText),
      thanhtien: parseFloat(cells[7].innerText)
    });
  });

  const hoadon = {
    ngay: new Date().toISOString().split("T")[0],
    manv: document.getElementById("manv")?.value || "",
    tennv: document.getElementById("tennv")?.value || "",
    khachhang: document.getElementById("khachhang")?.value || "",
    tongsl: chitiet.reduce((sum, item) => sum + item.soluong, 0),
    tongkm: chitiet.reduce((sum, item) => sum + item.km * item.soluong, 0),
    chietkhau: parseFloat(document.getElementById("chietkhau")?.value || 0),
    thanhtoan: parseFloat(document.getElementById("phaithanhtoan")?.value || 0),
    ghichu: document.getElementById("ghichu")?.value || "",
    hinhthuctt: document.getElementById("hinhthuctt")?.value || "tm",
    loai: "bancs1"
  };

  const res = await fetch("https://banle-js.vercel.app/api/luuhoadon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hoadon, chitiet })
  });

  const result = await res.json();
  if (result.success) alert("✅ Đã lưu hóa đơn thành công!");
  else alert("❌ Lỗi khi lưu hóa đơn: " + result.error);
}
