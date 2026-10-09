import { getSupabaseClient } from './authModule.js';
const supabase = getSupabaseClient();

const cleanCodes = a => [...new Set((a||[]).map(x=>String(x||'').trim().toUpperCase()).filter(Boolean))];

export async function getNhapBuV1({masps=null,nhacc=null,ngay=null,limit=1000}={}){
  const codes = masps ? cleanCodes(masps) : null;
  const {data,error}=await supabase.rpc('rpc_goiy_nhapbu_v1',{
    p_masps: codes?.length ? codes : null,
    p_nhacc: nhacc?.trim() || null,
    p_ngay: ngay || null,
    p_limit: Math.max(1,Math.min(Number(limit||1000),2000))
  });
  if(error) throw error;
  return Array.isArray(data)?data:[];
}

export async function refreshNhapBuV1({masps=null,nhacc=null,days=365}={}){
  const codes = masps ? cleanCodes(masps) : null;
  const {data,error}=await supabase.rpc('rpc_nhapbu_refresh_v1',{
    p_masps: codes?.length ? codes : null,
    p_nhacc: nhacc?.trim() || null,
    p_days: Math.max(30,Math.min(Number(days||365),1095))
  });
  if(error) throw error;
  return Array.isArray(data)?(data[0]||{}):(data||{});
}

export async function getNhapBuConfig(){
  const {data,error}=await supabase.rpc('rpc_nhapbu_cauhinh_get_v1');
  if(error) throw error;
  return data||{};
}

export async function setNhapBuConfig(chung){
  const {data,error}=await supabase.rpc('rpc_nhapbu_cauhinh_set_v1',{p_chung:chung||{}});
  if(error) throw error;
  return data||{};
}

export async function phanBoSizeNhapBu(masp,tongSl,ngay=null){
  const {data,error}=await supabase.rpc('rpc_nhapbu_phanbo_size_v1',{
    p_masp:String(masp||'').trim().toUpperCase(),
    p_tong_sl:Number(tongSl||0),
    p_ngay:ngay||null
  });
  if(error) throw error;
  return Array.isArray(data)?data:[];
}
export async function getTongQuanNccNhapBuV1(ngay=null){
  const {data,error}=await supabase.rpc('rpc_nhapbu_tongquan_ncc_v1',{
    p_ngay:ngay||null
  });
  if(error) throw error;
  return Array.isArray(data)?data:[];
}

export async function getTongQuanHeThongNhapBuV1(ngay=null){
  const {data,error}=await supabase.rpc('rpc_nhapbu_tongquan_hethong_v1',{
    p_ngay:ngay||null
  });
  if(error) throw error;
  return data||{};
}
