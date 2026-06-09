<template>
  <div class="game-wrap" :style="wrapStyle">
  <canvas ref="canvasRef" class="game-canvas" />

  <!-- Cutscene fade-to-black (hides U-turn / level swap) -->
  <div class="cs-fade-black" :class="{ active: csPhase === 'turn' }" />

  <!-- Cutscene overlay -->
  <Transition name="cs-fade">
    <div v-if="gameState === 'CUTSCENE'" class="cs-overlay" :class="{ 'cs-top': isTouch }">
      <div class="cs-card">
        <div class="cs-eyebrow">TOM'S GARDEN CARE</div>
        <div class="cs-title">NEXT JOB</div>
        <div class="cs-level">LEVEL {{ level }}</div>
        <div v-if="levelStats" class="cs-recap">
          <div class="cs-recap-row">
            <span>LVL {{ levelStats.completedLevel }} ({{ levelStats.snips }} snips ×{{ levelStats.multiplier }})</span>
            <span class="cs-recap-val">+{{ levelStats.levelTotal.toLocaleString() }}</span>
          </div>
          <div class="cs-recap-row cs-recap-total">
            <span>TOTAL</span>
            <span class="cs-recap-val">{{ levelStats.runningTotal.toLocaleString() }}</span>
          </div>
        </div>
        <div class="cs-skip">{{ isTouch ? 'TAP to skip' : 'SPACE to skip' }}</div>
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

    <!-- Rover heat bar — only in rover levels (tier 5) -->
    <Transition name="heat-in">
      <div v-if="toolTier >= 5" class="heat-wrap">
        <div class="heat-label">{{ overheated ? 'COOLING DOWN' : 'BLADE TEMP' }}</div>
        <div class="heat-track" :class="{ danger: heat > 0.8, overheated }">
          <div class="heat-fill" :style="{ width: heatPct, background: heatColor }" />
        </div>
      </div>
    </Transition>

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

    <!-- Tool badge -->
    <Transition name="tool-upgrade">
      <div
        :key="toolUpgradeKey"
        class="tool-badge"
        :class="`tool-tier-${toolTier}`"
      >
        {{ toolTier >= 4 ? '⚡' : '✂' }} {{ toolName }}
      </div>
    </Transition>

    <!-- Aim crosshair -->
    <div
      v-show="aimPos.visible && toolTier < 5"
      class="aim-crosshair"
      :class="{ snippable: aimPos.snippable, laser: toolTier === 4 }"
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

    <Transition name="intro-cap">
      <div v-if="introCaption" class="intro-caption">{{ introCaption }}</div>
    </Transition>
  </div>

  <!-- Pause overlay -->
  <Transition name="pause-fade">
    <div
      v-if="paused && gameState === 'PLAYING'"
      class="pause-overlay"
      @pointerdown.self="resumeGame"
    >
      <div class="pause-card">
        <div class="pause-glyph">⏸</div>
        <div class="pause-title">PAUSED</div>
        <div class="card-rule"><span>❧</span></div>
        <button class="pause-resume" @pointerdown.stop="resumeGame">RESUME</button>
        <button class="pause-shaders" @pointerdown.stop="openShaders">SHADERS</button>
        <button class="pause-quit" @pointerdown.stop="quitGame">QUIT</button>
        <div class="pause-hint">{{ isTouch ? 'tap anywhere to resume' : 'press ESC to resume' }}</div>
      </div>
    </div>
  </Transition>

  <!-- MENU modal -->
  <Transition name="modal">
    <div v-if="gameState === 'MENU'" class="modal-wrap" :class="{ centred: isTouch }">
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
          <template v-if="isTouch">
            <span class="ctrl-key">DRAG</span><span class="ctrl-label">move</span>
            <span class="ctrl-sep">·</span>
            <span class="ctrl-key">TAP</span><span class="ctrl-label">snip</span>
          </template>
          <template v-else>
            <span class="ctrl-key">← →</span><span class="ctrl-label">move</span>
            <span class="ctrl-sep">·</span>
            <span class="ctrl-key">SPACE</span><span class="ctrl-label">snip</span>
          </template>
        </div>
        <div v-if="hiScore > 0" class="hi-score-row">
          <span class="hi-score-label">HI-SCORE</span>
          <span class="hi-score-val">{{ hiScore.toLocaleString() }}</span>
          <span v-if="highestLevel > 0" class="hi-level-val">· BEST LEVEL {{ highestLevel }}</span>
        </div>
        <div class="card-rule"><span>✦</span></div>
        <template v-if="highestLevel > 1">
          <button class="menu-continue-btn" @pointerdown.stop="continueGame">
            CONTINUE · LEVEL {{ highestLevel }}
          </button>
          <div class="menu-continue-hint">{{ isTouch ? 'TAP ABOVE' : 'ENTER' }} to continue</div>
          <div class="menu-or">— or —</div>
          <div class="press-start blink">{{ isTouch ? 'TAP TO START NEW' : 'SPACE — NEW GAME' }}</div>
        </template>
        <template v-else>
          <div class="press-start blink">{{ isTouch ? 'TAP TO START' : 'PRESS SPACE TO START' }}</div>
        </template>
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
        <div class="press-start blink">{{ isTouch ? 'TAP TO PLAY AGAIN' : 'PRESS SPACE TO PLAY AGAIN' }}</div>
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
        <div class="press-start blink">{{ continueText }}</div>
      </div>
    </div>
  </Transition>
  <!-- Loading screen -->
  <Transition name="loader-fade">
    <div v-if="isLoading" class="loader-overlay">
      <div class="loader-leaves">
        <span v-for="i in 12" :key="i" class="loader-leaf" :style="`--i:${i}`">🍃</span>
      </div>
      <div class="loader-content">
        <div class="loader-brand">TOM'S GARDEN CARE</div>
        <div class="loader-sub">Sheffield's Finest Camel Gardening Service</div>
        <div class="loader-hedge-wrap">
          <div class="loader-hedge-track">
            <div class="loader-hedge-fill" :style="`width:${loadPct}%`" />
            <div class="loader-hedge-spikes" :style="`width:${loadPct}%`" />
          </div>
        </div>
        <div class="loader-label">{{ loadLabel }}</div>
      </div>
    </div>
  </Transition>

  <!-- Rotate-to-landscape prompt (touch + portrait) -->
  <Transition name="loader-fade">
    <div v-if="showRotate" class="rotate-overlay">
        <div class="rotate-inner">
            <div class="rotate-phone">📱</div>
            <div class="rotate-title">ROTATE YOUR DEVICE</div>
            <div class="rotate-sub">Camel Clipper plays best in landscape</div>
        </div>
    </div>
  </Transition>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import Game from './Game';

