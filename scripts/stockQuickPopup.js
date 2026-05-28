// stockQuickPopup.js
// File điều phối trung tâm.
// Các trang HTML vẫn chỉ cần gọi: <script src="scripts/stockQuickPopup.js"></script>
// File này tự nạp các file con và giữ nguyên API cũ: window.StockQuick, window.stockQuickPopup.

(function () {
  "use strict";

  const DEPENDENCIES = [
    "stockQuickUtils.js",
    "stockQuickColor.js",
    "stockQuickImage.js",
    "stockQuickVitri.js",
    "stockQuickData.js",
    "stockQuickRender.js",
  ];

  function getBasePath() {
    const current = document.currentScript;
    if (current && current.src) {
      return current.src.substring(0, current.src.lastIndexOf("/") + 1);
    }
    return "scripts/";
  }

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const abs = new URL(src, window.location.href).href;
      const existed = Array.from(document.scripts).find(s => s.src === abs);

      if (existed) {
        if (existed.dataset.loaded === "1") return resolve();
        existed.addEventListener("load", () => resolve(), { once: true });
        existed.addEventListener("error", () => reject(new Error("Không nạp được " + src)), { once: true });
        return;
      }

      const s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.onload = () => {
        s.dataset.loaded = "1";
        resolve();
      };
      s.onerror = () => reject(new Error("Không nạp được " + src));
      document.head.appendChild(s);
    });
  }

  const basePath = getBasePath();
  const readyPromise = (async () => {
    for (const file of DEPENDENCIES) {
      await loadScriptOnce(basePath + file);
    }
  })().catch(err => {
    console.error("[StockQuickPopup] Lỗi nạp module con:", err);
    throw err;
  });

  let globalHost = null;
  let globalCloseBound = false;
  let lastStockQuickOpenAt = 0;

  function hideAllPopups() {
    document.querySelectorAll(".sq-stock-popup.show").forEach((p) => {
      p.classList.remove("show");
    });
  }

  function bindColorLinks(popup) {
    if (!popup) return;

    popup.querySelectorAll(".sq-color-link[data-color-masp]")
      .forEach(link => {
        link.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          const targetMasp = String(link.dataset.colorMasp || "").trim().toUpperCase();
          if (!targetMasp) return;

          await ensurePopup(document.body, targetMasp);
        });
      });
  }

  function bindGlobalCloseHandlers() {
    if (globalCloseBound) return;
    globalCloseBound = true;

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.key === "Esc") hideAllPopups();
    });

    document.addEventListener("click", (e) => {
      const popup = document.querySelector(".sq-stock-popup.show");
      if (!popup) return;

      if (Date.now() - lastStockQuickOpenAt < 350) return;
      if (e.target.closest(".sq-stock-popup")) return;

      hideAllPopups();
    });
  }

  function makeDraggable(popup, handle) {
    if (!popup || !handle) return;

    let dragging = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    const getPoint = (e) => e.touches && e.touches[0] ? e.touches[0] : e;

    const onDown = (e) => {
      if (e.target.closest(".sq-color-link")) return;
      if (e.target.closest(".sq-photo-btn")) return;
      if (e.target.closest(".sq-close")) return;

      const p = getPoint(e);
      dragging = true;
      startX = p.clientX;
      startY = p.clientY;

      const rect = popup.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onUp);
    };

    const onMove = (e) => {
      if (!dragging) return;
      if (e.cancelable) e.preventDefault();

      const p = getPoint(e);
      const dx = p.clientX - startX;
      const dy = p.clientY - startY;

      let left = startLeft + dx;
      let top = startTop + dy;

      const vw = window.innerWidth || document.documentElement.clientWidth;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const rect = popup.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      if (left < 0) left = 0;
      if (top < 0) top = 0;
      if (left + w > vw) left = vw - w;
      if (top + h > vh) top = vh - h;

      popup.style.left = left + "px";
      popup.style.top = top + "px";
      popup.style.right = "auto";
      popup.style.transform = "none";
    };

    const onUp = () => {
      dragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    };

    handle.addEventListener("mousedown", onDown);
    handle.addEventListener("touchstart", onDown, { passive: false });
  }

  function bindOpenSimilarRows(popup) {
    if (!popup) return;

    const tbody = popup.querySelector("tbody");
    if (!tbody) return;
    if (tbody.dataset.similarBound === "1") return;
    tbody.dataset.similarBound = "1";

    let opening = false;
    let lastOpenAt = 0;

    function findClickableRow(target) {
      if (!target) return null;
      const tr = target.closest("tr.sq-open-similar-row");
      if (!tr || !tbody.contains(tr)) return null;
      return tr;
    }

    async function runOpen(tr) {
      if (!tr) return;
      if (tr.classList.contains("sq-hide-row")) return;

      const now = Date.now();
      if (opening) return;
      if (now - lastOpenAt < 450) return;

      const size = String(tr.dataset.size || "").trim();
      const masp = String(popup.dataset.masp || "").trim().toUpperCase();
      const nhomhang = String(popup.dataset.nhomhang || "").trim();

      if (!size || !masp || !nhomhang) return;

      if (!window.StockQuickSimilar || typeof window.StockQuickSimilar.openFromPopup !== "function") {
        console.warn("[StockQuickPopup] StockQuickSimilar chưa sẵn sàng");
        return;
      }

      opening = true;
      lastOpenAt = now;
      tr.classList.add("sq-row-press");

      try {
        await Promise.resolve(
          window.StockQuickSimilar.openFromPopup({
            masp,
            size,
            nhomhang,
            denNgay: window.StockQuickUtils.getDenNgay()
          })
        );
      } catch (err) {
        console.warn("[StockQuickPopup] openFromPopup error:", err);
      } finally {
        setTimeout(() => tr.classList.remove("sq-row-press"), 180);
        setTimeout(() => { opening = false; }, 250);
      }
    }

    tbody.addEventListener("click", (e) => {
      const tr = findClickableRow(e.target);
      if (!tr) return;

      e.preventDefault();
      e.stopPropagation();
      runOpen(tr);
    });

    tbody.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") return;
      const tr = findClickableRow(e.target);
      if (!tr) return;

      e.preventDefault();
      e.stopPropagation();
      runOpen(tr);
    });

    tbody.addEventListener("pointerdown", (e) => {
      const tr = findClickableRow(e.target);
      if (!tr) return;
      tr.classList.add("sq-row-press");
    });

    tbody.addEventListener("pointercancel", (e) => {
      const tr = findClickableRow(e.target);
      if (!tr) return;
      tr.classList.remove("sq-row-press");
    });

    tbody.addEventListener("pointerleave", (e) => {
      const tr = findClickableRow(e.target);
      if (!tr) return;
      tr.classList.remove("sq-row-press");
    });

    tbody.addEventListener("touchstart", (e) => {
      const tr = findClickableRow(e.target);
      if (!tr) return;
      tr.classList.add("sq-row-press");
    }, { passive: true });

    tbody.addEventListener("touchend", (e) => {
      const tr = findClickableRow(e.target);
      if (!tr) return;
      setTimeout(() => tr.classList.remove("sq-row-press"), 180);
    }, { passive: true });
  }

  async function ensurePopup(card, masp) {
    await readyPromise;

    if (!card) return;

    if (!globalHost) {
      globalHost = document.createElement("div");
      globalHost.id = "sq-stock-host";
      document.body.appendChild(globalHost);
    }

    const payload = await window.StockQuickData.fetchTonBanByMasp(masp);
    globalHost.innerHTML = window.StockQuickRender.buildTableHtml(masp, payload);

    const popup = globalHost.querySelector(".sq-stock-popup");
    if (!popup) return;

    popup.dataset.masp = String(masp || "").trim().toUpperCase();
    popup.dataset.nhomhang = payload.nhomhang || "";

    window.StockQuickRender.applyAutoFitInPopup(popup);
    window.StockQuickVitri.bindVitriActions(popup);
    bindColorLinks(popup);
    bindOpenSimilarRows(popup);
    window.StockQuickImage.bindPhotoButton(popup);

    popup.querySelectorAll(".sq-vitri-input, .sq-vitri-save-btn").forEach((el) => {
      el.addEventListener("click", (e) => e.stopPropagation());
    });

    const closeBtn = popup.querySelector(".sq-close");
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        popup.classList.remove("show");
      };
    }

    const hideRow = popup.querySelector(".sq-hide-row");
    if (hideRow) {
      hideRow.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        popup.classList.remove("show");
      });
    }

    const headerEl = popup.querySelector(".sq-stock-popup-header");
    if (headerEl && !headerEl.dataset.dragBound) {
      makeDraggable(popup, headerEl);
      headerEl.dataset.dragBound = "1";
    }

    popup.style.position = "fixed";
    popup.style.top = "8px";
    popup.style.right = "8px";
    popup.style.left = "auto";
    popup.style.transform = "none";

    bindGlobalCloseHandlers();
    hideAllPopups();

    lastStockQuickOpenAt = Date.now();
    popup.classList.add("show");
  }

  function attach(card, masp) {
    if (!card || !masp) return;

    card.addEventListener("click", async (e) => {
      e.stopPropagation();

      const targetMasp = String(masp).trim().toUpperCase();
      const current = document.querySelector(".sq-stock-popup.show");

      if (current && current.dataset.masp === targetMasp) {
        hideAllPopups();
        return;
      }

      await ensurePopup(card, masp);
    });
  }

  async function showFor(card, masp) {
    return ensurePopup(card || document.body, masp);
  }

  function attachInput(inputOrSelector) {
    const input =
      typeof inputOrSelector === "string"
        ? document.querySelector(inputOrSelector)
        : inputOrSelector;

    if (!input) return;

    if (input.dataset.stockQuickInputBound === "1") return;
    input.dataset.stockQuickInputBound = "1";

    async function openFromInput(e) {
      const masp = String(input.value || "").trim().toUpperCase();
      if (!masp) return;

      e?.preventDefault?.();
      e?.stopPropagation?.();

      await ensurePopup(input, masp);
    }

    input.addEventListener("click", openFromInput);
  }

  window.StockQuick = {
    ready: readyPromise,
    attach,
    showFor,
    attachInput,
    hideAll: hideAllPopups,
    bindColorLinks,
  };

  window.stockQuickPopup = function (masp) {
    return window.StockQuick.showFor(document.body, masp);
  };

  document.addEventListener("DOMContentLoaded", () => {
    window.StockQuick.attachInput("#masp");
  });
})();
