/* 해금 초견 프로 — 기능: 필터, 조율 기준음(A4 440~450Hz·기본 442), 메트로놈,
   으뜸음, 30초 읽기, 모의고사(날짜 시드), 진도/메모, 마디 하이라이트·A-B 루프,
   Speed Trainer, 백업/복원, 주간 그래프, 해시·단축키·줌·Wake Lock,
   3단계: 강세 그룹핑 표기, 개방현(중현·유현) 조율, 메모 마디 태그→A-B,
   마이크 피치 체크, 캐시 버스팅·PWA, XSS 방지·CSP, 워터마크·PDF만 제공 */
"use strict";
const FALLBACK = [
  {no:1, title:"첫 호흡, 긴 음", level:"기초", key:"Eb", keyLabel:"E♭", meters:"4/4", measures:42, tempo:60, tonic:311.13, tonicLabel:"E♭4", tags:["4/4","E♭"]},
  {no:2, title:"세 박자의 걸음", level:"기초", key:"Ab", keyLabel:"A♭", meters:"3/4", measures:42, tempo:66, tonic:415.30, tonicLabel:"A♭4", tags:["3/4","A♭"]},
  {no:3, title:"흔들리는 여섯 박", level:"기초", key:"Eb", keyLabel:"E♭", meters:"6/8", measures:40, tempo:69, tonic:311.13, tonicLabel:"E♭4", tags:["6/8","E♭"]},
  {no:4, title:"두 박에서 네 박으로", level:"기초", key:"Bb", keyLabel:"B♭", meters:"2/4 → 4/4", measures:42, tempo:72, tonic:466.16, tonicLabel:"B♭4", tags:["2/4","4/4","B♭","변박"]},
  {no:5, title:"다섯 박의 파도", level:"중급", key:"Eb", keyLabel:"E♭", meters:"5/8 → 3/4", measures:49, tempo:84, tonic:311.13, tonicLabel:"E♭4", grouping:{"5/8":[3,2]}, tags:["5/8","3/4","E♭","A♭","변박","조바꿈"]},
  {no:6, title:"일곱 박의 미로", level:"중급", key:"Ab", keyLabel:"A♭", meters:"7/8 → 6/8", measures:49, tempo:88, tonic:415.30, tonicLabel:"A♭4", grouping:{"7/8":[3,2,2]}, tags:["7/8","6/8","A♭","변박"]},
  {no:7, title:"아홉 박의 질주", level:"중급", key:"Db", keyLabel:"D♭", meters:"9/8 → 4/4", measures:48, tempo:76, tonic:277.18, tonicLabel:"D♭4", tags:["9/8","4/4","D♭","A♭","변박","조바꿈"]},
  {no:8, title:"열두 박의 물결", level:"중급", key:"Bb", keyLabel:"B♭", meters:"12/8", measures:35, tempo:63, tonic:466.16, tonicLabel:"B♭4", tags:["12/8","B♭","E♭","조바꿈"]},
  {no:9, title:"변박의 불꽃", level:"고급", key:"Eb", keyLabel:"E♭", meters:"5/8 → 3/4 → 5/8 → 4/4", measures:48, tempo:84, tonic:311.13, tonicLabel:"E♭4", grouping:{"5/8":[3,2]}, tags:["5/8","3/4","4/4","E♭","A♭","변박","조바꿈"]},
  {no:10, title:"엇박의 도전", level:"고급", key:"Ab", keyLabel:"A♭", meters:"7/8 → 4/4 → 7/8 → 4/4", measures:48, tempo:88, tonic:415.30, tonicLabel:"A♭4", grouping:{"7/8":[3,2,2]}, tags:["7/8","4/4","A♭","D♭","변박","조바꿈"]},
  {no:11, title:"조바꿈의 파도", level:"고급", key:"Db", keyLabel:"D♭", meters:"5/8 → 7/8 → 6/8", measures:48, tempo:92, tonic:277.18, tonicLabel:"D♭4", grouping:{"5/8":[3,2],"7/8":[3,2,2]}, tags:["5/8","7/8","6/8","D♭","A♭","변박","조바꿈"]},
  {no:12, title:"종합 챌린지", level:"고급", key:"Gb", keyLabel:"G♭", meters:"7/8 → 5/8 → 4/4", measures:48, tempo:80, tonic:369.99, tonicLabel:"G♭4", grouping:{"7/8":[3,2,2],"5/8":[3,2]}, tags:["7/8","5/8","4/4","G♭","D♭","변박","조바꿈"]}
];
let PIECES = FALLBACK.slice();
const store = {
  get(){ try{ return JSON.parse(localStorage.getItem("hspro-progress")||"{}"); }catch(e){ return {}; } },
  set(v){ localStorage.setItem("hspro-progress", JSON.stringify(v)); }
};
let progress = store.get();
const filters = {level:"all", key:"all", meter:"all"};
let current = null, mockList = [], mockIdx = -1;
let audioCtx = null, droneNodes = null, readTimer = null;
let undoStack = [];
let focusSys = 0;

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

/* ---- 3단계: 캐시 버스팅 — pieces.json의 version을 자산 URL에 붙인다 ----
   pieces.json을 읽기 전에는 기본값 3을 쓰고, 읽은 뒤에는 그 version을 쓴다.
   PNG/PDF/timeline/measure-boxes/썸네일 URL이 모두 assetUrl()을 경유한다. */
const ASSET_VERSION_DEFAULT = "3";
let assetVersion = ASSET_VERSION_DEFAULT;
function assetUrl(path){ return path + "?v=" + encodeURIComponent(assetVersion); }

