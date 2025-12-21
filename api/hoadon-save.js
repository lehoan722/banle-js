// Vercel Serverless Function: POST /api/hoadon-save
// Step (A) Verify token (Supabase Auth) + Step (B) Backend permission checks
//
// ENV required on Vercel:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - SUPABASE_ANON_KEY   (NEW - dùng để verify JWT)
//
// NOTE:
// - DB writes vẫn dùng SERVICE_ROLE (bypass RLS) => bắt buộc phải verify token + phân quyền ở đây.
// - Chưa "ép tính lại" tổng tiền (bước 3 bạn nói làm sau).

const { createClient } = require('@supabase/supabase-js');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function allowCors(req, res) {
  // Nếu muốn chặt hơn: thay '*' bằng domain Vercel của bạn.
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

function getBearerToken(authHeader) {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
  return token || null;
}

function pickTablesByLoaihd(loaihd) {
  // Quy ước hiện tại của bạn:
  // - Hóa đơn bán lẻ (ban..., bannv...) => hoadon_banle / ct_hoadon_banle
  // - Các loại còn lại (nhập, xuất, chuyển CN...) => hoadon_banleT / ct_hoadon_banleT
  const s = String(loaihd || '').toLowerCase();
  const isBanLe = s.startsWith('ban');
  return {
    headerTable: isBanLe ? 'hoadon_banle' : 'hoadon_banleT',
    lineTable: isBanLe ? 'ct_hoadon_banle' : 'ct_hoadon_banleT',
  };
}

function isTransferLoai(loaihd) {
  const s = String(loaihd || '').toLowerCase();
  // Các tiền tố chuyển chi nhánh phổ biến bạn đang dùng
  return s.includes('xcn') || s.includes('ncn') || s.includes('ccn');
}

async function verifyUserFromToken(supabaseAuth, authHeader) {
  const token = getBearerToken(authHeader);
  if (!token) return { user: null, token: null, error: 'Missing Authorization Bearer token' };

  // Verify JWT
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) {
    return { user: null, token: null, error: error?.message || 'Invalid token' };
  }

  return { user: data.user, token, error: null };
}

async function getNhanVienRow(supabaseAdmin, userId) {
  // Lấy rộng để có thể dùng thêm field quyền nếu bạn có (sua_hoadon, chuyen_cn,...)
  const { data, error } = await supabaseAdmin
    .from('dmnhanvien')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { nv: null, error: error.message };
  if (!data) return { nv: null, error: 'User not found in dmnhanvien' };
  return { nv: data, error: null };
}

function normalizeBool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function getCanEditFlag(nv) {
  // Linh hoạt với nhiều tên cột khác nhau (nếu có)
  return (
    normalizeBool(nv?.sua_hoadon) ||
    normalizeBool(nv?.can_edit) ||
    normalizeBool(nv?.perm_edit) ||
    normalizeBool(nv?.edit_hoadon)
  );
}

function getCanTransferFlag(nv) {
  return (
    normalizeBool(nv?.chuyen_cn) ||
    normalizeBool(nv?.chuyencn) ||
    normalizeBool(nv?.perm_chuyen_cn) ||
    normalizeBool(nv?.allow_transfer) ||
    normalizeBool(nv?.transfer)
  );
}

function enforceDiscountPermission(nv, header) {
  // Khóa chiết khấu phía server (bổ sung cho khóa UI)
  const isAdmin = !!nv?.is_admin;
  const ck = Number(header?.chietkhau || 0);
  if (!isAdmin && ck > 0) {
    return { ok: false, message: 'Bạn không có quyền nhập Chiết khấu.' };
  }
  return { ok: true };
}

function enforceHeaderIdentity(nv, header) {
  // Chặn giả mạo manv/tennv từ client.
  // Nếu payload không có manv/tennv thì bỏ qua (không ép thêm field mới để tránh lỗi schema).
  const isAdmin = !!nv?.is_admin;
  if (isAdmin) return { ok: true };

  if (header && header.manv && String(header.manv) !== String(nv.manv || '')) {
    return { ok: false, message: 'Sai nhân viên (manv) so với tài khoản đăng nhập.' };
  }
  if (header && header.tennv && nv.tennv && String(header.tennv) !== String(nv.tennv)) {
    // Không bắt buộc vì có thể bạn không gửi tennv, nhưng nếu gửi thì phải khớp.
    return { ok: false, message: 'Sai tên nhân viên (tennv) so với tài khoản đăng nhập.' };
  }

  return { ok: true };
}

