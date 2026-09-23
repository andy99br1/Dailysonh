(function(){
"use strict";
var OWNER="andy99br1",REPO="Dailysonh",BRANCH="main",API="https://api.github.com",WORKFLOW="process-upload.yml",MIDI_WORKFLOW="midi-lab.yml",MIDI_PUBLISH_WORKFLOW="publish-midi.yml",MAX_FILE_MB=45;
function $(id){return document.getElementById(id)}
var E={
 loginView:$("loginView"),panel:$("panel"),connectForm:$("connectForm"),tokenInput:$("tokenInput"),disconnectBtn:$("disconnectBtn"),
 githubUser:$("githubUser"),connectionLabel:$("connectionLabel"),menuBtn:$("menuBtn"),themeDayBtn:$("themeDayBtn"),themeNightBtn:$("themeNightBtn"),adminThemeColor:$("adminThemeColor"),sectionTitle:$("sectionTitle"),sectionEyebrow:$("sectionEyebrow"),
 songForm:$("songForm"),audioFile:$("audioFile"),uploadZone:$("uploadZone"),fileLabel:$("fileLabel"),songTitle:$("songTitle"),songArtist:$("songArtist"),songDateInput:$("songDateInput"),
 releaseYearInput:$("releaseYearInput"),difficultyInput:$("difficultyInput"),youtubeViewsInput:$("youtubeViewsInput"),clipStartInput:$("clipStartInput"),
 youtubeUrlInput:$("youtubeUrlInput"),spotifyUrlInput:$("spotifyUrlInput"),appleMusicUrlInput:$("appleMusicUrlInput"),deezerUrlInput:$("deezerUrlInput"),publishBtn:$("publishBtn"),
 jobBox:$("jobBox"),jobTitle:$("jobTitle"),jobPercent:$("jobPercent"),jobProgress:$("jobProgress"),jobMessage:$("jobMessage"),workflowLink:$("workflowLink"),
 midiForm:$("midiForm"),midiUploadZone:$("midiUploadZone"),midiFile:$("midiFile"),midiFileLabel:$("midiFileLabel"),midiRevealUploadZone:$("midiRevealUploadZone"),midiRevealFile:$("midiRevealFile"),midiRevealFileLabel:$("midiRevealFileLabel"),midiMelodyStyle:$("midiMelodyStyle"),midiClipStart:$("midiClipStart"),midiRunBtn:$("midiRunBtn"),midiRerenderBtn:$("midiRerenderBtn"),
 midiJobBox:$("midiJobBox"),midiJobTitle:$("midiJobTitle"),midiJobPercent:$("midiJobPercent"),midiJobProgress:$("midiJobProgress"),midiJobMessage:$("midiJobMessage"),midiWorkflowLink:$("midiWorkflowLink"),
 midiResultsCard:$("midiResultsCard"),midiResultTitle:$("midiResultTitle"),midiResultMeta:$("midiResultMeta"),midiRefreshBtn:$("midiRefreshBtn"),midiRoles:$("midiRoles"),midiRounds:$("midiRounds"),midiAudio:$("midiAudio"),midiNowNumber:$("midiNowNumber"),midiNowLabel:$("midiNowLabel"),midiAudioStatus:$("midiAudioStatus"),midiChannels:$("midiChannels"),midiEditNamesBtn:$("midiEditNamesBtn"),midiNameFields:$("midiNameFields"),midiNameActions:$("midiNameActions"),midiSaveNamesBtn:$("midiSaveNamesBtn"),midiCancelNamesBtn:$("midiCancelNamesBtn"),midiNameStatus:$("midiNameStatus"),
 midiPublishTitle:$("midiPublishTitle"),midiPublishArtist:$("midiPublishArtist"),midiPublishDate:$("midiPublishDate"),midiPublishYear:$("midiPublishYear"),midiPublishDifficulty:$("midiPublishDifficulty"),midiPublishYoutubeViews:$("midiPublishYoutubeViews"),midiPublishYoutubeUrl:$("midiPublishYoutubeUrl"),midiPublishCoverUrl:$("midiPublishCoverUrl"),midiPublishSpotifyUrl:$("midiPublishSpotifyUrl"),midiPublishAppleMusicUrl:$("midiPublishAppleMusicUrl"),midiPublishDeezerUrl:$("midiPublishDeezerUrl"),midiPublishBtn:$("midiPublishBtn"),midiPublishStatus:$("midiPublishStatus"),
 refreshSongsBtn:$("refreshSongsBtn"),songsList:$("songsList"),songsEmpty:$("songsEmpty"),editDialog:$("editDialog"),editForm:$("editForm"),editHeading:$("editHeading"),
 editIndex:$("editIndex"),editTitle:$("editTitle"),editArtist:$("editArtist"),editReleaseYear:$("editReleaseYear"),editYoutubeViews:$("editYoutubeViews"),editDifficulty:$("editDifficulty"),
 editYoutubeUrl:$("editYoutubeUrl"),editSpotifyUrl:$("editSpotifyUrl"),editAppleMusicUrl:$("editAppleMusicUrl"),editDeezerUrl:$("editDeezerUrl"),saveEditBtn:$("saveEditBtn"),toast:$("toast"),
 previewDialog:$("previewDialog"),previewCloseBtn:$("previewCloseBtn"),previewTitle:$("previewTitle"),previewMeta:$("previewMeta"),previewTrackList:$("previewTrackList"),previewAudio:$("previewAudio"),previewNumber:$("previewNumber"),previewTrackName:$("previewTrackName"),previewStatus:$("previewStatus"),
 metricPlayers:$("metricPlayers"),metricPlayersSub:$("metricPlayersSub"),metricOnline:$("metricOnline"),metricOnlineSub:$("metricOnlineSub"),metricUnique:$("metricUnique"),metricUniqueSub:$("metricUniqueSub"),metricDuration:$("metricDuration"),metricDurationSub:$("metricDurationSub"),trafficTotal:$("trafficTotal"),
 trafficChart:$("trafficChart"),todaySongTitle:$("todaySongTitle"),todayChallenge:$("todayChallenge"),todayWins:$("todayWins"),todayFails:$("todayFails"),todayRate:$("todayRate"),
 roundBars:$("roundBars"),commonGuesses:$("commonGuesses"),audioErrors:$("audioErrors"),abandonRate:$("abandonRate"),completionRate:$("completionRate"),pageViews:$("pageViews"),
 analyticsWarning:$("analyticsWarning"),analyticsStatusPanel:$("analyticsStatusPanel"),analyticsStatusTitle:$("analyticsStatusTitle"),analyticsStatusText:$("analyticsStatusText"),
 dashboardDate:$("dashboardDate"),selectedDateLabel:$("selectedDateLabel"),autoRefreshStatus:$("autoRefreshStatus"),prevDateBtn:$("prevDateBtn"),nextDateBtn:$("nextDateBtn"),todayDateBtn:$("todayDateBtn"),trafficPeriodTitle:$("trafficPeriodTitle")
};
var token="",catalog={songs:[]},catalogSha="",analyticsConfig=null,toastTimer=null,selectedDate="",previewSong=null,previewTrackIndex=0,dashboardRefreshTimer=null,dashboardRefreshBusy=false,lastDashboardRefreshAt=0,latestMidiManifest=null;
var DASHBOARD_REFRESH_MS=10000;
var DEFAULT_ANALYTICS_CONFIG={
  endpoint:"https://kxoxlgiktwumooixedgu.supabase.co/functions/v1/musicadodia-analytics",
  supabaseUrl:"https://kxoxlgiktwumooixedgu.supabase.co",
  supabasePublishableKey:"sb_publishable_-It1y0ZrgHKjEtPGgt6DYQ_m631G-u2"
};
function headers(extra){return Object.assign({"Accept":"application/vnd.github+json","Authorization":"Bearer "+token,"X-GitHub-Api-Version":"2022-11-28"},extra||{})}
async function api(path,options){
 var response=await fetch(API+path,Object.assign({headers:headers()},options||{}));
 if(!response.ok){var t="";try{t=await response.text()}catch(_){ }var e=new Error("GitHub API "+response.status);e.status=response.status;e.details=t;throw e}
 if(response.status===204)return null;return response.json()
}
function toast(message){E.toast.textContent=message;E.toast.classList.remove("hidden");clearTimeout(toastTimer);toastTimer=setTimeout(function(){E.toast.classList.add("hidden")},3000)}

function applyAdminTheme(theme){
 theme=theme==="day"?"day":"night";
 document.body.setAttribute("data-admin-theme",theme);
 localStorage.setItem("musicadodia:admin-theme",theme);
 if(E.themeDayBtn)E.themeDayBtn.classList.toggle("active",theme==="day");
 if(E.themeNightBtn)E.themeNightBtn.classList.toggle("active",theme==="night");
 if(E.adminThemeColor)E.adminThemeColor.setAttribute("content",theme==="day"?"#f3f6fb":"#0b1230");
}
function loadAdminTheme(){
 var saved=localStorage.getItem("musicadodia:admin-theme");
 if(saved!=="day"&&saved!=="night")saved="night";
 applyAdminTheme(saved);
}

function brazilDate(){var p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),v={};p.forEach(function(x){if(x.type!=="literal")v[x.type]=x.value});return v.year+"-"+v.month+"-"+v.day}
function addDays(date,days){var p=String(date||"").split("-").map(Number);if(p.length!==3||!p[0])return brazilDate();var d=new Date(Date.UTC(p[0],p[1]-1,p[2]));d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function longDate(date){if(!date)return"—";var p=date.split("-").map(Number);return new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",weekday:"short",day:"2-digit",month:"short",year:"numeric"}).format(new Date(Date.UTC(p[0],p[1]-1,p[2]))).replace(/\./g,"")}
function prettyDate(date){if(!date)return"—";var p=date.split("-").map(Number);return new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(Date.UTC(p[0],p[1]-1,p[2])))}
function formatInt(v){var n=Number(v);return Number.isFinite(n)?n.toLocaleString("pt-BR"):"—"}
function formatPercent(v){var n=Number(v);return Number.isFinite(n)?Math.round(n)+"%":"—"}
function formatDuration(v){var n=Number(v);if(!Number.isFinite(n))return"—";var m=Math.floor(n/60),s=Math.round(n%60);return m?m+"m "+String(s).padStart(2,"0")+"s":s+"s"}
function sanitizeFilename(name){var dot=name.lastIndexOf("."),ext=dot>=0?name.slice(dot).toLowerCase():"",stem=dot>=0?name.slice(0,dot):name;stem=stem.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^[-.]+|[-.]+$/g,"").slice(0,90);return(stem||"audio")+ext}
async function fileToBase64(file){var bytes=new Uint8Array(await file.arrayBuffer()),binary="",chunk=0x8000;for(var i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+chunk,bytes.length)));return btoa(binary)}
function getCookie(name){var parts=document.cookie.split("; ");for(var i=0;i<parts.length;i++){var p=parts[i].split("=");if(p.shift()===name)return decodeURIComponent(p.join("="))}return""}
function setTokenCookie(value){var c="mdd_admin_token="+encodeURIComponent(value)+"; Max-Age=2592000; Path=/central-mdd-7k29/; SameSite=Strict; Secure";if(location.hostname==="musicadodia.com"||location.hostname.endsWith(".musicadodia.com"))c+="; Domain=.musicadodia.com";document.cookie=c}
function clearTokenCookie(){
 var expirations=[
   "mdd_admin_token=; Max-Age=0; Path=/central-mdd-7k29/; SameSite=Strict; Secure",
   "mdd_admin_token=; Max-Age=0; Path=/; SameSite=Strict; Secure"
 ];
 if(location.hostname==="musicadodia.com"||location.hostname.endsWith(".musicadodia.com")){
   expirations.push("mdd_admin_token=; Max-Age=0; Path=/central-mdd-7k29/; Domain=.musicadodia.com; SameSite=Strict; Secure");
   expirations.push("mdd_admin_token=; Max-Age=0; Path=/; Domain=.musicadodia.com; SameSite=Strict; Secure");
 }
 expirations.forEach(function(c){document.cookie=c});
}
function storedToken(){return localStorage.getItem("musicadodia:admin-token")||sessionStorage.getItem("musicadodia:admin-token")||getCookie("mdd_admin_token")||""}
function storeToken(value){localStorage.setItem("musicadodia:admin-token",value);sessionStorage.setItem("musicadodia:admin-token",value);setTokenCookie(value)}
function clearToken(){
 sessionStorage.removeItem("musicadodia:admin-token");
 localStorage.removeItem("musicadodia:admin-token");
 localStorage.removeItem("musicadodia:admin-validated");
 clearTokenCookie();
 token="";
}
async function validate(){var repoInfo=await api("/repos/"+OWNER+"/"+REPO);if(!repoInfo||String(repoInfo.full_name||"").toLowerCase()!==(OWNER+"/"+REPO).toLowerCase())throw new Error("Repositório não autorizado");E.githubUser.textContent=OWNER;E.connectionLabel.textContent="Conectado";return true}
async function openPanel(){
 document.body.classList.remove("auth-locked");
 E.loginView.classList.add("hidden");
 E.panel.classList.remove("hidden");
 E.connectionLabel.textContent="Conectado";
 E.githubUser.textContent=OWNER;

 var catalogOk=true,analyticsOk=true;
 try{await loadCatalog()}catch(err){catalogOk=false;console.error("catalog",err)}
 try{await loadAnalyticsConfig()}catch(err){analyticsOk=false;console.error("analytics-config",err)}
 try{await refreshDashboard()}catch(err){analyticsOk=false;console.error("dashboard",err)}

 if(!catalogOk||!analyticsOk){
   toast("Painel aberto. Alguns dados demoraram para carregar.");
 }
 startDashboardAutoRefresh();
}
async function connect(value){
 token=String(value||"").trim();
 if(!token)throw new Error("Token vazio");
 await validate();
 storeToken(token);
 await openPanel();
 return true;
}
async function getRepoFile(path){return api("/repos/"+OWNER+"/"+REPO+"/contents/"+encodeURI(path)+"?ref="+encodeURIComponent(BRANCH))}
async function loadCatalog(){
 var r=await fetch("/catalog.json?_="+Date.now(),{cache:"no-store"});
 if(!r.ok)throw new Error("catalog "+r.status);
 catalog=await r.json();
 if(!Array.isArray(catalog.songs))catalog.songs=[];
 renderSongs();
 renderSelectedChallenge();
}
function renderSongs(){
 E.songsList.innerHTML="";var songs=catalog.songs.slice().sort(function(a,b){return String(b.date||"").localeCompare(String(a.date||""))});E.songsEmpty.classList.toggle("hidden",songs.length>0);
 songs.forEach(function(song){var idx=catalog.songs.indexOf(song),row=document.createElement("div");row.className="song-row";
 var d=document.createElement("div");d.className="song-date";d.textContent=prettyDate(song.date);var tag=document.createElement("span"),future=String(song.date||"")>brazilDate();tag.className="tag "+(future?"future":"live");tag.textContent=future?"Agendada":"Publicada";d.appendChild(tag);var sm=document.createElement("small");sm.textContent="versão "+(song.version||1);d.appendChild(sm);
 var main=document.createElement("div");main.className="song-main";var t=document.createElement("strong");t.textContent=song.title||"Sem título";var a=document.createElement("span");a.textContent=song.artist||"Artista não informado";main.append(t,a);
 var actions=document.createElement("div");actions.className="song-actions";
 var test=document.createElement("button");test.className="mini-btn test-btn";test.type="button";test.textContent="Testar";test.onclick=function(){openPreview(idx)};
 var edit=document.createElement("button");edit.className="mini-btn";edit.type="button";edit.textContent="Editar";edit.onclick=function(){openEdit(idx)};
 var del=document.createElement("button");del.className="mini-btn delete-btn";del.type="button";del.textContent="Excluir";del.onclick=function(){deleteSong(idx,del)};
 var open=document.createElement("a");open.className="mini-btn";open.textContent="Abrir";open.href="/";open.target="_blank";open.rel="noopener";
 actions.append(test,edit,del,open);row.append(d,main,actions);E.songsList.appendChild(row)
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
 E.todayWins.textContent=formatInt(wins);E.todayFails.textContent=formatInt(failed);E.todayRate.textContent=total?Math.round(wins/total*100)+"%":"—";
 E.roundBars.innerHTML="";var max=Math.max.apply(Math,rounds.concat([failed,1]));rounds.concat([failed]).forEach(function(v,i){var wrap=document.createElement("div");wrap.className="round-bar";var bar=document.createElement("i");bar.style.height=Math.max(4,Math.round((v/max)*90))+"%";var label=document.createElement("small");label.textContent=i<5?String(i+1):"×";wrap.append(bar,label);E.roundBars.appendChild(wrap)})
}

function previewLabels(){return["Bateria","Baixo","Instrumentos","Melodia","Revelação"]}
function previewSource(song,index){
 if(!song||!Array.isArray(song.rounds)||!song.rounds[index])return"";
 var src=String(song.rounds[index]);
 return "/"+src.replace(/^\/+/, "")+(src.indexOf("?")>=0?"&":"?")+"v="+(song.version||1);
}
function selectPreviewTrack(index,autoplay){
 if(!previewSong)return;
 var labels=previewLabels();
 index=Math.max(0,Math.min(4,Number(index)||0));
 previewTrackIndex=index;
 E.previewTrackList.querySelectorAll(".preview-track-btn").forEach(function(btn,i){btn.classList.toggle("active",i===index)});
 E.previewNumber.textContent=String(index+1);
 E.previewTrackName.textContent=labels[index];
 var src=previewSource(previewSong,index);
 E.previewAudio.pause();
 E.previewAudio.src=src;
 E.previewAudio.load();
 E.previewStatus.textContent="Faixa "+(index+1)+" · "+labels[index];
 if(autoplay){
   var p=E.previewAudio.play();
   if(p&&typeof p.catch==="function")p.catch(function(){});
 }
}
function openPreview(index){
 var song=catalog.songs[index];
 if(!song)return;
 previewSong=song;
 previewTrackIndex=0;
 E.previewTitle.textContent=(song.artist?song.artist+" · ":"")+(song.title||"Sem título");
 E.previewMeta.textContent=prettyDate(song.date)+(String(song.date||"")>brazilDate()?" · Agendada":" · Publicada");
 E.previewTrackList.innerHTML="";
 var labels=previewLabels();
 labels.forEach(function(label,i){
   var btn=document.createElement("button");
   btn.type="button";
   btn.className="preview-track-btn";
   var num=document.createElement("b");num.textContent=String(i+1);
   var name=document.createElement("span");name.textContent=label;
   btn.append(num,name);
   btn.addEventListener("click",function(){selectPreviewTrack(i,true)});
   E.previewTrackList.appendChild(btn);
 });
 selectPreviewTrack(0,false);
 E.previewDialog.showModal();
}
function closePreview(){
 try{E.previewAudio.pause();E.previewAudio.removeAttribute("src");E.previewAudio.load()}catch(_){}
 previewSong=null;
 if(E.previewDialog.open)E.previewDialog.close();
}


function decodeRepoContent(data){
 return JSON.parse(decodeURIComponent(escape(atob(String(data.content||"").replace(/\n/g,"")))));
}
async function deleteRepoFile(path,message){
 try{
   var info=await getRepoFile(path);
   if(!info||!info.sha)return;
   await api("/repos/"+OWNER+"/"+REPO+"/contents/"+encodeURI(path),{
     method:"DELETE",
     headers:headers({"Content-Type":"application/json"}),
     body:JSON.stringify({message:message,sha:info.sha,branch:BRANCH})
   });
 }catch(err){
   if(err&&err.status===404)return;
   throw err;
 }
}
async function deleteSong(index,button){
 var song=catalog.songs[index];
 if(!song)return;

 var label=(song.artist?song.artist+" · ":"")+(song.title||"Sem título");
 var day=String(song.date||"");
 var ok=window.confirm('Excluir "'+label+'" de '+prettyDate(day)+'?\n\nIsso remove a música do catálogo e as 5 faixas processadas. Esta ação não pode ser desfeita.');
 if(!ok)return;

 if(button)button.disabled=true;
 try{
   // Lê o catálogo atual do GitHub para não sobrescrever mudanças recentes.
   var current=await getRepoFile("catalog.json");
   var fresh=decodeRepoContent(current);
   if(!Array.isArray(fresh.songs))fresh.songs=[];

   var existing=fresh.songs.find(function(s){return String(s.date||"")===day});
   if(!existing){
     await loadCatalog();
     toast("Essa música já não está mais no catálogo.");
     return;
   }

   var rounds=Array.isArray(existing.rounds)?existing.rounds.slice():[];
   for(var i=0;i<rounds.length;i++){
     await deleteRepoFile(String(rounds[i]),"Delete processed track "+day);
   }

   fresh.songs=fresh.songs.filter(function(s){return String(s.date||"")!==day});
   var json=JSON.stringify(fresh,null,2)+"\n";
   var bytes=new TextEncoder().encode(json),binary="";
   for(var j=0;j<bytes.length;j+=0x8000)binary+=String.fromCharCode.apply(null,bytes.subarray(j,Math.min(j+0x8000,bytes.length)));

   await api("/repos/"+OWNER+"/"+REPO+"/contents/catalog.json",{
     method:"PUT",
     headers:headers({"Content-Type":"application/json"}),
     body:JSON.stringify({
       message:"Delete song "+day+" from admin dashboard",
       content:btoa(binary),
       sha:current.sha,
       branch:BRANCH
     })
   });

   catalog=fresh;
   renderSongs();
   renderSelectedChallenge();
   toast("Música excluída. A data "+prettyDate(day)+" está livre.");
 }catch(err){
   console.error("delete song",err);
   toast(err&&err.status===401?"Sua key expirou.":err&&err.status===403?"A key não tem permissão para excluir arquivos.":"Não consegui excluir a música.");
 }finally{
   if(button)button.disabled=false;
 }
}

function openEdit(index){var s=catalog.songs[index];if(!s)return;E.editIndex.value=String(index);E.editHeading.textContent=s.title||"Música";E.editTitle.value=s.title||"";E.editArtist.value=s.artist||"";E.editReleaseYear.value=s.releaseYear||"";E.editYoutubeViews.value=s.youtubeViews||"";E.editDifficulty.value=s.difficulty||"";E.editYoutubeUrl.value=s.youtubeUrl||"";E.editSpotifyUrl.value=s.spotifyUrl||"";E.editAppleMusicUrl.value=s.appleMusicUrl||"";E.editDeezerUrl.value=s.deezerUrl||"";E.editDialog.showModal()}
async function saveCatalog(){
 var current=await getRepoFile("catalog.json");
 catalogSha=current.sha;
 var json=JSON.stringify(catalog,null,2)+"\n",bytes=new TextEncoder().encode(json),binary="";
 for(var i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+0x8000,bytes.length)));
 var r=await api("/repos/"+OWNER+"/"+REPO+"/contents/catalog.json",{method:"PUT",headers:headers({"Content-Type":"application/json"}),body:JSON.stringify({message:"Update song metadata from admin dashboard",content:btoa(binary),sha:catalogSha,branch:BRANCH})});
 catalogSha=r.content.sha
}
function setJob(percent,title,message){E.jobBox.classList.remove("hidden");E.jobPercent.textContent=percent+"%";E.jobProgress.style.width=percent+"%";E.jobTitle.textContent=title;E.jobMessage.textContent=message||""}
async function uploadAudio(file,path){var b64=await fileToBase64(file);return api("/repos/"+OWNER+"/"+REPO+"/contents/"+encodeURI(path),{method:"PUT",headers:headers({"Content-Type":"application/json"}),body:JSON.stringify({message:"Upload audio from Música do Dia dashboard",content:b64,branch:BRANCH})})}
async function dispatch(path,v){return api("/repos/"+OWNER+"/"+REPO+"/actions/workflows/"+WORKFLOW+"/dispatches",{method:"POST",headers:headers({"Content-Type":"application/json"}),body:JSON.stringify({ref:BRANCH,inputs:{audio_path:path,title:v.title,artist:v.artist,date:v.date,release_year:v.releaseYear,youtube_views:v.youtubeViews,difficulty:v.difficulty,youtube_url:v.youtubeUrl,spotify_url:v.spotifyUrl,apple_music_url:v.appleMusicUrl,deezer_url:v.deezerUrl,clip_start:v.clipStart}})})}
async function waitRun(after){var started=Date.now();while(Date.now()-started<90000){var d=await api("/repos/"+OWNER+"/"+REPO+"/actions/workflows/"+WORKFLOW+"/runs?event=workflow_dispatch&branch="+BRANCH+"&per_page=10"),r=(d.workflow_runs||[]).find(function(x){return new Date(x.created_at).getTime()>=after-5000});if(r)return r;await new Promise(function(res){setTimeout(res,3500)})}return null}
async function monitor(run){E.workflowLink.href=run.html_url;E.workflowLink.classList.remove("hidden");while(true){var l=await api("/repos/"+OWNER+"/"+REPO+"/actions/runs/"+run.id);if(l.status==="queued")setJob(68,"Na fila","Preparando o ambiente.");else if(l.status==="in_progress")setJob(84,"Processando áudio","Separando as camadas. Isso pode levar alguns minutos.");else if(l.status==="completed"){if(l.conclusion==="success"){setJob(100,"Música pronta","Processamento concluído.");await new Promise(function(r){setTimeout(r,2000)});await loadCatalog();E.songForm.reset();setDefaultDate();E.fileLabel.textContent="Escolher arquivo de áudio";toast("Música processada com sucesso.");switchView("catalog");return}setJob(100,"Falha no processamento","Abra a execução do GitHub para detalhes.");throw new Error("Workflow "+l.conclusion)}await new Promise(function(r){setTimeout(r,6500)})}}

