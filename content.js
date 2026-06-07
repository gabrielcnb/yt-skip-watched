// YT Skip Watched — esconde/atenua e/ou pula videos ja assistidos (barra vermelha).

const DEFAULTS = {
  enabled: true, // interruptor mestre
  hide: true, // agir nas listas (esconder ou atenuar)
  mode: "hide", // "hide" | "dim"
  skip: true, // pular faixas vistas na fila do Mix/playlist
  skipAutoplay: false, // experimental: na watch page sem playlist, ao terminar
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

let settings = { ...DEFAULTS };
let pageHiddenCount = 0; // quantos cards estao escondidos AGORA nesta pagina

// ----- estado/config -----
chrome.storage.sync.get(DEFAULTS, (cfg) => {
  settings = mergeSettings(cfg);
  scheduleHide();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  const next = {};
  for (const k in changes) next[k] = changes[k].newValue;
  settings = mergeSettings({ ...settings, ...next });
  // qualquer mudanca de config invalida o cache e re-avalia tudo
  cardState = new WeakMap();
  if (!settings.enabled || !settings.hide) unhideAll();
  scheduleHide();
});

// garante que `surfaces` venha completo mesmo se o storage tiver um objeto parcial
function mergeSettings(cfg) {
  return {
    ...DEFAULTS,
    ...cfg,
    surfaces: { ...DEFAULTS.surfaces, ...(cfg && cfg.surfaces) },
  };
}

// ----- estatisticas (storage.local, escrita com debounce) -----
let pendingHidden = 0;
let pendingSkipped = 0;
let flushTimer = null;

function bumpStat(kind, n = 1) {
  if (kind === "hidden") pendingHidden += n;
  else pendingSkipped += n;
  if (flushTimer) return;
  flushTimer = setTimeout(flushStats, 3000);
}

function flushStats() {
  flushTimer = null;
  if (!pendingHidden && !pendingSkipped) return;
  const h = pendingHidden;
  const s = pendingSkipped;
  pendingHidden = 0;
  pendingSkipped = 0;
  chrome.storage.local.get({ totalHidden: 0, totalSkipped: 0 }, (cur) => {
    chrome.storage.local.set({
      totalHidden: (cur.totalHidden || 0) + h,
      totalSkipped: (cur.totalSkipped || 0) + s,
    });
  });
}

window.addEventListener("pagehide", flushStats);

// ----- superficie atual (home, busca, etc) -----
function currentSurface() {
  const p = location.pathname;
  if (p === "/") return "home";
  if (p === "/results") return "search";
  if (p.startsWith("/feed/subscriptions")) return "subscriptions";
  if (p === "/watch") return "related";
  if (
    p.startsWith("/@") ||
    p.startsWith("/channel/") ||
    p.startsWith("/c/") ||
    p.startsWith("/user/")
  )
    return "channel";
  return null; // paginas nao mapeadas: aplica por padrao
}

function surfaceEnabled() {
  const s = currentSurface();
  if (!s) return true;
  return settings.surfaces[s] !== false;
}

// ----- deteccao da barra vermelha -----
// O YouTube usa VARIAS implementacoes da barra de progresso conforme a
// superficie (fila do Mix, busca, home, recomendacoes de musica...). Cobrimos
// todas: a antiga baseada em #progress e a nova (web components "ytwBadge"/
// "ProgressBar"). Em todos os casos a largura em % representa o quanto foi visto.
const PROGRESS_SELECTORS = [
  // implementacao antiga (resume playback overlay)
  "ytd-thumbnail-overlay-resume-playback-renderer #progress",
  "#progress",
  // implementacao nova (lit/polymer ytwThumbnailOverlay...)
  ".ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment",
  ".ytThumbnailOverlayProgressBarHost div",
  // fallback generico por nome de classe contendo "progress"
  "[class*='ProgressBar'] [style*='width']",
];

function readWidthPct(el) {
  if (!el) return 0;
  // 1) style inline (ex: "73%")
  const inline = el.style && el.style.width;
  if (inline && inline.includes("%")) {
    const p = parseFloat(inline);
    if (!isNaN(p) && p > 0) return p;
  }
  // 2) largura computada vs largura do pai (quando o YT usa px ou transform)
  const parent = el.parentElement;
  if (parent) {
    const w = el.getBoundingClientRect().width;
    const pw = parent.getBoundingClientRect().width;
    if (pw > 0 && w > 0) return (w / pw) * 100;
  }
  return 0;
}

function watchedPercent(card) {
  let max = 0;
  for (const sel of PROGRESS_SELECTORS) {
    const els = card.querySelectorAll(sel);
    for (const el of els) {
      const pct = readWidthPct(el);
      if (pct > max) max = pct;
    }
  }
  return max;
}

function isWatched(card) {
  return watchedPercent(card) >= settings.threshold;
}

// Seletores dos "cards" de video em todas as superficies do YouTube.
const CARD_SELECTORS = [
  "ytd-rich-item-renderer", // home
  "ytd-video-renderer", // busca / resultados
  "ytd-compact-video-renderer", // sidebar de relacionados
  "ytd-grid-video-renderer", // grids (canal, etc)
  "ytd-playlist-panel-video-renderer", // fila do Mix / playlist lateral
  "ytd-rich-grid-media",
  "yt-lockup-view-model", // cards novos (busca/musica - UI nova)
  "ytd-compact-radio-renderer",
];
const CARD_QUERY = CARD_SELECTORS.join(",");

const HIDDEN_ATTR = "data-ytsw-hidden";
const MODE_ATTR = "data-ytsw-mode";

// cache por card: evita reescrever o DOM quando o estado nao mudou
let cardState = new WeakMap(); // card -> { hidden: bool }

function setHidden(card, hidden) {
  const prev = cardState.get(card);
  const wasHidden = prev ? prev.hidden : card.hasAttribute(HIDDEN_ATTR);

  if (hidden) {
    card.setAttribute(HIDDEN_ATTR, "1");
    card.setAttribute(MODE_ATTR, settings.mode);
    if (!wasHidden) bumpStat("hidden"); // conta so na transicao visivel -> escondido
  } else {
    card.removeAttribute(HIDDEN_ATTR);
    card.removeAttribute(MODE_ATTR);
  }
  cardState.set(card, { hidden });
}

function unhideAll() {
  document.querySelectorAll("[" + HIDDEN_ATTR + "]").forEach((el) => {
    el.removeAttribute(HIDDEN_ATTR);
    el.removeAttribute(MODE_ATTR);
  });
  cardState = new WeakMap();
  pageHiddenCount = 0;
}

// ----- whitelist: nunca esconder/pular se bater artista, canal ou keyword -----
// Pega o texto relevante do card (titulo + canal/artista) pra comparar.
function cardText(card) {
  const parts = [];
  const title = card.querySelector(
    "#video-title, #title, .yt-lockup-metadata-view-model-wiz__title, a[title]"
  );
  if (title) parts.push(title.getAttribute("title") || title.textContent || "");
  const channel = card.querySelector(
    "ytd-channel-name, .ytd-channel-name, #channel-name, " +
      ".yt-content-metadata-view-model-wiz__metadata-text"
  );
  if (channel) parts.push(channel.textContent || "");
  return parts.join(" ").toLowerCase();
}

function isWhitelisted(card) {
  const list = settings.whitelist || [];
  if (!list.length) return false;
  const text = cardText(card);
  return list.some((term) => term && text.includes(term.toLowerCase()));
}

// ----- aplicar esconder/atenuar -----
function applyHide() {
  // desligado, modo "agir" off, ou superficie desativada: limpa e sai
  if (!settings.enabled || !settings.hide || !surfaceEnabled()) {
    if (pageHiddenCount > 0) unhideAll();
    return;
  }

  let count = 0;
  const cards = document.querySelectorAll(CARD_QUERY);
  cards.forEach((card) => {
    const watched = isWatched(card);
    const keep = isWhitelisted(card);
    if (watched && !keep) {
      setHidden(card, true);
      count++;
    } else if (card.hasAttribute(HIDDEN_ATTR)) {
      setHidden(card, false);
    }
  });
  pageHiddenCount = count;
}

// ----- pular no player (fila do Mix/playlist) -----
// Se o video que esta TOCANDO agora ja foi assistido, avanca pro proximo.
let lastSkippedHref = null;

function currentQueueItem() {
  // item selecionado na fila do mix/playlist
  return document.querySelector("ytd-playlist-panel-video-renderer[selected]");
}

function clickNext() {
  const next =
    document.querySelector(".ytp-next-button") ||
    document.querySelector("a.ytp-next-button");
  if (next) next.click();
}

// Lista, em ordem, todos os itens da fila do Mix/playlist lateral.
function queueItems() {
  return Array.from(
    document.querySelectorAll("ytd-playlist-panel-video-renderer")
  );
}

let skipCooldownUntil = 0;

function applySkip() {
  if (!settings.enabled || !settings.skip) return;
  // trava curta: garante UM salto por vez, evita empilhar cliques antes do
  // player trocar de faixa
  const now = performance.now();
  if (now < skipCooldownUntil) return;

  const playing = currentQueueItem();
  if (!playing) return;

  // so age se o player ainda esta no comecinho (evitar pular algo que voce
  // escolheu reescutar de proposito e ja esta no meio)
  const video = document.querySelector("video.html5-main-video");
  const early = !video || video.currentTime < 8;
  if (!early) return;

  // se a musica atual nao foi vista, nao ha nada a fazer
  if (!isWatched(playing)) return;
  // respeita a lista branca: nunca pula um artista/keyword protegido
  if (isWhitelisted(playing)) return;

  const href = playing.querySelector("a#wc-endpoint, a")?.href || null;
  if (href && href === lastSkippedHref) return; // ja tratamos esta

  // Em vez de clicar "proximo" varias vezes (efeito pula-pula), percorre a
  // fila a partir do item atual e vai DIRETO para a primeira nao-vista.
  const items = queueItems();
  const idx = items.indexOf(playing);
  if (idx === -1) {
    // fallback: nao achei na fila, faz o pulo simples
    lastSkippedHref = href;
    skipCooldownUntil = now + 1200;
    clickNext();
    bumpStat("skipped");
    return;
  }

  let target = null;
  for (let i = idx + 1; i < items.length; i++) {
    // para numa faixa nao-vista OU numa protegida pela lista branca
    if (!isWatched(items[i]) || isWhitelisted(items[i])) {
      target = items[i];
      break;
    }
  }

  lastSkippedHref = href;
  skipCooldownUntil = now + 1200;
  bumpStat("skipped");

  if (target) {
    // clica direto no link do item nao-visto: um unico salto
    const link = target.querySelector("a#wc-endpoint, a");
    if (link) link.click();
    else clickNext();
  } else {
    // toda a fila visivel ja foi vista — pula uma so vez e deixa o YouTube
    // carregar mais itens; a proxima passada reavalia
    clickNext();
  }
}

// ----- pular no autoplay normal (experimental) -----
// Na watch page SEM playlist: quando o video termina e o autoplay esta ligado,
// em vez de deixar o YouTube cair no proximo relacionado (que pode ja ter sido
// visto), navega direto para o primeiro relacionado nao-visto.
let lastAutoplayHref = null;

function autoplayOn() {
  const btn = document.querySelector(".ytp-autonav-toggle-button");
  if (!btn) return true; // sem botao visivel: nao bloqueia
  return btn.getAttribute("aria-checked") === "true";
}

function applyAutoplaySkip() {
  if (!settings.enabled || !settings.skip || !settings.skipAutoplay) return;
  if (location.pathname !== "/watch") return;
  if (currentQueueItem()) return; // tem fila: applySkip ja cuida disso
  if (!autoplayOn()) return;

  const video = document.querySelector("video.html5-main-video");
  if (!video || !video.ended) return;

  const related = document.querySelectorAll(
    "ytd-compact-video-renderer, yt-lockup-view-model"
  );
  for (const card of related) {
    if (isWhitelisted(card)) continue; // protegido: deixa o autoplay seguir
    if (isWatched(card)) continue;
    const link = card.querySelector("a#thumbnail, a[href*='watch']");
    const href = link && link.href;
    if (!href || href === lastAutoplayHref) return;
    lastAutoplayHref = href;
    link.click();
    bumpStat("skipped");
    return;
  }
}

// ----- loops -----
let hideTimer = null;
function scheduleHide() {
  if (hideTimer) return;
  hideTimer = setTimeout(() => {
    hideTimer = null;
    applyHide();
  }, 250);
}

// novos cards entram via childList; o observer so agenda o hide (debounced),
// sem observar `attributes` no documento inteiro (isso disparava demais).
const observer = new MutationObserver(scheduleHide);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

// pega mudancas de progresso que nao inserem nos novos (a barra cresce sozinha)
setInterval(applyHide, 2000);

// skip e leve: tick proprio mais frequente
setInterval(() => {
  applySkip();
  applyAutoplaySkip();
}, 700);

// navegacao SPA do YouTube
window.addEventListener("yt-navigate-finish", () => {
  lastSkippedHref = null;
  lastAutoplayHref = null;
  cardState = new WeakMap();
  scheduleHide();
});

// responde ao popup com a contagem de escondidos nesta pagina
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "ytsw-get-count") {
    sendResponse({ count: pageHiddenCount });
  }
});

applyHide();