const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

// Touch devices fill the whole screen; desktop keeps the framed 16:9 letterbox.
function viewRect() {
  if (isTouch) return { width: '100%', height: '100%' };
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
const wrapStyle  = ref(viewRect());
const isPortrait = ref(window.innerHeight > window.innerWidth);
const showRotate = computed(() => isTouch && isPortrait.value);

const canvasRef   = ref<HTMLCanvasElement | null>(null);
const gameState   = ref('MENU');
const paused      = ref(false);
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
const introCaption  = ref<string | null>(null)
const isLoading     = ref(true)
const loadProgress  = ref(0)
const loadTotal     = ref(1)
const toolTier      = ref(0)
const toolName      = ref('Manual Shears')
const toolUpgradeKey = ref(0)
const heat          = ref(0)
const overheated    = ref(false)

const heatPct   = computed(() => `${Math.round(heat.value * 100)}%`)
const heatColor = computed(() => {
  const h = heat.value;
  if (h > 0.8) return '#e74c3c';
  if (h > 0.5) return '#f39c12';
  return '#2ecc71';
})

interface LevelStats {
  completedLevel: number
  snips: number
  multiplier: number
  snipScore: number
  timeBonus: number
  levelTotal: number
  runningTotal: number
}
const levelStats      = ref<LevelStats | null>(null)
let _levelStartScore  = 0
let _pendingSnipScore = 0

const loadPct   = computed(() => loadTotal.value > 0 ? Math.round((loadProgress.value / loadTotal.value) * 100) : 0)
const loadLabel = computed(() => isLoading.value && loadProgress.value === 0 ? 'Loading…' : loadProgress.value >= loadTotal.value ? 'Ready!' : `Loading… ${loadProgress.value} / ${loadTotal.value}`)

let game: Game | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
const _onResize = () => {
  wrapStyle.value  = viewRect();
  isPortrait.value = window.innerHeight > window.innerWidth;
};

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
    onIntroCaption:    (text) => { introCaption.value = text; },
    onStateChange:     (s) => {
      gameState.value = s;
      if (s !== 'CUTSCENE') csPhase.value = '';
      if (s !== 'PLAYING') { aimPos.value.visible = false; introCaption.value = null; }
      if (s === 'PLAYING') {
        _levelStartScore = score.value;
        levelStats.value = null;
      }
      if (s === 'WIN') {
        winMessage.value = pickWinSpeech();
      }
    },
    onPause:           (p) => { paused.value = p; },
    onPatience:        (p) => { patience.value  = p; },
    onProgress:        (t, tot) => { trimmed.value = t; total.value = tot; },
    onCoupleScreenPos: (x, y) => {
      // Sit the bubble directly over the couple; let it clip at the screen edge.
      couplePos.value = { x, y };
    },
    onAimScreenPos:    (x, y, snippable) => { aimPos.value = { x, y, snippable, visible: true }; },
    onLevel:           (l) => { level.value = l; },
    onLevelCleared:    (l) => {
      aimPos.value.visible = false;
      clearedToast.value = l;
      levelClearedMessage.value = pickWinSpeech();
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { clearedToast.value = null; }, 3200);
      // Capture snip score before bonus is added (onScore fires after this)
      _pendingSnipScore = score.value - _levelStartScore;
    },
    onScore:         (s) => { score.value = s; },
    onHighScore:     (hs, hl) => { hiScore.value = hs; highestLevel.value = hl; },
    onLevelBonus:    (bonus, total) => {
      bonusPopText.value = '+' + bonus.toLocaleString() + ' TIME BONUS!';
      bonusPopKey.value++;
      const lvl       = level.value;
      const snipScore = _pendingSnipScore;
      const snips     = lvl > 0 ? Math.round(snipScore / (100 * lvl)) : 0;
      levelStats.value = {
        completedLevel: lvl,
        snips,
        multiplier:     lvl,
        snipScore,
        timeBonus:      bonus,
        levelTotal:     snipScore + bonus,
        runningTotal:   total,
      };
    },
    onLoadProgress: (loaded, tot) => {
      loadProgress.value = loaded;
      loadTotal.value    = tot;
    },
    onLoadComplete: () => {
      loadProgress.value = loadTotal.value;
      setTimeout(() => { isLoading.value = false; }, 600);
    },
    onToolTier: (tier, name) => {
      toolTier.value = tier;
      toolName.value = name;
      toolUpgradeKey.value++;
    },
    onHeat: (h, o) => {
      heat.value      = h;
      overheated.value = o;
    },
  });
  game.start();
});