function setMidiJob(percent,title,message){E.midiJobBox.classList.remove("hidden");E.midiJobPercent.textContent=percent+"%";E.midiJobProgress.style.width=percent+"%";E.midiJobTitle.textContent=title;E.midiJobMessage.textContent=message||""}
async function putRepoText(path,obj,message){
 var current=null;try{current=await getRepoFile(path)}catch(err){if(!err||err.status!==404)throw err}
 var json=JSON.stringify(obj,null,2)+"\n",bytes=new TextEncoder().encode(json),binary="";
 for(var i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+0x8000,bytes.length)));
 var body={message:message||"Update request",content:btoa(binary),branch:BRANCH};if(current&&current.sha)body.sha=current.sha;
 return api("/repos/"+OWNER+"/"+REPO+"/contents/"+encodeURI(path),{method:"PUT",headers:headers({"Content-Type":"application/json"}),body:JSON.stringify(body)})
}
async function requestMidiLab(sourcePath,style,clipStart,revealSourcePath){return putRepoText(".midi-lab/request.json",{sourcePath:sourcePath,revealSourcePath:revealSourcePath||"",melodyStyle:style||"bandle",clipStart:clipStart||"",nonce:String(Date.now())},"Run MIDI laboratory")}
async function waitMidiRun(after){var started=Date.now();while(Date.now()-started<90000){var d=await api("/repos/"+OWNER+"/"+REPO+"/actions/workflows/"+MIDI_WORKFLOW+"/runs?branch="+BRANCH+"&per_page=10"),r=(d.workflow_runs||[]).find(function(x){return new Date(x.created_at).getTime()>=after-5000});if(r)return r;await new Promise(function(resolve){setTimeout(resolve,3000)})}return null}
function midiRoundLabelStorageKey(data){
 return "musicadodia:midi-round-labels:"+(data&&data.sourcePath||data&&data.sourceName||"latest")
}
function getMidiRoundLabels(data){
 var fallback=(data&&Array.isArray(data.rounds)?data.rounds:[]).map(function(round,index){
   if(index===5||String(round.label||"").toLowerCase().indexOf("revela")>=0)return "Revelação";
   var added=Array.isArray(round.added)?round.added.filter(Boolean):[];
   return added.length?added.join(" + "):String(round.label||("Faixa "+round.number))
 });
 try{
   var saved=JSON.parse(localStorage.getItem(midiRoundLabelStorageKey(data))||"null");
   if(Array.isArray(saved))return fallback.map(function(label,i){return String(saved[i]||label)})
 }catch(_){}
 return fallback
}
function saveMidiRoundLabels(data,labels){
 try{localStorage.setItem(midiRoundLabelStorageKey(data),JSON.stringify(labels))}catch(_){}
}
function currentMidiRoundLabels(){
 if(!E.midiRounds)return [];
 return Array.prototype.slice.call(E.midiRounds.querySelectorAll(".midi-round-name")).map(function(input){return input.value.trim()})
}
function midiUsedChannels(data){
 var used={};
 (data&&data.rounds||[]).slice(0,5).forEach(function(round){
   (round.addedChannels||[]).forEach(function(ch){used[String(ch)]=true})
 });
 return (data&&data.channels||[]).filter(function(ch){return used[String(ch.channel)]})
}
function closeMidiNameEditor(){
 E.midiNameFields.classList.add("hidden");
 E.midiNameActions.classList.add("hidden");
 E.midiEditNamesBtn.classList.remove("hidden");
 E.midiNameStatus.textContent="";
}
function openMidiNameEditor(){
 if(!latestMidiManifest)return;
 E.midiNameFields.innerHTML="";
 midiUsedChannels(latestMidiManifest).forEach(function(ch){
   var label=document.createElement("label");
   var caption=document.createElement("span");
   caption.textContent="Canal "+(Number(ch.channel)+1);
   var input=document.createElement("input");
   input.type="text";
   input.value=ch.name||("Canal "+(Number(ch.channel)+1));
   input.setAttribute("data-midi-channel",String(ch.channel));
   label.append(caption,input);
   E.midiNameFields.appendChild(label);
 });
 E.midiNameFields.classList.remove("hidden");
 E.midiNameActions.classList.remove("hidden");
 E.midiEditNamesBtn.classList.add("hidden");
}
function applyMidiNames(data,overrides){
 var names={};
 data.nameOverrides=Object.assign({},overrides||{});
 (data.channels||[]).forEach(function(ch){
   var key=String(ch.channel);
   if(data.nameOverrides[key])ch.name=data.nameOverrides[key];
   names[key]=ch.name||("Canal "+(Number(ch.channel)+1));
 });
 if(data.roles){
   ["drums","bass","melody"].forEach(function(role){
     var item=data.roles[role];
     if(item&&names[String(item.channel)])item.name=names[String(item.channel)];
   });
 }
 (data.rounds||[]).forEach(function(round){
   if(Array.isArray(round.addedChannels)){
     round.added=round.addedChannels.map(function(ch){return names[String(ch)]||("Canal "+(Number(ch)+1))});
   }
 });
 if(data.groups){
   var r3=(data.rounds||[]).find(function(r){return Number(r.number)===3});
   var r4=(data.rounds||[]).find(function(r){return Number(r.number)===4});
   data.groups.instrument1=r3&&Array.isArray(r3.added)?r3.added.slice():[];
   data.groups.instrument2=r4&&Array.isArray(r4.added)?r4.added.slice():[];
 }
 return data
}
async function saveMidiNames(){
 if(!latestMidiManifest)return;
 var overrides={};
 E.midiNameFields.querySelectorAll("input[data-midi-channel]").forEach(function(input){
   var name=input.value.trim();
   if(name)overrides[input.getAttribute("data-midi-channel")]=name.slice(0,60);
 });
 var data=applyMidiNames(JSON.parse(JSON.stringify(latestMidiManifest)),overrides);
 E.midiSaveNamesBtn.disabled=true;
 E.midiCancelNamesBtn.disabled=true;
 E.midiNameStatus.textContent="Salvando...";
 try{
   await putRepoText("midi-lab/manifest.json",data,"Rename MIDI laboratory tracks");
   latestMidiManifest=data;
   renderMidiResult(data);
   toast("Nomes das pistas salvos.");
 }catch(err){
   console.error("rename midi",err);
   E.midiNameStatus.textContent="Não consegui salvar.";
   toast("Não consegui salvar os nomes.");
 }finally{
   E.midiSaveNamesBtn.disabled=false;
   E.midiCancelNamesBtn.disabled=false;
 }
}

