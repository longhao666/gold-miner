import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("../js/core.js");

test("关卡目标按 650 + 450 × (关卡 - 1) 递增", () => {
  assert.equal(core.levelTarget(1), 650);
  assert.equal(core.levelTarget(2), 1100);
  assert.equal(core.levelTarget(4), 2000);
  assert.ok(core.levelTarget(9) > core.levelTarget(8));
  assert.equal(core.levelTarget(0), 650);
});

test("回收速度随重量下降，力量加成提升速度", () => {
  const diamond = core.retrieveSpeed(core.ITEM_DEFS.diamond.weight, false);
  const smallGold = core.retrieveSpeed(core.ITEM_DEFS.goldS.weight, false);
  const largeGold = core.retrieveSpeed(core.ITEM_DEFS.goldL.weight, false);
  const rock = core.retrieveSpeed(core.ITEM_DEFS.rockL.weight, false);

  assert.ok(diamond > smallGold);
  assert.ok(smallGold > largeGold);
  assert.ok(largeGold > rock);
  assert.ok(core.retrieveSpeed(core.ITEM_DEFS.rockL.weight, true) > rock);
  assert.ok(diamond <= 950);
  assert.ok(rock >= 130);
});

test("第一关生成最低配置，总价值足以完成目标", () => {
  const rng = core.mulberry32(20261110);
  const plan = core.makeItemPlan(1, rng);
  const counts = plan.reduce((acc, type) => {
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  const goldCount = (counts.goldS || 0) + (counts.goldM || 0) + (counts.goldL || 0);
  const rockCount = (counts.rockS || 0) + (counts.rockL || 0);
  const powerupCount = (counts.tnt || 0) + (counts.clover || 0) + (counts.strength || 0);

  assert.ok(goldCount >= 6, `gold ${goldCount}`);
  assert.ok(rockCount >= 2, `rock ${rockCount}`);
  assert.ok((counts.diamond || 0) >= 1, "diamond");
  assert.ok(powerupCount >= 1, `powerup ${powerupCount}`);
  assert.ok(core.planValue(plan) >= core.levelTarget(1) * 1.2);
});

test("高关卡物品更多且总价值随目标提升", () => {
  const level1 = core.makeItemPlan(1, core.mulberry32(1));
  const level6 = core.makeItemPlan(6, core.mulberry32(2));
  assert.ok(level6.length > level1.length);
  assert.ok(core.planValue(level6) >= core.levelTarget(6) * 1.2);
});

test("布点全部在边界内且互不重叠", () => {
  const plan = core.makeItemPlan(3, core.mulberry32(42));
  const bounds = { minX: 42, maxX: 498, minY: 250, maxY: 850 };
  const placed = core.placeItems(plan, bounds, core.mulberry32(99));

  assert.equal(placed.length, plan.length);
  for (const item of placed) {
    assert.ok(item.x - item.r >= bounds.minX - 0.5, `x min ${item.type}`);
    assert.ok(item.x + item.r <= bounds.maxX + 0.5, `x max ${item.type}`);
    assert.ok(item.y - item.r >= bounds.minY - 0.5, `y min ${item.type}`);
    assert.ok(item.y + item.r <= bounds.maxY + 0.5, `y max ${item.type}`);
  }
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const a = placed[i];
      const b = placed[j];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(distance >= a.r + b.r - 1, `${a.type}/${b.type} overlap ${distance}`);
    }
  }
});

test("存档清洗回退损坏数据并限制范围", () => {
  assert.deepEqual(core.sanitizeSave(null), { bestScore: 0, bestLevel: 1, muted: false });
  assert.deepEqual(core.sanitizeSave("{bad json"), { bestScore: 0, bestLevel: 1, muted: false });
  assert.deepEqual(core.sanitizeSave("[]"), { bestScore: 0, bestLevel: 1, muted: false });
  assert.deepEqual(core.sanitizeSave({ bestScore: "x", bestLevel: -4, muted: "yes" }), {
    bestScore: 0,
    bestLevel: 1,
    muted: false
  });
  assert.deepEqual(core.sanitizeSave({ bestScore: 1200.8, bestLevel: 3.9, muted: true }), {
    bestScore: 1200,
    bestLevel: 3,
    muted: true
  });
});

test("时间格式化与随机奖励范围", () => {
  assert.equal(core.formatTime(60), "1:00");
  assert.equal(core.formatTime(9.2), "0:10");
  assert.equal(core.formatTime(-1), "0:00");
  for (let seed = 1; seed < 50; seed += 1) {
    const reward = core.randomReward(core.mulberry32(seed));
    assert.ok(reward >= 80 && reward <= 240, `reward ${reward}`);
  }
});
