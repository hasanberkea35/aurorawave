(function () {
  "use strict";

  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);

  function safeParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }
  function toast(msg) { alert(msg); }

  function normalizeTR(s) {
    return (s || "")
      .toLowerCase()
      .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
      .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c");
  }
  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------- Storage ----------
  const LS_USERS = "aurora_users_v1";
  const LS_SESSION = "aurora_session_v1";
  const LS_CATALOG_CACHE = "aurora_catalog_cache_v1";

  function loadUsers() {
    return safeParse(localStorage.getItem(LS_USERS) || "[]", []);
  }
  function saveUsers(users) {
    localStorage.setItem(LS_USERS, JSON.stringify(users));
  }
  function setSession(email) {
    localStorage.setItem(LS_SESSION, JSON.stringify({ email, at: Date.now() }));
  }
  function getSession() {
    return safeParse(localStorage.getItem(LS_SESSION) || "null", null);
  }
  function clearSession() {
    localStorage.removeItem(LS_SESSION);
  }

  // ---------- Button Feedback (press + pulse) ----------
  function injectFeedbackCSSOnce() {
    if (document.getElementById("aw-feedback-css")) return;
    const style = document.createElement("style");
    style.id = "aw-feedback-css";
    style.textContent = `
      .pressable{ position:relative; transform:translateZ(0); transition:transform 120ms ease, filter 120ms ease; -webkit-tap-highlight-color:transparent; }
      .pressable:active{ transform:scale(.98); filter:brightness(1.08); }
      .pulse{ position:absolute; inset:0; border-radius:inherit; pointer-events:none; box-shadow:0 0 0 0 rgba(110,231,255,0); animation:pulseRing 260ms ease-out; }
      @keyframes pulseRing{
        0%{box-shadow:0 0 0 0 rgba(110,231,255,0);}
        40%{box-shadow:0 0 0 4px rgba(110,231,255,.18);}
        100%{box-shadow:0 0 0 10px rgba(110,231,255,0);}
      }
    `;
    document.head.appendChild(style);
  }
  function pulse(el) {
    if (!el) return;
    const old = el.querySelector(":scope > .pulse");
    if (old) old.remove();
    const p = document.createElement("span");
    p.className = "pulse";
    el.appendChild(p);
    setTimeout(() => p.remove(), 300);
  }
  function enableButtonFeedback() {
    injectFeedbackCSSOnce();
    const selectors = [
      "button", ".chip", ".ctaRow", ".searchRow",
      ".rowBtn", ".ghost", ".iconBtn", ".tab", ".navItem"
    ];
    document.querySelectorAll(selectors.join(",")).forEach((el) => {
      el.classList.add("pressable");
      el.addEventListener("click", () => pulse(el), { passive: true });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") pulse(el);
      });
    });
  }

  // ---------- Catalog State ----------
  const STATE = {
    catalog: [],     // {id,title,artist,url,license,attribution}
    currentIndex: -1
  };

  function setCatalog(tracks) {
    STATE.catalog = Array.isArray(tracks) ? tracks : [];
  }

  async function loadCatalog() {
    // 1) cache varsa hızlı başlat
    const cached = safeParse(localStorage.getItem(LS_CATALOG_CACHE) || "null", null);
    if (cached && Array.isArray(cached.tracks)) {
      setCatalog(cached.tracks);
    }

    // 2) network'ten güncelle (Live Server / host çalışınca)
    try {
      const res = await fetch("./catalog.json", { cache: "no-store" });
      if (!res.ok) throw new Error("catalog fetch failed: " + res.status);
      const data = await res.json();
      if (!data || !Array.isArray(data.tracks)) throw new Error("catalog format invalid");
      setCatalog(data.tracks);
      localStorage.setItem(LS_CATALOG_CACHE, JSON.stringify(data));
    } catch (e) {
      // cache de yoksa uyar
      if (!STATE.catalog.length) {
        console.error(e);
        toast("catalog.json okunamadı. Live Server ile açtığından emin ol.");
      }
    }
  }

  // ---------- UI State ----------
  function setAuthMode(mode) {
    document.body.setAttribute("data-auth-mode", mode);

    const tabLogin = $("tabLogin");
    const tabRegister = $("tabRegister");
    const title = document.querySelector(".auth-title");
    const btn = $("btnSubmit");
    const isLogin = mode === "login";

    if (tabLogin && tabRegister) {
      tabLogin.classList.toggle("active", isLogin);
      tabRegister.classList.toggle("active", !isLogin);
      tabLogin.setAttribute("aria-selected", String(isLogin));
      tabRegister.setAttribute("aria-selected", String(!isLogin));
    }

    if (title) title.textContent = isLogin ? "Devam etmek için giriş yap" : "Hesap oluştur";
    if (btn) btn.textContent = isLogin ? "Giriş yap" : "Kayıt ol";
  }

  function setAppState(state, email) {
    const authCard = $("authCard");
    const appShell = $("appShell");
    const mini = document.querySelector(".mini");
    const bottom = document.querySelector(".bottom");
    const btnLogout = $("btnLogout");
    const whoami = $("whoami");

    if (state === "app") {
      authCard?.classList.add("hidden");
      appShell?.classList.remove("hidden");
      mini?.classList.remove("hidden");
      bottom?.classList.remove("hidden");
      btnLogout?.classList.remove("hidden");
      if (whoami) {
        whoami.textContent = email || "";
        whoami.classList.remove("hidden");
      }
    } else {
      authCard?.classList.remove("hidden");
      appShell?.classList.add("hidden");
      mini?.classList.add("hidden");
      bottom?.classList.add("hidden");
      btnLogout?.classList.add("hidden");
      whoami?.classList.add("hidden");
    }
  }

  function showView(name) {
    const vHome = $("viewHome");
    const vSearch = $("viewSearch");
    const vLibrary = $("viewLibrary");

    const navHome = $("navHome");
    const navSearch = $("navSearch");
    const navLibrary = $("navLibrary");

    [vHome, vSearch, vLibrary].forEach(v => v && v.classList.add("hidden"));
    if (name === "home") vHome?.classList.remove("hidden");
    if (name === "search") vSearch?.classList.remove("hidden");
    if (name === "library") vLibrary?.classList.remove("hidden");

    [navHome, navSearch, navLibrary].forEach(b => b && b.classList.remove("active"));
    if (name === "home") navHome?.classList.add("active");
    if (name === "search") navSearch?.classList.add("active");
    if (name === "library") navLibrary?.classList.add("active");

    if (name === "search") {
      const inp = $("searchInput");
      if (inp) setTimeout(() => inp.focus(), 30);
      renderSearch(inp ? inp.value : "");
    }

    if (name === "library") {
      renderLibrary();
    }
  }

  function onAuthSuccess(email) {
    setSession(email);
    setAppState("app", email);
    showView("home");
  }

  // ---------- Player ----------
  function playTrackByIndex(index) {
    const audio = $("audioEl");
    if (!audio) return toast("audioEl bulunamadı (index.html kontrol et).");

    const track = STATE.catalog[index];
    if (!track) return;

    STATE.currentIndex = index;

    const nowT = $("nowTitle");
    const nowA = $("nowArtist");
    if (nowT) nowT.textContent = track.title || "—";
    if (nowA) nowA.textContent = track.artist || "—";

    audio.src = track.url;
    audio.play().catch(() => {});

    // Library attribution panel varsa güncelle
    const lic = $("nowLicense");
    if (lic) {
      lic.textContent = track.license ? `Lisans: ${track.license}` : "";
    }
    const att = $("nowAttribution");
    if (att) {
      att.textContent = track.attribution ? `Atıf: ${track.attribution}` : "";
    }
  }

  function wirePlayerControls() {
    const audio = $("audioEl");
    const btnPlay = $("btnPlay");
    const btnPrev = $("btnPrev");
    const btnNext = $("btnNext");

    btnPlay?.addEventListener("click", () => {
      if (!audio) return;
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    });

    btnPrev?.addEventListener("click", () => {
      if (!STATE.catalog.length) return;
      const next = STATE.currentIndex <= 0 ? STATE.catalog.length - 1 : STATE.currentIndex - 1;
      playTrackByIndex(next);
    });

    btnNext?.addEventListener("click", () => {
      if (!STATE.catalog.length) return;
      const next = STATE.currentIndex >= STATE.catalog.length - 1 ? 0 : STATE.currentIndex + 1;
      playTrackByIndex(next);
    });

    audio?.addEventListener("ended", () => {
      if (!STATE.catalog.length) return;
      const next = STATE.currentIndex >= STATE.catalog.length - 1 ? 0 : STATE.currentIndex + 1;
      playTrackByIndex(next);
    });
  }

  // ---------- Render Home/Search/Library ----------
  function renderHome() {
    // İstersen burada önerilenler alanını STATE.catalog’dan doldururuz
    // Bu fonksiyon boş kalabilir; ID varsa doldurur.
    const row = $("recoRow");
    if (!row) return;
    const picks = STATE.catalog.slice(0, 6);
    row.innerHTML = picks.map((x, i) => `
      <div class="tile" data-play="${i}">
        <div class="tileTitle">${escapeHtml(x.title)}</div>
        <div class="tileSub">${escapeHtml(x.artist)}</div>
      </div>
    `).join("");
  }

  function renderSearch(q) {
    const results = $("resultsList");
    const meta = $("resultMeta");
    if (!results || !meta) return;

    const nq = normalizeTR(q).trim();
    let filtered = STATE.catalog.map((t, idx) => ({ t, idx }));

    if (nq) {
      filtered = filtered.filter(({ t }) =>
        normalizeTR(t.title).includes(nq) || normalizeTR(t.artist).includes(nq)
      );
    }

    meta.textContent = nq ? `${filtered.length} sonuç • "${q}"` : `${filtered.length} içerik • Tüm şarkılar`;

    if (!filtered.length) {
      results.innerHTML = `
        <div class="card">
          <h3>Sonuç bulunamadı</h3>
          <p>Farklı bir şarkı veya sanatçı dene.</p>
        </div>
      `;
      return;
    }

    results.innerHTML = filtered.map(({ t, idx }) => `
      <div class="row">
        <div class="rowMain">
          <div class="rowTitle">${escapeHtml(t.title)}</div>
          <div class="rowSub">${escapeHtml(t.artist)}</div>
        </div>
        <button class="rowBtn" type="button" data-play="${idx}" aria-label="Çal">▶</button>
      </div>
    `).join("");
  }

  function renderLibrary() {
    const wrap = $("libraryList");
    if (!wrap) return;

    if (!STATE.catalog.length) {
      wrap.innerHTML = `<div class="card"><h3>Kitaplık boş</h3><p>Henüz katalog yüklenmedi.</p></div>`;
      return;
    }

    // Lisans/atıf paneli (isteğe bağlı) — HTML’de id’ler varsa görünür
    const lic = $("nowLicense");
    const att = $("nowAttribution");
    if (lic) lic.textContent = "";
    if (att) att.textContent = "";

    wrap.innerHTML = STATE.catalog.map((t, i) => `
      <div class="row">
        <div class="rowMain">
          <div class="rowTitle">${escapeHtml(t.title)}</div>
          <div class="rowSub">${escapeHtml(t.artist)}</div>
          <div class="rowMeta">${escapeHtml(t.license || "")}</div>
        </div>
        <button class="rowBtn" type="button" data-play="${i}" aria-label="Çal">▶</button>
      </div>
    `).join("");
  }

  // ---------- Wiring ----------
  function wireTabs() {
    $("tabLogin")?.addEventListener("click", (e) => { e.preventDefault(); setAuthMode("login"); }, true);
    $("tabRegister")?.addEventListener("click", (e) => { e.preventDefault(); setAuthMode("register"); }, true);
  }

  function wireForm() {
    const form = $("authForm");
    if (!form) return;

    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const mode = document.body.getAttribute("data-auth-mode") || "login";
      const email = ($("email")?.value || "").trim().toLowerCase();
      const pass = $("pass")?.value || "";
      const regName = ($("regName")?.value || "").trim();
      const pass2 = $("pass2")?.value || "";

      if (!email || !pass) return toast("E-posta ve şifre gerekli.");

      const users = loadUsers();

      if (mode === "register") {
        if (!regName) return toast("Ad Soyad gerekli.");
        if (pass.length < 6) return toast("Şifre en az 6 karakter olmalı.");
        if ($("pass2") && pass !== pass2) return toast("Şifreler eşleşmiyor.");
        if (users.some(u => u.email === email)) return toast("Bu e-posta zaten kayıtlı.");

        users.push({ email, pass, name: regName, createdAt: Date.now() });
        saveUsers(users);
        toast("Kayıt başarılı. Ana sayfaya geçiliyor.");
        return onAuthSuccess(email);
      }

      const found = users.find(u => u.email === email && u.pass === pass);
      if (!found) return toast("E-posta veya şifre hatalı.");

      toast("Giriş başarılı. Ana sayfaya geçiliyor.");
      onAuthSuccess(email);
    });
  }

  function wireLogout() {
    $("btnLogout")?.addEventListener("click", () => {
      clearSession();
      setAuthMode("login");
      setAppState("auth");
      showView("home");
      toast("Çıkış yapıldı.");
    });
  }

  function wireNav() {
    $("navHome")?.addEventListener("click", () => showView("home"));
    $("navSearch")?.addEventListener("click", () => showView("search"));
    $("navLibrary")?.addEventListener("click", () => showView("library"));

    $("btnQuickSearch")?.addEventListener("click", () => showView("search"));
    $("btnStart")?.addEventListener("click", () => showView("search"));
  }

  function wireSearch() {
    const inp = $("searchInput");
    const clearBtn = $("searchClear");
    const results = $("resultsList");

    inp?.addEventListener("input", () => renderSearch(inp.value));
    clearBtn?.addEventListener("click", () => {
      if (!inp) return;
      inp.value = "";
      renderSearch("");
      inp.focus();
    });

    // Hem search sonuçları hem library hem home tile tıklamaları
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-play]");
      if (!btn) return;
      const idx = Number(btn.getAttribute("data-play"));
      if (Number.isNaN(idx)) return;
      playTrackByIndex(idx);
      pulse(btn);
    });
  }

  // ---------- Boot ----------
  document.addEventListener("DOMContentLoaded", async () => {
    wireTabs();
    wireForm();
    wireLogout();
    wireNav();
    wireSearch();
    wirePlayerControls();

    setAuthMode("login");

    // Katalog yükle
    await loadCatalog();

    // Ana ekranı katalogla doldur
    renderHome();

    // Oturum kontrol
    const s = getSession();
    if (s && s.email) {
      setAppState("app", s.email);
      showView("home");
    } else {
      setAppState("auth");
      showView("home");
    }

    enableButtonFeedback();
  });

})();