function renderMidiResult(data){
 if(!data||!Array.isArray(data.rounds))return;latestMidiManifest=data;E.midiResultsCard.classList.remove("hidden");E.midiRerenderBtn.classList.remove("hidden");E.midiResultTitle.textContent=data.sourceName||"MIDI";
 var start=Number(data.clipStart||0),seconds=Number(data.clipSeconds||18);E.midiResultMeta.textContent="Trecho escolhido: "+start.toFixed(1)+"s–"+(start+seconds).toFixed(1)+"s · "+(data.melodyStyleName||"melodia padrão");E.midiClipStart.placeholder=start.toFixed(1)+" (automático)";
 E.midiRoles.innerHTML="";[["Bateria",data.roles&&data.roles.drums],["Baixo",data.roles&&data.roles.bass],["Melodia",data.roles&&data.roles.melody]].forEach(function(pair){var box=document.createElement("div");box.className="midi-role";var span=document.createElement("span");span.textContent=pair[0];var strong=document.createElement("strong");strong.textContent=pair[1]&&pair[1].name||"—";var small=document.createElement("small");small.textContent=pair[1]&&pair[1].confidence?pair[1].confidence+"% confiança":"";box.append(span,strong,small);E.midiRoles.appendChild(box)});
 E.midiRounds.innerHTML="";
 var editableLabels=getMidiRoundLabels(data);
 data.rounds.forEach(function(round,index){
   var card=document.createElement("div");card.className="midi-round";card.setAttribute("role","button");card.tabIndex=0;
   var n=document.createElement("b");n.textContent=String(round.number);
   var copy=document.createElement("span"),title=document.createElement("input"),desc=document.createElement("small");
   title.type="text";title.className="midi-round-name";title.value=editableLabels[index]||round.label||("Faixa "+round.number);title.maxLength=42;title.setAttribute("aria-label","Nome da faixa "+round.number);
   desc.textContent=(round.added||[]).join(" + ")||"Arranjo completo";
   copy.append(title,desc);card.append(n,copy);
   function playRound(){
     E.midiRounds.querySelectorAll(".midi-round").forEach(function(x){x.classList.remove("active")});card.classList.add("active");
     E.midiNowNumber.textContent=String(round.number);E.midiNowLabel.textContent=title.value.trim()||round.label||("Faixa "+round.number);
     E.midiAudio.src="/"+String(round.audio||"").replace(/^\/+/, "")+"?v="+encodeURIComponent(data.createdAt||Date.now());E.midiAudio.load();
     E.midiAudioStatus.textContent=(round.added||[]).length?"Adiciona: "+round.added.join(" + "):"Revelação completa";
     var p=E.midiAudio.play();if(p&&p.catch)p.catch(function(){})
   }
   card.addEventListener("click",function(ev){if(ev.target===title)return;playRound()});
   card.addEventListener("keydown",function(ev){if((ev.key==="Enter"||ev.key===" ")&&ev.target!==title){ev.preventDefault();playRound()}});
   title.addEventListener("click",function(ev){ev.stopPropagation()});
   title.addEventListener("keydown",function(ev){if(ev.key==="Enter"){ev.preventDefault();title.blur()}});
   title.addEventListener("input",function(){
     var labels=currentMidiRoundLabels();saveMidiRoundLabels(data,labels);
     if(card.classList.contains("active"))E.midiNowLabel.textContent=title.value.trim()||("Faixa "+round.number)
   });
   title.addEventListener("change",function(){
     if(!title.value.trim())title.value=round.label||("Faixa "+round.number);
     var labels=currentMidiRoundLabels();saveMidiRoundLabels(data,labels)
   });
   E.midiRounds.appendChild(card)
 });
 E.midiChannels.innerHTML="";(data.channels||[]).forEach(function(ch){var row=document.createElement("div"),name=document.createElement("span"),info=document.createElement("small");name.textContent="Canal "+(Number(ch.channel)+1)+" · "+(ch.name||"Instrumento");info.textContent=(ch.notesInClip||0)+" notas no trecho"+(ch.pitchBends?" · "+ch.pitchBends+" pitch bends":"");row.append(name,info);E.midiChannels.appendChild(row)});
 if(data.melodyStyle)E.midiMelodyStyle.value=data.melodyStyle;
 if(E.midiPublishDate&&!E.midiPublishDate.value)E.midiPublishDate.value=brazilDate();
 closeMidiNameEditor()
}
async function loadLatestMidiResult(silent){try{var r=await fetch("/midi-lab/manifest.json?_="+Date.now(),{cache:"no-store"});if(!r.ok)throw new Error("manifest "+r.status);var data=await r.json();renderMidiResult(data);if(!silent)toast("Resultado MIDI atualizado.");return data}catch(err){if(!silent)toast("Ainda não há resultado MIDI publicado.");return null}}
async function waitMidiPublicResult(after){var started=Date.now();while(Date.now()-started<180000){try{var r=await fetch("/midi-lab/manifest.json?_="+Date.now(),{cache:"no-store"});if(r.ok){var data=await r.json(),created=Date.parse(data.createdAt||"");if(!Number.isFinite(created)||created>=after-5000){renderMidiResult(data);return data}}}catch(_){}await new Promise(function(resolve){setTimeout(resolve,3500)})}return null}
async function monitorMidi(run,startedAt){
 E.midiWorkflowLink.href=run.html_url;E.midiWorkflowLink.classList.remove("hidden");while(true){var latest=await api("/repos/"+OWNER+"/"+REPO+"/actions/runs/"+run.id);if(latest.status==="queued")setMidiJob(55,"Na fila","Preparando o renderizador MIDI.");else if(latest.status==="in_progress")setMidiJob(78,"Montando desafio","Escolhendo o trecho, classificando as pistas e renderizando somente 18 segundos.");else if(latest.status==="completed"){if(latest.conclusion==="success"){setMidiJob(94,"MIDI processado","Publicando as seis faixas no painel...");var result=await waitMidiPublicResult(startedAt);if(result){setMidiJob(100,"Pronto","As cinco etapas e a revelação estão disponíveis abaixo.");toast("Laboratório MIDI pronto.");return}setMidiJob(100,"Áudios gerados","O deploy ainda está finalizando. Use Recarregar em instantes.");return}setMidiJob(100,"Falha no MIDI","Abra a execução do GitHub para ver a etapa que falhou.");throw new Error("MIDI workflow "+latest.conclusion)}await new Promise(function(resolve){setTimeout(resolve,4500)})}
}
async function startMidiRequest(sourcePath,revealSourcePath){var startedAt=Date.now();setMidiJob(40,"Solicitando análise","Enviando preferências para o processador.");await requestMidiLab(sourcePath,E.midiMelodyStyle.value,E.midiClipStart.value.trim(),revealSourcePath);setMidiJob(50,"Pedido enviado","Localizando a execução no GitHub.");var run=await waitMidiRun(startedAt);if(!run){setMidiJob(54,"Processamento iniciado","A execução foi enviada. Recarregue o resultado em alguns instantes.");return}await monitorMidi(run,startedAt)}
async function dispatchMidiPublish(values){
 return api("/repos/"+OWNER+"/"+REPO+"/actions/workflows/"+MIDI_PUBLISH_WORKFLOW+"/dispatches",{
   method:"POST",
   headers:headers({"Content-Type":"application/json"}),
   body:JSON.stringify({ref:BRANCH,inputs:{
     title:values.title,
     artist:values.artist,
     date:values.date,
     release_year:values.releaseYear||"",
     difficulty:values.difficulty||"",
     youtube_views:values.youtubeViews||"",
     youtube_url:values.youtubeUrl||"",
     cover_url:values.coverUrl||"",
     spotify_url:values.spotifyUrl||"",
     apple_music_url:values.appleMusicUrl||"",
     deezer_url:values.deezerUrl||"",
     round_labels:JSON.stringify(values.roundLabels||[])
   }})
 })
}
async function waitMidiPublishRun(after){
 var started=Date.now();
 while(Date.now()-started<90000){
   var d=await api("/repos/"+OWNER+"/"+REPO+"/actions/workflows/"+MIDI_PUBLISH_WORKFLOW+"/runs?event=workflow_dispatch&branch="+BRANCH+"&per_page=10");
   var r=(d.workflow_runs||[]).find(function(x){return new Date(x.created_at).getTime()>=after-5000});
   if(r)return r;
   await new Promise(function(resolve){setTimeout(resolve,3000)})
 }
 return null
}
async function monitorMidiPublish(run){
 E.midiPublishStatus.textContent="Publicando...";
 while(true){
   var latest=await api("/repos/"+OWNER+"/"+REPO+"/actions/runs/"+run.id);
   if(latest.status==="queued")E.midiPublishStatus.textContent="Na fila...";
   else if(latest.status==="in_progress")E.midiPublishStatus.textContent="Copiando as 6 faixas e atualizando o catálogo...";
   else if(latest.status==="completed"){
     if(latest.conclusion==="success"){
       E.midiPublishStatus.textContent="Publicado. O deploy do site está finalizando.";
       await loadCatalog();
       toast("Música MIDI publicada no catálogo.");
       return
     }
     E.midiPublishStatus.textContent="Falha ao publicar. Abra a execução do GitHub.";
     throw new Error("Publish MIDI "+latest.conclusion)
   }
   await new Promise(function(resolve){setTimeout(resolve,4000)})
 }
}

