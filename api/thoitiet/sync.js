// /api/thoitiet/sync.js
// Vercel Serverless Function - dong bo Open-Meteo -> Supabase
// ENV BAT BUOC:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   WEATHER_SYNC_SECRET (tu chon; neu co thi goi ?secret=...)
// Vercel Cron co the dung CRON_SECRET qua Authorization: Bearer <CRON_SECRET>.

const DAILY_VARS = [
  "weather_code",
  "temperature_2m_mean",
  "temperature_2m_min",
  "temperature_2m_max",
  "apparent_temperature_mean",
  "relative_humidity_2m_mean",
  "precipitation_sum",
  "rain_sum",
  "precipitation_hours",
  "wind_speed_10m_max"
].join(",");

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`THIEU_ENV_${name}`);
  return v;
}

function checkSecret(req) {
  const qs = req.query?.secret || "";
  const auth = req.headers?.authorization || "";
  const wanted = process.env.WEATHER_SYNC_SECRET;
  const cron = process.env.CRON_SECRET;

  if (!wanted && !cron) return true;
  if (wanted && qs === wanted) return true;
  if (cron && auth === `Bearer ${cron}`) return true;
  return false;
}

async function sb(path, options={}) {
  const url = env("SUPABASE_URL").replace(/\/$/,"") + "/rest/v1/" + path;
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(url, {
    ...options,
    headers: {
      apikey:key,
      Authorization:`Bearer ${key}`,
      "Content-Type":"application/json",
      Prefer:"resolution=merge-duplicates,return=minimal",
      ...(options.headers||{})
    }
  });
  if (!r.ok) throw new Error(`SUPABASE_${r.status}: ${await r.text()}`);
  const ct = r.headers.get("content-type") || "";
  return ct.includes("json") ? r.json() : null;
}

