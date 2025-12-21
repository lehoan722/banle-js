// scripts/luuhoadon/validators.js
// Kiểm tra dữ liệu trước khi lưu
export function resolveGroupKeyFromSP(sp) {
    // Thử lần lượt các tên cột nhóm có thể gặp trong dự án
    const candidates = ["nhomhang", "manhom", "nhom", "group_code", "nhomsp"];
    for (const key of candidates) {
        if (sp && sp[key] != null && String(sp[key]).trim() !== "") {
            return String(sp[key]).toUpperCase().trim();
        }
    }
    return null;
}

export function requireManagedAtBranch(masp, branch) {
    const upper = s => String(s || "").toUpperCase().trim();
    const sp = window.sanPhamData?.[upper(masp)];
    const br = upper(branch);

    // ❗Nếu chưa tra được catalog → giữ size (trả true)
    if (!sp) return true;

    // 1) Chủng loại GD => quản size
    if (upper(sp.chungloai || "") === "GD") return true;

    // 2) Cờ riêng của SP
    if (sp.quanlykichco === true) return true;

    // 3) Theo nhóm + địa điểm
    if (window.danhMucNhom instanceof Map && window.danhMucNhom.size) {
        const groupKey = resolveGroupKeyFromSP(sp); // manhom/nhomhang/...
        if (groupKey) {
            const nhom = window.danhMucNhom.get(upper(groupKey));
            if (nhom && nhom.quanlysize) {
                const dia = upper(nhom.diadiem || "ALL");
                return dia === "ALL" || dia === br;
            }
        }
    }

    // ✅ Không rơi vào case nào khẳng định “không size” → vẫn coi là có size
    return true;
}

