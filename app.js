(function () {
  function el(id) { return document.getElementById(id); }
  var E = {
    dayChip: el("dayChip"), songDate: el("songDate"), roundLabel: el("roundLabel"),
    playBtn: el("playBtn"), guessForm: el("guessForm"), guessInput: el("guessInput"),
    guessBtn: el("guessBtn"), skipBtn: el("skipBtn"), attempts: el("attempts"),
    message: el("message"), reveal: el("reveal"), revealTitle: el("revealTitle"),
    revealArtist: el("revealArtist"), youtubeLink: el("youtubeLink"),
    shareBtn: el("shareBtn"), visualizer: el("visualizer"),
    rounds: Array.prototype.slice.call(document.querySelectorAll(".round"))
  };

  var song = null, roundIndex = 0, audio = null, guesses = [], finished = false, catalogIndex = -1;

  function brazilDate() {
    var parts = new Intl.DateTimeFormat("en", {
      timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
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
    var a = normalize(guess), b = normalize(answer);
    if (!a || !b) return false;
    return a === b || (b.length >= 7 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0));
  }

  function formatDate(value) {
    var p = value.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "long", year: "numeric", timeZone: "UTC"
    }).format(new Date(Date.UTC(p[0], p[1] - 1, p[2])));
  }

  function key() { return song ? "dailysonh:" + song.date : ""; }

  function save() {
    if (!song) return;
    localStorage.setItem(key(), JSON.stringify({ roundIndex: roundIndex, guesses: guesses, finished: finished }));
  }

  function load() {
    try {
      var raw = localStorage.getItem(key());
      if (!raw) return;
      var state = JSON.parse(raw);
      roundIndex = Math.max(0, Math.min(4, Number(state.roundIndex) || 0));
      guesses = Array.isArray(state.guesses) ? state.guesses.slice(0, 5) : [];
      finished = Boolean(state.finished);
    } catch (_) {}
  }

  function stopAudio() {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    E.visualizer.classList.remove("playing");
    E.playBtn.textContent = "▶ Ouvir trecho";
  }

  function prepareAudio() {
    stopAudio();
    if (!song) return;
    audio = new Audio(song.rounds[roundIndex]);
    audio.preload = "auto";
    audio.addEventListener("ended", function () {
      E.visualizer.classList.remove("playing");
      E.playBtn.textContent = "▶ Ouvir trecho";
    });
    audio.addEventListener("pause", function () {
      if (!audio.ended) {
        E.visualizer.classList.remove("playing");
        E.playBtn.textContent = "▶ Ouvir trecho";
      }
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
      node.classList.toggle("active", i === roundIndex && !finished);
      node.classList.toggle("done", i < roundIndex || finished);
    });
    E.roundLabel.textContent = "Rodada " + (roundIndex + 1) + " de 5";
  }

  function reveal(success) {
    finished = true;
    stopAudio();
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
    E.skipBtn.disabled = true;
    E.message.textContent = success ? "Acertou!" : "Fim das rodadas.";
    E.message.className = success ? "message success" : "message";
    renderRounds();
    save();
  }

  function advance(message) {
    if (roundIndex >= 4) { reveal(false); return; }
    roundIndex += 1;
    E.message.textContent = message || "Nova camada liberada.";
    renderRounds();
    prepareAudio();
    save();
  }

  async function toggleAudio() {
    if (!audio) prepareAudio();
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
        E.visualizer.classList.add("playing");
        E.playBtn.textContent = "Ⅱ Pausar";
      } catch (_) {
        E.message.textContent = "Não consegui iniciar o áudio. Toque novamente.";
      }
    } else {
      audio.pause();
    }
  }

  function resultText() {
    var marks = [0,1,2,3,4].map(function (i) {
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
        await navigator.share({ title: "Dailysonh", text: text, url: location.href });
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
      E.songDate.textContent = formatDate(song.date);

      load();
      renderAttempts();
      renderRounds();
      prepareAudio();

      E.playBtn.disabled = false;
      E.guessInput.disabled = false;
      E.guessBtn.disabled = false;
      E.skipBtn.disabled = false;

      if (finished) reveal(true);
    } catch (_) {
      E.songDate.textContent = "Erro ao carregar";
      E.message.textContent = "Não consegui carregar o catálogo do jogo.";
    }
  }

  E.playBtn.addEventListener("click", toggleAudio);
  E.skipBtn.addEventListener("click", function () { if (!finished) advance("Rodada pulada."); });
  E.guessForm.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!song || finished) return;
    var guess = E.guessInput.value.trim();
    if (!guess) { E.message.textContent = "Digite um título antes de tentar."; return; }
    E.guessInput.value = "";
    if (isCorrect(guess, song.title)) { reveal(true); return; }
    guesses.push(guess);
    renderAttempts();
    advance("Não foi dessa vez. Uma nova camada foi liberada.");
  });
  E.shareBtn.addEventListener("click", share);
  init();
})();
