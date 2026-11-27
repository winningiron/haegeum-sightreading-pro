/* 해금 초견 프로 — 기능: 필터, 조율 기준음(A4 440~450Hz·기본 442), 메트로놈, 으뜸음, 30초 읽기, 모의고사, 진도/메모 */
"use strict";
const FALLBACK = [
  {no:1, title:"첫 호흡, 긴 음", level:"기초", key:"Eb", keyLabel:"E♭", meters:"4/4", measures:42, tempo:60, tonic:311.13, tonicLabel:"E♭4", tags:["4/4","E♭"]},
  {no:2, title:"세 박자의 걸음", level:"기초", key:"Ab", keyLabel:"A♭", meters:"3/4", measures:42, tempo:66, tonic:415.30, tonicLabel:"A♭4", tags:["3/4","A♭"]},
  {no:3, title:"흔들리는 여섯 박", level:"기초", key:"Eb", keyLabel:"E♭", meters:"6/8", measures:40, tempo:69, tonic:311.13, tonicLabel:"E♭4", tags:["6/8","E♭"]},
  {no:4, title:"두 박에서 네 박으로", level:"기초", key:"Bb", keyLabel:"B♭", meters:"2/4 → 4/4", measures:42, tempo:72, tonic:466.16, tonicLabel:"B♭4", tags:["2/4","4/4","B♭","변박"]},
  {no:5, title:"다섯 박의 파도", level:"중급", key:"Eb", keyLabel:"E♭", meters:"5/8 → 3/4", measures:49, tempo:84, tonic:311.13, tonicLabel:"E♭4", tags:["5/8","3/4","E♭","A♭","변박","조바꿈"]},
  {no:6, title:"일곱 박의 미로", level:"중급", key:"Ab", keyLabel:"A♭", meters:"7/8 → 6/8", measures:49, tempo:88, tonic:415.30, tonicLabel:"A♭4", tags:["7/8","6/8","A♭","변박"]},
  {no:7, title:"아홉 박의 질주", level:"중급", key:"Db", keyLabel:"D♭", meters:"9/8 → 4/4", measures:48, tempo:76, tonic:277.18, tonicLabel:"D♭4", tags:["9/8","4/4","D♭","A♭","변박","조바꿈"]},
  {no:8, title:"열두 박의 물결", level:"중급", key:"Bb", keyLabel:"B♭", meters:"12/8", measures:35, tempo:63, tonic:466.16, tonicLabel:"B♭4", tags:["12/8","B♭","E♭","조바꿈"]},
  {no:9, title:"변박의 불꽃", level:"고급", key:"Eb", keyLabel:"E♭", meters:"5/8 → 3/4 → 5/8 → 4/4", measures:48, tempo:84, tonic:311.13, tonicLabel:"E♭4", tags:["5/8","3/4","4/4","E♭","A♭","변박","조바꿈"]},
  {no:10, title:"엇박의 도전", level:"고급", key:"Ab", keyLabel:"A♭", meters:"7/8 → 4/4 → 7/8 → 4/4", measures:48, tempo:88, tonic:415.30, tonicLabel:"A♭4", tags:["7/8","4/4","A♭","D♭","변박","조바꿈"]},
  {no:11, title:"조바꿈의 파도", level:"고급", key:"Db", keyLabel:"D♭", meters:"5/8 → 7/8 → 6/8", measures:48, tempo:92, tonic:277.18, tonicLabel:"D♭4", tags:["5/8","7/8","6/8","D♭","A♭","변박","조바꿈"]},
  {no:12, title:"종합 챌린지", level:"고급", key:"Gb", keyLabel:"G♭", meters:"7/8 → 5/8 → 4/4", measures:48, tempo:80, tonic:369.99, tonicLabel:"G♭4", tags:["7/8","5/8","4/4","G♭","D♭","변박","조바꿈"]}
];
let PIECES = FALLBACK.slice();
const store = {
  get(){ try{ return JSON.parse(localStorage.getItem("hspro-progress")||"{}"); }catch(e){ return {}; } },
  set(v){ localStorage.setItem("hspro-progress", JSON.stringify(v)); }
};
let progress = store.get();
const filters = {level:"all", key:"all", meter:"all"};
let current = null, mockList = [], mockIdx = -1;
let audioCtx = null, metroTimer = null, metroBeat = 0, droneNodes = null, readTimer = null;

