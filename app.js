/* AuroraWave - Jamendo Search & Player (Client-side, free)
   Client ID: 82d8459a
   Works with GitHub Pages (static)
*/

(() => {
  "use strict";

  // -----------------------
  // Config
  // -----------------------
  const JAMENDO_CLIENT_ID = "82d8459a";
  const JAMENDO_API = "https://api.jamendo.com/v3.0";
  const PAGE_SIZE = 24;

  // -----------------------
  // Helpers
  // -----------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const escapeHTML = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function toast(msg) {
    // tries to use existing toast container if present, otherwise creates a minimal one
    let t = $("#awToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "awToast";
      t.style.cssText =
        "position:fixed;left:50%;bottom:92px;transform:translateX(-50%);background:rgba(0,0,0,.75);color:#fff;padding:10px 14px;border-radius:12px;font:14px/1.3 system-ui,Segoe UI,Arial;z-index:99999;opacity:0;pointer-events:none;transition:opacity .2s ease;";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(toast._tm);
    toast._tm = setTimeout(() => (t.style.opacity = "0"), 1600);
  }

  function pulse(el) {
    if (!el) return;
    el.classList.remove("aw-pulse");
    // force reflow
    void el.offsetWidth;
    el.classList.add("aw-pulse");
  }

  function setActiveNav(key) {
    // Expected nav buttons IDs (if you used them):
    // #navHome, #navSearch, #navLibrary
    // If different, it still won't crash.
    const map = {
      home: $("#navHome") || $("#btnHome") || $('[data-nav="home"]'),
      search: $("#navSearch") || $("#btnSearch") || $('[data-nav="search"]'),
      library: $("#navLibrary") || $("#btnLibrary") || $('[data-nav="library"]'),
    };
    Object.entries(map).forEach(([k, btn]) => {
      if (!btn) return;
      btn.classList.toggle("active", k === key);
    });
  }

  function showView(key) {
    // Expected view containers IDs (if you used them):
    // #viewHome, #viewSearch, #viewLibrary, #viewAuth
    const views = {
      home: $("#viewHome") || $("#homeView") || $('[data-view="home"]'),
      search: $("#viewSearch") || $("#searchView") || $('[data-view="search"]'),
      library: $("#viewLibrary") || $("#libraryView") || $('[data-view="library"]'),
      auth: $("#viewAuth") || $("#authView") || $('[data-view="auth"]'),
    };

    // hide all that exist
    Object.values(views).forEach((v) => {
      if (v) v.style.display = "none";
    });

    // show selected if exists
    if (views[key]) views[key].style.display = "";

    setActiveNav(key);
  }

  // -----------------------
  // Session (local demo login)
  // -----------------------
  const LS_SESSION = "aw_session_v1";
  const LS_USERS = "aw_users_v1";
  const LS_LIBRARY = "aw_library_v1"; // user saved tracks

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(LS_SESSION) || "null");
    } catch {
      return null;
    }
  }
  function setSession(email) {
    localStorage.setItem(LS_SESSION, JSON.stringify({ email, ts: Date.now() }));
  }
  function clearSession() {
    localStorage.removeItem(LS_SESSION);
  }

  function loadUsers() {
    try {
      return JSON.parse(localStorage.getItem(LS_USERS) || "[]");
    } catch {
      return [];
    }
  }
  function saveUsers(users) {
    localStorage.setItem(LS_USERS, JSON.stringify(users));
  }

  function loadLibrary(email) {
    try {
      const all = JSON.parse(localStorage.getItem(LS_LIBRARY) || "{}");
      return all[email] || [];
    } catch {
      return [];
    }
  }
  function saveLibrary(email, items) {
    let all = {};
    try {
      all = JSON.parse(localStorage.getItem(LS_LIBRARY) || "{}") || {};
    } catch {
      all = {};
    }
    all[email] = items;
    localStorage.setItem(LS_LIBRARY, JSON.stringify(all));
  }

  // -----------------------
  // Audio Player
  // -----------------------
  const audioEl = $("#awPlayer") || $("#player") || $("audio");
  const nowTitle = $("#nowTitle") || $("#awNowTitle");
  const nowArtist = $("#nowArtist") || $("#awNowArtist");
  const nowCover = $("#nowCover") || $("#awNowCover");
  const btnPlay = $("#btnPlay") || $("#awPlay");
  const btnPrev = $("#btnPrev") || $("#awPrev");
  const btnNext = $("#btnNext") || $("#awNext");
  const seek = $("#seek") || $("#awSeek");
  const timeCur = $("#timeCur") || $("#awTimeCur");
  const timeDur = $("#timeDur") || $("#awTimeDur");
  const vol = $("#vol") || $("#awVol");

  let queue = [];
  let queueIndex = -1;

  function fmtTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function setNowPlaying(meta) {
    if (nowTitle) nowTitle.textContent = meta?.title || "Seçili şarkı yok";
    if (nowArtist) nowArtist.textContent = meta?.artist || "";
    if (nowCover) {
      const src = meta?.cover || "";
      if (src) nowCover.style.backgroundImage = `url("${src}")`;
    }
  }

  function setPlayUI(isPlaying) {
    if (!btnPlay) return;
    btnPlay.setAttribute("aria-pressed", String(isPlaying));
    btnPlay.classList.toggle("playing", !!isPlaying);
  }

  async function playTrack(track) {
    if (!audioEl) {
      toast("Audio player bulunamadı (index.html içinde <audio id='awPlayer'> olmalı).");
      return;
    }
    if (!track?.audio) {
      toast("Bu parça için oynatma linki yok.");
      return;
    }

    setNowPlaying(track);
    try {
      audioEl.src = track.audio;
      await audioEl.play();
      setPlayUI(true);
    } catch (e) {
      console.error(e);
      setPlayUI(false);
      toast("Tarayıcı oynatmayı engelledi. Bir kez Play'e bas.");
    }
  }

  function playQueueIndex(i) {
    if (i < 0 || i >= queue.length) return;
    queueIndex = i;
    playTrack(queue[queueIndex]);
  }

  function next() {
    if (!queue.length) return;
    const i = queueIndex < 0 ? 0 : (queueIndex + 1) % queue.length;
    playQueueIndex(i);
  }
  function prev() {
    if (!queue.length) return;
    const i = queueIndex <= 0 ? queue.length - 1 : queueIndex - 1;
    playQueueIndex(i);
  }

  function bindPlayer() {
    if (btnPlay && audioEl) {
      btnPlay.addEventListener("click", async () => {
        pulse(btnPlay);
        if (audioEl.paused) {
          try {
            await audioEl.play();
            setPlayUI(true);
          } catch {
            toast("Oynatmak için bir şarkı seç.");
          }
        } else {
          audioEl.pause();
          setPlayUI(false);
        }
      });
    }
    if (btnNext) btnNext.addEventListener("click", () => (pulse(btnNext), next()));
    if (btnPrev) btnPrev.addEventListener("click", () => (pulse(btnPrev), prev()));

    if (audioEl) {
      audioEl.addEventListener("ended", () => next());
      audioEl.addEventListener("play", () => setPlayUI(true));
      audioEl.addEventListener("pause", () => setPlayUI(false));
      audioEl.addEventListener("loadedmetadata", () => {
        if (timeDur) timeDur.textContent = fmtTime(audioEl.duration);
      });
      audioEl.addEventListener("timeupdate", () => {
        if (seek && Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
          seek.value = String(Math.floor((audioEl.currentTime / audioEl.duration) * 1000));
        }
        if (timeCur) timeCur.textContent = fmtTime(audioEl.currentTime);
      });
    }

    if (seek && audioEl) {
      seek.addEventListener("input", () => {
        if (!Number.isFinite(audioEl.duration) || audioEl.duration <= 0) return;
        const p = Number(seek.value) / 1000;
        audioEl.currentTime = p * audioEl.duration;
      });
    }

    if (vol && audioEl) {
      vol.addEventListener("input", () => {
        audioEl.volume = Math.min(1, Math.max(0, Number(vol.value)));
      });
    }
  }

  // -----------------------
  // Jamendo API
  // -----------------------
  function jamendoUrl(path, params = {}) {
    const u = new URL(`${JAMENDO_API}/${path}`);
    u.searchParams.set("client_id", JAMENDO_CLIENT_ID);
    u.searchParams.set("format", "json");
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") return;
      u.searchParams.set(k, String(v));
    });
    return u.toString();
  }

  async function jamendoSearchTracks(query, page = 1) {
    const url = jamendoUrl("tracks", {
      search: query,
      include: "musicinfo",
      audioformat: "mp31",
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      order: "relevance",
    });

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Jamendo error: ${res.status}`);
    const data = await res.json();
    const items = (data?.results || []).map((t) => ({
      id: t.id,
      title: t.name,
      artist: t.artist_name,
      cover: t.album_image || t.image || "",
      audio: t.audio,
      duration: Number(t.duration || 0),
    }));
    return { items, total: Number(data?.headers?.results_count || items.length || 0) };
  }

  // -----------------------
  // Search UI
  // -----------------------
  const searchInput =
    $("#searchInput") ||
    $("#awSearchInput") ||
    $('input[type="search"]') ||
    $('input[placeholder*="ara"]') ||
    $('input[placeholder*="Ara"]');

  const searchBtn = $("#searchBtn") || $("#awSearchBtn") || $("#btnDoSearch");
  const searchResults = $("#searchResults") || $("#awSearchResults") || $("#results");

  const searchMeta = $("#searchMeta") || $("#awSearchMeta");
  const searchEmpty = $("#searchEmpty") || $("#awSearchEmpty");

  let searchPage = 1;
  let lastQuery = "";

  function renderResults(items) {
    if (!searchResults) return;

    if (!items.length) {
      searchResults.innerHTML = "";
      if (searchEmpty) searchEmpty.style.display = "";
      return;
    }
    if (searchEmpty) searchEmpty.style.display = "none";

    searchResults.innerHTML = items
      .map((t, idx) => {
        const safeTitle = escapeHTML(t.title);
        const safeArtist = escapeHTML(t.artist);
        const cover = t.cover ? `style="background-image:url('${escapeHTML(t.cover)}')"` : "";
        return `
          <div class="aw-result" data-idx="${idx}">
            <div class="aw-result-cover" ${cover}></div>
            <div class="aw-result-main">
              <div class="aw-result-title">${safeTitle}</div>
              <div class="aw-result-artist">${safeArtist}</div>
            </div>
            <button class="aw-result-play" type="button" data-idx="${idx}" aria-label="Çal">▶</button>
            <button class="aw-result-save" type="button" data-idx="${idx}" aria-label="Kaydet">♡</button>
          </div>
        `;
      })
      .join("");

    // click handlers
    $$(".aw-result-play", searchResults).forEach((btn) => {
      btn.addEventListener("click", () => {
        pulse(btn);
        const i = Number(btn.dataset.idx);
        queue = items; // queue is current search
        playQueueIndex(i);
      });
    });

    $$(".aw-result-save", searchResults).forEach((btn) => {
      btn.addEventListener("click", () => {
        pulse(btn);
        const i = Number(btn.dataset.idx);
        const s = getSession();
        if (!s?.email) {
          toast("Kaydetmek için giriş yap.");
          showView("auth");
          return;
        }
        const lib = loadLibrary(s.email);
        const track = items[i];
        if (!track) return;

        const exists = lib.some((x) => x.id === track.id);
        if (!exists) {
          lib.unshift(track);
          saveLibrary(s.email, lib);
          toast("Kütüphaneye eklendi.");
          renderLibrary(); // update if visible
        } else {
          toast("Zaten kütüphanede.");
        }
      });
    });
  }

  async function doSearch(query, page = 1) {
    if (!query || query.trim().length < 2) {
      toast("En az 2 karakter yaz.");
      return;
    }
    lastQuery = query.trim();
    searchPage = page;

    if (searchMeta) searchMeta.textContent = "Aranıyor…";
    if (searchResults) searchResults.innerHTML = "";

    try {
      const { items, total } = await jamendoSearchTracks(lastQuery, searchPage);
      renderResults(items);

      if (searchMeta) {
        const from = (searchPage - 1) * PAGE_SIZE + 1;
        const to = (searchPage - 1) * PAGE_SIZE + items.length;
        searchMeta.textContent = `${from}-${to} / ~${total} sonuç`;
      }

      // store last search items as queue if nothing playing yet
      if (items.length && queueIndex === -1) queue = items;
    } catch (e) {
      console.error(e);
      if (searchMeta) searchMeta.textContent = "Arama başarısız.";
      toast("Jamendo araması başarısız. İnternetini kontrol et.");
    }
  }

  function bindSearch() {
    // Ensure we have a container for results. If not, create minimal UI inside search view.
    const searchView = $("#viewSearch") || $("#searchView") || $('[data-view="search"]');
    if (searchView && !searchResults) {
      // create basic results area
      const box = document.createElement("div");
      box.id = "awSearchResults";
      box.style.cssText = "margin-top:12px;";
      searchView.appendChild(box);
    }

    // Enter to search
    if (searchInput) {
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          doSearch(searchInput.value, 1);
        }
      });
    }
    if (searchBtn) {
      searchBtn.addEventListener("click", () => {
        pulse(searchBtn);
        doSearch(searchInput ? searchInput.value : "", 1);
      });
    }

    // optional pagination buttons if exist
    const prevBtn = $("#searchPrev") || $("#awSearchPrev");
    const nextBtn = $("#searchNext") || $("#awSearchNext");
    if (prevBtn)
      prevBtn.addEventListener("click", () => {
        pulse(prevBtn);
        if (searchPage > 1) doSearch(lastQuery, searchPage - 1);
      });
    if (nextBtn)
      nextBtn.addEventListener("click", () => {
        pulse(nextBtn);
        doSearch(lastQuery, searchPage + 1);
      });
  }

  // -----------------------
  // Library UI
  // -----------------------
  const libraryList = $("#libraryList") || $("#awLibraryList");

  function renderLibrary() {
    const s = getSession();
    if (!libraryList) return;

    if (!s?.email) {
      libraryList.innerHTML = `<div class="aw-empty">Kütüphaneyi görmek için giriş yap.</div>`;
      return;
    }

    const lib = loadLibrary(s.email);
    if (!lib.length) {
      libraryList.innerHTML = `<div class="aw-empty">Kütüphanen boş. Ara’dan şarkı ekleyebilirsin.</div>`;
      return;
    }

    libraryList.innerHTML = lib
      .map((t, idx) => {
        const cover = t.cover ? `style="background-image:url('${escapeHTML(t.cover)}')"` : "";
        return `
          <div class="aw-lib" data-idx="${idx}">
            <div class="aw-lib-cover" ${cover}></div>
            <div class="aw-lib-main">
              <div class="aw-lib-title">${escapeHTML(t.title)}</div>
              <div class="aw-lib-artist">${escapeHTML(t.artist)}</div>
            </div>
            <button class="aw-lib-play" type="button" data-idx="${idx}">▶</button>
            <button class="aw-lib-del" type="button" data-idx="${idx}">✕</button>
          </div>
        `;
      })
      .join("");

    $$(".aw-lib-play", libraryList).forEach((btn) => {
      btn.addEventListener("click", () => {
        pulse(btn);
        const i = Number(btn.dataset.idx);
        queue = lib;
        playQueueIndex(i);
      });
    });

    $$(".aw-lib-del", libraryList).forEach((btn) => {
      btn.addEventListener("click", () => {
        pulse(btn);
        const i = Number(btn.dataset.idx);
        const next = lib.filter((_, j) => j !== i);
        saveLibrary(s.email, next);
        renderLibrary();
        toast("Kaldırıldı.");
      });
    });
  }

  // -----------------------
  // Auth UI (local demo)
  // -----------------------
  const authForm = $("#authForm") || $("#loginForm") || $("form[data-auth]");
  const authModeTabs = {
    login: $("#tabLogin") || $("#btnLoginTab") || $('[data-auth-tab="login"]'),
    register: $("#tabRegister") || $("#btnRegisterTab") || $('[data-auth-tab="register"]'),
  };
  const authTitle = $("#authTitle") || $(".auth-title");
  const submitBtn = $("#btnSubmit") || $("button[type='submit']");
  const logoutBtn = $("#btnLogout") || $("#logoutBtn") || $('[data-action="logout"]');

  let authMode = "login"; // "login" | "register"

  function setAuthMode(mode) {
    authMode = mode === "register" ? "register" : "login";

    if (authTitle) authTitle.textContent = authMode === "login" ? "Giriş yap" : "Kayıt ol";
    if (submitBtn) submitBtn.textContent = authMode === "login" ? "Giriş yap" : "Kayıt ol";

    if (authModeTabs.login) authModeTabs.login.classList.toggle("active", authMode === "login");
    if (authModeTabs.register) authModeTabs.register.classList.toggle("active", authMode === "register");

    // optional register-only fields
    $$(".only-register").forEach((el) => (el.style.display = authMode === "register" ? "" : "none"));
  }

  function bindAuth() {
    if (authModeTabs.login) {
      authModeTabs.login.addEventListener("click", () => {
        pulse(authModeTabs.login);
        setAuthMode("login");
      });
    }
    if (authModeTabs.register) {
      authModeTabs.register.addEventListener("click", () => {
        pulse(authModeTabs.register);
        setAuthMode("register");
      });
    }

    if (authForm) {
      authForm.addEventListener("submit", (e) => {
        e.preventDefault();

        const emailEl = $("#email") || $("#authEmail") || $("input[type='email']", authForm);
        const passEl = $("#pass") || $("#authPass") || $("input[type='password']", authForm);
        const nameEl = $("#name") || $("#authName");
        const pass2El = $("#pass2") || $("#authPass2");

        const email = (emailEl?.value || "").trim().toLowerCase();
        const pass = passEl?.value || "";
        const name = (nameEl?.value || "").trim();
        const pass2 = pass2El?.value || "";

        if (!email.includes("@")) return toast("Geçerli e-posta gir.");
        if (pass.length < 4) return toast("Şifre en az 4 karakter olsun.");

        const users = loadUsers();

        if (authMode === "register") {
          if (!name) return toast("Ad Soyad gir.");
          if (pass2El && pass !== pass2) return toast("Şifreler aynı değil.");

          const exists = users.some((u) => u.email === email);
          if (exists) return toast("Bu e-posta zaten kayıtlı.");

          users.push({ email, pass, name, created: Date.now() });
          saveUsers(users);
          setSession(email);
          toast("Kayıt başarılı. Hoş geldin!");
          // go home
          showView("home");
          renderHome();
          return;
        }

        // login
        const found = users.find((u) => u.email === email && u.pass === pass);
        if (!found) return toast("E-posta veya şifre hatalı.");

        setSession(email);
        toast("Giriş başarılı.");
        showView("home");
        renderHome();
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        pulse(logoutBtn);
        clearSession();
        toast("Çıkış yapıldı.");
        // update UI
        showView("auth");
        setAuthMode("login");
        renderLibrary();
      });
    }
  }

  // -----------------------
  // Home UI (simple)
  // -----------------------
  const homeHello = $("#homeHello") || $("#awHomeHello");
  function renderHome() {
    const s = getSession();
    if (homeHello) {
      homeHello.textContent = s?.email ? `Hoş geldin, ${s.email}` : "Hoş geldin";
    }
  }

  // -----------------------
  // Navigation: bottom bar clicks
  // -----------------------
  function bindNav() {
    const homeBtn = $("#navHome") || $("#btnHome") || $('[data-nav="home"]');
    const searchBtn2 = $("#navSearch") || $("#btnSearch") || $('[data-nav="search"]');
    const libBtn = $("#navLibrary") || $("#btnLibrary") || $('[data-nav="library"]');

    if (homeBtn)
      homeBtn.addEventListener("click", () => {
        pulse(homeBtn);
        showView("home");
        renderHome();
      });

    if (searchBtn2)
      searchBtn2.addEventListener("click", () => {
        pulse(searchBtn2);
        showView("search");
        // auto focus
        if (searchInput) searchInput.focus();
      });

    if (libBtn)
      libBtn.addEventListener("click", () => {
        pulse(libBtn);
        showView("library");
        renderLibrary();
      });

    // Extra: if you have a “Ara” button that is not wired, try by text
    // Not mandatory; avoids "Ara tıklayınca bir şey olmuyor"
    const fallbackAra = $$("button, a").find((el) => (el.textContent || "").trim().toLowerCase() === "ara");
    if (fallbackAra && !searchBtn2) {
      fallbackAra.addEventListener("click", () => {
        pulse(fallbackAra);
        showView("search");
        if (searchInput) searchInput.focus();
      });
    }
  }

  // -----------------------
  // Minimal CSS for new components (if your styles.css doesn't include them)
  // -----------------------
  function injectFallbackStyles() {
    const css = `
      .aw-pulse { animation: awPulse .18s ease; }
      @keyframes awPulse { from{transform:scale(1)} 50%{transform:scale(.96)} to{transform:scale(1)} }

      .aw-result,.aw-lib{
        display:flex; align-items:center; gap:12px;
        padding:10px 12px; border-radius:14px;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.08);
        margin:10px 0;
      }
      .aw-result-cover,.aw-lib-cover{
        width:44px; height:44px; border-radius:12px;
        background: rgba(255,255,255,.1);
        background-size:cover; background-position:center;
        flex:0 0 auto;
      }
      .aw-result-main,.aw-lib-main{ flex:1 1 auto; min-width:0; }
      .aw-result-title,.aw-lib-title{ font: 600 14px/1.2 system-ui,Segoe UI,Arial; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
      .aw-result-artist,.aw-lib-artist{ font: 12px/1.2 system-ui,Segoe UI,Arial; color: rgba(255,255,255,.75); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
      .aw-result-play,.aw-lib-play,.aw-result-save,.aw-lib-del{
        border:0; background: rgba(255,255,255,.08);
        color:#fff; border-radius:12px;
        padding:10px 12px; cursor:pointer;
      }
      .aw-empty{ color: rgba(255,255,255,.75); padding:12px; }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  // -----------------------
  // Boot
  // -----------------------
  document.addEventListener("DOMContentLoaded", () => {
    injectFallbackStyles();

    bindPlayer();
    bindNav();
    bindSearch();
    bindAuth();

    // initial state:
    const s = getSession();
    if (s?.email) {
      showView("home");
      renderHome();
      renderLibrary();
    } else {
      // if you prefer forcing auth first, switch to "auth"
      // showView("auth");
      showView("home");
      renderHome();
    }

    // Make sure auth mode is set
    setAuthMode("login");

    // If search view exists but is empty, create minimal search UI (optional)
    const searchView = $("#viewSearch") || $("#searchView") || $('[data-view="search"]');
    if (searchView && !searchInput) {
      // create minimal search input if missing
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;gap:10px;align-items:center;";
      wrap.innerHTML = `
        <input id="searchInput" type="search" placeholder="Şarkı veya sanatçı ara…" style="flex:1;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.2);color:#fff;outline:none;">
        <button id="searchBtn" type="button" style="padding:12px 14px;border-radius:14px;border:0;background:rgba(255,255,255,.12);color:#fff;cursor:pointer;">Ara</button>
        <div id="searchMeta" style="margin-left:auto;color:rgba(255,255,255,.7);font:12px system-ui,Segoe UI,Arial;"></div>
      `;
      searchView.prepend(wrap);
      // rebind
      setTimeout(() => {
        bindSearch();
      }, 0);
    }
  });
})();




