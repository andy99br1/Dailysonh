(function(){
"use strict";

var BRANCH="main";
var GITHUB_PROXY="https://kxoxlgiktwumooixedgu.supabase.co/functions/v1/musicadodia-github";
var WORKFLOW="stem-flute-lab.yml";
var MAX_FILE_MB=45;
var directUploadBase="";
var token="";
var toastTimer=null;
var latestManifest=null;
var selectedLayerIds=[];
var customPreviewAudios=[];
var LAYER_OPTIONS=[
  {id:"drums",label:"Bateria",detail:"Base rítmica",defaultOn:true},
  {id:"bass",label:"Baixo",detail:"Adiciona o baixo",defaultOn:true},
  {id:"instruments",label:"Instrumentos completos",detail:"Guitarra + piano + outros juntos",defaultOn:true,group:"instruments"},
  {id:"guitar",label:"Guitarra / violão",detail:"Camada separada e encorpada",defaultOn:false,group:"split"},
  {id:"piano",label:"Piano / teclas",detail:"Camada separada e encorpada",defaultOn:false,group:"split"},
  {id:"other",label:"Outros instrumentos",detail:"Demais instrumentos detectados",defaultOn:false,group:"split"},
  {id:"flute",label:"Melodia / flauta",detail:"Melodia extraída da voz",defaultOn:true}
];

function $(id){return document.getElementById(id)}
var E={
  labAuth:$("labAuth"),labPanel:$("labPanel"),connectionLabel:$("connectionLabel"),
  themeDayBtn:$("themeDayBtn"),themeNightBtn:$("themeNightBtn"),adminThemeColor:$("adminThemeColor"),
  labForm:$("labForm"),labAudioFile:$("labAudioFile"),labUploadZone:$("labUploadZone"),labFileLabel:$("labFileLabel"),labClipStartInput:$("labClipStartInput"),labRunBtn:$("labRunBtn"),
  labJobBox:$("labJobBox"),labJobTitle:$("labJobTitle"),labJobPercent:$("labJobPercent"),labJobProgress:$("labJobProgress"),labJobMessage:$("labJobMessage"),labWorkflowLink:$("labWorkflowLink"),
  labResultsCard:$("labResultsCard"),labResultTitle:$("labResultTitle"),labResultMeta:$("labResultMeta"),labRefreshBtn:$("labRefreshBtn"),
  labClipStart:$("labClipStart"),labModel:$("labModel"),labVoiced:$("labVoiced"),stemTrackList:$("stemTrackList"),labAudio:$("labAudio"),labNowLabel:$("labNowLabel"),labAudioStatus:$("labAudioStatus"),
  gamePreviewSection:$("gamePreviewSection"),gameRoundList:$("gameRoundList"),gameAudio:$("gameAudio"),gameNowLabel:$("gameNowLabel"),gameRoundLabel:$("gameRoundLabel"),
  roundBuilder:$("roundBuilder"),roundBuilderCount:$("roundBuilderCount"),roundLayerList:$("roundLayerList"),customRoundList:$("customRoundList"),customPreviewTitle:$("customPreviewTitle"),customPreviewStatus:$("customPreviewStatus"),customStopBtn:$("customStopBtn"),
  stemPublishBox:$("stemPublishBox"),stemPublishTitle:$("stemPublishTitle"),stemPublishArtist:$("stemPublishArtist"),stemPublishDate:$("stemPublishDate"),stemPublishYear:$("stemPublishYear"),stemPublishDifficulty:$("stemPublishDifficulty"),stemPublishYoutubeViews:$("stemPublishYoutubeViews"),stemPublishYoutubeUrl:$("stemPublishYoutubeUrl"),stemPublishCoverUrl:$("stemPublishCoverUrl"),stemPublishSpotifyUrl:$("stemPublishSpotifyUrl"),stemPublishAppleMusicUrl:$("stemPublishAppleMusicUrl"),stemPublishDeezerUrl:$("stemPublishDeezerUrl"),stemPublishBtn:$("stemPublishBtn"),stemPublishStatus:$("stemPublishStatus"),
  menuBtn:$("menuBtn"),toast:$("toast")
};

function getCookie(name){
  var parts=document.cookie?document.cookie.split("; "):[];
  for(var i=0;i<parts.length;i++){
    var p=parts[i].split("=");
    if(p.shift()===name)return decodeURIComponent(p.join("="));
  }
  return "";
}
function storedToken(){
  return localStorage.getItem("musicadodia:admin-token")||
    sessionStorage.getItem("musicadodia:admin-token")||
    getCookie("mdd_admin_token")||"";
}
function headers(extra){return Object.assign({"Content-Type":"application/json"},extra||{})}
async function api(path,options){
  options=options||{};
  var payload={path:path,method:String(options.method||"GET").toUpperCase()};
  if(options.body!==undefined)payload.body=options.body;
  var response=await fetch(GITHUB_PROXY,{
    method:"POST",
    headers:{"Content-Type":"application/json","X-Admin-Token":token},
    body:JSON.stringify(payload),
    cache:"no-store"
  });
  if(!response.ok){
    var body="";
    try{body=await response.text()}catch(_){}
    var err=new Error("Operação GitHub "+response.status);
    err.status=response.status;err.details=body;
    throw err;
  }
  if(response.status===204)return null;
  return response.json();
}
function toast(message){
  if(!E.toast)return;
  E.toast.textContent=message;
  E.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){E.toast.classList.add("hidden")},3200);
}
function applyTheme(theme){
  theme=theme==="day"?"day":"night";
  document.body.setAttribute("data-admin-theme",theme);
  localStorage.setItem("musicadodia:admin-theme",theme);
  if(E.themeDayBtn)E.themeDayBtn.classList.toggle("active",theme==="day");
  if(E.themeNightBtn)E.themeNightBtn.classList.toggle("active",theme==="night");
  if(E.adminThemeColor)E.adminThemeColor.setAttribute("content",theme==="day"?"#f3f6fb":"#0b1230");
}
function brazilDate(){
  var parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),out={};
  parts.forEach(function(item){if(item.type!=="literal")out[item.type]=item.value});
  return out.year+"-"+out.month+"-"+out.day;
}
function sanitizeFilename(name){
  var dot=name.lastIndexOf("."),ext=dot>=0?name.slice(dot).toLowerCase():"",stem=dot>=0?name.slice(0,dot):name;
  stem=stem.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^[-.]+|[-.]+$/g,"").slice(0,90);
  return(stem||"audio")+ext;
}
async function fileToBase64(file){
  var bytes=new Uint8Array(await file.arrayBuffer()),binary="",chunk=0x8000;
  for(var i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+chunk,bytes.length)));
  return btoa(binary);
}
async function validate(){
  var meta=await api("/meta");
  if(!meta||!meta.ok||!meta.uploadBase)throw new Error("Repositório não autorizado");
  directUploadBase=String(meta.uploadBase);
  E.connectionLabel.textContent="Conectado";
}
async function uploadAudio(file,path){
  if(!directUploadBase)await validate();
  var b64=await fileToBase64(file);
  var response=await fetch(directUploadBase+encodeURI(path),{
    method:"PUT",
    headers:{
      "Accept":"application/vnd.github+json",
      "Authorization":"Bearer "+token,
      "X-GitHub-Api-Version":"2022-11-28",
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      message:"Upload audio for isolated Stem + Flute Lab",
      content:b64,
      branch:BRANCH
    })
  });
  if(!response.ok){
    var details="";
    try{details=await response.text()}catch(_){}
    var err=new Error("Falha no upload "+response.status);
    err.status=response.status;err.details=details;
    throw err;
  }
  return response.status===204?null:response.json();
}
async function putRepoText(path,obj,message){
  var current=null;
  try{
    current=await api("/contents/"+encodeURI(path));
  }catch(err){
    if(!err||err.status!==404)throw err;
  }
  var json=JSON.stringify(obj,null,2)+"\n";
  var bytes=new TextEncoder().encode(json),binary="";
  for(var i=0;i<bytes.length;i+=0x8000){
    binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+0x8000,bytes.length)));
  }
  var body={message:message||"Update Stem + Flute Lab request",content:btoa(binary),branch:BRANCH};
  if(current&&current.sha)body.sha=current.sha;
  return api("/contents/"+encodeURI(path),{
    method:"PUT",
    headers:headers({"Content-Type":"application/json"}),
    body:JSON.stringify(body)
  });
}
async function requestLab(path,clipStart){
  var payload={
    sourcePath:path,
    nonce:String(Date.now())
  };
  if(clipStart!==""&&clipStart!==null&&clipStart!==undefined){
    var value=Number(clipStart);
    if(Number.isFinite(value)&&value>=0)payload.clipStart=value;
  }
  return putRepoText(".stem-flute-lab/request.json",payload,"Run isolated Stem + Flute Lab");
}

