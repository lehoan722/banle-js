// /api/thoitiet/sync.js
// Vercel Serverless Function - dong bo Open-Meteo -> Supabase
// V1.3: lich su chia theo nam, kiem tra nam thieu, nap bo sung phan thieu
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


function isLeapYear(y) {
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
}

function expectedDaysForYear(year) {
  const today = new Date();
  const safeEnd = addDays(today,-2); // reanalysis co do tre
  const currentYear = safeEnd.getUTCFullYear();

  if (year < currentYear) return isLeapYear(year) ? 366 : 365;
  if (year > currentYear) return 0;

  const start = new Date(Date.UTC(year,0,1));
  return Math.floor((safeEnd - start) / 86400000) + 1;
}

function historyRangeForYear(year) {
  const today = new Date();
  const safeEnd = addDays(today,-2);
  const currentYear = safeEnd.getUTCFullYear();

  const start = new Date(Date.UTC(year,0,1));
  const end = year === currentYear
    ? safeEnd
    : new Date(Date.UTC(year,11,31));

  return {start,end};
}

async function countHistoryYear(loc, year) {
  const {start,end} = historyRangeForYear(year);
  if (end < start) return 0;

  const url = env("SUPABASE_URL").replace(/\/$/,"") +
    `/rest/v1/thoitiet_ngay?select=ngay&ma_dia_diem=eq.${encodeURIComponent(loc.ma_dia_diem)}` +
    `&ngay=gte.${ymd(start)}&ngay=lte.${ymd(end)}`;

  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(url,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
  if (!r.ok) throw new Error(`SUPABASE_COUNT_${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.length;
}

async function checkHistoryYears(loc, fromYear, toYear) {
  const out=[];
  for(let y=fromYear;y<=toYear;y++) {
    const expected = expectedDaysForYear(y);
    const count = await countHistoryYear(loc,y);
    out.push({
      nam:y,
      so_dong:count,
      so_ngay_can_co:expected,
      trang_thai: expected > 0 && count >= expected ? "DU" : "THIEU",
      thieu: Math.max(0, expected-count)
    });
  }
  return out;
}

async function syncHistoryYear(loc, year) {
  const {start,end} = historyRangeForYear(year);
  if (end < start) {
    return {nam:year,bo_qua:true,ly_do:"NAM_TUONG_LAI"};
  }

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

  return {
    nam:year,
    tu:ymd(start),
    den:ymd(end),
    so_dong_ghi:rows.length
  };
}

async function syncHistoryRange(loc, fromYear, toYear) {
  if (toYear < fromYear) throw new Error("TU_NAM_LON_HON_DEN_NAM");
  if (toYear - fromYear + 1 > 2) {
    throw new Error("MOI_LAN_CHI_NEN_DONG_BO_TOI_DA_2_NAM_DE_TRANH_TIMEOUT");
  }

  const result=[];
  for(let y=fromYear;y<=toYear;y++) {
    result.push(await syncHistoryYear(loc,y));
  }
  return result;
}

async function syncMissingHistory(loc, fromYear, toYear) {
  const check = await checkHistoryYears(loc,fromYear,toYear);
  const missing = check.filter(x=>x.trang_thai==="THIEU").slice(0,2);
  const synced=[];

  for(const x of missing) {
    synced.push(await syncHistoryYear(loc,x.nam));
  }

  return {
    kiem_tra:check,
    da_dong_bo:synced,
    con_thieu:check.filter(x=>x.trang_thai==="THIEU").length - synced.length
  };
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

    const safeEnd = addDays(new Date(),-2);
    const defaultToYear = safeEnd.getUTCFullYear();
    const defaultFromYear = defaultToYear - 9;

    const qYear = Number(req.query?.nam);
    const qFrom = Number(req.query?.tu_nam);
    const qTo = Number(req.query?.den_nam);

    const fromYear = Number.isInteger(qFrom) ? qFrom : defaultFromYear;
    const toYear = Number.isInteger(qTo) ? qTo : defaultToYear;

    for (const loc of locs) {
      const one={ma_dia_diem:loc.ma_dia_diem};

      if (mode==="kiemtra_lichsu") {
        one.lichsu = await chayAnToan("kiemtra_lichsu", () =>
          checkHistoryYears(loc,fromYear,toYear)
        );
        result.push(one);
        continue;
      }

      if (mode==="lichsu") {
        if (Number.isInteger(qYear)) {
          one.lichsu = await chayAnToan("lichsu_nam", () =>
            syncHistoryYear(loc,qYear)
          );
        } else {
          one.lichsu = await chayAnToan("lichsu_khoang", () =>
            syncHistoryRange(loc,fromYear,toYear)
          );
        }
      }

      if (mode==="lichsu_thieu") {
        one.lichsu = await chayAnToan("lichsu_thieu", () =>
          syncMissingHistory(loc,fromYear,toYear)
        );
      }

      if (mode==="du_bao_15" || mode==="du_bao" || mode==="tat_ca") {
        one.du_bao_15 = await chayAnToan("du_bao_15", () => syncForecast15(loc));
      }

      if (mode==="xu_huong" || mode==="du_bao" || mode==="tat_ca") {
        one.xu_huong = await chayAnToan("xu_huong", () => syncSeasonal(loc));
      }

      if (mode!=="kiemtra_lichsu") {
        one.chi_so = await chayAnToan("chi_so", () => refreshIndicators(loc));
      }

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
      tham_so:{
        nam:Number.isInteger(qYear)?qYear:null,
        tu_nam:fromYear,
        den_nam:toYear
      },
      result,
      at:new Date().toISOString()
    });

  } catch(e) {
    console.error(e);
    return res.status(500).json({ok:false,error:String(e?.message||e)});
  }
}