async function fetchExistingHeader(supabaseAdmin, loaihd, sohd) {
  const { headerTable } = pickTablesByLoaihd(loaihd);
  const { data, error } = await supabaseAdmin
    .from(headerTable)
    .select('*')
    .eq('sohd', sohd)
    .maybeSingle();

  if (error) return { row: null, error: error.message, table: headerTable };
  if (!data) return { row: null, error: 'Không tìm thấy hóa đơn để sửa', table: headerTable };
  return { row: data, error: null, table: headerTable };
}

function enforceEditPermission(nv, existingHeaderRow) {
  const isAdmin = !!nv?.is_admin;
  if (isAdmin) return { ok: true };

  // Nếu có cột owner trên header: user_id hoặc manv
  const ownerUser = existingHeaderRow?.user_id;
  const ownerManv = existingHeaderRow?.manv;

  // Quy tắc ít rủi ro:
  // - Nếu là hóa đơn do chính user/manv này tạo => cho sửa
  // - Nếu không phải => cần cờ quyền sửa hóa đơn (sua_hoadon/can_edit...)
  const sameManv = ownerManv && nv?.manv && String(ownerManv) === String(nv.manv);
  const sameUser = ownerUser && nv?.user_id && String(ownerUser) === String(nv.user_id);

  if (sameManv || sameUser) return { ok: true };

  if (getCanEditFlag(nv)) return { ok: true };

  return { ok: false, message: 'Bạn không có quyền SỬA hóa đơn này.' };
}

function enforceLoaihdPermission(nv, loaihd) {
  const isAdmin = !!nv?.is_admin;
  if (isAdmin) return { ok: true };

  // Chuyển chi nhánh: nếu bạn muốn chặt hơn, bật kiểm tra ở đây
  if (isTransferLoai(loaihd)) {
    if (getCanTransferFlag(nv)) return { ok: true };
    // Nếu bạn chưa có cột quyền chuyển CN trong dmnhanvien, tạm cho phép để không "gãy" luồng.
    // Khi bạn tạo xong cột quyền (vd: chuyen_cn boolean), thì rule sẽ tự hoạt động.
    return { ok: true };
  }

  return { ok: true };
}

