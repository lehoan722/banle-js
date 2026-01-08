// scripts/luuhoadon/builders.js
// Các hàm đọc/diễn giải thông tin từ UI / pathname / sohd
export function buildCCNCtxFromPathname() {
    const p = (window.location.pathname || '').toLowerCase();
    // Mặc định
    let ctx = {
        isCCN: false,
        src: 'CS1',
        dst: 'CS2',
        loaihdGoc: '',     // xcncs1 | xcncs2
        loaihdDoiUng: '',  // ncncs2 | ncncs1
        page: p
    };

    if (p.includes('ccn1v2')) {
        ctx.isCCN = true;
        ctx.src = 'CS1';
        ctx.dst = 'CS2';
        ctx.loaihdGoc = 'xcncs1';
        ctx.loaihdDoiUng = 'ncncs2';
        return ctx;
    }
    if (p.includes('ccn2v1')) {
        ctx.isCCN = true;
        ctx.src = 'CS2';
        ctx.dst = 'CS1';
        ctx.loaihdGoc = 'xcncs2';
        ctx.loaihdDoiUng = 'ncncs1';
        return ctx;
    }
    return ctx; // không phải trang CCN
}

export function ensureExistDialog() {
    if (document.getElementById('exist-dialog')) return;

    const css = document.createElement('style');
    css.id = 'exist-dialog-css';
    css.textContent = `
  .exist-mask{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:9998}
  .exist-box{position:fixed;z-index:9999;left:50%;top:50%;transform:translate(-50%,-50%);
    width:560px;max-width:92vw;background:#fff;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.2);
    font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial}
  .exist-hd{padding:14px 18px;border-bottom:1px solid #eee;font-weight:700;font-size:16px}
  .exist-bd{padding:16px 18px;line-height:1.5;color:#333}
  .exist-actions{display:flex;gap:16px;justify-content:center;padding:16px 18px 22px}
  .exist-btn{min-width:210px;padding:12px 18px;border-radius:999px;border:2px solid transparent;
    font-weight:700;font-size:16px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.08)}
  .exist-btn.new{background:#1e88e5;color:#fff}
  .exist-btn.new:focus,.exist-btn.new:hover{filter:brightness(1.05)}
  .exist-btn.edit{background:#e8f5e9;color:#1b5e20;border-color:#a5d6a7}
  .exist-btn.edit:focus,.exist-btn.edit:hover{filter:brightness(1.03)}
  .exist-note{margin-top:8px;color:#666;font-size:13px}
  `;
    document.head.appendChild(css);

    const wrap = document.createElement('div');
    wrap.id = 'exist-dialog';
    wrap.style.display = 'none';
    wrap.innerHTML = `
    <div class="exist-mask" data-role="mask"></div>
    <div class="exist-box" role="dialog" aria-modal="true" aria-labelledby="exist-title">
      <div class="exist-hd" id="exist-title">Số hóa đơn đã tồn tại</div>
      <div class="exist-bd">
        <div>Hóa đơn có số <b id="exist-sohd"></b> đã có trong hệ thống.</div>
        <div class="exist-note">Chọn <b>Tạo hóa đơn mới</b> để hệ thống tự cấp số mới, hoặc
        <b>Sửa hóa đơn này</b> (yêu cầu xác thực) nếu bạn muốn chỉnh hóa đơn cũ.</div>
      </div>
      <div class="exist-actions">
        <button class="exist-btn new"  id="exist-new-btn">Tạo hóa đơn mới</button>
        <button class="exist-btn edit" id="exist-edit-btn">Sửa hóa đơn này</button>
      </div>
    </div>`;
    document.body.appendChild(wrap);

    // Đóng khi click nền mờ
    wrap.querySelector('[data-role="mask"]').addEventListener('click', () => {
        wrap.style.display = 'none';
    });
}

export function showExistDialog(sohd) {
    ensureExistDialog();
    const wrap = document.getElementById('exist-dialog');
    document.getElementById('exist-sohd').textContent = sohd;
    wrap.style.display = 'block';

    return new Promise(resolve => {
        const ok = document.getElementById('exist-new-btn');
        const edt = document.getElementById('exist-edit-btn');

        const cleanup = () => {
            ok.removeEventListener('click', onNew);
            edt.removeEventListener('click', onEdit);
            wrap.style.display = 'none';
        };
        const onNew = () => { cleanup(); resolve('new'); };
        const onEdit = () => { cleanup(); resolve('edit'); };

        ok.addEventListener('click', onNew);
        edt.addEventListener('click', onEdit);
    });
}

export function getDiaDiemFromLoai(loai) {
    return (String(loai).toLowerCase().includes("cs2")) ? "cs2" : "cs1";
}

