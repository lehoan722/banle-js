import { getSupabaseClient } from './authModule.js';
const supabase=getSupabaseClient();
const cleanCode=v=>String(v||'').trim().toUpperCase();
const cleanBranch=v=>{const x=String(v||'').trim().toLowerCase();return x==='cs1'||x==='cs2'?x:null};
const uniqueCodes=a=>[...new Set((a||[]).map(cleanCode).filter(Boolean))];
const one=d=>Array.isArray(d)?(d[0]||null):(d||null);

export async function getSalesCapabilityV2({masps=null,diadiem=null,nhomhang=null,limit=500}={}){
  const codes=masps?uniqueCodes(masps):null;
  const {data,error}=await supabase.rpc('nlbh2_get_v2',{
    p_masps:codes&&codes.length?codes:null,
    p_diadiem:cleanBranch(diadiem),
    p_nhomhang:nhomhang?String(nhomhang).trim().toUpperCase():null,
    p_limit:Math.max(1,Math.min(Number(limit||500),5000))
  });
  if(error)throw error;return Array.isArray(data)?data:(data?[data]:[]);
}
export async function refreshSalesCapabilityV2(masps,days=365){
  const codes=uniqueCodes(masps);if(!codes.length)return{processed:0};
  const {data,error}=await supabase.rpc('nlbh2_refresh_masps_v2',{p_masps:codes,p_days:Math.max(30,Math.min(Number(days||365),1095))});
  if(error)throw error;return one(data)||{processed:0};
}
export async function refreshDirtyV2(limit=100,days=365){
  const {data,error}=await supabase.rpc('nlbh2_refresh_dirty_v2',{p_limit:Math.max(1,Math.min(Number(limit||100),500)),p_days:Math.max(30,Math.min(Number(days||365),1095))});
  if(error)throw error;return one(data)||{processed:0,remaining:0};
}
export async function compareBranchesV2(masp){
  const {data,error}=await supabase.rpc('nlbh2_compare_branches_v2',{p_masp:cleanCode(masp)});if(error)throw error;return one(data);
}
export async function getV2Status(){const {data,error}=await supabase.rpc('nlbh2_status_v2');if(error)throw error;return one(data)}
export function formatVelocityRatio(v){v=Number(v||0);if(!(v>0))return '—';const fmt=n=>Number(n).toLocaleString('vi-VN',{maximumFractionDigits:1});return v<=1?`1 SP / ${fmt(1/v)} ngày hiệu dụng`:`${fmt(v)} SP / 1 ngày hiệu dụng`;}
export const NLBH2_HELP={
 size:'Độ đầy đủ size đo mức phủ nhu cầu size THẬT của cả nhóm hàng tại cơ sở. Trọng số size học từ lịch sử bán của toàn nhóm, không suy ra từ dải size riêng của mã. Vì vậy việc shop từng chỉ nhập một vài size không tự biến các size đó thành 100% nhu cầu.',
 eff:'Ngày bán hiệu dụng là số ngày sản phẩm thực sự có cơ hội bán. Mỗi ngày được nhân với hệ số cơ hội 0–1, được học từ quan hệ thực tế giữa độ đầy đủ size và tốc độ bán. Hết hàng = 0 ngày hiệu dụng.',
 vel:'Tốc độ bán thực tế = số lượng bán / ngày bán hiệu dụng. Đây là chỉ số cốt lõi để so CS1 với CS2 mà không đánh giá oan cơ sở bị thiếu hàng hoặc gãy size.',
 cap:'Năng lực bán cơ sở là điểm tổng hợp từ tốc độ bán, conversion và xu hướng. Các thành phần được chuẩn hóa trong cùng nhóm/cơ sở; trọng số có thể học từ khả năng dự báo bán 30 ngày tiếp theo. Điểm cuối được shrink theo độ tin cậy và chất lượng dữ liệu.',
 conv:'Chuyển thành doanh số có RAW và ADJUSTED. Adjusted đã trừ hàng chuyển ra và điều chỉnh theo mức cơ hội bán thực tế trong thời gian hàng nằm tại cơ sở; đây là chỉ số ưu tiên dùng để so hiệu quả sử dụng hàng.',
 health:'Sức khỏe tồn kho hoàn toàn tách với năng lực bán. Nó đo hàng đang còn có khỏe không dựa trên coverage hiện tại, độ phù hợp của số ngày phủ tồn với nhóm, tuổi tồn và xu hướng bán. Hết hàng thì sức khỏe tồn = 0 dù năng lực bán lịch sử có thể rất cao.'
};