function formValues(){return{title:E.songTitle.value.trim(),artist:E.songArtist.value.trim(),date:E.songDateInput.value,releaseYear:E.releaseYearInput.value.trim(),youtubeViews:E.youtubeViewsInput.value.trim(),difficulty:E.difficultyInput.value,youtubeUrl:E.youtubeUrlInput.value.trim(),spotifyUrl:E.spotifyUrlInput.value.trim(),appleMusicUrl:E.appleMusicUrlInput.value.trim(),deezerUrl:E.deezerUrlInput.value.trim(),clipStart:E.clipStartInput.value.trim()}}
function setDefaultDate(){E.songDateInput.value=brazilDate()}

function dashboardIsVisible(){
 var view=document.querySelector('[data-view-panel="dashboard"]');
 return Boolean(view&&view.classList.contains("active")&&!document.body.classList.contains("auth-locked"));
}
function updateAutoRefreshStatus(state){
 if(!E.autoRefreshStatus)return;
 var dot=E.autoRefreshStatus.querySelector("i");
 if(state==="loading"){
   E.autoRefreshStatus.classList.add("loading");
   E.autoRefreshStatus.classList.remove("error");
   if(dot)dot.className="";
   E.autoRefreshStatus.lastChild.nodeValue=" Atualizando…";
   return;
 }
 if(state==="error"){
   E.autoRefreshStatus.classList.remove("loading");
   E.autoRefreshStatus.classList.add("error");
   E.autoRefreshStatus.lastChild.nodeValue=" Falha na última atualização";
   return;
 }
 E.autoRefreshStatus.classList.remove("loading","error");
 var now=new Date();
 var time=now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
 E.autoRefreshStatus.lastChild.nodeValue=" Atualizado "+time+" · automático 10s";
}
function startDashboardAutoRefresh(){
 if(dashboardRefreshTimer)clearInterval(dashboardRefreshTimer);
 dashboardRefreshTimer=setInterval(function(){
   if(document.hidden||!dashboardIsVisible())return;
   refreshDashboard();
 },DASHBOARD_REFRESH_MS);
}
function stopDashboardAutoRefresh(){
 if(dashboardRefreshTimer){clearInterval(dashboardRefreshTimer);dashboardRefreshTimer=null}
}

