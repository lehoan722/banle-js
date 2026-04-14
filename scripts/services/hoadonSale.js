// scripts/services/hoadonSale.js

import { supabase } from '../supabaseClient.js';
import { buildInsertPayload } from '../luuhoadon/builders.js';
import { snapshotInvoiceBeforeEdit } from '../luuhoadon/api.js';

export async function saveHoaDonBanLe(ctx) {
  const { sohd, bangKetQua, isEdit } = ctx;

  const { hoadon, chitiet } = await buildInsertPayload(sohd, bangKetQua);

  if (isEdit) {
    await snapshotInvoiceBeforeEdit({ sohd });

    await supabase.from("ct_hoadon_banle").delete().eq("sohd", sohd);
    await supabase.from("hoadon_banle").delete().eq("sohd", sohd);
  }

  await supabase.from("hoadon_banle").insert([hoadon]);
  await supabase.from("ct_hoadon_banle").insert(chitiet);

  return { ok: true };
}