/* ---- 음이름·MIDI·주파수 (개방현·마이크 피치 공용) ---- */
const FLAT_NAMES = ["C","D♭","D","E♭","E","F","G♭","G","A♭","A","B♭","B"];
function midiToName(midi){ return FLAT_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1); }
/* 선택된 A4(440~450Hz) 기준 MIDI→주파수. A4 설정값을 바꾸면 그대로 따라간다. */
function midiToFreq(midi){ return a4 * Math.pow(2, (midi - 69) / 12); }
/* "E♭4" 같은 음이름 → MIDI. ♭/♯/b/# 모두 받는다. */
function parseNoteLabel(label){
  const m = String(label || "").match(/^([A-G])([♭♯b#]?)(-?\d+)$/);
  if(!m) return null;
  const NAT = {C:0, D:2, E:4, F:5, G:7, A:9, B:11};
  const acc = (m[2] === "♭" || m[2] === "b") ? -1 : (m[2] === "♯" || m[2] === "#") ? 1 : 0;
  return NAT[m[1]] + acc + (parseInt(m[3], 10) + 1) * 12;
}

const $ = id => document.getElementById(id);
function pad(n){ return String(n).padStart(3,"0"); }
function todayStr(d){
  d = d || new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function ensureAudio(){ if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==="suspended") audioCtx.resume(); return audioCtx; }
/* beep(): 호출처는 없지만 호환을 위해 남겨 둔다 (1단계와 동일). */
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
/* ---- Screen Wake Lock: 재생·집중 연습 중 화면 꺼짐 방지.
   지원 안 하는 브라우저에서는 조용히 무시한다. ---- */
let wakeLock = null;
async function requestWakeLock(){
  if(!("wakeLock" in navigator)) return;
  try{ wakeLock = await navigator.wakeLock.request("screen"); }catch(e){ wakeLock = null; }
}
function releaseWakeLock(){
  if(wakeLock){ try{ wakeLock.release(); }catch(e){} wakeLock = null; }
}
function maybeReleaseWakeLock(){
  if(!player.playing && !metro.timer && !document.body.classList.contains("focus")) releaseWakeLock();
}
document.addEventListener("visibilitychange", ()=>{
  if(!document.hidden && (player.playing || metro.timer || document.body.classList.contains("focus"))) requestWakeLock();
});
/* ---- 재생 속도 0.5x~1.1x (슬라이더 + 5% 버튼). 메트로놈·가이드 공용. ---- */
const SPEED_MIN = 0.5, SPEED_MAX = 1.1, SPEED_STEP = 0.05;
function speedVal(){
  const v = parseFloat($("speedRange").value);
  if(isNaN(v)) return 1;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, v));
}
function updateSpeedUI(v){
  if(typeof v === "number"){
    const c = Math.min(SPEED_MAX, Math.max(SPEED_MIN, v));
    $("speedRange").value = String(Math.round(c * 100) / 100);
  }
  const cur = speedVal();
  $("speedVal").textContent = cur.toFixed(2).replace(/0$/, "") + "x";
  try{ localStorage.setItem("hspro-speed", String(cur)); }catch(e){}
}
function trainerStepVal(){
  const v = parseInt($("trainerStep").value, 10);
  return (v === 2 || v === 5) ? v : 5;
}
/* Speed Trainer: 루프 1회마다 속도 +2% 또는 +5%. 상한 1.1x. */
function nextTrainerSpeed(cur, stepPct){
  return Math.min(SPEED_MAX, Math.round(cur * 100 + stepPct) / 100);
}
function stopDrone(){ if(droneNodes){ try{ droneNodes.g.gain.setValueAtTime(0, audioCtx.currentTime); droneNodes.o.stop(); }catch(e){} droneNodes=null; } refreshDroneLabel(); refreshTonicLabel(); }
function playDrone(freq, label, btn){
  ensureAudio(); stopDrone(); stopStrings();
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
/* ---- 3단계: 강세 그룹핑 화면 표기 (항목 15) ----
   pieces.json/timeline.json의 grouping을 읽어 "7/8 = 3+2+2"처럼 보여준다.
   메트로놈 피치는 이미 3단계로 나뉘어 있다(clickAt: level 2 마디 첫 박
   1500Hz, level 1 그룹 첫 박 1200Hz, level 0 약박 1000Hz). 단독 메트로놈과
   가이드 재생 클릭이 buildClickSchedule()을 공유하므로 피치가 일치한다. */
function groupingText(grouping){
  if(!grouping) return "";
  return Object.keys(grouping).map(m => m + " = " + grouping[m].join("+")).join(" · ");
}
function renderGrouping(tl){
  const el = $("groupingLine");
  if(!el) return;
  const g = (tl && tl.groupings) || (current && current.grouping) || {};
  const txt = groupingText(g);
  if(txt){
    el.textContent = "강세 그룹핑: " + txt +
      " · 메트로놈 강(마디 첫 박·1500Hz) · 중강(그룹 첫 박·1200Hz) · 약박(1000Hz)";
  }else{
    el.textContent = "강세: 마디 첫 박 1500Hz(강) · 나머지 1000Hz(약)";
  }
  el.hidden = false;
}
/* ---- 3단계: 해금 개방현(중현·유현) 조율 (항목 16) ----
   김성아 《창작을 위한 국악기 이해와 활용》 6장 기준: 중현·유현 개방현은
   조에 따라 달라지며, 기본 조율(E♭ 기준)에서는 중현 A♭3, 유현 E♭4로 둔다.
   이 음정은 단정하지 않는다. 아래 계산은 그 기준을 따르는 관습적 대응이다:
   중현 = 곡 조의 으뜸음보다 완전5도 아래, 유현 = 으뜸음과 같은 음.
   주파수는 선택된 A4(440~450Hz)에 비례해 이동한다(midiToFreq). */
const LETTER_ORDER = ["C","D","E","F","G","A","B"];
const LETTER_PC = {C:0, D:2, E:4, F:5, G:7, A:9, B:11};
/* 으뜸음보다 완전5도 아래 음이름. 음정 이론상 조표에 맞는 내림표(C♭ 등)를 쓴다. */
function fifthBelowName(tonicLabel, middleMidi){
  const m = String(tonicLabel || "").match(/^([A-G])([♭♯b#]?)(-?\d+)$/);
  if(!m) return midiToName(middleMidi);
  const li = LETTER_ORDER.indexOf(m[1]);
  const ml = LETTER_ORDER[(li - 4 + 14) % 7];
  const oct = parseInt(m[3], 10) - (li < 4 ? 1 : 0);
  const pc = ((middleMidi % 12) + 12) % 12;
  const diff = (((pc - LETTER_PC[ml]) % 12) + 12) % 12;
  const acc = diff === 0 ? "" : diff === 11 ? "♭" : diff === 1 ? "♯" : "";
  return ml + acc + oct;
}
function openStringsFor(piece){
  if(!piece) return null;
  const tonicMidi = parseNoteLabel(piece.tonicLabel);
  if(tonicMidi === null) return null;
  const middleMidi = tonicMidi - 7; // 완전5도 아래
  return {
    tonicMidi: tonicMidi,
    tonicName: piece.tonicLabel,
    middleMidi: middleMidi,
    middleName: fifthBelowName(piece.tonicLabel, middleMidi)
  };
}
function refreshOpenStringLabels(){
  const mid = $("midStringBtn"), high = $("highStringBtn");
  if(!mid || !high) return;
  const os = openStringsFor(current);
  if(!os){
    mid.textContent = "중현"; high.textContent = "유현";
    return;
  }
  mid.textContent = "중현 " + os.middleName + " · " + midiToFreq(os.middleMidi).toFixed(1) + "Hz";
  high.textContent = "유현 " + os.tonicName + " · " + midiToFreq(os.tonicMidi).toFixed(1) + "Hz";
}
/* 개방현 한 줄기 울림. droneNodes(기준음·으뜸음)와는 별도 채널이라
   순차·동시 재생이 겹치지 않게 stopStrings()/stopDrone()으로 정리한다. */
let stringNodes = [];
function stopStrings(){
  stringNodes.forEach(function(ns){ ns.forEach(function(o){ try{ o.stop(); }catch(e){} }); });
  stringNodes = [];
}
function playStringTone(midi, delaySec){
  const ctx = ensureAudio();
  const t = ctx.currentTime + (delaySec || 0);
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "sine"; o.frequency.value = midiToFreq(midi);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.20, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.0);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + 3.2);
  stringNodes.push([o]);
  return [o];
}
function playOpenString(which){
  const os = openStringsFor(current);
  if(!os) return;
  stopDrone(); stopStrings();
  const midi = which === "middle" ? os.middleMidi : os.tonicMidi;
  const name = which === "middle" ? os.middleName : os.tonicName;
  playStringTone(midi, 0);
  $("nowPlaying").textContent = (which === "middle" ? "중현 " : "유현 ") + name +
    " · " + midiToFreq(midi).toFixed(1) + "Hz 울리는 중 (" + tuneName() + " 기준)";
}
function playOpenStringsSeq(){
  const os = openStringsFor(current);
  if(!os) return;
  stopDrone(); stopStrings();
  playStringTone(os.middleMidi, 0);
  playStringTone(os.tonicMidi, 1.8);
  $("nowPlaying").textContent = "중현 " + os.middleName + " → 유현 " + os.tonicName +
    " 순차 조율 중 (" + tuneName() + " 기준)";
}
function playOpenStringsBoth(){
  const os = openStringsFor(current);
  if(!os) return;
  stopDrone(); stopStrings();
  playStringTone(os.middleMidi, 0);
  playStringTone(os.tonicMidi, 0);
  $("nowPlaying").textContent = "중현 " + os.middleName + " + 유현 " + os.tonicName +
    " 동시 조율 중 (" + tuneName() + " 기준)";
}
/* ---- 3단계: 메모 속 마디 태그 → A-B 루프 (항목 17) ----
   자유 텍스트 메모는 그대로 두고, "N마디" 패턴만 칩으로 뽑아낸다.
   칩을 누르면 그 마디 하나만 A-B 루프로 지정하고 재생 준비 상태로 만든다
   (자동 재생은 하지 않는다). */
function memoMeasureNumbers(text){
  const out = [];
  const re = /(\d+)\s*마디/g;
  let m;
  while((m = re.exec(text || "")) !== null){
    const n = parseInt(m[1], 10);
    const max = (current && current.measures) || 999;
    if(n >= 1 && n <= max && out.indexOf(n) < 0) out.push(n);
  }
  return out;
}
function renderMemoTags(){
  const box = $("memoTags");
  if(!box) return;
  box.textContent = "";
  memoMeasureNumbers($("memoInput").value).forEach(function(n){
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip memo-tag";
    b.textContent = n + "마디";
    b.setAttribute("aria-label", n + "마디만 A-B 루프로 지정");
    b.onclick = function(){ setLoopToMeasure(n); };
    box.appendChild(b);
  });
}
function setLoopToMeasure(n){
  if(!current) return;
  $("loopA").value = n;
  $("loopB").value = n;
  $("loopChk").checked = true;
  loopSelected = true;
  pendingLoopEnd = false;
  renderLoopLayer();
  updateLoopStatus();
  highlightMeasure(n);
  $("nowPlaying").textContent = n + "마디 루프 준비됨 — ▶ 재생을 누르세요";
}
/* ---- 3단계: 마이크 실시간 피치 체크 (항목 18) ----
   getUserMedia + AnalyserNode + 자기상관(autocorrelation)으로 음높이를 추정한다.
   YIN은 넣지 않았다. YIN은 버퍼 전체의 차분 함수(CMNDF)와 임계값 탐색을
   매 프레임 돌려야 해 구현·연산량이 무겁고, 해금 단음 연습처럼 한 번에
   한 음만 내는 용도에는 자기상관으로 충분하기 때문이다.
   마이크는 ON 버튼을 눌러야만 요청한다. 페이지 로드 시 자동 요청은 절대 없다. */
let micStream = null, micAnalyser = null, micRAF = 0, micBuf = null, micLastUpdate = 0;
function estimatePitch(buf, sampleRate){
  const len = buf.length;
  let rms = 0;
  for(let i = 0; i < len; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / len);
  if(rms < 0.01) return null; // 소리가 거의 없음
  // 자기상관: 50~1000Hz 범위의 lag에서 가장 큰 피크를 찾는다
  const minLag = Math.max(1, Math.floor(sampleRate / 1000));
  const maxLag = Math.min(len - 1, Math.ceil(sampleRate / 50));
  let bestLag = -1, bestCorr = 0;
  for(let lag = minLag; lag <= maxLag; lag++){
    let c = 0;
    for(let i = 0; i < len - lag; i++) c += buf[i] * buf[i + lag];
    if(c > bestCorr){ bestCorr = c; bestLag = lag; }
  }
  if(bestLag < 0) return null;
  // 포물선 보간으로 lag를 소수점까지 다듬는다 (cent 정확도를 위해)
  let shift = 0;
  if(bestLag > minLag && bestLag < maxLag){
    let c0 = 0, c1 = 0, c2 = 0;
    for(let i = 0; i < len - bestLag - 1; i++){
      c0 += buf[i] * buf[i + bestLag - 1];
      c1 += buf[i] * buf[i + bestLag];
      c2 += buf[i] * buf[i + bestLag + 1];
    }
    const denom = c0 - 2 * c1 + c2;
    if(denom !== 0) shift = Math.max(-1, Math.min(1, 0.5 * (c0 - c2) / denom));
  }
  return sampleRate / (bestLag + shift);
}
/* 추정 주파수 → 가장 가까운 음이름 + 선택된 A4 기준 cent 차이 */
function freqToNote(freq){
  const midiFloat = 69 + 12 * Math.log2(freq / a4);
  const midi = Math.round(midiFloat);
  const ref = a4 * Math.pow(2, (midi - 69) / 12);
  const cents = Math.round(1200 * Math.log2(freq / ref));
  return {name: midiToName(midi), cents: cents};
}
function micLoop(){
  if(!micAnalyser) return;
  micRAF = requestAnimationFrame(micLoop);
  const now = Date.now();
  if(now - micLastUpdate < 120) return; // 초당 8회만 화면 갱신
  micLastUpdate = now;
  micAnalyser.getFloatTimeDomainData(micBuf);
  const freq = estimatePitch(micBuf, micAnalyser.context.sampleRate);
  const pitchEl = $("micPitch");
  if(freq === null){
    pitchEl.textContent = "소리가 들리지 않습니다";
    return;
  }
  const note = freqToNote(freq);
  pitchEl.textContent = note.name + " · " + (note.cents >= 0 ? "+" : "") + note.cents +
    " cents (" + freq.toFixed(1) + "Hz · " + tuneName() + " 기준)";
}
async function toggleMic(){
  const btn = $("micBtn"), status = $("micStatus");
  if(micStream){ stopMic(); return; }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    status.textContent = "이 브라우저는 마이크 입력을 지원하지 않습니다.";
    return;
  }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({audio: true});
    const ctx = ensureAudio();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    micStream = stream;
    micAnalyser = analyser;
    micBuf = new Float32Array(analyser.fftSize);
    micLastUpdate = 0;
    btn.textContent = "마이크 OFF";
    btn.setAttribute("aria-pressed", "true");
    status.textContent = "듣는 중… 해금을 한 음 내 보세요.";
    $("micPitch").textContent = "소리가 들리지 않습니다";
    micRAF = requestAnimationFrame(micLoop);
  }catch(e){
    if(e && e.name === "NotAllowedError"){
      status.textContent = "마이크 권한이 거부됐습니다. 브라우저 주소창 자물쇠 아이콘에서 마이크를 허용한 뒤 다시 눌러 주세요.";
    }else if(e && (e.name === "NotFoundError" || e.name === "OverconstrainedError")){
      status.textContent = "마이크를 찾을 수 없습니다. 마이크가 연결돼 있는지 확인해 주세요.";
    }else{
      status.textContent = "마이크를 켜지 못했습니다 (" + ((e && e.name) || "오류") + "). 다시 눌러 보세요.";
    }
  }
}
function stopMic(){
  if(micRAF){ cancelAnimationFrame(micRAF); micRAF = 0; }
  if(micStream){
    micStream.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} });
    micStream = null;
  }
  if(micAnalyser){ try{ micAnalyser.disconnect(); }catch(e){} micAnalyser = null; }
  micBuf = null;
  const btn = $("micBtn"), status = $("micStatus"), pitchEl = $("micPitch");
  if(btn){ btn.textContent = "마이크 ON"; btn.setAttribute("aria-pressed", "false"); }
  if(status) status.textContent = "꺼짐 · 켜야만 마이크 권한을 요청합니다.";
  if(pitchEl) pitchEl.textContent = "—";
}
/* ---- 필터 칩: 조표·박자는 pieces.json 태그에서 동적으로 수집 (난이도는 고정) ---- */
function buildFilterChips(){
  const keySet = [], meterSet = [];
  PIECES.forEach(p=>{
    const kl = p.keyLabel || p.key;
    if(kl && keySet.indexOf(kl) < 0) keySet.push(kl);
    (p.tags||[]).forEach(t=>{
      if(/^\d+\/\d+$/.test(t) || t === "변박" || t === "조바꿈"){
        if(meterSet.indexOf(t) < 0) meterSet.push(t);
      }
    });
  });
  const keyBox = $("keyFilters"), meterBox = $("meterFilters");
  keyBox.querySelectorAll(".chip").forEach(c=>c.remove());
  meterBox.querySelectorAll(".chip").forEach(c=>c.remove());
  keySet.forEach(k=>{
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip";
    b.dataset.filter = "key"; b.dataset.value = k; b.textContent = k;
    keyBox.appendChild(b);
  });
  meterSet.forEach(m=>{
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip";
    b.dataset.filter = "meter"; b.dataset.value = m; b.textContent = m;
    meterBox.appendChild(b);
  });
  // "전체" 칩을 다시 맨 앞에 둔다
  [["key", keyBox], ["meter", meterBox]].forEach(pair=>{
    const all = document.createElement("button");
    all.type = "button"; all.className = "chip active";
    all.dataset.filter = pair[0]; all.dataset.value = "all"; all.textContent = "전체";
    pair[1].insertBefore(all, pair[1].querySelector(".chip"));
  });
  applySavedFilters();
}
function applySavedFilters(){
  try{
    const saved = JSON.parse(localStorage.getItem("hspro-filters") || "{}");
    ["level","key","meter"].forEach(f=>{
      if(saved[f]) filters[f] = saved[f];
    });
  }catch(e){}
  document.querySelectorAll(".chip").forEach(ch=>{
    ch.classList.toggle("active", filters[ch.dataset.filter] === ch.dataset.value);
  });
}
function saveFilters(){
  try{ localStorage.setItem("hspro-filters", JSON.stringify(filters)); }catch(e){}
}
/* ---- 3단계: renderList() XSS 방지 — innerHTML 문자열 조립을 전부
   createElement/textContent로 바꿨다. 곡 제목·태그는 pieces.json 데이터라도
   textContent로만 넣는다. 썸네일 onerror 인라인 속성도 없앴다
   (CSP가 인라인 핸들러를 막으므로 JS 프로퍼티로 연결한다). ---- */