const continueText = computed(() => {
  const canContinue = highestLevel.value > 1;
  if (isTouch) return canContinue ? `TAP TO CONTINUE FROM LEVEL ${highestLevel.value}` : 'TAP TO TRY AGAIN';
  return canContinue ? `PRESS SPACE TO CONTINUE FROM LEVEL ${highestLevel.value}` : 'PRESS SPACE TO TRY AGAIN';
});

function resumeGame()   { game?.resume(); }
function openShaders()  { game?.toggleShaderPanel(); }
function quitGame()     { game?.goToMenu(); }
function continueGame() { game?.startFromLevel(highestLevel.value); }

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

.heat-wrap {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  width: 260px;
  text-align: center;
}
.heat-label {
  font-size: 12px;
  margin-bottom: 4px;
  text-shadow: 1px 1px 0 #000;
  letter-spacing: 0;
}
.heat-track {
  height: 10px;
  background: rgba(0,0,0,0.4);
  border: 2px solid rgba(255,255,255,0.2);
  border-radius: 2px;
  overflow: hidden;
}
.heat-track.danger {
  animation: patience-pulse 0.5s ease-in-out infinite;
}
.heat-track.overheated {
  animation: patience-pulse 0.3s ease-in-out infinite;
}
.heat-fill {
  height: 100%;
  transition: width 0.1s linear, background 0.3s;
}
.heat-in-enter-active { transition: opacity 0.4s, transform 0.4s; }
.heat-in-leave-active { transition: opacity 0.3s; }
.heat-in-enter-from   { opacity: 0; transform: translateX(-50%) translateY(-6px); }
.heat-in-leave-to     { opacity: 0; }

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
  /* Definite content width so the bubble never collapses into a tall, thin
     sliver when the couple wander near the screen edge (the cap keeps it on
     small screens too). */
  width: max-content;
  max-width: min(220px, 56vw);
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
  white-space: normal;
  word-break: break-word;
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

