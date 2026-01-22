/* AuroraWave - app.js
   - Bottom nav: Kesfet / Ara / Kutuphane
   - Jamendo API: real tracks & artists search, click to play
   - Optional: merges local catalog.json tracks too
*/

(() => {
  "use strict";

  // =========================
  // CONFIG
  // =========================
  const JAMENDO_CLIENT_ID = "82d8459a"; // senin Client ID
  const JAMENDO_BASE = "https://api.jamendo.com/v3.0";
  const JAMENDO_IMAGE_SIZE = 300;
  const JAMENDO_AUDIOFORMAT = "mp32"; // mp31, mp32, ogg, flac

  // Non-commercial Creative Commons filtresi:
  // ccnc=true -> Non-Commercial şartlı CC
  const JAMENDO_CC_FILTER = { ccnc: true };

  // Yerel katalog dosyan (istersen kullan, yoksa boş geçer)
  const LOCAL_CATALOG_URL = "./catalog.json";

  // =========================
  // DOM HELPERS
  // =========================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function safeText(el, text) {
    if (!el) return;
    el.textContent = text;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  // =========================
  // AUDIO ENGINE
  // =========================
  const audioEl = (() => {
    // HTML'de <audio id="awPlayer"> varsa onu kullan; yoksa yarat
    let el = $("#awPlayer");
    if (!el) {
      el = document.createElement("audio");
      el.id = "awPlayer";
      el.preload = "metadata";
      document.body.appendChild(el);
    }
    return el;
  })();

  const state = {
    view: "home", // home | search | library
    user: null,   // demo
    localTracks: [],
    jamendoTracks: [],
    nowPlaying: null, // { title, artist, cover, url, source }
    isPlaying: false,
    lastSearch: "",
  };

  // =========================
  // UI: BASIC TOAST
  // =========================
  function toast(msg) {
    console.log("[AuroraWave]", msg);
    const host = $("#awToastHost") || (() => {
      const d = document.createElement("div");
      d.id = "awToastHost";
      d.style.position = "fixed";
      d.style.left = "50%";
      d.style.bottom = "110px";
      d.style.transform = "translateX(-50%)";
      d.style.zIndex = "9999";
      d.style.display = "flex";
      d.style.flexDirection = "column";
      d.style.gap = "8px";
      document.body.appendChild(d);
      return d;
    })();

    const t = document.createElement("div");
    t.style.padding = "10px 12px";
    t.style.borderRadius = "12px";
    t.style.background = "rgba(0,0,0,0.55)";
    t.style.backdropFilter = "blur(10px)";
    t.style.color = "#fff";
    t.style.font = "14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial";
    t.style.maxWidth = "88vw";
    t.textContent = msg;

    host.appendChild(t);
    setTimeout(() => {
      t.style.transition = "opacity 280ms ease";
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 320);
    }, 1600);
  }

  // =========================
  // DATA: LOAD LOCAL CATALOG
  // =========================
  async function loadLocalCatalog() {
    try {
      const res = await fetch(LOCAL_CATALOG_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("catalog.json bulunamadı");
      const json = await res.json();
      const tracks = Array.isArray(json) ? json : (json.tracks || []);
      state.localTracks = tracks
        .map(normalizeLocalTrack)
        .filter(Boolean);
    } catch (e) {
      state.localTracks = [];
      // Yerel katalog olmadan da çalışsın
    }
  }

  function normalizeLocalTrack(t) {
    if (!t) return null;
    // Beklenen alanlar: title, artist, file/ url, cover
    const title = t.title || t.name || "Bilinmeyen Parça";
    const artist = t.artist || t.artist_name || "Bilinmeyen Sanatçı";
    const cover = t.cover || t.image || t.album_image || "";
    const url = t.url || t.file || t.audio || "";
    if (!url) return null;

    return {
      source: "local",
      id: t.id || `${title}-${artist}`.toLowerCase(),
      title,
      artist,
      cover,
      url,
      duration: t.duration || null,
    };
  }

  // =========================
  // DATA: JAMENDO SEARCH
  // =========================
  async function jamendoSearchTracks(q) {
    const query = (q || "").trim();
    if (!query) return [];

    const params = new URLSearchParams();
    params.set("client_id", JAMENDO_CLIENT_ID);
    params.set("format", "json");
    params.set("limit", "30");
    params.set("audioformat", JAMENDO_AUDIOFORMAT);
    params.set("imagesize", String(JAMENDO_IMAGE_SIZE));
    params.set("include", "musicinfo");

    // Free text search (track, artist, tags)
    params.set("search", query);

    // Non-commercial CC filter
    if (JAMENDO_CC_FILTER.ccnc) params.set("ccnc", "true");

    const url = `${JAMENDO_BASE}/tracks/?${params.toString()}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Jamendo yanıt vermedi");

    const data = await res.json();
    const results = data && data.results ? data.results : [];

    return results.map((r) => ({
      source: "jamendo",
      id: r.id,
      title: r.name || "Track",
      artist: r.artist_name || "Artist",
      cover: r.image || r.album_image || "",
      url: r.audio || "", // stream URL
      duration: r.duration || null,
      license: r.license_ccurl || "",
      releasedate: r.releasedate || "",
    })).filter(x => x.url);
  }

  // =========================
  // UI: VIEW RENDERING
  // =========================
  function showView(viewName) {
    state.view = viewName;

    // varsa section'ları toggle et
    const home = $("#viewHome");
    const search = $("#viewSearch");
    const lib = $("#viewLibrary");

    if (home) home.style.display = (viewName === "home") ? "" : "none";
    if (search) search.style.display = (viewName === "search") ? "" : "none";
    if (lib) lib.style.display = (viewName === "library") ? "" : "none";

    // nav active
    setNavActive(viewName);

    // render content
    if (viewName === "home") renderHome();
    if (viewName === "search") renderSearch();
    if (viewName === "library") renderLibrary();
  }

  function setNavActive(viewName) {
    const map = { home: "navHome", search: "navSearch", library: "navLibrary" };
    ["navHome", "navSearch", "navLibrary"].forEach((id) => {
      const el = $("#" + id);
      if (!el) return;
      const isActive = id === map[viewName];
      el.setAttribute("aria-selected", isActive ? "true" : "false");
      el.classList.toggle("is-active", isActive);
    });
  }

  function renderHome() {
    // Home basit: “Ara”ya yönlendir ve birkaç öneri
    const host = $("#homeHost");
    if (!host) return;

    const suggestions = [
      "lofi",
      "synthwave",
      "ambient",
      "piano",
      "chill",
      "rock",
      "electronic",
      "jazz",
    ];

    host.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div>
            <div class="h1">Keşfet</div>
            <div class="muted">Müziği keşfetmeye hazır mısın?</div>
          </div>
          <button class="iconbtn" id="btnGoSearch" title="Ara">
            🔎
          </button>
        </div>

        <div class="search-cta">
          <button class="cta" id="btnStart">Hazırsan başlayalım</button>
          <button class="cta ghost" id="btnOpenSearch">Şarkı veya sanatçı ara…</button>
        </div>

        <div class="section">
          <div class="section-title">Hızlı Etiketler</div>
          <div class="chips" id="chipRow">
            ${suggestions.map(s => `<button class="chip" data-q="${s}">${s}</button>`).join("")}
          </div>
        </div>
      </div>
    `;

    const goSearch = $("#btnGoSearch");
    const btnStart = $("#btnStart");
    const btnOpenSearch = $("#btnOpenSearch");
    if (goSearch) goSearch.addEventListener("click", () => showView("search"));
    if (btnStart) btnStart.addEventListener("click", () => showView("search"));
    if (btnOpenSearch) btnOpenSearch.addEventListener("click", () => showView("search"));

    $$("#chipRow .chip").forEach((b) => {
      b.addEventListener("click", () => {
        const q = b.getAttribute("data-q") || "";
        showView("search");
        const inp = $("#searchInput");
        if (inp) {
          inp.value = q;
          triggerSearch(q);
        }
      });
    });
  }

  function renderSearch() {
    const host = $("#searchHost");
    if (!host) return;

    host.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div>
            <div class="h1">Ara</div>
            <div class="muted">Jamendo (CC) + yerel katalog içinde ara</div>
          </div>
        </div>

        <div class="searchbar">
          <input id="searchInput" type="search" placeholder="Şarkı, sanatçı, tür (ör: lofi, piano, rock)"/>
          <button class="iconbtn" id="btnSearchNow" title="Ara">⏎</button>
        </div>

        <div class="results" id="resultsList"></div>
      </div>
    `;

    const input = $("#searchInput");
    const btn = $("#btnSearchNow");
    const onEnter = (e) => {
      if (e.key === "Enter") triggerSearch(input.value);
    };

    if (input) {
      input.addEventListener("keydown", onEnter);

      // Yazdıkça arama (debounce)
      let t = null;
      input.addEventListener("input", () => {
        clearTimeout(t);
        const val = input.value;
        t = setTimeout(() => triggerSearch(val), 350);
      });
    }

    if (btn) btn.addEventListener("click", () => triggerSearch(input.value));

    // Eğer daha önce arama yaptıysan geri dönünce aynı sonuçlar gelsin
    if (state.lastSearch) {
      input.value = state.lastSearch;
      paintResults(mergeResults(state.lastSearch));
    }
  }

  function renderLibrary() {
    const host = $("#libraryHost");
    if (!host) return;

    const recent = getRecentPlays();

    host.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div>
            <div class="h1">Kütüphane</div>
            <div class="muted">Son çalınanlar</div>
          </div>
        </div>

        <div class="results">
          ${recent.length ? recent.map(renderRowHTML).join("") : `<div class="empty">Henüz kayıt yok.</div>`}
        </div>
      </div>
    `;

    // satır tıklama
    $$(".row", host).forEach((row) => {
      row.addEventListener("click", () => {
        const src = row.getAttribute("data-src");
        const id = row.getAttribute("data-id");
        const item = recent.find(x => x.source === src && String(x.id) === String(id));
        if (item) playTrack(item);
      });
    });
  }

  // =========================
  // SEARCH FLOW
  // =========================
  async function triggerSearch(q) {
    const query = (q || "").trim();
    state.lastSearch = query;

    const list = $("#resultsList");
    if (list) list.innerHTML = `<div class="empty">Aranıyor…</div>`;

    // Local eşleşmeler
    const local = searchLocal(query);

    // Jamendo eşleşmeler
    let jam = [];
    try {
      if (query) jam = await jamendoSearchTracks(query);
    } catch (e) {
      jam = [];
      toast("Jamendo araması başarısız. İnternet/Client ID kontrol et.");
    }

    state.jamendoTracks = jam;

    const merged = [...local, ...jam];
    paintResults(merged);
  }

  function searchLocal(query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return [];
    return state.localTracks.filter(t => {
      const hay = `${t.title} ${t.artist}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function mergeResults(query) {
    const local = searchLocal(query);
    const jam = state.jamendoTracks || [];
    return [...local, ...jam];
  }

  function paintResults(items) {
    const list = $("#resultsList");
    if (!list) return;

    if (!items.length) {
      list.innerHTML = `<div class="empty">Sonuç yok. Başka bir kelime dene.</div>`;
      return;
    }

    list.innerHTML = items.map(renderRowHTML).join("");

    // click -> play
    $$(".row", list).forEach((row) => {
      row.addEventListener("click", () => {
        const src = row.getAttribute("data-src");
        const id = row.getAttribute("data-id");

        let item = null;
        if (src === "local") item = state.localTracks.find(x => String(x.id) === String(id));
        if (src === "jamendo") item = (state.jamendoTracks || []).find(x => String(x.id) === String(id));

        if (item) playTrack(item);
      });
    });
  }

  function renderRowHTML(t) {
    const cover = t.cover ? `<img class="cover" src="${escapeHTML(t.cover)}" alt="">` : `<div class="cover ph"></div>`;
    const meta2 = t.source === "jamendo" ? `Jamendo • CC` : `Yerel`;
    return `
      <div class="row" role="button" tabindex="0" data-src="${t.source}" data-id="${t.id}">
        ${cover}
        <div class="row-meta">
          <div class="row-title">${escapeHTML(t.title)}</div>
          <div class="row-sub">${escapeHTML(t.artist)} <span class="dot">•</span> ${meta2}</div>
        </div>
        <div class="row-act">▶</div>
      </div>
    `;
  }

  function escapeHTML(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // =========================
  // PLAYBACK + PLAYER UI HOOKS
  // =========================
  function playTrack(t) {
    if (!t || !t.url) return;

    state.nowPlaying = t;
    audioEl.src = t.url;

    audioEl.play().then(() => {
      state.isPlaying = true;
      toast(`Çalıyor: ${t.title} — ${t.artist}`);
      writeRecentPlay(t);
      updatePlayerUI();
    }).catch(() => {
      state.isPlaying = false;
      toast("Çalma engellendi. Tarayıcı ses izni isteyebilir.");
      updatePlayerUI();
    });
  }

  function togglePlay() {
    if (!state.nowPlaying) {
      toast("Henüz çalan yok. Ara’dan bir şarkı seç.");
      return;
    }
    if (audioEl.paused) {
      audioEl.play().then(() => {
        state.isPlaying = true;
        updatePlayerUI();
      }).catch(() => {
        state.isPlaying = false;
        updatePlayerUI();
      });
    } else {
      audioEl.pause();
      state.isPlaying = false;
      updatePlayerUI();
    }
  }

  function updatePlayerUI() {
    // Eğer HTML’de player alanları varsa doldur
    const t = state.nowPlaying;

    safeText($("#nowTitle"), t ? t.title : "Henüz çalan yok");
    safeText($("#nowArtist"), t ? t.artist : "Bir şarkı seç");

    const img = $("#nowCover");
    if (img) {
      if (t && t.cover) {
        img.style.backgroundImage = `url('${t.cover}')`;
      } else {
        img.style.backgroundImage = "";
      }
    }

    const btn = $("#btnPlay");
    if (btn) btn.textContent = (!audioEl.paused) ? "⏸" : "▶";
  }

  function wirePlayerControls() {
    const btnPlay = $("#btnPlay");
    const vol = $("#vol");
    const seek = $("#seek");

    if (btnPlay) btnPlay.addEventListener("click", () => {
      pulse(btnPlay);
      togglePlay();
    });

    if (vol) {
      vol.addEventListener("input", () => {
        audioEl.volume = clamp(parseFloat(vol.value || "1"), 0, 1);
      });
      audioEl.volume = clamp(parseFloat(vol.value || "0.85"), 0, 1);
    }

    if (seek) {
      seek.addEventListener("input", () => {
        if (!isFinite(audioEl.duration)) return;
        audioEl.currentTime = (parseFloat(seek.value || "0") / 100) * audioEl.duration;
      });
    }

    audioEl.addEventListener("timeupdate", () => {
      if (!seek) return;
      if (!isFinite(audioEl.duration) || audioEl.duration <= 0) return;
      const pct = (audioEl.currentTime / audioEl.duration) * 100;
      seek.value = String(Math.floor(pct));
      safeText($("#tCur"), fmtTime(audioEl.currentTime));
      safeText($("#tDur"), fmtTime(audioEl.duration));
    });

    audioEl.addEventListener("ended", () => {
      state.isPlaying = false;
      updatePlayerUI();
    });
  }

  function fmtTime(sec) {
    if (!isFinite(sec)) return "0:00";
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function pulse(el) {
    if (!el) return;
    el.classList.remove("pulse");
    // reflow
    void el.offsetWidth;
    el.classList.add("pulse");
  }

  // =========================
  // NAV WIRING
  // =========================
  function wireNav() {
    const home = $("#navHome");
    const search = $("#navSearch");
    const lib = $("#navLibrary");

    if (home) home.addEventListener("click", () => { pulse(home); showView("home"); });
    if (search) search.addEventListener("click", () => { pulse(search); showView("search"); });
    if (lib) lib.addEventListener("click", () => { pulse(lib); showView("library"); });
  }

  // =========================
  // RECENT PLAYS (localStorage)
  // =========================
  const RECENT_KEY = "aw_recent_plays_v1";

  function writeRecentPlay(t) {
    try {
      const list = getRecentPlays();
      const compact = {
        source: t.source,
        id: t.id,
        title: t.title,
        artist: t.artist,
        cover: t.cover || "",
        url: t.url,
      };
      const next = [compact, ...list.filter(x => !(x.source === compact.source && String(x.id) === String(compact.id)))].slice(0, 40);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
  }

  function getRecentPlays() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  // =========================
  // BOOT
  // =========================
  document.addEventListener("DOMContentLoaded", async () => {
    await loadLocalCatalog();
    wireNav();
    wirePlayerControls();
    updatePlayerUI();

    // İlk ekran
    showView("home");
  });

})();
