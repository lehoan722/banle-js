// bangketqua.js

import { getMaspspDangChon, setMaspspDangChon } from './hoadon.js';
import { capNhatThongTinTong } from './utils.js';

export function capNhatBangHTML(bangKetQua) {
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
      <td>${thanhtien.toLocaleString()}</td>
      <td>${item.dvt}</td>
    `;

    row.addEventListener("click", () => {
      setMaspspDangChon(item.masp);
      highlightRow(row);
    });
  });

  capNhatThongTinTong(bangKetQua);
}

function highlightRow(selectedRow) {
  document.querySelectorAll("#bangketqua tbody tr").forEach(row => {
    row.style.backgroundColor = row === selectedRow ? "#e6f3ff" : "";
  });
}

export function resetFormBang() {
  document.getElementById("masp").value = "";
  document.getElementById("soluong").value = "1";
  document.getElementById("size").value = "";
  document.getElementById("masp").focus();
}
