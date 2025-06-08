
import { supabase } from './supabaseClient.js';

async function dangNhap() {
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

  sessionStorage.setItem("user", JSON.stringify(data));

  // Ẩn đăng nhập, hiện app container
  setTimeout(async () => {
    document.getElementById("login-container").style.display = "none";
    document.getElementById("app-container").style.display = "block";

    // Nạp và khởi động main.js sau khi hiển thị giao diện
    const module = await import('./main.js');
    if (module.khoiTaoUngDung) {
      await module.khoiTaoUngDung();
    }
  }, 0);
}

window.dangNhap = dangNhap;

window.addEventListener("DOMContentLoaded", async () => {
  const savedUser = sessionStorage.getItem("user");
  if (savedUser) {
    setTimeout(async () => {
      document.getElementById("login-container").style.display = "none";
      document.getElementById("app-container").style.display = "block";

      const module = await import('./main.js');
      if (module.khoiTaoUngDung) {
        await module.khoiTaoUngDung();
      }
    }, 0);
  }
});
