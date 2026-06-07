<template>
  <div class="game-wrap" :style="wrapStyle">
  <canvas ref="canvasRef" class="game-canvas" />

  <!-- Cutscene fade-to-black (hides U-turn / level swap) -->
  <div class="cs-fade-black" :class="{ active: csPhase === 'turn' }" />

  <!-- Cutscene overlay -->
  <Transition name="cs-fade">
    <div v-if="gameState === 'CUTSCENE'" class="cs-overlay">
      <div class="cs-card">
        <div class="cs-eyebrow">TOM'S GARDEN CARE</div>
        <div class="cs-title">NEXT JOB</div>
        <div class="cs-level">LEVEL {{ level }}</div>
        <div class="cs-skip">SPACE to skip</div>
      </div>
    </div>
  </Transition>

  <!-- HUD (always visible during play) -->
  <div class="hud" v-if="gameState === 'PLAYING'">
    <div class="logo">
      <div class="logo-top">TOM'S GARDEN CARE</div>
      <div class="logo-bot">Professional Hedge Trimming</div>
    </div>

    <div class="patience-wrap">
      <div class="patience-label">PATIENCE</div>
      <div class="patience-track" :class="{ danger: patience < 0.3 }">
        <div class="patience-fill" :style="{ width: pctStr, background: patienceColor }" />
      </div>
    </div>

    <div class="progress-badge">
      <div class="level-badge">LEVEL {{ level }}</div>
      <div class="score-display">{{ score.toLocaleString() }}</div>
      <span v-if="trimmed > 0">{{ trimmed }} left to trim</span>
      <span v-else class="done-text">All clear!</span>
    </div>

    <!-- Level-cleared flourish -->
    <Transition name="toast">
      <div v-if="clearedToast !== null" class="level-toast">
        LEVEL {{ clearedToast }} CLEARED!
        <div class="level-toast-sub">{{ levelClearedMessage }}</div>
      </div>
    </Transition>

    <Transition name="bonus">
      <div :key="bonusPopKey" v-if="bonusPopText && gameState === 'PLAYING'" class="bonus-pop">
        {{ bonusPopText }}
      </div>
    </Transition>

    <!-- Aim crosshair -->
    <div
      v-show="aimPos.visible"
      class="aim-crosshair"
      :class="{ snippable: aimPos.snippable }"
      :style="{ left: aimPos.x + '%', top: aimPos.y + '%' }"
    >
      <div class="aim-ring" />
      <div class="aim-arm aim-top" />
      <div class="aim-arm aim-bottom" />
      <div class="aim-arm aim-left" />
      <div class="aim-arm aim-right" />
      <div class="aim-blades">✂</div>
    </div>

    <div
      class="speech-bubble"
      :class="{ urgent: patience < 0.3 }"
      :key="speechText"
      :style="{ left: couplePos.x + '%', top: couplePos.y + '%' }"
    >
      {{ speechText }}
      <div class="bubble-tail" />
    </div>
  </div>

  <!-- MENU modal -->
  <Transition name="modal">
    <div v-if="gameState === 'MENU'" class="modal-wrap">
      <div class="modal-card">
        <div class="card-brand">
          <span class="brand-name">TOM'S GARDEN CARE</span>
          <span class="brand-sub">Sheffield's Finest Camel Gardening Service</span>
        </div>
        <div class="card-rule"><span>❧</span></div>
        <div class="game-title">CAMEL<br>CLIPPER</div>
        <div class="card-rule"><span>❧</span></div>
        <p class="card-body">
          Trim the overgrown hedge sections<br>
          before the couple lose their patience!
        </p>
        <div class="controls-row">
          <span class="ctrl-key">← →</span><span class="ctrl-label">move</span>
          <span class="ctrl-sep">·</span>
          <span class="ctrl-key">SPACE</span><span class="ctrl-label">snip</span>
        </div>
        <div v-if="hiScore > 0" class="hi-score-row">
          <span class="hi-score-label">HI-SCORE</span>
          <span class="hi-score-val">{{ hiScore.toLocaleString() }}</span>
          <span v-if="highestLevel > 0" class="hi-level-val">· BEST LEVEL {{ highestLevel }}</span>
        </div>
        <div class="card-rule"><span>✦</span></div>
        <div class="press-start blink">PRESS SPACE TO START</div>
      </div>
    </div>
  </Transition>

  <!-- WIN modal -->
  <Transition name="modal">
    <div v-if="gameState === 'WIN'" class="modal-wrap centred">
      <div class="modal-card win">
        <div class="card-glyph win-glyph">✦</div>
        <div class="result-title win-title">SPLENDID!</div>
        <div class="card-rule win-rule"><span>❧</span></div>
        <p class="card-body">
          {{ winMessage }}
        </p>
        <div class="score-result">
          <div class="score-result-val">{{ score.toLocaleString() }}</div>
          <div class="score-result-label">FINAL SCORE</div>
          <div v-if="score >= hiScore && score > 0" class="new-hi">NEW HI-SCORE!</div>
        </div>
        <div class="card-rule win-rule"><span>✦</span></div>
        <div class="press-start blink">PRESS SPACE TO PLAY AGAIN</div>
      </div>
    </div>
  </Transition>

  <!-- GAME OVER modal -->
  <Transition name="modal">
    <div v-if="gameState === 'GAME_OVER'" class="modal-wrap centred">
      <div class="modal-card lose">
        <div class="card-glyph lose-glyph">☙</div>
        <div class="result-title lose-title">OH DEAR&hellip;</div>
        <div class="card-rule lose-rule"><span>❧</span></div>
        <p class="card-body">
          The old couple have stormed inside in a huff.<br>
          You reached <strong>Level {{ level }}</strong> &mdash;
          {{ trimmed }} section{{ trimmed !== 1 ? 's' : '' }} still left to trim!
        </p>
        <div class="score-result">
          <div class="score-result-val">{{ score.toLocaleString() }}</div>
          <div class="score-result-label">FINAL SCORE</div>
          <div class="score-hi-row">HI: {{ hiScore.toLocaleString() }} · BEST LVL {{ highestLevel || level }}</div>
        </div>
        <div class="card-rule lose-rule"><span>✦</span></div>
        <div class="press-start blink">PRESS SPACE TO TRY AGAIN</div>
      </div>
    </div>
  </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import Game from './Game';