async function getRepoJson(path){
  var data=await api("/contents/"+encodeURI(path)+"?ref="+encodeURIComponent(BRANCH));
  var binary=atob(String(data.content||"").replace(/\n/g,""));
  var bytes=new Uint8Array(binary.length);
  for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function waitOfficialPublish(date,createdAt){
  var started=Date.now();
  while(Date.now()-started<600000){
    try{
      var catalog=await getRepoJson("catalog.json");
      var songs=Array.isArray(catalog.songs)?catalog.songs:[];
      var song=songs.find(function(item){return String(item.date||"")===String(date||"")});
      if(song&&song.source==="stem-flute"&&String(song.stemFluteCreatedAt||"")===String(createdAt||"")){
        return song;
      }
    }catch(_){}
    await new Promise(function(resolve){setTimeout(resolve,4000)});
  }
  return null;
}
async function waitRun(after){
  var started=Date.now();
  while(Date.now()-started<90000){
    var data=await api("/actions/workflows/"+WORKFLOW+"/runs?event=workflow_dispatch&branch="+BRANCH+"&per_page=10");
    var run=(data.workflow_runs||[]).find(function(item){
      return new Date(item.created_at).getTime()>=after-5000;
    });
    if(run)return run;
    await new Promise(function(resolve){setTimeout(resolve,3000)});
  }
  return null;
}
function setJob(percent,title,message){
  E.labJobBox.classList.remove("hidden");
  E.labJobPercent.textContent=percent+"%";
  E.labJobProgress.style.width=percent+"%";
  E.labJobTitle.textContent=title;
  E.labJobMessage.textContent=message||"";
}
async function fetchManifest(){
  var response=await fetch("/stem-flute-lab/manifest.json?_="+Date.now(),{cache:"no-store"});
  if(!response.ok)throw new Error("manifest "+response.status);
  return response.json();
}
async function waitPublishedResult(sourcePath){
  var started=Date.now();
  while(Date.now()-started<900000){
    try{
      var data=await fetchManifest();
      if(data&&String(data.sourcePath||"")===String(sourcePath||"")){
        renderResult(data);
        return data;
      }
    }catch(_){}
    await new Promise(function(resolve){setTimeout(resolve,4500)});
  }
  return null;
}
async function monitor(run,sourcePath){
  if(run&&run.html_url){
    E.labWorkflowLink.href=run.html_url;
    E.labWorkflowLink.classList.remove("hidden");
  }
  while(true){
    var latest=await api("/actions/runs/"+run.id);
    if(latest.html_url){
      E.labWorkflowLink.href=latest.html_url;
      E.labWorkflowLink.classList.remove("hidden");
    }
    if(latest.status==="queued"){
      setJob(42,"Na fila","Preparando o ambiente isolado.");
    }else if(latest.status==="in_progress"){
      setJob(72,"Processando áudio","Escolhendo os 18s, separando 6 stems e seguindo a voz com a flauta. Pode levar alguns minutos.");
    }else if(latest.status==="completed"){
      if(latest.conclusion!=="success"){
        setJob(100,"Falha no teste","Abra a execução do GitHub para ver a etapa que falhou.");
        throw new Error("workflow "+latest.conclusion);
      }
      setJob(92,"Áudios gerados","Aguardando o resultado aparecer no painel...");
      var result=await waitPublishedResult(sourcePath);
      if(result){
        setJob(100,"Teste pronto","Ouça o mix sem voz + flauta e compare as faixas abaixo.");
        toast("Stem + Flauta pronto.");
      }else{
        setJob(100,"Processamento concluído","O deploy ainda está terminando. Use Recarregar em alguns instantes.");
      }
      return;
    }
    await new Promise(function(resolve){setTimeout(resolve,5000)});
  }
}
function iconFor(id){
  return {preview:"★",flute:"♩",drums:"●",bass:"≈",instruments:"I",guitar:"⌁",piano:"♬",other:"+",vocals:"V",original:"O"}[id]||"♪";
}
function subtitleFor(id){
  return {
    preview:"Instrumental real + melodia de flauta",
    flute:"Pitch contínuo da voz; sem MIDI",
    drums:"Stem separado",
    bass:"Stem separado",
    instruments:"Guitarra + piano + outros recombinados para recuperar corpo",
    guitar:"Stem com reforço controlado de corpo",
    piano:"Stem com reforço controlado de corpo",
    other:"Stem separado",
    vocals:"Só para comparar a transformação",
    original:"Os mesmos 18 segundos"
  }[id]||"";
}
function selectTrack(track,button){
  E.stemTrackList.querySelectorAll(".stem-track").forEach(function(b){b.classList.remove("active")});
  if(button)button.classList.add("active");
  E.labAudio.pause();
  E.labAudio.src=track.url+"?_="+Date.now();
  E.labAudio.load();
  E.labNowLabel.textContent=track.label;
  E.labAudioStatus.textContent=subtitleFor(track.id);
}
function trackById(id){
  if(!latestManifest||!Array.isArray(latestManifest.tracks))return null;
  return latestManifest.tracks.find(function(track){return track.id===id})||null;
}

function stopCustomPreview(){
  customPreviewAudios.forEach(function(audio){
    try{audio.pause();audio.removeAttribute("src");audio.load()}catch(_){}
  });
  customPreviewAudios=[];
  if(E.customStopBtn)E.customStopBtn.classList.add("hidden");
  if(E.customRoundList){
    E.customRoundList.querySelectorAll(".custom-round-btn").forEach(function(btn){btn.classList.remove("active")});
  }
}

function selectedLayers(){
  return LAYER_OPTIONS.filter(function(item){return selectedLayerIds.indexOf(item.id)>=0});
}

function updateLayerSelection(id,checked){
  if(checked){
    if(selectedLayerIds.indexOf(id)<0)selectedLayerIds.push(id);
    if(id==="instruments"){
      selectedLayerIds=selectedLayerIds.filter(function(value){return ["guitar","piano","other"].indexOf(value)<0});
    }else if(["guitar","piano","other"].indexOf(id)>=0){
      selectedLayerIds=selectedLayerIds.filter(function(value){return value!=="instruments"});
    }
  }else{
    selectedLayerIds=selectedLayerIds.filter(function(value){return value!==id});
  }

  selectedLayerIds=LAYER_OPTIONS.map(function(item){return item.id}).filter(function(id2){
    return selectedLayerIds.indexOf(id2)>=0;
  });

  renderLayerBuilder(false);
}

function playCustomRound(layerIndex,button){
  stopCustomPreview();

  var chosen=selectedLayers();
  if(layerIndex>=chosen.length){
    var reveal=trackById("original");
    if(!reveal)return;
    var original=new Audio(reveal.url+"?_="+Date.now());
    customPreviewAudios=[original];
    if(button)button.classList.add("active");
    if(E.customPreviewTitle)E.customPreviewTitle.textContent="Revelação";
    if(E.customPreviewStatus)E.customPreviewStatus.textContent="Trecho original da música.";
    if(E.customStopBtn)E.customStopBtn.classList.remove("hidden");
    original.play().catch(function(){});
    return;
  }

  var layers=chosen.slice(0,layerIndex+1);
  var audios=[];
  layers.forEach(function(layer){
    var track=trackById(layer.id);
    if(track){
      var audio=new Audio(track.url+"?_="+Date.now());
      audio.preload="auto";
      audios.push(audio);
    }
  });

  if(!audios.length)return;
  customPreviewAudios=audios;
  if(button)button.classList.add("active");
  if(E.customPreviewTitle)E.customPreviewTitle.textContent="Faixa "+(layerIndex+1)+" · + "+chosen[layerIndex].label;
  if(E.customPreviewStatus)E.customPreviewStatus.textContent=layers.map(function(item){return item.label}).join(" + ");
  if(E.customStopBtn)E.customStopBtn.classList.remove("hidden");

  var start=function(){
    audios.forEach(function(audio){
      audio.currentTime=0;
      var p=audio.play();
      if(p&&typeof p.catch==="function")p.catch(function(){});
    });
  };
  Promise.all(audios.map(function(audio){
    if(audio.readyState>=2)return Promise.resolve();
    return new Promise(function(resolve){
      var done=function(){resolve()};
      audio.addEventListener("canplay",done,{once:true});
      audio.addEventListener("error",done,{once:true});
    });
  })).then(start);
}

function renderLayerBuilder(resetSelection){
  if(!E.roundBuilder||!E.roundLayerList||!latestManifest)return;
  E.roundBuilder.classList.remove("hidden");

  if(resetSelection){
    selectedLayerIds=LAYER_OPTIONS.filter(function(item){return item.defaultOn}).map(function(item){return item.id});
  }

  var chosen=selectedLayers();
  if(E.roundBuilderCount){
    E.roundBuilderCount.textContent=(chosen.length+1)+" faixas · "+chosen.length+" tentativa"+(chosen.length===1?"":"s");
  }

  E.roundLayerList.innerHTML="";
  LAYER_OPTIONS.forEach(function(item,index){
    var track=trackById(item.id);
    if(!track)return;

    var row=document.createElement("label");
    row.className="round-layer-item";

    var input=document.createElement("input");
    input.type="checkbox";
    input.checked=selectedLayerIds.indexOf(item.id)>=0;
    input.addEventListener("change",function(){updateLayerSelection(item.id,input.checked)});

    var order=document.createElement("b");
    var currentIndex=selectedLayerIds.indexOf(item.id);
    order.textContent=currentIndex>=0?String(currentIndex+1):"—";

    var copy=document.createElement("span");
    var strong=document.createElement("strong");strong.textContent=item.label;
    var small=document.createElement("small");small.textContent=item.detail;
    copy.append(strong,small);

    row.append(input,order,copy);
    E.roundLayerList.appendChild(row);
  });

  stopCustomPreview();
  E.customRoundList.innerHTML="";
  chosen.forEach(function(layer,index){
    var button=document.createElement("button");
    button.type="button";
    button.className="custom-round-btn";
    var num=document.createElement("b");num.textContent=String(index+1);
    var text=document.createElement("span");
    var strong=document.createElement("strong");strong.textContent="Faixa "+(index+1)+" · + "+layer.label;
    var small=document.createElement("small");
    small.textContent=chosen.slice(0,index+1).map(function(item){return item.label}).join(" + ");
    text.append(strong,small);
    button.append(num,text);
    button.addEventListener("click",function(){playCustomRound(index,button)});
    E.customRoundList.appendChild(button);
  });

  var revealBtn=document.createElement("button");
  revealBtn.type="button";
  revealBtn.className="custom-round-btn reveal";
  var revealNum=document.createElement("b");revealNum.textContent=String(chosen.length+1);
  var revealText=document.createElement("span");
  var revealStrong=document.createElement("strong");revealStrong.textContent="Revelação";
  var revealSmall=document.createElement("small");revealSmall.textContent="Trecho original";
  revealText.append(revealStrong,revealSmall);
  revealBtn.append(revealNum,revealText);
  revealBtn.addEventListener("click",function(){playCustomRound(chosen.length,revealBtn)});
  E.customRoundList.appendChild(revealBtn);

  if(E.stemPublishBtn)E.stemPublishBtn.disabled=chosen.length<1;
  if(E.stemPublishStatus&&chosen.length<1)E.stemPublishStatus.textContent="Selecione pelo menos uma camada antes de publicar.";
}

function selectGameRound(round,button){
  if(!round||!E.gameAudio)return;
  E.gameRoundList.querySelectorAll(".game-preview-round").forEach(function(node){node.classList.remove("active")});
  if(button)button.classList.add("active");
  E.gameAudio.pause();
  E.gameAudio.src=round.url+"?_="+Date.now();
  E.gameAudio.load();
  E.gameNowLabel.textContent=round.label||("Faixa "+round.index);
  E.gameRoundLabel.textContent="Faixa "+round.index+" de 5";
}

function renderGamePreview(rounds){
  if(!E.gamePreviewSection||!E.gameRoundList)return;
  if(!Array.isArray(rounds)||rounds.length!==5){
    E.gamePreviewSection.classList.add("hidden");
    return;
  }

  E.gamePreviewSection.classList.remove("hidden");
  E.gameRoundList.innerHTML="";

  rounds.forEach(function(round,index){
    var button=document.createElement("button");
    button.type="button";
    button.className="game-preview-round";

    var num=document.createElement("span");
    num.textContent=String(round.index||index+1);

    var label=document.createElement("strong");
    label.textContent=round.label||("Faixa "+(index+1));

    var detail=document.createElement("small");
    detail.textContent=[
      "Bateria",
      "Bateria + baixo",
      "Bateria + baixo + instrumentos",
      "Bateria + baixo + instrumentos + flauta",
      "Trecho original"
    ][index]||"";

    button.append(num,label,detail);
    button.addEventListener("click",function(){selectGameRound(round,button)});
    E.gameRoundList.appendChild(button);

    if(index===0)selectGameRound(round,button);
  });
}

function renderResult(data){
  if(!data||!Array.isArray(data.tracks))return;
  latestManifest=data;
  E.labResultsCard.classList.remove("hidden");
  E.labResultTitle.textContent=data.sourceName||"Último teste";
  var start=Number(data.clipStart||0);
  var selectionMode=data.selection&&data.selection.mode==="manual"?"manualmente":"automaticamente";
  E.labResultMeta.textContent="Trecho escolhido "+selectionMode+": "+start.toFixed(1)+"s–"+(start+Number(data.clipSeconds||18)).toFixed(1)+"s · voz transformada em flauta estabilizada, sem MIDI.";
  E.labClipStart.textContent=start.toFixed(1)+"s";
  E.labModel.textContent=data.separationModel||"htdemucs_6s";
  E.labVoiced.textContent=data.flute&&data.flute.voicedPercent!==undefined?Number(data.flute.voicedPercent).toFixed(1)+"%":"—";
  renderGamePreview(data.gameRounds);
  renderLayerBuilder(true);
  if(E.stemPublishBox){
    E.stemPublishBox.classList.toggle("hidden",!Array.isArray(data.gameRounds)||data.gameRounds.length!==5);
    if(E.stemPublishStatus)E.stemPublishStatus.textContent="O processamento de teste continua separado até você publicar.";
  }

  E.stemTrackList.innerHTML="";
  data.tracks.forEach(function(track,index){
    var button=document.createElement("button");
    button.type="button";
    button.className="stem-track";
    var icon=document.createElement("b");icon.textContent=iconFor(track.id);
    var text=document.createElement("span");
    var strong=document.createElement("strong");strong.textContent=track.label||track.id;
    var small=document.createElement("small");small.textContent=subtitleFor(track.id);
    text.append(strong,small);button.append(icon,text);
    button.addEventListener("click",function(){selectTrack(track,button)});
    E.stemTrackList.appendChild(button);
    if(index===0)selectTrack(track,button);
  });
}
async function loadLatest(showToast){
  try{
    var data=await fetchManifest();
    renderResult(data);
    if(showToast)toast("Resultado recarregado.");
  }catch(err){
    if(showToast)toast("Ainda não existe um resultado deste laboratório.");
  }
}
async function init(){
  applyTheme(localStorage.getItem("musicadodia:admin-theme")==="day"?"day":"night");
  if(E.stemPublishDate&&!E.stemPublishDate.value)E.stemPublishDate.value=brazilDate();
  token=storedToken();
  if(!token){
    E.connectionLabel.textContent="Desconectado";
    E.labAuth.classList.remove("hidden");
    E.labPanel.classList.add("hidden");
    return;
  }
  try{
    await validate();
    E.labAuth.classList.add("hidden");
    E.labPanel.classList.remove("hidden");
    loadLatest(false);
  }catch(err){
    E.connectionLabel.textContent="Sessão inválida";
    E.labAuth.classList.remove("hidden");
    E.labPanel.classList.add("hidden");
  }
}

E.themeDayBtn.addEventListener("click",function(){applyTheme("day")});
E.themeNightBtn.addEventListener("click",function(){applyTheme("night")});
if(E.menuBtn)E.menuBtn.addEventListener("click",function(){document.querySelector(".sidebar").classList.toggle("open")});
E.labAudioFile.addEventListener("change",function(){
  var file=E.labAudioFile.files&&E.labAudioFile.files[0];
  E.labFileLabel.textContent=file?file.name:"Escolher MP3 ou áudio";
});
["dragenter","dragover"].forEach(function(name){
  E.labUploadZone.addEventListener(name,function(ev){ev.preventDefault();E.labUploadZone.classList.add("drag")});
});
["dragleave","drop"].forEach(function(name){
  E.labUploadZone.addEventListener(name,function(){E.labUploadZone.classList.remove("drag")});
});
E.labRefreshBtn.addEventListener("click",function(){loadLatest(true)});
if(E.customStopBtn)E.customStopBtn.addEventListener("click",stopCustomPreview);
E.labForm.addEventListener("submit",async function(ev){
  ev.preventDefault();
  var file=E.labAudioFile.files&&E.labAudioFile.files[0];
  if(!file){toast("Escolha o MP3 ou áudio.");return}
  if(file.size>MAX_FILE_MB*1024*1024){toast("O áudio passa de "+MAX_FILE_MB+" MB.");return}

  E.labRunBtn.disabled=true;
  E.labWorkflowLink.classList.add("hidden");
  try{
    var stamp=Date.now();
    var path="stem-flute-incoming/"+stamp+"-"+sanitizeFilename(file.name);
    setJob(8,"Enviando música","Salvando o arquivo no ambiente de teste.");
    await uploadAudio(file,path);
    setJob(24,"Upload concluído","Criando o pedido do laboratório.");
    var requestedStart=E.labClipStartInput?E.labClipStartInput.value:"";
    await requestLab(path,requestedStart);
    setJob(38,"Teste iniciado",requestedStart!==""?"Processando os 18s a partir de "+Number(requestedStart).toFixed(1)+"s. Pode levar alguns minutos.":"O GitHub está escolhendo os 18s, separando os stems e criando a flauta. Pode levar alguns minutos.");
    var result=await waitPublishedResult(path);
    if(result){
      setJob(100,"Teste pronto","Ouça o mix sem voz + flauta e compare as faixas abaixo.");
      toast("Stem + Flauta pronto.");
    }else{
      setJob(100,"Ainda processando","O GitHub pode estar terminando. Use Recarregar em alguns instantes.");
    }
    E.labForm.reset();
    E.labFileLabel.textContent="Escolher MP3 ou áudio";
  }catch(err){
    console.error("stem flute lab",err);
    setJob(100,"Não foi possível concluir",err&&err.status===403?"O token do painel precisa de permissão de Contents em leitura e escrita.":"Confira o upload e tente novamente.");
    toast("O teste encontrou um erro.");
  }finally{
    E.labRunBtn.disabled=false;
  }
});


if(E.stemPublishBtn)E.stemPublishBtn.addEventListener("click",async function(){
  if(!latestManifest||!Array.isArray(latestManifest.gameRounds)||latestManifest.gameRounds.length!==5){
    toast("Gere primeiro um resultado completo com 5 faixas.");
    return;
  }

  var title=String(E.stemPublishTitle.value||"").trim();
  var artist=String(E.stemPublishArtist.value||"").trim();
  var date=String(E.stemPublishDate.value||"").trim();

  if(!title||!artist||!date){
    toast("Preencha título, artista e data.");
    return;
  }

  try{
    var currentCatalog=await getRepoJson("catalog.json");
    var occupied=(currentCatalog.songs||[]).find(function(item){return String(item.date||"")===date});
    if(occupied){
      var ok=window.confirm(
        'Já existe "'+(occupied.title||"uma música")+'" em '+date+'.\n\nPublicar este resultado vai substituir o desafio dessa data. Continuar?'
      );
      if(!ok)return;
    }
  }catch(_){}

  E.stemPublishBtn.disabled=true;
  E.stemPublishStatus.textContent="Enviando pedido de publicação...";

  var chosenLayers=selectedLayers();
  if(!chosenLayers.length){
    toast("Selecione pelo menos uma camada.");
    return;
  }

  var payload={
    title:title,
    artist:artist,
    date:date,
    releaseYear:String(E.stemPublishYear.value||"").trim(),
    difficulty:String(E.stemPublishDifficulty.value||"").trim(),
    youtubeViews:String(E.stemPublishYoutubeViews.value||"").trim(),
    youtubeUrl:String(E.stemPublishYoutubeUrl.value||"").trim(),
    coverUrl:String(E.stemPublishCoverUrl.value||"").trim(),
    spotifyUrl:String(E.stemPublishSpotifyUrl.value||"").trim(),
    appleMusicUrl:String(E.stemPublishAppleMusicUrl.value||"").trim(),
    deezerUrl:String(E.stemPublishDeezerUrl.value||"").trim(),
    expectedCreatedAt:String(latestManifest.createdAt||""),
    selectedLayers:chosenLayers.map(function(item){return item.id}),
    selectedLayerLabels:chosenLayers.map(function(item){return item.label}),
    nonce:String(Date.now())
  };

  try{
    await putRepoText(".stem-flute-lab/publish.json",payload,"Publish Stem + Flute song");
    E.stemPublishStatus.textContent="Publicando as 5 faixas no catálogo oficial...";
    var published=await waitOfficialPublish(date,payload.expectedCreatedAt);
    if(published){
      E.stemPublishStatus.textContent="Publicado no catálogo oficial. O site será atualizado automaticamente.";
      toast("Música publicada no jogo oficial.");
    }else{
      E.stemPublishStatus.textContent="Pedido enviado. A publicação ainda está terminando no GitHub.";
      toast("Publicação iniciada.");
    }
  }catch(err){
    console.error("stem flute publish",err);
    E.stemPublishStatus.textContent=err&&err.status===403?"O token precisa de Contents em leitura e escrita.":"Não foi possível publicar. Confira o GitHub e tente novamente.";
    toast("Falha ao publicar.");
  }finally{
    E.stemPublishBtn.disabled=false;
  }
});

init();
})();