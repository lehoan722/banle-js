import { getSupabaseClient } from './authModule.js';
const supabase = getSupabaseClient();

const cleanCodes = a => [...new Set((a||[]).map(x=>String(x||'').trim().toUpperCase()).filter(Boolean))];

export async function refreshNhapBuV2({ngay=null,masps=null,nhacc=null}={}){
  const codes=masps?cleanCodes(masps):null;
  const {data,error}=await supabase.rpc('rpc_nhapbu2_refresh_v1',{
    p_ngay:ngay||null,
    p_masps:codes?.length?codes:null,
    p_nhacc:nhacc?.trim()||null
  });
  if(error) throw error;
  return Array.isArray(data)?(data[0]||{}):(data||{});
}

export async function tongQuanHeThongV2(ngay=null){
  const {data,error}=await supabase.rpc('rpc_nhapbu2_tongquan_hethong_v1',{p_ngay:ngay||null});
  if(error) throw error;
  return data||{};
}

export async function tongQuanNccV2(ngay=null){
  const {data,error}=await supabase.rpc('rpc_nhapbu2_tongquan_ncc_v1',{p_ngay:ngay||null});
  if(error) throw error;
  return Array.isArray(data)?data:[];
}

export async function chiTietNhapBuV2({ngay=null,masps=null,nhacc=null,hienTatCa=false}={}){
  const codes=masps?cleanCodes(masps):null;
  const {data,error}=await supabase.rpc('rpc_nhapbu2_chitiet_v1',{
    p_ngay:ngay||null,
    p_masps:codes?.length?codes:null,
    p_nhacc:nhacc?.trim()||null,
    p_hien_tat_ca:!!hienTatCa
  });
  if(error) throw error;
  return Array.isArray(data)?data:[];
}

export async function kiemTraNguonV2(masp,ngay=null){
  const {data,error}=await supabase.rpc('rpc_nhapbu2_kiemtra_nguon_v1',{
    p_masp:String(masp||'').trim().toUpperCase(),
    p_ngay:ngay||null
  });
  if(error) throw error;
  return data||{};
}

export async function phanBoSizeV2(masp,tongSl,ngay=null){
  const {data,error}=await supabase.rpc('rpc_nhapbu2_phanbo_size_v1',{
    p_masp:String(masp||'').trim().toUpperCase(),
    p_tong_sl:Number(tongSl||0),
    p_ngay:ngay||null
  });
  if(error) throw error;
  return Array.isArray(data)?data:[];
}

export async function getConfigV2(){
  const {data,error}=await supabase.rpc('rpc_nhapbu2_cauhinh_get_v1');
  if(error) throw error;
  return data||{};
}

export async function setConfigV2(chung){
  const {data,error}=await supabase.rpc('rpc_nhapbu2_cauhinh_set_v1',{p_chung:chung||{}});
  if(error) throw error;
  return data||{};
}

export async function resetConfigV2(){
  const {data,error}=await supabase.rpc('rpc_nhapbu2_cauhinh_reset_v1');
  if(error) throw error;
  return data||{};
}
