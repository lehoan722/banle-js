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
  capNhatSoHoaDonTuDong();
  document.getElementById("masp").focus();
  document.getElementById("nhapnhanh").checked = true;
  document.getElementById("chietkhau").addEventListener("blur", capNhatThongTinTong);
  document.getElementById("khachtra").addEventListener("input", (e) => {
    e.target.dataset.modified = true;
    capNhatThongTinTong();
  });

  document.getElementById("ngay").value = new Date().toISOString().slice(0, 10);

  document.getElementById("them").addEventListener("click", async () => {
    // Xóa dữ liệu cũ (giữ lại mã NV, địa điểm...)
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

    // 👉 Cập nhật số hóa đơn mới
    await capNhatSoHoaDonTuDong();
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

  document.getElementById("timkiem").addEventListener("click", () => {
    window.open("https://banle-js.vercel.app/xemhoadon.html", "_blank");
  });

  document.getElementById("quaylai").addEventListener("click", async () => {
    const sohd = document.getElementById("sohd").value;
    const { data, error } = await supabase
      .from("hoadon_banle")
      .select("*")
      .lt("sohd", sohd)
      .order("sohd", { ascending: false })
      .limit(1);

    if (!error && data.length) {
      napHoaDonVaoTrang(data[0]);
    } else {
      alert("Không còn hóa đơn trước đó.");
    }
  });

  document.getElementById("sohd").addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const sohd = document.getElementById("sohd").value.trim();
      if (!sohd) return;

      const { data, error } = await supabase
        .from("hoadon_banle")
        .select("*")
        .eq("sohd", sohd)
        .limit(1);

      if (!error && data.length) {
        napHoaDonVaoTrang(data[0]);
      } else {
        alert("Không tìm thấy hóa đơn: " + sohd);
      }
    }
  });


  document.getElementById("tieptuc").addEventListener("click", async () => {
    const sohd = document.getElementById("sohd").value;
    const { data, error } = await supabase
      .from("hoadon_banle")
      .select("*")
      .gt("sohd", sohd)
      .order("sohd", { ascending: true })
      .limit(1);

    if (!error && data.length) {
      napHoaDonVaoTrang(data[0]);
    } else {
      alert("Không còn hóa đơn tiếp theo.");
    }
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
  if (e.key === "F1") {
    e.preventDefault();
    moPopupThemMoi();

    const btn = document.getElementById("btnThemMoiCo");
    btn.onclick = function () {
      dongTatCaPopup();
      document.getElementById("them").click();
    };

    btn.addEventListener("keydown", function onKey(ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        btn.onclick();
        btn.removeEventListener("keydown", onKey);
      }
    });
  }
});

  
  document.addEventListener("keydown", async function (e) {
  if (e.key === "F2") {
    e.preventDefault();
    const table = document.querySelector("table");
    const rows = table.querySelectorAll("tbody tr");
    if (rows.length === 0) {
      alert("❌ Không có dữ liệu để lưu hóa đơn.");
      return;
    }
    await luuHoaDonQuaAPI();
  }

    document.addEventListener("keydown", function(e) {
  if (e.key === "F4") {
    e.preventDefault();
    const khachtra = document.getElementById("khachtra");
    if (khachtra) {
      khachtra.focus();
      khachtra.select();

      // Gán sự kiện Enter chỉ một lần
      khachtra.addEventListener("keydown", async function onEnter(ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          // Tránh gán nhiều lần
          khachtra.removeEventListener("keydown", onEnter);

          const rows = document.querySelectorAll("table tbody tr");
          if (rows.length === 0) {
            alert("❌ Không có dữ liệu để lưu.");
            return;
          }
          await luuHoaDonQuaAPI();
        }
      }, { once: true }); // chỉ chạy 1 lần
    }
  }
});
   
  

  if (e.key === "F3") {
    e.preventDefault();
    xoaDongDangChon();
  }

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
  tongkmInput.value = tongKhuyenMai.toLocaleString();

  // Tính chiết khấu thông minh
  let ck = parseFloat(chietkhauInput.value.trim()) || 0;
  if (ck <= 100) {
    ck = tongThanhTien * (ck / 100);
    chietkhauInput.value = ck.toLocaleString();
  }

  // Tính phải trả và còn lại
  const phaitra = tongThanhTien - ck;
  phaithanhtoanInput.value = phaitra.toLocaleString();

  // Mặc định khách trả bằng phải trả nếu chưa nhập gì
  let khachtra = parseFloat(khachtraInput.value.trim());
  if (!khachtraInput.dataset.modified) {
    khachtra = phaitra;
    khachtraInput.value = phaitra.toLocaleString();
  }

  const conlai = khachtra - phaitra;
  conlaiInput.value = conlai.toLocaleString();
  document.getElementById("phaithanhtoan_text").textContent = phaitra.toLocaleString();
  document.getElementById("khachtra_text").textContent = khachtra.toLocaleString();
  document.getElementById("conlai_text").textContent = conlai.toLocaleString();


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

let choPhepSua = false; // cờ xác nhận sau khi nhập mật khẩu

async function luuHoaDonQuaAPI() {
  try {
    const sohd = document.getElementById("sohd").value.trim();
    if (!sohd) {
      alert("Không có số hóa đơn.");
      return;
    }

    // Kiểm tra hóa đơn đã tồn tại chưa
    const { data: tonTai } = await supabase
      .from("hoadon_banle")
      .select("sohd")
      .eq("sohd", sohd)
      .maybeSingle();

    if (tonTai && !choPhepSua) {
      // Nếu hóa đơn tồn tại nhưng chưa xác thực → mở popup xác thực
      document.getElementById("popupXacThucSua").style.display = "block";
      return;
    }

    // Nếu xác thực rồi hoặc là hóa đơn mới → tiếp tục
    if (tonTai && choPhepSua) {
      await supabase.from("ct_hoadon_banle").delete().eq("sohd", sohd);
      await supabase.from("hoadon_banle").delete().eq("sohd", sohd);
    }

    // Chuẩn bị dữ liệu hóa đơn
    const hoadon = {
      sohd: sohd,
      ngay: document.getElementById("ngay").value,
      manv: document.getElementById("manv").value,
      tennv: document.getElementById("tennv").value,
      diadiem: document.getElementById("diadiem").value,
      khachhang: document.getElementById("khachhang").value,
      tongsl: parseInt(document.getElementById("tongsl").value || "0"),
      tongkm: parseFloat(document.getElementById("tongkm").value || "0"),
      chietkhau: parseFloat(document.getElementById("chietkhau").value || "0"),
      //thanhtoan: parseFloat(document.getElementById("thanhtoan").value || "0"),
      hinhthuctt: document.getElementById("hinhthuctt").value,
      ghichu: document.getElementById("ghichu")?.value || ""
    };

    // Chuẩn bị dữ liệu chi tiết hóa đơn
    const table = document.querySelector("table");
    const rows = table.querySelectorAll("tbody tr");
    
  const chitiet = [];

rows.forEach(row => {
  const cells = row.querySelectorAll("td");
  if (cells.length >= 7) {
    const masp = cells[0].innerText.trim();
    const tensp = cells[1].innerText.trim();
    const sizeText = cells[2].innerText.trim();
    const soluongText = cells[3].innerText.trim();
    const gia = parseFloat(cells[5].innerText.trim()) || 0;
    const km = parseFloat(cells[6].innerText.trim()) || 0;

    const sizes = sizeText.split(",");
    const soluongs = soluongText.split(",");

    sizes.forEach((sz, i) => {
      const sl = parseInt(soluongs[i] || "0");
      if (sz.trim() && sl > 0) {
        chitiet.push({
          sohd: sohd,
          masp: masp,
          tensp: tensp,
          size: sz.trim(),
          soluong: sl,
          gia: gia,
          km: km,
          thanhtien: sl * gia - km
        });
      }
    });
  }
});


    // Gửi dữ liệu lên Supabase
    const { error: errHD } = await supabase.from("hoadon_banle").insert([hoadon]);
    const { error: errCT } = await supabase.from("ct_hoadon_banle").insert(chitiet);

    if (!errHD && !errCT) {
      alert("✅ Đã lưu hóa đơn thành công!");
      const khachtraVal = document.querySelector("input#khachtra")?.value || "0";
      const phaithanhtoanVal = document.querySelector("input#phaithanhtoan")?.value || "0";

      const hoadonIn = {
        diadiem: hoadon.diadiem,
        khachhang: hoadon.khachhang,
        sohd: hoadon.sohd,
        ngay: hoadon.ngay,
        gio: new Date().toLocaleTimeString(),
        khachtra: khachtraVal,
        tongkm: hoadon.tongkm,
        thanhtoan: hoadon.thanhtoan,
        tralai: (parseFloat(khachtraVal) - parseFloat(phaithanhtoanVal)).toLocaleString(),
        tongsl: hoadon.tongsl,
        phaithanhtoan: phaithanhtoanVal
      };

      inHoaDon(hoadonIn, chitiet);

      choPhepSua = false;

      // === Làm mới giao diện
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
      capNhatThongTinTong();

      document.getElementById("diadiem").value = diadiemVal;
      document.getElementById("manv").value = manvVal;
      document.getElementById("tennv").value = tennvVal;
      document.getElementById("ngay").value = new Date().toISOString().slice(0, 10);

      // ✅ Cập nhật số hóa đơn mới
      await capNhatSoHoaDonTuDong();

      // ✅ Focus lại vào ô mã sản phẩm
      setTimeout(() => {
        document.getElementById("masp").focus();
      }, 100);
    } else {
      alert("❌ Lỗi khi ghi hóa đơn.");
      console.error(errHD || errCT);
    }
  } catch (err) {
    alert("❌ Lỗi hệ thống khi lưu hóa đơn.");
    console.error(err);
  }
}

// === Popup tìm mã sản phẩm gợi ý theo ký tự gõ ===
(function () {
  const inputMaSP = document.getElementById("masp");
  const popup = document.getElementById("popup_masp");

  inputMaSP.addEventListener("input", () => {
    const keyword = inputMaSP.value.trim().toUpperCase();
    if (!keyword) return (popup.style.display = "none");

    const danhSach = Object.values(sanPhamData)
      .filter(sp =>
        sp.masp.includes(keyword) || (sp.tensp || "").toUpperCase().includes(keyword)
      )
      .slice(0, 100);

    if (danhSach.length === 0) {
      popup.style.display = "none";
      return;
    }

    popup.innerHTML = danhSach.map(sp => `
      <div class="popup-masp-item" data-masp="${sp.masp}" style="padding:6px; border-bottom:1px solid #eee; cursor:pointer;">
        ${sp.masp} - ${sp.tensp}
      </div>
    `).join("");

    popup.style.display = "block";
  });

  popup.addEventListener("click", (e) => {
    const item = e.target.closest(".popup-masp-item");
    if (!item) return;
    const masp = item.dataset.masp;
    inputMaSP.value = masp;
    popup.style.display = "none";

    // Tự động xử lý khi chọn mã SP như bấm Enter
    const evt = new KeyboardEvent("keydown", { key: "Enter" });
    inputMaSP.dispatchEvent(evt);
  });

  inputMaSP.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();

    const keyword = inputMaSP.value.trim().toUpperCase();
    const sp = window.sanPhamData?.[keyword];

    if (sp) {
      // ✅ Có trong danh mục → xử lý như bình thường
      xuLyKhiChonMaSanPham(keyword);  // điền thông tin
      // ➝ Tự chuyển focus giống chuyenFocus
      const nhapNhanh = document.getElementById("nhapnhanh").checked;
      const size45 = document.getElementById("size45").checked;

      if (size45) {
        document.getElementById("soluong").value = "1";
        window.themVaoBang("45");
      } else {
        const nextId = nhapNhanh ? "size" : "soluong";
        const nextInput = document.getElementById(nextId);
        nextInput?.focus();
        if (nextId === "soluong") nextInput?.select();
      }

    } else {
      // ❌ Không có trong danh mục → mở popup bảng danh mục để tạo mới
      window.moBangDanhMucHangHoa(keyword);
    }
  }
});



  document.addEventListener("click", (e) => {
    if (!popup.contains(e.target) && e.target !== inputMaSP) {
      popup.style.display = "none";
    }
  });
})();


