/* ================================================================
   SolveForJas — Main Application Script
   Pure Vanilla JS, no frameworks.
   All game data is persisted through localStorage.
   ================================================================ */

(() => {
  'use strict';

  /* ================================================================
     1. CONSTANTS
     ================================================================ */

  const STORAGE_KEYS = {
    LEADERBOARD: 'sfj_leaderboard',
    STATS:       'sfj_stats',
    SETTINGS:    'sfj_settings',
  };

  const CATEGORIES = [
    { id: 'addition',       label: 'Addition',       emoji: '➕', cls: 'cat-addition'       },
    { id: 'subtraction',    label: 'Subtraction',    emoji: '➖', cls: 'cat-subtraction'    },
    { id: 'multiplication', label: 'Multiply',       emoji: '✖️', cls: 'cat-multiplication' },
    { id: 'division',       label: 'Divide',         emoji: '➗', cls: 'cat-division'       },
    { id: 'mixed',          label: 'Mixed',          emoji: '🎲', cls: 'cat-mixed'          },
  ];

  const MODES = [
    { id: 'easy',   label: 'Easy',   emoji: '🌱', cls: 'mode-easy',   startTime: 10 },
    { id: 'medium', label: 'Medium', emoji: '🔥', cls: 'mode-medium', startTime:  7 },
    { id: 'hard',   label: 'Hard',   emoji: '💎', cls: 'mode-hard',   startTime:  5 },
  ];

  const CORRECT_BONUS  = 3;   // seconds added for a correct answer
  const WRONG_PENALTY  = 2;   // seconds removed for a wrong answer

  /* ================================================================
     2. APPLICATION STATE
     ================================================================ */

  const state = {
    selectedCategory:     'addition',
    selectedMode:         'easy',
    level:                1,
    timeLeft:             10,
    maxTime:              10,    // reference ceiling for the timer bar
    currentQuestion:      null,  // { text, answer }
    userInput:            '',
    correctCount:         0,
    wrongCount:           0,
    timerHandle:          null,
    tickIntervalMs:       100,   // how often the timer ticks (ms)
    isPaused:             false,
    isGameOver:           false,
    selectedGender:       null,
    deferredInstallPrompt: null,
  };

  /* ================================================================
     3. LOCALSTORAGE HELPERS
     ================================================================ */

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('[SFJ] Could not read key:', key, e);
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('[SFJ] Could not save key:', key, e);
    }
  }

  function getLeaderboard() {
    return loadJSON(STORAGE_KEYS.LEADERBOARD, []);
  }

  function getStats() {
    return loadJSON(STORAGE_KEYS.STATS, {
      totalGames:        0,
      highestLevel:      0,
      sumLevels:         0,
      correctAnswers:    0,
      wrongAnswers:      0,
      longestStreak:     0,
      currentStreak:     0,
      modeCounts:        {},
      categoryCounts:    {},
      modeBestLevel:     {},
      categoryBestLevel: {},
      personalBests:     {},
    });
  }

  function getSettings() {
    return loadJSON(STORAGE_KEYS.SETTINGS, { soundOn: true, volume: 70 });
  }

  function saveSettings(s) {
    saveJSON(STORAGE_KEYS.SETTINGS, s);
  }

  /* ================================================================
     4. SOUND ENGINE
     Uses the Web Audio API so no audio files are needed.
     All sounds work fully offline.
     ================================================================ */

  const SoundEngine = (() => {
    let ctx      = null;
    let settings = getSettings();

    function ensureCtx() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function tone(freq, durationMs, type = 'sine', gainPeak = 0.2) {
      if (!settings.soundOn) return;
      const ac   = ensureCtx();
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.type          = type;
      osc.frequency.value = freq;
      const vol = (settings.volume / 100) * gainPeak;
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + durationMs / 1000);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + durationMs / 1000);
    }

    return {
      refreshSettings() { settings = getSettings(); },
      correct()  {
        tone(880,  120, 'triangle', 0.25);
        setTimeout(() => tone(1175, 150, 'triangle', 0.20), 90);
      },
      wrong()    { tone(220, 220, 'sawtooth', 0.20); },
      click()    { tone(600,  60, 'square',   0.12); },
      levelUp()  {
        tone(660,  100, 'triangle', 0.22);
        setTimeout(() => tone(880,  100, 'triangle', 0.22), 100);
        setTimeout(() => tone(1100, 180, 'triangle', 0.22), 200);
      },
      gameOver() {
        tone(330, 200, 'sawtooth', 0.20);
        setTimeout(() => tone(220, 300, 'sawtooth', 0.20), 180);
        setTimeout(() => tone(110, 400, 'sawtooth', 0.20), 380);
      },
    };
  })();

  /* ================================================================
     5. CONFETTI EFFECT
     Canvas-based particle burst for milestones and game over.
     ================================================================ */

  const Confetti = (() => {
    const canvas    = document.getElementById('confetti-canvas');
    const ctx       = canvas.getContext('2d');
    let   particles = [];
    let   handle    = null;
    const colors    = ['#1D6FE8', '#FBBF24', '#38BDF8', '#34D399', '#A78BFA', '#FB7185'];

    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    function burst(count = 60, originY = 0.3) {
      for (let i = 0; i < count; i++) {
        particles.push({
          x:        canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.6,
          y:        canvas.height * originY,
          vx:       (Math.random() - 0.5) * 6,
          vy:       Math.random() * -6 - 2,
          size:     Math.random() * 8 + 4,
          color:    colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * 360,
          rotSpeed: (Math.random() - 0.5) * 12,
          gravity:  0.18,
          life:     100,
        });
      }
      if (!handle) loop();
    }

    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.vy       += p.gravity;
        p.x        += p.vx;
        p.y        += p.vy;
        p.rotation += p.rotSpeed;
        p.life     -= 1.5;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(p.life / 100, 0);
        ctx.fillStyle   = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });
      particles = particles.filter((p) => p.life > 0 && p.y < canvas.height + 50);
      if (particles.length > 0) {
        handle = requestAnimationFrame(loop);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        handle = null;
      }
    }

    return { burst };
  })();

  /* ================================================================
     6. VIEW MANAGEMENT
     Each screen is a .view element. JS toggles .active and .hidden
     to control which one is displayed. Toggling both is required
     because Tailwind's `hidden` class uses !important.
     ================================================================ */

  const views = {
    menu:        document.getElementById('view-menu'),
    mode:        document.getElementById('view-mode'),
    category:    document.getElementById('view-category'),
    briefing:    document.getElementById('view-briefing'),
    game:        document.getElementById('view-game'),
    pause:       document.getElementById('view-pause'),
    gameover:    document.getElementById('view-gameover'),
    leaderboard: document.getElementById('view-leaderboard'),
    stats:       document.getElementById('view-stats'),
  };

  function showView(name) {
    Object.entries(views).forEach(([key, el]) => {
      if (key === 'pause') return; // pause overlay managed separately
      const isTarget = key === name;
      el.classList.toggle('active', isTarget);
      el.classList.toggle('hidden', !isTarget);
    });
    window.scrollTo(0, 0);
  }

  function showPause(visible) {
    views.pause.classList.toggle('active', visible);
    views.pause.classList.toggle('hidden', !visible);
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden', 'show');
    void toast.offsetWidth; // force reflow to restart animation
    toast.classList.add('show');
    setTimeout(() => toast.classList.add('hidden'), 1900);
  }

  /* ================================================================
     7. CONFIG LOOKUPS
     ================================================================ */

  function getModeConfig(id)     { return MODES.find((m) => m.id === id); }
  function getCategoryConfig(id) { return CATEGORIES.find((c) => c.id === id); }

  /* ================================================================
     8. SOUND & SETTINGS UI
     ================================================================ */

  function updateSoundUI() {
    const { soundOn, volume } = getSettings();
    document.getElementById('sound-icon').textContent  = soundOn ? '🔊' : '🔇';
    document.getElementById('sound-label').textContent = soundOn ? 'Sound On' : 'Sound Off';
    document.getElementById('btn-pause-sound').textContent = soundOn ? '🔊' : '🔇';
    document.getElementById('volume-slider').value     = volume;
  }

  /* ================================================================
     9. RENDER — MODE SELECTION
     Creates full-width tappable cards, one per mode.
     Tapping a card sets state.selectedMode then advances to categories.
     ================================================================ */

  function renderModeList() {
    const container = document.getElementById('mode-list');
    container.innerHTML = '';

    const subtitles = {
      easy:   'Perfect for learning and having fun!',
      medium: 'Ready for a bigger challenge?',
      hard:   'Only the quickest math heroes can win!'
    };

    MODES.forEach((mode) => {
      const btn = document.createElement('button');
      btn.className = `mode-card ${mode.cls}`;
      btn.innerHTML = `
        <span class="mode-emoji">${mode.emoji}</span>
        <span class="flex flex-col gap-0.5">
          <span class="mode-title">${mode.label}</span>
          <span class="mode-sub">${subtitles[mode.id]} · Start: ${mode.startTime}s</span>
        </span>
        <span class="mode-arrow">›</span>
      `;
      btn.addEventListener('click', () => {
        state.selectedMode = mode.id;
        SoundEngine.click();
        renderCategoryList();
        showView('category');
      });
      container.appendChild(btn);
    });
  }

  /* ================================================================
     10. RENDER — CATEGORY SELECTION
     2-column grid; Mixed spans both columns for visual balance.
     Tapping a card sets state.selectedCategory then shows briefing.
     ================================================================ */

  function renderCategoryList() {
    const container = document.getElementById('category-list');
    container.innerHTML = '';

    CATEGORIES.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = `category-card ${cat.cls}`;
      if (cat.id === 'mixed') btn.classList.add('span-full');
      btn.innerHTML = `
        <span class="cat-emoji">${cat.emoji}</span>
        <span>${cat.label}</span>
      `;
      btn.addEventListener('click', () => {
        state.selectedCategory = cat.id;
        SoundEngine.click();
        showBriefing();
      });
      container.appendChild(btn);
    });
  }

  /* ================================================================
     11. BRIEFING SCREEN
     Summarises the selected mode and category with the key rules.
     ================================================================ */

  function showBriefing() {
    const mode = getModeConfig(state.selectedMode);
    const cat  = getCategoryConfig(state.selectedCategory);
    document.getElementById('briefing-title').textContent = `${mode.label} ${cat.label}`;
    document.getElementById('briefing-emoji').textContent = cat.emoji;
    document.getElementById('briefing-timer').textContent = `${mode.startTime}s`;
    showView('briefing');
  }

  /* ================================================================
     12. PROCEDURAL DIFFICULTY SCALING
     Number ranges expand every 3 levels. Every 20 levels the timer
     ceiling shrinks slightly. Scaling continues indefinitely.
     ================================================================ */

  function getDifficultyRange(category, mode, level) {
    const baseRanges = {
      easy:   { min: 1, max:  9 },
      medium: { min: 5, max: 25 },
      hard:   { min: 10, max: 50 },
    };
    const base = baseRanges[mode];

    const stepSizes = { easy: 2, medium: 4, hard: 8 };
    const step      = stepSizes[mode];
    const blocks    = Math.floor((level - 1) / 3);
    const growth    = Math.round(blocks * step * (1 + blocks * 0.05));

    let max = base.max + growth;
    let min = base.min + Math.floor(growth * 0.3);

    // Keep multiplication and division operands sensible for kids
    if (category === 'multiplication' || category === 'division') {
      const divisor = { easy: 4, medium: 3, hard: 2 }[mode];
      max = Math.max(4, Math.round(max / divisor));
      min = Math.max(1, Math.round(min / divisor));
    }

    if (min >= max) min = Math.max(1, max - 1);
    return { min, max };
  }

  function getMaxTimeForLevel(mode, level) {
    const base       = getModeConfig(mode).startTime;
    const reductions = Math.floor((level - 1) / 20);
    return Math.max(2, base - reductions * 0.5);
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /* ================================================================
     13. QUESTION GENERATOR
     Returns { text, answer } for the current mode/category/level.
     ================================================================ */

  function generateQuestion(category, mode, level) {
    const range = getDifficultyRange(category, mode, level);
    let   op    = category;

    if (op === 'mixed') {
      const ops = ['addition', 'subtraction', 'multiplication', 'division'];
      op = ops[randInt(0, ops.length - 1)];
    }

    let a, b, text, answer;

    switch (op) {
      case 'addition': {
        a = randInt(range.min, range.max);
        b = randInt(range.min, range.max);
        text   = `${a} + ${b} = ?`;
        answer = a + b;
        break;
      }
      case 'subtraction': {
        a = randInt(range.min, range.max);
        b = randInt(range.min, range.max);
        if (a < b) [a, b] = [b, a]; // keep result non-negative
        text   = `${a} − ${b} = ?`;
        answer = a - b;
        break;
      }
      case 'multiplication': {
        a = randInt(range.min, range.max);
        b = randInt(range.min, Math.min(range.max, 12));
        text   = `${a} × ${b} = ?`;
        answer = a * b;
        break;
      }
      case 'division': {
        // Build a guaranteed whole-number result: b × quotient = a
        b       = randInt(Math.max(1, range.min), Math.min(range.max, 12));
        const q = randInt(range.min, range.max);
        a       = b * q;
        text    = `${a} ÷ ${b} = ?`;
        answer  = q;
        break;
      }
      default: {
        a = randInt(range.min, range.max);
        b = randInt(range.min, range.max);
        text   = `${a} + ${b} = ?`;
        answer = a + b;
      }
    }

    return { text, answer };
  }

  /* ================================================================
     14. KEYPAD
     Custom on-screen numeric keypad — the device keyboard is never
     invoked so the layout stays predictable on all screen sizes.
     ================================================================ */

  function renderKeypad() {
    const keypad = document.getElementById('keypad');
    keypad.innerHTML = '';
    const layout = ['1','2','3','4','5','6','7','8','9','C','0','⏎'];

    layout.forEach((key) => {
      const btn = document.createElement('button');
      btn.className   = 'key-btn';
      btn.textContent = key === 'C' ? '⌫' : key;
      btn.setAttribute('aria-label', key === 'C' ? 'Clear' : key === '⏎' ? 'Submit' : `Digit ${key}`);
      if (key === 'C')  btn.classList.add('key-clear');
      if (key === '⏎') btn.classList.add('key-submit');
      btn.addEventListener('click', () => handleKeyInput(key));
      keypad.appendChild(btn);
    });
  }

  function handleKeyInput(key) {
    if (state.isPaused || state.isGameOver) return;
    SoundEngine.click();

    if (key === 'C') {
      state.userInput = state.userInput.slice(0, -1);
    } else if (key === '⏎') {
      submitAnswer();
      return;
    } else {
      if (state.userInput.length < 6) {
        // Prevent leading zeros (treat a lone zero as a digit to be replaced)
        state.userInput = state.userInput === '0' ? key : state.userInput + key;
      }
    }
    refreshAnswerDisplay();
  }

  function refreshAnswerDisplay() {
    const el = document.getElementById('answer-display');
    el.textContent = state.userInput.length ? state.userInput : '_';
  }

  /* ================================================================
     15. GAME LOOP
     ================================================================ */

  function startGame() {
    state.level        = 1;
    state.correctCount = 0;
    state.wrongCount   = 0;
    state.userInput    = '';
    state.isPaused     = false;
    state.isGameOver   = false;

    const mode      = getModeConfig(state.selectedMode);
    state.maxTime   = getMaxTimeForLevel(state.selectedMode, state.level);
    state.timeLeft  = mode.startTime;

    showView('game');
    renderKeypad();
    nextQuestion();
    updateHUD();
    startTimer();
  }

  function nextQuestion() {
    state.currentQuestion = generateQuestion(state.selectedCategory, state.selectedMode, state.level);
    state.userInput       = '';
    refreshAnswerDisplay();

    const cat  = getCategoryConfig(state.selectedCategory);
    const mode = getModeConfig(state.selectedMode);
    document.getElementById('game-category-label').textContent = `${cat.label} · ${mode.label}`;
    document.getElementById('question-text').textContent       = state.currentQuestion.text;

    // Re-trigger pop-in animation
    const card = document.getElementById('question-card');
    card.classList.remove('animate-pop-in');
    void card.offsetWidth;
    card.classList.add('animate-pop-in');
  }

  function startTimer() {
    clearInterval(state.timerHandle);
    state.timerHandle = setInterval(tick, state.tickIntervalMs);
  }

  function stopTimer() {
    clearInterval(state.timerHandle);
    state.timerHandle = null;
  }

  function tick() {
    if (state.isPaused || state.isGameOver) return;
    state.timeLeft -= state.tickIntervalMs / 1000;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      updateHUD();
      endGame();
      return;
    }
    updateHUD();
  }

  function updateHUD() {
    document.getElementById('hud-level').textContent = state.level;
    document.getElementById('hud-timer').textContent = `${state.timeLeft.toFixed(1)}s`;

    const bar = document.getElementById('timer-bar');
    const pct = Math.min(100, Math.max(0, (state.timeLeft / state.maxTime) * 100));
    bar.style.width = `${pct}%`;

    bar.classList.remove('timer-warn', 'timer-danger');
    if      (state.timeLeft <= 3) bar.classList.add('timer-danger');
    else if (state.timeLeft <= 5) bar.classList.add('timer-warn');
  }

  function submitAnswer() {
    if (!state.userInput) return;

    const given   = parseInt(state.userInput, 10);
    const correct = given === state.currentQuestion.answer;
    const card    = document.getElementById('question-card');

    card.classList.remove('flash-correct', 'flash-wrong');

    if (correct) {
      state.correctCount++;
      state.timeLeft += CORRECT_BONUS;
      SoundEngine.correct();
      card.classList.add('flash-correct');
      advanceLevel();
    } else {
      state.wrongCount++;
      state.timeLeft -= WRONG_PENALTY;
      SoundEngine.wrong();
      card.classList.add('flash-wrong');
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        updateHUD();
        endGame();
        return;
      }
    }

    setTimeout(() => card.classList.remove('flash-correct', 'flash-wrong'), 420);
    updateHUD();
    nextQuestion();
  }

  function advanceLevel() {
    state.level++;
    state.maxTime = getMaxTimeForLevel(state.selectedMode, state.level);
    SoundEngine.levelUp();

    if (state.level % 10 === 0) {
      Confetti.burst(80, 0.25);
      showToast(`🎉 Level ${state.level}! Incredible!`);
    } else {
      showToast(`⭐ Level ${state.level}!`);
    }
  }

  /* ================================================================
     16. PAUSE MENU
     ================================================================ */

  function pauseGame()   { state.isPaused = true;  showPause(true);  }
  function resumeGame()  { state.isPaused = false; showPause(false); }
  function restartGame() { showPause(false); startGame(); }
  function quitToMenu()  { stopTimer(); showPause(false); showView('menu'); }

  /* ================================================================
     17. GAME OVER — FEEDBACK & SAVE
     ================================================================ */

  function endGame() {
    state.isGameOver = true;
    stopTimer();
    SoundEngine.gameOver();
    Confetti.burst(50, 0.2);

    document.getElementById('result-level').textContent = `Level ${state.level}`;

    // Reset the save form to its initial state
    document.getElementById('input-nickname').value = '';
    state.selectedGender = null;
    document.querySelectorAll('.gender-btn').forEach((b) => b.classList.remove('selected'));

    // Show the save form, hide the post-save actions
    const form    = document.getElementById('gameover-form');
    const actions = document.getElementById('gameover-actions');
    form.classList.remove('hidden');
    form.classList.add('flex', 'flex-col');
    actions.classList.add('hidden');
    actions.classList.remove('flex', 'flex-col');

    buildFeedback();
    showView('gameover');
  }

  function buildFeedback() {
    const box        = document.getElementById('feedback-box');
    const leaderboard = getLeaderboard();
    const relevant   = leaderboard.filter(
      (e) => e.mode === state.selectedMode && e.category === state.selectedCategory
    );

    if (relevant.length === 0) {
      box.textContent = 'This is your first record here. Play again and beat it!';
      return;
    }

    const best = relevant.reduce((top, e) => (e.level > top.level ? e : top), relevant[0]);

    if (state.level > best.level) {
      const pct = best.level > 0
        ? Math.round(((state.level - best.level) / best.level) * 100)
        : 100;
      box.textContent = `🏅 New personal best! That's ${pct}% better than before — amazing!`;
    } else if (state.level === best.level) {
      box.textContent = `👏 You matched your best level (${best.level}). So close to a new record!`;
    } else {
      const gap = best.level - state.level;
      box.textContent = `💪 You reached Level ${state.level}. Your best is Level ${best.level} — only ${gap} more to beat it!`;
    }
  }

  function saveScore() {
    const rawName  = document.getElementById('input-nickname').value.trim();
    const nickname = (rawName || 'Player').slice(0, 10);
    const gender   = state.selectedGender || 'na';

    const entry = {
      nickname,
      gender,
      level:    state.level,
      mode:     state.selectedMode,
      category: state.selectedCategory,
      date:     new Date().toISOString(),
      correct:  state.correctCount,
      wrong:    state.wrongCount,
    };

    // Persist to leaderboard (capped at 100 entries, sorted by level)
    const board = getLeaderboard();
    board.push(entry);
    board.sort((a, b) => b.level - a.level);
    saveJSON(STORAGE_KEYS.LEADERBOARD, board.slice(0, 100));

    // Update lifetime stats
    const stats = getStats();
    stats.totalGames++;
    stats.sumLevels    += state.level;
    stats.highestLevel  = Math.max(stats.highestLevel, state.level);
    stats.correctAnswers += state.correctCount;
    stats.wrongAnswers   += state.wrongCount;
    stats.longestStreak  = Math.max(stats.longestStreak, state.correctCount);
    stats.modeCounts[state.selectedMode]         = (stats.modeCounts[state.selectedMode] || 0) + 1;
    stats.categoryCounts[state.selectedCategory] = (stats.categoryCounts[state.selectedCategory] || 0) + 1;
    stats.modeBestLevel[state.selectedMode]       = Math.max(stats.modeBestLevel[state.selectedMode] || 0, state.level);
    stats.categoryBestLevel[state.selectedCategory] = Math.max(stats.categoryBestLevel[state.selectedCategory] || 0, state.level);

    const pbKey = `${state.selectedMode}_${state.selectedCategory}`;
    if (!stats.personalBests[pbKey] || state.level > stats.personalBests[pbKey].level) {
      stats.personalBests[pbKey] = { level: state.level, date: entry.date };
    }
    saveJSON(STORAGE_KEYS.STATS, stats);

    // Switch UI to the post-save action buttons
    const form    = document.getElementById('gameover-form');
    const actions = document.getElementById('gameover-actions');
    form.classList.add('hidden');
    form.classList.remove('flex', 'flex-col');
    actions.classList.remove('hidden');
    actions.classList.add('flex', 'flex-col');

    Confetti.burst(60, 0.3);
  }

  /* ================================================================
     18. LEADERBOARD RENDERING
     ================================================================ */

  const GENDER_ICONS = { boy: '👦', girl: '👧', na: '🌟' };

  function renderLeaderboard() {
    const list      = document.getElementById('leaderboard-list');
    const catFilter = document.getElementById('filter-category').value;
    const modeFilter = document.getElementById('filter-mode').value;

    let entries = getLeaderboard();
    if (catFilter  !== 'all') entries = entries.filter((e) => e.category === catFilter);
    if (modeFilter !== 'all') entries = entries.filter((e) => e.mode === modeFilter);
    entries.sort((a, b) => b.level - a.level);
    entries = entries.slice(0, 50);

    list.innerHTML = '';

    if (entries.length === 0) {
      list.innerHTML = `
        <div class="text-center py-12">
          <div class="text-5xl mb-3">🪙</div>
          <p class="font-display font-bold text-primary text-lg">No scores yet!</p>
          <p class="text-sm font-bold text-muted">Play a game to get on the board.</p>
        </div>`;
      return;
    }

    entries.forEach((entry, i) => {
      const rank   = i + 1;
      const medal  = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
      const date   = new Date(entry.date).toLocaleDateString();
      const catLbl = getCategoryConfig(entry.category)?.label || entry.category;
      const modLbl = getModeConfig(entry.mode)?.label        || entry.mode;

      const item = document.createElement('div');
      item.className = `leaderboard-item ${rank <= 3 ? `rank-${rank}` : ''}`;
      item.innerHTML = `
        <span class="rank">${medal}</span>
        <span class="text-2xl">${GENDER_ICONS[entry.gender] || '🌟'}</span>
        <div class="flex-1 min-w-0">
          <p class="font-display font-extrabold text-sm leading-tight truncate">${escapeHTML(entry.nickname)}</p>
          <p class="text-xs font-bold text-muted truncate">${modLbl} · ${catLbl} · ${date}</p>
        </div>
        <div class="text-right shrink-0">
          <p class="font-display font-extrabold text-lg text-primary leading-tight">Lv.${entry.level}</p>
        </div>
      `;
      list.appendChild(item);
    });
  }

  function escapeHTML(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  /* ================================================================
     19. STATS DASHBOARD
     ================================================================ */

  function renderStats() {
    const stats     = getStats();
    const grid      = document.getElementById('stats-grid');
    const avgLevel  = stats.totalGames > 0
      ? (stats.sumLevels / stats.totalGames).toFixed(1)
      : '0';

    const bestMode = Object.entries(stats.modeBestLevel)
      .sort((a, b) => b[1] - a[1])[0];
    const bestCat  = Object.entries(stats.categoryBestLevel)
      .sort((a, b) => b[1] - a[1])[0];

    const cards = [
      { icon: '🎮', value: stats.totalGames,   label: 'Games Played'   },
      { icon: '⭐', value: stats.highestLevel,  label: 'Highest Level'  },
      { icon: '📈', value: avgLevel,            label: 'Average Level'  },
      { icon: '🔥', value: stats.longestStreak, label: 'Best Streak'    },
      {
        icon: '🏆',
        value: bestMode ? `${getModeConfig(bestMode[0])?.label} (Lv.${bestMode[1]})` : '—',
        label: 'Best Mode',
      },
      {
        icon: '🎯',
        value: bestCat ? `${getCategoryConfig(bestCat[0])?.label} (Lv.${bestCat[1]})` : '—',
        label: 'Best Category',
      },
    ];

    grid.innerHTML = cards.map((c) => `
      <div class="stat-card">
        <div class="stat-icon">${c.icon}</div>
        <div class="stat-value">${c.value}</div>
        <div class="stat-label">${c.label}</div>
      </div>`
    ).join('');

    const total    = stats.correctAnswers + stats.wrongAnswers;
    const accuracy = total > 0 ? Math.round((stats.correctAnswers / total) * 100) : 0;
    document.getElementById('accuracy-bar').style.width = `${accuracy}%`;
    document.getElementById('accuracy-text').textContent = total > 0
      ? `${accuracy}% (${stats.correctAnswers} correct · ${stats.wrongAnswers} wrong)`
      : 'No games played yet';
  }

  /* ================================================================
     20. EVENT BINDINGS
     ================================================================ */

  function bindEvents() {

    // Landing page
    document.getElementById('btn-play').addEventListener('click', () => {
      SoundEngine.click();
      renderModeList();
      showView('mode');
    });
    document.getElementById('btn-leaderboard').addEventListener('click', () => {
      SoundEngine.click();
      renderLeaderboard();
      showView('leaderboard');
    });
    document.getElementById('btn-stats').addEventListener('click', () => {
      SoundEngine.click();
      renderStats();
      showView('stats');
    });
    document.getElementById('btn-sound-toggle').addEventListener('click', () => {
      const s = getSettings();
      s.soundOn = !s.soundOn;
      saveSettings(s);
      SoundEngine.refreshSettings();
      updateSoundUI();
      if (s.soundOn) SoundEngine.click();
    });

    // Mode selection
    document.getElementById('btn-mode-back').addEventListener('click', () => {
      SoundEngine.click();
      showView('menu');
    });

    // Category selection
    document.getElementById('btn-category-back').addEventListener('click', () => {
      SoundEngine.click();
      renderModeList();
      showView('mode');
    });

    // Briefing
    document.getElementById('btn-briefing-back').addEventListener('click', () => {
      SoundEngine.click();
      renderCategoryList();
      showView('category');
    });
    document.getElementById('btn-briefing-start').addEventListener('click', () => {
      SoundEngine.click();
      startGame();
    });

    // In-game pause
    document.getElementById('btn-pause').addEventListener('click', () => {
      SoundEngine.click();
      pauseGame();
    });
    document.getElementById('btn-resume').addEventListener('click', () => {
      SoundEngine.click();
      resumeGame();
    });
    document.getElementById('btn-restart').addEventListener('click', () => {
      SoundEngine.click();
      restartGame();
    });
    document.getElementById('btn-quit').addEventListener('click', () => {
      SoundEngine.click();
      quitToMenu();
    });
    document.getElementById('btn-pause-sound').addEventListener('click', () => {
      const s = getSettings();
      s.soundOn = !s.soundOn;
      saveSettings(s);
      SoundEngine.refreshSettings();
      updateSoundUI();
    });
    document.getElementById('volume-slider').addEventListener('input', (e) => {
      const s = getSettings();
      s.volume = parseInt(e.target.value, 10);
      saveSettings(s);
      SoundEngine.refreshSettings();
    });

    // Game Over screen
    /*document.getElementById('btn-try-again').addEventListener('click', () => {
      SoundEngine.click();
      startGame(); // restart with the same mode and category, skipping the briefing
    });*/
    document.querySelectorAll('.gender-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        SoundEngine.click();
        document.querySelectorAll('.gender-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.selectedGender = btn.dataset.gender;
      });
    });
    document.getElementById('btn-save-score').addEventListener('click', () => {
      SoundEngine.click();
      saveScore();
    });
    document.getElementById('btn-play-again').addEventListener('click', () => {
      SoundEngine.click();
      showBriefing(); // go through briefing again (same settings)
    });
    document.getElementById('btn-gameover-leaderboard').addEventListener('click', () => {
      SoundEngine.click();
      renderLeaderboard();
      showView('leaderboard');
    });
    document.getElementById('btn-gameover-menu').addEventListener('click', () => {
      SoundEngine.click();
      showView('menu');
    });

    // Leaderboard
    document.getElementById('btn-leaderboard-back').addEventListener('click', () => {
      SoundEngine.click();
      showView('menu');
    });
    document.getElementById('filter-category').addEventListener('change', renderLeaderboard);
    document.getElementById('filter-mode').addEventListener('change', renderLeaderboard);

    // Stats
    document.getElementById('btn-stats-back').addEventListener('click', () => {
      SoundEngine.click();
      showView('menu');
    });
    document.getElementById('btn-reset-stats').addEventListener('click', () => {
      if (confirm('This will erase all scores and statistics. Are you sure?')) {
        localStorage.removeItem(STORAGE_KEYS.LEADERBOARD);
        localStorage.removeItem(STORAGE_KEYS.STATS);
        renderStats();
        showToast('🗑️ All data cleared');
      }
    });

    // Physical keyboard support for desktop / testing
    document.addEventListener('keydown', (e) => {
      if (!views.game.classList.contains('active')) return;
      if (state.isPaused || state.isGameOver) return;
      if (e.key >= '0' && e.key <= '9') handleKeyInput(e.key);
      else if (e.key === 'Backspace')    handleKeyInput('C');
      else if (e.key === 'Enter')        handleKeyInput('⏎');
    });
  }

  /* ================================================================
     21. PWA INSTALL PROMPT
     ================================================================ */

  function setupInstallPrompt() {
    const btn = document.getElementById('btn-install');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredInstallPrompt = e;
      btn.classList.remove('hidden');
    });

    btn.addEventListener('click', async () => {
      if (!state.deferredInstallPrompt) return;
      state.deferredInstallPrompt.prompt();
      const { outcome } = await state.deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') btn.classList.add('hidden');
      state.deferredInstallPrompt = null;
    });

    window.addEventListener('appinstalled', () => {
      btn.classList.add('hidden');
    });
  }

  /* ================================================================
     22. SERVICE WORKER REGISTRATION
     Relative path ensures it works on GitHub Pages project sites
     (e.g. https://user.github.io/repo/).
     ================================================================ */

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').catch((err) => {
          console.warn('[SFJ] Service worker registration failed:', err);
        });
      });
    }
  }

  /* ================================================================
     23. BOOT
     ================================================================ */

  function init() {
    updateSoundUI();
    bindEvents();
    setupInstallPrompt();
    registerServiceWorker();
    showView('menu');
  }

  document.addEventListener('DOMContentLoaded', init);


  let selectedGender = null;

  document.querySelectorAll('.gender-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedGender = btn.dataset.gender;

      document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // before form submit / start game
  function validate() {
    if (!selectedGender) {
      alert("Please select who you are");
      return false;
    }
    return true;
  }
})();