function renderList(){
  const grid = $("songGrid");
  grid.textContent = "";
  const list = PIECES.filter(p =>
    (filters.level==="all"||p.level===filters.level) &&
    (filters.key==="all"||(p.tags||[]).includes(filters.key)||p.keyLabel===filters.key) &&
    (filters.meter==="all"||(p.tags||[]).includes(filters.meter)));
  $("filterCount").textContent = "전체 " + PIECES.length + "곡 중 " + list.length + "곡";
  if(!list.length){
    const p = document.createElement("p");
    p.textContent = "조건에 맞는 곡이 없습니다. 필터를 바꿔보세요.";
    grid.appendChild(p);
  }
  list.forEach(p=>{
    const pr = progress[p.no]||{};
    const b = document.createElement("button");
    b.className = "song-card" + (pr.done?" done":"");
    b.type = "button";
    b.setAttribute("aria-label", p.no + "번 " + p.title + " " + p.level);
    const wrap = document.createElement("span");
    wrap.className = "song-thumb-wrap";
    const img = document.createElement("img");
    img.className = "song-thumb";
    img.src = assetUrl("scores/thumbs/"+pad(p.no)+".png");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.draggable = false;
    img.onerror = function(){ img.onerror = null; img.src = assetUrl("scores/"+pad(p.no)+".png"); };
    const fade = document.createElement("span");
    fade.className = "song-thumb-fade";
    wrap.appendChild(img);
    wrap.appendChild(fade);
    const body = document.createElement("span");
    body.className = "song-body";
    const noEl = document.createElement("span");
    noEl.className = "song-no";
    noEl.textContent = p.no + "번 · " + p.level;
    const h = document.createElement("h3");
    h.textContent = p.title;
    const m1 = document.createElement("p");
    m1.className = "song-meta";
    m1.textContent = p.keyLabel + " · " + p.meters;
    const m2 = document.createElement("p");
    m2.className = "song-meta2";
    m2.textContent = p.measures + "마디 · ♩=" + p.tempo;
    const tags = document.createElement("span");
    tags.className = "song-tags";
    (p.tags||[]).forEach(function(t){
      const s = document.createElement("span");
      s.className = "tag";
      s.textContent = t;
      tags.appendChild(s);
    });
    if(pr.done){
      const s = document.createElement("span");
      s.className = "tag done-tag";
      s.textContent = "✓ 완료";
      tags.appendChild(s);
    }
    if(pr.count){
      const s = document.createElement("span");
      s.className = "tag";
      s.textContent = "연습 " + pr.count + "회";
      tags.appendChild(s);
    }
    body.appendChild(noEl);
    body.appendChild(h);
    body.appendChild(m1);
    body.appendChild(m2);
    body.appendChild(tags);
    b.appendChild(wrap);
    b.appendChild(body);
    b.onclick = ()=>openSong(p.no, false);
    grid.appendChild(b);
  });
  const done = PIECES.filter(p=>(progress[p.no]||{}).done).length;
  $("progressSummary").textContent = "진도: "+done+" / "+PIECES.length+"곡 완료";
}
function openSong(no, fromMock){
  const p = PIECES.find(x=>x.no===no); if(!p) return;
  current = p; stopMetro(); stopDrone(); stopStrings(); stopPlayer(); stopReadTimer(); stopMic();
  clearMeasureHighlight(); clearLoopLayer(); loopSelected = false; pendingLoopEnd = false;
  focusSys = 0;
  $("loopA").value = 1; $("loopB").value = p.measures||""; $("loopChk").checked = false;
  updateLoopStatus();
  renderGrouping(null); // pieces.json grouping을 먼저 보여주고, 타임라인을 읽으면 다시 갱신
  loadTimeline(p.no).then(tl=>{
    $("countInLabel").textContent = "예비박 "+tl.count_in.beats+"박";
    if(current === p) renderGrouping(tl);
  }).catch(()=>{ $("countInLabel").textContent = "예비박: 타임라인 준비 중"; });
  loadMeasureBoxes(p.no);
  $("viewer").hidden = false;
  $("mockSummary").hidden = true;
  $("viewerTitle").textContent = p.no+"번 · "+p.title+" — "+p.level+" · "+p.keyLabel+" · "+p.meters+" · "+p.measures+"마디 · ♩="+p.tempo;
  $("scoreImg").src = assetUrl("scores/"+pad(p.no)+".png");
  $("scoreImg").alt = p.no+"번 "+p.title+" 악보";
  $("pdfLink").href = assetUrl("scores/"+pad(p.no)+".pdf");
  const pr = progress[p.no]||{};
  $("doneCheck").checked = !!pr.done;
  $("countLabel").textContent = "연습 횟수: "+(pr.count||0)+"회";
  $("memoInput").value = pr.memo||"";
  renderMemoTags();
  $("mockNav").hidden = !fromMock;
  if(fromMock){
    $("mockLabel").textContent = "모의고사 "+(mockIdx+1)+" / "+mockList.length;
    mockEnterTime = Date.now();
  }
  refreshTonicLabel(); refreshDroneLabel(); refreshOpenStringLabels();
  renderList();
  try{ history.replaceState(null, "", "#song-" + p.no); }catch(e){}
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
function saveProgress(){ store.set(progress); renderList(); renderWeekChart(); }
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
    setTimeout(()=>{ if(el.classList.contains("done")) hideReadTimer(); }, 8000);
  }, 1000);
}
/* ---- 오디오 플레이어: 타임라인 기반 피아노 가이드 + 메트로놈 + 예비박 ---- */
const timelines = {};
let player = {playing:false, nodes:[], timers:[], poll:null, pieceStart:0, countInSec:0, segStart:0, segEnd:0, speed:1, mode:"piano+metro", loop:false, tl:null, fromM:1, toM:0, curM:0};
async function loadTimeline(no){
  if(timelines[no]) return timelines[no];
  const r = await fetch(assetUrl("scores/"+pad(no)+".timeline.json"));
  if(!r.ok) throw new Error("timeline 없음");
  const j = await r.json(); timelines[no]=j; return j;
}
/* 피아노 음색 (2단계 개선): 단순 사인파가 아니라 배음 합성 고도화.
   - 기본음 + 2~6배음 (높은 배음일수록 작고 빨리 감쇠)
   - 기본음 미세 디튠(+1.8센트) 코러스로 따뜻하게
   - 저역통과 필터(음높이 비례)로 날카로움 제거
   - 어택 8ms, 지수 감쇠 + 릴리스 꼬리. 외부 샘플 없음. */
