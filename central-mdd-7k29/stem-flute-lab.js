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

function $(id){return document.getElementById(id)}
var E={
  labAuth:$("labAuth"),labPanel:$("labPanel"),connectionLabel:$("connectionLabel"),
  themeDayBtn:$("themeDayBtn"),themeNightBtn:$("themeNightBtn"),adminThemeColor:$("adminThemeColor"),
  labForm:$("labForm"),labAudioFile:$("labAudioFile"),labUploadZone:$("labUploadZone"),labFileLabel:$("labFileLabel"),labRunBtn:$("labRunBtn"),
  labJobBox:$("labJobBox"),labJobTitle:$("labJobTitle"),labJobPercent:$("labJobPercent"),labJobProgress:$("labJobProgress"),labJobMessage:$("labJobMessage"),labWorkflowLink:$("labWorkflowLink"),
  labResultsCard:$("labResultsCard"),labResultTitle:$("labResultTitle"),labResultMeta:$("labResultMeta"),labRefreshBtn:$("labRefreshBtn"),
  labClipStart:$("labClipStart"),labModel:$("labModel"),labVoiced:$("labVoiced"),stemTrackList:$("stemTrackList"),labAudio:$("labAudio"),labNowLabel:$("labNowLabel"),labAudioStatus:$("labAudioStatus"),
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
async function requestLab(path){
  return putRepoText(".stem-flute-lab/request.json",{
    sourcePath:path,
    nonce:String(Date.now())
  },"Run isolated Stem + Flute Lab");
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
  return {preview:"★",flute:"♩",drums:"●",bass:"≈",guitar:"⌁",piano:"♬",other:"+",vocals:"V",original:"O"}[id]||"♪";
}
function subtitleFor(id){
  return {
    preview:"Instrumental real + melodia de flauta",
    flute:"Pitch contínuo da voz; sem MIDI",
    drums:"Stem separado",
    bass:"Stem separado",
    guitar:"Stem separado",
    piano:"Stem separado",
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
function renderResult(data){
  if(!data||!Array.isArray(data.tracks))return;
  latestManifest=data;
  E.labResultsCard.classList.remove("hidden");
  E.labResultTitle.textContent=data.sourceName||"Último teste";
  var start=Number(data.clipStart||0);
  E.labResultMeta.textContent="Trecho escolhido automaticamente: "+start.toFixed(1)+"s–"+(start+Number(data.clipSeconds||18)).toFixed(1)+"s · voz transformada por pitch contínuo, sem MIDI.";
  E.labClipStart.textContent=start.toFixed(1)+"s";
  E.labModel.textContent=data.separationModel||"htdemucs_6s";
  E.labVoiced.textContent=data.flute&&data.flute.voicedPercent!==undefined?Number(data.flute.voicedPercent).toFixed(1)+"%":"—";

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
    await requestLab(path);
    setJob(38,"Teste iniciado","O GitHub está escolhendo os 18s, separando os stems e criando a flauta. Pode levar alguns minutos.");
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

init();
})();