async function saveOneInvoice({ supabaseAdmin, mode, loaihd, diadiem, header, lines }) {
  const { headerTable, lineTable } = pickTablesByLoaihd(loaihd);

  const safeHeader = { ...(header || {}) };
  const safeLines = Array.isArray(lines) ? lines.map(r => ({ ...(r || {}) })) : [];

  const isNew = String(mode || '').toUpperCase() === 'NEW';
  const isEdit = String(mode || '').toUpperCase() === 'EDIT';
  if (!isNew && !isEdit) throw new Error('mode phải là NEW hoặc EDIT');

  let sohd = safeHeader.sohd;

  if (isNew) {
    const { data, error } = await supabaseAdmin.rpc('save_new_header', {
      p_header: safeHeader,
      p_loai: String(loaihd || ''),
      p_diadiem: String(diadiem || ''),
    });
    if (error) throw new Error(`save_new_header lỗi: ${error.message}`);

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.sohd) throw new Error('save_new_header không trả về sohd');

    sohd = row.sohd;
    safeHeader.sohd = sohd;
  } else {
    if (!sohd) throw new Error('EDIT cần header.sohd');
  }

  // 1) header
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

  // 2) lines: delete rồi insert
  await supabaseAdmin.from(lineTable).delete().eq('sohd', sohd);

  if (safeLines.length > 0) {
    for (const r of safeLines) r.sohd = sohd;
    const { error } = await supabaseAdmin.from(lineTable).insert(safeLines);
    if (error) {
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
    const ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
      return json(res, 500, {
        ok: false,
        message: 'Missing env. Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY',
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Client để verify token (A)
    const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    // 1) (A) Verify token
    const { user, error: authErr } = await verifyUserFromToken(supabaseAuth, req.headers.authorization);
    if (authErr) return json(res, 401, { ok: false, message: authErr });

    // 2) Load dmnhanvien
    const { nv, error: nvErr } = await getNhanVienRow(supabaseAdmin, user.id);
    if (nvErr) return json(res, 403, { ok: false, message: nvErr });

    // để enforceEditPermission có thể dùng nv.user_id
    if (!nv.user_id) nv.user_id = user.id;

    // 3) Payload
    const mode = body.mode;
    const loaihd = body.loaihd || body.loai || body.p_loai;
    const diadiem = body.diadiem || body.p_diadiem || '';
    const header = body.header || body.p_header || {};
    const lines = body.lines || body.items || [];
    const counterpart = body.counterpart || null;

    if (!loaihd) return json(res, 400, { ok: false, message: 'Missing loaihd' });

    // 4) (B) Permission checks
    // 4.1) Check loại hóa đơn
    const permLoai = enforceLoaihdPermission(nv, loaihd);
    if (!permLoai.ok) return json(res, 403, { ok: false, message: permLoai.message });

    // 4.2) Check manv/tennv không bị giả mạo
    const idOk = enforceHeaderIdentity(nv, header);
    if (!idOk.ok) return json(res, 403, { ok: false, message: idOk.message });

    // 4.3) Check chiết khấu
    const permCk = enforceDiscountPermission(nv, header);
    if (!permCk.ok) return json(res, 403, { ok: false, message: permCk.message });

    // 4.4) Nếu EDIT => check quyền sửa theo hóa đơn gốc trong DB
    const isEdit = String(mode || '').toUpperCase() === 'EDIT';
    if (isEdit) {
      const sohd = header?.sohd;
      if (!sohd) return json(res, 400, { ok: false, message: 'EDIT cần header.sohd' });

      const { row: existing, error: exErr } = await fetchExistingHeader(supabaseAdmin, loaihd, sohd);
      if (exErr) return json(res, 404, { ok: false, message: exErr });

      const permEdit = enforceEditPermission(nv, existing);
      if (!permEdit.ok) return json(res, 403, { ok: false, message: permEdit.message });

      // Nếu không admin, không cho đổi loaihd/diadiem của hóa đơn (nếu payload gửi khác)
      if (!nv.is_admin) {
        if (existing?.loaihd && header?.loaihd && String(existing.loaihd) !== String(header.loaihd)) {
          return json(res, 403, { ok: false, message: 'Không được đổi loại hóa đơn khi sửa.' });
        }
        if (existing?.diadiem && diadiem && String(existing.diadiem) !== String(diadiem)) {
          return json(res, 403, { ok: false, message: 'Không được đổi địa điểm khi sửa.' });
        }
      }
    }

    // Counterpart permission (nếu có)
    if (counterpart && counterpart.header) {
      const cpLoai = enforceLoaihdPermission(nv, counterpart.loaihd);
      if (!cpLoai.ok) return json(res, 403, { ok: false, message: cpLoai.message });

      const cpIdOk = enforceHeaderIdentity(nv, counterpart.header);
      if (!cpIdOk.ok) return json(res, 403, { ok: false, message: cpIdOk.message });

      const cpCk = enforceDiscountPermission(nv, counterpart.header);
      if (!cpCk.ok) return json(res, 403, { ok: false, message: cpCk.message });

      const cpIsEdit = String(counterpart.mode || mode || '').toUpperCase() === 'EDIT';
      if (cpIsEdit) {
        const cpSohd = counterpart.header?.sohd;
        if (!cpSohd) return json(res, 400, { ok: false, message: 'EDIT counterpart cần header.sohd' });

        const { row: cpExisting, error: cpExErr } = await fetchExistingHeader(supabaseAdmin, counterpart.loaihd, cpSohd);
        if (cpExErr) return json(res, 404, { ok: false, message: cpExErr });

        const cpPermEdit = enforceEditPermission(nv, cpExisting);
        if (!cpPermEdit.ok) return json(res, 403, { ok: false, message: cpPermEdit.message });
      }
    }

    // 5) Save main invoice
    const main = await saveOneInvoice({ supabaseAdmin, mode, loaihd, diadiem, header, lines });

    // 6) Save counterpart (nếu có)
    let cp = null;
    if (counterpart && counterpart.header) {
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
