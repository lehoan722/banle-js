import { supabase } from "./supabaseClient.js";
import { khoiTaoDangNhapDungChung } from "./authModule.js";

const diadiemEl = document.getElementById("diadiem");
const dangBatEl = document.getElementById("dang_bat");
const giaoVeSinhEl = document.getElementById("giao_ve_sinh_sang");

const soGioMocEl = document.getElementById("so_gio_moc");
const soTaskMocEl = document.getElementById("so_task_moc");
const soTaskToiDaEl = document.getElementById("so_task_toi_da");

const btnSave = document.getElementById("btn-save");
const btnLoad = document.getElementById("btn-load");
const msgEl = document.getElementById("msg");

let currentUser = null;

function setMsg(text, isError = false) {
    msgEl.textContent = text || "";
    msgEl.style.color = isError ? "#dc2626" : "#059669";
}

async function loadConfig() {
    const diadiem = diadiemEl.value;

    setMsg("Đang tải cấu hình...");

    const { data, error } = await supabase
        .schema("qlnv")
        .from("cau_hinh_giao_viec_tu_dong")
        .select("*")
        .eq("diadiem", diadiem)
        .maybeSingle();

    if (error) {
        console.error(error);
        setMsg("Lỗi tải cấu hình.", true);
        return;
    }

    if (!data) {
        setMsg("Chưa có cấu hình cho cơ sở này.", true);
        return;
    }

    dangBatEl.value = String(data.dang_bat);
    giaoVeSinhEl.value = String(data.giao_ve_sinh_sang);

    soGioMocEl.value = data.so_gio_moc ?? 5;
    soTaskMocEl.value = data.so_task_moc ?? 3;
    soTaskToiDaEl.value = data.so_task_toi_da ?? 8;

    setMsg("Đã tải cấu hình.");
}

async function saveConfig() {

    const diadiem = diadiemEl.value;

    const payload = {
        diadiem: diadiem,
        dang_bat: dangBatEl.value === "true",
        giao_ve_sinh_sang: giaoVeSinhEl.value === "true",
        so_gio_moc: Number(soGioMocEl.value),
        so_task_moc: Number(soTaskMocEl.value),
        so_task_toi_da: Number(soTaskToiDaEl.value),
        updated_at: new Date().toISOString()
    };

    setMsg("Đang lưu...");

    const { error } = await supabase
        .schema("qlnv")
        .from("cau_hinh_giao_viec_tu_dong")
        .upsert(payload, {
            onConflict: "diadiem"
        });

    if (error) {
        console.error(error);
        setMsg("Lưu cấu hình thất bại.", true);
        return;
    }

    setMsg("Đã lưu cấu hình thành công.");
}

function attachEvents() {

    btnLoad.addEventListener("click", loadConfig);

    btnSave.addEventListener("click", saveConfig);

    diadiemEl.addEventListener("change", loadConfig);
}

async function onLoginSuccess(info) {

    currentUser = info;

    attachEvents();

    await loadConfig();
}

document.addEventListener("DOMContentLoaded", () => {

    khoiTaoDangNhapDungChung({
        loginContainerId: "login-container",
        appContainerId: "app-container",
        loginApiPath: "/api/login-cs1",
        onLoginSuccess
    });

});
