import { supabase } from "./cafe_supabaseClient.js";
import { CAFE_SCHEMA, CAFE_TABLES } from "./cafe_config.js";

let realtimeChannel = null;
let realtimeReloadTimer = null;

export function setupCafeRealtime({ onReload }) {
  if (realtimeChannel) {
    return realtimeChannel;
  }

  function scheduleReload(payload) {
    console.log("Cafe realtime change:", payload);

    clearTimeout(realtimeReloadTimer);

    realtimeReloadTimer = setTimeout(() => {
      if (typeof onReload === "function") {
        onReload(payload);
      }
    }, 300);
  }

  realtimeChannel = supabase
    .channel("cafe-global-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: CAFE_SCHEMA,
        table: CAFE_TABLES.BAN,
      },
      scheduleReload
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: CAFE_SCHEMA,
        table: CAFE_TABLES.HOADON,
      },
      scheduleReload
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: CAFE_SCHEMA,
        table: CAFE_TABLES.HOADON_CT,
      },
      scheduleReload
    )
    .subscribe((status) => {
      console.log("Cafe realtime status:", status);
    });

  return realtimeChannel;
}

export async function removeCafeRealtime() {
  if (!realtimeChannel) return;

  await supabase.removeChannel(realtimeChannel);
  realtimeChannel = null;
}
