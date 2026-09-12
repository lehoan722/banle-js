// scripts/xaHangRules.js - V4 FAST
// RPC chi lay metadata tuoi/nhap. Luat 20/30/40/50 tinh tren ton sau kiem
// ma TimKiemNhanh da doc san. Khong tinh ton 2 lan.

const norm = v => String(v ?? "").trim().toUpperCase();

function uniqueMasps(masps){
  return [...new Set((masps||[]).map(norm).filter(Boolean))];
}

export async function getXaHangSuggestions({supabase,masps,denNgay}={}){
  if(!supabase?.rpc) throw new Error("Supabase chưa sẵn sàng.");
  const arr=uniqueMasps(masps);
  if(!arr.length) return new Map();

  const {data,error}=await supabase.rpc("rpc_goiy_xahang_meta_v4",{
    p_masps:arr,
    p_den_ngay:denNgay||null
  });
  if(error) throw error;

  const map=new Map();
  for(const r of Array.isArray(data)?data:[]){
    map.set(norm(r.masp),{
      ...r,
      tong_nhap_mua:Number(r.tong_nhap_mua||0)
    });
  }
  return map;
}

function stockSummary(sp){
  const ton=sp?.ton_sizes && typeof sp.ton_sizes==="object" ? sp.ton_sizes : {};
  let total=0;
  let allHard=true;
  let hasPositive=false;
  const sizes=[];

  for(const [key,row] of Object.entries(ton)){
    const sl=Math.max(0,Number(row?.ton_cs1||0))+Math.max(0,Number(row?.ton_cs2||0));
    if(sl<=0) continue;
    hasPositive=true;
    total+=sl;
    const m=String(key).match(/\d{1,2}/);
    const n=m?Number(m[0]):NaN;
    const hard=Number.isFinite(n) && (n===38 || n>=42);
    if(!hard) allHard=false;
    sizes.push(`${key}:${sl}`);
  }
  if(!hasPositive) allHard=false;
  return {total,allHard,sizes:sizes.join(", ")};
}

function score(meta,sp){
  if(!meta) return null;
  const st=stockSummary(sp);
  if(st.total<=0) return null;

  // Uu tien 50: nhap dau >=24m + KHONG nhap lai bat ky lan nao trong 24m.
  if(meta.nhapdau_24_thang===true && meta.co_nhap_24_thang!==true){
    return {pct:50,rule:"GIAY_24M_CLEARANCE_50_V4",st};
  }

  // Tail 20/30/40
  if(meta.co_nhap_90_ngay===true) return null;
  if(st.total<1 || st.total>2) return null;

  const tongNhap=Number(meta.tong_nhap_mua||0);
  if(tongNhap>0 && st.total/tongNhap>0.20) return null;

  if(meta.co_nhap_13_thang!==true){
    if(st.total===1) return {pct:40,rule:"GIAY_13M_1_V4",st};
    if(st.total===2 && st.allHard) return {pct:40,rule:"GIAY_13M_2_HARD_V4",st};
    return {pct:20,rule:"GIAY_13M_TAIL_20_V4",st};
  }

  if(meta.co_nhap_9_thang!==true){
    if(st.total===1) return {pct:30,rule:"GIAY_9M_1_V4",st};
    if(st.total===2 && st.allHard) return {pct:30,rule:"GIAY_9M_2_HARD_V4",st};
    return {pct:20,rule:"GIAY_9M_TAIL_20_V4",st};
  }

  if(st.total===1 && st.allHard) return {pct:30,rule:"GIAY_90D_1_HARD_V4",st};
  return {pct:20,rule:st.total===1?"GIAY_90D_1_GOOD_V4":"GIAY_90D_2_V4",st};
}

export function attachXaHangSuggestions(rows,metadataMap){
  const map=metadataMap instanceof Map?metadataMap:new Map();

  return (rows||[]).map(sp=>{
    const meta=map.get(norm(sp?.masp))||null;
    const scored=score(meta,sp);
    const rulePct=Number(scored?.pct||0);
    const adminPct=Number(sp?.giam_gia_pct||0);
    const effectivePct=Math.max(adminPct,rulePct);

    let source="";
    if(adminPct>0&&rulePct>0) source="BOTH";
    else if(adminPct>0) source="ADMIN";
    else if(rulePct>0) source="RULE";

    const detail=scored?{
      ...meta,
      goi_y_pct:rulePct,
      rule_code:scored.rule,
      ton_hientai:scored.st.total,
      sizes_con_lai:scored.st.sizes,
      tat_ca_size_kho:scored.st.allHard
    }:meta;

    return {
      ...sp,
      goi_y_xa_pct:rulePct,
      goi_y_xa_rule:scored?.rule||"",
      goi_y_xa_detail:detail,
      giam_gia_admin_pct:adminPct,
      giam_gia_hieu_luc:effectivePct,
      giam_gia_nguon:source
    };
  });
}