// ====== het ======

// === Tự động cập nhật số hóa đơn mới nhất ===

async function capNhatSoHoaDonTuDong() {
  const { data, error } = await supabase
    .from("hoadon_banle")
    .select("sohd")
    .like("sohd", "bancs1_%")
    .order("sohd", { ascending: false })
    .limit(1);

  if (!error && data.length > 0) {
    const lastSohd = data[0].sohd;
    const parts = lastSohd.split("_");
    const so = parseInt(parts[1]) + 1;
    const newSohd = "bancs1_" + so.toString().padStart(5, "0");
    document.getElementById("sohd").value = newSohd;
  } else {
    document.getElementById("sohd").value = "bancs1_00001";
  }
}


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
//-------------------------------------------------------------------------------
async function xacNhanSuaHoaDon() {
  const manv = document.getElementById("xacmanv").value.trim();
  const mk = document.getElementById("xacmatkhau").value.trim();
  const sohd = document.getElementById("sohd").value.trim();
  const loai = sohd.startsWith("bancs1") ? "hdbl" : "khac"; // tự điều chỉnh nếu cần

  const { data, error } = await supabase
    .from("dmnhanvien")
    .select("matkhau, sua_hoadon, loai_duoc_sua")
    .eq("manv", manv)
    .maybeSingle();

  if (error || !data || data.matkhau !== mk) {
    alert("❌ Sai mã nhân viên hoặc mật khẩu.");
    return;
  }

  const duocSua = data.sua_hoadon === true &&
    (data.loai_duoc_sua || []).includes(loai);

  if (!duocSua) {
    alert("🚫 Bạn không có quyền sửa loại chứng từ này.");
    return;
  }

  choPhepSua = true;
  document.getElementById("popupXacThucSua").style.display = "none";
  alert("✅ Xác thực thành công. Tiếp tục lưu lại hóa đơn.");
  luuHoaDonQuaAPI(); // gọi lại
}


