(function () {
  function el(id) { return document.getElementById(id); }
  var E = {
    dayChip: el("dayChip"),
    challengeNumber: el("challengeNumber"),
    songDate: el("songDate"),
    roundLabel: el("roundLabel"),
    playBtn: el("playBtn"),
    prevBtn: el("prevBtn"),
    skipBtn: el("skipBtn"),
    seekBar: el("seekBar"),
    elapsedTime: el("elapsedTime"),
    remainingTime: el("remainingTime"),
    guessForm: el("guessForm"),
    guessInput: el("guessInput"),
    guessBtn: el("guessBtn"),
    attempts: el("attempts"),
    message: el("message"),
    reveal: el("reveal"),
    revealTitle: el("revealTitle"),
    revealArtist: el("revealArtist"),
    youtubeLink: el("youtubeLink"),
    shareBtn: el("shareBtn"),
    restartBtn: el("restartBtn"),
    visualizer: el("visualizer"),
    rounds: Array.prototype.slice.call(document.querySelectorAll(".round"))
  };

  var song = null;
  var roundIndex = 0;
  var audio = null;
  var guesses = [];
  var finished = false;
  var won = false;
  var catalogIndex = -1;

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

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    var total = Math.floor(seconds);
    var min = Math.floor(total / 60);
    var sec = String(total % 60).padStart(2, "0");
    return min + ":" + sec;
  }

  function songVersion() {
    var value = Number(song && song.version);
    return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
  }

  function key() {
    return song ? "dailysonh:" + song.date + ":v" + songVersion() : "";
  }

  function legacyKey() {
    return song ? "dailysonh:" + song.date : "";
  }

  function save() {
    if (!song) return;
    localStorage.setItem(key(), JSON.stringify({
      roundIndex: roundIndex,
      guesses: guesses,
      finished: finished,
      won: won
    }));
  }

  function load() {
    try {
      var raw = localStorage.getItem(key());
      var migratedLegacy = false;

      // Mantém o progresso já existente da versão 1. Quando a música é
      // reprocessada, a versão aumenta e este fallback deixa de ser usado.
      if (!raw && songVersion() === 1) {
        raw = localStorage.getItem(legacyKey());
        migratedLegacy = Boolean(raw);
      }

      if (!raw) return;

      var state = JSON.parse(raw);
      roundIndex = Math.max(0, Math.min(4, Number(state.roundIndex) || 0));
      guesses = Array.isArray(state.guesses) ? state.guesses.slice(0, 5) : [];
      finished = Boolean(state.finished);
      won = Boolean(state.won);

      if (migratedLegacy) {
        save();
      }
    } catch (_) {}
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

    // Para músicas antigas em que a faixa 5 ainda era o trecho original,
    // a revelação usa explicitamente uma faixa segura.
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

  function setPlaybackState(playing) {
    E.visualizer.classList.toggle("playing", playing);
    E.playBtn.textContent = playing ? "Ⅱ Pausar" : "▶ Ouvir trecho";
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

    // Sempre reseta visual e botão imediatamente ao trocar de faixa.
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

    // Evita o navegador reaproveitar uma faixa antiga depois de reprocessar a música.
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
      if (isCurrentAudio() && !currentAudio.ended) {
        setPlaybackState(false);
      }
    });

    currentAudio.addEventListener("ended", function () {
      if (!isCurrentAudio()) return;
      setPlaybackState(false);
      E.playBtn.textContent = "↻ Ouvir novamente";
      E.playBtn.setAttribute("aria-label", "Tocar novamente");
      updateProgress();
    });

    currentAudio.addEventListener("error", function () {
      if (!isCurrentAudio()) return;
      setPlaybackState(false);
      E.message.textContent = "Não consegui carregar esta faixa.";
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
    E.rounds.forEach(function (node, i) {
      node.classList.toggle("active", i === roundIndex);
      node.classList.toggle("done", finished ? i <= 4 : i < roundIndex);
    });

    if (finished && roundIndex === 4) {
      E.roundLabel.textContent = "Revelação";
    } else {
      E.roundLabel.textContent = "Faixa " + (roundIndex + 1) + " de 5";
    }

    E.prevBtn.disabled = !song || roundIndex <= 0;
    E.skipBtn.textContent = finished ? "Próxima faixa →" : "Pular rodada";
    E.skipBtn.disabled = !song || (finished && roundIndex >= 4);
  }

  async function playCurrent() {
    if (!audio) prepareAudio();
    if (!audio) return;

    if (audio.ended || audio.currentTime >= audio.duration) {
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
    roundIndex = 4;

    E.reveal.classList.remove("hidden");
    E.revealTitle.textContent = song.title;
    E.revealArtist.textContent = song.artist;

    if (song.youtubeUrl) {
      E.youtubeLink.href = song.youtubeUrl;
      E.youtubeLink.classList.remove("hidden");
    } else {
      E.youtubeLink.classList.add("hidden");
    }

    E.guessInput.disabled = true;
    E.guessBtn.disabled = true;
    E.message.textContent = success ? "Acertou!" : "Fim das rodadas.";
    E.message.className = success ? "message success" : "message";

    renderRounds();
    prepareAudio();
    save();

    if (autoplay) {
      await playCurrent();
    }
  }

  async function switchRound(targetIndex, message) {
    if (!song) return;

    var wasPlaying = Boolean(audio && !audio.paused && !audio.ended);
    roundIndex = Math.max(0, Math.min(4, targetIndex));

    if (message) {
      E.message.textContent = message;
    }

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
    if (roundIndex >= 4) {
      reveal(false, true);
      return;
    }

    switchRound(roundIndex + 1, message || "Nova camada liberada.");
  }

  function previousTrack() {
    if (!song || roundIndex <= 0) return;
    switchRound(roundIndex - 1, "Faixa anterior.");
  }

  function nextOrSkip() {
    if (!song) return;

    if (finished) {
      if (roundIndex < 4) {
        switchRound(roundIndex + 1, "Próxima faixa.");
      }
      return;
    }

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

  function restartGame() {
    if (!song) return;

    stopAudio();
    localStorage.removeItem(key());

    if (songVersion() === 1) {
      localStorage.removeItem(legacyKey());
    }

    roundIndex = 0;
    guesses = [];
    finished = false;
    won = false;

    E.reveal.classList.add("hidden");
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
    var marks = [0, 1, 2, 3, 4].map(function (i) {
      if (finished && i <= roundIndex) return "🟩";
      if (i < roundIndex) return "⬛";
      return "⬜";
    }).join("");

    return "Dailysonh #" + (catalogIndex + 1) + " " + marks;
  }

  async function share() {
    var text = resultText();

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Dailysonh",
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
    try {
      var response = await fetch("catalog.json?v=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error("catalog");

      var data = await response.json();
      var songs = Array.isArray(data.songs) ? data.songs : [];
      var today = brazilDate();
      var eligible = songs.filter(function (item) { return item.date <= today; });

      if (!eligible.length) {
        E.songDate.textContent = "Nenhuma música publicada ainda";
        E.roundLabel.textContent = "Aguardando";
        E.message.textContent = "Adicione a primeira música pelo GitHub Actions.";
        return;
      }

      song = eligible[eligible.length - 1];
      catalogIndex = songs.findIndex(function (item) { return item.date === song.date; });

      E.dayChip.textContent = "#" + (catalogIndex + 1);
      if (E.challengeNumber) E.challengeNumber.textContent = "#" + (catalogIndex + 1);
      E.songDate.textContent = formatDate(song.date);

      load();
      renderAttempts();

      E.playBtn.disabled = false;
      E.seekBar.disabled = false;

      if (finished) {
        await reveal(won, false);
      } else {
        E.guessInput.disabled = false;
        E.guessBtn.disabled = false;
        renderRounds();
        prepareAudio();
      }
    } catch (_) {
      E.songDate.textContent = "Erro ao carregar";
      E.message.textContent = "Não consegui carregar o catálogo do jogo.";
    }
  }

  E.playBtn.addEventListener("click", toggleAudio);
  E.prevBtn.addEventListener("click", previousTrack);
  E.skipBtn.addEventListener("click", nextOrSkip);

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

    if (isCorrect(guess, song.title)) {
      reveal(true, true);
      return;
    }

    guesses.push(guess);
    renderAttempts();
    advance("Não foi dessa vez. Uma nova camada foi liberada.");
  });

  E.shareBtn.addEventListener("click", share);
  E.restartBtn.addEventListener("click", restartGame);
  init();
})();