function letterboxRect() {
  const TARGET = 16 / 9;
  const vw = window.innerWidth, vh = window.innerHeight;
  if (vw / vh > TARGET) {
    const h = vh, w = Math.round(h * TARGET);
    return { width: w + 'px', height: h + 'px' };
  } else {
    const w = vw, h = Math.round(w / TARGET);
    return { width: w + 'px', height: h + 'px' };
  }
}
const wrapStyle = ref(letterboxRect());

const canvasRef   = ref<HTMLCanvasElement | null>(null);
const gameState   = ref('MENU');
const patience    = ref(1);
const trimmed     = ref(0);
const total       = ref(6);
const level       = ref(1);
const clearedToast = ref<number | null>(null);
const couplePos   = ref({ x: 80, y: 20 });
const aimPos      = ref({ x: 50, y: 50, snippable: false, visible: false });
const winMessage  = ref('');
const levelClearedMessage = ref('');
const score         = ref(0)
const hiScore       = ref(0)
const highestLevel  = ref(0)
const bonusPopText  = ref('')
const bonusPopKey   = ref(0)
const csPhase       = ref('')

let game: Game | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
const _onResize = () => { wrapStyle.value = letterboxRect(); };

const pctStr = computed(() => `${Math.round(patience.value * 100)}%`);

const patienceColor = computed(() => {
  const p = patience.value;
  if (p > 0.6) return '#27ae60';
  if (p > 0.3) return '#f39c12';
  return '#e74c3c';
});

