// ====== dau ======

// Khai báo các biến lưu dữ liệu sản phẩm, nhân viên, bảng kết quả
let sanPhamData = {};
let nhanVienData = {};
let bangKetQua = {};
let maspDangChon = null;
// === SUPABASE CONFIG ===
const SUPABASE_URL = 'https://rddjrmbyftlcvrgzlyby.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


// =========================

// Hàm chuyển focus khi nhấn Enter trong các ô nhập liệu

function chuyenFocus(e) {
  if (e.key === "Enter") {
    const nhapNhanh = document.getElementById("nhapnhanh").checked;
    const size45 = document.getElementById("size45").checked;

    if (e.target.id === "masp") {
      const maspVal = document.getElementById("masp").value.trim().toUpperCase();
      const spData = sanPhamData[maspVal];

      if (spData) {
        document.getElementById("gia").value = spData.gia || "";
        document.getElementById("khuyenmai").value = spData.km || "";

        const cs = document.getElementById("diadiem").value;
        const vitri = cs === "cs1" ? spData.vitriCS1 : spData.vitriCS2;
        document.getElementById("vitri").value = vitri || "";
      }

      if (size45) {
        document.getElementById("soluong").value = "1";
        console.log("Thêm size 45 nhanh");
        themVaoBang("45");
      } else {
        const nextId = nhapNhanh ? "size" : "soluong";
        const nextInput = document.getElementById(nextId);
        nextInput.focus();
        if (nextId === "soluong") nextInput.select();
      }

    } else if (e.target.id === "soluong") {
      document.getElementById("size").focus();

    } else if (e.target.id === "size") {
      themVaoBang();
    }
  }
}



// Hàm thêm dữ liệu vào bảng kết quả
function themVaoBang(forcedSize = null) {
  const masp = document.getElementById("masp").value.trim().toUpperCase();
  const size = forcedSize || document.getElementById("size").value.trim();
  const soluong = parseInt(document.getElementById("soluong").value.trim()) || 1;
  const manv = document.getElementById("manv").value.trim().toUpperCase();

  console.log(`Thêm SP: ${masp}, size: ${size}, SL: ${soluong}, NV: ${manv}`);

  if (!masp || !size || isNaN(soluong)) return;

  const sp = sanPhamData[masp];
  if (!sp) {
    alert("Mã sản phẩm không tồn tại trong dữ liệu!");
    console.warn(`Không tìm thấy mã SP: ${masp}`);
    return;
  }

  const gia = parseFloat(document.getElementById("gia").value) || 0;
  let km = parseFloat(document.getElementById("khuyenmai").value) || 0;

  if (!km) {
    if (gia < 100000) km = 5000;
    else if (gia < 500000) km = 10000;
    else km = 20000;
  }


  const key = masp;
  const bang = bangKetQua[key] || {
    masp,
    tensp: sp.tensp,
    sizes: [],
    soluongs: [],
    tong: 0,
    gia: gia,
    km: km,
    dvt: ""
  };

  const index = bang.sizes.indexOf(size);
  if (index !== -1) {
    bang.soluongs[index] += soluong;
  } else {
    bang.sizes.push(size);
    bang.soluongs.push(soluong);
    const combined = bang.sizes.map((sz, i) => ({ sz, qty: bang.soluongs[i] }));
    combined.sort((a, b) => parseFloat(a.sz) - parseFloat(b.sz));
    bang.sizes = combined.map(x => x.sz);
    bang.soluongs = combined.map(x => x.qty);
  }

  bang.tong += soluong;
  bang.dvt = "";
  bangKetQua[key] = bang;

  console.log("Dữ liệu bảng cập nhật:", bangKetQua);
  capNhatBangHTML();
  resetForm();
}

