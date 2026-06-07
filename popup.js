const DEFAULTS = {
  enabled: true,
  hide: true,
  mode: "hide",
  skip: true,
  skipAutoplay: false,
  threshold: 5,
  whitelist: [],
  surfaces: {
    home: true,
    search: true,
    subscriptions: true,
    channel: true,
    related: true,
  },
};

// ----- i18n: preenche textos via chrome.i18n (idioma do navegador) -----
function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const msg = chrome.i18n.getMessage(el.getAttribute("data-i18n"));
    if (msg) el.textContent = msg;
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    const msg = chrome.i18n.getMessage(el.getAttribute("data-i18n-ph"));
    if (msg) el.setAttribute("placeholder", msg);
  });
}
applyI18n();

const $enabled = document.getElementById("enabled");
const $controls = document.getElementById("controls");
const $hide = document.getElementById("hide");
const $skip = document.getElementById("skip");
const $skipAutoplay = document.getElementById("skipAutoplay");
const $threshold = document.getElementById("threshold");
const $tval = document.getElementById("tval");
const $whitelist = document.getElementById("whitelist");
const $saveWl = document.getElementById("saveWl");
const $savedMsg = document.getElementById("savedMsg");
const $pageCount = document.getElementById("pageCount");
const $totalHidden = document.getElementById("totalHidden");
const $totalSkipped = document.getElementById("totalSkipped");
const $resetStats = document.getElementById("resetStats");
const $modeBtns = document.querySelectorAll(".segmented button");
const $surfaceBtns = document.querySelectorAll(".chips button");

let currentMode = "hide";
let currentSurfaces = { ...DEFAULTS.surfaces };

// ----- carrega config -----
chrome.storage.sync.get(DEFAULTS, (cfg) => {
  $enabled.checked = cfg.enabled;
  $hide.checked = cfg.hide;
  $skip.checked = cfg.skip;
  $skipAutoplay.checked = cfg.skipAutoplay;
  $threshold.value = cfg.threshold;
  $tval.textContent = cfg.threshold;
  $whitelist.value = (cfg.whitelist || []).join("\n");
  currentMode = cfg.mode || "hide";
  currentSurfaces = { ...DEFAULTS.surfaces, ...(cfg.surfaces || {}) };
  renderMode();
  renderSurfaces();
  renderMaster();
});

function renderMaster() {
  $controls.classList.toggle("muted", !$enabled.checked);
}

function renderMode() {
  $modeBtns.forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === currentMode)
  );
}

function renderSurfaces() {
  $surfaceBtns.forEach((b) =>
    b.classList.toggle("active", currentSurfaces[b.dataset.surface] !== false)
  );
}

// ----- handlers -----
$enabled.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: $enabled.checked });
  renderMaster();
});
$hide.addEventListener("change", () =>
  chrome.storage.sync.set({ hide: $hide.checked })
);
$skip.addEventListener("change", () =>
  chrome.storage.sync.set({ skip: $skip.checked })
);
$skipAutoplay.addEventListener("change", () =>
  chrome.storage.sync.set({ skipAutoplay: $skipAutoplay.checked })
);
$threshold.addEventListener("input", () => {
  $tval.textContent = $threshold.value;
  chrome.storage.sync.set({ threshold: Number($threshold.value) });
});

$modeBtns.forEach((b) =>
  b.addEventListener("click", () => {
    currentMode = b.dataset.mode;
    renderMode();
    chrome.storage.sync.set({ mode: currentMode });
  })
);

$surfaceBtns.forEach((b) =>
  b.addEventListener("click", () => {
    const key = b.dataset.surface;
    currentSurfaces[key] = currentSurfaces[key] === false;
    renderSurfaces();
    chrome.storage.sync.set({ surfaces: currentSurfaces });
  })
);

// ----- whitelist (botao + auto-save com debounce) -----
let wlTimer = null;
function saveWhitelist(showMsg) {
  const list = $whitelist.value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  chrome.storage.sync.set({ whitelist: list }, () => {
    if (!showMsg) return;
    $savedMsg.style.display = "inline";
    setTimeout(() => ($savedMsg.style.display = "none"), 1500);
  });
}
$whitelist.addEventListener("input", () => {
  clearTimeout(wlTimer);
  wlTimer = setTimeout(() => saveWhitelist(false), 600);
});
$saveWl.addEventListener("click", () => saveWhitelist(true));

// ----- estatisticas -----
function refreshStats() {
  chrome.storage.local.get({ totalHidden: 0, totalSkipped: 0 }, (s) => {
    $totalHidden.textContent = s.totalHidden || 0;
    $totalSkipped.textContent = s.totalSkipped || 0;
  });
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: "ytsw-get-count" }, (resp) => {
      if (chrome.runtime.lastError || !resp) {
        $pageCount.textContent = "0";
        return;
      }
      $pageCount.textContent = resp.count ?? 0;
    });
  });
}

$resetStats.addEventListener("click", () => {
  chrome.storage.local.set({ totalHidden: 0, totalSkipped: 0 }, refreshStats);
});

refreshStats();
setInterval(refreshStats, 1000);