const SPEECH_BANDS: [string[], number][] = [
  [[ // ≥ 0.85 — blissfully oblivious, wistful
    "Take your time, dear!",
    "No rush at all, love!",
    "Our Gerald used to trim this himself. Bless him.",
    "Reminds me of when we had the privet in Rotherham.",
    "Lovely day for it, isn't it, Bob?",
    "Our Sheila's coming Sunday — this'll look a treat.",
    "We always said, a tidy hedge is a tidy mind.",
    "You know, camels are quite underrated in horticulture.",
    "Bob planted this hedge in '89. We were so young.",
    "I used to press flowers from that very hedge, you know.",
    "You carry on, we'll just have our Hobnobs.",
  ], 0.85],
  [[ // ≥ 0.70 — chatty, self-absorbed, pleased
    "You're doing wonderfully!",
    "Bob says you're the best in South Yorkshire.",
    "We had a man called Derek once. Not a patch on you.",
    "This hedge has been here since '89, you know.",
    "I once wrote a letter to the council about this hedge.",
    "Our grandson wanted to be a gardener. We talked him out of it.",
    "Did I mention we're going to Scarborough in August?",
    "Bob won a prize for this hedge in 2003. Didn't you, Bob.",
    "The Hendersons next door have a very inferior hedge, frankly.",
    "I've made a Victoria sponge, if you fancy a slice after.",
    "You remind me of our nephew Keith. He's very dedicated.",
  ], 0.70],
  [[ // ≥ 0.55 — mild urgency but still mostly about themselves
    "Chop chop, if you please!",
    "We do have a schedule, you know.",
    "Bob's programme starts at half two.",
    "I've got a quiche in. It won't keep forever.",
    "Marvellous commitment, but perhaps a touch faster?",
    "The neighbours will be watching. They always are.",
    "Our Dorothy said hiring a camel was a mistake. Prove her wrong.",
    "I don't like to fuss, but I am beginning to fuss slightly.",
    "Bob has a Rotary thing at three. Bob, tell him.",
  ], 0.55],
  [[ // ≥ 0.40 — properly impatient, grievances mounting
    "We haven't got all day!",
    "Our Dorothy said this would happen.",
    "The WI meeting's at four and I'm chairing it.",
    "Bob's blood pressure can't take much more, frankly.",
    "I've been very patient. I have. Ask anyone.",
    "We paid good money for a quick trim, not a saga.",
    "This is NOT what the leaflet described.",
    "Bob, are you timing this? Bob. BOB.",
    "I've done faster trims myself and I've a bad hip!",
  ], 0.40],
  [[ // ≥ 0.25 — alarmed, self-absorbed panic
    "The lamb's going COLD!",
    "Bob's missed his pills because of all this!",
    "I've had LESS stress organising the village fête!",
    "Our Norman could do this in twenty minutes. Norman!",
    "My back teeth are floating!",
    "I am NOT a confrontational person but I am CONSIDERING it.",
    "This has ruined my afternoon AND my evening.",
    "The hedge looked better wild, Bob. I'm saying it.",
  ], 0.25],
  [[ // ≥ 0.12 — full meltdown, all about them
    "My sister arrives at FOUR!",
    "This is going on TripAdvisor!",
    "I'm telling the camel union about this!",
    "Bob's having a moment. BOB, SIT DOWN.",
    "I've not been this distressed since the Bake Off incident!",
    "I'm ringing our Maureen. She'll know what to do.",
    "If this hedge isn't done I swear I'll move to a bungalow.",
    "We had a MAN for this. A HUMAN man. Where is he.",
  ], 0.12],
  [[ // ≥ 0.00 — absolute final straw
    "I'm calling someone else!!!",
    "That's it. We're getting a GOAT.",
    "Right, I'm ringing our Trevor. He knows a man.",
    "NEVER AGAIN. Never. The hedge can stay wild.",
    "Bob, get in the car. We're leaving.",
    "I want my money back AND an apology.",
  ], 0.00],
];

