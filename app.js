(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const fmtTime = (sec) => {
    sec = Math.floor(isFinite(sec) ? sec : 0);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const LS_USERS = "aw_users_v1";
  const LS_SESSION = "aw_session_v1";
  const LS_LIKES = "aw_likes_v1";

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getSession() {
    return loadJSON(LS_SESSION, null);
  }
  function setSession(sessionObj) {
    saveJSON(LS_SESSION, sessionObj);
  }
  function clearSession() {
    localStorage.removeItem(LS_SESSION);
  }

  function getLikes() {
    return loadJSON(LS_LIKES, []);
  }
  function setLikes(arr) {
    saveJSON(LS_LIKES, arr);
  }

  // ---------- DOM ----------
  const viewAuth = $("viewAuth");
  const viewApp = $("viewApp");

  const pageHome = $("pageHome");
  const pageSearch = $("pageSearch");
  const pageLibrary = $("pageLibrary");

  const userBadge = $("userBadge");
  const btnLogout = $("btnLogout");

  const btnTabLogin = $("btnTabLogin");
  const btnTabRegister = $("btnTabRegister");
  const authTitle = $("authTitle");
  const authForm = $("authForm");
  const btnSubmit = $("btnSubmit");

  const rowName = $("rowName");
  const rowPass2 = $("rowPass2");
  const inpName = $("inpName");
  const inpEmail = $("inpEmail");
  const inpPass = $("inpPass");
  const inpPass2 = $("inpPass2");

  const navBtns = Array.from(document.querySelectorAll(".navbtn"));
  const btnGoSearch = $("btnGoSearch");
  const btnStart = $("btnStart");
  const chips = Array.from(document.querySelectorAll(".chip"));

  const searchInput = $("searchInput");
  const btnClearSearch = $("btnClearSearch");
  const searchResults = $("searchResults");
  const likedList = $("likedList");

  const nowTitle = $("nowTitle");
  const nowArtist = $("nowArtist");

  const btnPrev = $("btnPrev");
  const btnPlay = $("btnPlay");
  const btnNext = $("btnNext");
  const btnLike = $("btnLike");
  const seek = $("seek");
  const tCur = $("tCur");
  const tDur = $("tDur");
  const vol = $("vol");

  const audio = $("awPlayer");
  const ytWrap = $("ytWrap");

  // Defensive: if something missing, do nothing instead of crashing.
  if (!viewAuth || !viewApp || !audio) return;

  // ---------- State ----------
  let mode = "login"; // login | register
  let catalog = [];
  let filtered = [];
  let currentIndex = -1;

  let ytPlayer = null;
  let ytReady = false;
  let ytLoading = false;

  // ---------- UI: view switching ----------
  function showApp(isLoggedIn) {
    viewAuth.style.display = isLoggedIn ? "none" : "flex";
    viewApp.style.display = isLoggedIn ? "block" : "none";
  }

  function showPage(tab) {
    const map = { home: pageHome, search: pageSearch, library: pageLibrary };
    Object.entries(map).forEach(([k, el]) => {
      if (!el) return;
      el.style.display = (k === tab) ? "flex" : "none";
    });

    navBtns.forEach((b) => {
      b.classList.toggle("is-active", b.dataset.tab === tab);
    });

    if (tab === "search") {
      setTimeout(() => searchInput && searchInput.focus(), 60);
    }
    if (tab === "library") {
      renderLikes();
    }
  }

  // ---------- Auth ----------
  function setAuthMode(m) {
    mode = m;
    const isLogin = mode === "login";

    if (btnTabLogin) btnTabLogin.classList.toggle("is-active", isLogin);
    if (btnTabRegister) btnTabRegister.classList.toggle("is-active", !isLogin);

    if (authTitle) authTitle.textContent = isLogin ? "Devam etmek için giriş yap" : "Hesap oluştur";
    if (btnSubmit) btnSubmit.textContent = isLogin ? "Giriş yap" : "Kayıt ol";

    if (rowName) rowName.style.display = isLogin ? "none" : "flex";
    if (rowPass2) rowPass2.style.display = isLogin ? "none" : "flex";
  }

  function ensureUsersSeed() {
    const users = loadJSON(LS_USERS, null);
    if (Array.isArray(users)) return;
    saveJSON(LS_USERS, []);
  }

  function registerUser(name, email, pass, pass2) {
    if (!email || !pass) return { ok: false, msg: "E-posta ve şifre gerekli." };
    if (pass.length < 4) return { ok: false, msg: "Şifre en az 4 karakter olsun." };
    if (pass !== pass2) return { ok: false, msg: "Şifreler eşleşmiyor." };

    const users = loadJSON(LS_USERS, []);
    const exists = users.some(u => String(u.email).toLowerCase() === String(email).toLowerCase());
    if (exists) return { ok: false, msg: "Bu e-posta zaten kayıtlı." };

    users.push({ name: name || "Kullanıcı", email, pass });
    saveJSON(LS_USERS, users);
    return { ok: true };
  }

  function loginUser(email, pass) {
    if (!email || !pass) return { ok: false, msg: "E-posta ve şifre gerekli." };
    const users = loadJSON(LS_USERS, []);
    const found = users.find(u =>
      String(u.email).toLowerCase() === String(email).toLowerCase() &&
      String(u.pass) === String(pass)
    );
    if (!found) return { ok: false, msg: "E-posta veya şifre hatalı." };
    return { ok: true, user: { name: found.name, email: found.email } };
  }

  function setUserBadge() {
    const s = getSession();
    if (userBadge) userBadge.textContent = s?.email ? s.email : "Misafir";
  }

  // ---------- Catalog ----------
  async function loadCatalog() {
    try {
      const res = await fetch("./catalog.json", { cache: "no-store" });
      if (!res.ok) throw new Error("catalog.json yüklenemedi");
      catalog = await res.json();
      if (!Array.isArray(catalog)) catalog = [];
      filtered = catalog.slice();
      renderResults(filtered);
    } catch (e) {
      catalog = [];
      filtered = [];
      renderResults([]);
    }
  }

  // ---------- Rendering ----------
  function renderResults(list) {
    if (!searchResults) return;
    searchResults.innerHTML = "";

    list.forEach((track, idx) => {
      const realIndex = catalog.findIndex(t => t.id === track.id);

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="thumb"></div>
        <div class="body">
          <div class="title"></div>
          <div class="artist"></div>
          <div class="actions">
            <button class="like" type="button" title="Beğen">♡</button>
            <button class="play" type="button">Oynat</button>
          </div>
        </div>
      `;

      card.querySelector(".title").textContent = track.title || "Parça";
      card.querySelector(".artist").textContent = track.artist || "Sanatçı";

      const likeBtn = card.querySelector(".like");
      const playBtn2 = card.querySelector(".play");

      if (likeBtn) {
        likeBtn.onclick = () => toggleLike(track.id);
        likeBtn.textContent = getLikes().includes(track.id) ? "♥" : "♡";
      }
      if (playBtn2) {
        playBtn2.onclick = () => playTrack(realIndex >= 0 ? realIndex : idx);
      }

      searchResults.appendChild(card);
    });
  }

  function renderLikes() {
    if (!likedList) return;
    likedList.innerHTML = "";

    const likes = getLikes();
    const likedTracks = catalog.filter(t => likes.includes(t.id));
    if (likedTracks.length === 0) {
      const p = document.createElement("p");
      p.className = "note";
      p.textContent = "Henüz beğenilen yok.";
      likedList.appendChild(p);
      return;
    }

    likedTracks.forEach((track) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="thumb"></div>
        <div class="body">
          <div class="title"></div>
          <div class="artist"></div>
          <div class="actions">
            <button class="like" type="button" title="Beğen">♥</button>
            <button class="play" type="button">Oynat</button>
          </div>
        </div>
      `;
      card.querySelector(".title").textContent = track.title || "Parça";
      card.querySelector(".artist").textContent = track.artist || "Sanatçı";

      card.querySelector(".like").onclick = () => toggleLike(track.id, true);
      card.querySelector(".play").onclick = () => {
        const i = catalog.findIndex(t => t.id === track.id);
        playTrack(i);
      };

      likedList.appendChild(card);
    });
  }

  // ---------- Likes ----------
  function toggleLike(trackId, forceRemove = false) {
    const likes = getLikes();
    const has = likes.includes(trackId);
    const next = forceRemove
      ? likes.filter(id => id !== trackId)
      : (has ? likes.filter(id => id !== trackId) : likes.concat([trackId]));

    setLikes(next);

    // Refresh UI
    if (searchInput && pageSearch && pageSearch.style.display !== "none") {
      applySearch(searchInput.value || "");
    }
    if (pageLibrary && pageLibrary.style.display !== "none") {
      renderLikes();
    }
    if (btnLike && currentIndex >= 0 && catalog[currentIndex]?.id === trackId) {
      btnLike.textContent = next.includes(trackId) ? "♥" : "♡";
    }
  }

  // ---------- Playback ----------
  function setNow(track) {
    if (nowTitle) nowTitle.textContent = track?.title || "Henüz çalan yok";
    if (nowArtist) nowArtist.textContent = track?.artist || "Bir şarkı seç";
    if (btnLike && track?.id) btnLike.textContent = getLikes().includes(track.id) ? "♥" : "♡";
  }

  function stopYouTube() {
    if (ytWrap) ytWrap.style.display = "none";
    if (ytPlayer && typeof ytPlayer.stopVideo === "function") {
      try { ytPlayer.stopVideo(); } catch {}
    }
  }

  function playTrack(index) {
    if (!Array.isArray(catalog) || catalog.length === 0) return;
    currentIndex = clamp(index, 0, catalog.length - 1);
    const track = catalog[currentIndex];
    setNow(track);

    // Stop whichever is not used
    audio.pause();

    if (track.type === "local") {
      stopYouTube();
      audio.src = track.src;
      audio.play().catch(() => {});
    } else if (track.type === "youtube") {
      audio.src = "";
      loadYouTube(track.youtubeId);
    }
  }

  function nextTrack() {
    if (!catalog.length) return;
    playTrack((currentIndex + 1) % catalog.length);
  }

  function prevTrack() {
    if (!catalog.length) return;
    playTrack((currentIndex - 1 + catalog.length) % catalog.length);
  }

  function togglePlayPause() {
    const track = catalog[currentIndex];
    if (!track) return;

    if (track.type === "local") {
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    } else if (track.type === "youtube") {
      if (ytPlayer && typeof ytPlayer.getPlayerState === "function") {
        const st = ytPlayer.getPlayerState();
        // 1 playing, 2 paused
        if (st === 1) ytPlayer.pauseVideo();
        else ytPlayer.playVideo();
      }
    }
  }

  // ---------- YouTube ----------
  function ensureYTScript() {
    if (ytReady || ytLoading) return;
    ytLoading = true;

    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    document.head.appendChild(s);

    window.onYouTubeIframeAPIReady = () => {
      ytReady = true;
      ytLoading = false;
    };
  }

  function loadYouTube(videoId) {
    if (!videoId) return;

    if (ytWrap) ytWrap.style.display = "block";
    ensureYTScript();

    // Wait until API ready
    const tick = () => {
      if (!ytReady || !window.YT || !window.YT.Player) {
        setTimeout(tick, 50);
        return;
      }

      if (ytPlayer && typeof ytPlayer.loadVideoById === "function") {
        try {
          ytPlayer.loadVideoById(videoId);
          ytPlayer.playVideo();
        } catch {}
        return;
      }

      // Create new player
      try {
        ytPlayer = new YT.Player("ytPlayer", {
          height: "220",
          width: "100%",
          videoId,
          playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1
          },
          events: {
            onReady: (ev) => {
              try { ev.target.playVideo(); } catch {}
            }
          }
        });
      } catch {}
    };
    tick();
  }

  // ---------- Search ----------
  function applySearch(q) {
    const query = String(q || "").trim().toLowerCase();
    if (!query) {
      filtered = catalog.slice();
    } else {
      filtered = catalog.filter(t =>
        String(t.title || "").toLowerCase().includes(query) ||
        String(t.artist || "").toLowerCase().includes(query)
      );
    }
    renderResults(filtered);
  }

  // ---------- Button feedback (tıklama hissi) ----------
  function pulse(el) {
    if (!el) return;
    el.animate(
      [{ transform: "scale(1)" }, { transform: "scale(0.98)" }, { transform: "scale(1)" }],
      { duration: 120, easing: "ease-out" }
    );
  }

  // ---------- Wiring ----------
  function wireAuth() {
    if (btnTabLogin) btnTabLogin.onclick = () => { pulse(btnTabLogin); setAuthMode("login"); };
    if (btnTabRegister) btnTabRegister.onclick = () => { pulse(btnTabRegister); setAuthMode("register"); };

    if (authForm) {
      authForm.addEventListener("submit", (e) => {
        e.preventDefault();

        const email = inpEmail ? inpEmail.value.trim() : "";
        const pass = inpPass ? inpPass.value : "";

        if (mode === "register") {
          const name = inpName ? inpName.value.trim() : "";
          const pass2 = inpPass2 ? inpPass2.value : "";

          const r = registerUser(name, email, pass, pass2);
          if (!r.ok) {
            alert(r.msg || "Kayıt başarısız.");
            return;
          }
          alert("Kayıt başarılı. Şimdi giriş yapabilirsin.");
          setAuthMode("login");
          return;
        }

        const r = loginUser(email, pass);
        if (!r.ok) {
          alert(r.msg || "Giriş başarısız.");
          return;
        }

        setSession({ email: r.user.email, name: r.user.name, at: Date.now() });
        setUserBadge();
        showApp(true);
        showPage("home");
      });
    }
  }

  function wireNav() {
    navBtns.forEach((b) => {
      b.onclick = () => {
        pulse(b);
        const tab = b.dataset.tab;
        if (!tab) return;
        showPage(tab);
      };
    });

    if (btnGoSearch) btnGoSearch.onclick = () => { pulse(btnGoSearch); showPage("search"); };
    if (btnStart) btnStart.onclick = () => { pulse(btnStart); showPage("search"); };

    chips.forEach((c) => {
      c.onclick = () => {
        pulse(c);
        const q = c.dataset.q || "";
        showPage("search");
        if (searchInput) {
          searchInput.value = q;
          applySearch(q);
        }
      };
    });
  }

  function wireSearch() {
    if (searchInput) {
      searchInput.addEventListener("input", () => applySearch(searchInput.value));
    }
    if (btnClearSearch) {
      btnClearSearch.onclick = () => {
        pulse(btnClearSearch);
        if (searchInput) searchInput.value = "";
        applySearch("");
      };
    }
  }

  function wirePlayer() {
    if (btnNext) btnNext.onclick = () => { pulse(btnNext); nextTrack(); };
    if (btnPrev) btnPrev.onclick = () => { pulse(btnPrev); prevTrack(); };
    if (btnPlay) btnPlay.onclick = () => { pulse(btnPlay); togglePlayPause(); };

    if (btnLike) {
      btnLike.onclick = () => {
        pulse(btnLike);
        const t = catalog[currentIndex];
        if (!t?.id) return;
        toggleLike(t.id);
      };
    }

    // Local audio timeline
    audio.addEventListener("loadedmetadata", () => {
      if (tDur) tDur.textContent = fmtTime(audio.duration);
    });
    audio.addEventListener("timeupdate", () => {
      if (tCur) tCur.textContent = fmtTime(audio.currentTime);
      if (seek && isFinite(audio.duration) && audio.duration > 0) {
        const v = (audio.currentTime / audio.duration) * 100;
        seek.value = String(clamp(v, 0, 100));
      }
    });
    audio.addEventListener("ended", () => nextTrack());

    if (seek) {
      seek.addEventListener("input", () => {
        if (!isFinite(audio.duration) || audio.duration <= 0) return;
        const pct = Number(seek.value || 0) / 100;
        audio.currentTime = pct * audio.duration;
      });
    }

    if (vol) {
      const setV = () => {
        const v = clamp(Number(vol.value || 75), 0, 100) / 100;
        audio.volume = v;
      };
      vol.addEventListener("input", setV);
      setV();
    }
  }

  function wireLogout() {
    if (!btnLogout) return;
    btnLogout.onclick = () => {
      pulse(btnLogout);
      clearSession();
      setUserBadge();
      showApp(false);
      showPage("home");
      stopYouTube();
      audio.pause();
      audio.src = "";
      setNow(null);
    };
  }

  // ---------- Boot ----------
  function boot() {
    ensureUsersSeed();
    setAuthMode("login");
    setUserBadge();

    wireAuth();
    wireNav();
    wireSearch();
    wirePlayer();
    wireLogout();

    loadCatalog();

    const s = getSession();
    const loggedIn = !!s?.email;
    showApp(loggedIn);

    // Start at home (app) or auth
    if (loggedIn) showPage("home");
    else showPage("home");
  }

  document.addEventListener("DOMContentLoaded", boot);
})();

