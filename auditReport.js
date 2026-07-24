import { supabase } from "./js/supabaseClient.js";

const $ = id => document.getElementById(id);
const money = value => Number(value || 0).toLocaleString("vi-VN");

function setDefaultDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  $("tuNgay").value = start.toISOString().slice(0, 10);
  $("denNgay").value = now.toISOString().slice(0, 10);
}

async function loadData() {
  const from = $("tuNgay").value + "T00:00:00";
  const toDate = new Date($("denNgay").value + "T00:00:00");
  toDate.setDate(toDate.getDate() + 1);

  let query = supabase
    .from("v_banle_audit_tonghop")
    .select("*")
    .gte("bat_dau_at", from)
    .lt("bat_dau_at", toDate.toISOString())
    .order("bat_dau_at", { ascending: false })
    .limit(2000);

  if ($("diadiem").value) {
    query = query.eq("diadiem", $("diadiem").value);
  }

  const { data, error } = await query;
  if (error) {
    alert("Không tải được dữ liệu: " + error.message);
    return;
  }

  render(data || []);
}

function render(rows) {
  $("cTong").textContent = rows.length;
  $("cBo").textContent = rows.filter(x => x.trangthai === "bo_huy").length;
  $("cLoai").textContent = money(rows.reduce((s,x) => s + Number(x.gia_tri_da_loai || 0), 0));
  $("cRisk").textContent = rows.filter(x => ["cao","rat_cao"].includes(x.muc_rui_ro)).length;

  $("tbody").innerHTML = rows.map(x => `
    <tr class="${x.muc_rui_ro || ""}">
      <td>${new Date(x.bat_dau_at).toLocaleString("vi-VN")}</td>
      <td>${x.diadiem || ""}</td>
      <td>${x.tennv || x.manv || ""}</td>
      <td>${x.trangthai || ""}</td>
      <td>${x.sohd_da_luu || x.sohd_du_kien || ""}</td>
      <td>${money(x.tong_tien_cao_nhat)}</td>
      <td>${money(x.tong_tien_da_luu)}</td>
      <td>${money(x.gia_tri_da_loai)}</td>
      <td>${x.so_lan_xoa || 0}</td>
      <td>${x.diem_rui_ro || 0}</td>
      <td>${x.muc_rui_ro || ""}</td>
      <td>${x.lydo_ket_thuc || ""}</td>
    </tr>
  `).join("");
}

$("btnTai").addEventListener("click", loadData);
setDefaultDates();
loadData();
