(function () {
  function el(id) { return document.getElementById(id); }

  var E = {
    dayChip: el("dayChip"),
    challengeNumber: el("challengeNumber"),
    songDate: el("songDate"),
    releaseInfo: el("releaseInfo"),
    viewsInfo: el("viewsInfo"),
    difficultyInfo: el("difficultyInfo"),
    roundLabel: el("roundLabel"),
    themeToggle: el("themeToggle"),
    themeMenu: el("themeMenu"),
    themeColor: el("themeColor"),
    themeOptions: Array.prototype.slice.call(document.querySelectorAll("[data-theme-choice]")),
    playBtn: el("playBtn"),
    rewindBtn: el("rewindBtn"),
    forwardBtn: el("forwardBtn"),
    skipBtn: el("skipBtn"),
    openGuessBtn: el("openGuessBtn"),
    seekBar: el("seekBar"),
    elapsedTime: el("elapsedTime"),
    remainingTime: el("remainingTime"),
    guessForm: el("guessForm"),
    guessInput: el("guessInput"),
    guessBtn: el("guessBtn"),
    closeGuessBtn: el("closeGuessBtn"),
    attempts: el("attempts"),
    message: el("message"),
    reveal: el("reveal"),
    resultStatus: el("resultStatus"),
    revealCover: el("revealCover"),
    revealTitle: el("revealTitle"),
    revealArtist: el("revealArtist"),
    youtubeLink: el("youtubeLink"),
    spotifyLink: el("spotifyLink"),
    appleMusicLink: el("appleMusicLink"),
    deezerLink: el("deezerLink"),
    communityCard: el("communityCard"),
    communitySummary: el("communitySummary"),
    communityBars: el("communityBars"),
    nextChallengeTimer: el("nextChallengeTimer"),
    shareBtn: el("shareBtn"),
    restartBtn: el("restartBtn"),
    visualizer: el("visualizer"),
    roundsContainer: el("rounds"),
    rounds: Array.prototype.slice.call(document.querySelectorAll(".round"))
  };

  var song = null;
  var roundIndex = 0;
  var audio = null;
  var guesses = [];
  var finished = false;
  var won = false;
  var solvedRound = null;
  var catalogIndex = -1;
  var countdownInterval = null;
  var countdownDate = "";
  var analyticsConfig = null;
  var analyticsHeartbeat = null;
  var analyticsStartedAt = Date.now();
  var analyticsSessionId = "";
  var analyticsVisitorId = "";
  var adminPreviewDate = "";
  var adminPreviewMode = false;
  try {
    var previewParams = new URLSearchParams(window.location.search);
    adminPreviewDate = String(previewParams.get("previewDate") || "").trim();
    adminPreviewMode = previewParams.get("adminPreview") === "1" && /^\d{4}-\d{2}-\d{2}$/.test(adminPreviewDate);
  } catch (_) {}


  function randomId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return prefix + window.crypto.randomUUID();
    }
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function readCookie(name) {
    var parts = document.cookie ? document.cookie.split("; ") : [];
    for (var i = 0; i < parts.length; i += 1) {
      var pair = parts[i].split("=");
      var key = pair.shift();
      if (key === name) return decodeURIComponent(pair.join("="));
    }
    return "";
  }

  function writeVisitorCookie(value) {
    var cookie =
      "mdd_visitor_id=" + encodeURIComponent(value) +
      "; Max-Age=31536000; Path=/; SameSite=Lax; Secure";

    if (location.hostname === "musicadodia.com" || location.hostname.endsWith(".musicadodia.com")) {
      cookie += "; Domain=.musicadodia.com";
    }

    document.cookie = cookie;
  }

  function getAnalyticsIds() {
    analyticsSessionId = sessionStorage.getItem("musicadodia:session-id") || "";
    if (!analyticsSessionId) {
      analyticsSessionId = randomId("s_");
      sessionStorage.setItem("musicadodia:session-id", analyticsSessionId);
    }

    var cookieVisitor = readCookie("mdd_visitor_id");
    var localVisitor = localStorage.getItem("musicadodia:visitor-id") || "";

    analyticsVisitorId = cookieVisitor || localVisitor || randomId("v_");

    localStorage.setItem("musicadodia:visitor-id", analyticsVisitorId);
    writeVisitorCookie(analyticsVisitorId);
  }

  async function loadAnalyticsConfig() {
    if (adminPreviewMode) {
      analyticsConfig = null;
      return;
    }
    getAnalyticsIds();

    try {
      var response = await fetch("/analytics-config.json?v=" + Date.now(), { cache: "no-store" });
      if (!response.ok) return;
      analyticsConfig = await response.json();
    } catch (_) {
      analyticsConfig = null;
    }

    if (!analyticsConfig || !analyticsConfig.endpoint) return;

    trackEvent("page_view", {
      path: location.pathname,
      referrer: document.referrer ? String(document.referrer).slice(0, 300) : ""
    });

    trackEvent("heartbeat", {
      visible: document.visibilityState === "visible"
    });

    if (analyticsHeartbeat) clearInterval(analyticsHeartbeat);
    analyticsHeartbeat = setInterval(function () {
      trackEvent("heartbeat", {
        visible: document.visibilityState === "visible"
      });
    }, 30000);
  }

  function analyticsPayload(type, data) {
    return Object.assign({
      event: type,
      timestamp: new Date().toISOString(),
      date: brazilDate(),
      sessionId: analyticsSessionId,
      visitorId: analyticsVisitorId,
      challengeDate: song ? song.date : "",
      challenge: catalogIndex >= 0 ? catalogIndex + 1 : null,
      round: roundIndex + 1,
      path: location.pathname
    }, data || {});
  }

  function trackEvent(type, data, keepalive) {
    if (adminPreviewMode) return;
    if (!analyticsConfig || !analyticsConfig.endpoint) return;

    try {
      fetch(analyticsConfig.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analyticsPayload(type, data)),
        keepalive: Boolean(keepalive)
      }).catch(function () {});
    } catch (_) {}
  }

  function trackFinishOnce() {
    if (!song || !finished) return;

    var finishKey = "musicadodia:analytics-finish:" + song.date + ":v" + songVersion();
    if (localStorage.getItem(finishKey)) return;

    localStorage.setItem(finishKey, "1");
    trackEvent("game_finish", {
      won: won,
      solvedRound: won && solvedRound ? solvedRound : null,
      attempts: guesses.length
    });
  }

  function trackSessionEnd() {
    var seconds = Math.max(0, Math.round((Date.now() - analyticsStartedAt) / 1000));
    trackEvent("session_end", {
      durationSeconds: seconds,
      finished: finished,
      won: won
    }, true);
  }

  function brazilDate() {
    var parts = new Intl.DateTimeFormat("en", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());

    function get(type) {
      var found = parts.find(function (p) { return p.type === type; });
      return found ? found.value : "";
    }

    return get("year") + "-" + get("month") + "-" + get("day");
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function isCorrect(guess, answer) {
    var a = normalize(guess);
    var b = normalize(answer);
    if (!a || !b) return false;
    return a === b || (b.length >= 7 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0));
  }

  function formatDate(value) {
    var p = value.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(new Date(Date.UTC(p[0], p[1] - 1, p[2])));
  }

  function detectReleaseYear() {
    if (!song) return "—";
    if (song.releaseYear) return String(song.releaseYear);
    if (song.releaseDate) return String(song.releaseDate);

    var source = [song.title, song.sourceName].filter(Boolean).join(" ");
    var match = source.match(/\b(19\d{2}|20\d{2})\b/);
    return match ? match[1] : "—";
  }

  function formatYoutubeViews(value) {
    if (value === undefined || value === null || value === "") return "—";

    var numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value);

    if (numeric >= 1000000000) {
      return (numeric / 1000000000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " bi";
    }
    if (numeric >= 1000000) {
      return (numeric / 1000000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
    }
    if (numeric >= 1000) {
      return (numeric / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
    }
    return numeric.toLocaleString("pt-BR");
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    var total = Math.floor(seconds);
    var min = Math.floor(total / 60);
    var sec = String(total % 60).padStart(2, "0");
    return min + ":" + sec;
  }

  var allowedThemes = ["creme", "azul", "verde", "rosa", "lilas", "noite"];

  function applyTheme(theme) {
    if (allowedThemes.indexOf(theme) < 0) theme = "noite";

    document.body.classList.remove("dark");
    document.body.setAttribute("data-theme", theme);

    E.themeOptions.forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-theme-choice") === theme);
    });

    if (E.themeColor) {
      var colors = {
        creme: "#f5efe4",
        azul: "#eef5fb",
        verde: "#eef4ec",
        rosa: "#fbf0f2",
        lilas: "#f3effa",
        noite: "#071632"
      };
      E.themeColor.setAttribute("content", colors[theme] || colors.noite);
    }
  }

  function oldStorageNamespace() {
    return String.fromCharCode(100, 97, 105, 108, 121, 115, 111, 110, 104);
  }

  function loadTheme() {
    var saved = localStorage.getItem("musicadodia:theme");
    if (!saved) {
      var oldThemeKey = oldStorageNamespace() + ":theme";
      saved = localStorage.getItem(oldThemeKey);
      if (saved) {
        localStorage.setItem("musicadodia:theme", saved);
        localStorage.removeItem(oldThemeKey);
      }
    }

    if (saved === "dark") saved = "noite";
    if (saved === "light") saved = "creme";
    if (allowedThemes.indexOf(saved) < 0) saved = "noite";

    applyTheme(saved);
  }

  function closeThemeMenu() {
    if (!E.themeMenu || !E.themeToggle) return;
    E.themeMenu.classList.add("hidden");
    E.themeToggle.setAttribute("aria-expanded", "false");
  }

  function toggleThemeMenu() {
    if (!E.themeMenu || !E.themeToggle) return;
    var opening = E.themeMenu.classList.contains("hidden");
    E.themeMenu.classList.toggle("hidden");
    E.themeToggle.setAttribute("aria-expanded", opening ? "true" : "false");
  }

  function chooseTheme(theme) {
    localStorage.setItem("musicadodia:theme", theme);
    applyTheme(theme);
    closeThemeMenu();
  }


  function cleanedSongTitle() {
    if (!song) return "";
    var title = String(song.title || "")
      .replace(/\(youtube\)/ig, "")
      .replace(/\b\(?(19\d{2}|20\d{2})\)?\b/g, "")
      .trim();

    var artist = String(song.artist || "").trim();
    if (artist) {
      [" - ", " – ", " — "].some(function (separator) {
        var suffix = separator + artist;
        if (title.toLowerCase().slice(-suffix.length) === suffix.toLowerCase()) {
          title = title.slice(0, -suffix.length).trim();
          return true;
        }
        return false;
      });
    }

    return title || String(song.title || "");
  }

  function platformSearchUrl(platform) {
    var query = [song && song.artist, cleanedSongTitle()].filter(Boolean).join(" ").trim();
    var encoded = encodeURIComponent(query);

    if (platform === "youtube") {
      return "https://www.youtube.com/results?search_query=" + encoded;
    }
    if (platform === "spotify") {
      return "https://open.spotify.com/search/" + encoded;
    }
    if (platform === "apple") {
      return "https://music.apple.com/br/search?term=" + encoded;
    }
    return "https://www.deezer.com/search/" + encoded;
  }

  function renderRevealCover() {
    if (!E.revealCover || !song) return;

    var src = String(song.coverUrl || "").trim();
    if (!src) {
      E.revealCover.removeAttribute("src");
      E.revealCover.classList.add("hidden");
      return;
    }

    E.revealCover.classList.remove("hidden");
    E.revealCover.alt = "Capa de " + cleanedSongTitle();
    E.revealCover.onerror = function () {
      E.revealCover.classList.add("hidden");
      E.revealCover.removeAttribute("src");
    };
    E.revealCover.src = src;
  }

  function renderPlatformLinks() {
    if (!song) return;

    if (E.youtubeLink) E.youtubeLink.href = song.youtubeUrl || platformSearchUrl("youtube");
    if (E.spotifyLink) E.spotifyLink.href = song.spotifyUrl || platformSearchUrl("spotify");
    if (E.appleMusicLink) E.appleMusicLink.href = song.appleMusicUrl || platformSearchUrl("apple");
    if (E.deezerLink) E.deezerLink.href = song.deezerUrl || platformSearchUrl("deezer");
  }

  function renderCommunityStats(statsOverride) {
    if (!E.communitySummary || !E.communityBars) return;

    var stats = statsOverride || (song && song.communityStats);
    var roundCount = playableRoundCount();
    var counts = [];

    if (stats && Array.isArray(stats.rounds)) {
      counts = stats.rounds.slice(0, roundCount).map(function (value) {
        var numeric = Number(value);
        return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
      });
      while (counts.length < roundCount) counts.push(0);
    } else if (stats) {
      for (var i = 1; i <= roundCount; i += 1) {
        var numeric = Number(stats[i] !== undefined ? stats[i] : stats["round" + i]);
        counts.push(Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0);
      }
    }

    var failed = stats ? Number(stats.failed || stats.losses || 0) : 0;
    failed = Number.isFinite(failed) && failed > 0 ? Math.floor(failed) : 0;

    var winners = counts.reduce(function (sum, value) { return sum + value; }, 0);
    var total = winners + failed;

    E.communityBars.innerHTML = "";

    if (!stats || total < 2) {
      E.communitySummary.textContent = "Ainda sem resultados suficientes";
      E.communityBars.classList.add("hidden");
      return;
    }

    var maxIndex = 0;
    counts.forEach(function (value, index) {
      if (value > counts[maxIndex]) maxIndex = index;
    });

    if (failed > counts[maxIndex]) {
      E.communitySummary.textContent = "A maioria não acertou hoje";
    } else {
      E.communitySummary.textContent = "A maioria acertou na faixa " + (maxIndex + 1);
    }

    var maxValue = Math.max.apply(Math, counts.concat([failed, 1]));
    counts.concat([failed]).forEach(function (value, index) {
      var item = document.createElement("span");
      item.className = "community-bar-item";

      var bar = document.createElement("i");
      bar.style.height = Math.max(12, Math.round((value / maxValue) * 100)) + "%";

      var label = document.createElement("small");
      label.textContent = index < roundCount ? String(index + 1) : "×";

      item.appendChild(bar);
      item.appendChild(label);
      E.communityBars.appendChild(item);
    });

    E.communityBars.classList.remove("hidden");
  }


  async function refreshCommunityStats() {
    renderCommunityStats();

    var statsUrl = song && song.statsEndpoint
      ? song.statsEndpoint
      : (analyticsConfig && analyticsConfig.endpoint ? analyticsConfig.endpoint : "");

    if (!song || !statsUrl) return;

    try {
      var separator = statsUrl.indexOf("?") >= 0 ? "&" : "?";
      var response = await fetch(
        statsUrl + separator + "date=" + encodeURIComponent(song.date),
        { cache: "no-store" }
      );

      if (!response.ok) return;
      var stats = await response.json();
      renderCommunityStats(stats);
    } catch (_) {}
  }

  async function submitCommunityResult() {
    if (adminPreviewMode) return;
    if (!song || !song.statsEndpoint || !finished) return;

    var submissionKey =
      "musicadodia:community:" + song.date + ":v" + songVersion();

    if (localStorage.getItem(submissionKey)) return;

    try {
      var response = await fetch(song.statsEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: song.date,
          result: won && solvedRound ? solvedRound : "failed"
        })
      });

      if (!response.ok) return;

      localStorage.setItem(submissionKey, "1");
      await refreshCommunityStats();
    } catch (_) {}
  }

  function brasiliaClockParts() {
    var parts = new Intl.DateTimeFormat("en", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date());

    var values = {};
    parts.forEach(function (part) {
      if (part.type !== "literal") values[part.type] = part.value;
    });
    return values;
  }

  function updateNextChallengeTimer() {
    if (!E.nextChallengeTimer) return;

    var parts = brasiliaClockParts();
    var currentDate = parts.year + "-" + parts.month + "-" + parts.day;

    if (countdownDate && currentDate !== countdownDate) {
      countdownDate = currentDate;
      location.reload();
      return;
    }

    countdownDate = currentDate;

    var secondsToday =
      Number(parts.hour) * 3600 +
      Number(parts.minute) * 60 +
      Number(parts.second);

    var remaining = Math.max(0, 86400 - secondsToday);
    if (remaining === 86400) remaining = 0;

    var hours = Math.floor(remaining / 3600);
    var minutes = Math.floor((remaining % 3600) / 60);
    var seconds = remaining % 60;

    E.nextChallengeTimer.textContent =
      String(hours).padStart(2, "0") + ":" +
      String(minutes).padStart(2, "0") + ":" +
      String(seconds).padStart(2, "0");
  }

  function startNextChallengeTimer() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownDate = "";
    updateNextChallengeTimer();
    countdownInterval = setInterval(updateNextChallengeTimer, 1000);
  }

  function songVersion() {
    var value = Number(song && song.version);
    return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
  }

  function key() {
    if (!song) return "";
    if (adminPreviewMode) return "musicadodia:admin-preview:" + song.date + ":v" + songVersion();
    return "musicadodia:game:" + song.date + ":v" + songVersion();
  }

  function oldVersionKey() {
    return song ? oldStorageNamespace() + ":" + song.date + ":v" + songVersion() : "";
  }

  function oldLegacyKey() {
    return song ? oldStorageNamespace() + ":" + song.date : "";
  }

  function save() {
    if (!song || adminPreviewMode) return;
    localStorage.setItem(key(), JSON.stringify({
      roundIndex: roundIndex,
      guesses: guesses,
      finished: finished,
      won: won,
      solvedRound: solvedRound
    }));
  }

  function load() {
    if (adminPreviewMode) return;
    try {
      var raw = localStorage.getItem(key());
      var migratedLegacy = false;
      var oldKeyUsed = "";

      if (!raw) {
        oldKeyUsed = oldVersionKey();
        raw = localStorage.getItem(oldKeyUsed);
        migratedLegacy = Boolean(raw);
      }

      if (!raw && songVersion() === 1) {
        oldKeyUsed = oldLegacyKey();
        raw = localStorage.getItem(oldKeyUsed);
        migratedLegacy = Boolean(raw);
      }

      if (!raw) return;

      var state = JSON.parse(raw);
      roundIndex = Math.max(0, Math.min(revealRoundIndex(), Number(state.roundIndex) || 0));
      guesses = Array.isArray(state.guesses) ? state.guesses.slice(0, playableRoundCount()) : [];
      finished = Boolean(state.finished);
      won = Boolean(state.won);
      solvedRound = Number.isFinite(Number(state.solvedRound)) ? Number(state.solvedRound) : null;

      if (migratedLegacy) {
        save();
        if (oldKeyUsed) localStorage.removeItem(oldKeyUsed);
      }
    } catch (_) {}
  }

  function totalAudioRounds() {
    if (!song || !Array.isArray(song.rounds) || !song.rounds.length) return 5;
    return song.rounds.length;
  }

  function playableRoundCount() {
    var total = totalAudioRounds();
    var configured = Number(song && song.challengeRounds);
    if (!Number.isFinite(configured)) return total;
    return Math.max(1, Math.min(total, Math.floor(configured)));
  }

  function revealRoundIndex() {
    var total = totalAudioRounds();
    var playable = playableRoundCount();
    return playable < total ? playable : total - 1;
  }

  function roundLabels() {
    var total = totalAudioRounds();
    var custom = song && Array.isArray(song.roundLabels) ? song.roundLabels.slice(0, total) : [];
    var defaults = total >= 6
      ? ["Bateria", "Baixo", "Instrumentos 1", "Instrumentos 2", "Melodia", "Revelação"]
      : ["Bateria", "Baixo", "Instrumentos", "Melodia", "Revelação"];
    while (custom.length < total) custom.push(defaults[custom.length] || ("Faixa " + (custom.length + 1)));
    return custom;
  }

  function ensureRoundNodes() {
    if (!E.roundsContainer) return;
    var total = totalAudioRounds();
    var labels = roundLabels();

    if (E.rounds.length !== total) {
      E.roundsContainer.innerHTML = "";
      for (var i = 0; i < total; i += 1) {
        var node = document.createElement("div");
        node.className = "round";
        var num = document.createElement("span");
        num.textContent = String(i + 1);
        var label = document.createElement("small");
        label.textContent = labels[i] || ("Faixa " + (i + 1));
        node.append(num, label);
        E.roundsContainer.appendChild(node);
      }
      E.rounds = Array.prototype.slice.call(E.roundsContainer.querySelectorAll(".round"));
    } else {
      E.rounds.forEach(function (node, i) {
        var label = node.querySelector("small");
        var num = node.querySelector("span");
        if (label) label.textContent = labels[i] || ("Faixa " + (i + 1));
        if (num) num.textContent = String(i + 1);
      });
    }
  }

  function safeRevealIndex() {
    if (!song || !Array.isArray(song.rounds) || !song.rounds.length) return 0;
    var fallback = Math.max(0, song.rounds.length - 1);
    var value = Number(song.safeRevealRound);
    if (!Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(song.rounds.length - 1, Math.floor(value)));
  }

  function getRoundSource(index) {
    if (!song || !Array.isArray(song.rounds)) return "";
    var last = song.rounds.length - 1;

    if (index === last) {
      return song.rounds[safeRevealIndex()] || "";
    }

    return song.rounds[index] || "";
  }

  function resetProgress() {
    E.seekBar.value = 0;
    E.elapsedTime.textContent = "0:00";
    E.remainingTime.textContent = "0:18 restantes";
  }

  function updateProgress() {
    if (!audio) {
      resetProgress();
      return;
    }

    var duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 18;
    var current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    var ratio = Math.max(0, Math.min(1, current / duration));

    E.seekBar.value = Math.round(ratio * 1000);
    E.elapsedTime.textContent = formatTime(current);
    E.remainingTime.textContent = formatTime(Math.max(0, duration - current)) + " restantes";
  }

  function seekBy(seconds) {
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;

    var next = (Number(audio.currentTime) || 0) + seconds;
    audio.currentTime = Math.max(0, Math.min(audio.duration, next));
    updateProgress();
  }

  function setPlaybackState(playing) {
    E.visualizer.classList.toggle("playing", playing);
    E.playBtn.setAttribute("aria-label", playing ? "Pausar" : "Tocar trecho");
  }

  function stopAudio() {
    setPlaybackState(false);

    if (!audio) {
      resetProgress();
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    updateProgress();
  }

  function prepareAudio() {
    var oldAudio = audio;
    audio = null;

    setPlaybackState(false);
    resetProgress();

    if (oldAudio) {
      try {
        oldAudio.pause();
        oldAudio.removeAttribute("src");
        oldAudio.load();
      } catch (_) {}
    }

    if (!song) return;

    var src = getRoundSource(roundIndex);
    if (!src) return;

    src += (src.indexOf("?") >= 0 ? "&" : "?") + "v=" + songVersion();

    var currentAudio = new Audio(src);
    currentAudio.preload = "auto";
    audio = currentAudio;

    function isCurrentAudio() {
      return audio === currentAudio;
    }

    currentAudio.addEventListener("loadedmetadata", function () {
      if (isCurrentAudio()) updateProgress();
    });

    currentAudio.addEventListener("timeupdate", function () {
      if (isCurrentAudio()) updateProgress();
    });

    currentAudio.addEventListener("play", function () {
      if (isCurrentAudio()) setPlaybackState(true);
    });

    currentAudio.addEventListener("pause", function () {
      if (isCurrentAudio() && !currentAudio.ended) setPlaybackState(false);
    });

    currentAudio.addEventListener("ended", function () {
      if (!isCurrentAudio()) return;
      setPlaybackState(false);
      E.playBtn.setAttribute("aria-label", "Tocar novamente");
      updateProgress();
    });

    currentAudio.addEventListener("error", function () {
      if (!isCurrentAudio()) return;
      setPlaybackState(false);
      E.message.textContent = "Não consegui carregar esta faixa.";
      trackEvent("audio_error", { source: src });
    });
  }

  function renderAttempts() {
    E.attempts.innerHTML = "";

    guesses.forEach(function (guess, i) {
      var div = document.createElement("div");
      div.className = "attempt";

      var strong = document.createElement("strong");
      strong.textContent = "✕ " + (i + 1);

      div.appendChild(strong);
      div.appendChild(document.createTextNode(guess));
      E.attempts.appendChild(div);
    });
  }

  function renderRounds() {
    ensureRoundNodes();
    var revealIndex = revealRoundIndex();
    var playable = playableRoundCount();

    E.rounds.forEach(function (node, i) {
      node.classList.toggle("active", i === roundIndex);
      node.classList.toggle("done", finished ? i <= revealIndex : i < roundIndex);
    });

    if (finished && roundIndex === revealIndex) {
      E.roundLabel.textContent = "Revelação";
    } else {
      E.roundLabel.textContent = "Faixa " + (roundIndex + 1) + " de " + playable;
    }

    E.skipBtn.textContent = finished ? "PRÓXIMA FAIXA" : "PULAR";
    E.skipBtn.disabled = !song || finished;
    E.openGuessBtn.disabled = !song || finished;
    E.rewindBtn.disabled = !song;
    E.forwardBtn.disabled = !song;
  }

  async function playCurrent() {
    if (!audio) prepareAudio();
    if (!audio) return;

    if (audio.ended || (Number.isFinite(audio.duration) && audio.currentTime >= audio.duration)) {
      audio.currentTime = 0;
    }

    try {
      await audio.play();
    } catch (_) {
      E.message.textContent = "Não consegui iniciar o áudio. Toque novamente.";
    }
  }

  async function reveal(success, autoplay) {
    finished = true;
    won = Boolean(success);
    if (!won) solvedRound = null;
    roundIndex = revealRoundIndex();

    E.reveal.classList.remove("hidden");
    E.guessForm.classList.add("hidden");
    E.resultStatus.textContent = success ? "Acertou!" : "Errou!";
    E.resultStatus.className = success ? "result-status success" : "result-status fail";
    E.revealTitle.textContent = cleanedSongTitle();
    E.revealArtist.textContent = song.artist;

    renderRevealCover();
    renderPlatformLinks();
    refreshCommunityStats();
    startNextChallengeTimer();

    E.guessInput.disabled = true;
    E.guessBtn.disabled = true;
    E.message.textContent = "";
    E.message.className = "message";

    renderRounds();
    prepareAudio();
    save();
    submitCommunityResult();
    trackFinishOnce();

    if (autoplay) await playCurrent();
  }

  async function switchRound(targetIndex, message) {
    if (!song) return;

    var wasPlaying = Boolean(audio && !audio.paused && !audio.ended);
    roundIndex = Math.max(0, Math.min(revealRoundIndex(), targetIndex));

    if (message) E.message.textContent = message;

    renderRounds();
    prepareAudio();
    save();

    if (wasPlaying) {
      await playCurrent();
    } else {
      setPlaybackState(false);
    }
  }

  function advance(message) {
    if (roundIndex >= playableRoundCount() - 1) {
      reveal(false, true);
      return;
    }

    switchRound(roundIndex + 1, message || "Nova camada liberada.");
  }

  function nextOrSkip() {
    if (!song || finished) return;
    advance("Rodada pulada.");
  }

  async function toggleAudio() {
    if (!audio) prepareAudio();
    if (!audio) return;

    if (audio.paused) {
      await playCurrent();
    } else {
      audio.pause();
    }
  }

  function closeGuessForm() {
    E.guessForm.classList.add("hidden");
    if (E.guessInput) E.guessInput.blur();
  }

  function toggleGuessForm() {
    if (!song || finished) return;

    var opening = E.guessForm.classList.contains("hidden");
    if (opening) {
      E.guessForm.classList.remove("hidden");
      setTimeout(function () {
        E.guessInput.focus();
      }, 0);
    } else {
      closeGuessForm();
    }
  }

  function restartGame() {
    if (!song) return;

    stopAudio();
    if (!adminPreviewMode) {
      localStorage.removeItem(key());
      localStorage.removeItem(oldVersionKey());

      if (songVersion() === 1) {
        localStorage.removeItem(oldLegacyKey());
      }
    }

    roundIndex = 0;
    guesses = [];
    finished = false;
    won = false;
    solvedRound = null;

    E.reveal.classList.add("hidden");
    E.resultStatus.textContent = "";
    E.resultStatus.className = "result-status";
    E.guessForm.classList.add("hidden");
    E.guessInput.disabled = false;
    E.guessInput.value = "";
    E.guessBtn.disabled = false;
    E.message.textContent = "Jogo reiniciado.";
    E.message.className = "message";

    renderAttempts();
    renderRounds();
    prepareAudio();
    save();
  }

  function resultText() {
    var marks = Array.from({ length: playableRoundCount() }, function (_, i) {
      if (won && solvedRound && i === solvedRound - 1) return "🟩";
      if ((won && solvedRound && i < solvedRound - 1) || (!won && finished)) return "⬛";
      return "⬜";
    }).join("");

    return "Música do Dia #" + (catalogIndex + 1) + " " + marks;
  }

  async function share() {
    var text = resultText();

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Música do Dia",
          text: text,
          url: location.href
        });
        return;
      } catch (_) {}
    }

    try {
      await navigator.clipboard.writeText(text + "\n" + location.href);
      E.message.textContent = "Resultado copiado.";
    } catch (_) {
      E.message.textContent = text;
    }
  }

  async function init() {
    loadTheme();
    await loadAnalyticsConfig();

    try {
      var response = await fetch("catalog.json?v=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error("catalog");

      var data = await response.json();
      var songs = Array.isArray(data.songs) ? data.songs : [];

      if (adminPreviewMode) {
        song = songs.find(function (item) { return String(item.date || "") === adminPreviewDate; }) || null;
        if (!song) {
          E.songDate.textContent = "Música não encontrada";
          E.roundLabel.textContent = "Prévia";
          E.message.textContent = "Essa data ainda não está disponível no site publicado.";
          return;
        }
      } else {
        var today = brazilDate();
        var eligible = songs.filter(function (item) { return item.date <= today; });

        if (!eligible.length) {
          E.songDate.textContent = "Nenhuma música publicada ainda";
          E.roundLabel.textContent = "Aguardando";
          E.message.textContent = "Adicione a primeira música pelo GitHub Actions.";
          return;
        }

        song = eligible[eligible.length - 1];
      }

      catalogIndex = songs.findIndex(function (item) { return item.date === song.date; });

      trackEvent("game_loaded", {
        title: cleanedSongTitle(),
        artist: song.artist || ""
      });

      E.dayChip.textContent = "#" + (catalogIndex + 1);
      if (E.challengeNumber) E.challengeNumber.textContent = "#" + (catalogIndex + 1);
      E.songDate.textContent = formatDate(song.date);
      if (E.releaseInfo) E.releaseInfo.textContent = detectReleaseYear();
      if (E.viewsInfo) E.viewsInfo.textContent = formatYoutubeViews(song.youtubeViews);
      if (E.difficultyInfo) E.difficultyInfo.textContent = song.difficulty || "—";

      ensureRoundNodes();
      load();
      renderAttempts();

      E.playBtn.disabled = false;
      E.seekBar.disabled = false;
      E.rewindBtn.disabled = false;
      E.forwardBtn.disabled = false;
      E.openGuessBtn.disabled = false;

      if (finished) {
        await reveal(won, false);
      } else {
        E.guessInput.disabled = false;
        E.guessBtn.disabled = false;
        E.guessForm.classList.add("hidden");
        renderRounds();
        prepareAudio();
      }
    } catch (_) {
      E.songDate.textContent = "Erro ao carregar";
      E.message.textContent = "Não consegui carregar o catálogo do jogo.";
    }
  }

  E.playBtn.addEventListener("click", toggleAudio);
  E.rewindBtn.addEventListener("click", function () { seekBy(-5); });
  E.forwardBtn.addEventListener("click", function () { seekBy(5); });
  E.skipBtn.addEventListener("click", nextOrSkip);
  E.openGuessBtn.addEventListener("click", toggleGuessForm);
  E.closeGuessBtn.addEventListener("click", closeGuessForm);
  E.themeToggle.addEventListener("click", function (event) {
    event.stopPropagation();
    toggleThemeMenu();
  });

  E.themeOptions.forEach(function (button) {
    button.addEventListener("click", function () {
      chooseTheme(button.getAttribute("data-theme-choice"));
    });
  });

  document.addEventListener("click", function (event) {
    if (!E.themeMenu || E.themeMenu.classList.contains("hidden")) return;
    if (event.target.closest && event.target.closest(".theme-picker")) return;
    closeThemeMenu();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeThemeMenu();
      closeGuessForm();
    }
  });

  E.seekBar.addEventListener("input", function () {
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = (Number(E.seekBar.value) / 1000) * audio.duration;
    updateProgress();
  });

  E.guessForm.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!song || finished) return;

    var guess = E.guessInput.value.trim();
    if (!guess) {
      E.message.textContent = "Digite um título antes de tentar.";
      return;
    }

    E.guessInput.value = "";

    trackEvent("guess", {
      guess: guess.slice(0, 100),
      correct: isCorrect(guess, song.title)
    });

    if (isCorrect(guess, song.title)) {
      solvedRound = roundIndex + 1;
      reveal(true, true);
      return;
    }

    guesses.push(guess);
    renderAttempts();
    E.guessForm.classList.add("hidden");
    advance("Não foi dessa vez. Uma nova camada foi liberada.");
  });

  E.shareBtn.addEventListener("click", share);
  E.restartBtn.addEventListener("click", restartGame);

  window.addEventListener("pagehide", trackSessionEnd);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      trackEvent("heartbeat", { visible: true });
    }
  });

  init();
})();