async function getLocations() {
  const url = env("SUPABASE_URL").replace(/\/$/,"") +
    "/rest/v1/dm_dia_diem_thoitiet?select=ma_dia_diem,vi_do,kinh_do,mui_gio&dang_ap_dung=eq.true";
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(url,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function ymd(d){ return d.toISOString().slice(0,10); }
function addDays(d,n){ const x=new Date(d); x.setUTCDate(x.getUTCDate()+n); return x; }

async function openMeteo(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`OPEN_METEO_${r.status}: ${await r.text()}`);
  return r.json();
}

async function upsertRows(table, onConflict, rows) {
  for (let i=0;i<rows.length;i+=500) {
    const part = rows.slice(i,i+500);
    await sb(`${table}?on_conflict=${encodeURIComponent(onConflict)}`,{
      method:"POST",
      body:JSON.stringify(part)
    });
  }
}

function dailyRows(data, mapFn) {
  const d = data.daily || {};
  const n = d.time?.length || 0;
  const out=[];
  for(let i=0;i<n;i++) out.push(mapFn(d,i));
  return out;
}

async function syncHistory(loc) {
  const today = new Date();
  const end = addDays(today,-2); // reanalysis co do tre; tranh ngay gan nhat
  const start = new Date(Date.UTC(end.getUTCFullYear()-10,end.getUTCMonth(),end.getUTCDate()));
  const q = new URLSearchParams({
    latitude:String(loc.vi_do),
    longitude:String(loc.kinh_do),
    start_date:ymd(start),
    end_date:ymd(end),
    daily:DAILY_VARS,
    timezone:loc.mui_gio || "Asia/Bangkok"
  });
  const data = await openMeteo(`https://archive-api.open-meteo.com/v1/archive?${q}`);
  const rows = dailyRows(data,(d,i)=>({
    ma_dia_diem:loc.ma_dia_diem,
    ngay:d.time[i],
    nhiet_do_tb:d.temperature_2m_mean?.[i],
    nhiet_do_min:d.temperature_2m_min?.[i],
    nhiet_do_max:d.temperature_2m_max?.[i],
    cam_giac_tb:d.apparent_temperature_mean?.[i],
    do_am_tb:d.relative_humidity_2m_mean?.[i],
    luong_mua:d.precipitation_sum?.[i],
    luong_mua_thuan:d.rain_sum?.[i],
    so_gio_mua:d.precipitation_hours?.[i],
    gio_max:d.wind_speed_10m_max?.[i],
    ma_thoi_tiet:d.weather_code?.[i],
    nguon_du_lieu:"OPEN_METEO_ERA5_BEST_MATCH",
    cap_nhat_luc:new Date().toISOString()
  }));
  await upsertRows("thoitiet_ngay","ma_dia_diem,ngay",rows);
  return rows.length;
}

async function syncForecast15(loc) {
  const q = new URLSearchParams({
    latitude:String(loc.vi_do),
    longitude:String(loc.kinh_do),
    daily:DAILY_VARS,
    timezone:loc.mui_gio || "Asia/Bangkok",
    forecast_days:"15"
  });
  const data = await openMeteo(`https://api.open-meteo.com/v1/ecmwf?${q}`);
  const run = ymd(new Date());
  const rows = dailyRows(data,(d,i)=>({
    ma_dia_diem:loc.ma_dia_diem,
    ngay_phat_hanh:run,
    ngay_du_bao:d.time[i],
    so_ngay_du_bao_truoc:i,
    loai_du_bao:"CU_THE_15_NGAY",
    nhiet_do_tb:d.temperature_2m_mean?.[i],
    nhiet_do_min:d.temperature_2m_min?.[i],
    nhiet_do_max:d.temperature_2m_max?.[i],
    do_am_tb:d.relative_humidity_2m_mean?.[i],
    luong_mua:d.precipitation_sum?.[i],
    xac_suat_mua:null,
    gio_max:d.wind_speed_10m_max?.[i],
    ma_thoi_tiet:d.weather_code?.[i],
    muc_tin_cay:i<=5?"CAO":(i<=10?"TRUNG_BINH":"THAM_KHAO"),
    nguon_du_lieu:"ECMWF_IFS_OPEN_METEO",
    cap_nhat_luc:new Date().toISOString()
  }));
  await upsertRows("thoitiet_du_bao","ma_dia_diem,ngay_phat_hanh,ngay_du_bao,loai_du_bao",rows);
  return rows.length;
}

async function syncSeasonal(loc) {
  // Ensemble mean seamless:
  // Day 0-46: ECMWF EC46; sau do: ECMWF SEAS5 toi ~7 thang.
  const daily = [
    "temperature_2m_mean","temperature_2m_min","temperature_2m_max",
    "relative_humidity_2m_mean","precipitation_sum","weather_code","wind_speed_10m_max"
  ].join(",");
  const q = new URLSearchParams({
    latitude:String(loc.vi_do),
    longitude:String(loc.kinh_do),
    daily,
    models:"ecmwf_seasonal_ensemble_mean_seamless",
    timezone:loc.mui_gio || "Asia/Bangkok",
    forecast_days:"210"
  });
  const data = await openMeteo(`https://seasonal-api.open-meteo.com/v1/seasonal?${q}`);
  const run = ymd(new Date());

  const dailyAll = dailyRows(data,(d,i)=>({
    date:d.time[i],
    tmean:d.temperature_2m_mean?.[i],
    tmin:d.temperature_2m_min?.[i],
    tmax:d.temperature_2m_max?.[i],
    hum:d.relative_humidity_2m_mean?.[i],
    rain:d.precipitation_sum?.[i],
    code:d.weather_code?.[i],
    wind:d.wind_speed_10m_max?.[i]
  }));

  // 16-46 ngay: luu theo ngay, chi dung nhu XU HUONG.
  const rows46 = dailyAll.slice(15,46).map((x,idx)=>({
    ma_dia_diem:loc.ma_dia_diem,
    ngay_phat_hanh:run,
    ngay_du_bao:x.date,
    so_ngay_du_bao_truoc:idx+15,
    loai_du_bao:"XU_HUONG_46_NGAY",
    nhiet_do_tb:x.tmean,
    nhiet_do_min:x.tmin,
    nhiet_do_max:x.tmax,
    do_am_tb:x.hum,
    luong_mua:x.rain,
    xac_suat_mua:null,
    gio_max:x.wind,
    ma_thoi_tiet:x.code,
    muc_tin_cay:"XU_HUONG",
    nguon_du_lieu:"ECMWF_EC46_ENSEMBLE_MEAN_OPEN_METEO",
    cap_nhat_luc:new Date().toISOString()
  }));
  await upsertRows("thoitiet_du_bao","ma_dia_diem,ngay_phat_hanh,ngay_du_bao,loai_du_bao",rows46);

  // 47-210 ngay: gom theo thang, KHONG coi la du bao ngay.
  const buckets = new Map();
  for (const x of dailyAll.slice(46)) {
    const ym = x.date.slice(0,7);
    if (!buckets.has(ym)) buckets.set(ym,[]);
    buckets.get(ym).push(x);
  }
  const avg = arr => {
    const a=arr.filter(v=>Number.isFinite(Number(v))).map(Number);
    return a.length ? a.reduce((s,v)=>s+v,0)/a.length : null;
  };
  const sum = arr => {
    const a=arr.filter(v=>Number.isFinite(Number(v))).map(Number);
    return a.length ? a.reduce((s,v)=>s+v,0) : null;
  };
  const monthRows=[];
  for (const [ym,a] of buckets) {
    const [yy,mm]=ym.split("-").map(Number);
    monthRows.push({
      ma_dia_diem:loc.ma_dia_diem,
      ngay_phat_hanh:run,
      nam:yy,thang:mm,
      nhiet_do_tb:avg(a.map(x=>x.tmean)),
      nhiet_do_min_tb:avg(a.map(x=>x.tmin)),
      nhiet_do_max_tb:avg(a.map(x=>x.tmax)),
      luong_mua_tong:sum(a.map(x=>x.rain)),
      do_am_tb:avg(a.map(x=>x.hum)),
      muc_tin_cay:"XU_HUONG_MUA",
      nguon_du_lieu:"ECMWF_SEAS5_ENSEMBLE_MEAN_OPEN_METEO",
      cap_nhat_luc:new Date().toISOString()
    });
  }
  await upsertRows("thoitiet_xuhuong_thang","ma_dia_diem,ngay_phat_hanh,nam,thang",monthRows);
  return {days46:rows46.length,months:monthRows.length};
}

async function refreshIndicators(loc) {
  const url = env("SUPABASE_URL").replace(/\/$/,"") + "/rest/v1/rpc/rpc_refresh_chiso_thoitiet_v1";
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(url,{
    method:"POST",
    headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      p_dia_diem:loc.ma_dia_diem,
      p_tu:ymd(addDays(new Date(),-45)),
      p_den:ymd(new Date())
    })
  });
  if (!r.ok) throw new Error(`REFRESH_CHISO_${r.status}: ${await r.text()}`);
}