function pianoNoteAt(freq, when, dur){
  const ctx = ensureAudio();
  const out = ctx.createGain(); out.connect(ctx.destination);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = Math.min(8000, Math.max(1200, freq * 6));
  lp.Q.value = 0.4;
  lp.connect(out);
  const len = Math.max(0.45, dur * 1.15);
  out.gain.setValueAtTime(0.0001, when);
  out.gain.exponentialRampToValueAtTime(0.30, when + 0.008);
  out.gain.exponentialRampToValueAtTime(0.0001, when + len + 0.35);
  // [배음 배수, 게인, 감쇠 비율] — 높은 배음은 작고 빨리 사라진다
  const partials = [[1,1.0,1.0],[2,0.42,0.55],[3,0.20,0.35],[4,0.10,0.22],[5,0.05,0.15],[6,0.025,0.10]];
  const nodes = [];
  partials.forEach(function(pr){
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = freq * pr[0];
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(pr[1], when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + len * pr[2] + 0.1);
    o.connect(g); g.connect(lp);
    o.start(when); o.stop(when + len + 0.5);
    nodes.push(o);
  });
  const oD = ctx.createOscillator(), gD = ctx.createGain();
  oD.type = "sine"; oD.frequency.value = freq * 1.0018; // +1.8센트 디튠
  gD.gain.setValueAtTime(0.0001, when);
  gD.gain.exponentialRampToValueAtTime(0.18, when + 0.008);
  gD.gain.exponentialRampToValueAtTime(0.0001, when + len + 0.1);
  oD.connect(gD); gD.connect(lp);
  oD.start(when); oD.stop(when + len + 0.5);
  nodes.push(oD);
  return nodes;
}
/* clickAt: 메트로놈 클릭음. level 2=마디 첫 박(강·1500Hz), 1=그룹 첫 박
   (중강·1200Hz), 0=그 외(약·1000Hz). accent(boolean)만 넘기는 옛 호출도
   그대로 동작한다(accent=true -> level 2). 가이드 재생과 단독 메트로놈이
   이 함수를 공유한다. */
function clickAt(when, accent, level){
  const ctx = ensureAudio();
  const lv = (typeof level === "number") ? level : (accent ? 2 : 0);
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type="square"; o.frequency.value = lv===2?1500:(lv===1?1200:1000);
  g.gain.setValueAtTime(lv===2?0.20:(lv===1?0.15:0.11), when);
  g.gain.exponentialRampToValueAtTime(0.001, when+0.07);
  o.connect(g); g.connect(ctx.destination);
  o.start(when); o.stop(when+0.09);
  return [o];
}
/* ---- 클릭 스케줄: timeline.measure_starts만으로 계산한다 ----
   마디별 박자·템포 변화를 그대로 추적한다. level 2=마디 첫 박(강),
   1=그룹 첫 박(중강), 0=그 외(약). 반환: {t(1.0x 초), m, level, meter, bpm, unit}.
   - 복합박자(6/8·9/8·12/8): 점4분음표 단위 클릭, 그룹 첫 박 중강.
   - 단순박자(2/4·3/4·4/4): 4분음표 단위 클릭, 첫 박만 강.
   - 비대칭박자(5/8·7/8): grouping 경계에서만 클릭. grouping은
     measure_starts의 곡별 값(빔 묶음 실측: 5/8=[3,2], 7/8=[3,2,2])을
     쓰고, 없으면 pieces.json/timeline의 groupings, 최후에는 기본값
     5/8=[3,2], 7/8=[2,2,3]을 쓴다.
   가이드 재생(playSegment)과 단독 메트로놈이 이 함수를 공유한다. */
function groupingFor(ms, tl){
  if(Array.isArray(ms.grouping) && ms.grouping.length) return ms.grouping;
  const label = ms.beats + "/" + ms.beat_type;
  if(tl.groupings && Array.isArray(tl.groupings[label])) return tl.groupings[label];
  if(label === "5/8") return [3, 2];
  if(label === "7/8") return [3, 2, 2]; // 기본값도 실측값(빔 묶음 3+2+2)과 일치시킨다
  return null;
}
function buildClickSchedule(tl, fromM, toM){
  const out = [];
  const ms = tl.measure_starts;
  const lo = Math.max(1, fromM || 1), hi = Math.min(toM || tl.measures, tl.measures);
  for(let i = lo - 1; i < hi; i++){
    const m = ms[i];
    let offsets = [], levels = [];
    if(m.unit === "dotted-quarter"){
      const step = 60 / m.bpm; // 점4분음표 1박
      const n = Math.round((m.beats * (4 / m.beat_type)) / 1.5);
      for(let k = 0; k < n; k++){ offsets.push(k * step); levels.push(k === 0 ? 2 : 1); }
    } else if(m.beat_type === 8 && (m.beats === 5 || m.beats === 7)){
      const g = groupingFor(m, tl) || (m.beats === 5 ? [3, 2] : [2, 2, 3]);
      const eighth = (60 / m.bpm) / 2;
      let pos = 0;
      g.forEach((sz, gi)=>{ offsets.push(pos); levels.push(gi === 0 ? 2 : 1); pos += sz * eighth; });
    } else {
      const step = (60 / m.bpm) * (4 / m.beat_type); // 4분음표 박이면 60/bpm
      for(let k = 0; k < m.beats; k++){ offsets.push(k * step); levels.push(k === 0 ? 2 : 0); }
    }
    offsets.forEach((off, k)=>{
      out.push({t: Math.round((m.start + off) * 1000) / 1000, m: m.m,
                level: levels[k], meter: m.beats + "/" + m.beat_type,
                bpm: m.bpm, unit: m.unit});
    });
  }
  return out;
}
/* ---- 단독 메트로놈: Web Audio 100ms look-ahead 스케줄러 ----
   예전 setInterval(60000/bpm) 고정 4박 방식은 박자 변화를 못 따라가서
   전면 교체했다. AudioContext.currentTime 기준으로 클릭을 미리 예약하므로
   setInterval 지터로 밀리지 않는다. 속도는 속도 슬라이더(0.5x~1.1x)를 읽는다.
   기본은 곡 처음부터 끝까지 반복. 구간 반복(A-B 루프)에 체크하면
   loopA~loopB 구간부터 그 구간만 반복한다. */
let metro = {timer: null, schedule: [], idx: 0, t0: 0,
             segStart: 0, segEnd: 0, speed: 1, fromM: 1, toM: 0, tl: null};
