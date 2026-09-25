(function(){
"use strict";

function el(id){return document.getElementById(id)}
var E={
  themeToggle:el("themeToggle"),themeMenu:el("themeMenu"),themeColor:el("themeColor"),
  themeOptions:Array.prototype.slice.call(document.querySelectorAll("[data-theme-choice]")),
  dayChip:el("dayChip"),challengeNumber:el("challengeNumber"),termDate:el("termDate"),attemptLabel:el("attemptLabel"),
  board:el("termBoard"),keyboard:el("termKeyboard"),message:el("termMessage"),
  result:el("termResult"),resultStatus:el("termResultStatus"),answer:el("termAnswer"),
  share:el("termShareBtn"),resetPreview:el("termResetPreviewBtn"),
  statPlayed:el("statPlayed"),statWinRate:el("statWinRate"),statStreak:el("statStreak"),statBest:el("statBest")
};

var challenge=null,catalogIndex=-1,row=0,current="",guesses=[],evaluations=[],finished=false,won=false;
var keyStates={};
var allowedThemes=["creme","azul","verde","rosa","lilas","noite"];
var previewDate="",adminPreview=false;

try{
  var params=new URLSearchParams(location.search);
  previewDate=String(params.get("previewDate")||"").trim();
  var adminToken=localStorage.getItem("musicadodia:admin-token")||sessionStorage.getItem("musicadodia:admin-token")||"";
  adminPreview=params.get("adminPreview")==="1"&&/^\d{4}-\d{2}-\d{2}$/.test(previewDate)&&Boolean(adminToken);
}catch(_){}

function normalizeWord(value){
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z]/g,"").toUpperCase();
}
function brazilDate(){
  var parts=new Intl.DateTimeFormat("en",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),o={};
  parts.forEach(function(p){if(p.type!=="literal")o[p.type]=p.value});
  return o.year+"-"+o.month+"-"+o.day;
}
function prettyDate(value){
  var p=String(value||"").split("-").map(Number);
  if(p.length!==3)return value||"—";
  return new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(p[0],p[1]-1,p[2])));
}
function applyTheme(theme){
  if(allowedThemes.indexOf(theme)<0)theme="noite";
  document.body.setAttribute("data-theme",theme);
  E.themeOptions.forEach(function(btn){btn.classList.toggle("active",btn.getAttribute("data-theme-choice")===theme)});
  var colors={creme:"#f5efe4",azul:"#eef5fb",verde:"#eef4ec",rosa:"#fbf0f2",lilas:"#f3effa",noite:"#071632"};
  E.themeColor.setAttribute("content",colors[theme]||colors.noite);
}
function loadTheme(){
  var saved=localStorage.getItem("musicadodia:theme");
  if(saved==="dark")saved="noite";if(saved==="light")saved="creme";
  applyTheme(allowedThemes.indexOf(saved)>=0?saved:"noite");
}
function chooseTheme(theme){localStorage.setItem("musicadodia:theme",theme);applyTheme(theme);E.themeMenu.classList.add("hidden")}
function stateKey(){return challenge?"musicadodia:termo:"+challenge.date+":v"+(challenge.version||1):""}
function statsKey(){return "musicadodia:termo:stats"}

