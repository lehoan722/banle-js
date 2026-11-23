const prefix = 'ht.nhapcuoi.v1.';
const running = new Map();

export function syncReceipt(client, invoice) {
  if (!/^nmcs[12]_/i.test(invoice || '')) return;
  if (running.has(invoice)) return running.get(invoice);
  const job = refresh(client, invoice).finally(() => running.delete(invoice));
  running.set(invoice, job);
  return job;
}

async function refresh(client, invoice) {
  const key = prefix + invoice;
  try { localStorage.setItem(key, '1'); } catch {}
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const {error} = await client.rpc('ht_sync_nhap_cuoi', {p_sohd:invoice});
      if (error) throw error;
      try { localStorage.removeItem(key); } catch {}
      return;
    } catch (err) {
      console.warn('Đồng bộ ngày nhập cuối', invoice, err);
      if (!attempt) await new Promise(resolve => setTimeout(resolve, 700));
    }
  }
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Phiếu ' + invoice + ' đã lưu. Bấm để đồng bộ lại ngày nhập cuối';
  retry.onclick = () => { retry.remove(); syncReceipt(client, invoice); };
  document.body.prepend(retry);
}

export async function retryReceipts(client) {
  let keys;
  try { keys = Object.keys(localStorage).filter(k => k.startsWith(prefix)); } catch { return; }
  for (const key of keys) await syncReceipt(client, key.slice(prefix.length));
}
