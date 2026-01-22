(() => {
  "use strict";

  const $ = (s, r=document) => r.querySelector(s);

  const views = {
    home: $("#viewHome"),
    youtube: $("#viewYouTube"),
  };

  const nav = {
    home: $("#navHome"),
    youtube: $("#navYouTube"),
  };

  const goYouTube = $("#goYouTube");

  const ytQuery = $("#ytQuery");
  const ytSearchOpen = $("#ytSearchOpen");
  const ytUrl = $("#ytUrl");
  const ytPlay = $("#ytPlay");
  const ytFrame = $("#ytFrame");

  const btnStopYT = $("#btnStopYT");

  // ----- UI helpers
  function showView(key){
    Object.values(views).forEach(v => v && (v.style.display="none"));
    if (views[key]) views[key].style.display = "";
    Object.entries(nav).forEach(([k, b]) => b && b.classList.toggle("active", k===key));
  }

  function toast(msg){
    let t = $("#awToast");
    if (!t){
      t = document.createElement("div");
      t.id = "awToast";
      t.style.cssText =
        "position:fixed;left:50%;bottom:92px;transform:translateX(-50%);" +
        "background:rgba(0,0,0,.78);color:#fff;padding:10px 14px;border-radius:12px;" +
        "font:14px/1.3 system-ui;z-index:99999;opacity:0;transition:opacity .18s;";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(toast._tm);
    toast._tm = setTimeout(()=>t.style.opacity="0", 1600);
  }

  // ----- YouTube helpers
  function extractYouTubeId(urlOrId) {
    const s = String(urlOrId || "").trim();

    // user pasted only the ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;

    try {
      const u = new URL(s);

      // youtu.be/VIDEOID
      if (u.hostname.includes("youtu.be")) {
        const id = u.pathname.replace("/", "").trim();
        if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }

      // youtube.com/watch?v=VIDEOID
      const v = u.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      // youtube.com/shorts/VIDEOID
      const mShorts = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (mShorts) return mShorts[1];

      // youtube.com/embed/VIDEOID
      const mEmbed = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (mEmbed) return mEmbed[1];

    } catch {
      // not a URL
    }

    return null;
  }

  function setYouTubeFrame(videoId) {
    if (!ytFrame) return;
    // privacy-enhanced domain
    ytFrame.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
  }

  function stopYouTube() {
    if (!ytFrame) return;
    ytFrame.src = "";
    toast("YouTube durduruldu");
  }

  // ----- bindings
  document.addEventListener("DOMContentLoaded", () => {
    // nav
    nav.home?.addEventListener("click", () => showView("home"));
    nav.youtube?.addEventListener("click", () => { showView("youtube"); ytQuery?.focus(); });
    goYouTube?.addEventListener("click", () => { showView("youtube"); ytQuery?.focus(); });

    // YouTube search open
    ytSearchOpen?.addEventListener("click", () => {
      const q = (ytQuery?.value || "").trim();
      if (q.length < 2) return toast("En az 2 karakter yaz.");
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    });

    // YouTube play from URL
    ytPlay?.addEventListener("click", () => {
      const id = extractYouTubeId(ytUrl?.value || "");
      if (!id) return toast("Geçerli YouTube linki yapıştır (watch?v=... veya youtu.be/...)");
      setYouTubeFrame(id);
      toast("YouTube oynatılıyor");
    });

    // stop
    btnStopYT?.addEventListener("click", stopYouTube);

    // boot
    showView("home");
  });
})();