function buildBoard(){
  E.board.innerHTML="";
  for(var r=0;r<6;r++){
    var rowEl=document.createElement("div");rowEl.className="termo-row";rowEl.dataset.row=String(r);
    for(var c=0;c<5;c++){var cell=document.createElement("div");cell.className="termo-cell";cell.dataset.col=String(c);rowEl.appendChild(cell)}
    E.board.appendChild(rowEl);
  }
}
function buildKeyboard(){
  E.keyboard.innerHTML="";
  ["QWERTYUIOP","ASDFGHJKL","ZXCVBNM"].forEach(function(chars,index){
    var line=document.createElement("div");line.className="termo-key-row";
    if(index===2){
      var enter=makeKey("ENTER","ENTER");enter.classList.add("wide");line.appendChild(enter);
    }
    chars.split("").forEach(function(ch){line.appendChild(makeKey(ch,ch))});
    if(index===2){
      var del=makeKey("⌫","BACKSPACE");del.classList.add("wide");line.appendChild(del);
    }
    E.keyboard.appendChild(line);
  });
}
function makeKey(label,value){
  var b=document.createElement("button");b.type="button";b.className="termo-key";b.textContent=label;b.dataset.key=value;
  b.addEventListener("click",function(){handleKey(value)});return b;
}
function cellsFor(r){return Array.prototype.slice.call(E.board.querySelectorAll('.termo-row[data-row="'+r+'"] .termo-cell'))}
function renderCurrent(){
  var cells=cellsFor(row);
  cells.forEach(function(cell,i){
    cell.textContent=current[i]||"";
    cell.classList.toggle("filled",Boolean(current[i]));
  });
}
function priority(state){return state==="correct"?3:state==="present"?2:state==="absent"?1:0}
function updateKey(letter,state){
  if(priority(state)<=priority(keyStates[letter]))return;
  keyStates[letter]=state;
  var btn=E.keyboard.querySelector('[data-key="'+letter+'"]');
  if(btn){btn.classList.remove("correct","present","absent");btn.classList.add(state)}
}
function evaluateGuess(guess,answer){
  var result=["absent","absent","absent","absent","absent"],counts={};
  for(var i=0;i<5;i++)if(guess[i]!==answer[i])counts[answer[i]]=(counts[answer[i]]||0)+1;
  for(var j=0;j<5;j++)if(guess[j]===answer[j])result[j]="correct";
  for(var k=0;k<5;k++){
    if(result[k]==="correct")continue;
    var ch=guess[k];
    if((counts[ch]||0)>0){result[k]="present";counts[ch]-=1}
  }
  return result;
}
function shake(){
  var r=E.board.querySelector('.termo-row[data-row="'+row+'"]');if(!r)return;
  r.classList.remove("shake");void r.offsetWidth;r.classList.add("shake");
}
function setMessage(text,type){
  E.message.textContent=text||"";
  E.message.className="termo-message"+(type?" "+type:"");
}
function save(){
  if(adminPreview||!challenge)return;
  localStorage.setItem(stateKey(),JSON.stringify({row:row,current:current,guesses:guesses,evaluations:evaluations,finished:finished,won:won,keyStates:keyStates}));
}
function load(){
  if(adminPreview||!challenge)return;
  try{
    var raw=localStorage.getItem(stateKey());if(!raw)return;
    var s=JSON.parse(raw);
    row=Math.max(0,Math.min(6,Number(s.row)||0));current=String(s.current||"").slice(0,5);
    guesses=Array.isArray(s.guesses)?s.guesses.slice(0,6):[];
    evaluations=Array.isArray(s.evaluations)?s.evaluations.slice(0,6):[];
    finished=Boolean(s.finished);won=Boolean(s.won);keyStates=s.keyStates&&typeof s.keyStates==="object"?s.keyStates:{};
  }catch(_){}
}
function renderSaved(){
  for(var r=0;r<guesses.length;r++){
    var cells=cellsFor(r),g=guesses[r],ev=evaluations[r]||[];
    cells.forEach(function(cell,i){cell.textContent=g[i]||"";cell.classList.add(ev[i]||"absent")});
  }
  if(!finished&&row<6)renderCurrent();
  Object.keys(keyStates).forEach(function(letter){updateKey(letter,keyStates[letter])});
  updateAttemptLabel();
}
function updateAttemptLabel(){
  E.attemptLabel.textContent=finished?(won?"Concluído":"Fim"):(Math.min(row+1,6)+" de 6");
}
function updateStats(win){
  if(adminPreview)return;
  var stats={played:0,wins:0,streak:0,best:0,lastDate:""};
  try{stats=Object.assign(stats,JSON.parse(localStorage.getItem(statsKey())||"{}"))}catch(_){}
  if(stats.lastDate===challenge.date)return;
  stats.played+=1;if(win){stats.wins+=1;stats.streak+=1;stats.best=Math.max(stats.best,stats.streak)}else{stats.streak=0}
  stats.lastDate=challenge.date;localStorage.setItem(statsKey(),JSON.stringify(stats));
}
function readStats(){
  var stats={played:0,wins:0,streak:0,best:0};
  try{stats=Object.assign(stats,JSON.parse(localStorage.getItem(statsKey())||"{}"))}catch(_){}
  E.statPlayed.textContent=String(stats.played||0);
  E.statWinRate.textContent=stats.played?Math.round((stats.wins||0)/stats.played*100)+"%":"0%";
  E.statStreak.textContent=String(stats.streak||0);E.statBest.textContent=String(stats.best||0);
}
function finish(win){
  finished=true;won=Boolean(win);current="";updateStats(won);save();updateAttemptLabel();
  E.result.classList.remove("hidden");
  E.resultStatus.textContent=won?"Acertou!":"Não foi dessa vez";
  E.resultStatus.className=won?"result-status success":"result-status fail";
  E.answer.textContent=String(challenge.word||"").toUpperCase();
  readStats();
  if(adminPreview)E.resetPreview.classList.remove("hidden");
  setMessage(won?"Boa! Palavra descoberta.":"Amanhã tem uma nova palavra.",won?"success":"");
}
function submit(){
  if(finished)return;
  if(current.length!==5){setMessage("A palavra precisa ter 5 letras.","error");shake();return}
  var answer=normalizeWord(challenge.word);
  var guess=current,result=evaluateGuess(guess,answer),cells=cellsFor(row);
  cells.forEach(function(cell,i){cell.classList.remove("filled");cell.classList.add(result[i]);updateKey(guess[i],result[i])});
  guesses.push(guess);evaluations.push(result);current="";
  if(guess===answer){row+=1;finish(true);return}
  row+=1;if(row>=6){finish(false);return}
  updateAttemptLabel();setMessage("Tente outra palavra.");save();renderCurrent();
}
function handleKey(key){
  if(!challenge||finished)return;
  if(key==="ENTER"){submit();return}
  if(key==="BACKSPACE"){if(current.length){current=current.slice(0,-1);renderCurrent()}return}
  if(/^[A-Z]$/.test(key)&&current.length<5){current+=key;renderCurrent();setMessage("Digite uma palavra de 5 letras.")}
}
function resultGrid(){
  return evaluations.map(function(rowEv){return rowEv.map(function(v){return v==="correct"?"🟩":v==="present"?"🟨":"⬛"}).join("")}).join("\n");
}
async function share(){
  if(!challenge||!finished)return;
  var text="Termo do Dia #"+(catalogIndex+1)+" "+(won?guesses.length+"/6":"X/6")+"\n\n"+resultGrid()+"\n\nhttps://musicadodia.com/termo/";
  if(navigator.share){try{await navigator.share({title:"Termo do Dia",text:text});return}catch(_){}}
  try{await navigator.clipboard.writeText(text);setMessage("Resultado copiado.","success")}catch(_){setMessage(text)}
}
function resetPreview(){
  row=0;current="";guesses=[];evaluations=[];finished=false;won=false;keyStates={};
  E.result.classList.add("hidden");E.resetPreview.classList.add("hidden");buildBoard();buildKeyboard();updateAttemptLabel();setMessage("Digite uma palavra de 5 letras.");
}
async function init(){
  loadTheme();buildBoard();buildKeyboard();
  try{
    var res=await fetch("/termo/catalog.json?v="+Date.now(),{cache:"no-store"});if(!res.ok)throw new Error("catalog");
    var data=await res.json(),words=Array.isArray(data.words)?data.words:[];
    if(adminPreview){
      challenge=words.find(function(item){return String(item.date||"")===previewDate})||null;
    }else{
      var today=brazilDate(),eligible=words.filter(function(item){return String(item.date||"")<=today});
      challenge=eligible.length?eligible[eligible.length-1]:null;
    }
    if(!challenge){
      E.termDate.textContent="Nenhuma palavra publicada";
      E.attemptLabel.textContent="Aguardando";setMessage("Cadastre a primeira palavra no painel administrativo.");return;
    }
    if(normalizeWord(challenge.word).length!==5)throw new Error("invalid word");
    catalogIndex=words.indexOf(challenge);
    E.dayChip.textContent="#"+(catalogIndex+1);E.challengeNumber.textContent="#"+(catalogIndex+1);E.termDate.textContent=prettyDate(challenge.date);
    load();renderSaved();if(finished)finish(won);
  }catch(_){
    E.termDate.textContent="Erro ao carregar";setMessage("Não consegui carregar o desafio de hoje.","error");
  }
}

E.themeToggle.addEventListener("click",function(ev){ev.stopPropagation();E.themeMenu.classList.toggle("hidden")});
E.themeOptions.forEach(function(btn){btn.addEventListener("click",function(){chooseTheme(btn.getAttribute("data-theme-choice"))})});
document.addEventListener("click",function(ev){if(E.themeMenu.classList.contains("hidden"))return;if(ev.target.closest&&ev.target.closest(".theme-picker"))return;E.themeMenu.classList.add("hidden")});
document.addEventListener("keydown",function(ev){
  if(ev.ctrlKey||ev.metaKey||ev.altKey)return;
  if(ev.key==="Enter")handleKey("ENTER");
  else if(ev.key==="Backspace")handleKey("BACKSPACE");
  else{var n=normalizeWord(ev.key);if(n.length===1)handleKey(n)}
});
E.share.addEventListener("click",share);E.resetPreview.addEventListener("click",resetPreview);
init();
})();