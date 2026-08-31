import { supabase } from '../scripts/cafe_supabaseClient.js';
const db = () => supabase.schema('cafe');

export async function layNhomNguyenLieu(){
  const {data,error}=await db().from('cafe_nhom_nguyenlieu').select('*').eq('dang_su_dung',true).order('thu_tu');
  if(error) throw error; return data||[];
}
export async function layNguyenLieu({nhomId=null,caAn=false}={}){
  let q=db().from('cafe_nguyenlieu').select('*, nhom:cafe_nhom_nguyenlieu(id,ten_nhom)').order('ten_nguyenlieu');
  if(!caAn) q=q.eq('dang_su_dung',true);
  if(nhomId) q=q.eq('nhom_id',nhomId);
  const {data,error}=await q; if(error) throw error; return data||[];
}
export async function themNguyenLieu(payload){
  const {data,error}=await db().from('cafe_nguyenlieu').insert(payload).select().single();
  if(error) throw error; return data;
}
export async function suaNguyenLieu(id,payload){
  const {data,error}=await db().from('cafe_nguyenlieu').update(payload).eq('id',id).select().single();
  if(error) throw error; return data;
}
export async function taoPhieuNhap(payload){
  const {data,error}=await db().rpc('cafe_tao_phieunhap_nguyenlieu',payload);
  if(error) throw error; return data;
}
export async function layLichSu({tuNgay,denNgay,gioiHan=100}={}){
  let q=db().from('cafe_phieunhap_nguyenlieu').select('*').order('ngay_mua',{ascending:false}).order('id',{ascending:false}).limit(gioiHan);
  if(tuNgay) q=q.gte('ngay_mua',tuNgay);
  if(denNgay) q=q.lte('ngay_mua',denNgay);
  const {data,error}=await q; if(error) throw error; return data||[];
}
export async function layChiTietPhieu(phieuId){
  const {data,error}=await db().from('cafe_phieunhap_nguyenlieu_ct').select('*').eq('phieu_id',phieuId).order('id');
  if(error) throw error; return data||[];
}
export async function huyPhieu(phieuId,nguoiHuy,lyDo){
  const {error}=await db().rpc('cafe_huy_phieunhap_nguyenlieu',{p_phieu_id:phieuId,p_nguoi_huy:nguoiHuy,p_ly_do:lyDo});
  if(error) throw error;
}