export function getDiaDiemFromPageName() {
    const t = ((document?.title || '') + ' ' + (window?.location?.pathname || '')).toLowerCase();

    // Ưu tiên pathname có 'cs1'/'cs2' (vd: /banlemtcs1.html, /nhaptamcs2.html)
    if (t.includes('cs2')) return 'cs2';
    if (t.includes('cs1')) return 'cs1';

    // Fallback: tiêu đề trang chứa 'cơ sở 1/2' (không dấu)
    const normalized = t
        .replace(/cơ\s*sở/gi, 'co so')
        .replace(/[^\w\s]/g, ' ') // bỏ ký tự đặc biệt
        .replace(/\s+/g, ' ')
        .trim();

    if (normalized.includes('co so 2')) return 'cs2';
    if (normalized.includes('co so 1')) return 'cs1';

    // Cuối cùng: nếu không đoán được, trả rỗng để caller tự xử lý
    return '';
}

export function getLoaiFromSoHDInput() {
    const raw = document.getElementById('sohd')?.value?.trim().toLowerCase() || '';
    if (raw && raw.includes('_')) {
        // nếu ô sohd đã có dạng hợp lệ thì cứ cắt prefix
        return raw.split('_')[0];
    }
    // Fallback theo đường dẫn trang – KHÔNG phụ thuộc ô #sohd
    const path = location.pathname.toLowerCase();
    if (path.includes('nhaptamcs1')) return 'ntcs1';
    if (path.includes('nhapmoimtcs1')) return 'nmcs1';
    if (path.includes('nhaptamcs2')) return 'ntcs2';
    if (path.includes('nhapmoimtcs2')) return 'nmcs2';
    // thêm các trang khác nếu cần …
    return '';
}

export async function handleSpecialSoHoaDon(sohd) {
    // Chỉ cho phép chạy cơ chế "số đặc biệt → lưu 2 bản" với bán lẻ cs1/cs2
    const prefixFull = (sohd.split("_")[0] || "").toLowerCase();
    if (prefixFull !== "bancs1" && prefixFull !== "bancs2") {
        // Không phải hóa đơn bán lẻ → không kích hoạt nhánh 2 bản
        return false;
    }

    // Lấy số thứ tự
    const parts = sohd.split("_");
    if (parts.length < 2) return false;
    const num = parseInt(parts[1], 10);

    // Xác định cơ sở và điều kiện chia hết
    const diadiem = (prefixFull === "bancs2") ? "cs2" : "cs1";
    const modulus = (diadiem === "cs1") ? 3 : 4;

    // Không phải số đặc biệt → thôi
    if (Number.isNaN(num) || num % modulus !== 0) return false;

    // Giới hạn tiền theo cơ sở
    const ngay = document.getElementById("ngay").value;
    let hanMuc = (diadiem === "cs1") ? 2500000 : 7000000;

    // Tổng đã lưu trong ngày của bảng T tại cơ sở này
    const { data, error } = await supabase
        .from("hoadon_banleT")
        .select("thanhtoan")
        .eq("ngay", ngay)
        .eq("diadiem", diadiem);

    let tongTien = 0;
    if (data && data.length) {
        tongTien = data.reduce((sum, hd) => sum + (Number(hd.thanhtoan) || 0), 0);
    }

    const getIntValue = (id) =>
        parseInt(document.getElementById(id).value.replace(/[.,]/g, "") || "0", 10);
    const tienHoaDon = getIntValue("phaithanhtoan");

    // ✅ NEW RULE: chỉ gửi Viettel nếu tổng tiền hóa đơn <= 1.200.000
    const MAX_VIETTEL_PER_INVOICE = 1200000;
    if (tienHoaDon > MAX_VIETTEL_PER_INVOICE) {
        // Hóa đơn lớn hơn 1.2tr → chỉ lưu bản thường, KHÔNG lưu 2 bản, KHÔNG gửi Viettel
        return false;
    }

    if (tongTien + tienHoaDon > hanMuc) {
        // Vượt hạn mức theo ngày → chỉ lưu bản thường
        return false;
    }


    // ✅ Đủ điều kiện → lưu 2 bản và gọi Viettel (logic nằm trong luuHoaDonCaHaiBan)
    await luuHoaDonCaHaiBan();
    return true;
}

export function inferBranches() {
    const ctx = buildCCNCtxFromPathname();
    if (ctx.isCCN) {
        return { src: ctx.src, dst: ctx.dst };
    }

    // Non-CCN: đoán theo loai có cs1/cs2
    const s = String(window.sohd ?? '').toLowerCase();
    const loai = (String(window.loaihd ?? '') || '').toLowerCase();

    if (loai.includes('cs1')) return { src: 'CS1', dst: 'CS2' };
    if (loai.includes('cs2')) return { src: 'CS2', dst: 'CS1' };

    // fallback: dựa trên tiền tố sohd
    if (s.includes('cs1')) return { src: 'CS1', dst: 'CS2' };
    if (s.includes('cs2')) return { src: 'CS2', dst: 'CS1' };

    return { src: null, dst: null };
}
