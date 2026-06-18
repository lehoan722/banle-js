// goiymasanpham.js

import {
    napDanhMucHangHoa
} from "./danhMucHangHoa.js";

export async function ganPopupMaSP(
    inputId,
    popupId
) {

    const input =
        document.getElementById(inputId);

    const popup =
        document.getElementById(popupId);

    if (!input || !popup) return;

    const ds = await napDanhMucHangHoa();

    input.addEventListener("input", () => {

        const kw =
            input.value.trim().toUpperCase();

        if (!kw) {
            popup.style.display = "none";
            return;
        }

        const found = ds
            .filter(x =>
                String(x.masp)
                .toUpperCase()
                .includes(kw)
            )
            .slice(0, 30);

        popup.innerHTML = "";

        found.forEach(row => {

            const div =
                document.createElement("div");

            div.style.padding = "6px";
            div.style.cursor = "pointer";

            div.innerHTML =
                `<b>${row.masp}</b> - ${row.tensp || ""}`;

            div.onclick = () => {

                input.value = row.masp;

                popup.style.display = "none";

                input.focus();
            };

            popup.appendChild(div);
        });

        popup.style.display =
            found.length
                ? "block"
                : "none";
    });
}