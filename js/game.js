(function () {
  "use strict";

  const C = window.GoldMinerCore;
  if (!C) {
    document.body.innerHTML = "<p style='color:#fff;font:16px sans-serif;padding:24px'>游戏核心加载失败，请刷新页面。</p>";
    return;
  }

  const CONFIG = C.normalizeConfig(window.GOLD_MINER_CONFIG);
  const W = C.WORLD_WIDTH;
  const PIVOT_Y = 208;
  const HOOK_MIN = 58;
  const MAX_ANGLE = 1.31;
  const SHOOT_SPEED = 920;
  const EMPTY_RETURN_SPEED = 880;
  const ITEM_START_Y = 272;
  const numberFormat = new Intl.NumberFormat("zh-CN");

  function $(id) {
    return document.getElementById(id);
  }

  const els = {
    stage: $("stage"),
    canvas: $("game"),
    levelValue: $("levelValue"),
    targetValue: $("targetValue"),
    timeValue: $("timeValue"),
    moneyValue: $("moneyValue"),
    timerBox: $("timerBox"),
    progressFill: $("progressFill"),
    progressLabel: $("progressLabel"),
    soundBtn: $("soundBtn"),
    soundIconUse: $("soundIconUse"),
    musicBtn: $("musicBtn"),
    pauseBtn: $("pauseBtn"),
    tntBtn: $("tntBtn"),
    tntCount: $("tntCount"),
    strengthCount: $("strengthCount"),
    cloverCount: $("cloverCount"),
    buffBar: $("buffBar"),
    toast: $("toast"),
    startScreen: $("startScreen"),
    pauseScreen: $("pauseScreen"),
    resultScreen: $("resultScreen"),
    shopScreen: $("shopScreen"),
    bestScoreStart: $("bestScoreStart"),
    bestLevelStart: $("bestLevelStart"),
    startBtn: $("startBtn"),
    resumeBtn: $("resumeBtn"),
    restartFromPauseBtn: $("restartFromPauseBtn"),
    resultEyebrow: $("resultEyebrow"),
    resultIcon: $("resultIcon"),
    resultIconUse: $("resultIconUse"),
    resultTitle: $("resultTitle"),
    resultSub: $("resultSub"),
    resultEarned: $("resultEarned"),
    resultTotal: $("resultTotal"),
    resultTarget: $("resultTarget"),
    resultBest: $("resultBest"),
    winActions: $("winActions"),
    failActions: $("failActions"),
    shopBtn: $("shopBtn"),
    nextLevelBtn: $("nextLevelBtn"),
    retryBtn: $("retryBtn"),
    shopMoney: $("shopMoney"),
    shopTntCount: $("shopTntCount"),
    shopStrengthCount: $("shopStrengthCount"),
    shopCloverCount: $("shopCloverCount"),
    continueFromShopBtn: $("continueFromShopBtn")
  };

  const ctx = els.canvas.getContext("2d", { alpha: false });
  const bgCanvas = document.createElement("canvas");
  const bgCtx = bgCanvas.getContext("2d", { alpha: false });
  let H = 900;
  let dpr = 1;

  const game = {
    mode: "menu",
    level: 1,
    money: 0,
    levelEarned: 0,
    target: C.levelTarget(1),
    timeLeft: C.LEVEL_SECONDS,
    timeUp: false,
    cleared: false,
    strength: 0,
    inventory: { tnt: 0, strength: 0, clover: 0 },
    items: [],
    particles: [],
    floaters: [],
    shake: { time: 0, power: 0 },
    hook: {
      angle: 0,
      dir: 1,
      speed: CONFIG.hookSwingSpeed,
      length: HOOK_MIN,
      maxLength: 1000,
      state: "swing",
      item: null
    },
    lastFrame: 0,
    elapsed: 0,
    lastTimeShown: null,
    toastTimer: 0
  };

  function loadSave() {
    try {
      return C.sanitizeSave(window.localStorage.getItem(C.SAVE_KEY));
    } catch (error) {
      return C.sanitizeSave(null);
    }
  }

  let save = loadSave();

  function persist() {
    try {
      window.localStorage.setItem(C.SAVE_KEY, JSON.stringify(save));
    } catch (error) {
      /* 隐私模式或存储被禁用时，游戏仅保留内存状态。 */
    }
  }

  function moneyText(value) {
    return "¥" + numberFormat.format(Math.max(0, Math.round(Number(value) || 0)));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  const Sound = {
    ctx: null,
    ensure: function () {
      try {
        if (!this.ctx) {
          const AudioCtor = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtor) return null;
          this.ctx = new AudioCtor();
        }
        if (this.ctx.state === "suspended") {
          this.ctx.resume().catch(function () {});
        }
        return this.ctx;
      } catch (error) {
        return null;
      }
    },
    tone: function (options) {
      if (save.muted) return;
      const ac = this.ensure();
      if (!ac) return;
      try {
        const start = ac.currentTime + (options.delay || 0);
        const duration = options.dur || 0.12;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = options.type || "sine";
        osc.frequency.setValueAtTime(Math.max(20, options.freq || 440), start);
        if (options.endFreq) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFreq), start + duration);
        }
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.001, options.gain || 0.08), start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(start);
        osc.stop(start + duration + 0.03);
      } catch (error) {
        /* 音频失败不影响玩法。 */
      }
    },
    noise: function (duration, gainValue, cutoff) {
      if (save.muted) return;
      const ac = this.ensure();
      if (!ac) return;
      try {
        const length = Math.floor(ac.sampleRate * duration);
        const buffer = ac.createBuffer(1, length, ac.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i += 1) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / length);
        }
        const source = ac.createBufferSource();
        const filter = ac.createBiquadFilter();
        const gain = ac.createGain();
        source.buffer = buffer;
        filter.type = "lowpass";
        filter.frequency.value = cutoff || 900;
        gain.gain.setValueAtTime(gainValue || 0.2, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(ac.destination);
        source.start();
      } catch (error) {
        /* 忽略音频错误。 */
      }
    },
    shoot: function () {
      this.tone({ freq: 660, endFreq: 190, dur: 0.16, type: "triangle", gain: 0.055 });
    },
    grab: function () {
      this.tone({ freq: 920, endFreq: 520, dur: 0.1, type: "square", gain: 0.045 });
    },
    coin: function () {
      this.tone({ freq: 880, dur: 0.09, type: "sine", gain: 0.06 });
      this.tone({ freq: 1320, dur: 0.14, type: "sine", gain: 0.055, delay: 0.07 });
    },
    explosion: function () {
      this.noise(0.45, 0.2, 780);
      this.tone({ freq: 95, endFreq: 34, dur: 0.42, type: "sawtooth", gain: 0.1 });
    },
    win: function () {
      [523, 659, 784, 1047].forEach(function (freq, index) {
        Sound.tone({ freq: freq, dur: 0.26, type: "triangle", gain: 0.06, delay: index * 0.09 });
      });
    },
    fail: function () {
      this.tone({ freq: 320, endFreq: 110, dur: 0.62, type: "sawtooth", gain: 0.07 });
    },
    click: function () {
      this.tone({ freq: 540, dur: 0.05, type: "square", gain: 0.03 });
    },
    error: function () {
      this.tone({ freq: 190, endFreq: 120, dur: 0.16, type: "square", gain: 0.045 });
    }
  };

  const MUSIC_TRACKS = [
    {
      name: "矿洞回响",
      bpm: 76,
      root: 57,
      wave: "triangle",
      leadGain: 0.032,
      bassGain: 0.024,
      lead: [0, null, 3, null, 5, null, 3, null, -2, null, 0, 3, 5, null, 7, null],
      bass: [0, null, null, null, -5, null, null, null, 3, null, null, null, -2, null, null, null]
    },
    {
      name: "星夜矿歌",
      bpm: 90,
      root: 64,
      wave: "sine",
      leadGain: 0.028,
      bassGain: 0.02,
      lead: [0, 7, 12, 7, 3, 10, 15, 10, 0, 7, 12, 7, -2, 5, 10, 5],
      bass: [0, null, null, null, -5, null, null, null, -2, null, null, null, -7, null, null, null]
    },
    {
      name: "老式留声机",
      bpm: 104,
      root: 60,
      wave: "triangle",
      leadGain: 0.026,
      bassGain: 0.022,
      lead: [0, 4, 7, 9, 7, 4, 0, 4, 5, 9, 12, 9, 7, 4, 2, 4],
      bass: [0, null, null, null, 5, null, null, null, 7, null, null, null, 5, null, null, null]
    }
  ];

  function midiToFrequency(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  const Music = {
    timer: 0,
    master: null,
    nextTime: 0,
    step: 0,
    trackIndex: -1,
    running: false,
    start: function (trackIndex, restart) {
      const index = Number(trackIndex);
      const track = MUSIC_TRACKS[index];
      if (save.muted || !track) {
        this.stop();
        return;
      }
      if (this.running && this.trackIndex === index && !restart) return;
      const ac = Sound.ensure();
      if (!ac) return;
      this.stop();
      this.trackIndex = index;
      this.running = true;
      this.step = 0;
      this.master = ac.createGain();
      this.master.gain.setValueAtTime(Math.max(0.0001, CONFIG.musicVolume * 0.9), ac.currentTime);
      this.master.connect(ac.destination);
      this.nextTime = ac.currentTime + 0.08;
      const self = this;
      this.timer = window.setInterval(function () {
        self.schedule();
      }, 120);
      this.schedule();
    },
    stop: function () {
      this.running = false;
      this.trackIndex = -1;
      if (this.timer) {
        window.clearInterval(this.timer);
        this.timer = 0;
      }
      if (this.master) {
        const master = this.master;
        this.master = null;
        try {
          const ac = Sound.ctx;
          if (ac) {
            master.gain.cancelScheduledValues(ac.currentTime);
            master.gain.setTargetAtTime(0.0001, ac.currentTime, 0.025);
          }
          window.setTimeout(function () {
            try {
              master.disconnect();
            } catch (error) {
              /* 已断开时忽略。 */
            }
          }, 300);
        } catch (error) {
          /* 忽略音频节点清理错误。 */
        }
      }
    },
    schedule: function () {
      const ac = Sound.ctx;
      const track = MUSIC_TRACKS[this.trackIndex];
      if (!this.running || !this.master || !ac || !track || save.muted || save.musicTrack < 0) {
        this.stop();
        return;
      }
      if (ac.state === "closed") {
        this.stop();
        return;
      }
      if (ac.state !== "running") {
        this.nextTime = ac.currentTime + 0.08;
        return;
      }
      const stepDuration = 60 / track.bpm / 2;
      while (this.nextTime < ac.currentTime + 0.45) {
        const step = this.step;
        const lead = track.lead[step % track.lead.length];
        if (lead !== null) {
          this.note(
            ac,
            track.root + lead,
            this.nextTime,
            Math.min(0.58, stepDuration * 1.35),
            track.wave,
            track.leadGain
          );
        }
        if (step % 2 === 0) {
          const bass = track.bass[(step / 2) % track.bass.length];
          if (bass !== null) {
            this.note(
              ac,
              track.root + bass - 12,
              this.nextTime,
              Math.min(0.9, stepDuration * 2.8),
              "sine",
              track.bassGain
            );
          }
        }
        this.nextTime += stepDuration;
        this.step += 1;
      }
    },
    note: function (ac, note, start, duration, type, gainValue) {
      if (!this.master) return;
      try {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(midiToFrequency(note), start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start(start);
        osc.stop(start + duration + 0.05);
      } catch (error) {
        /* 音频失败不影响玩法。 */
      }
    }
  };

  function vibrate(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (error) {
      /* 不支持振动的设备直接跳过。 */
    }
  }

  function updateSoundButton() {
    els.soundIconUse.setAttribute("href", save.muted ? "#i-muted" : "#i-sound");
    els.soundBtn.setAttribute("aria-pressed", String(save.muted));
    els.soundBtn.setAttribute("aria-label", save.muted ? "开启音效" : "关闭音效");
  }

  function updateMusicButton() {
    const track = MUSIC_TRACKS[save.musicTrack];
    const off = save.musicTrack < 0;
    els.musicBtn.classList.toggle("is-off", off);
    els.musicBtn.setAttribute(
      "aria-label",
      off ? "背景音乐已关闭，点击切换" : "当前背景音乐：" + track.name + "，点击切换"
    );
    els.musicBtn.title = off ? "背景音乐已关闭" : "当前背景音乐：" + track.name;
  }

  function cycleMusic() {
    save.musicTrack = save.musicTrack >= MUSIC_TRACKS.length - 1 ? -1 : save.musicTrack + 1;
    persist();
    updateMusicButton();
    Music.start(save.musicTrack, true);
    const label = save.musicTrack < 0 ? "背景音乐已关闭" : "背景音乐：" + MUSIC_TRACKS[save.musicTrack].name;
    showToast(save.muted ? "音效已关闭，开启后可听到" : label, 1300);
    Sound.click();
  }

  const buffChip = document.createElement("div");
  buffChip.className = "buff hidden";
  buffChip.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-potion"></use></svg><span></span>';
  const buffText = buffChip.querySelector("span");
  els.buffBar.appendChild(buffChip);

  function showToast(message, duration) {
    window.clearTimeout(game.toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    game.toastTimer = window.setTimeout(function () {
      els.toast.classList.remove("show");
    }, duration || 1600);
  }

  function showScreen(name) {
    const map = {
      start: els.startScreen,
      pause: els.pauseScreen,
      result: els.resultScreen,
      shop: els.shopScreen
    };
    Object.keys(map).forEach(function (key) {
      map[key].classList.toggle("is-visible", key === name);
    });
  }

  function hideScreens() {
    [els.startScreen, els.pauseScreen, els.resultScreen, els.shopScreen].forEach(function (screen) {
      screen.classList.remove("is-visible");
    });
  }

  function updateHud() {
    els.levelValue.textContent = String(game.level);
    els.targetValue.textContent = moneyText(game.target);
    els.moneyValue.textContent = moneyText(game.money);
    const progress = clamp(game.target > 0 ? game.levelEarned / game.target : 0, 0, 1);
    els.progressFill.style.width = (progress * 100).toFixed(1) + "%";
    els.progressLabel.textContent = "本关 " + moneyText(game.levelEarned) + " / " + moneyText(game.target);

    const seconds = Math.ceil(game.timeLeft);
    if (game.lastTimeShown !== seconds) {
      game.lastTimeShown = seconds;
      els.timeValue.textContent = C.formatTime(game.timeLeft);
    }
    els.timerBox.classList.toggle("warning", game.mode === "playing" && game.timeLeft <= 10 && game.timeLeft > 0);

    els.tntCount.textContent = String(game.inventory.tnt);
    els.strengthCount.textContent = String(game.inventory.strength);
    els.cloverCount.textContent = String(game.inventory.clover);
    els.tntBtn.classList.toggle("empty", game.inventory.tnt <= 0);

    buffChip.classList.toggle("hidden", game.strength <= 0);
    if (game.strength > 0) {
      buffText.textContent = "力量 " + game.strength.toFixed(1) + "s";
    }
    els.bestScoreStart.textContent = moneyText(save.bestScore);
    els.bestLevelStart.textContent = String(Math.max(1, save.bestLevel));
  }

  function resize(initial) {
    const rect = els.stage.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width);
    const cssHeight = Math.max(1, rect.height);
    const oldH = H;
    H = Math.round(clamp((W * cssHeight) / cssWidth, 700, 1320));
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    els.canvas.width = Math.round(W * dpr);
    els.canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    game.hook.maxLength = Math.hypot(W * 0.72, H - PIVOT_Y) + 140;
    if (!initial && oldH !== H && game.items.length) {
      const ratio = H / oldH;
      game.items.forEach(function (item) {
        item.y = clamp(item.y * ratio, ITEM_START_Y + item.r, H - 66 - item.r);
        item.x = clamp(item.x, 40 + item.r, W - 40 - item.r);
      });
    }

    buildBackground();
    updateHud();
  }

  function roundedRect(c, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + width, y, x + width, y + height, r);
    c.arcTo(x + width, y + height, x, y + height, r);
    c.arcTo(x, y + height, x, y, r);
    c.arcTo(x, y, x + width, y, r);
    c.closePath();
  }

  function drawWoodBeam(c, x, y, width, height) {
    const grad = c.createLinearGradient(x, y, x, y + height);
    grad.addColorStop(0, "#8b5b2d");
    grad.addColorStop(0.45, "#6d4421");
    grad.addColorStop(1, "#4a2c15");
    c.fillStyle = grad;
    roundedRect(c, x, y, width, height, Math.min(6, height / 3));
    c.fill();
    c.strokeStyle = "rgba(34, 19, 9, 0.85)";
    c.lineWidth = 2;
    c.stroke();

    c.save();
    c.strokeStyle = "rgba(38, 21, 10, 0.35)";
    c.lineWidth = 1;
    for (let lineY = y + 7; lineY < y + height; lineY += 8) {
      c.beginPath();
      c.moveTo(x + 2, lineY);
      c.lineTo(x + width - 2, lineY + 1);
      c.stroke();
    }
    c.fillStyle = "rgba(255, 214, 142, 0.16)";
    c.fillRect(x + 3, y + 2, width - 6, 1);
    c.fillStyle = "rgba(30, 17, 8, 0.55)";
    [x + 7, x + width - 7].forEach(function (boltX) {
      c.beginPath();
      c.arc(boltX, y + height / 2, 2, 0, Math.PI * 2);
      c.fill();
    });
    c.restore();
  }

  function drawLantern(c, x, y) {
    c.save();
    c.translate(x, y);
    c.strokeStyle = "#2a190e";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -44);
    c.lineTo(0, -16);
    c.stroke();

    const glow = c.createRadialGradient(0, 0, 3, 0, 0, 58);
    glow.addColorStop(0, "rgba(255, 201, 92, 0.34)");
    glow.addColorStop(0.45, "rgba(255, 173, 62, 0.12)");
    glow.addColorStop(1, "rgba(255, 150, 30, 0)");
    c.fillStyle = glow;
    c.beginPath();
    c.arc(0, 0, 58, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = "#3c2412";
    roundedRect(c, -7, -22, 14, 5, 2);
    c.fill();
    c.fillStyle = "rgba(255, 190, 73, 0.9)";
    roundedRect(c, -9, -17, 18, 25, 5);
    c.fill();
    c.strokeStyle = "#3c2412";
    c.lineWidth = 1.5;
    c.stroke();
    c.fillStyle = "rgba(255, 245, 190, 0.85)";
    roundedRect(c, -5, -13, 10, 16, 4);
    c.fill();
    c.fillStyle = "#3c2412";
    roundedRect(c, -9, 8, 18, 4, 2);
    c.fill();
    c.restore();
  }

  function buildBackground() {
    bgCanvas.width = W;
    bgCanvas.height = H;
    const b = bgCtx;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, W, H);
    const rng = C.mulberry32(90210);

    const sky = b.createLinearGradient(0, 0, 0, 244);
    sky.addColorStop(0, "#0d1634");
    sky.addColorStop(0.42, "#33244f");
    sky.addColorStop(0.7, "#7b3f4a");
    sky.addColorStop(0.9, "#c16a45");
    sky.addColorStop(1, "#e3a05b");
    b.fillStyle = sky;
    b.fillRect(0, 0, W, 246);

    for (let i = 0; i < 72; i += 1) {
      const starX = rng() * W;
      const starY = rng() * 174;
      const radius = 0.45 + rng() * 1.35;
      b.globalAlpha = 0.18 + rng() * 0.62;
      b.fillStyle = "#fff6d9";
      b.beginPath();
      b.arc(starX, starY, radius, 0, Math.PI * 2);
      b.fill();
    }
    b.globalAlpha = 1;

    const moonGlow = b.createRadialGradient(W - 76, 66, 6, W - 76, 66, 60);
    moonGlow.addColorStop(0, "rgba(255, 238, 184, 0.42)");
    moonGlow.addColorStop(0.5, "rgba(255, 220, 140, 0.12)");
    moonGlow.addColorStop(1, "rgba(255, 210, 120, 0)");
    b.fillStyle = moonGlow;
    b.beginPath();
    b.arc(W - 76, 66, 60, 0, Math.PI * 2);
    b.fill();
    b.fillStyle = "#ffe8b3";
    b.beginPath();
    b.arc(W - 76, 66, 24, 0, Math.PI * 2);
    b.fill();
    b.fillStyle = "rgba(190, 154, 96, 0.18)";
    [[-7, -5, 5], [6, 7, 3.5], [9, -8, 2.6]].forEach(function (crater) {
      b.beginPath();
      b.arc(W - 76 + crater[0], 66 + crater[1], crater[2], 0, Math.PI * 2);
      b.fill();
    });

    b.beginPath();
    b.moveTo(0, 238);
    b.quadraticCurveTo(86, 194, 183, 230);
    b.quadraticCurveTo(286, 262, 405, 216);
    b.quadraticCurveTo(482, 190, W, 228);
    b.lineTo(W, 252);
    b.lineTo(0, 252);
    b.closePath();
    b.fillStyle = "#251519";
    b.fill();

    const dirt = b.createLinearGradient(0, 238, 0, H);
    dirt.addColorStop(0, "#70462a");
    dirt.addColorStop(0.28, "#53311d");
    dirt.addColorStop(0.64, "#352013");
    dirt.addColorStop(1, "#1d1009");
    b.fillStyle = dirt;
    b.fillRect(0, 238, W, H - 238);

    b.fillStyle = "#2a1710";
    b.fillRect(0, 236, W, 9);
    b.fillStyle = "rgba(255, 186, 102, 0.2)";
    b.fillRect(0, 236, W, 2);

    for (let layer = 0; layer < 8; layer += 1) {
      const baseY = 292 + layer * 104 + rng() * 24;
      b.beginPath();
      b.moveTo(-20, baseY);
      b.bezierCurveTo(W * 0.25, baseY - 18 - rng() * 16, W * 0.62, baseY + 16 + rng() * 18, W + 20, baseY - 6);
      b.strokeStyle = layer % 2 ? "rgba(0, 0, 0, 0.17)" : "rgba(255, 184, 108, 0.055)";
      b.lineWidth = 1.5 + rng() * 2.5;
      b.stroke();
    }

    for (let i = 0; i < 330; i += 1) {
      const dotX = rng() * W;
      const dotY = 252 + rng() * (H - 260);
      const radius = 0.55 + rng() * 2.2;
      b.fillStyle = rng() > 0.45 ? "rgba(0, 0, 0, 0.2)" : "rgba(238, 173, 100, 0.09)";
      b.beginPath();
      b.arc(dotX, dotY, radius, 0, Math.PI * 2);
      b.fill();
    }

    for (let i = 0; i < 30; i += 1) {
      const pebbleX = 30 + rng() * (W - 60);
      const pebbleY = 290 + rng() * (H - 330);
      const pebbleR = 2.5 + rng() * 5;
      b.fillStyle = "rgba(120, 91, 66, 0.28)";
      b.beginPath();
      b.ellipse(pebbleX, pebbleY, pebbleR, pebbleR * 0.62, rng() * Math.PI, 0, Math.PI * 2);
      b.fill();
      b.fillStyle = "rgba(255, 213, 153, 0.07)";
      b.beginPath();
      b.ellipse(pebbleX - pebbleR * 0.2, pebbleY - pebbleR * 0.2, pebbleR * 0.55, pebbleR * 0.3, 0, 0, Math.PI * 2);
      b.fill();
    }

    b.save();
    b.globalAlpha = 0.5;
    drawWoodBeam(b, 8, 238, 18, Math.min(150, H - 238));
    drawWoodBeam(b, W - 26, 238, 18, Math.min(150, H - 238));
    b.restore();

    drawWoodBeam(b, W / 2 - 124, 194, 248, 30);
    drawWoodBeam(b, W / 2 - 112, 222, 14, 52);
    drawWoodBeam(b, W / 2 + 98, 222, 14, 52);
    drawLantern(b, 58, 262);

    const topShade = b.createLinearGradient(0, 240, 0, 320);
    topShade.addColorStop(0, "rgba(0, 0, 0, 0.24)");
    topShade.addColorStop(1, "rgba(0, 0, 0, 0)");
    b.fillStyle = topShade;
    b.fillRect(0, 240, W, 80);
  }

  function drawWinch(t) {
    ctx.save();
    ctx.translate(0, 4);
    const spin = game.hook.state === "swing" ? t * 0.7 : game.hook.length * 0.022;
    ctx.rotate(spin);
    const wheel = ctx.createRadialGradient(-5, -5, 2, 0, 0, 19);
    wheel.addColorStop(0, "#b77a3a");
    wheel.addColorStop(0.7, "#7c4d23");
    wheel.addColorStop(1, "#4a2b14");
    ctx.fillStyle = wheel;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2e1a0c";
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 215, 150, 0.3)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i += 1) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 15);
      ctx.stroke();
    }
    ctx.fillStyle = "#d7a25a";
    ctx.beginPath();
    ctx.arc(0, 0, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMiner(t) {
    const bob = Math.sin(t * 2.05) * 1.2;
    ctx.save();
    ctx.translate(W / 2, 204 + bob);

    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.ellipse(0, 7, 30, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#2b455f";
    roundedRect(ctx, -17, -18, 13, 22, 5);
    ctx.fill();
    roundedRect(ctx, 4, -18, 13, 22, 5);
    ctx.fill();
    ctx.fillStyle = "#24160e";
    roundedRect(ctx, -19, -2, 16, 10, 4);
    ctx.fill();
    roundedRect(ctx, 3, -2, 16, 10, 4);
    ctx.fill();

    const body = ctx.createLinearGradient(0, -38, 0, 0);
    body.addColorStop(0, "#cf6048");
    body.addColorStop(1, "#91372a");
    ctx.fillStyle = body;
    roundedRect(ctx, -19, -38, 38, 36, 11);
    ctx.fill();
    ctx.strokeStyle = "rgba(52, 20, 14, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#2d4b68";
    roundedRect(ctx, -12, -22, 24, 21, 5);
    ctx.fill();
    ctx.strokeStyle = "#1c3146";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, -22);
    ctx.lineTo(-14, -34);
    ctx.moveTo(10, -22);
    ctx.lineTo(14, -34);
    ctx.stroke();
    ctx.fillStyle = "#f0b24a";
    ctx.beginPath();
    ctx.arc(-9, -23, 2, 0, Math.PI * 2);
    ctx.arc(9, -23, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#c9563f";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-15, -30);
    ctx.lineTo(-13, 1);
    ctx.moveTo(15, -30);
    ctx.lineTo(13, 1);
    ctx.stroke();
    ctx.fillStyle = "#f0bd8d";
    ctx.beginPath();
    ctx.arc(-13, 2, 4.5, 0, Math.PI * 2);
    ctx.arc(13, 2, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f0bd8d";
    ctx.beginPath();
    ctx.arc(0, -50, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e5a978";
    ctx.beginPath();
    ctx.arc(-13, -50, 3, 0, Math.PI * 2);
    ctx.arc(13, -50, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#6d4327";
    ctx.beginPath();
    ctx.moveTo(-13, -45);
    ctx.quadraticCurveTo(0, -25, 13, -45);
    ctx.quadraticCurveTo(7, -36, 0, -36);
    ctx.quadraticCurveTo(-7, -36, -13, -45);
    ctx.fill();

    ctx.fillStyle = "#2b1b10";
    ctx.beginPath();
    ctx.arc(-4.5, -52, 1.5, 0, Math.PI * 2);
    ctx.arc(4.5, -52, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d99a6b";
    ctx.beginPath();
    ctx.ellipse(0, -47.5, 3.5, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5e3820";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -43.5);
    ctx.quadraticCurveTo(-3, -41, 0, -43.5);
    ctx.quadraticCurveTo(3, -41, 6, -43.5);
    ctx.stroke();

    const helmet = ctx.createLinearGradient(0, -66, 0, -50);
    helmet.addColorStop(0, "#ffe083");
    helmet.addColorStop(0.55, "#f7bd3e");
    helmet.addColorStop(1, "#c9871d");
    ctx.fillStyle = helmet;
    ctx.beginPath();
    ctx.moveTo(-14.5, -57);
    ctx.quadraticCurveTo(-14, -72, 0, -72);
    ctx.quadraticCurveTo(14, -72, 14.5, -57);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#8d5a0d";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = "#e0a02a";
    roundedRect(ctx, -17, -58, 34, 5, 2.5);
    ctx.fill();
    ctx.strokeStyle = "#8d5a0d";
    ctx.stroke();

    const lampGlow = ctx.createRadialGradient(0, -66, 1, 0, -66, 26);
    lampGlow.addColorStop(0, "rgba(255, 246, 188, 0.55)");
    lampGlow.addColorStop(0.4, "rgba(255, 218, 105, 0.16)");
    lampGlow.addColorStop(1, "rgba(255, 190, 50, 0)");
    ctx.fillStyle = lampGlow;
    ctx.beginPath();
    ctx.arc(0, -66, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff6c4";
    ctx.beginPath();
    ctx.arc(0, -65, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8d5a0d";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    drawWinch(t);
    ctx.restore();
  }

  function drawGoldArt(c, r) {
    const points = [
      [-0.72, -0.3], [-0.42, -0.72], [-0.05, -0.82], [0.45, -0.6], [0.78, -0.15],
      [0.62, 0.36], [0.3, 0.72], [-0.25, 0.78], [-0.68, 0.4], [-0.82, -0.02]
    ];
    const grad = c.createRadialGradient(-r * 0.32, -r * 0.4, r * 0.08, 0, 0, r * 1.15);
    grad.addColorStop(0, "#fff5bd");
    grad.addColorStop(0.35, "#ffd75e");
    grad.addColorStop(0.72, "#e8a21e");
    grad.addColorStop(1, "#a9660a");
    c.beginPath();
    points.forEach(function (point, index) {
      const x = point[0] * r;
      const y = point[1] * r;
      if (index === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.closePath();
    c.fillStyle = grad;
    c.fill();
    c.strokeStyle = "#7e4b08";
    c.lineWidth = Math.max(1.4, r * 0.09);
    c.stroke();

    c.beginPath();
    c.moveTo(-r * 0.42, -r * 0.34);
    c.lineTo(-r * 0.04, -r * 0.56);
    c.lineTo(r * 0.44, -r * 0.3);
    c.lineTo(r * 0.22, r * 0.12);
    c.lineTo(-r * 0.26, r * 0.2);
    c.closePath();
    c.fillStyle = "rgba(255, 247, 190, 0.42)";
    c.fill();

    c.fillStyle = "rgba(255, 255, 255, 0.72)";
    c.beginPath();
    c.ellipse(-r * 0.3, -r * 0.42, r * 0.25, r * 0.1, -0.55, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(122, 68, 6, 0.28)";
    c.beginPath();
    c.ellipse(r * 0.3, r * 0.38, r * 0.24, r * 0.11, 0.4, 0, Math.PI * 2);
    c.fill();
  }

  function drawRockArt(c, r) {
    const points = [
      [-0.72, -0.32], [-0.46, -0.74], [0.06, -0.82], [0.55, -0.55], [0.8, -0.08],
      [0.58, 0.48], [0.16, 0.78], [-0.42, 0.66], [-0.78, 0.24]
    ];
    const grad = c.createLinearGradient(-r * 0.5, -r * 0.7, r * 0.6, r * 0.7);
    grad.addColorStop(0, "#9aa1a3");
    grad.addColorStop(0.45, "#6b7478");
    grad.addColorStop(1, "#414a4f");
    c.beginPath();
    points.forEach(function (point, index) {
      const x = point[0] * r;
      const y = point[1] * r;
      if (index === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.closePath();
    c.fillStyle = grad;
    c.fill();
    c.strokeStyle = "#2c3337";
    c.lineWidth = Math.max(1.4, r * 0.08);
    c.stroke();

    c.strokeStyle = "rgba(30, 36, 39, 0.45)";
    c.lineWidth = Math.max(1, r * 0.05);
    c.beginPath();
    c.moveTo(-r * 0.44, -r * 0.44);
    c.lineTo(-r * 0.12, -r * 0.07);
    c.lineTo(r * 0.1, -r * 0.28);
    c.moveTo(-r * 0.12, -r * 0.07);
    c.lineTo(-r * 0.22, r * 0.42);
    c.moveTo(-r * 0.12, -r * 0.07);
    c.lineTo(r * 0.5, r * 0.18);
    c.stroke();
    c.fillStyle = "rgba(255, 255, 255, 0.18)";
    c.beginPath();
    c.ellipse(-r * 0.28, -r * 0.48, r * 0.24, r * 0.1, -0.3, 0, Math.PI * 2);
    c.fill();
  }

  function drawDiamondArt(c, r) {
    const grad = c.createLinearGradient(-r * 0.7, -r * 0.8, r * 0.65, r * 0.8);
    grad.addColorStop(0, "#e5ffff");
    grad.addColorStop(0.3, "#90f8f2");
    grad.addColorStop(0.65, "#3dc8d3");
    grad.addColorStop(1, "#1a7f9f");
    c.beginPath();
    c.moveTo(0, -r * 0.86);
    c.lineTo(r * 0.72, -r * 0.24);
    c.lineTo(r * 0.44, r * 0.5);
    c.lineTo(0, r * 0.92);
    c.lineTo(-r * 0.44, r * 0.5);
    c.lineTo(-r * 0.72, -r * 0.24);
    c.closePath();
    c.fillStyle = grad;
    c.fill();
    c.strokeStyle = "#126478";
    c.lineWidth = Math.max(1.3, r * 0.08);
    c.stroke();

    c.beginPath();
    c.moveTo(-r * 0.72, -r * 0.24);
    c.lineTo(-r * 0.26, -r * 0.24);
    c.lineTo(0, r * 0.92);
    c.lineTo(0, -r * 0.86);
    c.closePath();
    c.fillStyle = "rgba(255, 255, 255, 0.2)";
    c.fill();
    c.beginPath();
    c.moveTo(-r * 0.26, -r * 0.24);
    c.lineTo(r * 0.26, -r * 0.24);
    c.lineTo(r * 0.44, r * 0.5);
    c.lineTo(-r * 0.44, r * 0.5);
    c.closePath();
    c.fillStyle = "rgba(20, 110, 140, 0.18)";
    c.fill();
    c.strokeStyle = "rgba(235, 255, 255, 0.78)";
    c.lineWidth = Math.max(1, r * 0.05);
    c.beginPath();
    c.moveTo(-r * 0.26, -r * 0.24);
    c.lineTo(0, -r * 0.86);
    c.lineTo(r * 0.26, -r * 0.24);
    c.moveTo(-r * 0.26, -r * 0.24);
    c.lineTo(0, r * 0.92);
    c.lineTo(r * 0.26, -r * 0.24);
    c.stroke();
    c.fillStyle = "rgba(255, 255, 255, 0.85)";
    c.beginPath();
    c.ellipse(-r * 0.24, -r * 0.42, r * 0.12, r * 0.05, -0.7, 0, Math.PI * 2);
    c.fill();
  }

  function drawTntArt(c, r) {
    const body = c.createLinearGradient(-r * 0.7, 0, r * 0.7, 0);
    body.addColorStop(0, "#9e2e24");
    body.addColorStop(0.45, "#e75b45");
    body.addColorStop(1, "#a72f24");
    [-0.52, 0, 0.52].forEach(function (offset) {
      c.fillStyle = body;
      roundedRect(c, offset * r - r * 0.21, -r * 0.6, r * 0.42, r * 1.2, r * 0.12);
      c.fill();
      c.strokeStyle = "#6f1d16";
      c.lineWidth = Math.max(1, r * 0.045);
      c.stroke();
    });
    c.fillStyle = "#2d1710";
    c.fillRect(-r * 0.68, -r * 0.52, r * 1.36, r * 0.12);
    c.fillRect(-r * 0.68, r * 0.34, r * 1.36, r * 0.12);
    c.fillStyle = "#fff3d0";
    c.font = "800 " + Math.max(5, r * 0.36) + "px sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("TNT", 0, r * 0.02);

    c.strokeStyle = "#8b6a37";
    c.lineWidth = Math.max(1.4, r * 0.08);
    c.beginPath();
    c.moveTo(r * 0.12, -r * 0.6);
    c.bezierCurveTo(r * 0.4, -r * 0.92, r * 0.06, -r * 1.04, r * 0.38, -r * 1.18);
    c.stroke();
    const spark = c.createRadialGradient(r * 0.38, -r * 1.18, 0, r * 0.38, -r * 1.18, r * 0.3);
    spark.addColorStop(0, "rgba(255, 255, 210, 1)");
    spark.addColorStop(0.4, "rgba(255, 196, 70, 0.9)");
    spark.addColorStop(1, "rgba(255, 140, 30, 0)");
    c.fillStyle = spark;
    c.beginPath();
    c.arc(r * 0.38, -r * 1.18, r * 0.32, 0, Math.PI * 2);
    c.fill();
  }

  function drawCloverArt(c, r) {
    const grad = c.createRadialGradient(-r * 0.2, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
    grad.addColorStop(0, "#d7ffc6");
    grad.addColorStop(0.42, "#79d67f");
    grad.addColorStop(1, "#2d8a4c");
    c.fillStyle = grad;
    c.strokeStyle = "#1f6637";
    c.lineWidth = Math.max(1, r * 0.06);
    for (let i = 0; i < 4; i += 1) {
      c.save();
      c.rotate((Math.PI / 2) * i);
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(-r * 0.55, -r * 0.5, -r * 0.52, -r * 1.08, 0, -r * 0.78);
      c.bezierCurveTo(r * 0.52, -r * 1.08, r * 0.55, -r * 0.5, 0, 0);
      c.closePath();
      c.fill();
      c.stroke();
      c.restore();
    }
    c.strokeStyle = "#2d8a4c";
    c.lineWidth = Math.max(1.5, r * 0.11);
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(0, r * 0.1);
    c.quadraticCurveTo(r * 0.18, r * 0.55, r * 0.05, r * 0.94);
    c.stroke();
    c.fillStyle = "rgba(255, 255, 255, 0.55)";
    c.beginPath();
    c.arc(-r * 0.16, -r * 0.52, r * 0.1, 0, Math.PI * 2);
    c.fill();
  }

  function drawStrengthArt(c, r) {
    c.fillStyle = "rgba(255, 255, 255, 0.16)";
    roundedRect(c, -r * 0.36, -r * 0.88, r * 0.72, r * 0.3, r * 0.08);
    c.fill();
    c.fillStyle = "#e8c35a";
    roundedRect(c, -r * 0.42, -r * 0.98, r * 0.84, r * 0.18, r * 0.07);
    c.fill();

    const glass = c.createLinearGradient(-r * 0.6, 0, r * 0.6, 0);
    glass.addColorStop(0, "rgba(255, 235, 245, 0.45)");
    glass.addColorStop(0.5, "rgba(255, 185, 214, 0.4)");
    glass.addColorStop(1, "rgba(230, 120, 165, 0.5)");
    c.fillStyle = glass;
    roundedRect(c, -r * 0.58, -r * 0.7, r * 1.16, r * 1.56, r * 0.3);
    c.fill();
    c.strokeStyle = "#a95377";
    c.lineWidth = Math.max(1.2, r * 0.07);
    c.stroke();

    const liquid = c.createLinearGradient(0, -r * 0.1, 0, r * 0.8);
    liquid.addColorStop(0, "#ff9fc4");
    liquid.addColorStop(1, "#e3457f");
    c.fillStyle = liquid;
    c.beginPath();
    c.moveTo(-r * 0.5, -r * 0.08);
    c.lineTo(r * 0.5, -r * 0.08);
    c.lineTo(r * 0.5, r * 0.55);
    c.quadraticCurveTo(r * 0.5, r * 0.84, r * 0.2, r * 0.84);
    c.lineTo(-r * 0.2, r * 0.84);
    c.quadraticCurveTo(-r * 0.5, r * 0.84, -r * 0.5, r * 0.55);
    c.closePath();
    c.fill();

    c.fillStyle = "#fff9d5";
    c.beginPath();
    c.moveTo(r * 0.06, -r * 0.52);
    c.lineTo(-r * 0.24, r * 0.02);
    c.lineTo(r * 0.02, r * 0.02);
    c.lineTo(-r * 0.1, r * 0.55);
    c.lineTo(r * 0.32, -r * 0.12);
    c.lineTo(r * 0.04, -r * 0.12);
    c.closePath();
    c.fill();

    c.fillStyle = "rgba(255, 255, 255, 0.62)";
    roundedRect(c, -r * 0.42, -r * 0.56, r * 0.12, r * 0.48, r * 0.06);
    c.fill();
  }

  const spriteCache = new Map();

  function getItemSprite(type) {
    if (spriteCache.has(type)) return spriteCache.get(type);
    const def = C.ITEM_DEFS[type];
    const pad = 14;
    const size = def.radius * 2 + pad * 2;
    const scale = 2;
    const sprite = document.createElement("canvas");
    sprite.width = Math.ceil(size * scale);
    sprite.height = Math.ceil(size * scale);
    const c = sprite.getContext("2d");
    c.scale(scale, scale);
    c.translate(pad + def.radius, pad + def.radius);
    if (def.kind === "gold") drawGoldArt(c, def.radius);
    else if (def.kind === "rock") drawRockArt(c, def.radius);
    else if (def.kind === "diamond") drawDiamondArt(c, def.radius);
    else if (def.kind === "tnt") drawTntArt(c, def.radius);
    else if (def.kind === "clover") drawCloverArt(c, def.radius);
    else drawStrengthArt(c, def.radius);
    const result = { canvas: sprite, size: size };
    spriteCache.set(type, result);
    return result;
  }

  function drawSparkle(x, y, size, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#fffbe0";
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.26, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size * 0.26, y);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x, y - size * 0.26);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size * 0.26);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawItemAt(item, x, y, t, idle) {
    const def = item.def;
    const sprite = getItemSprite(item.type);
    const bob = idle ? Math.sin(t * 1.55 + item.phase) * 1.8 : 0;
    const drawY = y + bob;

    ctx.save();
    ctx.globalAlpha = idle ? 0.32 : 0.18;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(x + 2, y + def.radius * 0.74, def.radius * 0.88, def.radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.drawImage(sprite.canvas, x - sprite.size / 2, drawY - sprite.size / 2, sprite.size, sprite.size);

    if (def.kind === "gold" || def.kind === "diamond") {
      const alpha = 0.28 + 0.62 * (0.5 + 0.5 * Math.sin(t * 2.6 + item.phase * 1.7));
      const starSize = def.kind === "diamond" ? 4.2 : 2.6;
      drawSparkle(x + def.radius * 0.42, drawY - def.radius * 0.58, starSize, alpha);
      if (def.kind === "diamond") {
        drawSparkle(x - def.radius * 0.48, drawY + def.radius * 0.3, 2.4, alpha * 0.75);
      }
    }
  }

  function drawItems(t) {
    game.items.forEach(function (item) {
      if (item.state === "idle") drawItemAt(item, item.x, item.y, t, true);
    });
  }

  function hookTip() {
    const hook = game.hook;
    return {
      x: W / 2 + Math.sin(hook.angle) * hook.length,
      y: PIVOT_Y + Math.cos(hook.angle) * hook.length
    };
  }

  function drawHookClaw(x, y, ropeAngle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-ropeAngle);
    ctx.strokeStyle = "#2d1a0d";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(0, 9);
    ctx.stroke();
    ctx.strokeStyle = "#b8864b";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(0, 8);
    ctx.stroke();

    ctx.strokeStyle = "#3a2413";
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.quadraticCurveTo(-11, 13, -8, 20);
    ctx.moveTo(0, 7);
    ctx.quadraticCurveTo(11, 13, 8, 20);
    ctx.stroke();
    ctx.strokeStyle = "#d2a15f";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.quadraticCurveTo(-10, 12, -7.5, 18.5);
    ctx.moveTo(0, 7);
    ctx.quadraticCurveTo(10, 12, 7.5, 18.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawRopeAndHook(t) {
    const hook = game.hook;
    const tip = hookTip();
    const visualTip = hook.item
      ? { x: tip.x, y: tip.y - hook.item.r * 0.82 }
      : tip;

    if (hook.item && hook.item.state === "caught") {
      drawItemAt(hook.item, tip.x, tip.y + hook.item.r * 0.08, t, false);
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(24, 13, 6, 0.7)";
    ctx.lineWidth = 4.6;
    ctx.beginPath();
    ctx.moveTo(W / 2, PIVOT_Y);
    ctx.lineTo(visualTip.x, visualTip.y);
    ctx.stroke();
    ctx.strokeStyle = "#c09257";
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(W / 2, PIVOT_Y);
    ctx.lineTo(visualTip.x, visualTip.y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 228, 180, 0.36)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 0.8, PIVOT_Y);
    ctx.lineTo(visualTip.x - 0.8, visualTip.y);
    ctx.stroke();
    ctx.restore();

    const ropeAngle = Math.atan2(visualTip.x - W / 2, visualTip.y - PIVOT_Y);
    drawHookClaw(visualTip.x, visualTip.y, ropeAngle);
  }

  function spawnBurst(x, y, colors, count, speed, size) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = randomBetween(speed * 0.3, speed);
      const life = randomBetween(0.32, 0.78);
      game.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - randomBetween(20, 90),
        life: life,
        maxLife: life,
        size: randomBetween(size * 0.45, size),
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: randomBetween(220, 520)
      });
    }
    if (game.particles.length > 260) {
      game.particles.splice(0, game.particles.length - 260);
    }
  }

  function addFloater(x, y, text, color) {
    game.floaters.push({
      x: x,
      y: y,
      text: text,
      color: color || "#ffe07a",
      life: 1.15,
      maxLife: 1.15
    });
  }

  function updateEffects(dt) {
    game.particles.forEach(function (particle) {
      particle.life -= dt;
      particle.vy += particle.gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    });
    game.particles = game.particles.filter(function (particle) {
      return particle.life > 0;
    });

    game.floaters.forEach(function (floater) {
      floater.life -= dt;
      floater.y -= 48 * dt;
    });
    game.floaters = game.floaters.filter(function (floater) {
      return floater.life > 0;
    });

    if (game.shake.time > 0) game.shake.time = Math.max(0, game.shake.time - dt);
  }

  function drawParticles() {
    game.particles.forEach(function (particle) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (0.5 + alpha * 0.5), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    game.floaters.forEach(function (floater) {
      const alpha = clamp((floater.life / floater.maxLife) * 1.8, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "900 19px \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(28, 15, 6, 0.85)";
      ctx.strokeText(floater.text, floater.x, floater.y);
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.text, floater.x, floater.y);
      ctx.restore();
    });
  }

  function shakeScreen(power, duration) {
    game.shake.power = Math.max(game.shake.power, power);
    game.shake.time = Math.max(game.shake.time, duration);
  }

  function generateLevel(level) {
    const plan = C.makeItemPlan(level, Math.random);
    const bounds = {
      minX: 42,
      maxX: W - 42,
      minY: ITEM_START_Y,
      maxY: Math.max(ITEM_START_Y + 220, H - 66)
    };
    const placed = C.placeItems(plan, bounds, Math.random);
    return placed.map(function (entry, index) {
      return {
        id: index,
        type: entry.type,
        def: C.ITEM_DEFS[entry.type],
        x: entry.x,
        y: entry.y,
        r: entry.r,
        state: "idle",
        phase: Math.random() * Math.PI * 2
      };
    });
  }

  function resetHook() {
    game.hook.angle = 0;
    game.hook.dir = Math.random() > 0.5 ? 1 : -1;
    game.hook.length = HOOK_MIN;
    game.hook.state = "swing";
    game.hook.item = null;
    game.hook.speed = Math.min(
      CONFIG.hookSwingSpeedMax,
      CONFIG.hookSwingSpeed + Math.max(0, game.level - 1) * CONFIG.hookSwingSpeedPerLevel
    );
  }

  function startGame() {
    Sound.ensure();
    Music.start(save.musicTrack);
    Sound.click();
    game.money = 0;
    game.inventory = { tnt: 0, strength: 0, clover: 0 };
    startLevel(1);
  }

  function startLevel(level) {
    game.level = level;
    game.target = C.levelTarget(level);
    game.timeLeft = C.LEVEL_SECONDS;
    game.lastTimeShown = null;
    game.levelEarned = 0;
    game.timeUp = false;
    game.cleared = false;
    game.strength = 0;
    game.items = generateLevel(level);
    game.particles = [];
    game.floaters = [];
    game.shake.time = 0;
    game.hook.maxLength = Math.hypot(W * 0.72, H - PIVOT_Y) + 140;
    resetHook();
    game.mode = "playing";
    hideScreens();
    updateHud();
    applyStartingSupplies();
  }

  function applyStartingSupplies() {
    if (game.inventory.strength > 0) {
      game.inventory.strength -= 1;
      activateStrength();
      addFloater(W / 2, ITEM_START_Y + 36, "力量 +8s", "#ffb3d0");
      showToast("力量饮料已生效：8 秒快速回收");
    }
    if (game.inventory.clover > 0) {
      game.inventory.clover -= 1;
      const reward = C.randomReward();
      game.money += reward;
      game.levelEarned += reward;
      addFloater(W / 2, ITEM_START_Y + 72, "幸运 +" + moneyText(reward), "#9cf0a8");
      showToast("幸运草带来 " + moneyText(reward));
      Sound.coin();
    }
    updateHud();
  }

  function activateStrength() {
    game.strength = C.BUFF_SECONDS;
    updateHud();
  }

  function fireHook() {
    if (game.mode !== "playing" || game.timeUp || game.hook.state !== "swing") return;
    game.hook.state = "shoot";
    Sound.shoot();
    vibrate(8);
  }

  function updateHook(dt) {
    const hook = game.hook;

    if (hook.state === "swing") {
      hook.angle += hook.dir * hook.speed * dt;
      if (hook.angle > MAX_ANGLE) {
        hook.angle = MAX_ANGLE;
        hook.dir = -1;
      } else if (hook.angle < -MAX_ANGLE) {
        hook.angle = -MAX_ANGLE;
        hook.dir = 1;
      }
      return;
    }

    if (hook.state === "shoot") {
      hook.length += SHOOT_SPEED * dt;
      const tip = hookTip();
      let hit = null;
      let bestDistance = Infinity;
      game.items.forEach(function (item) {
        if (item.state !== "idle") return;
        const distance = Math.hypot(tip.x - item.x, tip.y - item.y);
        if (distance < item.r + 16 && distance < bestDistance) {
          hit = item;
          bestDistance = distance;
        }
      });

      if (hit) {
        hit.state = "caught";
        hook.item = hit;
        hook.state = "retract";
        Sound.grab();
        vibrate(14);
        spawnBurst(hit.x, hit.y, ["#ffe7a0", "#ffc94a", "rgba(255,255,240,.9)"], 7, 130, 2.2);
      } else if (tip.x < 8 || tip.x > W - 8 || tip.y > H - 8 || hook.length > hook.maxLength) {
        hook.state = "retract";
      }
      return;
    }

    if (hook.state === "retract") {
      const speed = hook.item ? C.retrieveSpeed(hook.item.def.weight, game.strength > 0) : EMPTY_RETURN_SPEED;
      hook.length -= speed * dt;
      if (hook.item) {
        const tip = hookTip();
        hook.item.x = tip.x;
        hook.item.y = tip.y;
      }
      if (hook.length <= HOOK_MIN) {
        hook.length = HOOK_MIN;
        if (hook.item) collectItem(hook.item);
        hook.item = null;
        hook.state = "swing";
        if (game.timeUp) endLevel();
        else maybeFinishClearedLevel();
      }
    }
  }

  function collectItem(item) {
    item.state = "collected";
    game.items = game.items.filter(function (entry) {
      return entry !== item;
    });

    const def = item.def;
    if (def.value > 0) {
      game.money += def.value;
      game.levelEarned += def.value;
      addFloater(item.x, item.y - item.r - 10, "+" + moneyText(def.value), "#ffe07a");
    }
    Sound.coin();
    spawnBurst(item.x, item.y, ["#ffe7a0", "#ffc94a", "#fff6d6"], 12, 170, 3);

    if (def.kind === "tnt") {
      explodeRocks("pickup");
    } else if (def.kind === "clover") {
      const reward = C.randomReward();
      game.money += reward;
      game.levelEarned += reward;
      addFloater(item.x, item.y - item.r - 28, "幸运 +" + moneyText(reward), "#9cf0a8");
      showToast("幸运草！+" + moneyText(reward));
      Sound.coin();
    } else if (def.kind === "strength") {
      activateStrength();
      addFloater(item.x, item.y - item.r - 12, "力量 +8s", "#ffb3d0");
      showToast("力量饮料生效：8 秒快速回收");
    }

    updateHud();
  }

  function explodeRocks(source) {
    const rocks = game.items.filter(function (item) {
      return item.def.kind === "rock" && (item.state === "idle" || item.state === "caught");
    });
    let count = 0;
    rocks.forEach(function (rock) {
      count += 1;
      spawnBurst(rock.x, rock.y, ["#ffb347", "#ff6b3d", "#ffe6a1", "#8b9498"], 16, 260, 4.2);
    });
    game.items = game.items.filter(function (item) {
      return !(item.def.kind === "rock" && (item.state === "idle" || item.state === "caught"));
    });
    if (game.hook.item && game.hook.item.def.kind === "rock") {
      game.hook.item = null;
    }

    Sound.explosion();
    shakeScreen(11, 0.42);
    vibrate([60, 30, 70]);
    if (count > 0) {
      showToast("轰！清除了 " + count + " 块石头");
    } else {
      showToast(source === "pickup" ? "炸药包炸开了，场上没有石头" : "炸药炸了个寂寞：场上没有石头");
    }
    updateHud();
    maybeFinishClearedLevel();
  }

  function useTnt() {
    if (game.mode !== "playing") return;
    if (game.inventory.tnt <= 0) {
      showToast("没有炸药了，通关后去商店补给");
      Sound.error();
      return;
    }
    game.inventory.tnt -= 1;
    explodeRocks("manual");
  }

  function maybeFinishClearedLevel() {
    if (game.mode !== "playing" || game.timeUp || game.cleared) return;
    if (game.items.length > 0 || game.hook.item || game.hook.state !== "swing") return;
    game.cleared = true;
    showToast("矿脉已清空，提前收工", 1100);
    endLevel();
  }

  function endLevel() {
    if (game.mode !== "playing") return;
    game.mode = "result";
    const win = game.levelEarned >= game.target;
    if (win) save.bestLevel = Math.max(save.bestLevel, game.level);
    save.bestScore = Math.max(save.bestScore, game.money);
    persist();
    fillResult(win);
    showScreen("result");
    updateHud();
    if (win) Sound.win();
    else Sound.fail();
    vibrate(win ? [18, 40, 18] : [90]);
  }

  function fillResult(win) {
    els.resultEyebrow.textContent = "第 " + game.level + " 关 · " + (win ? "达标" : "未达标");
    els.resultTitle.textContent = win ? "矿脉拿下！" : "差一点点";
    els.resultSub.textContent = win
      ? (game.cleared ? "矿脉清空，提前收工。" : "目标达成，下一层矿脉更深。")
      : (game.cleared ? "矿脉清空，但还差一点目标。" : "再试一次，先抓钻石和小金块。");
    els.resultIcon.classList.toggle("fail", !win);
    els.resultIconUse.setAttribute("href", win ? "#i-star" : "#i-clock");
    els.resultEarned.textContent = moneyText(game.levelEarned);
    els.resultTotal.textContent = moneyText(game.money);
    els.resultTarget.textContent = moneyText(game.target);
    els.resultBest.textContent = moneyText(save.bestScore);
    els.winActions.classList.toggle("hidden", !win);
    els.failActions.classList.toggle("hidden", win);
  }

  function openShop() {
    if (game.mode !== "result") return;
    game.mode = "shop";
    updateShop();
    showScreen("shop");
    Sound.click();
  }

  function updateShop() {
    els.shopMoney.textContent = moneyText(game.money);
    els.shopTntCount.textContent = String(game.inventory.tnt);
    els.shopStrengthCount.textContent = String(game.inventory.strength);
    els.shopCloverCount.textContent = String(game.inventory.clover);
    document.querySelectorAll("[data-buy]").forEach(function (button) {
      button.disabled = game.money < Number(button.getAttribute("data-price"));
    });
  }

  function buyItem(kind, price) {
    if (game.mode !== "shop") return;
    if (game.money < price) {
      showToast("金币不够，先去挖矿吧");
      Sound.error();
      return;
    }
    game.money -= price;
    game.inventory[kind] = (game.inventory[kind] || 0) + 1;
    const labels = { tnt: "炸药", strength: "力量饮料", clover: "幸运草" };
    showToast("已购买" + (labels[kind] || "道具"));
    Sound.coin();
    updateShop();
    updateHud();
  }

  function pauseGame() {
    if (game.mode !== "playing") return;
    game.mode = "paused";
    showScreen("pause");
    Sound.click();
  }

  function resumeGame() {
    if (game.mode !== "paused") return;
    game.mode = "playing";
    hideScreens();
    game.lastFrame = performance.now();
    updateHud();
    Sound.click();
  }

  function toggleMute() {
    save.muted = !save.muted;
    persist();
    updateSoundButton();
    if (save.muted) {
      Music.stop();
    } else {
      Music.start(save.musicTrack);
      Sound.click();
    }
    showToast(save.muted ? "音效已关闭" : "音效已开启", 1000);
  }

  function update(dt, t) {
    game.elapsed = t;
    if (game.mode === "playing") {
      if (!game.timeUp) {
        game.timeLeft = Math.max(0, game.timeLeft - dt);
        if (game.timeLeft <= 0) {
          game.timeLeft = 0;
          game.timeUp = true;
          showToast("时间到！", 1200);
          if (game.hook.state === "swing") {
            endLevel();
            return;
          }
        }
      }
      updateHook(dt);
      if (game.strength > 0) {
        game.strength = Math.max(0, game.strength - dt);
        if (game.strength === 0) showToast("力量效果结束", 900);
      }
      updateEffects(dt);
      game.hudAccumulator = (game.hudAccumulator || 0) + dt;
      if (game.hudAccumulator >= 0.1) {
        game.hudAccumulator = 0;
        updateHud();
      }
    } else if (game.mode !== "paused") {
      updateEffects(dt);
    }
  }

  function render(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (game.shake.time > 0) {
      const power = game.shake.power * clamp(game.shake.time / 0.42, 0, 1);
      ctx.translate(randomBetween(-power, power), randomBetween(-power, power));
    }
    ctx.drawImage(bgCanvas, 0, 0);
    drawItems(t);
    drawMiner(t);
    drawRopeAndHook(t);
    drawParticles();
    drawFloaters();
    ctx.restore();
  }

  function frame(now) {
    if (!game.lastFrame) game.lastFrame = now;
    const dt = clamp((now - game.lastFrame) / 1000, 0, 0.033);
    game.lastFrame = now;
    update(dt, now / 1000);
    render(now / 1000);
    window.requestAnimationFrame(frame);
  }

  function bindEvents() {
    els.startBtn.addEventListener("click", function () {
      Sound.ensure();
      startGame();
    });
    els.resumeBtn.addEventListener("click", resumeGame);
    els.restartFromPauseBtn.addEventListener("click", function () {
      Sound.click();
      startGame();
    });
    els.pauseBtn.addEventListener("click", function () {
      if (game.mode === "playing") pauseGame();
      else if (game.mode === "paused") resumeGame();
    });
    els.soundBtn.addEventListener("click", toggleMute);
    els.musicBtn.addEventListener("click", cycleMusic);
    els.tntBtn.addEventListener("click", useTnt);
    els.shopBtn.addEventListener("click", openShop);
    els.nextLevelBtn.addEventListener("click", function () {
      Sound.click();
      startLevel(game.level + 1);
    });
    els.retryBtn.addEventListener("click", startGame);
    els.continueFromShopBtn.addEventListener("click", function () {
      Sound.click();
      startLevel(game.level + 1);
    });
    document.querySelectorAll("[data-buy]").forEach(function (button) {
      button.addEventListener("click", function () {
        buyItem(button.getAttribute("data-buy"), Number(button.getAttribute("data-price")));
      });
    });

    els.stage.addEventListener("pointerdown", function (event) {
      Sound.ensure();
      if (event.target.closest("button, .overlay.is-visible")) return;
      if (game.mode === "playing") {
        event.preventDefault();
        fireHook();
      }
    }, { passive: false });

    window.addEventListener("keydown", function (event) {
      if (event.repeat) return;
      const onButton = event.target && event.target.closest && event.target.closest("button");
      if (event.code === "Space") {
        if (onButton) return;
        event.preventDefault();
        if (game.mode === "menu") startGame();
        else if (game.mode === "playing") fireHook();
        else if (game.mode === "paused") resumeGame();
      } else if (event.key === "p" || event.key === "P") {
        if (game.mode === "playing") pauseGame();
        else if (game.mode === "paused") resumeGame();
      } else if (event.key === "m" || event.key === "M") {
        toggleMute();
      }
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        game.musicWasRunning = Music.running;
        if (game.mode === "playing") pauseGame();
        Music.stop();
      } else if (game.musicWasRunning && !save.muted && save.musicTrack >= 0) {
        Music.start(save.musicTrack);
      }
    });

    let resizeTimer = 0;
    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        resize(false);
      }, 80);
    });
    window.addEventListener("orientationchange", function () {
      window.setTimeout(function () {
        resize(false);
      }, 180);
    });
  }

  function init() {
    updateSoundButton();
    updateMusicButton();
    updateHud();
    resize(true);
    bindEvents();
    showScreen("start");
    window.requestAnimationFrame(frame);

    const singleFile = document.querySelector('meta[name="gold-miner-single"]');
    if (!singleFile && "serviceWorker" in navigator && (location.protocol === "http:" || location.protocol === "https:")) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("./sw.js").catch(function () {
          /* PWA 注册失败不影响游戏。 */
        });
      });
    }
  }

  if (new URLSearchParams(window.location.search).has("debug")) {
    window.__GOLD_MINER__ = {
      snapshot: function () {
        return {
          mode: game.mode,
          hookState: game.hook.state,
          hookSpeed: game.hook.speed,
          angle: game.hook.angle,
          level: game.level,
          money: game.money,
          levelEarned: game.levelEarned,
          target: game.target,
          timeLeft: game.timeLeft,
          cleared: game.cleared,
          strength: game.strength,
          musicTrack: save.musicTrack,
          musicRunning: Music.running,
          inventory: Object.assign({}, game.inventory),
          itemCount: game.items.length,
          items: game.items.map(function (item) {
            return { type: item.type, x: item.x, y: item.y, r: item.r, state: item.state };
          })
        };
      },
      start: startGame,
      fire: fireHook,
      setAngle: function (angle) {
        game.hook.angle = clamp(angle, -MAX_ANGLE, MAX_ANGLE);
        game.hook.state = "swing";
      },
      setTime: function (seconds) {
        if (game.mode === "playing") game.timeLeft = Math.max(0, Number(seconds) || 0);
      },
      finishLevel: function (win) {
        if (game.mode !== "playing") return;
        game.levelEarned = win ? game.target : Math.max(0, game.target - 100);
        endLevel();
      },
      clearItems: function () {
        if (game.mode !== "playing") return;
        game.items = [];
        maybeFinishClearedLevel();
      },
      useTnt: useTnt,
      grant: function (kind, amount) {
        const value = Math.max(0, Math.floor(Number(amount) || 0));
        if (kind === "money") game.money += value;
        else if (Object.prototype.hasOwnProperty.call(game.inventory, kind)) game.inventory[kind] += value;
        updateHud();
        updateShop();
      }
    };
  }

  init();
})();
