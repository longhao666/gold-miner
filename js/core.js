(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.GoldMinerCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SAVE_KEY = "goldMinerSave.v1";
  const WORLD_WIDTH = 540;
  const LEVEL_SECONDS = 60;
  const BUFF_SECONDS = 8;
  const DEFAULT_CONFIG = Object.freeze({
    hookSwingSpeed: 0.72,
    hookSwingSpeedPerLevel: 0.018,
    hookSwingSpeedMax: 0.9,
    musicVolume: 0.9
  });
  const MUSIC_TRACK_COUNT = 3;

  const ITEM_DEFS = Object.freeze({
    goldS: { label: "小金块", kind: "gold", value: 55, weight: 0.8, radius: 17 },
    goldM: { label: "金块", kind: "gold", value: 110, weight: 1.5, radius: 24 },
    goldL: { label: "大金块", kind: "gold", value: 210, weight: 2.8, radius: 33 },
    rockS: { label: "小石头", kind: "rock", value: 12, weight: 3.2, radius: 22 },
    rockL: { label: "大石头", kind: "rock", value: 20, weight: 4.8, radius: 32 },
    diamond: { label: "钻石", kind: "diamond", value: 400, weight: 0.45, radius: 16 },
    tnt: { label: "炸药包", kind: "tnt", value: 40, weight: 0.9, radius: 19 },
    clover: { label: "幸运草", kind: "clover", value: 0, weight: 0.4, radius: 17 },
    strength: { label: "力量饮料", kind: "strength", value: 0, weight: 0.4, radius: 17 }
  });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeConfig(raw) {
    const data = raw && typeof raw === "object" ? raw : {};
    const speed = Number(data.hookSwingSpeed);
    const perLevel = Number(data.hookSwingSpeedPerLevel);
    const maxSpeed = Number(data.hookSwingSpeedMax);
    const musicVolume = Number(data.musicVolume);
    const hookSwingSpeed = Number.isFinite(speed)
      ? clamp(speed, 0.2, 2)
      : DEFAULT_CONFIG.hookSwingSpeed;
    const hookSwingSpeedPerLevel = Number.isFinite(perLevel)
      ? clamp(perLevel, 0, 0.2)
      : DEFAULT_CONFIG.hookSwingSpeedPerLevel;
    const hookSwingSpeedMax = Number.isFinite(maxSpeed)
      ? clamp(maxSpeed, hookSwingSpeed, 3)
      : Math.max(hookSwingSpeed, DEFAULT_CONFIG.hookSwingSpeedMax);
    const safeMusicVolume = Number.isFinite(musicVolume)
      ? clamp(musicVolume, 0, 1)
      : DEFAULT_CONFIG.musicVolume;
    return {
      hookSwingSpeed: hookSwingSpeed,
      hookSwingSpeedPerLevel: hookSwingSpeedPerLevel,
      hookSwingSpeedMax: hookSwingSpeedMax,
      musicVolume: safeMusicVolume
    };
  }

  function levelTarget(level) {
    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
    return 650 + 450 * (safeLevel - 1);
  }

  function retrieveSpeed(weight, strengthActive) {
    const safeWeight = Math.max(0.1, Number(weight) || 0.1);
    const base = 620 / (0.35 + safeWeight * 0.65);
    const boosted = strengthActive ? base * 1.7 : base;
    return Math.round(clamp(boosted, 130, 950));
  }

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function random() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickWeighted(entries, random) {
    const total = entries.reduce(function (sum, entry) {
      return sum + entry[1];
    }, 0);
    let roll = random() * total;
    for (let i = 0; i < entries.length; i += 1) {
      roll -= entries[i][1];
      if (roll <= 0) return entries[i][0];
    }
    return entries[entries.length - 1][0];
  }

  function goldMix(level, random) {
    if (level >= 6) {
      return pickWeighted(
        [
          ["goldS", 0.28],
          ["goldM", 0.4],
          ["goldL", 0.32]
        ],
        random
      );
    }
    if (level >= 3) {
      return pickWeighted(
        [
          ["goldS", 0.42],
          ["goldM", 0.38],
          ["goldL", 0.2]
        ],
        random
      );
    }
    return pickWeighted(
      [
        ["goldS", 0.58],
        ["goldM", 0.32],
        ["goldL", 0.1]
      ],
      random
    );
  }

  function planValue(plan) {
    return plan.reduce(function (sum, type) {
      return sum + (ITEM_DEFS[type] ? ITEM_DEFS[type].value : 0);
    }, 0);
  }

  function makeItemPlan(level, random) {
    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
    const rng = typeof random === "function" ? random : Math.random;
    const plan = [];

    const goldCount = Math.min(13, 6 + Math.floor((safeLevel - 1) * 0.7));
    const rockCount = Math.min(6, 2 + Math.floor((safeLevel - 1) / 2));
    const diamondCount = Math.min(4, 1 + Math.floor((safeLevel - 1) / 3));
    const powerupCount = Math.min(3, 1 + Math.floor((safeLevel - 1) / 4));

    for (let i = 0; i < goldCount; i += 1) plan.push(goldMix(safeLevel, rng));
    for (let i = 0; i < rockCount; i += 1) plan.push(rng() < 0.55 ? "rockS" : "rockL");
    for (let i = 0; i < diamondCount; i += 1) plan.push("diamond");
    for (let i = 0; i < powerupCount; i += 1) {
      plan.push(
        pickWeighted(
          [
            ["tnt", 0.42],
            ["clover", 0.32],
            ["strength", 0.26]
          ],
          rng
        )
      );
    }

    const target = levelTarget(safeLevel);
    const requiredValue = Math.round(target * 1.28);
    let cursor = 0;
    let guard = 0;
    while (planValue(plan) < requiredValue && guard < 40) {
      guard += 1;
      const rockIndex = plan.indexOf("rockS", cursor);
      const bigRockIndex = plan.indexOf("rockL", cursor);
      const replaceIndex = rockIndex >= 0 ? rockIndex : bigRockIndex;
      const rockCount = plan.filter(function (type) {
        return type === "rockS" || type === "rockL";
      }).length;
      if (replaceIndex >= 0 && rockCount > 2) {
        plan[replaceIndex] = rng() < 0.5 ? "goldM" : "goldL";
        cursor = replaceIndex + 1;
      } else {
        plan.push("goldM");
        cursor = 0;
      }
    }

    return plan;
  }

  function isOverlapping(candidate, placed, gap) {
    return placed.some(function (other) {
      const dx = candidate.x - other.x;
      const dy = candidate.y - other.y;
      return Math.hypot(dx, dy) < candidate.r + other.r + gap;
    });
  }

  function placeItems(plan, bounds, random) {
    const rng = typeof random === "function" ? random : Math.random;
    const placed = [];
    const minX = Number(bounds.minX) || 0;
    const maxX = Number(bounds.maxX) || WORLD_WIDTH;
    const minY = Number(bounds.minY) || 0;
    const maxY = Number(bounds.maxY) || 900;

    plan.forEach(function (type) {
      const def = ITEM_DEFS[type];
      if (!def) return;
      const r = def.radius;
      const innerMinX = minX + r + 4;
      const innerMaxX = Math.max(innerMinX, maxX - r - 4);
      const innerMinY = minY + r + 4;
      const innerMaxY = Math.max(innerMinY, maxY - r - 4);
      let found = null;

      for (let attempt = 0; attempt < 280; attempt += 1) {
        const candidate = {
          x: innerMinX + rng() * (innerMaxX - innerMinX),
          y: innerMinY + rng() * (innerMaxY - innerMinY),
          r: r
        };
        if (!isOverlapping(candidate, placed, 8)) {
          found = candidate;
          break;
        }
      }

      if (!found) {
        for (let y = innerMinY; y <= innerMaxY && !found; y += 14) {
          for (let x = innerMinX; x <= innerMaxX && !found; x += 14) {
            const candidate = { x: x, y: y, r: r };
            if (!isOverlapping(candidate, placed, 2)) found = candidate;
          }
        }
      }

      if (!found) {
        const fallback = {
          x: clamp(minX + r + (placed.length % 6) * (r + 10), minX + r, maxX - r),
          y: clamp(minY + r + Math.floor(placed.length / 6) * (r + 12), minY + r, maxY - r),
          r: r
        };
        found = fallback;
      }

      placed.push({ type: type, x: found.x, y: found.y, r: r });
    });

    return placed;
  }

  function sanitizeSave(raw) {
    const defaults = { bestScore: 0, bestLevel: 1, muted: false, musicTrack: 0 };
    let data = raw;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (error) {
        return defaults;
      }
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return defaults;

    const score = Number(data.bestScore);
    const level = Number(data.bestLevel);
    const musicTrack = Number(data.musicTrack);
    return {
      bestScore: Number.isFinite(score) ? clamp(Math.floor(score), 0, 999999999) : 0,
      bestLevel: Number.isFinite(level) ? clamp(Math.floor(level), 1, 999) : 1,
      muted: typeof data.muted === "boolean" ? data.muted : false,
      musicTrack: Number.isFinite(musicTrack)
        ? clamp(Math.floor(musicTrack), -1, MUSIC_TRACK_COUNT - 1)
        : 0
    };
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.ceil(Number(seconds) || 0));
    const minutes = Math.floor(safe / 60);
    const rest = safe % 60;
    return String(minutes) + ":" + String(rest).padStart(2, "0");
  }

  function randomReward(random) {
    const rng = typeof random === "function" ? random : Math.random;
    return 80 + Math.floor(rng() * 161);
  }

  return {
    SAVE_KEY: SAVE_KEY,
    WORLD_WIDTH: WORLD_WIDTH,
    LEVEL_SECONDS: LEVEL_SECONDS,
    BUFF_SECONDS: BUFF_SECONDS,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    MUSIC_TRACK_COUNT: MUSIC_TRACK_COUNT,
    ITEM_DEFS: ITEM_DEFS,
    clamp: clamp,
    normalizeConfig: normalizeConfig,
    levelTarget: levelTarget,
    retrieveSpeed: retrieveSpeed,
    mulberry32: mulberry32,
    pickWeighted: pickWeighted,
    planValue: planValue,
    makeItemPlan: makeItemPlan,
    placeItems: placeItems,
    sanitizeSave: sanitizeSave,
    formatTime: formatTime,
    randomReward: randomReward
  };
});