const WIN_SPEECHES: string[] = [
  "Bob, look! Finest hedge work in Sheffield!",
  "You've done us right proud, Tom. Cuppa tea?",
  "Best camel gardener we've ever hired. Brilliant!",
  "Absolutely spiffing! That hedge looks champion.",
  "Tom, you're a legend. Same time next month?",
  "Perfect trim! Your reputation's well earned, lad.",
  "Right then, job's a good 'un. What's next?",
  "I'm putting you on the Christmas card list, Tom.",
  "Wait till I tell Dorothy. She'll be ever so put out.",
  "Bob, take a photo. Go on, take one. BOB.",
  "Better than Derek ever managed, and that's saying something.",
  "Our Gerald would've loved that. God rest him.",
  "Right, I'm making that pot of tea. You've earned it.",
];

let _winBag: string[] = [];
function pickWinSpeech(): string {
  if (_winBag.length === 0) {
    _winBag = [...WIN_SPEECHES].sort(() => Math.random() - 0.5);
  }
  return _winBag.pop()!;
}

const speechText = ref('');
let _speechBandIdx = -1;
watch(patience, (p) => {
  for (let i = 0; i < SPEECH_BANDS.length; i++) {
    if (p >= SPEECH_BANDS[i][1]) {
      if (i !== _speechBandIdx) {
        _speechBandIdx = i;
        const msgs = SPEECH_BANDS[i][0];
        speechText.value = msgs[Math.floor(Math.random() * msgs.length)];
      }
      return;
    }
  }
  const lastIdx = SPEECH_BANDS.length - 1;
  if (lastIdx !== _speechBandIdx) {
    _speechBandIdx = lastIdx;
    const msgs = SPEECH_BANDS[lastIdx][0];
    speechText.value = msgs[Math.floor(Math.random() * msgs.length)];
  }
}, { immediate: true });

onMounted(() => {
  window.addEventListener('resize', _onResize);
  if (!canvasRef.value) return;
  game = new Game(canvasRef.value, {
    onCutscenePhase:   (phase) => { csPhase.value = phase; },
    onStateChange:     (s) => {
      gameState.value = s;
      if (s !== 'CUTSCENE') csPhase.value = '';
      if (s !== 'PLAYING') aimPos.value.visible = false;
      if (s === 'WIN') {
        winMessage.value = pickWinSpeech();
      }
    },
    onPatience:        (p) => { patience.value  = p; },
    onProgress:        (t, tot) => { trimmed.value = t; total.value = tot; },
    onCoupleScreenPos: (x, y) => { couplePos.value = { x, y }; },
    onAimScreenPos:    (x, y, snippable) => { aimPos.value = { x, y, snippable, visible: true }; },
    onLevel:           (l) => { level.value = l; },
    onLevelCleared:    (l) => {
      aimPos.value.visible = false;
      clearedToast.value = l;
      levelClearedMessage.value = pickWinSpeech();
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { clearedToast.value = null; }, 3200);
    },
    onScore:         (s) => { score.value = s; },
    onHighScore:     (hs, hl) => { hiScore.value = hs; highestLevel.value = hl; },
    onLevelBonus:    (bonus, _total) => {
      bonusPopText.value = '+' + bonus.toLocaleString() + ' TIME BONUS!';
      bonusPopKey.value++;
    },
  });
  game.start();
});

onUnmounted(() => {
  window.removeEventListener('resize', _onResize);
  if (toastTimer) clearTimeout(toastTimer);
  game?.destroy();
});

</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Luckiest+Guy&display=swap');

.game-wrap {
  position: relative;
  overflow: hidden;
}

.game-canvas {
  display: block;
}

/* ── HUD ──────────────────────────────────────────────────── */
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  font-family: 'Luckiest Guy', cursive;
  color: #fff;
}