/* ── Laser Shears crosshair (tier 4) ─────────────────────── */
.aim-crosshair.laser {
  --aim-color: rgba(0, 245, 255, 0.90);
  --aim-glow:  rgba(0, 200, 255, 0.65);
}
.aim-crosshair.laser .aim-ring {
  border-width: 1px;
  border-color: var(--aim-color);
  box-shadow:
    0 0 14px var(--aim-glow),
    0 0 28px var(--aim-glow),
    inset 0 0 8px var(--aim-glow);
  animation: laser-ring-spin 2.8s linear infinite, laser-ring-glow 0.45s ease-in-out infinite;
}
/* Second ring pseudo-element: outer static halo */
.aim-crosshair.laser .aim-ring::before {
  content: '';
  position: absolute;
  inset: -8px;
  border: 1px solid rgba(255, 0, 255, 0.35);
  border-radius: 50%;
  animation: laser-ring-spin 1.8s linear infinite reverse;
}
.aim-crosshair.laser .aim-arm {
  background: var(--aim-color);
  box-shadow: 0 0 6px var(--aim-glow);
}
.aim-crosshair.laser .aim-blades {
  color: #00ffff;
  text-shadow:
    0 0 8px rgba(0,255,255,1),
    0 0 18px rgba(0,200,255,0.8);
  animation: laser-blade-snap 0.5s ease-in-out infinite;
}
@keyframes laser-ring-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes laser-ring-glow {
  0%, 100% { box-shadow: 0 0 14px var(--aim-glow), 0 0 28px var(--aim-glow), inset 0 0 8px var(--aim-glow); }
  50%       { box-shadow: 0 0 22px rgba(0,255,255,0.9), 0 0 45px rgba(0,200,255,0.6), inset 0 0 14px rgba(0,255,255,0.4); }
}
@keyframes laser-blade-snap {
  0%, 70%, 100% { transform: rotate(-45deg) scale(1); }
  85%            { transform: rotate(-45deg) scale(1.4); filter: brightness(1.6); }
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

.menu-continue-btn {
  width: 100%;
  font-family: 'Luckiest Guy', cursive;
  font-size: 21px;
  letter-spacing: 0.5px;
  color: #f0ffe8;
  background: linear-gradient(180deg, #4a9a2a, #357a1c);
  border: 2px solid #2a6014;
  border-radius: 10px;
  padding: 11px 0 9px;
  margin-top: 2px;
  cursor: pointer;
  box-shadow: 0 3px 0 #245210, 0 5px 12px rgba(0,0,0,0.28);
  transition: transform 0.08s ease, box-shadow 0.08s ease;
  text-shadow: 1px 1px 0 rgba(0,0,0,0.4);
}
.menu-continue-btn:hover {
  background: linear-gradient(180deg, #58b030, #3f8e22);
}
.menu-continue-btn:active {
  transform: translateY(3px);
  box-shadow: 0 0 0 #245210, 0 2px 6px rgba(0,0,0,0.28);
}
.menu-continue-hint {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 12px;
  color: #7a5a28;
  letter-spacing: 0.5px;
  margin: 5px 0 2px;
}
.menu-or {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 12px;
  color: #8b6a3a;
  opacity: 0.55;
  margin: 3px 0;
  letter-spacing: 1px;
}

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

/* ── Rover-intro caption banner ───────────────────────────── */
.intro-caption {
  position: absolute;
  bottom: 12%;
  left: 50%;
  transform: translateX(-50%);
  max-width: 80vw;
  padding: 0.55em 1.2em;
  font-family: 'Luckiest Guy', cursive;
  font-size: clamp(16px, 2.8vw, 28px);
  text-align: center;
  color: #fff6d8;
  background: rgba(40, 28, 14, 0.78);
  border: 3px solid #e2b35a;
  border-radius: 14px;
  text-shadow: 2px 2px 0 rgba(70,40,0,0.7);
  box-shadow: 0 6px 20px rgba(0,0,0,0.4);
  pointer-events: none;
  z-index: 6;
}
.intro-cap-enter-active { transition: opacity 0.5s ease, transform 0.5s ease; }
.intro-cap-leave-active { transition: opacity 0.4s ease, transform 0.4s ease; }
.intro-cap-enter-from,
.intro-cap-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(14px);
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
  align-items: center;
  justify-content: flex-end;
  padding-right: 3%;
}

/* Mobile: top-centre, out of the action */
.cs-overlay.cs-top {
  align-items: flex-start;
  justify-content: center;
  padding-right: 0;
  padding-top: 4%;
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

.cs-recap {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255,255,255,0.2);
  font-family: system-ui, sans-serif;
  text-shadow: 1px 1px 0 rgba(0,0,0,0.6);
}
.cs-recap-row {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  font-size: 12px;
  color: rgba(255,255,255,0.75);
  letter-spacing: 0.5px;
}
.cs-recap-val { color: #ffe9a8; }
.cs-recap-total {
  margin-top: 3px;
  font-size: 14px;
  color: #fff;
}
.cs-recap-total .cs-recap-val {
  color: #c8a820;
  text-shadow: 1px 1px 0 rgba(0,0,0,0.5), 0 0 10px rgba(200,168,32,0.4);
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

/* ── Loading screen ───────────────────────────────────────── */
.loader-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at 50% 60%, #1e4a1a 0%, #0a1f0a 70%, #040e04 100%);
  overflow: hidden;
}

/* floating leaves */
.loader-leaves {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.loader-leaf {
  position: absolute;
  bottom: -10%;
  font-size: 22px;
  opacity: 0;
  left: calc((var(--i) - 1) * 8.5%);
  animation: leaf-rise 4s ease-in-out calc(var(--i) * 0.35s) infinite;
  filter: hue-rotate(calc(var(--i) * 15deg));
}
@keyframes leaf-rise {
  0%   { transform: translateY(0) rotate(0deg);    opacity: 0; }
  15%  { opacity: 0.7; }
  85%  { opacity: 0.5; }
  100% { transform: translateY(-110vh) rotate(360deg); opacity: 0; }
}

.loader-content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 48px;
  background: rgba(0,0,0,0.35);
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 0 80px rgba(0,80,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06);
}

.loader-camel-icon svg {
  width: 120px;
  height: auto;
  filter: drop-shadow(0 4px 16px rgba(200,134,10,0.6));
  animation: camel-bob 2.4s ease-in-out infinite;
}
@keyframes camel-bob {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-6px); }
}

.loader-brand {
  font-family: 'Luckiest Guy', 'Georgia', serif;
  font-size: 28px;
  letter-spacing: 4px;
  color: #f5eed8;
  text-shadow: 0 2px 12px rgba(200,134,10,0.5), 2px 2px 0 rgba(0,0,0,0.6);
  margin-top: 4px;
}
.loader-sub {
  font-size: 11px;
  letter-spacing: 2.5px;
  color: #7da86a;
  text-transform: uppercase;
  margin-bottom: 8px;
}

/* hedge-styled progress bar */
.loader-hedge-wrap {
  width: 280px;
  margin-top: 4px;
}
.loader-hedge-track {
  position: relative;
  height: 22px;
  background: #0d2b0a;
  border-radius: 3px;
  border: 2px solid #2a5c22;
  overflow: visible;
}
.loader-hedge-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: linear-gradient(90deg, #2e7d32, #66bb6a 60%, #a5d6a7);
  border-radius: 2px;
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
/* jagged hedge-top silhouette that pokes above the flat bar */
.loader-hedge-spikes {
  position: absolute;
  bottom: 100%;
  left: 0;
  height: 18px;
  background: linear-gradient(90deg, #2e7d32, #66bb6a 60%, #a5d6a7);
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  clip-path: polygon(
    0% 100%, 0% 70%,
    2% 40%, 4% 62%, 6% 28%, 8% 50%, 10% 18%, 12% 44%, 14% 68%, 16% 30%,
    18% 55%, 20% 22%, 22% 48%, 24% 72%, 26% 35%, 28% 58%, 30% 20%,
    32% 46%, 34% 68%, 36% 28%, 38% 52%, 40% 15%, 42% 42%, 44% 65%,
    46% 25%, 48% 50%, 50% 18%, 52% 44%, 54% 70%, 56% 30%, 58% 55%,
    60% 22%, 62% 48%, 64% 72%, 66% 32%, 68% 58%, 70% 20%, 72% 45%,
    74% 68%, 76% 28%, 78% 52%, 80% 16%, 82% 42%, 84% 65%, 86% 25%,
    88% 50%, 90% 20%, 92% 46%, 94% 70%, 96% 32%, 98% 56%, 100% 70%,
    100% 100%
  );
}
.loader-label {
  font-size: 12px;
  letter-spacing: 2px;
  color: #6a9a5e;
  margin-top: 2px;
  min-height: 18px;
}

/* fade-out transition */
.loader-fade-leave-active {
  transition: opacity 0.8s ease;
}
.loader-fade-leave-to {
  opacity: 0;
}

/* ── Mobile landscape compact modal ──────────────────────── */
@media (max-height: 480px) {
  .modal-card {
    width: min(420px, 70vw);
    padding: 14px 24px 12px;
  }
  .card-brand { gap: 2px; margin-bottom: 0; }
  .brand-name { font-size: 15px; }
  .brand-sub  { font-size: 10px; }
  .card-rule  { margin: 6px 0; }
  .game-title { font-size: clamp(22px, 4.5vw, 36px); margin: 0; }
  .card-body  { font-size: 13px; line-height: 1.5; margin: 2px 0 4px; }
  .controls-row { gap: 8px; font-size: 14px; margin: 2px 0; }
  .ctrl-key   { font-size: 14px; padding: 2px 8px; }
  .ctrl-label { font-size: 14px; }
  .hi-score-row        { margin: 4px 0 2px; }
  .hi-score-val        { font-size: 18px; }
  .press-start         { font-size: 16px; margin-top: 2px; }
  .menu-continue-btn   { font-size: 17px; padding: 8px 0 6px; }
  .menu-continue-hint  { font-size: 10px; margin: 3px 0 1px; }
  .menu-or             { margin: 2px 0; }
  .modal-card::before,
  .modal-card::after { font-size: 13px; top: 8px; }
  /* Compact speech bubble on landscape phones so it sits clear of the play area. */
  .speech-bubble {
    font-size: 12px;
    max-width: min(190px, 46vw);
    padding: 7px 10px;
  }
}

/* ── Pause overlay ────────────────────────────────────────── */
.pause-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;            /* above the touch surface (50) and ⏸ button (60) */
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 20, 6, 0.55);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.pause-card {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(300px, 70vw);
  padding: 24px 36px 22px;
  text-align: center;
  background: linear-gradient(168deg, #faf0d4 0%, #f2e3b0 55%, #ead590 100%);
  border: 3px solid #8b5e26;
  border-radius: 16px;
  box-shadow:
    0 0 0 1px rgba(200,160,60,0.25),
    0 16px 48px rgba(0,0,0,0.55),
    inset 0 1px 0 rgba(255,255,255,0.55);
  font-family: 'Luckiest Guy', cursive;
  color: #3a2a10;
}
.pause-glyph {
  font-size: 30px;
  color: #6b3d10;
  line-height: 1;
}
.pause-title {
  font-size: clamp(28px, 6vw, 40px);
  color: #5c3317;
  letter-spacing: 2px;
  text-shadow: 2px 2px 0 rgba(139,94,42,0.3);
  margin: 6px 0 0;
}
.pause-resume,
.pause-shaders,
.pause-quit {
  font-family: 'Luckiest Guy', cursive;
  font-size: 20px;
  letter-spacing: 1px;
  color: #faf3df;
  border: 2px solid transparent;
  border-radius: 10px;
  padding: 10px 0;
  width: 100%;
  margin: 4px 0;
  cursor: pointer;
  box-shadow: 0 3px 0 rgba(0,0,0,0.35), 0 5px 10px rgba(0,0,0,0.25);
  transition: transform 0.08s ease, box-shadow 0.08s ease;
}
.pause-resume:active,
.pause-shaders:active,
.pause-quit:active {
  transform: translateY(3px);
  box-shadow: 0 0 0 rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.2);
}
.pause-resume {
  background: linear-gradient(180deg, #4a9a2a, #357a1c);
  border-color: #2a6014;
  box-shadow: 0 3px 0 #245210, 0 5px 10px rgba(0,0,0,0.3);
}
.pause-resume:active { box-shadow: 0 0 0 #245210, 0 2px 6px rgba(0,0,0,0.3); }
.pause-shaders {
  background: linear-gradient(180deg, #7a6030, #5a4520);
  border-color: #3a2c10;
  box-shadow: 0 3px 0 #2a1c08, 0 5px 10px rgba(0,0,0,0.3);
}
.pause-shaders:active { box-shadow: 0 0 0 #2a1c08, 0 2px 6px rgba(0,0,0,0.3); }
.pause-quit {
  background: linear-gradient(180deg, #a03020, #7a1e10);
  border-color: #4a1008;
  box-shadow: 0 3px 0 #3a0c06, 0 5px 10px rgba(0,0,0,0.3);
}
.pause-quit:active { box-shadow: 0 0 0 #3a0c06, 0 2px 6px rgba(0,0,0,0.3); }
.pause-hint {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 13px;
  color: #8b6030;
  letter-spacing: 0.5px;
}
.pause-fade-enter-active { animation: pause-rise 0.25s cubic-bezier(0.34, 1.25, 0.64, 1); }
.pause-fade-leave-active { animation: pause-drop 0.2s ease-in forwards; }
@keyframes pause-rise {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes pause-drop {
  from { opacity: 1; }
  to   { opacity: 0; }
}
@media (max-height: 480px) {
  .pause-card { width: min(360px, 60vw); padding: 14px 28px 12px; }
  .pause-glyph { font-size: 22px; }
  .pause-title { font-size: clamp(22px, 5vw, 30px); margin-top: 2px; }
  .pause-resume,
  .pause-shaders,
  .pause-quit { font-size: 16px; padding: 8px 0; margin: 3px 0; }
  .pause-hint { font-size: 11px; }
}

/* ── Rotate-to-landscape prompt ───────────────────────────── */
.rotate-inner {
    padding:1rem;
    border-radius:1rem;
    background:rgba(255,255,255,0.3);
    animation: float-modal 3s ease infinite; 
    position:relative;
    transition:all 0.2s ease;
}
@keyframes float-modal {
  0% {
  }
  100% {
  }

}

.rotate-overlay {
  position: absolute;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
  padding: 24px;
  background: url(images/portrait_hero.webp) no-repeat; 
  background-size:cover;
  font-family: 'Luckiest Guy', cursive;
  color: #f5eed8;
}
.rotate-phone {
  font-size: 64px;
  animation: rotate-tilt 1.8s ease-in-out infinite;
}
.rotate-title {
  font-size: clamp(1rem, 6vw, 2rem);
  letter-spacing: 1px;
  text-shadow: 2px 2px 0 rgba(0,0,0,0.8);
  margin-bottom:2rem;
}
.rotate-sub {
  font-size: 2rem;
  color: #ffc400;
  text-shadow: 2px 2px 0 rgba(0,0,0,0.8);
}
@keyframes rotate-tilt {
  0%, 100% { transform: rotate(0deg); }
  50%       { transform: rotate(-90deg); }
}

/* ── Tool badge ───────────────────────────────────────────── */
.tool-badge {
  position: absolute;
  bottom: 18px;
  left: 18px;
  font-family: 'Luckiest Guy', cursive;
  font-size: 14px;
  padding: 5px 12px;
  border-radius: 4px;
  letter-spacing: 0.5px;
  pointer-events: none;
  text-shadow: 1px 1px 0 rgba(0,0,0,0.6);
  border: 2px solid rgba(255,255,255,0.15);
  background: rgba(0,0,0,0.35);
  color: #a0a090;
}
.tool-tier-1 {
  color: #b8e870;
  border-color: rgba(140,220,60,0.35);
  background: rgba(20,60,0,0.45);
}
.tool-tier-2 {
  color: #f0d050;
  border-color: rgba(220,180,40,0.4);
  background: rgba(50,35,0,0.45);
}
.tool-tier-3 {
  color: #60ffb0;
  border-color: rgba(60,230,130,0.5);
  background: rgba(0,50,25,0.50);
  text-shadow: 0 0 10px rgba(60,255,140,0.55), 1px 1px 0 rgba(0,0,0,0.6);
}
.tool-tier-4 {
  color: #00ffff;
  border-color: rgba(0,220,255,0.65);
  background: rgba(0,15,35,0.75);
  text-shadow:
    0 0 8px  rgba(0,255,255,1.0),
    0 0 20px rgba(0,200,255,0.8),
    0 0 40px rgba(0,160,255,0.4),
    1px 1px 0 rgba(0,0,0,0.8);
  box-shadow:
    0 0 12px rgba(0,200,255,0.4),
    0 0 28px rgba(0,160,255,0.2),
    inset 0 0 8px rgba(0,200,255,0.12);
  animation: laser-badge-pulse 1.4s ease-in-out infinite;
}
@keyframes laser-badge-pulse {
  0%, 100% {
    box-shadow: 0 0 12px rgba(0,200,255,0.4), 0 0 28px rgba(0,160,255,0.2), inset 0 0 8px rgba(0,200,255,0.12);
    border-color: rgba(0,220,255,0.65);
  }
  50% {
    box-shadow: 0 0 22px rgba(0,220,255,0.7), 0 0 48px rgba(0,180,255,0.4), inset 0 0 14px rgba(0,220,255,0.2);
    border-color: rgba(0,255,255,0.95);
  }
}

.tool-upgrade-enter-active {
  animation: tool-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.tool-tier-4.tool-upgrade-enter-active {
  animation: laser-tier-unlock 0.9s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes laser-tier-unlock {
  0%   { opacity: 0; transform: scale(0.3) translateY(14px); filter: brightness(4) blur(4px); }
  25%  { opacity: 1; filter: brightness(3) blur(1px); }
  55%  { transform: scale(1.3) translateY(-5px); filter: brightness(2); }
  75%  { filter: brightness(1.4); }
  100% { opacity: 1; transform: scale(1) translateY(0); filter: brightness(1); }
}
.tool-upgrade-leave-active {
  animation: tool-fade 0.2s ease-in forwards;
}
@keyframes tool-pop {
  0%   { opacity: 0; transform: scale(0.6) translateY(6px); }
  60%  { opacity: 1; transform: scale(1.12) translateY(-2px); }
  100% { opacity: 1; transform: scale(1)    translateY(0); }
}
@keyframes tool-fade {
  from { opacity: 1; }
  to   { opacity: 0; }
}
</style>