async function kiemTraKetNoi() {
  const out = {
    env: {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      WEATHER_SYNC_SECRET: !!process.env.WEATHER_SYNC_SECRET,
      CRON_SECRET: !!process.env.CRON_SECRET
    },
    supabase: null,
    open_meteo: null
  };

  try {
    const locs = await getLocations();
    out.supabase = {
      ok: true,
      so_dia_diem: locs.length,
      dia_diem: locs.map(x => x.ma_dia_diem)
    };

    const loc = locs[0];
    if (loc) {
      const q = new URLSearchParams({
        latitude:String(loc.vi_do),
        longitude:String(loc.kinh_do),
        daily:"weather_code,temperature_2m_mean,temperature_2m_min,temperature_2m_max,precipitation_sum,wind_speed_10m_max",
        timezone:loc.mui_gio || "Asia/Bangkok",
        forecast_days:"3"
      });

      const data = await openMeteo(`https://api.open-meteo.com/v1/ecmwf?${q}`);
      out.open_meteo = {
        ok:true,
        so_ngay:data?.daily?.time?.length || 0,
        tu:data?.daily?.time?.[0] || null,
        den:data?.daily?.time?.at?.(-1) || null
      };
    }
  } catch(e) {
    if (!out.supabase?.ok) out.supabase = {ok:false,error:String(e?.message||e)};
    else out.open_meteo = {ok:false,error:String(e?.message||e)};
  }

  return out;
}

async function chayAnToan(name, fn) {
  try {
    return {ok:true, ket_qua:await fn()};
  } catch(e) {
    return {ok:false, loi:String(e?.message||e)};
  }
}

export default async function handler(req,res) {
  try {
    if (!checkSecret(req)) {
      return res.status(401).json({ok:false,error:"UNAUTHORIZED"});
    }

    const mode = String(req.query?.mode || "du_bao").toLowerCase();

    if (mode === "kiemtra") {
      const kq = await kiemTraKetNoi();
      return res.status(200).json({ok:true,mode,kiem_tra:kq,at:new Date().toISOString()});
    }

    const locs = await getLocations();
    const result=[];

    for (const loc of locs) {
      const one={ma_dia_diem:loc.ma_dia_diem};

      if (mode==="lichsu" || mode==="tat_ca") {
        one.lichsu = await chayAnToan("lichsu", () => syncHistory(loc));
      }

      if (mode==="du_bao_15" || mode==="du_bao" || mode==="tat_ca") {
        one.du_bao_15 = await chayAnToan("du_bao_15", () => syncForecast15(loc));
      }

      if (mode==="xu_huong" || mode==="du_bao" || mode==="tat_ca") {
        one.xu_huong = await chayAnToan("xu_huong", () => syncSeasonal(loc));
      }

      one.chi_so = await chayAnToan("chi_so", () => refreshIndicators(loc));
      result.push(one);
    }

    const ok = result.every(x =>
      (!x.lichsu || x.lichsu.ok) &&
      (!x.du_bao_15 || x.du_bao_15.ok) &&
      (!x.xu_huong || x.xu_huong.ok)
    );

    return res.status(ok ? 200 : 207).json({
      ok,
      mode,
      result,
      at:new Date().toISOString()
    });

  } catch(e) {
    console.error(e);
    return res.status(500).json({ok:false,error:String(e?.message||e)});
  }
}