.logo {
  position: absolute;
  top: 14px;
  left: 18px;
  text-shadow: 2px 2px 0 #000;
}
.logo-top { font-size: 17px; color: #f5e6c8; letter-spacing: 0; }
.logo-bot { font-size: 11px; color: #c8a87a; margin-top: 4px; }

.patience-wrap {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  width: 260px;
  text-align: center;
}
.patience-label {
  font-size: 14px;
  margin-bottom: 6px;
  text-shadow: 1px 1px 0 #000;
  letter-spacing: 0;
}
.patience-track {
  height: 16px;
  background: rgba(0,0,0,0.4);
  border: 2px solid rgba(255,255,255,0.3);
  border-radius: 2px;
  overflow: hidden;
}
.patience-track.danger {
  animation: patience-pulse 0.9s ease-in-out infinite;
}
.patience-fill {
  height: 100%;
  transition: width 0.3s linear, background 0.5s;
}

.progress-badge {
  position: absolute;
  top: 14px;
  right: 18px;
  font-size: 15px;
  text-shadow: 2px 2px 0 #000;
  text-align: right;
}
.done-text { color: #2ecc71; }
.level-badge {
  font-size: 20px;
  color: #ffe9a8;
  text-shadow: 2px 2px 0 #000;
  margin-bottom: 2px;
}

/* Level-cleared flourish — centered banner that pops then fades */
.level-toast {
  position: absolute;
  top: 32%;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'Luckiest Guy', cursive;
  font-size: clamp(32px, 6vw, 56px);
  color: #eaffd0;
  text-shadow: 3px 3px 0 rgba(30,80,15,0.6), 0 0 22px rgba(120,220,80,0.6);
  white-space: nowrap;
  pointer-events: none;
  text-align: center;
}
.level-toast-sub {
  font-size: clamp(14px, 2vw, 22px);
  color: #d6f0c0;
  text-shadow: 2px 2px 0 rgba(30,80,15,0.5);
  margin-top: 6px;
  letter-spacing: 1px;
}
.toast-enter-active { animation: toast-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
.toast-leave-active { animation: toast-fade 0.5s ease-in forwards; }
@keyframes toast-pop {
  from { opacity: 0; transform: translateX(-50%) scale(0.6); }
  to   { opacity: 1; transform: translateX(-50%) scale(1);   }
}
@keyframes toast-fade {
  from { opacity: 1; transform: translateX(-50%) scale(1);    }
  to   { opacity: 0; transform: translateX(-50%) scale(1.15); }
}

.speech-bubble {
  position: absolute;
  max-width: 220px;
  /* Shift so the tail tip aligns to the projected couple position */
  transform: translate(-50%, calc(-100% - 16px));
  background: rgba(255,255,255,0.92);
  color: #2c3e50;
  font-size: 14px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 2px solid #555;
  line-height: 1.5;
  text-align: center;
  transition: background 0.4s;
  animation: bubble-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  white-space: nowrap;
}
.speech-bubble.urgent {
  background: rgba(255, 220, 220, 0.95);
  animation: bubble-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
             bubble-urgent-border 0.8s ease-in-out infinite;
}
.bubble-tail {
  position: absolute;
  bottom: -12px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-top: 12px solid rgba(255,255,255,0.92);
}

/* ── Aim crosshair ────────────────────────────────────────── */
.aim-crosshair {
  position: absolute;
  width: 0;
  height: 0;
  transform: translate(-50%, -50%);
  pointer-events: none;
  --aim-color: rgba(80, 220, 100, 0.55);
  --aim-glow:  rgba(60, 200, 80, 0.30);
}
.aim-crosshair.snippable {
  --aim-color: rgba(100, 255, 120, 0.92);
  --aim-glow:  rgba(70, 220, 90, 0.60);
}

/* Outer ring */
.aim-ring {
  position: absolute;
  width: 36px; height: 36px;
  border: 2px solid var(--aim-color);
  border-radius: 50%;
  top: -18px; left: -18px;
  box-shadow: 0 0 8px var(--aim-glow), inset 0 0 4px var(--aim-glow);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.aim-crosshair.snippable .aim-ring {
  animation: aim-pulse 1.1s ease-in-out infinite;
}

/* Four independent arms — no broken pseudo-element gaps */
.aim-arm {
  position: absolute;
  background: var(--aim-color);
  border-radius: 1px;
  transition: background 0.15s;
}
/* Horizontal arms: start 10px from centre, extend 10px outward */
.aim-left   { width: 9px; height: 2px; top: -1px; left: -19px; }
.aim-right  { width: 9px; height: 2px; top: -1px; left:  10px; }
/* Vertical arms */
.aim-top    { width: 2px; height: 9px; left: -1px; top: -19px; }
.aim-bottom { width: 2px; height: 9px; left: -1px; top:  10px; }

/* Scissors icon at centre */
.aim-blades {
  position: absolute;
  font-size: 14px;
  color: var(--aim-color);
  top: -9px; left: -7px;
  line-height: 1;
  text-shadow: 0 0 6px var(--aim-glow);
  transform: rotate(-45deg);
  transition: color 0.15s, text-shadow 0.15s;
}
.aim-crosshair.snippable .aim-blades {
  animation: aim-snip 1.8s ease-in-out infinite;
}

@keyframes aim-pulse {
  0%, 100% { box-shadow: 0 0  8px var(--aim-glow), inset 0 0  4px var(--aim-glow); }
  50%       { box-shadow: 0 0 18px var(--aim-glow), inset 0 0 10px var(--aim-glow); }
}
@keyframes aim-snip {
  0%, 75%, 100% { transform: rotate(-45deg) scale(1);    }
  88%            { transform: rotate(-45deg) scale(1.3); }
}

/* ── Modal system ─────────────────────────────────────────── */
.modal-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding-left: 4%;
  pointer-events: none;
}

/* WIN / GAME_OVER modals stay centred */
.modal-wrap.centred {
  justify-content: center;
  padding-left: 0;
}

.modal-card {
  pointer-events: all;
  position: relative;
  width: min(340px, 46vw);
  padding: 32px 40px 28px;
  text-align: center;

  /* Warm parchment — default / menu */
  background:
    linear-gradient(168deg, #faf0d4 0%, #f2e3b0 55%, #ead590 100%);
  border: 3px solid #8b5e26;
  border-radius: 16px;
  box-shadow:
    0 0 0 1px rgba(200,160,60,0.25),
    0 4px 6px rgba(0,0,0,0.25),
    0 16px 48px rgba(0,0,0,0.55),
    inset 0 1px 0 rgba(255,255,255,0.55);
  backdrop-filter: blur(2px);

  font-family: 'Luckiest Guy', cursive;
  color: #3a2a10;
}

/* Leaf corner ornaments */
.modal-card::before,
.modal-card::after {
  content: '❧';
  position: absolute;
  top: 14px;
  font-size: 18px;
  color: #6a8a38;
  opacity: 0.65;
  line-height: 1;
}
.modal-card::before { left: 18px; }
.modal-card::after  { right: 18px; transform: scaleX(-1); display: inline-block; }

/* ── Win card ── */
.modal-card.win {
  background: linear-gradient(168deg, #e6f5d0 0%, #cfe9ae 55%, #bade90 100%);
  border-color: #3d7a22;
  box-shadow:
    0 0 0 1px rgba(80,180,60,0.3),
    0 4px 6px rgba(0,0,0,0.2),
    0 16px 48px rgba(0,0,0,0.50),
    inset 0 1px 0 rgba(255,255,255,0.6);
  color: #1a3a0a;
}
.modal-card.win::before,
.modal-card.win::after { color: #3a7a20; opacity: 0.7; }

/* ── Lose card ── */
.modal-card.lose {
  background: linear-gradient(168deg, #f0dfc0 0%, #e2ca98 55%, #d4b878 100%);
  border-color: #7a4e1a;
  box-shadow:
    0 0 0 1px rgba(160,110,40,0.3),
    0 4px 6px rgba(0,0,0,0.3),
    0 16px 48px rgba(0,0,0,0.60),
    inset 0 1px 0 rgba(255,255,255,0.35);
  color: #3a2208;
}
.modal-card.lose::before,
.modal-card.lose::after { color: #8b5a22; opacity: 0.6; }

/* ── Card internals ── */
.card-brand {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 2px;
}
.brand-name {
  font-size: 22px;
  letter-spacing: 0;
  color: #6b3d10;
}
.brand-sub {
  font-size: 14px;
  color: #8b6030;
  letter-spacing: 0;
}

.card-rule {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
  color: #8b6a2a;
  font-size: 16px;
}
.card-rule::before,
.card-rule::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, #a07838, transparent);
}
.win .card-rule  { color: #4a8a22; }
.win .card-rule::before,
.win .card-rule::after { background: linear-gradient(90deg, transparent, #5a9a30, transparent); }
.lose .card-rule { color: #8b5a20; }
.lose .card-rule::before,
.lose .card-rule::after { background: linear-gradient(90deg, transparent, #9a6830, transparent); }

.win-rule  { color: #4a8a22; }
.lose-rule { color: #8b5a20; }

.game-title {
  font-size: clamp(30px, 5.5vw, 46px);
  color: #5c3317;
  text-shadow: 3px 3px 0 rgba(139,94,42,0.35), 5px 5px 0 rgba(0,0,0,0.2);
  letter-spacing: 0;
  line-height: 1.15;
  margin: 4px 0;
}

.card-glyph {
  font-size: 28px;
  margin-bottom: 6px;
  line-height: 1;
}
.win-glyph  { color: #c8a820; text-shadow: 0 0 12px rgba(220,180,40,0.7); }
.lose-glyph { color: #8b5a20; }

.result-title {
  font-size: clamp(32px, 7vw, 48px);
  letter-spacing: 0;
  line-height: 1.15;
  margin: 4px 0;
  text-shadow: 2px 2px 0 rgba(0,0,0,0.2);
}
.win-title  { color: #2a6012; text-shadow: 2px 2px 0 rgba(30,80,15,0.35); }
.lose-title { color: #7a3808; }

.card-body {
  line-height: 1.9;
  color: inherit;
  opacity: 0.85;
  margin: 4px 0 8px;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 17px;
  letter-spacing: 0.2px;
}

.controls-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  font-size: 18px;
  color: #6b4a18;
  margin: 4px 0;
  flex-wrap: wrap;
}
.ctrl-key {
  background: rgba(139,94,42,0.18);
  border: 1px solid rgba(139,94,42,0.35);
  border-radius: 4px;
  padding: 4px 12px;
  font-family: 'Luckiest Guy', cursive;
  font-size: 18px;
}
.ctrl-label { font-size: 18px; opacity: 0.75; }
.ctrl-sep   { opacity: 0.4; font-size: 22px; }

.press-start {
  font-size: 20px;
  color: #5c3317;
  margin-top: 6px;
  letter-spacing: 0;
}
.win  .press-start { color: #1e5a0e; }
.lose .press-start { color: #6a3010; }

/* ── Modal enter / leave transitions ─────────────────────── */
.modal-enter-active {
  animation: modal-rise 0.5s cubic-bezier(0.34, 1.25, 0.64, 1);
}
.modal-leave-active {
  animation: modal-fall 0.28s ease-in forwards;
}

@keyframes modal-rise {
  from { opacity: 0; transform: translateX(-32px) scale(0.93); }
  to   { opacity: 1; transform: translateX(0)     scale(1);    }
}
@keyframes modal-fall {
  from { opacity: 1; transform: translateX(0)     scale(1);    }
  to   { opacity: 0; transform: translateX(-20px) scale(0.95); }
}

/* ── Misc animations ──────────────────────────────────────── */
@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.25; }
}
.blink { animation: blink 1.2s ease-in-out infinite; }

@keyframes bubble-pop {
  0%   { transform: scale(0.7); opacity: 0; }
  100% { transform: scale(1);   opacity: 1; }
}

@keyframes bubble-urgent-border {
  0%, 100% { box-shadow: 0 0 0 0   rgba(220,50,50,0);   }
  50%       { box-shadow: 0 0 0 4px rgba(220,50,50,0.7); }
}

@keyframes patience-pulse {
  0%, 100% { box-shadow: 0 0 0  0  rgba(231,76,60,0);   }
  50%       { box-shadow: 0 0 12px 3px rgba(231,76,60,0.8); }
}

.score-display {
  font-size: 22px;
  color: #ffe55c;
  text-shadow: 2px 2px 0 #000, 0 0 12px rgba(255,220,60,0.5);
  letter-spacing: 1px;
  margin-bottom: 2px;
}

.hi-score-row {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 10px;
  margin: 8px 0 4px;
  font-family: 'Luckiest Guy', cursive;
}
.hi-score-label {
  font-size: 14px;
  color: #a07030;
  letter-spacing: 1px;
}
.hi-score-val {
  font-size: 24px;
  color: #c8a820;
  text-shadow: 1px 1px 0 rgba(0,0,0,0.3);
}
.hi-level-val {
  font-size: 13px;
  color: #8b6030;
}

.score-result {
  margin: 12px 0 4px;
}
.score-result-val {
  font-size: clamp(28px, 5vw, 44px);
  color: #c8a820;
  text-shadow: 2px 2px 0 rgba(0,0,0,0.25), 0 0 16px rgba(220,180,40,0.5);
  letter-spacing: 2px;
  font-family: 'Luckiest Guy', cursive;
}
.score-result-label {
  font-size: 14px;
  color: #8b6030;
  letter-spacing: 2px;
  margin-top: 2px;
}
.new-hi {
  font-size: 18px;
  color: #e8b020;
  text-shadow: 0 0 14px rgba(240,180,20,0.8);
  margin-top: 6px;
  animation: new-hi-pulse 0.9s ease-in-out infinite;
}
.score-hi-row {
  font-size: 14px;
  color: #8b5a20;
  margin-top: 6px;
  letter-spacing: 1px;
}

.bonus-pop {
  position: absolute;
  top: 22%;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'Luckiest Guy', cursive;
  font-size: clamp(20px, 3.5vw, 32px);
  color: #ffe55c;
  text-shadow: 2px 2px 0 rgba(100,60,0,0.6), 0 0 16px rgba(255,200,40,0.7);
  white-space: nowrap;
  pointer-events: none;
  animation: bonus-pop-anim 1.8s ease-out forwards;
}
.bonus-enter-active { animation: bonus-pop-anim 1.8s ease-out forwards; }
.bonus-leave-active { display: none; }

@keyframes bonus-pop-anim {
  0%   { opacity: 0; transform: translateX(-50%) translateY(0)  scale(0.6); }
  15%  { opacity: 1; transform: translateX(-50%) translateY(-6px) scale(1.05); }
  30%  { opacity: 1; transform: translateX(-50%) translateY(-10px) scale(1); }
  80%  { opacity: 1; transform: translateX(-50%) translateY(-18px) scale(1); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-28px) scale(0.9); }
}

@keyframes new-hi-pulse {
  0%, 100% { opacity: 1; text-shadow: 0 0 14px rgba(240,180,20,0.8); }
  50%       { opacity: 0.7; text-shadow: 0 0 22px rgba(240,180,20,1.0); }
}

/* ── Cutscene fade-to-black ───────────────────────────────── */
.cs-fade-black {
  position: absolute;
  inset: 0;
  background: #000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.35s ease;
  z-index: 5;
}
.cs-fade-black.active {
  opacity: 1;
}

/* ── Cutscene overlay ─────────────────────────────────────── */
.cs-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 48px;
}

.cs-card {
  text-align: center;
  font-family: 'Luckiest Guy', cursive;
  color: #fff;
  text-shadow: 2px 2px 0 rgba(0,0,0,0.7);
  background: linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.45) 100%);
  padding: 18px 48px 14px;
  border-radius: 10px;
  backdrop-filter: blur(3px);
}

.cs-eyebrow {
  font-size: 13px;
  color: #c8a87a;
  letter-spacing: 2px;
  margin-bottom: 4px;
}

.cs-title {
  font-size: clamp(28px, 6vw, 48px);
  color: #f5e6c8;
  line-height: 1.1;
}

.cs-level {
  font-size: 18px;
  color: #ffe9a8;
  margin-top: 4px;
}

.cs-skip {
  font-size: 11px;
  color: rgba(255,255,255,0.4);
  margin-top: 10px;
  letter-spacing: 1px;
}

.cs-fade-enter-active { animation: cs-rise 0.6s ease-out; }
.cs-fade-leave-active { animation: cs-fall 0.5s ease-in forwards; }

@keyframes cs-rise {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes cs-fall {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(-8px); }
}
</style>