let pendingMetro = false;
function metroSpeed(){
  return speedVal(); // 속도 슬라이더 값을 0.5~1.1로 clamp해서 그대로 쓴다
}
function metroTempoLabel(ms){
  return (ms.unit === "dotted-quarter" ? "♩.=" : "♩=") + ms.bpm;
}
function updateMetroLabel(){
  if(!metro.timer || !metro.tl) return;
  const ctx = audioCtx;
  const pos = metro.segStart + Math.max(0, ctx.currentTime - metro.t0) * metro.speed;
  let cur = metro.tl.measure_starts[metro.fromM - 1] || metro.tl.measure_starts[0];
  for(const m of metro.tl.measure_starts){
    if(m.start <= pos + 0.001 && m.m <= metro.toM) cur = m;
  }
  $("metroBtn").textContent =
    "메트로놈 ON · " + cur.beats + "/" + cur.beat_type + " · " +
    metroTempoLabel(cur) + " · " + cur.m + "마디";
}
function metroTick(){
  if(!metro.timer) return;
  const ctx = ensureAudio();
  let guard = 0;
  while(guard++ < 4){
    if(metro.idx >= metro.schedule.length){
      // 한 바퀴 돌았다: 다음 바퀴 시작점은 정확히 이전 바퀴 끝
      // (t0을 now로 두면 바퀴마다 최대 0.12초씩 빨라진다).
      const oldCycle = (metro.segEnd - metro.segStart) / metro.speed;
      // Speed Trainer가 켜져 있으면 여기서 가속한다 (다음 바퀴부터 적용).
      if($("trainerChk").checked && $("loopChk").checked){
        const ns = nextTrainerSpeed(metro.speed, trainerStepVal());
        if(ns !== metro.speed){ metro.speed = ns; updateSpeedUI(ns); }
      }
      metro.t0 += oldCycle;
      metro.idx = 0;
    }
    const e = metro.schedule[metro.idx];
    const when = metro.t0 + (e.t - metro.segStart) / metro.speed;
    if(when > ctx.currentTime + 0.12) break; // 100ms look-ahead (+여유)
    clickAt(Math.max(when, ctx.currentTime + 0.005), false, e.level);
    metro.idx++;
  }
  updateMetroLabel();
}
function stopMetro(){
  // 가이드 재생(stopPlayer)과는 독립: 메트로놈 타이머만 끄고 버튼만 되돌린다.
  if(metro.timer){ clearInterval(metro.timer); metro.timer = null; }
  metro.schedule = []; metro.idx = 0; metro.tl = null;
  $("metroBtn").textContent = "메트로놈 OFF";
  try{ localStorage.setItem("hspro-metro", "off"); }catch(e){}
  maybeReleaseWakeLock();
}
async function toggleMetro(){
  if(metro.timer){ stopMetro(); return; }
  if(!current) return;
  stopPlayer(); // 시작 시점에만 가이드 재생과 클릭이 겹치지 않게 한다
  let tl;
  try{ tl = await loadTimeline(current.no); }
  catch(e){ $("metroBtn").textContent = "메트로놈 OFF"; return; }
  const speed = metroSpeed();
  const loopOn = $("loopChk").checked;
  const fromM = loopOn ? Math.max(1, Math.min(parseInt($("loopA").value) || 1, tl.measures)) : 1;
  const toM = loopOn ? Math.max(fromM, Math.min(parseInt($("loopB").value) || tl.measures, tl.measures)) : tl.measures;
  const ms = tl.measure_starts;
  const segStart = ms[fromM - 1].start;
  const segEnd = toM < tl.measures ? ms[toM].start : tl.total_sec;
  ensureAudio();
  metro.tl = tl; metro.speed = speed; metro.fromM = fromM; metro.toM = toM;
  metro.segStart = segStart; metro.segEnd = segEnd;
  metro.schedule = buildClickSchedule(tl, fromM, toM);
  metro.idx = 0;
  metro.t0 = audioCtx.currentTime + 0.15;
  metro.timer = setInterval(metroTick, 25);
  try{ localStorage.setItem("hspro-metro", "on"); }catch(e){}
  requestWakeLock();
  updateMetroLabel();
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
  player.curM = 0;
  $("nowPlaying").textContent = "재생 중이 아닙니다.";
  $("playBtn").textContent = "▶ 재생 (예비박부터)";
  clearMeasureHighlight();
  maybeReleaseWakeLock();
}
async function playSegment(opts){
  if(!current) return;
  opts = opts||{};
  stopPlayer(); stopMetro();
  const tl = await loadTimeline(current.no);
  player.tl = tl;
  const speed = opts.speed || speedVal();
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
  player.curM = 0;
  $("countInLabel").textContent = "예비박 "+ci.beats+"박";
  $("playBtn").textContent = "■ 정지";
  requestWakeLock();
  updateLoopStatus();
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
    // 단독 메트로놈과 같은 buildClickSchedule(measure_starts 기반)을 쓴다.
    // tl.clicks와 같은 스케줄이며, 5/8·7/8 그룹핑 강세까지 일치한다.
    buildClickSchedule(tl, fromM, toM).forEach(c=>{
      player.nodes.push(clickAt(pieceStart + (c.t - segStart) / speed, false, c.level));
    });
  }
  // 현재 마디 표시 + 하이라이트 따라가기
  player.poll = setInterval(()=>{
    if(!player.playing) return;
    const el = (ctx.currentTime - pieceStart)*speed;
    if(el < 0){ $("nowPlaying").textContent = "예비박 중… ("+ci.beats+"박)"; return; }
    const t = segStart + el;
    let cur = ms[0].m;
    for(const m of ms){ if(m.start <= t+0.001) cur = m.m; }
    $("nowPlaying").textContent = "지금 "+cur+"마디 / 전체 "+tl.measures+"마디 · "+mode+" · "+speed+"x · "+tuneName();
    if(cur !== player.curM){
      player.curM = cur;
      highlightMeasure(cur);
    }
  }, 150);
  // 종료 처리 (루프면 반복; Speed Trainer가 켜져 있으면 매회 가속)
  const totalMs = (countInSec + (segEnd-segStart)/speed)*1000 + 300;
  player.timers.push(setTimeout(()=>{
    if(!player.playing) return;
    if(player.loop){
      let ns = speed;
      if($("trainerChk").checked){
        ns = nextTrainerSpeed(speed, trainerStepVal());
        updateSpeedUI(ns);
      }
      playSegment({mode, fromM, toM, loop:true, speed:ns});
      return;
    }
    stopPlayer();
  }, totalMs));
}
/* ---- 마디 하이라이트 + A-B 구간 지정 (항목 5) ----
   방식: PNG <img>는 그대로 두고, 빌드 시 Verovio SVG에서 추출한 마디 박스
   (measure-boxes/NNN.json, PNG 분수 좌표)를 절대위치 div로 덧씌운다.
   SVG를 직접 표시하는 방식은 헤더(곡명·템포 줄)가 SVG에 없어 PNG와 달라지고,
   브라우저별 SVG 렌더 차이까지 떠안게 되어, 검증된 PNG 위에 좌표만 얹는
   쪽이 악보가 깨질 위험이 없다. 박스는 오버레이 이미지로 눈으로 검증했다. */
const measureBoxCache = {};
let loopSelected = false, pendingLoopEnd = false;
async function loadMeasureBoxes(no){
  if(measureBoxCache[no]) return measureBoxCache[no];
  try{
    const r = await fetch(assetUrl("measure-boxes/"+pad(no)+".json"));
    if(!r.ok) throw new Error("no boxes");
    const j = await r.json();
    measureBoxCache[no] = j.boxes || [];
    return measureBoxCache[no];
  }catch(e){
    measureBoxCache[no] = [];
    return [];
  }
}
function measureBoxes(){
  return (current && measureBoxCache[current.no]) || [];
}
function boxStyle(el, b, padPct){
  const p = padPct || 0;
  el.style.left = Math.max(0, (b.x0 - p) * 100) + "%";
  el.style.top = Math.max(0, (b.y0 - p * 0.6) * 100) + "%";
  el.style.width = Math.min(100, (b.x1 - b.x0 + p * 2) * 100) + "%";
  el.style.height = Math.min(100, (b.y1 - b.y0 + p * 1.2) * 100) + "%";
}
function highlightMeasure(m){
  const hi = $("measureHi");
  const boxes = measureBoxes();
  if(!m || !boxes[m-1]){ hi.hidden = true; return; }
  boxStyle(hi, boxes[m-1], 0.004);
  hi.hidden = false;
  focusSys = boxes[m-1].sys || 0;
  if($("followChk").checked) scrollHighlightIntoView();
}
function clearMeasureHighlight(){
  $("measureHi").hidden = true;
}
function scrollHighlightIntoView(){
  const hi = $("measureHi");
  if(hi.hidden) return;
  if(document.body.classList.contains("focus")){
    // 집중 뷰: 악보 래퍼 안에서 하이라이트가 보이게만 스크롤 (rect 기준)
    const wrap = $("scoreWrap");
    const wr = wrap.getBoundingClientRect(), hr = hi.getBoundingClientRect();
    if(hr.top < wr.top) wrap.scrollTop -= (wr.top - hr.top) + 12;
    else if(hr.bottom > wr.bottom) wrap.scrollTop += (hr.bottom - wr.bottom) + 12;
  }else{
    hi.scrollIntoView({block: "nearest"});
  }
}
function scrollToSystem(si){
  const boxes = measureBoxes();
  if(!boxes.length) return;
  const nSys = Math.max.apply(null, boxes.map(b=>b.sys)) + 1;
  focusSys = Math.max(0, Math.min(nSys - 1, si));
  const b = boxes.find(x=>x.sys === focusSys);
  if(!b) return;
  const wrap = $("scoreWrap"), stage = $("scoreStage");
  const y = b.y0 * stage.getBoundingClientRect().height;
  if(document.body.classList.contains("focus")){
    wrap.scrollTo({top: Math.max(0, y - 10), behavior: "smooth"});
  }else{
    stage.scrollIntoView({block: "start"});
    window.scrollBy({top: y - 80, behavior: "smooth"});
  }
}
/* 클릭 지점 → 마디 번호. 슬러·헤어핀이 이웃 마디까지 뻗어 잉크 박스가 겹치므로
   x 판정은 오선 구간(sx0~sx1, 겹침 없음)으로, y 판정은 잉크 박스로 한다. */
