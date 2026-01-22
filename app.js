(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    tracks: [],
    filtered: [],
    currentIndex: -1,
    view: "home",
    liked: new Set(),
    library: [],
  };

  function setNotice(text, kind = "info") {
    const el = $("#searchStatus");
    if (!el) return;
    el.className = `notice ${kind}`;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
  }

  function fmtTime(sec) {
    if (!isFinite(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function pulse(el) {
    if (!el) return;
    el.classList.remove("pulse");
    void el.offsetWidth;
    el.classList.add("pulse");
  }

  // ---------- Views (Keşfet / Ara / Kütüphane) ----------
  function showView(name) {
    state.view = name;

    // views
    const map = {
      home: "#viewHome",
      search: "#viewSearch",
      library: "#viewLibrary",
      auth: "#viewAuth",
    };

    Object.entries(map).forEach(([key, sel]) => {
      const v = $(sel);
      if (!v) return;
      v.classList.toggle("is-active", key === name);
    });

    // tab active
    $$(".tab").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.tab === name);
    });
  }

  function wireTabs() {
    $$(".tab").forEach(btn => {
      btn.addEventListener("click", () => {
        pulse(btn);
        showView(btn.dataset.tab);
        if (btn.dataset.tab === "search") {
          // search ekranına girince odak
          const input = $("#searchInput");
          if (input) setTimeout(() => input.focus(), 0);
          renderSearch();
        }
        if (btn.dataset.tab === "library") {
          renderLibrary();
        }
      });
    });

    // Keşfet içinden "Ara" butonu
    const openSearch = $("#btnOpenSearch");
    if (openSearch) {
      openSearch.addEventListener("click", () => {
        showView("search");
        renderSearch();
        const input = $("#searchInput");
        if (input) setTimeout(() => input.focus(), 0);
      });
    }
  }

  // ---------- Catalog Loading ----------
  async function loadCatalog() {
    // Zaten yüklüyse tekrar çekme
    if (state.tracks.length) return;

    try {
      setNotice("Şarkılar yükleniyor…", "info");

      // GitHub Pages + local için güvenli relative path
      const res = await fetch("./catalog.json", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`catalog.json okunamadı (HTTP ${res.status}).`);
      }
      const data = await res.json();

      const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
      if (!tracks.length) {
        throw new Error("catalog.json içinde tracks listesi boş.");
      }

      // normalize
      state.tracks = tracks
        .filter(t => t && (t.title || t.artist) && t.src)
        .map((t, i) => ({
          id: String(t.id ?? i),
          title: String(t.title ?? "Bilinmeyen Şarkı"),
          artist: String(t.artist ?? "Bilinmeyen Sanatçı"),
          mood: String(t.mood ?? ""),
          src: String(t.src),
        }));

      state.filtered = [...state.tracks];
      setNotice("", "info");
    } catch (err) {
      console.error(err);
      state.tracks = [];
      state.filtered = [];
      setNotice(
        `Şarkılar yüklenemedi: ${err.message}\n` +
        `Kontrol: repo kökünde catalog.json var mı ve içinde "tracks" var mı?`,
        "danger"
      );
    }
  }

  // ---------- Search ----------
  function filterTracks(q) {
    const query = (q || "").trim().toLowerCase();
    if (!query) return [...state.tracks];

    return state.tracks.filter(t => {
      return (
        t.title.toLowerCase().includes(query) ||
        t.artist.toLowerCase().includes(query) ||
        (t.mood || "").toLowerCase().includes(query)
      );
    });
  }

  function renderSearch() {
    const list = $("#searchResults");
    const count = $("#searchCount");
    if (!list || !count) return;

    list.innerHTML = "";
    count.textContent = "0";

    // Eğer henüz katalog yoksa yükle
    loadCatalog().then(() => {
      const input = $("#searchInput");
      const q = input ? input.value : "";
      state.filtered = filterTracks(q);

      count.textContent = String(state.filtered.length);

      if (!state.tracks.length) {
        // zaten notice set ediliyor
        return;
      }

      if (!state.filtered.length) {
        list.innerHTML = `<div class="empty">Sonuç yok. Farklı bir şey dene.</div>`;
        return;
      }

      const frag = document.createDocumentFragment();
      state.filtered.forEach((t) => {
        const row = document.createElement("button");
        row.className = "row";
        row.type = "button";
        row.innerHTML = `
          <div class="rowMain">
            <div class="rowTitle">${escapeHtml(t.title)}</div>
            <div class="rowSub">${escapeHtml(t.artist)}${t.mood ? " • " + escapeHtml(t.mood) : ""}</div>
          </div>
          <div class="rowAction">Çal</div>
        `;

        row.addEventListener("click", () => {
          // filtered index -> global index
          const idx = state.tracks.findIndex(x => x.id === t.id);
          playIndex(idx);
        });

        frag.appendChild(row);
      });

      list.appendChild(frag);
    });
  }

  function wireSearch() {
    const input = $("#searchInput");
    const clear = $("#btnClearSearch");
    if (input) {
      input.addEventListener("input", () => {
        renderSearch();
      });
    }
    if (clear && input) {
      clear.addEventListener("click", () => {
        input.value = "";
        input.focus();
        renderSearch();
      });
    }
  }

  // ---------- Player ----------
  function setNowPlaying(title, artist) {
    const nowT = $("#nowTitle");
    const nowA = $("#nowArtist");
    if (nowT) nowT.textContent = title || "Henüz çalan yok";
    if (nowA) nowA.textContent = artist || "Bir şarkı seç";
  }

  function playIndex(i) {
    const player = $("#awPlayer");
    if (!player) return;

    if (i < 0 || i >= state.tracks.length) return;

    state.currentIndex = i;
    const t = state.tracks[i];

    // Library’ye ekle (basit history)
    state.library = [t, ...state.library.filter(x => x.id !== t.id)].slice(0, 50);

    player.src = t.src;
    player.play().catch(err => {
      console.error(err);
      setNotice(`Bu şarkı çalınamadı: ${t.src}`, "danger");
    });

    setNowPlaying(t.title, t.artist);
    showView(state.view); // sadece güvenlik
  }

  function wirePlayer() {
    const player = $("#awPlayer");
    const btnPlay = $("#btnPlay");
    const btnPrev = $("#btnPrev");
    const btnNext = $("#btnNext");
    const seek = $("#seek");
    const vol = $("#vol");
    const cur = $("#curTime");
    const dur = $("#durTime");

    if (!player) return;

    if (vol) {
      player.volume = Number(vol.value || 0.8);
      vol.addEventListener("input", () => {
        player.volume = Number(vol.value || 0.8);
      });
    }

    if (btnPlay) {
      btnPlay.addEventListener("click", async () => {
        pulse(btnPlay);

        // hiç şarkı seçilmediyse: ilkini çal
        if (state.currentIndex === -1) {
          await loadCatalog();
          if (state.tracks.length) {
            playIndex(0);
            return;
          }
        }

        if (player.paused) player.play().catch(() => {});
        else player.pause();
      });
    }

    if (btnPrev) {
      btnPrev.addEventListener("click", () => {
        pulse(btnPrev);
        if (!state.tracks.length) return;
        const next = Math.max(0, state.currentIndex - 1);
        playIndex(next);
      });
    }

    if (btnNext) {
      btnNext.addEventListener("click", () => {
        pulse(btnNext);
        if (!state.tracks.length) return;
        const next = Math.min(state.tracks.length - 1, state.currentIndex + 1);
        playIndex(next);
      });
    }

    player.addEventListener("loadedmetadata", () => {
      if (dur) dur.textContent = fmtTime(player.duration);
    });

    player.addEventListener("timeupdate", () => {
      if (cur) cur.textContent = fmtTime(player.currentTime);
      if (seek && isFinite(player.duration) && player.duration > 0) {
        seek.value = String((player.currentTime / player.duration) * 100);
      }
    });

    if (seek) {
      seek.addEventListener("input", () => {
        if (!isFinite(player.duration) || player.duration <= 0) return;
        const pct = Number(seek.value || 0);
        player.currentTime = (pct / 100) * player.duration;
      });
    }
  }

  // ---------- Library ----------
  function renderLibrary() {
    const box = $("#libraryList");
    if (!box) return;

    if (!state.library.length) {
      box.innerHTML = `<div class="empty">Kütüphane boş. Bir şarkı çal, burada görünecek.</div>`;
      return;
    }

    box.innerHTML = "";
    state.library.forEach((t) => {
      const row = document.createElement("button");
      row.className = "row";
      row.type = "button";
      row.innerHTML = `
        <div class="rowMain">
          <div class="rowTitle">${escapeHtml(t.title)}</div>
          <div class="rowSub">${escapeHtml(t.artist)}</div>
        </div>
        <div class="rowAction">Çal</div>
      `;
      row.addEventListener("click", () => {
        const idx = state.tracks.findIndex(x => x.id === t.id);
        playIndex(idx);
      });
      box.appendChild(row);
    });
  }

  // ---------- Auth / Logout (demo) ----------
  function wireLogout() {
    const btn = $("#btnLogout");
    if (!btn) return;
    btn.addEventListener("click", () => {
      pulse(btn);
      // demo: sadece home'a dön
      showView("home");
    });
  }

  // ---------- Home chips ----------
  function renderHomeChips() {
    const wrap = $("#homeChips");
    if (!wrap) return;

    // basit sabit öneriler (catalog yoksa bile görünür)
    const items = [
      { title: "Gece Ruhu", artist: "Nova Kaen" },
      { title: "Enerji Kat", artist: "Artemis Pulse" },
      { title: "Haftalık Hafif", artist: "Lumen Soft" },
      { title: "Lo-Fi Akışı", artist: "Quiet District" },
    ];

    wrap.innerHTML = "";
    items.forEach((it) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chipBtn";
      b.innerHTML = `<div class="chipTitle">${escapeHtml(it.title)}</div><div class="chipSub">${escapeHtml(it.artist)}</div>`;
      b.addEventListener("click", () => {
        // search'e götür
        showView("search");
        const input = $("#searchInput");
        if (input) input.value = it.artist;
        renderSearch();
      });
      wrap.appendChild(b);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------- Boot ----------
  document.addEventListener("DOMContentLoaded", () => {
    // başlangıç view
    showView("home");

    wireTabs();
    wireSearch();
    wirePlayer();
    wireLogout();
    renderHomeChips();

    // Ara ekranı açılırsa anında katalog dene
    // (ama home'da bekliyoruz, gereksiz fetch yok)
  });
})();