/* ---- 조율 기준음 A4: 해금 기본 442Hz, 440~450Hz 선택 ---- */
const A4_MIN = 440, A4_MAX = 450, A4_DEFAULT = 442;
let a4 = A4_DEFAULT;
(function loadA4(){
  const v = parseInt(localStorage.getItem("hspro-a4")||"", 10);
  if(v >= A4_MIN && v <= A4_MAX) a4 = v;
})();
/* 기준음이 440Hz일 때의 악보·으뜸음 주파수를 선택된 조율로 비례 이동 */
const tuneRatio = () => a4 / 440;
const tuneHz = base => base * tuneRatio();
const tuneName = () => "A4=" + a4 + "Hz";

const $ = id => document.getElementById(id);
function pad(n){ return String(n).padStart(3,"0"); }
function ensureAudio(){ if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==="suspended") audioCtx.resume(); return audioCtx; }
function beep(freq, dur, type, gain){
  const ctx = ensureAudio(), o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type||"sine"; o.frequency.value = freq;
  g.gain.setValueAtTime(gain||0.25, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur);
}
/* 30초 읽기 종료 신호음: 맑은 3음 차임(C6-E6-G6) */
function chime(){
  const ctx = ensureAudio(), t0 = ctx.currentTime + 0.02;
  [[1046.50,0],[1318.51,0.15],[1567.98,0.30]].forEach(function(pair){
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = pair[0];
    const at = t0 + pair[1];
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.22, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.2);
    o.connect(g); g.connect(ctx.destination); o.start(at); o.stop(at + 1.3);
  });
}
function stopMetro(){ if(metroTimer){ clearInterval(metroTimer); metroTimer=null; } $("metroBtn").textContent = "메트로놈 OFF"; }
function toggleMetro(){
  if(metroTimer){ stopMetro(); return; }
  if(!current) return;
  stopPlayer();
  ensureAudio();
  const bpm = current.tempo, interval = 60000/bpm;
  metroBeat = 0;
  $("metroBtn").textContent = "메트로놈 ON · ♩=" + bpm;
  metroTimer = setInterval(()=>{ beep(metroBeat===0?1200:800, 0.08, "square", metroBeat===0?0.22:0.12); metroBeat = (metroBeat+1)%4; }, interval);
}
function stopDrone(){ if(droneNodes){ try{ droneNodes.g.gain.setValueAtTime(0, audioCtx.currentTime); droneNodes.o.stop(); }catch(e){} droneNodes=null; } $("droneBtn").textContent = "기준음 재생"; refreshTonicLabel(); }
function playDrone(freq, label, btn){
  ensureAudio(); stopDrone();
  const ctx = audioCtx, o = ctx.createOscillator(), g = ctx.createGain();
  o.type="sine"; o.frequency.value=freq; g.gain.value=0.18;
  o.connect(g); g.connect(ctx.destination); o.start();
  droneNodes={o,g}; btn.textContent = label + " 재생 중 (다시 누르면 정지)";
  setTimeout(()=>{ if(droneNodes && droneNodes.o===o){ stopDrone(); } }, 10000);
}
function refreshTonicLabel(){
  if(!current){ $("tonicBtn").textContent = "으뜸음"; return; }
  const lbl = current.tonicLabel || current.keyLabel || "";
  const hz = tuneHz(current.tonic || 440);
  $("tonicBtn").textContent = "으뜸음 " + lbl + " · " + hz.toFixed(1) + "Hz";
}
function refreshDroneLabel(){
  if(!droneNodes) $("droneBtn").textContent = "기준음 " + a4 + "Hz 재생";
  $("tuneHint").textContent = "기준음 " + tuneName() + " · 으뜸음과 가이드 재생이 이 조율을 따릅니다.";
}
function renderList(){
  const grid = $("songGrid"); grid.innerHTML = "";
  const list = PIECES.filter(p =>
    (filters.level==="all"||p.level===filters.level) &&
    (filters.key==="all"||(p.tags||[]).includes(filters.key)||p.keyLabel===filters.key) &&
    (filters.meter==="all"||(p.tags||[]).includes(filters.meter)));
  if(!list.length){ grid.innerHTML = "<p>조건에 맞는 곡이 없습니다. 필터를 바꿔보세요.</p>"; }
  list.forEach(p=>{
    const pr = progress[p.no]||{};
    const b = document.createElement("button");
    b.className = "song-card" + (pr.done?" done":"");
    b.type = "button";
    b.innerHTML =
      "<span class='song-thumb-wrap'>" +
        "<img class='song-thumb' src='scores/"+pad(p.no)+".png' alt='' loading='lazy' decoding='async'>" +
        "<span class='song-thumb-fade'></span>" +
      "</span>" +
      "<span class='song-body'>" +
        "<span class='song-no'>"+p.no+"번 · "+p.level+"</span>" +
        "<h3>"+p.title+"</h3>" +
        "<p class='song-meta'>"+p.keyLabel+" · "+p.meters+" · "+p.measures+"마디 · ♩="+p.tempo+"</p>" +
        "<span class='song-tags'>"+(p.tags||[]).map(t=>"<span class='tag'>"+t+"</span>").join("") +
        (pr.done?"<span class='tag done-tag'>✓ 완료</span>":"") +
        (pr.count?("<span class='tag'>연습 "+pr.count+"회</span>"):"") + "</span>" +
      "</span>";
    b.onclick = ()=>openSong(p.no, false);
    grid.appendChild(b);
  });
  const done = PIECES.filter(p=>(progress[p.no]||{}).done).length;
  $("progressSummary").textContent = "진도: "+done+" / "+PIECES.length+"곡 완료";
}
function openSong(no, fromMock){
  const p = PIECES.find(x=>x.no===no); if(!p) return;
  current = p; stopMetro(); stopDrone(); stopPlayer(); stopReadTimer();
  $("loopA").value = 1; $("loopB").value = p.measures||""; $("loopChk").checked = false;
  loadTimeline(p.no).then(tl=>{
    $("countInLabel").textContent = "예비박: "+tl.count_in.beats+"박 (첫 마디 박자)";
  }).catch(()=>{ $("countInLabel").textContent = "예비박: 타임라인 준비 중"; });
  $("viewer").hidden = false;
  $("viewerTitle").textContent = p.no+"번 · "+p.title+" — "+p.level+" · "+p.keyLabel+" · "+p.meters+" · "+p.measures+"마디 · ♩="+p.tempo;
  $("scoreImg").src = "scores/"+pad(p.no)+".png";
  $("scoreImg").alt = p.no+"번 "+p.title+" 악보";
  $("pdfLink").href = "scores/"+pad(p.no)+".pdf";
  $("xmlLink").href = "scores/"+pad(p.no)+".musicxml";
  const pr = progress[p.no]||{};
  $("doneCheck").checked = !!pr.done;
  $("countLabel").textContent = "연습 횟수: "+(pr.count||0)+"회";
  $("memoInput").value = pr.memo||"";
  $("mockNav").hidden = !fromMock;
  if(fromMock){ $("mockLabel").textContent = "모의고사 "+(mockIdx+1)+" / "+mockList.length; }
  refreshTonicLabel(); refreshDroneLabel();
  renderList();
  // 곡을 열면 악보 첫 단이 sticky 상단바에 가리지 않도록 뷰어 위쪽을 기준으로 맞춤
  requestAnimationFrame(()=>{ alignViewerToTop(); });
}
/* sticky 상단바 높이(모바일에서 2줄이 됨)에 맞춰 스크롤 여백을 매번 다시 계산 */
function alignViewerToTop(){
  const tb = document.querySelector(".topbar");
  const h = tb ? tb.getBoundingClientRect().height : 80;
  $("viewer").style.scrollMarginTop = Math.round(h + 14) + "px";
  $("viewer").scrollIntoView({block:"start"});
}
window.addEventListener("resize", ()=>{
  const tb = document.querySelector(".topbar");
  if(tb) $("viewer").style.scrollMarginTop = Math.round(tb.getBoundingClientRect().height + 14) + "px";
});
function saveProgress(){ store.set(progress); renderList(); }
/* ---- 30초 읽기 → 시작하세요! (집중 뷰 안에서 카운트다운) ---- */
function stopReadTimer(){ if(readTimer){ clearInterval(readTimer); readTimer=null; } }
function hideReadTimer(){ stopReadTimer(); const el=$("readTimer"); el.hidden=true; el.classList.remove("done"); }
function startReadTimer(sec){
  if(!current) return;
  stopReadTimer();
  const el = $("readTimer"), lbl = $("readTimerLabel"), cnt = $("readTimerCount");
  el.hidden = false; el.classList.remove("done");
  let t = sec||30;
  lbl.textContent = "악보를 눈으로만 읽으세요 — " + t + "초";
  cnt.textContent = t;
  readTimer = setInterval(()=>{
    t--;
    if(t>0){ cnt.textContent = t; return; }
    clearInterval(readTimer); readTimer = null;
    lbl.textContent = "시작하세요!";
    cnt.textContent = "▶";
    el.classList.add("done");
    chime();
    setTimeout(()=>{ if(el.classList.contains("done")) hideReadTimer(); }, 4500);
  }, 1000);
}
/* ---- 오디오 플레이어: 타임라인 기반 피아노 가이드 + 메트로놈 + 예비박 ---- */
const timelines = {};
let player = {playing:false, nodes:[], timers:[], poll:null, pieceStart:0, countInSec:0, segStart:0, segEnd:0, speed:1, mode:"piano+metro", loop:false, tl:null, fromM:1, toM:0};
async function loadTimeline(no){
  if(timelines[no]) return timelines[no];
  const r = await fetch("scores/"+pad(no)+".timeline.json");
  if(!r.ok) throw new Error("timeline 없음");
  const j = await r.json(); timelines[no]=j; return j;
}
function pianoNoteAt(freq, when, dur){
  const ctx = ensureAudio();
  const g = ctx.createGain(); g.connect(ctx.destination);
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator();
  o1.type="triangle"; o1.frequency.value=freq;
  o2.type="sine"; o2.frequency.value=freq*2;
  o3.type="sine"; o3.frequency.value=freq*3;
  const g2=ctx.createGain(); g2.gain.value=0.3;
  const g3=ctx.createGain(); g3.gain.value=0.1;
  o1.connect(g); o2.connect(g2); g2.connect(g); o3.connect(g3); g3.connect(g);
  const len = Math.max(0.15, dur*1.1);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.28, when+0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, when+len);
  [o1,o2,o3].forEach(o=>{ o.start(when); o.stop(when+len+0.1); });
  return [o1,o2,o3];
}
function clickAt(when, accent){
  const ctx = ensureAudio();
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type="square"; o.frequency.value = accent?1500:1000;
  g.gain.setValueAtTime(accent?0.20:0.11, when);
  g.gain.exponentialRampToValueAtTime(0.001, when+0.07);
  o.connect(g); g.connect(ctx.destination);
  o.start(when); o.stop(when+0.09);
  return [o];
}
function countInFor(ms){
  // 해당 마디의 박자만큼 예비박. 단순박자는 분자 개수, 복합박자는 점4분음표 박 개수.
  let beats, clickQ;
  if(ms.unit==="dotted-quarter"){ beats = Math.round((ms.beats*(4/ms.beat_type))/1.5); clickQ = 1.5; }
  else { beats = ms.beats; clickQ = 4/ms.beat_type; }
  const div = ms.unit==="dotted-quarter" ? 1.5 : 1.0;
  return {beats, clickSec: clickQ*(60/ms.bpm)/div};
}
function stopPlayer(){
  player.timers.forEach(clearTimeout);
  player.timers = [];
  if(player.poll){ clearInterval(player.poll); player.poll=null; }
  player.nodes.forEach(ns=>ns.forEach(o=>{ try{ o.stop(); }catch(e){} }));
  player.nodes = [];
  player.playing = false;
  $("nowPlaying").textContent = "재생 중이 아닙니다.";
  $("playBtn").textContent = "▶ 재생 (예비박부터)";
}
async function playSegment(opts){
  if(!current) return;
  opts = opts||{};
  stopPlayer(); stopMetro();
  const tl = await loadTimeline(current.no);
  player.tl = tl;
  const speed = parseFloat($("speedSel").value)||1;
  const mode = opts.mode || $("modeSel").value;
  const fromM = opts.fromM || 1;
  const toM = opts.toM || tl.measures;
  const loop = !!opts.loop;
  const ms = tl.measure_starts;
  const segStart = ms[fromM-1].start;
  const segEnd = toM < tl.measures ? ms[toM].start : tl.total_sec;
  const ci = countInFor(ms[fromM-1]);
  const countInSec = ci.beats*ci.clickSec/speed;
  const ctx = ensureAudio();
  const t0 = ctx.currentTime + 0.15;
  const pieceStart = t0 + countInSec;
  player.playing = true; player.speed = speed; player.mode = mode;
  player.loop = loop; player.fromM = fromM; player.toM = toM;
  player.segStart = segStart; player.segEnd = segEnd;
  player.pieceStart = pieceStart; player.countInSec = countInSec;
  $("countInLabel").textContent = "예비박: "+ci.beats+"박 ("+fromM+"마디 박자)";
  $("playBtn").textContent = "■ 재생 중… (정지하려면 아래 ■ 정지)";
  // 예비박 클릭 (강-약-약...)
  for(let i=0;i<ci.beats;i++) player.nodes.push(clickAt(t0 + i*ci.clickSec/speed, i===0));
  // 본곡: 음표 + 메트로놈 클릭 (음높이는 선택된 조율 A4 기준으로 비례 이동)
  const ratio = tuneRatio();
  const playNotes = mode!=="metro", playClicks = mode!=="piano";
  if(playNotes){
    tl.notes.forEach(n=>{
      if(n.start < segStart || n.start >= segEnd) return;
      const when = pieceStart + (n.start-segStart)/speed;
      player.nodes.push(pianoNoteAt(n.freq*ratio, when, n.dur/speed));
    });
  }
  if(playClicks){
    tl.clicks.forEach(c=>{
      if(c.t < segStart || c.t >= segEnd) return;
      player.nodes.push(clickAt(pieceStart + (c.t-segStart)/speed, c.accent));
    });
  }
  // 현재 마디 표시
  player.poll = setInterval(()=>{
    if(!player.playing) return;
    const el = (ctx.currentTime - pieceStart)*speed;
    if(el < 0){ $("nowPlaying").textContent = "예비박 중… ("+ci.beats+"박)"; return; }
    const t = segStart + el;
    let cur = ms[0].m;
    for(const m of ms){ if(m.start <= t+0.001) cur = m.m; }
    $("nowPlaying").textContent = "지금 "+cur+"마디 / 전체 "+tl.measures+"마디 · "+mode+" · "+speed+"x · "+tuneName();
  }, 150);
  // 종료 처리 (루프면 반복)
  const totalMs = (countInSec + (segEnd-segStart)/speed)*1000 + 300;
  player.timers.push(setTimeout(()=>{
    if(!player.playing) return;
    if(player.loop){ playSegment({mode, fromM, toM, loop:true}); return; }
    stopPlayer();
  }, totalMs));
}
function startMock(){
  const pick = lvl => { const c = PIECES.filter(p=>p.level===lvl); return c[Math.floor(Math.random()*c.length)]; };
  mockList = [pick("기초"), pick("중급"), pick("고급")].filter(Boolean).map(p=>p.no);
  mockIdx = 0;
  openSong(mockList[0], true);
}
function setFocus(on){
  document.body.classList.toggle("focus", on);
  if(!on) document.body.classList.remove("show-audio");
  $("focusBtn").textContent = on ? "집중 뷰 나가기" : "집중 연습 뷰";
  $("audioToggle").textContent = document.body.classList.contains("show-audio") ? "오디오 설정 닫기" : "오디오 설정";
}
document.querySelectorAll(".chip").forEach(ch=>{
  ch.addEventListener("click", ()=>{
    const f = ch.dataset.filter;
    document.querySelectorAll('[data-filter="'+f+'"]').forEach(x=>x.classList.remove("active"));
    ch.classList.add("active");
    filters[f] = ch.dataset.value;
    renderList();
  });
});
$("themeBtn").onclick = ()=>{
  const h = document.documentElement;
  const next = h.dataset.theme === "dark" ? "light" : "dark";
  h.dataset.theme = next;
  localStorage.setItem("hspro-theme", next);
  $("themeBtn").textContent = next==="dark" ? "☀️ 라이트" : "🌙 다크";
};
$("mockBtn").onclick = startMock;
$("closeViewer").onclick = ()=>{ stopMetro(); stopDrone(); stopPlayer(); hideReadTimer(); setFocus(false); $("viewer").hidden = true; };
$("playBtn").onclick = async ()=>{
  if(player.playing){ stopPlayer(); return; }
  const a = parseInt($("loopA").value)||1, b = parseInt($("loopB").value)||0;
  const loop = $("loopChk").checked;
  const tl = await loadTimeline(current.no);
  const fromM = Math.max(1, Math.min(a, tl.measures));
  const toM = b>0 ? Math.max(fromM, Math.min(b, tl.measures)) : tl.measures;
  playSegment({fromM, toM, loop});
};
$("stopBtn").onclick = ()=>{ stopPlayer(); };
$("firstNoteBtn").onclick = async ()=>{
  if(!current) return;
  const tl = await loadTimeline(current.no);
  const n = tl.notes[0];
  if(n){ const ctx = ensureAudio(); pianoNoteAt(n.freq*tuneRatio(), ctx.currentTime+0.05, 1.2); $("nowPlaying").textContent = "첫 음: "+n.m+"마디 (MIDI "+n.midi+") 미리 듣는 중 · "+tuneName(); }
};
$("readBtn").onclick = ()=>startReadTimer(30);
$("readSkip").onclick = hideReadTimer;
$("a4Sel").onchange = e=>{
  const v = parseInt(e.target.value,10);
  if(!(v>=A4_MIN && v<=A4_MAX)) return;
  a4 = v; localStorage.setItem("hspro-a4", String(a4));
  stopDrone();
  refreshDroneLabel(); refreshTonicLabel();
};
$("metroBtn").onclick = toggleMetro;
$("droneBtn").onclick = e=>{ if(droneNodes){ stopDrone(); } else { playDrone(a4, "기준음 A4="+a4+"Hz", e.currentTarget); } };
$("tonicBtn").onclick = e=>{ if(!current) return; if(droneNodes){ stopDrone(); } else { const hz = tuneHz(current.tonic||440); playDrone(hz, "으뜸음 "+(current.tonicLabel||"")+" "+hz.toFixed(1)+"Hz", e.currentTarget); } };
$("focusBtn").onclick = ()=>{
  const on = !document.body.classList.contains("focus");
  setFocus(on);
  if(on){ startReadTimer(30); }
  else { hideReadTimer(); }
};
$("audioToggle").onclick = ()=>{
  const b = document.body;
  b.classList.toggle("show-audio");
  $("audioToggle").textContent = b.classList.contains("show-audio") ? "오디오 설정 닫기" : "오디오 설정";
};
$("doneCheck").onchange = e=>{ if(!current) return; progress[current.no] = Object.assign({}, progress[current.no], {done:e.target.checked}); saveProgress(); };
$("countBtn").onclick = ()=>{ if(!current) return; const pr = progress[current.no]||{}; pr.count=(pr.count||0)+1; progress[current.no]=pr; saveProgress(); $("countLabel").textContent="연습 횟수: "+pr.count+"회"; };
$("memoInput").addEventListener("input", e=>{ if(!current) return; progress[current.no]=Object.assign({}, progress[current.no], {memo:e.target.value}); store.set(progress); });
$("mockPrev").onclick = ()=>{ if(mockIdx>0){ mockIdx--; openSong(mockList[mockIdx], true); } };
$("mockNext").onclick = ()=>{ if(mockIdx<mockList.length-1){ mockIdx++; openSong(mockList[mockIdx], true); } };
(function init(){
  // 조율 기준음 셀렉트 (440~450Hz, 1Hz 단위 · 기본 442Hz)
  const sel = $("a4Sel");
  sel.innerHTML = "";
  for(let v=A4_MIN; v<=A4_MAX; v++){
    const o = document.createElement("option");
    o.value = String(v); o.textContent = String(v);
    if(v === a4) o.selected = true;
    sel.appendChild(o);
  }
  refreshDroneLabel();
  const savedTheme = localStorage.getItem("hspro-theme");
  if(savedTheme){ document.documentElement.dataset.theme = savedTheme; $("themeBtn").textContent = savedTheme==="dark" ? "☀️ 라이트" : "🌙 다크"; }
  fetch("scores/pieces.json").then(r=>{ if(!r.ok) throw new Error("no json"); return r.json(); })
    .then(j=>{
      const arr = Array.isArray(j) ? j : (j.pieces||[]);
      if(arr.length){
        const TONIC = {Eb:[311.13,"E♭4"], Ab:[415.30,"A♭4"], Bb:[466.16,"B♭4"], Db:[277.18,"D♭4"], Gb:[369.99,"G♭4"], F:[349.23,"F4"]};
        const KL = {Eb:"E♭", Ab:"A♭", Bb:"B♭", Db:"D♭", Gb:"G♭", F:"F"};
        PIECES = arr.map((x,i)=>{
          const fb = FALLBACK[i]||{};
          const key = x.key||x.keyLabel||fb.key||"Eb";
          const t = TONIC[key]||[440,"A4"];
          return {
            no: x.no ?? fb.no ?? (i+1),
            title: x.title||fb.title, level: x.level||fb.level, key,
            keyLabel: x.keyLabel||KL[key]||key,
            meters: (Array.isArray(x.sections) ? x.sections.map(s=>s[1]).filter((v,i,a)=>i===0||v!==a[i-1]).join(" → ") : (Array.isArray(x.meters) ? x.meters.join(" → ") : (x.meters||(x.meter?String(x.meter):"")))) || fb.meters || "",
            measures: x.measures ?? x.bars ?? x.total ?? fb.measures ?? 0,
            tempo: x.tempo ?? (x.tempos ? (x.tempos["1"] ?? x.tempos[1]) : undefined) ?? fb.tempo ?? 80,
            tonic: x.tonic||t[0], tonicLabel: x.tonicLabel||t[1],
            tags: x.tags||fb.tags||[]
          };
        });
      }
      renderList();
    })
    .catch(()=>renderList());
})();