// Hàm cập nhật lại bảng HTML sau khi thêm dữ liệu
function capNhatBangHTML() {
  const tbody = document.querySelector("#bangketqua tbody");
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
  capNhatThongTinTong();

  // Gắn sự kiện click cho từng dòng để chọn dòng cần xóa
  document.querySelectorAll("#bangketqua tbody tr").forEach(row => {
    row.addEventListener("click", () => {
      maspDangChon = row.cells[0].textContent.trim();
      console.log("Đã chọn dòng với mã SP:", maspDangChon);
      row.style.backgroundColor = "#e6f3ff"; // Highlight dòng
      // Reset các dòng khác
      document.querySelectorAll("#bangketqua tbody tr").forEach(r => {
        if (r !== row) r.style.backgroundColor = "";
      });
    });
  });


}

// Reset lại form nhập liệu sau mỗi lần thêm
function resetForm() {
  document.getElementById("masp").value = "";
  document.getElementById("soluong").value = "1";
  document.getElementById("size").value = "";
  document.getElementById("masp").focus();
}

// Hàm tải dữ liệu sản phẩm và nhân viên từ Google Apps Script
async function loadData() {
  const urlBase =
    "https://script.google.com/macros/s/AKfycbwzFuA2f51Rkg5UV2dwySxtd3y8iDBtpX7LMq_z_ftE5cnQ6_HIRCHeCm-bteLChvUC/exec";

  const [spRes, nvRes] = await Promise.all([
    fetch(`${urlBase}?action=getSP`).then(r => r.json()),
    fetch(`${urlBase}?action=getNV`).then(r => r.json())
  ]);

  // Đổ dữ liệu sản phẩm vào sanPhamData

  spRes.forEach(sp => {
    sanPhamData[sp.masp] = {
      masp: sp.masp,
      tensp: sp.tensp,
      gia: Number(sp.gia),
      km: typeof sp.km === 'number' ? sp.km : 0,
      vitriCS1: sp.vitriCS1 || "",
      vitriCS2: sp.vitriCS2 || ""
    };
  });


  // Đổ dữ liệu nhân viên
  nvRes.forEach(nv => nhanVienData[nv.manv] = nv.tennv);

  // 🔍 Log kiểm tra
  console.group("📦 Kết quả tải dữ liệu:");
  console.log("🧾 Tổng số mã sản phẩm:", spRes.length);
  console.log("👨‍💼 Tổng số nhân viên:", nvRes.length);
  const sanPhamDataSize = new TextEncoder().encode(JSON.stringify(sanPhamData)).length / 1024;
  console.log(`🧠 Ước tính bộ nhớ RAM bị chiếm bởi sanPhamData: ~${sanPhamDataSize.toFixed(1)} KB`);
  console.log("🔍 Mẫu 5 mã SP đầu tiên:", Object.values(sanPhamData).slice(0, 5));
  console.groupEnd();
}

// Gán tên nhân viên sau khi nhập mã nhân viên
function ganTenNV() {
  const manv = document.getElementById("manv").value.trim();
  document.getElementById("tennv").value = nhanVienData[manv] || "";
}

