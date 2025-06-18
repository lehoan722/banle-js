// popup.js – xử lý hiển thị popup chọn loại tem nếu chưa chọn

export function showPopupChonLoaiTem(callback) {
  // Kiểm tra xem đã có popup chưa, nếu có thì xóa
  const existing = document.getElementById("popup-chon-loai-tem");
  if (existing) existing.remove();

  const popup = document.createElement("div");
  popup.id = "popup-chon-loai-tem";
  popup.style = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border: 1px solid gray;
    padding: 20px;
    box-shadow: 0 0 10px rgba(0,0,0,0.3);
    z-index: 9999;
    text-align: center;
    border-radius: 8px;
  `;

  popup.innerHTML = `
    <div style="margin-bottom: 10px; font-weight: bold;">Bạn muốn in tem quần áo hay giày dép?</div>
    <button id="btnChonQuanAo" style="margin-right: 10px; padding: 6px 16px;">In Quần Áo</button>
    <button id="btnChonGiayDep" style="padding: 6px 16px;">In Giày Dép</button>
  `;

  document.body.appendChild(popup);

  document.getElementById("btnChonQuanAo").onclick = () => {
    document.getElementById("loaiTem").value = "quanao";
    popup.remove();
    if (callback) callback("quanao");
  };

  document.getElementById("btnChonGiayDep").onclick = () => {
    document.getElementById("loaiTem").value = "giaydep";
    popup.remove();
    if (callback) callback("giaydep");
  };
}
