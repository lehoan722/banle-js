import { supabase } from "./supabaseClient.js";

const tbody = document.getElementById("ruleBody");
const btnReload = document.getElementById("btnReload");

function num(v) {
    return Number(
        String(v || "0")
            .replace(/\./g, "")
            .replace(/,/g, "")
            .replace(/[^\d-]/g, "")
    ) || 0;
}

function formatMoney(v) {
    return Number(v || 0).toLocaleString("vi-VN");
}

async function loadRules() {
    tbody.innerHTML = `<tr><td colspan="7">Đang tải...</td></tr>`;

    const { data, error } = await supabase
        .from("viettel_rule_config")
        .select("*")
        .order("diadiem", { ascending: true });

    if (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="7">Lỗi tải cấu hình</td></tr>`;
        return;
    }

    tbody.innerHTML = "";

    (data || []).forEach(row => {
        const tr = document.createElement("tr");
        tr.dataset.diadiem = row.diadiem;

        tr.innerHTML = `
      <td><b>${row.diadiem.toUpperCase()}</b></td>
      <td><input class="enabled" type="checkbox" ${row.enabled ? "checked" : ""}></td>
      <td><input class="auto_send" type="checkbox" ${row.auto_send ? "checked" : ""}></td>
      <td><input class="send_every_n" value="${row.send_every_n || 1}"></td>
      <td><input class="daily_limit" value="${formatMoney(row.daily_limit)}"></td>
      <td><input class="invoice_limit" value="${formatMoney(row.invoice_limit)}"></td>
      <td><button class="save">Lưu</button></td>
    `;

        tr.querySelector(".save").addEventListener("click", () => saveRule(tr));
        tbody.appendChild(tr);
    });
}

async function saveRule(tr) {
    const diadiem = tr.dataset.diadiem;

    const payload = {
        enabled: tr.querySelector(".enabled").checked,
        auto_send: tr.querySelector(".auto_send").checked,
        send_every_n: Math.max(1, parseInt(tr.querySelector(".send_every_n").value || "1", 10)),
        daily_limit: num(tr.querySelector(".daily_limit").value),
        invoice_limit: num(tr.querySelector(".invoice_limit").value),
        updated_at: new Date().toISOString(),
        updated_by: localStorage.getItem("manv") || ""
    };

    if (payload.send_every_n < 1) {
        alert("Chu kỳ gửi phải lớn hơn hoặc bằng 1");
        return;
    }

    if (payload.daily_limit <= 0 || payload.invoice_limit <= 0) {
        alert("Giới hạn tiền phải lớn hơn 0");
        return;
    }

    const { error } = await supabase
        .from("viettel_rule_config")
        .update(payload)
        .eq("diadiem", diadiem);

    if (error) {
        console.error(error);
        alert("❌ Lưu thất bại");
        return;
    }

    alert("✅ Đã lưu cấu hình " + diadiem.toUpperCase());
    await loadRules();
}

btnReload.addEventListener("click", loadRules);
loadRules();