// Khi trang được tải
window.onload = () => {
  loadData();
  document.getElementById("masp").focus();
  document.getElementById("nhapnhanh").checked = true;
  document.getElementById("chietkhau").addEventListener("blur", capNhatThongTinTong);
  document.getElementById("khachtra").addEventListener("input", (e) => {
    e.target.dataset.modified = true;
    capNhatThongTinTong();
  });

  document.getElementById("ngay").value = new Date().toISOString().slice(0, 10);

  document.getElementById("them").addEventListener("click", () => {
    // Reset lại mọi input trừ tên nhân viên
    document.querySelectorAll("input").forEach(input => {
      if (input.id !== "tennv" && input.id !== "ngay") input.value = "";
    });
    document.getElementById("ngay").value = new Date().toISOString().slice(0, 10);

    bangKetQua = {};
    capNhatBangHTML();
  });


  // Lệnh lưu dữ liệu bằng Supabase
  document.getElementById("luu").addEventListener("click", async () => {
    const khachtra = parseFloat(document.getElementById("khachtra").value) || 0;
    const phaitra = parseFloat(document.getElementById("phaithanhtoan").value) || 0;
    const conlai = khachtra - phaitra;

    if (conlai < 0) {
      document.getElementById("khachhang").focus();
      alert("Khách chưa trả đủ tiền! Vui lòng nhập thông tin khách hàng để ghi sổ nợ.");
      return;
    } else if (conlai > 0) {
      alert("Tiền trả lại cho khách: " + conlai.toLocaleString() + " đ");
    }

    const manv = document.getElementById("manv").value.trim();
    const tennv = document.getElementById("tennv").value.trim();
    const diadiem = document.getElementById("diadiem").value;

    const items = [];

    Object.values(bangKetQua).forEach(item => {
      item.sizes.forEach((sz, i) => {
        const sl = item.soluongs[i];
        items.push({
          soct: document.getElementById("sohd").value,
          masp: item.masp,
          size: sz,
          soluong: sl,
          manv,
          tennv,
          diadiem
        });
      });
    });

    const { error } = await supabase.from("xuatkho").insert(items);

    if (error) {
      alert("Lỗi ghi Supabase: " + error.message);
      console.error(error);
    } else {
      alert("Đã lưu hóa đơn thành công!");
      document.getElementById("them").click();
    }
  });


  document.getElementById("xoa").addEventListener("click", () => {
    xoaDongDangChon();
  });


  ["masp", "soluong", "size"].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener("keydown", chuyenFocus);
    }
  });

  const manvInput = document.getElementById("manv");
  if (manvInput) {
    manvInput.addEventListener("change", ganTenNV);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "F5") {
      e.preventDefault();
      const box = document.getElementById("nhapnhanh");
      if (box) {
        box.checked = !box.checked;
        console.log("Toggle Nhập Nhanh:", box.checked);
      }
    }
    if (e.key === "F6") {
      e.preventDefault();
      const box = document.getElementById("size45");
      if (box) {
        box.checked = !box.checked;
        console.log("Toggle Size 45:", box.checked);
      }
    }
    if (e.key === "F3") {
      e.preventDefault();
      xoaDongDangChon();
    }

  });
};

// ====== Popup MASP Search ======
document.addEventListener("DOMContentLoaded", () => {
  const btnClear = document.getElementById("masp-clear");
  const btnSearch = document.getElementById("masp-search");

  if (btnClear) {
    btnClear.addEventListener("click", () => {
      document.getElementById("masp").value = "";
    });
  }

  if (btnSearch) {
    btnSearch.addEventListener("click", () => {
      const keyword = document.getElementById("masp").value.trim().toUpperCase();
      hienThiDanhMucSP(keyword);
      document.getElementById("popupDanhMuc").style.display = "block";
    });
  }
});

function hienThiDanhMucSP(keyword) {
  const container = document.getElementById("danhSachSP");
  container.innerHTML = "";

  const danhSach = Object.values(sanPhamData)
    .filter(sp => sp.masp.includes(keyword) || sp.tensp.toUpperCase().includes(keyword))
    .slice(0, 100);

  if (danhSach.length === 0) {
    container.innerHTML = "<div style='padding:10px; color:#888;'>Không tìm thấy sản phẩm phù hợp</div>";
    return;
  }

  danhSach.forEach(sp => {
    const div = document.createElement("div");
    div.textContent = `${sp.masp} - ${sp.tensp}`;
    div.style = "padding:6px; border-bottom:1px solid #eee; cursor:pointer;";
    div.addEventListener("click", () => {
      document.getElementById("masp").value = sp.masp;

      // Gán giá và khuyến mãi vào ô nhập liệu
      const spData = sanPhamData[sp.masp];
      if (spData) {
        document.getElementById("gia").value = spData.gia || "";
        document.getElementById("khuyenmai").value = spData.km || "";

        const cs = document.getElementById("diadiem").value;
        const vitri = cs === "cs1" ? spData.vitriCS1 : spData.vitriCS2;
        document.getElementById("vitri").value = vitri || "";
      }

      dongPopupDM();
      const evt = new KeyboardEvent("keydown", { key: "Enter" });
      document.getElementById("masp").dispatchEvent(evt);
    });
    container.appendChild(div);
  });
}




