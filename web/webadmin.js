const SUPABASE_URL = "https://rddjrmbjftlcvrgzlyby.supabase.co";
const SUPABASE_ANON_KEY = "DAN_ANON_KEY_CUA_BAN_VAO_DAY";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function saveSlide() {
  const title = document.getElementById("slideTitle").value.trim();
  const image_url = document.getElementById("slideUrl").value.trim();
  const sort_order = Number(document.getElementById("slideOrder").value || 0);

  if (!image_url) {
    alert("Bạn chưa nhập link ảnh");
    return;
  }

  const { error } = await supabase.from("web_slides").insert({
    title,
    image_url,
    sort_order,
    active: true
  });

  if (error) {
    alert("Lỗi lưu ảnh: " + error.message);
    return;
  }

  alert("Đã lưu ảnh trình chiếu");
  loadSlides();
}

async function loadSlides() {
  const { data, error } = await supabase
    .from("web_slides")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) return;

  const box = document.getElementById("slideList");
  box.innerHTML = "";

  data.forEach(item => {
    box.innerHTML += `
      <div class="item">
        <b>${item.title || "Không tên"}</b>
        <p>${item.image_url}</p>
        <img src="${item.image_url}">
      </div>
    `;
  });
}

async function savePost() {
  const title = document.getElementById("postTitle").value.trim();
  const image_url = document.getElementById("postImage").value.trim();
  const category = document.getElementById("postCategory").value;
  const content = document.getElementById("postContent").value.trim();

  if (!title) {
    alert("Bạn chưa nhập tiêu đề");
    return;
  }

  const { error } = await supabase.from("web_posts").insert({
    title,
    image_url,
    category,
    content,
    active: true
  });

  if (error) {
    alert("Lỗi lưu bài viết: " + error.message);
    return;
  }

  alert("Đã lưu bài viết");
  loadPosts();
}

async function loadPosts() {
  const { data, error } = await supabase
    .from("web_posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return;

  const box = document.getElementById("postList");
  box.innerHTML = "";

  data.forEach(item => {
    box.innerHTML += `
      <div class="item">
        <b>${item.title}</b>
        <p>Danh mục: ${item.category}</p>
        ${item.image_url ? `<img src="${item.image_url}">` : ""}
        <p>${item.content || ""}</p>
      </div>
    `;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadSlides();
  loadPosts();
});