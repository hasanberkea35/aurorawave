(() => {
  "use strict";

  const JAMENDO_CLIENT_ID = "82d8459a";
  const JAMENDO_API = "https://api.jamendo.com/v3.0";
  const PAGE_SIZE = 24;

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  const views = {
    home: $("#viewHome"),
    search: $("#viewSearch"),
    library: $("#viewLibrary"),
    auth: $("#viewAuth"),
  };

  const nav = {
    home: $("#navHome"),
    search: $("#navSearch"),
    library: $("#navLibrary"),
    auth: $("#navAuth"),
  };

  const audioEl = $("#awPlayer");
  const nowTitle = $("#nowTitle");
  const nowArtist = $("#nowArtist");
  const nowCover = $("#nowCover");
  const btnPlay = $("#btnPlay");
  const btnPrev = $("#btnPrev");
  const btnNext = $("#btnNext");
  const seek = $("#seek");
  const timeCur = $("#timeCur");
  const timeDur = $("#timeDur");
  const vol = $("#vol");

  const userBadge = $("#userBadge");
  const btnLogout = $("#btnLogout");

  const goSearch = $("#goSearch");
  const goLibrary = $("#goLibrary");

  const searchInput = $("#searchInput");
  const searchBtn = $("#searchBtn");
  const searchResults = $("#searchResults");
  const searchMeta = $("#searchMeta");
  const searchEmpty = $("#searchEmpty");

  const libraryList = $("#libraryList");

  const authForm = $("#authForm");
  const tabLogin = $("#tabLogin");
  const tabRegister = $("#tabRegister");
  const authTitle = $("#authTitle");
  const btnSubmit = $("#btnSubmit");
  const nameEl = $("#name");
  const emailEl = $("#email");
  const passEl = $("#pass");
  const pass2El = $("#pass2");

  // --- tiny toast
  function toast(msg){
    let t = $("#awToast");
    if (!t){
      t = document.createElement("div");
      t.id = "awToast";
      t.style.cssText = "position:fixed;left:50%;bottom:92px;transform:translateX(-50%);background:rgba(0,0,0,.75);color:#fff;padding:10px 14px;border-radius:12px;font:14px/1.3 system-ui;z-index:99999;opacity:0;transition:opacity .2s;";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(toast._tm);
    toast._tm = setTimeout(()=>t.style.opacity="0", 1600);
  }

  function showView(key){
    Object.values(views).forEach(v => v && (v.style.display="none"));
    if (views[key]) views[key].style.display = "";
    Object.entries(nav).forEach(([k, b]) => b && b.classList.toggle("active", k===key));
  }

  // --- local auth (demo)
  const LS_SESSION = "aw_session_v1";
  const LS_USERS = "aw_users_v1";
  const LS_LIBRARY = "aw_library_v1";

  function getSession(){ try{ return JSON.parse(localStorage.getItem(LS_SESSION)||"null"); }catch{ return null; } }
  function setSession(email){ localStorage.setItem(LS_SESSION, JSON.stringify({email, ts:Date.now()})); }
  function clearSession(){ localStorage.removeItem(LS_SESSION); }

  function loadUsers(){ try{ return JSON.parse(localStorage.getItem(LS_USERS)||"[]"); }catch{ return []; } }
  function saveUsers(u){ localStorage.setItem(LS_USERS, JSON.stringify(u)); }

  function loadLibrary(email){
    try{
      const all = JSON.parse(localStorage.getItem(LS_LIBRARY)||"{}") || {};
      return all[email] || [];
    }catch{ return []; }
  }
  function saveLibrary(email, items){
    let all = {};
    try{ all = JSON.parse(localStorage.getItem(LS_LIBRARY)||"{}") || {}; }catch{}
    all[email]=items;
    localStorage.setItem(LS_LIBRARY, JSON.stringify(all));
  }

  // --- player queue
  let queue = [];
  let qi = -1;

  const fmtTime = (sec) => {
    if (!Number.isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec/60);
    const s = Math.floor(sec%60);
    return `${m}:${String(s).padStart(2,"0")}`;
  };

  function setNow(track){
    if (nowTitle) nowTitle.textContent = track?.title || "Henüz çalan yok";
    if (nowArtist) nowArtist.textContent = track?.artist || "Bir şarkı seç";
    if (nowCover){
      nowCover.style.backgroundImage = track?.cover ? `url("${track.cover}")` : "";
    }
  }

  async function playTrack(track){
    if (!audioEl) return toast("audio bulunamadı");
    if (!track?.audio) return toast("audio link yok");
    setNow(track);
    try{
      audioEl.src = track.audio;
      await audioEl.play();
      if (btnPlay) btnPlay.textContent = "⏸";
    }catch{
      toast("Tarayıcı oynatmayı engelledi. Play'e bas.");
    }
  }

  function playIndex(i){
    if (i<0 || i>=queue.length) return;
    qi=i;
    playTrack(queue[qi]);
  }

  function next(){
    if (!queue.length) return;
    const ni = qi<0 ? 0 : (qi+1)%queue.length;
    playIndex(ni);
  }
  function prev(){
    if (!queue.length) return;
    const pi = qi<=0 ? queue.length-1 : qi-1;
    playIndex(pi);
  }

  // --- jamendo
  function jamendoUrl(path, params={}){
    const u = new URL(`${JAMENDO_API}/${path}`);
    u.searchParams.set("client_id", JAMENDO_CLIENT_ID);
    u.searchParams.set("format", "json");
    Object.entries(params).forEach(([k,v]) => {
      if (v===undefined || v===null || v==="") return;
      u.searchParams.set(k, String(v));
    });
    return u.toString();
  }

  async function jamendoSearchTracks(q){
    const url = jamendoUrl("tracks", {
      search: q,
      audioformat: "mp31",
      limit: PAGE_SIZE,
      order: "relevance"
    });
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    return (data.results || []).map(t => ({
      id: t.id,
      title: t.name,
      artist: t.artist_name,
      cover: t.album_image || t.image || "",
      audio: t.audio,
      duration: Number(t.duration || 0)
    }));
  }

  function renderResults(items){
    if (!searchResults) return;
    if (!items.length){
      searchResults.innerHTML = "";
      if (searchEmpty) searchEmpty.style.display = "";
      return;
    }
    if (searchEmpty) searchEmpty.style.display = "none";

    searchResults.innerHTML = items.map((t, idx)=>`
      <div class="aw-result">
        <div class="aw-result-cover" style="background-image:url('${t.cover || ""}')"></div>
        <div class="aw-result-main">
          <div class="aw-result-title">${t.title}</div>
          <div class="aw-result-artist">${t.artist}</div>
        </div>
        <button class="aw-result-play" data-idx="${idx}" type="button">▶</button>
        <button class="aw-result-save" data-idx="${idx}" type="button">♡</button>
      </div>
    `).join("");

    $$(".aw-result-play", searchResults).forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const i = Number(btn.dataset.idx);
        queue = items;
        playIndex(i);
      });
    });

    $$(".aw-result-save", searchResults).forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const s = getSession();
        if (!s?.email){
          toast("Kaydetmek için giriş yap");
          showView("auth");
          return;
        }
        const i = Number(btn.dataset.idx);
        const lib = loadLibrary(s.email);
        const tr = items[i];
        if (!tr) return;
        if (lib.some(x=>x.id===tr.id)) return toast("Zaten kütüphanede");
        lib.unshift(tr);
        saveLibrary(s.email, lib);
        toast("Kütüphaneye eklendi");
      });
    });
  }

  async function doSearch(){
    const q = (searchInput?.value || "").trim();
    if (q.length < 2) return toast("En az 2 karakter yaz");
    if (searchMeta) searchMeta.textContent = "Aranıyor…";
    try{
      const items = await jamendoSearchTracks(q);
      if (searchMeta) searchMeta.textContent = `${items.length} sonuç`;
      renderResults(items);
    }catch(e){
      console.error(e);
      if (searchMeta) searchMeta.textContent = "Arama başarısız";
      toast("Jamendo araması başarısız");
    }
  }

  function renderLibrary(){
    if (!libraryList) return;
    const s = getSession();
    if (!s?.email){
      libraryList.innerHTML = `<div class="aw-empty">Kütüphaneyi görmek için giriş yap.</div>`;
      return;
    }
    const lib = loadLibrary(s.email);
    if (!lib.length){
      libraryList.innerHTML = `<div class="aw-empty">Kütüphanen boş. Ara’dan ekle.</div>`;
      return;
    }

    libraryList.innerHTML = lib.map((t, idx)=>`
      <div class="aw-lib">
        <div class="aw-lib-cover" style="background-image:url('${t.cover || ""}')"></div>
        <div class="aw-lib-main">
          <div class="aw-lib-title">${t.title}</div>
          <div class="aw-lib-artist">${t.artist}</div>
        </div>
        <button class="aw-lib-play" data-idx="${idx}" type="button">▶</button>
        <button class="aw-lib-del" data-idx="${idx}" type="button">✕</button>
      </div>
    `).join("");

    $$(".aw-lib-play", libraryList).forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const i = Number(btn.dataset.idx);
        queue = lib;
        playIndex(i);
      });
    });

    $$(".aw-lib-del", libraryList).forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const i = Number(btn.dataset.idx);
        const next = lib.filter((_,j)=>j!==i);
        saveLibrary(s.email, next);
        renderLibrary();
        toast("Kaldırıldı");
      });
    });
  }

  function setAuthMode(mode){
    const isReg = mode === "register";
    if (authTitle) authTitle.textContent = isReg ? "Kayıt ol" : "Giriş yap";
    if (btnSubmit) btnSubmit.textContent = isReg ? "Kayıt ol" : "Giriş yap";
    if (tabLogin) tabLogin.classList.toggle("active", !isReg);
    if (tabRegister) tabRegister.classList.toggle("active", isReg);
    if (nameEl) nameEl.style.display = isReg ? "" : "none";
    if (pass2El) pass2El.style.display = isReg ? "" : "none";
    authForm.dataset.mode = isReg ? "register" : "login";
  }

  function refreshUserUI(){
    const s = getSession();
    if (userBadge) userBadge.textContent = s?.email ? s.email : "Misafir";
  }

  // --- bind
  document.addEventListener("DOMContentLoaded", () => {
    // NAV
    nav.home?.addEventListener("click", ()=>{ showView("home"); });
    nav.search?.addEventListener("click", ()=>{ showView("search"); searchInput?.focus(); });
    nav.library?.addEventListener("click", ()=>{ showView("library"); renderLibrary(); });
    nav.auth?.addEventListener("click", ()=>{ showView("auth"); });

    goSearch?.addEventListener("click", ()=>{ showView("search"); searchInput?.focus(); });
    goLibrary?.addEventListener("click", ()=>{ showView("library"); renderLibrary(); });

    // SEARCH
    searchBtn?.addEventListener("click", doSearch);
    searchInput?.addEventListener("keydown", (e)=>{ if (e.key==="Enter") doSearch(); });

    // AUTH
    setAuthMode("login");
    tabLogin?.addEventListener("click", ()=>setAuthMode("login"));
    tabRegister?.addEventListener("click", ()=>setAuthMode("register"));

    authForm?.addEventListener("submit", (e)=>{
      e.preventDefault();
      const mode = authForm.dataset.mode || "login";
      const email = (emailEl?.value || "").trim().toLowerCase();
      const pass = passEl?.value || "";
      const name = (nameEl?.value || "").trim();
      const pass2 = pass2El?.value || "";

      if (!email.includes("@")) return toast("E-posta hatalı");
      if (pass.length < 4) return toast("Şifre en az 4 karakter");

      const users = loadUsers();

      if (mode === "register"){
        if (!name) return toast("Ad Soyad yaz");
        if (pass !== pass2) return toast("Şifreler aynı değil");
        if (users.some(u=>u.email===email)) return toast("Bu e-posta kayıtlı");
        users.push({email, pass, name, created:Date.now()});
        saveUsers(users);
        setSession(email);
        refreshUserUI();
        toast("Kayıt başarılı");
        showView("home");
        return;
      }

      const found = users.find(u=>u.email===email && u.pass===pass);
      if (!found) return toast("E-posta/şifre yanlış");
      setSession(email);
      refreshUserUI();
      toast("Giriş başarılı");
      showView("home");
    });

    btnLogout?.addEventListener("click", ()=>{
      clearSession();
      refreshUserUI();
      toast("Çıkış yapıldı");
      showView("home");
    });

    // PLAYER
    btnPlay?.addEventListener("click", async ()=>{
      if (!audioEl) return;
      if (audioEl.paused){
        try{ await audioEl.play(); btnPlay.textContent="⏸"; }catch{ toast("Şarkı seç"); }
      }else{
        audioEl.pause(); btnPlay.textContent="▶";
      }
    });
    btnNext?.addEventListener("click", next);
    btnPrev?.addEventListener("click", prev);

    audioEl?.addEventListener("loadedmetadata", ()=>{
      if (timeDur) timeDur.textContent = fmtTime(audioEl.duration);
    });
    audioEl?.addEventListener("timeupdate", ()=>{
      if (timeCur) timeCur.textContent = fmtTime(audioEl.currentTime);
      if (seek && Number.isFinite(audioEl.duration) && audioEl.duration>0){
        seek.value = String(Math.floor((audioEl.currentTime/audioEl.duration)*1000));
      }
    });
    audioEl?.addEventListener("ended", next);

    seek?.addEventListener("input", ()=>{
      if (!audioEl || !Number.isFinite(audioEl.duration) || audioEl.duration<=0) return;
      const p = Number(seek.value)/1000;
      audioEl.currentTime = p * audioEl.duration;
    });

    vol?.addEventListener("input", ()=>{
      if (!audioEl) return;
      audioEl.volume = Math.min(1, Math.max(0, Number(vol.value)));
    });

    // initial
    refreshUserUI();
    showView("home");
    setNow(null);
  });
})();