function timLaiSPTrongPopup() {
  const keyword = document.getElementById("timKiemMaspPopup").value.trim().toUpperCase();
  hienThiDanhMucSP(keyword);
}

// Kích hoạt tìm kiếm khi nhấn Enter trong ô input tìm mã SP popup
document.addEventListener("DOMContentLoaded", () => {
  const inputPopup = document.getElementById("timKiemMaspPopup");
  if (inputPopup) {
    inputPopup.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        timLaiSPTrongPopup();
      }
    });
  }
});

function dongPopupDM() {
  document.getElementById("popupDanhMuc").style.display = "none";
  const input = document.getElementById("timKiemMaspPopup");
  if (input) input.value = ""; // Xóa nội dung ô tìm kiếm
}

// --------------- cap nhat tinh toan tren trang -----------------------------------

function capNhatThongTinTong() {
  const mathangInput = document.getElementById("mathang");
  const tongslInput = document.getElementById("tongsl");
  const tongkmInput = document.getElementById("tongkm");
  const chietkhauInput = document.getElementById("chietkhau");
  const phaithanhtoanInput = document.getElementById("phaithanhtoan");
  const khachtraInput = document.getElementById("khachtra");
  const conlaiInput = document.getElementById("conlai");

  let tongSoMatHang = Object.keys(bangKetQua).length;
  let tongSoLuong = 0;
  let tongKhuyenMai = 0;
  let tongThanhTien = 0;

  Object.values(bangKetQua).forEach(item => {
    const sl = item.tong;
    const km = item.km;
    const gia = item.gia;
    tongSoLuong += sl;
    tongKhuyenMai += km * sl;
    tongThanhTien += (gia - km) * sl;
  });

  mathangInput.value = tongSoMatHang;
  tongslInput.value = tongSoLuong;
  tongkmInput.value = tongKhuyenMai.toFixed(0);

  // Tính chiết khấu thông minh
  let ck = parseFloat(chietkhauInput.value.trim()) || 0;
  if (ck <= 100) {
    ck = tongThanhTien * (ck / 100);
    chietkhauInput.value = ck.toFixed(0);
  }

  // Tính phải trả và còn lại
  const phaitra = tongThanhTien - ck;
  phaithanhtoanInput.value = phaitra.toFixed(0);

  // Mặc định khách trả bằng phải trả nếu chưa nhập gì
  let khachtra = parseFloat(khachtraInput.value.trim());
  if (!khachtraInput.dataset.modified) {
    khachtra = phaitra;
    khachtraInput.value = phaitra.toFixed(0);
  }

  const conlai = khachtra - phaitra;
  conlaiInput.value = conlai.toFixed(0);


}


function xoaDongDangChon() {
  if (!maspDangChon) {
    alert("Vui lòng chọn dòng cần xóa.");
    return;
  }

  if (confirm(`Bạn có chắc muốn xóa mã sản phẩm "${maspDangChon}"?`)) {
    delete bangKetQua[maspDangChon];
    maspDangChon = null;
    capNhatBangHTML();
  }
}

