// scripts/banhangbaomat/inHoaDonBaoMat.js

export function inHoaDonBaoMat(result, payload) {
    if (
        !result?.ok ||
        !["SAVE_REAL_V1", "EDIT_REAL_V1", "SAVE_2_BAN_REAL_V1"].includes(result?.mode)
    ) {
        return;
    }

    const sohd = result.sohd || payload.invoice?.sohd;

    const data = {
        hoadon: {
            ...(payload.invoice || {}),
            sohd
        },
        chitiet: (payload.details || []).map((x) => ({
            ...x,
            sohd,
            diadiem: payload.invoice?.diadiem,
            ngay: payload.invoice?.ngay
        }))
    };

    localStorage.setItem("data_hoadon_in", JSON.stringify(data));

    const url = result?.save_2_ban
        ? `${location.origin}/in-hoadon-db.html`
        : `${location.origin}/in-hoadon.html`;

    if (typeof window.openPrintOverlay === "function") {
        window.openPrintOverlay(url, { autoPrint: false });
        return;
    }

    window.open(url, "_blank");
}
