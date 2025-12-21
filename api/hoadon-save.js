// Vercel Serverless Function: POST /api/hoadon-save
// Mục tiêu: Ẩn toàn bộ query Supabase phía client. Client chỉ gọi endpoint này.
// Yêu cầu env trên Vercel:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// (khuyến nghị thêm) SUPABASE_ANON_KEY (không bắt buộc)

const { createClient } = require('@supabase/supabase-js');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function allowCors(req, res) {
  // Cho phép gọi từ trình duyệt
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

function pickTablesByLoaihd(loaihd) {
  // Quy ước an toàn (ít rủi ro):
  // - Hóa đơn bán lẻ (ban..., bannv...) => hoadon_banle / ct_hoadon_banle
  // - Các loại còn lại (nhập, xuất, chuyển CN...) => hoadon_banleT / ct_hoadon_banleT
  const s = String(loaihd || '').toLowerCase();
  const isBanLe = s.startsWith('ban');
  return {
    headerTable: isBanLe ? 'hoadon_banle' : 'hoadon_banleT',
    lineTable: isBanLe ? 'ct_hoadon_banle' : 'ct_hoadon_banleT',
  };
}

async function getUserFromToken(supabaseAdmin, authHeader) {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { user: null, error: 'Missing Authorization Bearer token' };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return { user: null, error: error?.message || 'Invalid token' };
  }
  return { user: data.user, error: null };
}

async function getNhanVienRow(supabaseAdmin, userId) {
  // Nếu bạn có cấu trúc khác, đổi query ở đây.
  const { data, error } = await supabaseAdmin
    .from('dmnhanvien')
    .select('user_id, is_admin, manv, tennv')
    .eq('user_id', userId)
    .maybeSingle();

  // Nếu không có bản ghi dmnhanvien thì coi như không hợp lệ
  if (error) return { nv: null, error: error.message };
  if (!data) return { nv: null, error: 'User not found in dmnhanvien' };
  return { nv: data, error: null };
}

function enforceDiscountPermission(nv, header) {
  // Khóa chiết khấu phía server (bổ sung cho khóa UI)
  // Nếu user không phải admin mà truyền chietkhau > 0 => chặn.
  const isAdmin = !!nv?.is_admin;
  const ck = Number(header?.chietkhau || 0);
  if (!isAdmin && ck > 0) {
    return { ok: false, message: 'Bạn không có quyền nhập Chiết khấu.' };
  }
  return { ok: true };
}

async function saveOneInvoice({ supabaseAdmin, mode, loaihd, diadiem, header, lines }) {
  const { headerTable, lineTable } = pickTablesByLoaihd(loaihd);

  // Chuẩn hóa dữ liệu
  const safeHeader = { ...(header || {}) };
  const safeLines = Array.isArray(lines) ? lines.map(r => ({ ...(r || {}) })) : [];

  // mode
  const isNew = String(mode || '').toUpperCase() === 'NEW';
  const isEdit = String(mode || '').toUpperCase() === 'EDIT';
  if (!isNew && !isEdit) throw new Error('mode phải là NEW hoặc EDIT');

  // NEW: gọi RPC cấp số hóa đơn
  let sohd = safeHeader.sohd;
  if (isNew) {
    // Giữ hợp đồng với function hiện có của bạn
    const { data, error } = await supabaseAdmin.rpc('save_new_header', {
      p_header: safeHeader,
      p_loai: String(loaihd || ''),
      p_diadiem: String(diadiem || ''),
    });
    if (error) throw new Error(`save_new_header lỗi: ${error.message}`);

    // data có thể là array hoặc object tùy cách định nghĩa
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.sohd) throw new Error('save_new_header không trả về sohd');

    sohd = row.sohd;
    safeHeader.sohd = sohd;
    // created_at do DB set; không ép
  } else {
    if (!sohd) throw new Error('EDIT cần header.sohd');
  }

  // 1) Lưu header
  if (isNew) {
    const { error } = await supabaseAdmin.from(headerTable).insert([safeHeader]);
    if (error) throw new Error(`Insert ${headerTable} lỗi: ${error.message}`);
  } else {
    const { error } = await supabaseAdmin
      .from(headerTable)
      .update({ ...safeHeader, updated_at: new Date().toISOString() })
      .eq('sohd', sohd);
    if (error) throw new Error(`Update ${headerTable} lỗi: ${error.message}`);
  }

  // 2) Lưu lines: xóa rồi insert lại (đúng theo cách bạn đang làm, ít rủi ro)
  // Nếu bạn có cột id serial, không cần gửi.
  await supabaseAdmin.from(lineTable).delete().eq('sohd', sohd);

  if (safeLines.length > 0) {
    for (const r of safeLines) r.sohd = sohd;
    const { error } = await supabaseAdmin.from(lineTable).insert(safeLines);
    if (error) {
      // best-effort rollback
      await supabaseAdmin.from(lineTable).delete().eq('sohd', sohd);
      if (isNew) await supabaseAdmin.from(headerTable).delete().eq('sohd', sohd);
      throw new Error(`Insert ${lineTable} lỗi: ${error.message}`);
    }
  }

  return { sohd, headerTable, lineTable };
}

module.exports = async (req, res) => {
  if (allowCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'Use POST' });

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json(res, 500, { ok: false, message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env' });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    // 1) Xác thực user
    const { user, error: authErr } = await getUserFromToken(supabaseAdmin, req.headers.authorization);
    if (authErr) return json(res, 401, { ok: false, message: authErr });

    // 2) Check dmnhanvien
    const { nv, error: nvErr } = await getNhanVienRow(supabaseAdmin, user.id);
    if (nvErr) return json(res, 403, { ok: false, message: nvErr });

    // 3) Payload
    const mode = body.mode;
    const loaihd = body.loaihd || body.loai || body.p_loai;
    const diadiem = body.diadiem || body.p_diadiem || '';

    const header = body.header || body.p_header || {};
    const lines = body.lines || body.items || [];
    const counterpart = body.counterpart || null; // optional: { mode, loaihd, diadiem, header, lines }

    if (!loaihd) return json(res, 400, { ok: false, message: 'Missing loaihd' });

    // 4) Enforce quyền chiết khấu
    const perm = enforceDiscountPermission(nv, header);
    if (!perm.ok) return json(res, 403, { ok: false, message: perm.message });

    // 5) Save main invoice
    const main = await saveOneInvoice({ supabaseAdmin, mode, loaihd, diadiem, header, lines });

    // 6) Save counterpart (chuyển chi nhánh) nếu có
    let cp = null;
    if (counterpart && counterpart.header) {
      const cpPerm = enforceDiscountPermission(nv, counterpart.header);
      if (!cpPerm.ok) return json(res, 403, { ok: false, message: cpPerm.message });

      cp = await saveOneInvoice({
        supabaseAdmin,
        mode: counterpart.mode || mode,
        loaihd: counterpart.loaihd,
        diadiem: counterpart.diadiem,
        header: counterpart.header,
        lines: counterpart.lines || [],
      });
    }

    return json(res, 200, {
      ok: true,
      sohd: main.sohd,
      tables: { header: main.headerTable, lines: main.lineTable },
      counterpart: cp ? { sohd: cp.sohd, tables: { header: cp.headerTable, lines: cp.lineTable } } : null,
      user: { id: user.id, email: user.email, is_admin: !!nv.is_admin, manv: nv.manv, tennv: nv.tennv },
    });
  } catch (e) {
    return json(res, 500, { ok: false, message: e?.message || String(e) });
  }
};