function measureAtPoint(fx, fy){
  const boxes = measureBoxes();
  for(let i = 0; i < boxes.length; i++){
    const b = boxes[i];
    const x0 = (b.sx0 !== undefined ? b.sx0 : b.x0), x1 = (b.sx1 !== undefined ? b.sx1 : b.x1);
    if(fx >= x0 && fx <= x1 && fy >= b.y0 - 0.012 && fy <= b.y1 + 0.012) return i + 1;
  }
  return 0;
}
function renderLoopLayer(){
  const layer = $("loopLayer");
  layer.innerHTML = "";
  const boxes = measureBoxes();
  if(!loopSelected || !boxes.length || !current) return;
  const a = parseInt($("loopA").value) || 1, b = parseInt($("loopB").value) || 0;
  if(!(a >= 1 && b >= a && b <= current.measures)) return;
  for(let m = a; m <= b; m++){
    if(!boxes[m-1]) continue;
    const d = document.createElement("div");
    d.className = "loop-box";
    boxStyle(d, boxes[m-1], 0.002);
    layer.appendChild(d);
  }
}
function clearLoopLayer(){ $("loopLayer").innerHTML = ""; }
function updateLoopStatus(){
  const el = $("loopStatus");
  if(!current){ el.textContent = ""; return; }
  const a = parseInt($("loopA").value) || 0, b = parseInt($("loopB").value) || 0;
  const valid = a >= 1 && b >= a && b <= current.measures;
  if($("loopChk").checked && valid){
    el.textContent = a + "–" + b + "마디 반복 중" +
      ($("trainerChk").checked ? " · 매회 +" + trainerStepVal() + "% 가속" : "");
  }else if(pendingLoopEnd){
    el.textContent = a + "마디부터 — 끝 마디를 악보에서 Shift+클릭 또는 다시 클릭";
  }else if(loopSelected && valid){
    el.textContent = a + "–" + b + "마디 선택됨 — 반복을 켜면 루프합니다";
  }else{
    el.textContent = "";
  }
}
function onLoopInput(){
  if(!current) return;
  const a = parseInt($("loopA").value) || 0, b = parseInt($("loopB").value) || 0;
  if(a >= 1 && b >= a && b <= current.measures){
    loopSelected = true; pendingLoopEnd = false;
    // 숫자만 입력해도 반복이 켜진다 (체크 해제 상태여도 마찬가지)
    $("loopChk").checked = true;
    renderLoopLayer();
  }
  updateLoopStatus();
}
function onScoreClick(e){
  const boxes = measureBoxes();
  if(!current || !boxes.length) return;
  const rect = $("scoreStage").getBoundingClientRect();
  const fx = (e.clientX - rect.left) / rect.width;
  const fy = (e.clientY - rect.top) / rect.height;
  const m = measureAtPoint(fx, fy);
  if(!m) return;
  if(pendingLoopEnd || e.shiftKey){
    // 끝 마디 지정 (Shift+클릭 또는 두 번째 클릭)
    let a = parseInt($("loopA").value) || 1, b = m;
    if(b < a){ const t = a; a = b; b = t; }
    $("loopA").value = a; $("loopB").value = b;
    pendingLoopEnd = false;
    loopSelected = true;
    $("loopChk").checked = true;
    renderLoopLayer();
  }else{
    // 시작 마디 지정
    $("loopA").value = m;
    $("loopB").value = current.measures;
    pendingLoopEnd = true;
    loopSelected = true;
    clearLoopLayer();
  }
  updateLoopStatus();
}
/* ---- 악보 확대/축소 100%~200% ---- */
let zoomLevel = 1;
function applyZoom(){
  zoomLevel = Math.min(2, Math.max(1, zoomLevel));
  $("scoreWrap").style.setProperty("--zoom", zoomLevel);
  $("zoomLabel").textContent = Math.round(zoomLevel * 100) + "%";
}
/* ---- 오늘의 모의고사: YYYY-MM-DD 시드로 하루 동안 같은 3곡 고정 ---- */
function hashSeed(str){
  let h = 2166136261;
  for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, rng){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
let mockStart = 0, mockEnterTime = 0, mockTimes = {};
function mockOptions(){
  return {
    level: $("mockLevel").value,
    excludeDone: $("mockExcludeDone").checked,
    preferLess: $("mockPreferLess").checked
  };
}
function startMock(dateStr){
  const opts = mockOptions();
  const day = dateStr || todayStr();
  const rng = mulberry32(hashSeed(day + "|" + JSON.stringify(opts)));
  const levels = opts.level === "all" ? ["기초", "중급", "고급"] : [opts.level];
  const perLevel = opts.level === "all" ? 1 : 3;
  const picked = [];
  levels.forEach(lv=>{
    let pool = PIECES.filter(p=>p.level === lv);
    if(opts.excludeDone){
      const rest = pool.filter(p=>!(progress[p.no]||{}).done);
      if(rest.length) pool = rest; // 다 완료했으면 제외를 풀고 전체에서 뽑는다
    }
    if(opts.preferLess){
      pool = pool.slice().sort((a,b)=>((progress[a.no]||{}).count||0) - ((progress[b.no]||{}).count||0));
      const short = pool.slice(0, Math.min(pool.length, perLevel + 2));
      picked.push.apply(picked, seededShuffle(short, rng).slice(0, perLevel));
    }else{
      picked.push.apply(picked, seededShuffle(pool, rng).slice(0, perLevel));
    }
  });
  mockList = picked.map(p=>p.no);
  mockIdx = 0;
  mockStart = Date.now();
  mockTimes = {};
  $("mockPanel").hidden = true;
  openSong(mockList[0], true);
}
function recordMockTime(){
  if(mockIdx < 0 || !current) return;
  mockTimes[current.no] = (mockTimes[current.no] || 0) + (Date.now() - mockEnterTime);
}
function mockGoto(idx){
  if(idx < 0 || idx >= mockList.length) return;
  recordMockTime();
  mockIdx = idx;
  openSong(mockList[mockIdx], true);
}
function fmtDur(ms){
  const s = Math.round(ms / 1000);
  return Math.floor(s / 60) + "분 " + String(s % 60).padStart(2, "0") + "초";
}
function mockFinish(){
  if(mockIdx < 0) return;
  recordMockTime();
  const total = Date.now() - mockStart;
  stopPlayer(); stopMetro();
  $("viewer").hidden = true;
  const body = $("mockSummaryBody");
  body.textContent = "";
  const head = document.createElement("p");
  const headStrong = document.createElement("strong");
  headStrong.textContent = "오늘의 모의고사 완료!";
  head.appendChild(headStrong);
  head.appendChild(document.createTextNode(" · " + todayStr() +
    " · 총 소요 " + fmtDur(total) + " · " + mockList.length + "곡"));
  body.appendChild(head);
  mockList.forEach(no=>{
    const p = PIECES.find(x=>x.no === no);
    const pr = progress[no] || {};
    const row = document.createElement("div");
    row.className = "mock-sum-row";
    const t = mockTimes[no] || 0;
    const span = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = p.no + "번 " + p.title;
    span.appendChild(strong);
    span.appendChild(document.createTextNode(" · " + fmtDur(t) + (pr.done ? " · ✓ 완료" : "")));
    row.appendChild(span);
    ["상", "중", "하"].forEach(r=>{
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (pr.self === r ? " active" : "");
      b.textContent = r;
      b.setAttribute("aria-label", p.no + "번 자가평가 " + r);
      b.onclick = ()=>{
        progress[no] = Object.assign({}, progress[no], {self: r, mockDate: todayStr()});
        saveProgress();
        row.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));
        b.classList.add("active");
      };
      row.appendChild(b);
    });
    body.appendChild(row);
  });
  const note = document.createElement("p");
  note.className = "audio-hint";
  note.textContent = "자가평가(상·중·하)는 곡별 진도에 저장됩니다. 같은 날짜에는 같은 3곡이 나옵니다.";
  body.appendChild(note);
  $("mockSummary").hidden = false;
  mockIdx = -1;
  try{ history.replaceState(null, "", location.pathname + location.search); }catch(e){}
  $("mockSummary").scrollIntoView({block: "start"});
}
function setFocus(on){
  document.body.classList.toggle("focus", on);
  if(!on) document.body.classList.remove("show-audio");
  $("focusBtn").textContent = on ? "집중 뷰 나가기" : "집중 연습 뷰";
  $("audioToggle").textContent = document.body.classList.contains("show-audio") ? "오디오 설정 닫기" : "오디오 설정";
  if(on) requestWakeLock(); else maybeReleaseWakeLock();
}
/* ---- 진도 되돌리기 / 초기화 ---- */
function pushUndo(no){
  undoStack.push({no: no, prev: progress[no] ? JSON.parse(JSON.stringify(progress[no])) : null});
  if(undoStack.length > 20) undoStack.shift();
}
function undoLast(){
  const last = undoStack.pop();
  if(!last){ $("practiceMsg").textContent = "되돌릴 기록이 없습니다."; return; }
  if(last.prev === null) delete progress[last.no];
  else progress[last.no] = last.prev;
  saveProgress();
  if(current && current.no === last.no){
    const pr = progress[current.no] || {};
    $("doneCheck").checked = !!pr.done;
    $("countLabel").textContent = "연습 횟수: " + (pr.count || 0) + "회";
    $("memoInput").value = pr.memo || "";
  }
  $("practiceMsg").textContent = last.no + "번 변경을 되돌렸습니다.";
}
function resetProgress(){
  if(!confirm("진도·메모·연습 기록을 모두 지울까요? (되돌릴 수 없습니다)")) return;
  progress = {};
  undoStack = [];
  store.set(progress);
  renderList(); renderWeekChart();
  if(current){
    const pr = {};
    $("doneCheck").checked = false;
    $("countLabel").textContent = "연습 횟수: 0회";
    $("memoInput").value = "";
    void pr;
  }
  $("practiceMsg").textContent = "모든 진도를 초기화했습니다.";
}
/* ---- 진도 JSON 내보내기 / 가져오기 ---- */
function exportProgress(){
  const data = {app: "hspro", version: 1, exportedAt: new Date().toISOString(), progress: progress};
  const text = JSON.stringify(data, null, 1);
  const blob = new Blob([text], {type: "application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "hspro-progress-" + todayStr() + ".json";
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
  $("practiceMsg").textContent = "진도를 JSON 파일로 내보냈습니다.";
  return text;
}
function validateProgressMap(map){
  const errors = [], clean = {};
  if(!map || typeof map !== "object" || Array.isArray(map)){
    return {ok: false, errors: ["최상위가 곡 번호별 객체가 아닙니다."], clean: null};
  }
  const known = {};
  PIECES.forEach(p=>{ known[p.no] = true; });
  Object.keys(map).forEach(k=>{
    const no = parseInt(k, 10);
    const v = map[k];
    if(isNaN(no) || String(no) !== k){
      errors.push("곡 번호 '" + k + "'가 숫자가 아닙니다."); return;
    }
    if(!known[no]){
      errors.push(no + "번 곡은 목록에 없습니다 (무시합니다)."); return;
    }
    if(!v || typeof v !== "object" || Array.isArray(v)){
      errors.push(no + "번 값이 객체가 아닙니다."); return;
    }
    const c = {};
    if("done" in v){
      if(typeof v.done !== "boolean"){ errors.push(no + "번 done이 true/false가 아닙니다."); return; }
      c.done = v.done;
    }
    if("count" in v){
      if(!Number.isInteger(v.count) || v.count < 0){ errors.push(no + "번 count가 0 이상 정수가 아닙니다."); return; }
      c.count = v.count;
    }
    if("memo" in v){
      if(typeof v.memo !== "string"){ errors.push(no + "번 memo가 문자열이 아닙니다."); return; }
      c.memo = v.memo;
    }
    if("self" in v){
      if(["상", "중", "하"].indexOf(v.self) < 0){ errors.push(no + "번 self가 상/중/하가 아닙니다."); return; }
      c.self = v.self;
    }
    if("mockDate" in v){
      if(typeof v.mockDate !== "string"){ errors.push(no + "번 mockDate가 문자열이 아닙니다."); return; }
      c.mockDate = v.mockDate;
    }
    if("days" in v){
      if(!v.days || typeof v.days !== "object" || Array.isArray(v.days)){
        errors.push(no + "번 days가 날짜별 객체가 아닙니다."); return;
      }
      c.days = {};
      let bad = false;
      Object.keys(v.days).forEach(d=>{
        if(!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isInteger(v.days[d]) || v.days[d] < 0){
          errors.push(no + "번 days의 '" + d + "'가 올바른 날짜/횟수가 아닙니다."); bad = true; return;
        }
        c.days[d] = v.days[d];
      });
      if(bad) return;
    }
    clean[no] = c;
  });
  return {ok: errors.length === 0, errors: errors, clean: clean};
}
function importProgressText(text, mode){
  let parsed;
  try{ parsed = JSON.parse(text); }
  catch(e){ return {ok: false, errors: ["JSON 파싱 실패: " + e.message]}; }
  const map = (parsed && typeof parsed === "object" && parsed.progress) ? parsed.progress : parsed;
  const v = validateProgressMap(map);
  if(!v.ok) return {ok: false, errors: v.errors};
  if(mode === "overwrite"){
    progress = v.clean;
  }else{
    // 병합: 완료·메모·자가평가는 가져온 값이 있으면 그 값으로, 횟수는 큰 쪽으로,
    // 날짜별 횟수는 날짜마다 큰 쪽으로 합친다 (같은 백업을 두 번 합쳐도 두 배가 안 된다).
    Object.keys(v.clean).forEach(k=>{
      const no = parseInt(k, 10), imp = v.clean[no], cur = progress[no] || {};
      const merged = Object.assign({}, cur);
      if("done" in imp) merged.done = imp.done;
      if("memo" in imp && imp.memo) merged.memo = imp.memo;
      if("self" in imp) merged.self = imp.self;
      if("mockDate" in imp) merged.mockDate = imp.mockDate;
      if("count" in imp) merged.count = Math.max(cur.count || 0, imp.count);
      if(imp.days){
        merged.days = Object.assign({}, cur.days);
        Object.keys(imp.days).forEach(d=>{
          merged.days[d] = Math.max(merged.days[d] || 0, imp.days[d]);
        });
      }
      progress[no] = merged;
    });
  }
  saveProgress();
  if(current){
    const pr = progress[current.no] || {};
    $("doneCheck").checked = !!pr.done;
    $("countLabel").textContent = "연습 횟수: " + (pr.count || 0) + "회";
    $("memoInput").value = pr.memo || "";
  }
  return {ok: true, imported: Object.keys(v.clean).length};
}
/* ---- 날짜별 주간 연습량 그래프 (SVG, 외부 라이브러리 없음) ---- */
function renderWeekChart(){
  const box = $("weekChart");
  const days = [];
  const today = new Date();
  for(let i = 6; i >= 0; i--){
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    days.push(todayStr(d));
  }
  const vals = days.map(dt=>{
    let s = 0;
    Object.keys(progress).forEach(k=>{
      const dd = (progress[k] || {}).days;
      if(dd && dd[dt]) s += dd[dt];
    });
    return s;
  });
  const total = vals.reduce((a, b)=>a + b, 0);
  const datedTotal = Object.keys(progress).reduce((s, k)=>{
    const dd = (progress[k] || {}).days || {};
    return s + Object.keys(dd).reduce((a, d)=>a + dd[d], 0);
  }, 0);
  const allCount = Object.keys(progress).reduce((s, k)=>s + ((progress[k] || {}).count || 0), 0);
  const undated = Math.max(0, allCount - datedTotal);
  let note = "최근 7일 연습 " + total + "회";
  if(undated > 0) note += " · 날짜 기록 없는 연습 " + undated + "회 (그래프 제외)";
  if(total === 0 && datedTotal === 0) note += " · 날짜 기록이 아직 없습니다";
  $("weekNote").textContent = note;
  const max = Math.max.apply(null, vals.concat([1]));
  const W = 340, H = 120, base = 100, bw = 30, gap = (W - bw * 7) / 8;
  let bars = "";
  vals.forEach((v, i)=>{
    const h = Math.round(v / max * 70);
    const x = Math.round(gap + i * (bw + gap));
    const y = base - h;
    const label = days[i].slice(5).replace("-", "/");
    bars += "<rect x='" + x + "' y='" + y + "' width='" + bw + "' height='" + h +
      "' rx='4' fill='" + (i === 6 ? "#d9a441" : "#5fb8a6") + "'/>" +
      (v > 0 ? "<text x='" + (x + bw / 2) + "' y='" + (y - 4) + "' font-size='10' text-anchor='middle' fill='currentColor'>" + v + "</text>" : "") +
      "<text x='" + (x + bw / 2) + "' y='" + (base + 14) + "' font-size='9' text-anchor='middle' fill='currentColor'>" + label + "</text>";
  });
  box.innerHTML = "<svg viewBox='0 0 " + W + " " + H + "' role='img' aria-label='최근 7일 연습량 그래프: " +
    vals.join(", ") + "회'>" + bars +
    "<line x1='0' y1='" + base + "' x2='" + W + "' y2='" + base + "' stroke='currentColor' stroke-width='1' opacity='0.3'/></svg>";
}
/* ---- 다음/이전 곡 (단축키용) ---- */
function stepSong(d){
  if(!current) return;
  if(!$("mockNav").hidden){
    if(d < 0) $("mockPrev").click(); else $("mockNext").click();
    return;
  }
  const idx = PIECES.findIndex(p=>p.no === current.no);
  const next = PIECES[(idx + d + PIECES.length) % PIECES.length];
  openSong(next.no, false);
}
document.querySelector(".filters").addEventListener("click", e=>{
  const ch = e.target.closest(".chip");
  if(!ch) return;
  const f = ch.dataset.filter;
  document.querySelectorAll('[data-filter="'+f+'"]').forEach(x=>x.classList.remove("active"));
  ch.classList.add("active");
  filters[f] = ch.dataset.value;
  saveFilters();
  renderList();
});
$("themeBtn").onclick = ()=>{
  const h = document.documentElement;
  const next = h.dataset.theme === "dark" ? "light" : "dark";
  h.dataset.theme = next;
  localStorage.setItem("hspro-theme", next);
  $("themeBtn").textContent = next==="dark" ? "☀️ 라이트" : "🌙 다크";
};
$("mockBtn").onclick = ()=>{
  const p = $("mockPanel");
  p.hidden = !p.hidden;
  if(!p.hidden) $("mockDateLabel").textContent = "오늘 " + todayStr() + " · 같은 날짜에는 같은 3곡이 나옵니다";
};
$("mockClosePanel").onclick = ()=>{ $("mockPanel").hidden = true; };
$("mockStartBtn").onclick = ()=>startMock();
$("mockSummaryClose").onclick = ()=>{
  $("mockSummary").hidden = true;
  if(current){ $("viewer").hidden = false; }
  try{ history.replaceState(null, "", location.pathname + location.search); }catch(e){}
};
$("mockSummaryRetry").onclick = ()=>{ $("mockSummary").hidden = true; startMock(); };
$("closeViewer").onclick = ()=>{ stopMetro(); stopDrone(); stopStrings(); stopPlayer(); stopMic(); hideReadTimer(); setFocus(false); $("viewer").hidden = true; try{ history.replaceState(null, "", location.pathname + location.search); }catch(e){} };
$("playBtn").onclick = async ()=>{
  if(player.playing){ stopPlayer(); return; }
  const a = parseInt($("loopA").value)||1, b = parseInt($("loopB").value)||0;
  const loop = $("loopChk").checked;
  const tl = await loadTimeline(current.no);
  const fromM = Math.max(1, Math.min(a, tl.measures));
  const toM = b>0 ? Math.max(fromM, Math.min(b, tl.measures)) : tl.measures;
  playSegment({fromM, toM, loop});
};
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
  stopDrone(); stopStrings();
  refreshDroneLabel(); refreshTonicLabel(); refreshOpenStringLabels();
};
$("metroBtn").onclick = toggleMetro;
$("droneBtn").onclick = e=>{ if(droneNodes){ stopDrone(); } else { playDrone(a4, "기준음 A4="+a4+"Hz", e.currentTarget); } };
$("tonicBtn").onclick = e=>{ if(!current) return; if(droneNodes){ stopDrone(); } else { const hz = tuneHz(current.tonic||440); playDrone(hz, "으뜸음 "+(current.tonicLabel||"")+" "+hz.toFixed(1)+"Hz", e.currentTarget); } };
/* 3단계: 개방현 조율 버튼 — 곡을 열지 않았으면 아무 소리도 내지 않는다 */
$("midStringBtn").onclick = ()=>{ if(current) playOpenString("middle"); };
$("highStringBtn").onclick = ()=>{ if(current) playOpenString("high"); };
$("tuneSeqBtn").onclick = ()=>{ if(current) playOpenStringsSeq(); };
$("tuneBothBtn").onclick = ()=>{ if(current) playOpenStringsBoth(); };
$("micBtn").onclick = toggleMic;
$("focusBtn").onclick = ()=>{
  const on = !document.body.classList.contains("focus");
  setFocus(on);
  // 2단계 수정: 이미 타이머가 돌고 있거나 "시작하세요!"가 떠 있으면 재시작하지 않는다.
  if(on){ if(!readTimer && $("readTimer").hidden) startReadTimer(30); }
  else { hideReadTimer(); }
};
$("audioToggle").onclick = ()=>{
  const b = document.body;
  b.classList.toggle("show-audio");
  $("audioToggle").textContent = b.classList.contains("show-audio") ? "오디오 설정 닫기" : "오디오 설정";
};
$("doneCheck").onchange = e=>{ if(!current) return; pushUndo(current.no); progress[current.no] = Object.assign({}, progress[current.no], {done:e.target.checked}); saveProgress(); };
$("countBtn").onclick = ()=>{
  if(!current) return;
  pushUndo(current.no);
  const pr = progress[current.no]||{};
  pr.count=(pr.count||0)+1;
  // 날짜 기록: 기존 데이터에 days가 없어도 오늘부터 쌓는다 (과거분은 오늘로 치지 않는다)
  pr.days = pr.days || {};
  const t = todayStr();
  pr.days[t] = (pr.days[t] || 0) + 1;
  progress[current.no]=pr;
  saveProgress();
  $("countLabel").textContent="연습 횟수: "+pr.count+"회";
};
$("memoInput").addEventListener("input", e=>{ if(!current) return; progress[current.no]=Object.assign({}, progress[current.no], {memo:e.target.value}); store.set(progress); renderMemoTags(); });
$("mockPrev").onclick = ()=>{ if(mockIdx>0){ mockGoto(mockIdx-1); } };
$("mockNext").onclick = ()=>{ if(mockIdx<mockList.length-1){ mockGoto(mockIdx+1); } else if(mockIdx===mockList.length-1){ mockFinish(); } };
$("mockFinishBtn").onclick = mockFinish;
$("loopA").addEventListener("input", onLoopInput);
$("loopB").addEventListener("input", onLoopInput);
$("loopChk").addEventListener("change", ()=>{ if($("loopChk").checked) loopSelected = loopSelected || (parseInt($("loopA").value)||0) >= 1; renderLoopLayer(); updateLoopStatus(); });
$("trainerChk").addEventListener("change", updateLoopStatus);
$("trainerStep").addEventListener("change", updateLoopStatus);
$("speedRange").addEventListener("input", ()=>updateSpeedUI());
$("speedMinus").onclick = ()=>updateSpeedUI(speedVal() - SPEED_STEP);
$("speedPlus").onclick = ()=>updateSpeedUI(speedVal() + SPEED_STEP);
$("zoomOut").onclick = ()=>{ zoomLevel -= 0.25; applyZoom(); };
$("zoomIn").onclick = ()=>{ zoomLevel += 0.25; applyZoom(); };
$("followChk").addEventListener("change", ()=>{ if(!$("followChk").checked) clearMeasureHighlight(); });
$("scoreStage").addEventListener("click", onScoreClick);
$("sysPrev").onclick = ()=>scrollToSystem(focusSys - 1);
$("sysNext").onclick = ()=>scrollToSystem(focusSys + 1);
$("collapseBtn").onclick = ()=>{
  const collapsed = document.body.classList.toggle("filters-collapsed");
  $("collapseBtn").textContent = collapsed ? "필터·소개 펼치기 ▼" : "필터·소개 접기 ▲";
  $("collapseBtn").setAttribute("aria-expanded", String(!collapsed));
};
$("exportBtn").onclick = exportProgress;
$("undoBtn").onclick = undoLast;
$("resetBtn").onclick = resetProgress;
$("importFile").addEventListener("change", e=>{
  const f = e.target.files && e.target.files[0];
  if(!f) return;
  const mode = (document.querySelector('input[name="importMode"]:checked') || {}).value || "merge";
  const rd = new FileReader();
  rd.onload = ()=>{
    const res = importProgressText(String(rd.result || ""), mode);
    if(res.ok){
      $("importMsg").textContent = "가져오기 완료: " + res.imported + "곡 " + (mode === "overwrite" ? "덮어쓰기" : "병합") + "했습니다.";
      $("importMsg").className = "import-msg ok";
    }else{
      $("importMsg").textContent = "가져오기 실패: " + res.errors.join(" ");
      $("importMsg").className = "import-msg err";
    }
    renderWeekChart();
  };
  rd.onerror = ()=>{ $("importMsg").textContent = "파일을 읽지 못했습니다."; $("importMsg").className = "import-msg err"; };
  rd.readAsText(f);
  e.target.value = "";
});
/* ---- 단축키: Space=재생/정지, M=메트로놈, ←→=이전/다음 곡.
   입력창·메모창에 포커스가 있을 때는 동작하지 않는다. ---- */
document.addEventListener("keydown", e=>{
  const t = e.target;
  if(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
  if(e.key === " "){
    if(!current) return;
    e.preventDefault();
    $("playBtn").click();
  }else if(e.key === "m" || e.key === "M"){
    if(!current) return;
    toggleMetro();
  }else if(e.key === "ArrowLeft"){
    if(!current) return;
    e.preventDefault();
    stepSong(-1);
  }else if(e.key === "ArrowRight"){
    if(!current) return;
    e.preventDefault();
    stepSong(1);
  }
});
/* 메트로놈 ON 상태로 새로고침했다면, 오디오는 사용자 제스처가 필요하므로
   첫 클릭 때 자동으로 다시 켠다 (바로 켜지지 않는 것은 브라우저 정책 때문이다). */
document.addEventListener("pointerdown", function once(){
  if(pendingMetro && current && !metro.timer){
    pendingMetro = false;
    toggleMetro();
  }
});
function openHashSong(){
  const m = (location.hash || "").match(/^#song-(\d+)$/);
  if(m){
    const no = parseInt(m[1], 10);
    if(PIECES.some(p=>p.no === no)) openSong(no, false);
  }
}
function afterPiecesLoaded(){
  buildFilterChips();
  renderList();
  renderWeekChart();
  openHashSong();
}
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
  // 3단계: 악보 이미지 보호 — 우클릭 메뉴·드래그 저장 방지 (CSS user-select와 함께)
  const si = $("scoreImg");
  si.draggable = false;
  si.addEventListener("contextmenu", function(e){ e.preventDefault(); });
  si.addEventListener("dragstart", function(e){ e.preventDefault(); });
  // 3단계: PWA Service Worker 등록. 실패해도 사이트는 그대로 동작한다.
  // 이미 SW가 제어하던 브라우저에서 새 버전 SW가 활성화되면(배포 직후) 한 번만
  // 새로고침해 최신 앱 껍데기를 받게 한다. 처음 방문(제어자 없음)은 새로고침하지 않고,
  // 연습 재생·메트로놈 중이면 소리를 끊지 않도록 다음 방문으로 미룬다.
  if("serviceWorker" in navigator){
    try{
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener("controllerchange", function(){
        if(!hadController || window.__hsproReloaded) return;
        if(player.playing || metro.timer) return;
        window.__hsproReloaded = true;
        location.reload();
      });
      navigator.serviceWorker.register("sw.js").catch(function(){});
    }catch(e){}
  }
  // 속도 복원 (hspro-speed)
  try{
    const sv = parseFloat(localStorage.getItem("hspro-speed") || "");
    if(!isNaN(sv)) $("speedRange").value = String(Math.min(SPEED_MAX, Math.max(SPEED_MIN, sv)));
  }catch(e){}
  updateSpeedUI();
  // 메트로놈 상태 복원 (hspro-metro): 첫 제스처 때 다시 켠다
  try{ pendingMetro = localStorage.getItem("hspro-metro") === "on"; }catch(e){}
  applyZoom();
  const savedTheme = localStorage.getItem("hspro-theme");
  if(savedTheme){ document.documentElement.dataset.theme = savedTheme; $("themeBtn").textContent = savedTheme==="dark" ? "☀️ 라이트" : "🌙 다크"; }
  $("mockDateLabel").textContent = "오늘 " + todayStr() + " · 같은 날짜에는 같은 3곡이 나옵니다";
  fetch("scores/pieces.json").then(r=>{ if(!r.ok) throw new Error("no json"); return r.json(); })
    .then(j=>{
      const arr = Array.isArray(j) ? j : (j.pieces||[]);
      if(j && typeof j === "object" && !Array.isArray(j) && j.version){
        assetVersion = String(j.version); // 3단계: pieces.json version을 자산 URL에 쓴다
      }
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
            grouping: x.grouping||fb.grouping||{},
            tags: x.tags||fb.tags||[]
          };
        });
      }
      afterPiecesLoaded();
    })
    .catch(()=>afterPiecesLoaded());
})();
