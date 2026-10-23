'use strict';

const field = document.querySelector('#field');
const star = document.querySelector('#star');
const message = document.querySelector('#message');
const start = document.querySelector('#start');
const scoreLabel = document.querySelector('#score');
const timeLabel = document.querySelector('#time');
const bestLabel = document.querySelector('#best');
const timerTrack = document.querySelector('.timer-track');
const timerFill = document.querySelector('.timer-fill');
const room = document.querySelector('.room-panel');
const soundButton = document.querySelector('#sound');
const duration = 20;
const bestKey = 'little-game-best';
let score = 0;
let best = 0;
let timer = null;
let deadline = 0;
let soundEnabled = false;
let audio = null;

try {
  const saved = Number(localStorage.getItem(bestKey));
  if (Number.isSafeInteger(saved) && saved >= 0) best = saved;
} catch { /* The game also works when browser storage is unavailable. */ }
bestLabel.textContent = best;

function chime(frequency = 660) {
  if (!soundEnabled || !audio) return;
  const note = audio.createOscillator();
  const gain = audio.createGain();
  note.type = 'sine';
  note.frequency.setValueAtTime(frequency, audio.currentTime);
  note.frequency.exponentialRampToValueAtTime(frequency * 1.5, audio.currentTime + 0.12);
  gain.gain.setValueAtTime(0, audio.currentTime);
  gain.gain.linearRampToValueAtTime(0.08, audio.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.3);
  note.connect(gain);
  gain.connect(audio.destination);
  note.start();
  note.stop(audio.currentTime + 0.32);
  note.onended = () => { note.disconnect(); gain.disconnect(); };
}

soundButton.addEventListener('click', async () => {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') await audio.resume();
    soundEnabled = !soundEnabled;
    soundButton.setAttribute('aria-pressed', String(soundEnabled));
    const label = soundEnabled ? '효과음 끄기' : '효과음 켜기';
    soundButton.setAttribute('aria-label', label);
    soundButton.title = label;
    chime();
  } catch {
    soundEnabled = false;
    soundButton.setAttribute('aria-pressed', 'false');
    soundButton.setAttribute('aria-label', '이 브라우저에서는 효과음을 사용할 수 없어요');
    soundButton.title = '이 브라우저에서는 효과음을 사용할 수 없어요';
  }
});

function moveStar() {
  const padding = 18;
  const topInset = 58;
  const width = Math.max(0, field.clientWidth - star.offsetWidth - padding * 2);
  const height = Math.max(0, field.clientHeight - star.offsetHeight - topInset - padding);
  star.style.left = padding + Math.random() * width + 'px';
  star.style.top = topInset + Math.random() * height + 'px';
}

function bringGameIntoView() {
  if (window.matchMedia('(max-width: 960px)').matches) {
    field.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}

function updateTime(time) {
  timeLabel.textContent = time;
  timerFill.style.width = time / duration * 100 + '%';
  timerTrack.setAttribute('aria-valuenow', time);
  timerTrack.classList.toggle('urgent', time <= 5);
}

function finish() {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
  const returnFocus = document.activeElement === star;
  star.style.display = 'none';
  room.dataset.state = 'finished';
  updateTime(0);
  const isRecord = score > best;
  if (isRecord) {
    best = score;
    bestLabel.textContent = best;
    try { localStorage.setItem(bestKey, String(best)); } catch { /* Optional persistence. */ }
  }
  document.querySelector('#message-title').textContent = `오늘은 별 ${score}개를 모았어요`;
  document.querySelector('#message-detail').textContent = isRecord
    ? '새로운 최고 기록이에요! 반짝이는 순간을 기억해요.'
    : '작은 별빛만큼 마음도 포근해졌길 바라요.';
  message.hidden = false;
  document.querySelector('#start-label').textContent = '한 번 더 모으기';
  document.querySelector('#timer-status').textContent = '포근한 순간이었길 바라요';
  start.disabled = false;
  if (returnFocus) start.focus({ preventScroll: true });
  chime(440);
}

start.addEventListener('click', () => {
  if (timer !== null) return;
  score = 0;
  scoreLabel.textContent = score;
  updateTime(duration);
  message.hidden = true;
  field.querySelectorAll('.catch-effect').forEach(effect => effect.remove());
  star.style.display = 'block';
  start.disabled = true;
  room.dataset.state = 'playing';
  document.querySelector('#start-label').textContent = '별을 모으는 중';
  document.querySelector('#timer-status').textContent = '반짝이는 별을 찾아보세요';
  moveStar();
  deadline = performance.now() + duration * 1000;
  timer = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
    updateTime(remaining);
    if (remaining === 0) finish();
  }, 100);
  star.focus({ preventScroll: true });
  // A tap on a below-the-fold start button must bring every target into view.
  bringGameIntoView();
  chime(523.25);
});

star.addEventListener('click', () => {
  if (timer === null) return;
  if (performance.now() >= deadline) { finish(); return; }
  scoreLabel.textContent = ++score;
  const effect = document.createElement('span');
  effect.className = 'catch-effect';
  effect.textContent = '+1 ✦';
  effect.setAttribute('aria-hidden', 'true');
  effect.style.left = star.offsetLeft + 8 + 'px';
  effect.style.top = star.offsetTop + 'px';
  field.append(effect);
  setTimeout(() => effect.remove(), 700);
  chime(660 + score % 5 * 55);
  moveStar();
});

new ResizeObserver(() => {
  if (timer === null) return;
  moveStar();
  // Rotation can move the board below the fold even if it fit before.
  requestAnimationFrame(bringGameIntoView);
}).observe(field);
