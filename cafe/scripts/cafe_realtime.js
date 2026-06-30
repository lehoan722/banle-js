import { supabase } from "./cafe_supabaseClient.js";
import { CAFE_SCHEMA, CAFE_TABLES } from "./cafe_config.js";

let realtimeChannel = null;
let realtimeReloadTimer = null;

export function setupCafeRealtime({ onReload }) {
  if (realtimeChannel) {
    console.log("Cafe realtime already started");
    return realtimeChannel;
  }

  console.log("Cafe realtime setup:", {
    schema: CAFE_SCHEMA,
    ban: CAFE_TABLES.BAN,
    hoadon: CAFE_TABLES.HOADON,
    hoadonCt: CAFE_TABLES.HOADON_CT,
  });

  function scheduleReload(payload) {
    console.log("Cafe realtime change:", payload);

    clearTimeout(realtimeReloadTimer);

    realtimeReloadTimer = setTimeout(async () => {
      if (typeof onReload === "function") {
        await onReload(payload);
      }
    }, 300);
  }

  realtimeChannel = supabase
    .channel("cafe-global-realtime-v2")
    .on("postgres_changes", {
      event: "*",
      schema: CAFE_SCHEMA,
      table: CAFE_TABLES.BAN,
    }, scheduleReload)
    .on("postgres_changes", {
      event: "*",
      schema: CAFE_SCHEMA,
      table: CAFE_TABLES.HOADON,
    }, scheduleReload)
    .on("postgres_changes", {
      event: "*",
      schema: CAFE_SCHEMA,
      table: CAFE_TABLES.HOADON_CT,
    }, scheduleReload)
    .subscribe((status) => {
      console.log("Cafe realtime status:", status);
    });

  window.__cafeRealtimeChannel = realtimeChannel;

  return realtimeChannel;
}

export async function removeCafeRealtime() {
  if (!realtimeChannel) return;

  await supabase.removeChannel(realtimeChannel);
  realtimeChannel = null;
}
