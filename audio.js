/* audio.js — Ambient soundscape for Yellowstone simulation
   ─────────────────────────────────────────────────────────
   • nature ambience.mp3  : loops quietly throughout
   • wolf.mp3             : plays when wolves are introduced / pack grows
   • Elk.mp3              : plays softly at random intervals while elk visible
   • Bear.mp3             : plays once when bears appear (W ≥ 18)
   • heron.mp3            : plays once when herons appear (W ≥ 11)
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const DIR = 'sounds/';

  /* ── Track config ───────────────────────────────────────── */
  const CFG = {
    ambience: { file: 'nature ambience.mp3', loop: true,  vol: 0.80 },
    wolf:     { file: 'wolf.mp3',            loop: false, vol: 0.40 },
    elk:      { file: 'Elk.mp3',             loop: false, vol: 0.30 },
    bear:     { file: 'Bear.mp3',            loop: false, vol: 0.35 },
    heron:    { file: 'heron.mp3',           loop: false, vol: 0.40 },
    beaver:   { file: 'beaver.mp3',          loop: false, vol: 0.30 },
  };

  const snd = {};
  Object.entries(CFG).forEach(([k, c]) => {
    snd[k]        = new Audio(DIR + c.file);
    snd[k].loop   = c.loop;
    snd[k].volume = c.vol;
  });

  /* ── State ──────────────────────────────────────────────── */
  let ambienceGoing = false;
  let prevW         = -1;
  let elkTimer      = null;

  // One-shot triggers: reset when W drops back below threshold
  const oneShot = { wolf: false, heron: false, bear: false, beaver: false };
  const THRESHOLDS = { wolf: 1, heron: 11, bear: 18, beaver: 15 };

  /* ── Ambience: fade in on first interaction ─────────────── */
  function startAmbience() {
    if (ambienceGoing) return;
    ambienceGoing = true;
    fadeIn(snd.ambience, CFG.ambience.vol, 2500);
  }

  /* ── Smooth fade-in ─────────────────────────────────────── */
  function fadeIn(a, targetVol, ms) {
    a.volume = 0;
    a.play().catch(() => {});
    const STEPS = 50, stepMs = ms / STEPS;
    let i = 0;
    const id = setInterval(() => {
      i++;
      a.volume = Math.min(targetVol, (i / STEPS) * targetVol);
      if (i >= STEPS) clearInterval(id);
    }, stepMs);
  }

  /* ── Play a sound after an optional delay ───────────────── */
  function playAfter(key, delayMs) {
    setTimeout(() => {
      const a = snd[key];
      a.currentTime = 0;
      a.play().catch(() => {});
    }, delayMs || 0);
  }

  /* ── Elk ambient calls: random interval while elk present ── */
  function scheduleElkCall(W) {
    clearTimeout(elkTimer);
    if (W <= 0) return;
    // Elk calls more frequent at low wolf count (big herd), sparser as wolves grow
    const minMs = W < 8  ? 9000  : 14000;
    const maxMs = W < 8  ? 18000 : 28000;
    const delay = minMs + Math.random() * (maxMs - minMs);
    elkTimer = setTimeout(() => {
      playAfter('elk');
      scheduleElkCall(prevW); // reschedule using latest W
    }, delay);
  }

  /* ── Main update — called on every wolf count change ─────── */
  function onWolfChange(W) {
    startAmbience();

    /* — One-shot animal triggers — */
    Object.keys(oneShot).forEach(key => {
      const thr = THRESHOLDS[key];
      if (W >= thr && !oneShot[key]) {
        oneShot[key] = true;
        // Stagger each sound so they don't pile up
        const jitter = 600 + Math.random() * 1400;
        playAfter(key, jitter);
      }
      if (W < thr) oneShot[key] = false; // allow re-trigger if slider goes back up
    });

    /* — Extra wolf howl at pack milestones — */
    if (W > prevW && W >= 5 && W % 5 === 0) {
      playAfter('wolf', 1000 + Math.random() * 800);
    }

    /* — Start / stop elk ambient loop — */
    if (prevW <= 0 && W > 0) scheduleElkCall(W);
    if (W <= 0)              { clearTimeout(elkTimer); elkTimer = null; }

    prevW = W;
  }

  /* ── Mute button ────────────────────────────────────────── */
  let muted = false;

  function buildMuteBtn() {
    const btn = document.createElement('button');
    btn.id = 'audio-mute';
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', 'Mute sounds');
    btn.innerHTML = `
      <svg id="mute-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M19.07 4.93a10 10 0 010 14.14"/>
        <path d="M15.54 8.46a5 5 0 010 7.07"/>
      </svg>
      <span id="mute-label">Sound</span>`;
    document.getElementById('hero').appendChild(btn);

    btn.addEventListener('click', () => {
      muted = !muted;
      btn.setAttribute('aria-pressed', muted);
      btn.classList.toggle('muted', muted);
      Object.values(snd).forEach(a => { a.muted = muted; });

      const icon = document.getElementById('mute-icon');
      const label = document.getElementById('mute-label');
      if (muted) {
        icon.innerHTML = `
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <line x1="23" y1="9" x2="17" y2="15"/>
          <line x1="17" y1="9" x2="23" y2="15"/>`;
        label.textContent = 'Muted';
      } else {
        icon.innerHTML = `
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M19.07 4.93a10 10 0 010 14.14"/>
          <path d="M15.54 8.46a5 5 0 010 7.07"/>`;
        label.textContent = 'Sound';
      }
    });
  }

  /* ── Wire up to the wolf slider ─────────────────────────── */
  function init() {
    const slider = document.getElementById('wolf-slider');
    if (!slider) { setTimeout(init, 150); return; }

    slider.addEventListener('input', e => onWolfChange(+e.target.value));

    document.addEventListener('click', startAmbience, { once: true });
    document.addEventListener('keydown', startAmbience, { once: true });

    buildMuteBtn();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
