// scripts/banhangbaomat/taoDuLieuLuu.js

function taoRequestId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    }
  );
}

function layGiaTri(selector) {
  const el = document.querySelector(selector);

  if (!el) {
    return "";
  }

  return String(el.value ?? el.textContent ?? "").trim();
}

export function taoDuLieuLuuBaoMat() {
  const requestId = taoRequestId();

  return {
    request_id: requestId,

    source_page: window.location.pathname,

    client_mode: "SECURE_TEST_V1",

    header: {
      manv: layGiaTri("#manv"),
      tennv: layGiaTri("#tennv"),
      diadiem: layGiaTri("#diadiem")
    },

    test_info: {
      created_at_client: new Date().toISOString(),
      user_agent: navigator.userAgent
    }
  };
}