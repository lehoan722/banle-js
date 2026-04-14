// scripts/services/hoadonSale.js

export async function saveHoaDonBanLe(ctx) {

    console.log("👉 Service bán lẻ chạy");

    if (typeof window.luuHoaDonQuaAPI !== "function") {
        throw new Error("Không tìm thấy luuHoaDonQuaAPI (logic cũ)");
    }

    return await window.luuHoaDonQuaAPI();
}
