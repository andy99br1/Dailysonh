(function () {
  "use strict";

  var OWNER = "andy99br1";
  var REPO = "Dailysonh";
  var BRANCH = "main";
  var API = "https://api.github.com";
  var WORKFLOW = "process-upload.yml";
  var MAX_FILE_MB = 45;

  function $(id) { return document.getElementById(id); }

  var E = {
    connectionCard: $("connectionCard"),
    panel: $("panel"),
    connectForm: $("connectForm"),
    tokenInput: $("tokenInput"),
    rememberToken: $("rememberToken"),
    disconnectBtn: $("disconnectBtn"),
    githubUser: $("githubUser"),
    repoStatus: $("repoStatus"),
    songForm: $("songForm"),
    audioFile: $("audioFile"),
    uploadZone: $("uploadZone"),
    fileLabel: $("fileLabel"),
    songTitle: $("songTitle"),
    songArtist: $("songArtist"),
    songDateInput: $("songDateInput"),
    releaseYearInput: $("releaseYearInput"),
    difficultyInput: $("difficultyInput"),
    youtubeViewsInput: $("youtubeViewsInput"),
    clipStartInput: $("clipStartInput"),
    youtubeUrlInput: $("youtubeUrlInput"),
    spotifyUrlInput: $("spotifyUrlInput"),
    appleMusicUrlInput: $("appleMusicUrlInput"),
    deezerUrlInput: $("deezerUrlInput"),
    publishBtn: $("publishBtn"),
    jobBox: $("jobBox"),
    jobTitle: $("jobTitle"),
    jobPercent: $("jobPercent"),
    jobProgress: $("jobProgress"),
    jobMessage: $("jobMessage"),
    workflowLink: $("workflowLink"),
    refreshSongsBtn: $("refreshSongsBtn"),
    songsList: $("songsList"),
    songsEmpty: $("songsEmpty"),
    editDialog: $("editDialog"),
    editForm: $("editForm"),
    editHeading: $("editHeading"),
    editIndex: $("editIndex"),
    editTitle: $("editTitle"),
    editArtist: $("editArtist"),
    editReleaseYear: $("editReleaseYear"),
    editYoutubeViews: $("editYoutubeViews"),
    editDifficulty: $("editDifficulty"),
    editYoutubeUrl: $("editYoutubeUrl"),
    editSpotifyUrl: $("editSpotifyUrl"),
    editAppleMusicUrl: $("editAppleMusicUrl"),
    editDeezerUrl: $("editDeezerUrl"),
    saveEditBtn: $("saveEditBtn"),
    toast: $("toast")
  };

  var token = "";
  var catalog = { songs: [] };
  var catalogSha = "";
  var toastTimer = null;

  function headers(extra) {
    var base = {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28"
    };
    return Object.assign(base, extra || {});
  }

  async function api(path, options) {
    var response = await fetch(API + path, Object.assign({
      headers: headers()
    }, options || {}));

    if (!response.ok) {
      var text = "";
      try { text = await response.text(); } catch (_) {}
      var error = new Error("GitHub API: " + response.status + " " + response.statusText);
      error.status = response.status;
      error.details = text;
      throw error;
    }

    if (response.status === 204) return null;
    return response.json();
  }

  function showToast(message) {
    E.toast.textContent = message;
    E.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      E.toast.classList.add("hidden");
    }, 3200);
  }

  function setJob(percent, title, message) {
    E.jobBox.classList.remove("hidden");
    E.jobPercent.textContent = percent + "%";
    E.jobProgress.style.width = percent + "%";
    E.jobTitle.textContent = title;
    E.jobMessage.textContent = message || "";
  }

  function brazilDate() {
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    var v = {};
    parts.forEach(function (p) { if (p.type !== "literal") v[p.type] = p.value; });
    return v.year + "-" + v.month + "-" + v.day;
  }

  function prettyDate(date) {
    if (!date) return "—";
    var p = date.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date(Date.UTC(p[0], p[1] - 1, p[2])));
  }

  function sanitizeFilename(name) {
    var ext = "";
    var dot = name.lastIndexOf(".");
    if (dot >= 0) ext = name.slice(dot).toLowerCase();
    var stem = dot >= 0 ? name.slice(0, dot) : name;
    stem = stem.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 90);
    return (stem || "audio") + ext;
  }

  async function fileToBase64(file) {
    var bytes = new Uint8Array(await file.arrayBuffer());
    var binary = "";
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return btoa(binary);
  }

  function getStoredToken() {
    return sessionStorage.getItem("musicadodia:admin-token") ||
      localStorage.getItem("musicadodia:admin-token") || "";
  }

  function storeToken(value, remember) {
    sessionStorage.setItem("musicadodia:admin-token", value);
    if (remember) {
      localStorage.setItem("musicadodia:admin-token", value);
    } else {
      localStorage.removeItem("musicadodia:admin-token");
    }
  }

  function clearToken() {
    sessionStorage.removeItem("musicadodia:admin-token");
    localStorage.removeItem("musicadodia:admin-token");
    token = "";
  }

  async function validateConnection() {
    var user = await api("/user");
    var repo = await api("/repos/" + OWNER + "/" + REPO);
    E.githubUser.textContent = user.login || "GitHub";
    E.repoStatus.textContent = repo.private ? "Repositório privado" : "Dailysonh";
    return true;
  }

  async function connect(value, remember) {
    token = String(value || "").trim();
    if (!token) throw new Error("Informe o token.");

    await validateConnection();
    storeToken(token, remember);

    E.connectionCard.classList.add("hidden");
    E.panel.classList.remove("hidden");
    E.disconnectBtn.classList.remove("hidden");
    await loadCatalog();
  }

  async function getRepoFile(path) {
    return api("/repos/" + OWNER + "/" + REPO + "/contents/" + encodeURI(path) + "?ref=" + encodeURIComponent(BRANCH));
  }

  async function loadCatalog() {
    E.refreshSongsBtn.disabled = true;
    try {
      var data = await getRepoFile("catalog.json");
      catalogSha = data.sha;
      var decoded = decodeURIComponent(escape(atob(String(data.content || "").replace(/\n/g, ""))));
      catalog = JSON.parse(decoded);
      if (!Array.isArray(catalog.songs)) catalog.songs = [];
      renderSongs();
    } finally {
      E.refreshSongsBtn.disabled = false;
    }
  }

  function renderSongs() {
    E.songsList.innerHTML = "";
    var songs = (catalog.songs || []).slice().sort(function (a, b) {
      return String(b.date || "").localeCompare(String(a.date || ""));
    });

    E.songsEmpty.classList.toggle("hidden", songs.length > 0);

    songs.forEach(function (song) {
      var actualIndex = catalog.songs.indexOf(song);
      var row = document.createElement("div");
      row.className = "song-row";

      var date = document.createElement("div");
      date.className = "song-date";
      date.textContent = prettyDate(song.date);

      var tag = document.createElement("span");
      var future = String(song.date || "") > brazilDate();
      tag.className = "tag " + (future ? "future" : "live");
      tag.textContent = future ? "Agendada" : "Publicada";
      date.appendChild(tag);

      var version = document.createElement("small");
      version.textContent = "versão " + (song.version || 1);
      date.appendChild(version);

      var main = document.createElement("div");
      main.className = "song-main";

      var title = document.createElement("strong");
      title.textContent = song.title || "Sem título";
      var artist = document.createElement("span");
      artist.textContent = song.artist || "Artista não informado";

      main.appendChild(title);
      main.appendChild(artist);

      var actions = document.createElement("div");
      actions.className = "song-actions";

      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "mini-btn";
      edit.textContent = "Editar";
      edit.addEventListener("click", function () { openEdit(actualIndex); });

      var open = document.createElement("a");
      open.className = "mini-btn";
      open.textContent = "Abrir";
      open.href = "/";
      open.target = "_blank";
      open.rel = "noopener";

      actions.appendChild(edit);
      actions.appendChild(open);

      row.appendChild(date);
      row.appendChild(main);
      row.appendChild(actions);
      E.songsList.appendChild(row);
    });
  }

  function openEdit(index) {
    var song = catalog.songs[index];
    if (!song) return;

    E.editIndex.value = String(index);
    E.editHeading.textContent = song.title || "Música";
    E.editTitle.value = song.title || "";
    E.editArtist.value = song.artist || "";
    E.editReleaseYear.value = song.releaseYear || "";
    E.editYoutubeViews.value = song.youtubeViews || "";
    E.editDifficulty.value = song.difficulty || "";
    E.editYoutubeUrl.value = song.youtubeUrl || "";
    E.editSpotifyUrl.value = song.spotifyUrl || "";
    E.editAppleMusicUrl.value = song.appleMusicUrl || "";
    E.editDeezerUrl.value = song.deezerUrl || "";
    E.editDialog.showModal();
  }

  async function saveCatalog() {
    var json = JSON.stringify(catalog, null, 2) + "\n";
    var bytes = new TextEncoder().encode(json);
    var binary = "";
    for (var i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
    }

    var result = await api("/repos/" + OWNER + "/" + REPO + "/contents/catalog.json", {
      method: "PUT",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        message: "Update song metadata from admin panel",
        content: btoa(binary),
        sha: catalogSha,
        branch: BRANCH
      })
    });

    catalogSha = result.content.sha;
  }

  async function uploadAudio(file, repoPath) {
    var base64 = await fileToBase64(file);
    return api("/repos/" + OWNER + "/" + REPO + "/contents/" + encodeURI(repoPath), {
      method: "PUT",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        message: "Upload audio from Música do Dia admin",
        content: base64,
        branch: BRANCH
      })
    });
  }

  async function dispatchWorkflow(repoPath, values) {
    return api("/repos/" + OWNER + "/" + REPO + "/actions/workflows/" + WORKFLOW + "/dispatches", {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        ref: BRANCH,
        inputs: {
          audio_path: repoPath,
          title: values.title,
          artist: values.artist,
          date: values.date,
          release_year: values.releaseYear,
          youtube_views: values.youtubeViews,
          difficulty: values.difficulty,
          youtube_url: values.youtubeUrl,
          spotify_url: values.spotifyUrl,
          apple_music_url: values.appleMusicUrl,
          deezer_url: values.deezerUrl,
          clip_start: values.clipStart
        }
      })
    });
  }

  async function waitForWorkflow(afterTime) {
    var started = Date.now();
    var found = null;

    while (Date.now() - started < 90000) {
      var data = await api(
        "/repos/" + OWNER + "/" + REPO +
        "/actions/workflows/" + WORKFLOW +
        "/runs?event=workflow_dispatch&branch=" + BRANCH + "&per_page=10"
      );

      found = (data.workflow_runs || []).find(function (run) {
        return new Date(run.created_at).getTime() >= afterTime - 5000;
      });

      if (found) return found;
      await new Promise(function (resolve) { setTimeout(resolve, 3500); });
    }

    return null;
  }

  async function monitorWorkflow(run) {
    E.workflowLink.href = run.html_url;
    E.workflowLink.classList.remove("hidden");

    while (true) {
      var latest = await api("/repos/" + OWNER + "/" + REPO + "/actions/runs/" + run.id);
      if (latest.status === "queued") {
        setJob(68, "Na fila para processar", "O GitHub está preparando o ambiente.");
      } else if (latest.status === "in_progress") {
        setJob(82, "Processando áudio", "Separando bateria, baixo, instrumental e melodia. Isso pode levar alguns minutos.");
      } else if (latest.status === "completed") {
        if (latest.conclusion === "success") {
          setJob(100, "Música pronta", "Processamento concluído e publicação acionada.");
          await new Promise(function (resolve) { setTimeout(resolve, 2500); });
          await loadCatalog();
          E.songForm.reset();
          setDefaultDate();
          E.fileLabel.textContent = "Escolher arquivo de áudio";
          showToast("Música processada com sucesso.");
          return true;
        }

        setJob(100, "O processamento falhou", "Abra o link abaixo para ver o erro.");
        throw new Error("Workflow terminou com " + latest.conclusion);
      }

      await new Promise(function (resolve) { setTimeout(resolve, 6500); });
    }
  }

  function valuesFromForm() {
    return {
      title: E.songTitle.value.trim(),
      artist: E.songArtist.value.trim(),
      date: E.songDateInput.value,
      releaseYear: E.releaseYearInput.value.trim(),
      youtubeViews: E.youtubeViewsInput.value.trim(),
      difficulty: E.difficultyInput.value,
      youtubeUrl: E.youtubeUrlInput.value.trim(),
      spotifyUrl: E.spotifyUrlInput.value.trim(),
      appleMusicUrl: E.appleMusicUrlInput.value.trim(),
      deezerUrl: E.deezerUrlInput.value.trim(),
      clipStart: E.clipStartInput.value.trim()
    };
  }

  function setDefaultDate() {
    E.songDateInput.value = brazilDate();
  }

  E.connectForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var button = event.submitter;
    if (button) button.disabled = true;
    try {
      await connect(E.tokenInput.value, E.rememberToken.checked);
      E.tokenInput.value = "";
    } catch (error) {
      clearToken();
      showToast(error.status === 401 || error.status === 403
        ? "Token inválido ou sem permissão."
        : "Não consegui conectar ao GitHub.");
    } finally {
      if (button) button.disabled = false;
    }
  });

  E.disconnectBtn.addEventListener("click", function () {
    clearToken();
    location.reload();
  });

  E.audioFile.addEventListener("change", function () {
    var file = E.audioFile.files && E.audioFile.files[0];
    E.fileLabel.textContent = file ? file.name : "Escolher arquivo de áudio";
  });

  ["dragenter", "dragover"].forEach(function (name) {
    E.uploadZone.addEventListener(name, function (event) {
      event.preventDefault();
      E.uploadZone.classList.add("drag");
    });
  });

  ["dragleave", "drop"].forEach(function (name) {
    E.uploadZone.addEventListener(name, function () {
      E.uploadZone.classList.remove("drag");
    });
  });

  E.songForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    var file = E.audioFile.files && E.audioFile.files[0];
    if (!file) {
      showToast("Escolha o arquivo de áudio.");
      return;
    }

    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      showToast("O áudio passa de " + MAX_FILE_MB + " MB.");
      return;
    }

    var values = valuesFromForm();
    if (!values.date) {
      showToast("Escolha a data do desafio.");
      return;
    }

    E.publishBtn.disabled = true;
    E.workflowLink.classList.add("hidden");

    try {
      var stamp = Date.now();
      var repoPath = "incoming/" + stamp + "-" + sanitizeFilename(file.name);

      setJob(8, "Preparando upload", "Lendo o arquivo no navegador.");
      setJob(22, "Enviando áudio", "Salvando o áudio com segurança no repositório.");
      await uploadAudio(file, repoPath);

      setJob(55, "Upload concluído", "Iniciando o processamento automático.");
      var dispatchTime = Date.now();
      await dispatchWorkflow(repoPath, values);

      setJob(62, "Processamento solicitado", "Localizando a execução no GitHub Actions.");
      var run = await waitForWorkflow(dispatchTime);

      if (!run) {
        setJob(66, "Processamento iniciado", "A execução foi enviada, mas ainda não apareceu na lista. Atualize o catálogo daqui a alguns minutos.");
        showToast("Processamento enviado.");
        return;
      }

      await monitorWorkflow(run);
    } catch (error) {
      console.error(error);
      setJob(100, "Não foi possível concluir", error.status === 403
        ? "O token não tem permissão de escrita em Contents/Actions."
        : "Confira sua conexão ou abra o processamento no GitHub.");
      showToast("Ocorreu um erro no envio.");
    } finally {
      E.publishBtn.disabled = false;
    }
  });

  E.refreshSongsBtn.addEventListener("click", async function () {
    try {
      await loadCatalog();
      showToast("Catálogo atualizado.");
    } catch (_) {
      showToast("Não consegui atualizar o catálogo.");
    }
  });

  E.editForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var index = Number(E.editIndex.value);
    var song = catalog.songs[index];
    if (!song) return;

    E.saveEditBtn.disabled = true;

    song.title = E.editTitle.value.trim();
    song.artist = E.editArtist.value.trim();
    song.releaseYear = E.editReleaseYear.value.trim();
    song.youtubeViews = E.editYoutubeViews.value.trim();
    song.difficulty = E.editDifficulty.value;
    song.youtubeUrl = E.editYoutubeUrl.value.trim();
    song.spotifyUrl = E.editSpotifyUrl.value.trim();
    song.appleMusicUrl = E.editAppleMusicUrl.value.trim();
    song.deezerUrl = E.editDeezerUrl.value.trim();

    try {
      await saveCatalog();
      renderSongs();
      E.editDialog.close();
      showToast("Alterações salvas.");
    } catch (error) {
      console.error(error);
      showToast("Não consegui salvar. Atualize o catálogo e tente novamente.");
    } finally {
      E.saveEditBtn.disabled = false;
    }
  });

  async function boot() {
    setDefaultDate();
    var stored = getStoredToken();
    if (!stored) return;

    try {
      await connect(stored, Boolean(localStorage.getItem("musicadodia:admin-token")));
    } catch (_) {
      clearToken();
      E.connectionCard.classList.remove("hidden");
      E.panel.classList.add("hidden");
      E.disconnectBtn.classList.add("hidden");
      showToast("A autorização salva expirou.");
    }
  }

  boot();
})();
