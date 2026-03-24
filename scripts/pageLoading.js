// scripts/pageLoading.js

let loadingEl = null;
let loadingTextEl = null;
let autoHideTimer = null;

function ensureStyle() {
  if (document.getElementById("page-loading-style")) return;

  const style = document.createElement("style");
  style.id = "page-loading-style";
  style.textContent = `
    #pageLoadingOverlay {
      position: fixed;
      inset: 0;
      background: rgba(255,255,255,0.72);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      pointer-events: all;
    }

    #pageLoadingOverlay.show {
      display: flex;
    }

    .page-loading-box {
      min-width: 180px;
      max-width: 260px;
      padding: 12px 18px;
      border-radius: 10px;
      background: rgba(255,255,255,0.96);
      box-shadow: 0 2px 10px rgba(0,0,0,0.10);
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      color: #333;
      font-weight: 500;
      user-select: none;
    }

    .page-loading-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid #d9d9d9;
      border-top-color: #666;
      border-radius: 50%;
      animation: pageLoadingSpin 0.8s linear infinite;
      flex: 0 0 auto;
    }

    @keyframes pageLoadingSpin {
      to { transform: rotate(360deg); }
    }

    .page-loading-text {
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

function ensureElement() {
  ensureStyle();

  if (loadingEl) return loadingEl;

  loadingEl = document.createElement("div");
  loadingEl.id = "pageLoadingOverlay";
  loadingEl.innerHTML = `
    <div class="page-loading-box">
      <div class="page-loading-spinner"></div>
      <div class="page-loading-text">Đang tải trang...</div>
    </div>
  `;

  document.body.appendChild(loadingEl);
  loadingTextEl = loadingEl.querySelector(".page-loading-text");
  return loadingEl;
}

export function showPageLoading(message = "Đang tải trang...", options = {}) {
  const el = ensureElement();
  if (loadingTextEl) loadingTextEl.textContent = message;
  el.classList.add("show");

  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }

  const timeout = Number(options.timeout || 0);
  if (timeout > 0) {
    autoHideTimer = setTimeout(() => {
      hidePageLoading();
    }, timeout);
  }
}

export function hidePageLoading(delay = 0) {
  const run = () => {
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
    if (loadingEl) loadingEl.classList.remove("show");
  };

  if (delay > 0) {
    setTimeout(run, delay);
  } else {
    run();
  }
}

export function setPageLoadingText(message = "Đang tải trang...") {
  ensureElement();
  if (loadingTextEl) loadingTextEl.textContent = message;
}

export function withPageLoading(fn, message = "Đang tải trang...") {
  return async function (...args) {
    try {
      showPageLoading(message);
      return await fn(...args);
    } finally {
      hidePageLoading(100);
    }
  };
}