function inHoaDon(hoadon, chitiet) {
  const data = { hoadon, chitiet };
  localStorage.setItem("data_hoadon_in", JSON.stringify(data));

  // Tạo iframe ẩn
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = "/in-hoadon.html"; // Đường dẫn đến trang in
  document.body.appendChild(iframe);

  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow.print();
      } catch (e) {
        console.error("Không thể gọi print() từ iframe:", e);
      }
      // Sau khi in, xóa iframe khỏi DOM
      document.body.removeChild(iframe);
    }, 500); // Đợi load nội dung xong rồi mới in
  };
}



async function napHoaDonVaoTrang(hoadon) {
  if (!hoadon) return;

  // Gán các trường hóa đơn tổng
  document.getElementById("sohd").value = hoadon.sohd || "";
  document.getElementById("ngay").value = hoadon.ngay || "";
  document.getElementById("manv").value = hoadon.manv || "";
  document.getElementById("tennv").value = hoadon.tennv || "";
  document.getElementById("diadiem").value = hoadon.diadiem || "";
  document.getElementById("khachhang").value = hoadon.khachhang || "";
  document.getElementById("hinhthuctt").value = hoadon.hinhthuctt || "";
  document.getElementById("chietkhau").value = hoadon.chietkhau || "0";
  document.getElementById("tongkm").value = hoadon.tongkm || "0";
  //document.getElementById("thanhtoan").value = hoadon.thanhtoan || "0";
  document.getElementById("phaithanhtoan").value = hoadon.phaithanhtoan || "0";
  document.getElementById("khachtra").value = hoadon.khachtra || hoadon.phaithanhtoan || "0";
  document.getElementById("conlai").value = hoadon.conlai || "0";
  document.getElementById("tongsl").value = hoadon.tongsl || "0";

  // Reset bảng kết quả
  bangKetQua = {};

  // Truy vấn bảng chi tiết ct_hoadon_banle
  const { data: chiTiet, error } = await supabase
    .from("ct_hoadon_banle")
    .select("*")
    .eq("sohd", hoadon.sohd);

  if (!error && chiTiet.length > 0) {
    chiTiet.forEach(row => {
      const masp = row.masp;
      const size = row.size;
      const sl = row.soluong;

      if (!bangKetQua[masp]) {
        bangKetQua[masp] = {
          masp,
          tensp: row.tensp || "",
          sizes: [],
          soluongs: [],
          tong: 0,
          gia: row.gia || 0,
          km: row.km || 0,
          dvt: ""
        };
      }

      const item = bangKetQua[masp];
      item.sizes.push(size);
      item.soluongs.push(sl);
      item.tong += sl;
    });

    capNhatBangHTML();
    capNhatThongTinTong();
  } else {
    alert("Không tìm thấy chi tiết hóa đơn.");
  }
}


function moPopupThemMoi() {
  const popup = document.getElementById("popupThemMoi");
  popup.style.display = "block";

  setTimeout(() => {
    const btnCo = document.getElementById("btnThemMoiCo");
    if (btnCo) btnCo.focus();
  }, 50); // đợi 1 chút để DOM render xong
}

function dongTatCaPopup() {
  document.querySelectorAll(".popup-confirm").forEach(popup => {
    popup.style.display = "none";
  });
}

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    dongTatCaPopup();
  }
});



