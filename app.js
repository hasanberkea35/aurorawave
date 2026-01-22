(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const safeJSON = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, val) {
      localStorage.setItem(key, JSON.stringify(val));
    },
    del(key) {
      localStorage.removeItem(key);
    }
  };

  const toast = (msg) => {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 2200);
  };

  const fmtTime = (sec) => {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  function rippleAt(btn, clientX, clientY) {
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const r = document.createElement("span");
    r.className = "ripple";
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    btn.appendChild(r);
    setTimeout(() => r.remove(), 650);
  }

  function enableButtonFeedback() {
    const targets = ["button", ".tile", ".routeChip", ".item"];
    const nodes = targets.flatMap((sel) => $$(sel));
    nodes.forEach((el) => {
      if (el.__awBound) return;
      el.__awBound = true;

      el.addEventListener("pointerdown", (e) => {
        // ripple only for elements with relative/position context
        const style = getComputedStyle(el);
        if (style.position === "static") el.style.position = "relative";
        rippleAt(el, e.clientX, e.clientY);
        if (navigator.vibrate) navigator.vibrate(8);
      });
    });
  }

  // ---------- State ----------
  const STORAGE_USERS = "aw_users_v1";
  const STORAGE_SESSION = "aw_session_v1";
  const STORAGE_FAVS = "aw_favs_v1";
  const STORAGE_RECENT = "aw_recent_v1";

  const state = {
    authMode: "login", // login | register
    view: "home",      // home | search | library | auth
    filter: "all",     // all | song | artist
    catalog: [],
    queue: [],
    nowIndex: -1,
    isReady: false
  };

  // ---------- Elements ----------
  const el = {
    // views
    viewAuth: null,
    viewHome: null,
    viewSearch: null,
    viewLibrary: null,

    // auth
    authTitle: null,
    authSub: null,
    tabLogin: null,
    tabRegister: null,
    authForm: null,
    rowFullName: null,
    rowPass2: null,
    inFullName: null,
    inEmail: null,
    inPass: null,
    inPass2: null,
    btnSubmit: null,

    // nav
    navBtns: [],
    btnGoSearch: null,
    btnStartMix: null,

    // home
    routeChips: null,
    featuredGrid: null,

    // search
    q: null,
    btnClearSearch: null,
    pills: [],
    searchResults: null,

    // library
    favList: null,
    recentList: null,

    // profile/logout
    profileEmail: null,
    btnLogout: null,

    // player
    audio: null,
    nowTitle: null,
    nowArtist: null,
    btnPrev: null,
    btnPlay: null,
    btnNext: null,
    seek: null,
    tCur: null,
    tDur: null,
    vol: null,
    btnFavToggle: null
  };

  function bindElements() {
    el.viewAuth = $("#viewAuth");
    el.viewHome = $("#viewHome");
    el.viewSearch = $("#viewSearch");
    el.viewLibrary = $("#viewLibrary");

    el.authTitle = $("#authTitle");
    el.authSub = $("#authSub");
    el.tabLogin = $("#tabLogin");
    el.tabRegister = $("#tabRegister");
    el.authForm = $("#authForm");
    el.rowFullName = $("#rowFullName");
    el.rowPass2 = $("#rowPass2");
    el.inFullName = $("#inFullName");
    el.inEmail = $("#inEmail");
    el.inPass = $("#inPass");
    el.inPass2 = $("#inPass2");
    el.btnSubmit = $("#btnSubmit");

    el.navBtns = $$(".navBtn");
    el.btnGoSearch = $("#btnGoSearch");
    el.btnStartMix = $("#btnStartMix");

    el.routeChips = $("#routeChips");
    el.featuredGrid = $("#featuredGrid");

    el.q = $("#q");
    el.btnClearSearch = $("#btnClearSearch");
    el.pills = $$(".pill");
    el.searchResults = $("#searchResults");

    el.favList = $("#favList");
    el.recentList = $("#recentList");

    el.profileEmail = $("#profileEmail");
    el.btnLogout = $("#btnLogout");

    el.audio = $("#awPlayer");
    el.nowTitle = $("#nowTitle");
    el.nowArtist = $("#nowArtist");
    el.btnPrev = $("#btnPrev");
    el.btnPlay = $("#btnPlay");
    el.btnNext = $("#btnNext");
    el.seek = $("#seek");
    el.tCur = $("#tCur");
    el.tDur = $("#tDur");
    el.vol = $("#vol");
    el.btnFavToggle = $("#btnFavToggle");
  }

  // ---------- Session / Users ----------
  function getUsers() {
    return safeJSON.get(STORAGE_USERS, []);
  }
  function setUsers(users) {
    safeJSON.set(STORAGE_USERS, users);
  }

  function getSession() {
    return safeJSON.get(STORAGE_SESSION, null);
  }
  function setSession(email) {
    safeJSON.set(STORAGE_SESSION, { email, at: Date.now() });
  }
  function clearSession() {
    safeJSON.del(STORAGE_SESSION);
  }

  function getFavs(email) {
    const all = safeJSON.get(STORAGE_FAVS, {});
    return all[email] || [];
  }
  function setFavs(email, favIds) {
    const all = safeJSON.get(STORAGE_FAVS, {});
    all[email] = favIds;
    safeJSON.set(STORAGE_FAVS, all);
  }

  function getRecent(email) {
    const all = safeJSON.get(STORAGE_RECENT, {});
    return all[email] || [];
  }
  function pushRecent(email, trackId) {
    const all = safeJSON.get(STORAGE_RECENT, {});
    const arr = all[email] || [];
    const next = [trackId, ...arr.filter((x) => x !== trackId)].slice(0, 12);
    all[email] = next;
    safeJSON.set(STORAGE_RECENT, all);
  }

  // ---------- Views ----------
  function showView(viewName) {
    state.view = viewName;

    const isAuth = viewName === "auth";
    const isHome = viewName === "home";
    const isSearch = viewName === "search";
    const isLib = viewName === "library";

    if (el.viewAuth) el.viewAuth.classList.toggle("hidden", !isAuth);
    if (el.viewHome) el.viewHome.classList.toggle("hidden", !isHome);
    if (el.viewSearch) el.viewSearch.classList.toggle("hidden", !isSearch);
    if (el.viewLibrary) el.viewLibrary.classList.toggle("hidden", !isLib);

    // Bottom nav highlight
    el.navBtns.forEach((b) => {
      b.classList.toggle("active", b.dataset.view === viewName);
    });

    // Focus search input
    if (isSearch && el.q) setTimeout(() => el.q.focus(), 80);

    enableButtonFeedback();
  }

  function syncAuthUI() {
    const isLogin = state.authMode === "login";
    if (el.tabLogin) el.tabLogin.classList.toggle("active", isLogin);
    if (el.tabRegister) el.tabRegister.classList.toggle("active", !isLogin);

    if (el.authTitle) el.authTitle.textContent = isLogin ? "Hızlı Giriş" : "Hesap Oluştur";
    if (el.authSub) el.authSub.textContent = isLogin ? "Devam etmek için giriş yap" : "Bir dakikada hesabını aç";

    if (el.rowFullName) el.rowFullName.style.display = isLogin ? "none" : "block";
    if (el.rowPass2) el.rowPass2.style.display = isLogin ? "none" : "block";

    if (el.btnSubmit) el.btnSubmit.textContent = isLogin ? "Giriş yap" : "Kayıt ol";
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    syncAuthUI();
  }

  function updateTopProfile() {
    const s = getSession();
    const email = s?.email || "Misafir";
    if (el.profileEmail) el.profileEmail.textContent = email;
    if (el.btnLogout) el.btnLogout.style.display = s?.email ? "inline-flex" : "none";
  }

  // ---------- Catalog ----------
  async function loadCatalog() {
    try {
      const res = await fetch("./catalog.json", { cache: "no-store" });
      if (!res.ok) throw new Error("catalog.json okunamadı");
      const data = await res.json();
      const tracks = Array.isArray(data.tracks) ? data.tracks : [];
      // sanitize
      state.catalog = tracks
        .filter(t => t && t.id && t.title && t.artist && t.src)
        .map(t => ({
          id: String(t.id),
          title: String(t.title),
          artist: String(t.artist),
          mood: t.mood ? String(t.mood) : "Orbit",
          src: String(t.src)
        }));
    } catch (e) {
      console.error(e);
      state.catalog = [];
      toast("Katalog yüklenemedi (catalog.json).");
    }
  }

  // ---------- Rendering ----------
  function renderHome() {
    if (!el.routeChips || !el.featuredGrid) return;

    const routes = [
      { key: "Orbit", title: "Orbit", sub: "Parlak, hızlı, akışkan" },
      { key: "Night", title: "Night", sub: "Sakin, loş, derin" },
      { key: "Pulse", title: "Pulse", sub: "Ritim ve enerji" },
      { key: "Calm", title: "Calm", sub: "Yumuşak ve rahat" }
    ];

    el.routeChips.innerHTML = routes.map(r => `
      <button class="routeChip" type="button" data-route="${r.key}">
        <div>
          <div class="t">${r.title}</div>
          <div class="s">${r.sub}</div>
        </div>
        <div class="s">›</div>
      </button>
    `).join("");

    const featured = state.catalog.slice(0, 6);
    el.featuredGrid.innerHTML = featured.map(t => `
      <div class="tile" role="button" tabindex="0" data-track="${t.id}">
        <div class="tileInner">
          <div class="tileTitle">${escapeHTML(t.title)}</div>
          <div class="tileSub">${escapeHTML(t.artist)}</div>
        </div>
      </div>
    `).join("");

    enableButtonFeedback();
  }

  function renderSearch() {
    if (!el.searchResults) return;

    const q = (el.q?.value || "").trim().toLowerCase();
    const filter = state.filter;

    // Build results from catalog: optionally filter by artist grouping
    let tracks = state.catalog;

    // Filter by query
    if (q) {
      tracks = tracks.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q)
      );
    }

    // Filter by type (song vs artist)
    let results = [];
    if (filter === "artist") {
      const artists = Array.from(new Set(tracks.map(t => t.artist))).sort((a,b)=>a.localeCompare(b));
      results = artists.map(a => ({ type: "artist", artist: a }));
    } else if (filter === "song") {
      results = tracks.map(t => ({ type: "song", track: t }));
    } else {
      // all: artists first if query matches artist strongly, but keep simple:
      results = tracks.map(t => ({ type: "song", track: t }));
    }

    if (results.length === 0) {
      el.searchResults.innerHTML = `<div class="item"><div class="itemLeft"><div class="badge"></div><div><div class="itemTitle">Sonuç yok</div><div class="itemSub">Farklı bir şey dene.</div></div></div></div>`;
      return;
    }

    el.searchResults.innerHTML = results.map((r) => {
      if (r.type === "artist") {
        return `
          <div class="item">
            <div class="itemLeft">
              <div class="badge"></div>
              <div>
                <div class="itemTitle">${escapeHTML(r.artist)}</div>
                <div class="itemSub">Sanatçı</div>
              </div>
            </div>
            <div class="itemBtns">
              <button class="miniBtn" type="button" data-artist-play="${escapeAttr(r.artist)}">Çal</button>
              <button class="miniBtn" type="button" data-artist-show="${escapeAttr(r.artist)}">Göster</button>
            </div>
          </div>
        `;
      }

      const t = r.track;
      return `
        <div class="item">
          <div class="itemLeft">
            <div class="badge"></div>
            <div>
              <div class="itemTitle">${escapeHTML(t.title)}</div>
              <div class="itemSub">${escapeHTML(t.artist)}</div>
            </div>
          </div>
          <div class="itemBtns">
            <button class="miniBtn" type="button" data-play="${t.id}">Çal</button>
            <button class="miniBtn" type="button" data-fav="${t.id}">♡</button>
          </div>
        </div>
      `;
    }).join("");

    enableButtonFeedback();
  }

  function renderLibrary() {
    const s = getSession();
    const email = s?.email;
    if (!el.favList || !el.recentList) return;

    if (!email) {
      el.favList.innerHTML = `<div class="item"><div class="itemLeft"><div class="badge"></div><div><div class="itemTitle">Giriş gerekli</div><div class="itemSub">Kütüphaneyi görmek için giriş yap.</div></div></div></div>`;
      el.recentList.innerHTML = `<div class="item"><div class="itemLeft"><div class="badge"></div><div><div class="itemTitle">Giriş gerekli</div><div class="itemSub">Son çalınanları görmek için giriş yap.</div></div></div></div>`;
      return;
    }

    const favIds = getFavs(email);
    const favTracks = favIds.map(id => state.catalog.find(t => t.id === id)).filter(Boolean);

    el.favList.innerHTML = favTracks.length ? favTracks.map(t => itemTrackHTML(t, true)).join("")
      : `<div class="item"><div class="itemLeft"><div class="badge"></div><div><div class="itemTitle">Favorin yok</div><div class="itemSub">Şarkılarda ♡ ile ekleyebilirsin.</div></div></div></div>`;

    const recIds = getRecent(email);
    const recTracks = recIds.map(id => state.catalog.find(t => t.id === id)).filter(Boolean);

    el.recentList.innerHTML = recTracks.length ? recTracks.map(t => itemTrackHTML(t, false)).join("")
      : `<div class="item"><div class="itemLeft"><div class="badge"></div><div><div class="itemTitle">Henüz bir şey çalmadın</div><div class="itemSub">Bir şarkı seç ve başla.</div></div></div></div>`;

    enableButtonFeedback();
  }

  function itemTrackHTML(t, inFav) {
    return `
      <div class="item">
        <div class="itemLeft">
          <div class="badge"></div>
          <div>
            <div class="itemTitle">${escapeHTML(t.title)}</div>
            <div class="itemSub">${escapeHTML(t.artist)}</div>
          </div>
        </div>
        <div class="itemBtns">
          <button class="miniBtn" type="button" data-play="${t.id}">Çal</button>
          <button class="miniBtn" type="button" data-fav="${t.id}">${inFav ? "♥" : "♡"}</button>
        </div>
      </div>
    `;
  }

  function escapeHTML(str) {
    return String(str)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
  function escapeAttr(str) {
    return escapeHTML(str).replaceAll('"',"&quot;");
  }

  // ---------- Player ----------
  function setQueue(tracks, startIndex = 0) {
    state.queue = tracks.slice();
    state.nowIndex = Math.max(0, Math.min(startIndex, state.queue.length - 1));
  }

  function currentTrack() {
    if (state.nowIndex < 0 || state.nowIndex >= state.queue.length) return null;
    return state.queue[state.nowIndex];
  }

  function playTrackById(id) {
    const t = state.catalog.find(x => x.id === id);
    if (!t) {
      toast("Şarkı bulunamadı.");
      return;
    }
    // queue = all tracks, start at that track
    const idx = state.catalog.findIndex(x => x.id === id);
    setQueue(state.catalog, idx);
    loadAndPlayCurrent();
  }

  function loadAndPlayCurrent(autoPlay = true) {
    const a = el.audio;
    const t = currentTrack();
    if (!a || !t) return;

    a.src = t.src;
    a.load();

    updateNowPlayingUI(t);
    updateFavButton();

    const s = getSession();
    if (s?.email) pushRecent(s.email, t.id);

    if (autoPlay) {
      a.play().then(() => {
        setPlayBtn(true);
      }).catch(() => {
        setPlayBtn(false);
        toast("Oynatma engellendi. Bir kez ▶ tıkla.");
      });
    }
  }

  function setPlayBtn(isPlaying) {
    if (!el.btnPlay) return;
    el.btnPlay.textContent = isPlaying ? "⏸" : "▶";
  }

  function updateNowPlayingUI(t) {
    if (el.nowTitle) el.nowTitle.textContent = t?.title || "Henüz çalan yok";
    if (el.nowArtist) el.nowArtist.textContent = t?.artist || "Bir şarkı seç";
  }

  function nextTrack() {
    if (!state.queue.length) return;
    state.nowIndex = (state.nowIndex + 1) % state.queue.length;
    loadAndPlayCurrent(true);
  }

  function prevTrack() {
    if (!state.queue.length) return;
    state.nowIndex = (state.nowIndex - 1 + state.queue.length) % state.queue.length;
    loadAndPlayCurrent(true);
  }

  function updateFavButton() {
    const s = getSession();
    const email = s?.email;
    const t = currentTrack();
    if (!el.btnFavToggle) return;

    if (!email || !t) {
      el.btnFavToggle.textContent = "♡";
      return;
    }

    const favs = getFavs(email);
    const isFav = favs.includes(t.id);
    el.btnFavToggle.textContent = isFav ? "♥" : "♡";
  }

  function toggleFav(trackId) {
    const s = getSession();
    const email = s?.email;
    if (!email) {
      toast("Favori için giriş yap.");
      showView("auth");
      setAuthMode("login");
      return;
    }

    const favs = getFavs(email);
    const exists = favs.includes(trackId);
    const next = exists ? favs.filter(x => x !== trackId) : [trackId, ...favs];
    setFavs(email, next);

    toast(exists ? "Favoriden çıkarıldı" : "Favoriye eklendi");

    // refresh UI
    updateFavButton();
    renderLibrary();
    renderSearch();
  }

  // ---------- Wiring ----------
  function wireTabs() {
    if (el.tabLogin) el.tabLogin.addEventListener("click", () => setAuthMode("login"));
    if (el.tabRegister) el.tabRegister.addEventListener("click", () => setAuthMode("register"));
  }

  function wireAuthForm() {
    if (!el.authForm) return;

    el.authForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const email = (el.inEmail?.value || "").trim().toLowerCase();
      const pass = (el.inPass?.value || "").trim();
      const fullName = (el.inFullName?.value || "").trim();
      const pass2 = (el.inPass2?.value || "").trim();

      if (!email || !pass) {
        toast("E-posta ve şifre gerekli.");
        return;
      }

      const users = getUsers();

      if (state.authMode === "register") {
        if (!fullName) {
          toast("Ad Soyad gerekli.");
          return;
        }
        if (pass.length < 4) {
          toast("Şifre en az 4 karakter olmalı.");
          return;
        }
        if (pass !== pass2) {
          toast("Şifreler uyuşmuyor.");
          return;
        }
        const exists = users.some(u => u.email === email);
        if (exists) {
          toast("Bu e-posta zaten kayıtlı.");
          return;
        }
        users.push({ email, pass, fullName, createdAt: Date.now() });
        setUsers(users);

        setSession(email);
        updateTopProfile();
        toast("Kayıt başarılı.");
        // login sonrası ana sayfa
        showView("home");
        renderHome();
        renderLibrary();
        return;
      }

      // login
      const found = users.find(u => u.email === email && u.pass === pass);
      if (!found) {
        toast("E-posta veya şifre hatalı.");
        return;
      }

      setSession(email);
      updateTopProfile();
      toast("Giriş başarılı.");
      showView("home");
      renderHome();
      renderLibrary();
    });
  }

  function wireNav() {
    el.navBtns.forEach((b) => {
      b.addEventListener("click", () => {
        const v = b.dataset.view;
        const s = getSession();

        if ((v === "library") && !s?.email) {
          toast("Kütüphane için giriş yap.");
          showView("auth");
          setAuthMode("login");
          return;
        }

        showView(v);
        if (v === "home") renderHome();
        if (v === "search") renderSearch();
        if (v === "library") renderLibrary();
      });
    });

    if (el.btnGoSearch) {
      el.btnGoSearch.addEventListener("click", () => {
        showView("search");
        renderSearch();
      });
    }

    if (el.btnStartMix) {
      el.btnStartMix.addEventListener("click", () => {
        if (!state.catalog.length) {
          toast("Katalog boş. catalog.json kontrol et.");
          return;
        }
        setQueue(shuffle([...state.catalog]), 0);
        loadAndPlayCurrent(true);
      });
    }
  }

  function wireHomeClicks() {
    // delegate for route chips and featured tiles
    document.addEventListener("click", (e) => {
      const routeBtn = e.target.closest?.(".routeChip");
      if (routeBtn && routeBtn.dataset.route) {
        const key = routeBtn.dataset.route;
        const tracks = state.catalog.filter(t => (t.mood || "").toLowerCase() === key.toLowerCase());
        const list = tracks.length ? tracks : state.catalog;
        setQueue(shuffle([...list]), 0);
        loadAndPlayCurrent(true);
        toast(`${key} rotası başladı`);
        return;
      }

      const tile = e.target.closest?.(".tile");
      if (tile && tile.dataset.track) {
        playTrackById(tile.dataset.track);
        return;
      }
    });

    // keyboard accessibility for tiles
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const active = document.activeElement;
      if (active && active.classList?.contains("tile") && active.dataset.track) {
        playTrackById(active.dataset.track);
      }
    });
  }

  function wireSearch() {
    if (el.q) {
      el.q.addEventListener("input", () => renderSearch());
    }
    if (el.btnClearSearch) {
      el.btnClearSearch.addEventListener("click", () => {
        if (el.q) el.q.value = "";
        renderSearch();
      });
    }

    el.pills.forEach((p) => {
      p.addEventListener("click", () => {
        el.pills.forEach(x => x.classList.remove("active"));
        p.classList.add("active");
        state.filter = p.dataset.filter || "all";
        renderSearch();
      });
    });

    // delegate for play/fav/artist actions
    document.addEventListener("click", (e) => {
      const playBtn = e.target.closest?.("[data-play]");
      if (playBtn) {
        playTrackById(playBtn.dataset.play);
        return;
      }

      const favBtn = e.target.closest?.("[data-fav]");
      if (favBtn) {
        toggleFav(favBtn.dataset.fav);
        return;
      }

      const artistPlay = e.target.closest?.("[data-artist-play]");
      if (artistPlay) {
        const a = artistPlay.dataset.artistPlay;
        const list = state.catalog.filter(t => t.artist === a);
        if (!list.length) return;
        setQueue(list, 0);
        loadAndPlayCurrent(true);
        toast(`${a} çalınıyor`);
        return;
      }

      const artistShow = e.target.closest?.("[data-artist-show]");
      if (artistShow) {
        const a = artistShow.dataset.artistShow;
        if (el.q) el.q.value = a;
        state.filter = "song";
        el.pills.forEach(x => x.classList.toggle("active", x.dataset.filter === "song"));
        renderSearch();
      }
    });
  }

  function wireLibraryActions() {
    document.addEventListener("click", (e) => {
      const playBtn = e.target.closest?.("[data-play]");
      if (playBtn) {
        playTrackById(playBtn.dataset.play);
        return;
      }
      const favBtn = e.target.closest?.("[data-fav]");
      if (favBtn) {
        toggleFav(favBtn.dataset.fav);
        return;
      }
    });
  }

  function wireLogout() {
    if (!el.btnLogout) return;
    el.btnLogout.addEventListener("click", () => {
      clearSession();
      updateTopProfile();
      toast("Çıkış yapıldı.");
      showView("auth");
      setAuthMode("login");
      renderLibrary();
      updateFavButton();
    });
  }

  function wirePlayer() {
    const a = el.audio;
    if (!a) return;

    if (el.vol) {
      el.vol.addEventListener("input", () => {
        a.volume = Number(el.vol.value || 0.9);
      });
      a.volume = Number(el.vol.value || 0.9);
    }

    if (el.btnPlay) {
      el.btnPlay.addEventListener("click", () => {
        if (!a.src) {
          // play first track if nothing selected
          if (state.catalog.length) {
            setQueue(state.catalog, 0);
            loadAndPlayCurrent(true);
          } else {
            toast("Katalog boş.");
          }
          return;
        }
        if (a.paused) {
          a.play().then(() => setPlayBtn(true)).catch(() => toast("Oynatma engellendi."));
        } else {
          a.pause();
          setPlayBtn(false);
        }
      });
    }

    if (el.btnNext) el.btnNext.addEventListener("click", () => nextTrack());
    if (el.btnPrev) el.btnPrev.addEventListener("click", () => prevTrack());

    if (el.seek) {
      el.seek.addEventListener("input", () => {
        if (!isFinite(a.duration) || a.duration <= 0) return;
        const v = Number(el.seek.value);
        const t = (v / 1000) * a.duration;
        a.currentTime = t;
      });
    }

    a.addEventListener("timeupdate", () => {
      if (el.tCur) el.tCur.textContent = fmtTime(a.currentTime);
      if (el.seek && isFinite(a.duration) && a.duration > 0) {
        el.seek.value = String(Math.floor((a.currentTime / a.duration) * 1000));
      }
    });

    a.addEventListener("loadedmetadata", () => {
      if (el.tDur) el.tDur.textContent = fmtTime(a.duration);
    });

    a.addEventListener("ended", () => nextTrack());

    if (el.btnFavToggle) {
      el.btnFavToggle.addEventListener("click", () => {
        const t = currentTrack();
        if (!t) return;
        toggleFav(t.id);
      });
    }
  }

  // ---------- Utils ----------
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---------- Boot ----------
  async function boot() {
    bindElements();
    wireTabs();
    wireAuthForm();
    wireNav();
    wireHomeClicks();
    wireSearch();
    wireLibraryActions();
    wireLogout();
    wirePlayer();

    setAuthMode("login");

    await loadCatalog();

    renderHome();
    renderSearch();
    renderLibrary();

    updateTopProfile();

    // initial route: if session -> home else auth
    const s = getSession();
    if (s?.email) {
      showView("home");
      toast("Hoş geldin!");
    } else {
      showView("auth");
    }

    enableButtonFeedback();
    state.isReady = true;
  }

  document.addEventListener("DOMContentLoaded", boot);
})();