async function luuHoaDonQuaAPI() {
  try {
    // 1. Lấy thông tin hóa đơn
    const hoadon = {
      ngay: new Date().toISOString().split("T")[0],
      manv: document.getElementById("manv")?.value || "",
      tennv: document.getElementById("tennv")?.value || "",
      diadiem: document.getElementById("diadiem")?.value || "",
      khachhang: document.getElementById("khachhang")?.value || "",
      tongsl: parseInt(document.getElementById("tongsl")?.value || "0"),
      tongkm: parseFloat(document.getElementById("tongkm")?.value || "0"),
      chietkhau: parseFloat(document.getElementById("chietkhau")?.value || "0"),
      thanhtoan: parseFloat(document.getElementById("thanhtoan")?.value || "0"),
      hinhthuctt: document.getElementById("hinhthuctt")?.value || "Tiền mặt",
      ghichu: document.getElementById("ghichu")?.value || "",
      loai: "bancs1" // hoặc xác định tự động tùy cơ sở
    };

    // 2. Chuẩn bị dữ liệu bảng chi tiết
    const table = document.querySelector("table");
    const rows = table.querySelectorAll("tbody tr");
    const chitiet = [];

    rows.forEach(row => {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 7) {
        chitiet.push({
          masp: cells[0].innerText.trim(),
          tensp: cells[1].innerText.trim(),
          size: cells[2].innerText.trim(),
          soluong: parseInt(cells[3].innerText.trim()) || 0,
          gia: parseFloat(cells[5].innerText.trim()) || 0,
          km: parseFloat(cells[6].innerText.trim()) || 0,
          thanhtien: parseFloat(cells[7].innerText.trim()) || 0
        });
      }
    });

    // 3. Gửi đến API
    const res = await fetch("https://banle-js.vercel.app/api/luuhoadon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hoadon, chitiet })
    });

    const result = await res.json();

    if (result.success) {
      alert("✅ Đã lưu hóa đơn qua API thành công!\nSố HĐ: " + result.sohd);

      // === Làm mới trang sau khi lưu thành công ===
      const diadiemVal = document.getElementById("diadiem").value;
      const manvVal = document.getElementById("manv").value;
      const tennvVal = document.getElementById("tennv").value;

      document.querySelectorAll("input").forEach(input => {
        if (!["diadiem", "manv", "tennv"].includes(input.id)) {
          input.value = "";
        }
      });

      bangKetQua = {};
      capNhatBangHTML();

      document.getElementById("diadiem").value = diadiemVal;
      document.getElementById("manv").value = manvVal;
      document.getElementById("tennv").value = tennvVal;
      document.getElementById("ngay").value = new Date().toISOString().slice(0, 10);
      document.getElementById("masp").focus();
    } else {
      alert("❌ Lỗi khi lưu hóa đơn qua API: " + result.error);
      console.error(result.detail);
    }
  } catch (err) {
    alert("❌ Lỗi hệ thống khi gọi API");
    console.error(err);
  }
}


// ====== het ======
// === Tự động cập nhật số hóa đơn mới nhất ===

// === Tự động cập nhật số hóa đơn mới nhất ===
async function capNhatSoHoaDonTuDong() {
  const { data, error } = await supabase
    .from("hoadon")
    .select("sohd")
    .like("loai", "bancs*")  // <- Đã sửa đúng cú pháp REST API
    .order("sohd", { ascending: false })
    .limit(1);
  if (!error && data.length > 0) {
    const so = parseInt(data[0].sohd.replace(/\\D/g, '')) + 1;
    document.getElementById("sohd").value = "HD" + so.toString().padStart(5, "0");
  } else {
    document.getElementById("sohd").value = "HD00001";
  }
}

// Gọi khi trang load xong
window.addEventListener("load", () => {
  capNhatSoHoaDonTuDong();
});

// Tự động lọc theo input người dùng trong popup
document.addEventListener("DOMContentLoaded", () => {
  const inputPopup = document.getElementById("timKiemMaspPopup");
  if (inputPopup) {
    inputPopup.addEventListener("input", function () {
      const keyword = inputPopup.value.trim().toUpperCase();
      hienThiDanhMucSP(keyword);
    });
  }
});