async function loadAnalyticsConfig(){
 analyticsConfig=Object.assign({},DEFAULT_ANALYTICS_CONFIG);
 try{
   var r=await fetch("/analytics-config.json?v="+Date.now(),{cache:"no-store"});
   if(r.ok){
     var remote=await r.json();
     analyticsConfig=Object.assign({},DEFAULT_ANALYTICS_CONFIG,remote||{});
   }
 }catch(err){
   console.warn("analytics-config fallback",err);
 }
 updateAnalyticsStatus();
}
function updateAnalyticsStatus(){
 var connected=Boolean(analyticsConfig&&analyticsConfig.supabaseUrl&&analyticsConfig.supabasePublishableKey);
 if(connected){
   E.analyticsStatusPanel.querySelector("i").className="status-green";
   E.analyticsStatusTitle.textContent="Conectado";
   E.analyticsStatusText.textContent="Supabase conectado e recebendo estatísticas.";
   E.analyticsWarning.classList.add("hidden");
 }else{
   E.analyticsStatusPanel.querySelector("i").className="status-red";
   E.analyticsStatusTitle.textContent="Não conectado";
   E.analyticsStatusText.textContent="Configuração do Supabase indisponível.";
   E.analyticsWarning.classList.remove("hidden");
 }
}
async function refreshDashboard(){
 if(dashboardRefreshBusy)return;
 dashboardRefreshBusy=true;
 updateAutoRefreshStatus("loading");

 try{
   if(!analyticsConfig)analyticsConfig=Object.assign({},DEFAULT_ANALYTICS_CONFIG);
   if(!selectedDate)selectedDate=brazilDate();
   updateDateFilterUi();
   renderSelectedChallenge();

   var endpoint=analyticsConfig&&analyticsConfig.endpoint;
   if(!endpoint){
     E.analyticsWarning.classList.remove("hidden");
     updateAutoRefreshStatus("error");
     return;
   }

   var sep=endpoint.indexOf("?")>=0?"&":"?";
   var url=endpoint+sep+"mode=dashboard&range=7d&date="+encodeURIComponent(selectedDate)+"&_="+Date.now();
   var r=await fetch(url,{cache:"no-store"});
   if(!r.ok){
     var body="";
     try{body=await r.text()}catch(_){}
     throw new Error("analytics "+r.status+" "+body);
   }

   var data=await r.json();
   renderAnalytics(data);
   if(selectedDate!==brazilDate())E.metricOnline.textContent="—";
   E.analyticsWarning.classList.add("hidden");
   lastDashboardRefreshAt=Date.now();
   updateAutoRefreshStatus("ok");
 }catch(err){
   console.error("analytics edge",err);
   E.analyticsWarning.classList.remove("hidden");
   E.analyticsWarning.querySelector("strong").textContent="Não consegui carregar as estatísticas";
   E.analyticsWarning.querySelector("span").textContent="Os dados continuam salvos no Supabase. O painel tentará novamente automaticamente.";
   updateAutoRefreshStatus("error");
 }finally{
   dashboardRefreshBusy=false;
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
var titles={"dashboard":["PAINEL","Visão geral"],"new-song":["CONTEÚDO","Nova música"],"catalog":["BIBLIOTECA","Catálogo"],"midi-lab":["LABORATÓRIO","MIDI automático"],"settings":["SISTEMA","Configurações"]};
function switchView(name){
 document.querySelectorAll(".nav-item").forEach(function(b){b.classList.toggle("active",b.dataset.view===name)});document.querySelectorAll("[data-view-panel]").forEach(function(v){v.classList.toggle("active",v.dataset.viewPanel===name)});
 var t=titles[name]||titles.dashboard;E.sectionEyebrow.textContent=t[0];E.sectionTitle.textContent=t[1];document.querySelector(".sidebar").classList.remove("open");if(name==="dashboard")refreshDashboard();if(name==="midi-lab")loadLatestMidiResult(true)
}
document.querySelectorAll(".nav-item").forEach(function(b){b.addEventListener("click",function(){switchView(b.dataset.view)})});
document.querySelectorAll("[data-view-jump]").forEach(function(b){b.addEventListener("click",function(){switchView(b.dataset.viewJump)})});
E.menuBtn.addEventListener("click",function(){document.querySelector(".sidebar").classList.toggle("open")});
E.themeDayBtn.addEventListener("click",function(){applyAdminTheme("day")});
E.themeNightBtn.addEventListener("click",function(){applyAdminTheme("night")});
E.connectForm.addEventListener("submit",async function(ev){ev.preventDefault();var btn=ev.submitter;if(btn)btn.disabled=true;try{await connect(E.tokenInput.value);E.tokenInput.value=""}catch(err){toast(err.status===401?"Token inválido ou expirado.":err.status===403?"O token não tem acesso suficiente ao Dailysonh.":"Não consegui conectar ao GitHub. A key salva não foi apagada.")}finally{if(btn)btn.disabled=false}});
E.disconnectBtn.addEventListener("click",function(){
 stopDashboardAutoRefresh();
 clearToken();
 document.body.classList.add("auth-locked");
 E.panel.classList.add("hidden");
 E.loginView.classList.remove("hidden");
 E.connectionLabel.textContent="Desconectado";
 E.githubUser.textContent="—";
 E.tokenInput.value="";
 toast("Você saiu do painel.");
});
E.previewCloseBtn.addEventListener("click",closePreview);
E.previewDialog.addEventListener("cancel",function(ev){ev.preventDefault();closePreview()});
E.previewDialog.addEventListener("click",function(ev){if(ev.target===E.previewDialog)closePreview()});
E.previewAudio.addEventListener("error",function(){E.previewStatus.textContent="Não consegui carregar esta faixa.";});
E.previewAudio.addEventListener("ended",function(){E.previewStatus.textContent="Fim da faixa "+(previewTrackIndex+1)+".";});

E.midiFile.addEventListener("change",function(){var f=E.midiFile.files&&E.midiFile.files[0];E.midiFileLabel.textContent=f?f.name:"Escolher arquivo MIDI"});
E.midiRevealFile.addEventListener("change",function(){var f=E.midiRevealFile.files&&E.midiRevealFile.files[0];E.midiRevealFileLabel.textContent=f?f.name:"Áudio original para revelação"});
["dragenter","dragover"].forEach(function(n){E.midiUploadZone.addEventListener(n,function(ev){ev.preventDefault();E.midiUploadZone.classList.add("drag")});E.midiRevealUploadZone.addEventListener(n,function(ev){ev.preventDefault();E.midiRevealUploadZone.classList.add("drag")})});
["dragleave","drop"].forEach(function(n){E.midiUploadZone.addEventListener(n,function(){E.midiUploadZone.classList.remove("drag")});E.midiRevealUploadZone.addEventListener(n,function(){E.midiRevealUploadZone.classList.remove("drag")})});
E.midiRefreshBtn.addEventListener("click",function(){loadLatestMidiResult(false)});
E.midiEditNamesBtn.addEventListener("click",openMidiNameEditor);
E.midiCancelNamesBtn.addEventListener("click",closeMidiNameEditor);
E.midiSaveNamesBtn.addEventListener("click",saveMidiNames);
E.midiForm.addEventListener("submit",async function(ev){
 ev.preventDefault();
 var file=E.midiFile.files&&E.midiFile.files[0],revealFile=E.midiRevealFile.files&&E.midiRevealFile.files[0];
 if(!file){toast("Escolha um arquivo MIDI.");return}
 if(!/\.(mid|midi)$/i.test(file.name)){toast("Envie um arquivo .mid ou .midi.");return}
 if(!revealFile){toast("Escolha também o áudio original para a revelação.");return}
 if(revealFile.size>MAX_FILE_MB*1024*1024){toast("O áudio original passa de "+MAX_FILE_MB+" MB.");return}
 E.midiRunBtn.disabled=true;E.midiRerenderBtn.disabled=true;E.midiWorkflowLink.classList.add("hidden");
 try{
   var stamp=Date.now(),path="midi-incoming/"+stamp+"-"+sanitizeFilename(file.name),revealPath="midi-reveal-incoming/"+stamp+"-"+sanitizeFilename(revealFile.name);
   setMidiJob(10,"Enviando MIDI","Preparando a análise automática.");await uploadAudio(file,path);
   setMidiJob(20,"Enviando áudio original","A revelação usará o mesmo trecho de 18 segundos.");await uploadAudio(revealFile,revealPath);
   setMidiJob(30,"Arquivos enviados","Iniciando análise automática.");await startMidiRequest(path,revealPath);
   E.midiForm.reset();E.midiFileLabel.textContent="Escolher arquivo MIDI";E.midiRevealFileLabel.textContent="Áudio original para revelação";
 }catch(err){
   console.error("midi lab",err);setMidiJob(100,"Não foi possível concluir",err&&err.status===403?"A key precisa de Contents em leitura e escrita.":"Confira a execução do laboratório MIDI.");toast("O laboratório MIDI encontrou um erro.")
 }finally{E.midiRunBtn.disabled=false;E.midiRerenderBtn.disabled=false}
});
E.midiPublishBtn.addEventListener("click",async function(){
 if(!latestMidiManifest){toast("Gere e aprove um MIDI primeiro.");return}
 var values={
   title:E.midiPublishTitle.value.trim(),
   artist:E.midiPublishArtist.value.trim(),
   date:E.midiPublishDate.value,
   releaseYear:E.midiPublishYear.value.trim(),
   difficulty:E.midiPublishDifficulty.value,
   youtubeViews:E.midiPublishYoutubeViews.value.trim(),
   youtubeUrl:E.midiPublishYoutubeUrl.value.trim(),
   coverUrl:E.midiPublishCoverUrl.value.trim(),
   spotifyUrl:E.midiPublishSpotifyUrl.value.trim(),
   appleMusicUrl:E.midiPublishAppleMusicUrl.value.trim(),
   deezerUrl:E.midiPublishDeezerUrl.value.trim(),
   roundLabels:currentMidiRoundLabels()
 };
 if(!values.title||!values.artist||!values.date){toast("Preencha título, artista e data.");return}
 var existing=(catalog.songs||[]).find(function(song){return String(song.date||"")===values.date});
 var question=existing
   ?"Já existe uma música em "+prettyDate(values.date)+". Publicar o MIDI vai substituir essa data e criar uma nova versão. Continuar?"
   :"Publicar "+values.title+" — "+values.artist+" em "+prettyDate(values.date)+"?";
 if(!window.confirm(question))return;
 E.midiPublishBtn.disabled=true;
 E.midiPublishStatus.textContent="Solicitando publicação...";
 try{
   var started=Date.now();
   await dispatchMidiPublish(values);
   var run=await waitMidiPublishRun(started);
   if(!run){E.midiPublishStatus.textContent="Publicação enviada. Confira novamente em instantes.";toast("Publicação enviada.");return}
   await monitorMidiPublish(run)
 }catch(err){
   console.error("publish midi",err);
   E.midiPublishStatus.textContent="Não consegui publicar.";
   toast("Falha ao publicar a música MIDI.")
 }finally{E.midiPublishBtn.disabled=false}
});
E.midiRerenderBtn.addEventListener("click",async function(){
 if(!latestMidiManifest||!latestMidiManifest.sourcePath){toast("Ainda não há MIDI para regenerar.");return}
 E.midiRunBtn.disabled=true;E.midiRerenderBtn.disabled=true;E.midiWorkflowLink.classList.add("hidden");
 try{setMidiJob(25,"Regenerando","Reutilizando o mesmo MIDI e o trecho já escolhido.");if(!E.midiClipStart.value.trim())E.midiClipStart.value=String(latestMidiManifest.clipStart||"");await startMidiRequest(latestMidiManifest.sourcePath,latestMidiManifest.revealSourcePath||"")}catch(err){console.error("midi rerender",err);setMidiJob(100,"Não foi possível regenerar","Confira a execução do laboratório MIDI.");toast("Falha ao trocar o timbre.")}finally{E.midiRunBtn.disabled=false;E.midiRerenderBtn.disabled=false}
});
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
document.addEventListener("visibilitychange",function(){
 if(!document.hidden&&dashboardIsVisible())refreshDashboard();
});
window.addEventListener("focus",function(){
 if(dashboardIsVisible()&&Date.now()-lastDashboardRefreshAt>3000)refreshDashboard();
});
E.dashboardDate.addEventListener("change",function(){setDashboardDate(E.dashboardDate.value)});
E.prevDateBtn.addEventListener("click",function(){setDashboardDate(addDays(selectedDate||brazilDate(),-1))});
E.nextDateBtn.addEventListener("click",function(){setDashboardDate(addDays(selectedDate||brazilDate(),1))});
E.todayDateBtn.addEventListener("click",function(){setDashboardDate(brazilDate())});

async function boot(){
 loadAdminTheme();
 setDefaultDate();selectedDate=brazilDate();updateDateFilterUi();if(E.midiPublishDate&&!E.midiPublishDate.value)E.midiPublishDate.value=brazilDate();
 var st=storedToken();
 if(!st)return;

 token=st;
 await openPanel();

 validate().catch(function(err){
   console.warn("Validação em segundo plano falhou",err);
   if(err&&err.status===401){
     E.connectionLabel.textContent="Key expirada";
   }
 });
}
loadAdminTheme();
boot();
})();