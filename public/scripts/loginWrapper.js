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
    .eq("tennv", username)
    .eq("manv", password)
    .single();

  if (error || !data) {
    errBox.textContent = "Sai tên đăng nhập hoặc mật khẩu!";
    return;
  }

  sessionStorage.setItem("user", JSON.stringify(data));

  // Ẩn đăng nhập, hiện nội dung chính
  document.getElementById("login-container").style.display = "none";
  document.getElementById("app-container").style.display = "block";

  // Sau đăng nhập mới load main.js
  const script = document.createElement("script");
  script.type = "module";
  script.src = "scripts/main.js";
  document.body.appendChild(script);
}

window.dangNhap = dangNhap;

window.addEventListener("DOMContentLoaded", () => {
  const savedUser = sessionStorage.getItem("user");
  if (savedUser) {
    document.getElementById("login-container").style.display = "none";
    document.getElementById("app-container").style.display = "block";

    // Đã đăng nhập rồi thì load main.js ngay
    const script = document.createElement("script");
    script.type = "module";
    script.src = "scripts/main.js";
    document.body.appendChild(script);
  }
});
