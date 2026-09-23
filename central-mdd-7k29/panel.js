(function(){
"use strict";
var OWNER="andy99br1",REPO="Dailysonh",BRANCH="main",API="https://api.github.com",WORKFLOW="process-upload.yml",MAX_FILE_MB=45;
function $(id){return document.getElementById(id)}
var E={
 loginView:$("loginView"),panel:$("panel"),connectForm:$("connectForm"),tokenInput:$("tokenInput"),disconnectBtn:$("disconnectBtn"),
 githubUser:$("githubUser"),connectionLabel:$("connectionLabel"),menuBtn:$("menuBtn"),sectionTitle:$("sectionTitle"),sectionEyebrow:$("sectionEyebrow"),
 songForm:$("songForm"),audioFile:$("audioFile"),uploadZone:$("uploadZone"),fileLabel:$("fileLabel"),songTitle:$("songTitle"),songArtist:$("songArtist"),songDateInput:$("songDateInput"),
 releaseYearInput:$("releaseYearInput"),difficultyInput:$("difficultyInput"),youtubeViewsInput:$("youtubeViewsInput"),clipStartInput:$("clipStartInput"),
 youtubeUrlInput:$("youtubeUrlInput"),spotifyUrlInput:$("spotifyUrlInput"),appleMusicUrlInput:$("appleMusicUrlInput"),deezerUrlInput:$("deezerUrlInput"),publishBtn:$("publishBtn"),
 jobBox:$("jobBox"),jobTitle:$("jobTitle"),jobPercent:$("jobPercent"),jobProgress:$("jobProgress"),jobMessage:$("jobMessage"),workflowLink:$("workflowLink"),
 refreshSongsBtn:$("refreshSongsBtn"),songsList:$("songsList"),songsEmpty:$("songsEmpty"),editDialog:$("editDialog"),editForm:$("editForm"),editHeading:$("editHeading"),
 editIndex:$("editIndex"),editTitle:$("editTitle"),editArtist:$("editArtist"),editReleaseYear:$("editReleaseYear"),editYoutubeViews:$("editYoutubeViews"),editDifficulty:$("editDifficulty"),
 editYoutubeUrl:$("editYoutubeUrl"),editSpotifyUrl:$("editSpotifyUrl"),editAppleMusicUrl:$("editAppleMusicUrl"),editDeezerUrl:$("editDeezerUrl"),saveEditBtn:$("saveEditBtn"),toast:$("toast"),
 metricPlayers:$("metricPlayers"),metricPlayersSub:$("metricPlayersSub"),metricOnline:$("metricOnline"),metricUnique:$("metricUnique"),metricDuration:$("metricDuration"),trafficTotal:$("trafficTotal"),
 trafficChart:$("trafficChart"),todaySongTitle:$("todaySongTitle"),todayChallenge:$("todayChallenge"),todayWins:$("todayWins"),todayFails:$("todayFails"),todayRate:$("todayRate"),
 roundBars:$("roundBars"),commonGuesses:$("commonGuesses"),audioErrors:$("audioErrors"),abandonRate:$("abandonRate"),completionRate:$("completionRate"),pageViews:$("pageViews"),
 analyticsWarning:$("analyticsWarning"),analyticsStatusPanel:$("analyticsStatusPanel"),analyticsStatusTitle:$("analyticsStatusTitle"),analyticsStatusText:$("analyticsStatusText"),
 dashboardDate:$("dashboardDate"),selectedDateLabel:$("selectedDateLabel"),prevDateBtn:$("prevDateBtn"),nextDateBtn:$("nextDateBtn"),todayDateBtn:$("todayDateBtn"),trafficPeriodTitle:$("trafficPeriodTitle")
};
var token="",catalog={songs:[]},catalogSha="",analyticsConfig=null,toastTimer=null,selectedDate="";
function headers(extra){return Object.assign({"Accept":"application/vnd.github+json","Authorization":"Bearer "+token,"X-GitHub-Api-Version":"2022-11-28"},extra||{})}
async function api(path,options){
 var response=await fetch(API+path,Object.assign({headers:headers()},options||{}));
 if(!response.ok){var t="";try{t=await response.text()}catch(_){ }var e=new Error("GitHub API "+response.status);e.status=response.status;e.details=t;throw e}
 if(response.status===204)return null;return response.json()
}
function toast(message){E.toast.textContent=message;E.toast.classList.remove("hidden");clearTimeout(toastTimer);toastTimer=setTimeout(function(){E.toast.classList.add("hidden")},3000)}
function brazilDate(){var p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),v={};p.forEach(function(x){if(x.type!=="literal")v[x.type]=x.value});return v.year+"-"+v.month+"-"+v.day}
function addDays(date,days){var p=String(date||"").split("-").map(Number);if(p.length!==3||!p[0])return brazilDate();var d=new Date(Date.UTC(p[0],p[1]-1,p[2]));d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function longDate(date){if(!date)return"—";var p=date.split("-").map(Number);return new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",weekday:"short",day:"2-digit",month:"short",year:"numeric"}).format(new Date(Date.UTC(p[0],p[1]-1,p[2]))).replace(/\./g,"")}
function prettyDate(date){if(!date)return"—";var p=date.split("-").map(Number);return new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(Date.UTC(p[0],p[1]-1,p[2])))}
function formatInt(v){var n=Number(v);return Number.isFinite(n)?n.toLocaleString("pt-BR"):"—"}
function formatPercent(v){var n=Number(v);return Number.isFinite(n)?Math.round(n)+"%":"—"}
function formatDuration(v){var n=Number(v);if(!Number.isFinite(n))return"—";var m=Math.floor(n/60),s=Math.round(n%60);return m?m+"m "+String(s).padStart(2,"0")+"s":s+"s"}
function sanitizeFilename(name){var dot=name.lastIndexOf("."),ext=dot>=0?name.slice(dot).toLowerCase():"",stem=dot>=0?name.slice(0,dot):name;stem=stem.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^[-.]+|[-.]+$/g,"").slice(0,90);return(stem||"audio")+ext}
async function fileToBase64(file){var bytes=new Uint8Array(await file.arrayBuffer()),binary="",chunk=0x8000;for(var i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+chunk,bytes.length)));return btoa(binary)}
function storedToken(){return localStorage.getItem("musicadodia:admin-token")||sessionStorage.getItem("musicadodia:admin-token")||""}
function storeToken(value){localStorage.setItem("musicadodia:admin-token",value);sessionStorage.setItem("musicadodia:admin-token",value)}
function clearToken(){sessionStorage.removeItem("musicadodia:admin-token");localStorage.removeItem("musicadodia:admin-token");token=""}
async function validate(){var repoInfo=await api("/repos/"+OWNER+"/"+REPO);if(!repoInfo||String(repoInfo.full_name||"").toLowerCase()!==(OWNER+"/"+REPO).toLowerCase())throw new Error("Repositório não autorizado");E.githubUser.textContent=OWNER;E.connectionLabel.textContent="Conectado";return true}
async function connect(value){
 token=String(value||"").trim();
 if(!token)throw new Error("Token vazio");
 await validate();
 storeToken(token);
 document.body.classList.remove("auth-locked");
 E.loginView.classList.add("hidden");
 E.panel.classList.remove("hidden");

 var catalogOk=true,analyticsOk=true;
 try{await loadCatalog()}catch(err){catalogOk=false;console.error("catalog",err)}
 try{await loadAnalyticsConfig()}catch(err){analyticsOk=false;console.error("analytics-config",err)}
 try{await refreshDashboard()}catch(err){analyticsOk=false;console.error("dashboard",err)}

 if(!catalogOk||!analyticsOk){
   toast("GitHub conectado. Alguns dados demoraram para carregar; tente Atualizar se necessário.");
 }
 return true;
}
async function getRepoFile(path){return api("/repos/"+OWNER+"/"+REPO+"/contents/"+encodeURI(path)+"?ref="+encodeURIComponent(BRANCH))}
async function loadCatalog(){var data=await getRepoFile("catalog.json");catalogSha=data.sha;var decoded=decodeURIComponent(escape(atob(String(data.content||"").replace(/\n/g,""))));catalog=JSON.parse(decoded);if(!Array.isArray(catalog.songs))catalog.songs=[];renderSongs();renderSelectedChallenge()}
function renderSongs(){
 E.songsList.innerHTML="";var songs=catalog.songs.slice().sort(function(a,b){return String(b.date||"").localeCompare(String(a.date||""))});E.songsEmpty.classList.toggle("hidden",songs.length>0);
 songs.forEach(function(song){var idx=catalog.songs.indexOf(song),row=document.createElement("div");row.className="song-row";
 var d=document.createElement("div");d.className="song-date";d.textContent=prettyDate(song.date);var tag=document.createElement("span"),future=String(song.date||"")>brazilDate();tag.className="tag "+(future?"future":"live");tag.textContent=future?"Agendada":"Publicada";d.appendChild(tag);var sm=document.createElement("small");sm.textContent="versão "+(song.version||1);d.appendChild(sm);
 var main=document.createElement("div");main.className="song-main";var t=document.createElement("strong");t.textContent=song.title||"Sem título";var a=document.createElement("span");a.textContent=song.artist||"Artista não informado";main.append(t,a);
 var actions=document.createElement("div");actions.className="song-actions";var edit=document.createElement("button");edit.className="mini-btn";edit.type="button";edit.textContent="Editar";edit.onclick=function(){openEdit(idx)};var open=document.createElement("a");open.className="mini-btn";open.textContent="Abrir";open.href="/";open.target="_blank";open.rel="noopener";actions.append(edit,open);row.append(d,main,actions);E.songsList.appendChild(row)
 })
}
function songForDate(date){var eligible=catalog.songs.filter(function(s){return String(s.date||"")<=String(date||"")});return eligible.length?eligible[eligible.length-1]:null}
function renderSelectedChallenge(){
 var song=songForDate(selectedDate||brazilDate());
 if(!song){E.todaySongTitle.textContent="Nenhum desafio nesta data";E.todayChallenge.textContent="#—";return}
 var idx=catalog.songs.indexOf(song)+1;E.todaySongTitle.textContent=(song.artist?song.artist+" · ":"")+(song.title||"Sem título");E.todayChallenge.textContent="#"+idx;
 var stats=song.communityStats;if(stats)renderGameStats(stats)
}
function updateDateFilterUi(){
 var today=brazilDate();
 if(!selectedDate)selectedDate=today;
 E.dashboardDate.max=today;
 E.dashboardDate.value=selectedDate;
 E.selectedDateLabel.textContent=selectedDate===today?"Hoje · "+prettyDate(selectedDate):longDate(selectedDate);
 E.nextDateBtn.disabled=selectedDate>=today;
 E.metricPlayersSub.textContent=selectedDate===today?"Hoje":"Em "+prettyDate(selectedDate);
 E.metricUniqueSub.textContent=selectedDate===today?"Hoje":"Em "+prettyDate(selectedDate);
 E.metricOnlineSub.textContent=selectedDate===today?"Últimos 90 segundos":"Disponível apenas para hoje";
 E.trafficPeriodTitle.textContent="7 dias até "+prettyDate(selectedDate);
}
function renderGameStats(stats){
 var rounds=Array.isArray(stats.rounds)?stats.rounds.slice(0,5).map(Number):[1,2,3,4,5].map(function(i){return Number(stats[i]!==undefined?stats[i]:stats["round"+i])||0});
 while(rounds.length<5)rounds.push(0);var failed=Number(stats.failed||stats.losses||0)||0,wins=rounds.reduce(function(a,b){return a+(Number(b)||0)},0),total=wins+failed;
 E.todayWins.textContent=formatInt(wins);E.todayFails.textContent=formatInt(failed);E.todayRate.textContent=total?Math.round(wins/total*100)+"%":"—";if(total)E.metricPlayers.textContent=formatInt(total);
 E.roundBars.innerHTML="";var max=Math.max.apply(Math,rounds.concat([failed,1]));rounds.concat([failed]).forEach(function(v,i){var wrap=document.createElement("div");wrap.className="round-bar";var bar=document.createElement("i");bar.style.height=Math.max(4,Math.round((v/max)*90))+"%";var label=document.createElement("small");label.textContent=i<5?String(i+1):"×";wrap.append(bar,label);E.roundBars.appendChild(wrap)})
}
function openEdit(index){var s=catalog.songs[index];if(!s)return;E.editIndex.value=String(index);E.editHeading.textContent=s.title||"Música";E.editTitle.value=s.title||"";E.editArtist.value=s.artist||"";E.editReleaseYear.value=s.releaseYear||"";E.editYoutubeViews.value=s.youtubeViews||"";E.editDifficulty.value=s.difficulty||"";E.editYoutubeUrl.value=s.youtubeUrl||"";E.editSpotifyUrl.value=s.spotifyUrl||"";E.editAppleMusicUrl.value=s.appleMusicUrl||"";E.editDeezerUrl.value=s.deezerUrl||"";E.editDialog.showModal()}
async function saveCatalog(){var json=JSON.stringify(catalog,null,2)+"\n",bytes=new TextEncoder().encode(json),binary="";for(var i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+0x8000,bytes.length)));var r=await api("/repos/"+OWNER+"/"+REPO+"/contents/catalog.json",{method:"PUT",headers:headers({"Content-Type":"application/json"}),body:JSON.stringify({message:"Update song metadata from admin dashboard",content:btoa(binary),sha:catalogSha,branch:BRANCH})});catalogSha=r.content.sha}
function setJob(percent,title,message){E.jobBox.classList.remove("hidden");E.jobPercent.textContent=percent+"%";E.jobProgress.style.width=percent+"%";E.jobTitle.textContent=title;E.jobMessage.textContent=message||""}
async function uploadAudio(file,path){var b64=await fileToBase64(file);return api("/repos/"+OWNER+"/"+REPO+"/contents/"+encodeURI(path),{method:"PUT",headers:headers({"Content-Type":"application/json"}),body:JSON.stringify({message:"Upload audio from Música do Dia dashboard",content:b64,branch:BRANCH})})}
async function dispatch(path,v){return api("/repos/"+OWNER+"/"+REPO+"/actions/workflows/"+WORKFLOW+"/dispatches",{method:"POST",headers:headers({"Content-Type":"application/json"}),body:JSON.stringify({ref:BRANCH,inputs:{audio_path:path,title:v.title,artist:v.artist,date:v.date,release_year:v.releaseYear,youtube_views:v.youtubeViews,difficulty:v.difficulty,youtube_url:v.youtubeUrl,spotify_url:v.spotifyUrl,apple_music_url:v.appleMusicUrl,deezer_url:v.deezerUrl,clip_start:v.clipStart}})})}
async function waitRun(after){var started=Date.now();while(Date.now()-started<90000){var d=await api("/repos/"+OWNER+"/"+REPO+"/actions/workflows/"+WORKFLOW+"/runs?event=workflow_dispatch&branch="+BRANCH+"&per_page=10"),r=(d.workflow_runs||[]).find(function(x){return new Date(x.created_at).getTime()>=after-5000});if(r)return r;await new Promise(function(res){setTimeout(res,3500)})}return null}
async function monitor(run){E.workflowLink.href=run.html_url;E.workflowLink.classList.remove("hidden");while(true){var l=await api("/repos/"+OWNER+"/"+REPO+"/actions/runs/"+run.id);if(l.status==="queued")setJob(68,"Na fila","Preparando o ambiente.");else if(l.status==="in_progress")setJob(84,"Processando áudio","Separando as camadas. Isso pode levar alguns minutos.");else if(l.status==="completed"){if(l.conclusion==="success"){setJob(100,"Música pronta","Processamento concluído.");await new Promise(function(r){setTimeout(r,2000)});await loadCatalog();E.songForm.reset();setDefaultDate();E.fileLabel.textContent="Escolher arquivo de áudio";toast("Música processada com sucesso.");switchView("catalog");return}setJob(100,"Falha no processamento","Abra a execução do GitHub para detalhes.");throw new Error("Workflow "+l.conclusion)}await new Promise(function(r){setTimeout(r,6500)})}}
function formValues(){return{title:E.songTitle.value.trim(),artist:E.songArtist.value.trim(),date:E.songDateInput.value,releaseYear:E.releaseYearInput.value.trim(),youtubeViews:E.youtubeViewsInput.value.trim(),difficulty:E.difficultyInput.value,youtubeUrl:E.youtubeUrlInput.value.trim(),spotifyUrl:E.spotifyUrlInput.value.trim(),appleMusicUrl:E.appleMusicUrlInput.value.trim(),deezerUrl:E.deezerUrlInput.value.trim(),clipStart:E.clipStartInput.value.trim()}}
function setDefaultDate(){E.songDateInput.value=brazilDate()}
async function loadAnalyticsConfig(){try{var r=await fetch("/analytics-config.json?v="+Date.now(),{cache:"no-store"});analyticsConfig=r.ok?await r.json():null}catch(_){analyticsConfig=null}updateAnalyticsStatus()}
function updateAnalyticsStatus(){
 var url=analyticsConfig&&(analyticsConfig.dashboardEndpoint||analyticsConfig.endpoint);if(url){E.analyticsStatusPanel.querySelector("i").className="status-green";E.analyticsStatusTitle.textContent="Conectado";E.analyticsStatusText.textContent="Supabase conectado e recebendo estatísticas.";E.analyticsWarning.classList.add("hidden")}else{E.analyticsStatusPanel.querySelector("i").className="status-red";E.analyticsStatusTitle.textContent="Não conectado";E.analyticsStatusText.textContent="Nenhum endpoint configurado.";E.analyticsWarning.classList.remove("hidden")}
}
async function refreshDashboard(){
 if(!selectedDate)selectedDate=brazilDate();
 updateDateFilterUi();
 renderSelectedChallenge();
 var endpoint=analyticsConfig&&analyticsConfig.dashboardEndpoint;if(!endpoint)return;
 try{
   var sep=endpoint.indexOf("?")>=0?"&":"?";
   var r=await fetch(endpoint+sep+"range=7d&date="+encodeURIComponent(selectedDate),{cache:"no-store"});
   if(!r.ok)throw new Error("analytics");
   var data=await r.json();
   renderAnalytics(data);
   if(selectedDate!==brazilDate()){E.metricOnline.textContent="—"} 
   E.analyticsWarning.classList.add("hidden")
 }catch(err){
   console.error("analytics",err);
   E.analyticsWarning.classList.remove("hidden");
   E.analyticsWarning.querySelector("strong").textContent="Não consegui carregar as estatísticas";
   E.analyticsWarning.querySelector("span").textContent="A coleta continua ativa no Supabase. Recarregue o painel para tentar novamente.";
 }
}
function renderAnalytics(data){
 var today=data.today||data.summary||data||{};
 E.metricPlayers.textContent=formatInt(today.players);E.metricOnline.textContent=formatInt(today.online);E.metricUnique.textContent=formatInt(today.unique);E.metricDuration.textContent=formatDuration(today.avgDurationSeconds||today.avgDuration);
 E.pageViews.textContent=formatInt(today.pageViews);E.audioErrors.textContent=formatInt(today.audioErrors);E.abandonRate.textContent=formatPercent(today.abandonmentRate);E.completionRate.textContent=formatPercent(today.completionRate);
 if(today.wins!==undefined||today.fails!==undefined||today.rounds)renderGameStats({rounds:today.rounds||[0,0,0,0,0],failed:today.fails||0});
 var guesses=today.commonGuesses||data.commonGuesses||[];E.commonGuesses.innerHTML="";if(!guesses.length)E.commonGuesses.innerHTML='<div class="empty-row">Sem palpites suficientes</div>';else guesses.slice(0,6).forEach(function(g,i){var row=document.createElement("div");row.className="rank-row";var n=document.createElement("b");n.textContent=i+1;var s=document.createElement("span");s.textContent=g.value||g.guess||"—";var c=document.createElement("strong");c.textContent=formatInt(g.count);row.append(n,s,c);E.commonGuesses.appendChild(row)});
 renderTraffic(data.daily||data.days||[])
}
function renderTraffic(days){
 E.trafficChart.innerHTML="";if(!Array.isArray(days)||!days.length){E.trafficChart.innerHTML='<div class="empty-chart">Sem histórico de acessos</div>';E.trafficTotal.textContent="— total";return}
 var max=Math.max.apply(Math,days.map(function(d){return Number(d.views||d.accesses||0)}).concat([1])),sum=0;days.slice(-7).forEach(function(d){var v=Number(d.views||d.accesses||0)||0;sum+=v;var col=document.createElement("div");col.className="chart-col";var bar=document.createElement("i");bar.style.height=Math.max(3,Math.round(v/max*150))+"px";var lab=document.createElement("span");lab.textContent=(d.label||String(d.date||"").slice(5)||"—");col.append(bar,lab);E.trafficChart.appendChild(col)});E.trafficTotal.textContent=formatInt(sum)+" total"
}
var titles={"dashboard":["PAINEL","Visão geral"],"new-song":["CONTEÚDO","Nova música"],"catalog":["BIBLIOTECA","Catálogo"],"settings":["SISTEMA","Configurações"]};
function switchView(name){
 document.querySelectorAll(".nav-item").forEach(function(b){b.classList.toggle("active",b.dataset.view===name)});document.querySelectorAll("[data-view-panel]").forEach(function(v){v.classList.toggle("active",v.dataset.viewPanel===name)});
 var t=titles[name]||titles.dashboard;E.sectionEyebrow.textContent=t[0];E.sectionTitle.textContent=t[1];document.querySelector(".sidebar").classList.remove("open");if(name==="dashboard")refreshDashboard()
}
document.querySelectorAll(".nav-item").forEach(function(b){b.addEventListener("click",function(){switchView(b.dataset.view)})});
document.querySelectorAll("[data-view-jump]").forEach(function(b){b.addEventListener("click",function(){switchView(b.dataset.viewJump)})});
E.menuBtn.addEventListener("click",function(){document.querySelector(".sidebar").classList.toggle("open")});
E.connectForm.addEventListener("submit",async function(ev){ev.preventDefault();var btn=ev.submitter;if(btn)btn.disabled=true;try{await connect(E.tokenInput.value);E.tokenInput.value=""}catch(err){if(err.status===401)clearToken();toast(err.status===401?"Token inválido ou expirado.":err.status===403?"O token não tem acesso suficiente ao Dailysonh.":"Não consegui conectar ao GitHub. A key não foi apagada; tente novamente.")}finally{if(btn)btn.disabled=false}});
E.disconnectBtn.addEventListener("click",function(){clearToken();location.reload()});
E.audioFile.addEventListener("change",function(){var f=E.audioFile.files&&E.audioFile.files[0];E.fileLabel.textContent=f?f.name:"Escolher arquivo de áudio"});
["dragenter","dragover"].forEach(function(n){E.uploadZone.addEventListener(n,function(ev){ev.preventDefault();E.uploadZone.classList.add("drag")})});["dragleave","drop"].forEach(function(n){E.uploadZone.addEventListener(n,function(){E.uploadZone.classList.remove("drag")})});
E.songForm.addEventListener("submit",async function(ev){ev.preventDefault();var file=E.audioFile.files&&E.audioFile.files[0];if(!file){toast("Escolha o arquivo de áudio.");return}if(file.size>MAX_FILE_MB*1024*1024){toast("O áudio passa de "+MAX_FILE_MB+" MB.");return}var v=formValues();if(!v.date){toast("Escolha a data.");return}E.publishBtn.disabled=true;E.workflowLink.classList.add("hidden");try{var path="incoming/"+Date.now()+"-"+sanitizeFilename(file.name);setJob(15,"Enviando áudio","Preparando arquivo.");await uploadAudio(file,path);setJob(55,"Upload concluído","Iniciando processamento.");var t=Date.now();await dispatch(path,v);setJob(62,"Processamento solicitado","Localizando execução.");var run=await waitRun(t);if(!run){setJob(66,"Processamento iniciado","Atualize o catálogo em alguns minutos.");toast("Processamento enviado.");return}await monitor(run)}catch(err){console.error(err);setJob(100,"Não foi possível concluir",err.status===403?"O token precisa de Contents e Actions em leitura e escrita.":"Confira a conexão ou a execução no GitHub.");toast("Ocorreu um erro no envio.")}finally{E.publishBtn.disabled=false}});
E.refreshSongsBtn.addEventListener("click",async function(){try{await loadCatalog();toast("Catálogo atualizado.")}catch(_){toast("Não consegui atualizar.")}});
E.editForm.addEventListener("submit",async function(ev){ev.preventDefault();var i=Number(E.editIndex.value),s=catalog.songs[i];if(!s)return;E.saveEditBtn.disabled=true;s.title=E.editTitle.value.trim();s.artist=E.editArtist.value.trim();s.releaseYear=E.editReleaseYear.value.trim();s.youtubeViews=E.editYoutubeViews.value.trim();s.difficulty=E.editDifficulty.value;s.youtubeUrl=E.editYoutubeUrl.value.trim();s.spotifyUrl=E.editSpotifyUrl.value.trim();s.appleMusicUrl=E.editAppleMusicUrl.value.trim();s.deezerUrl=E.editDeezerUrl.value.trim();try{await saveCatalog();renderSongs();renderSelectedChallenge();E.editDialog.close();toast("Alterações salvas.")}catch(err){console.error(err);toast("Não consegui salvar.")}finally{E.saveEditBtn.disabled=false}});
function setDashboardDate(date){
 var today=brazilDate();
 if(!date)date=today;
 if(date>today)date=today;
 selectedDate=date;
 updateDateFilterUi();
 refreshDashboard();
}
E.dashboardDate.addEventListener("change",function(){setDashboardDate(E.dashboardDate.value)});
E.prevDateBtn.addEventListener("click",function(){setDashboardDate(addDays(selectedDate||brazilDate(),-1))});
E.nextDateBtn.addEventListener("click",function(){setDashboardDate(addDays(selectedDate||brazilDate(),1))});
E.todayDateBtn.addEventListener("click",function(){setDashboardDate(brazilDate())});

async function boot(){
 setDefaultDate();selectedDate=brazilDate();updateDateFilterUi();
 var st=storedToken();if(!st)return;
 try{
   await connect(st);
 }catch(firstError){
   await new Promise(function(resolve){setTimeout(resolve,900)});
   try{
     await connect(st);
   }catch(err){
     token=st;
     document.body.classList.add("auth-locked");
     E.loginView.classList.remove("hidden");
     E.panel.classList.add("hidden");
     E.connectionLabel.textContent="Desconectado";
     E.tokenInput.value=st;
     toast(err.status===401?"A key salva parece inválida ou expirada.":"Não consegui validar agora, mas sua key continua salva. Tente Conectar novamente.");
   }
 }
}
boot();
})();