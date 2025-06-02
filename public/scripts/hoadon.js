
import { capNhatBangHTML, resetFormBang } from './bangketqua.js';

let bangKetQua = {};
let maspDangChon = null;

export async function chuyenFocus(e) {
  if (e.key !== "Enter") return;

  const nhapNhanh = document.getElementById("nhapnhanh").checked;
  const size45 = document.getElementById("size45").checked;

  if (e.target.id === "masp") {
    const maspVal = document.getElementById("masp").value.trim().toUpperCase();
    let spData = window.sanPhamData?.[maspVal];

    if (!spData) {
      const { data } = await window.supabase.from("dmhanghoa").select("*").eq("masp", maspVal).maybeSingle();
      if (data) {
        window.sanPhamData[maspVal] = data;
        spData = data;
      }
    }

    if (spData) {
      document.getElementById("gia").value = spData.giale || "";
      document.getElementById("khuyenmai").value = spData.khuyenmai || "";
      const cs = document.getElementById("diadiem").value;
      const vitri = cs === "cs1" ? spData.vitrikho1 : spData.vitrikho2;
      document.getElementById("vitri").value = vitri || "";
    }

    if (size45) {
      document.getElementById("soluong").value = "1";
      themVaoBang("45");
    } else {
      const nextId = nhapNhanh ? "size" : "soluong";
      const nextInput = document.getElementById(nextId);
      nextInput?.focus();
      if (nextId === "soluong") nextInput?.select();
    }

  } else if (e.target.id === "soluong") {
    document.getElementById("size").focus();
  } else if (e.target.id === "size") {
    themVaoBang();
  }
}

export async function themVaoBang(forcedSize = null) {
  const masp = document.getElementById("masp").value.trim().toUpperCase();
  const size = forcedSize || document.getElementById("size").value.trim();
  const soluong = parseInt(document.getElementById("soluong").value.trim()) || 1;

  if (!masp || !size) return;

  let sp = window.sanPhamData?.[masp];
  if (!sp) {
    const { data } = await window.supabase.from("dmhanghoa").select("*").eq("masp", masp).maybeSingle();
    if (data) {
      sp = data;
      window.sanPhamData[masp] = sp;
    }
  }

  if (!sp) {
    alert("Mã sản phẩm không hợp lệ hoặc không tồn tại.");
    return;
  }

  const gia = parseFloat(document.getElementById("gia").value) || 0;
  let km = parseFloat(document.getElementById("khuyenmai").value) || 0;
  if (!km) km = gia < 100000 ? 5000 : gia < 500000 ? 10000 : 20000;

  const key = masp;
  const bang = bangKetQua[key] || {
    masp,
    tensp: sp.tensp,
    sizes: [],
    soluongs: [],
    tong: 0,
    gia,
    km,
    dvt: ""
  };

  const index = bang.sizes.indexOf(size);
  if (index !== -1) {
    bang.soluongs[index] += soluong;
  } else {
    bang.sizes.push(size);
    bang.soluongs.push(soluong);
  }

  bang.tong += soluong;
  bangKetQua[key] = bang;

  capNhatBangHTML(bangKetQua);
  resetFormBang();
}

export function getBangKetQua() { return bangKetQua; }
export function resetBangKetQua() { bangKetQua = {}; capNhatBangHTML(bangKetQua); }
export function setMaspspDangChon(masp) { maspDangChon = masp; }
export function getMaspspDangChon() { return maspDangChon; }
export function ganTenNV() {
  const manv = document.getElementById("manv").value.trim();
  document.getElementById("tennv").value = window.nhanVienData?.[manv] || "";
}
export function xoaDongDangChon() {
  if (!maspDangChon) return alert("Vui lòng chọn dòng cần xóa.");
  if (confirm(`Bạn có chắc muốn xóa mã sản phẩm "${maspDangChon}"?`)) {
    delete bangKetQua[maspDangChon];
    maspDangChon = null;
    capNhatBangHTML(bangKetQua);
  }
}
