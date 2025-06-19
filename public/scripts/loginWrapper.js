import { supabase } from './supabaseClient.js';

async function dangNhap() {
  window.dangNhap = dangNhap;
  const username = document.getElementById("login-user")?.value.trim();
  const password = document.getElementById("login-pass")?.value.trim();
  const errBox = document.getElementById("login-error");

  if (!username || !password) {
    errBox.textContent = "Vui lòng nhập đầy đủ!";
    return;
  }

  const { data, error } = await supabase
    .from("dmnhanvien")
    .select("*")
    .eq("manv", username)
    .eq("matkhau", password)
    .single();

  if (error || !data) {
    errBox.textContent = "Sai tên đăng nhập hoặc mật khẩu!";
    return;
  }

  setTimeout(async () => {
    document.getElementById("login-container").style.display = "none";
    document.getElementById("app-container").style.display = "block";

    // Gán thông tin nhân viên vào form hóa đơn
    document.getElementById("tennv").value = data.tennv;
    document.getElementById("manv").value = data.manv;

    const module = await import('./main.js');
    if (module.khoiTaoUngDung) {
      await module.khoiTaoUngDung();
    }
  }, 0);
}


