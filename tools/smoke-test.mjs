import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const screenshots = path.join(root, "screenshots");
fs.mkdirSync(screenshots, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

function startStaticServer() {
  const server = http.createServer(function (request, response) {
    try {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      const pathname = decodeURIComponent(requestUrl.pathname);
      const filePath = path.resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
      if (!filePath.startsWith(root)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      const data = fs.readFileSync(filePath);
      response.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      response.end(data);
    } catch (error) {
      response.writeHead(404);
      response.end("Not found");
    }
  });
  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", function () {
      resolve({ server, port: server.address().port });
    });
  });
}

function findBrowser() {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ];
  return candidates.find(function (candidate) {
    return fs.existsSync(candidate);
  });
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch (error) {
    throw new Error("缺少 playwright-core。请先运行：npm install --no-save --no-package-lock playwright-core");
  }

  const browserPath = findBrowser();
  if (!browserPath) throw new Error("未找到 Edge 或 Chrome，无法执行浏览器冒烟测试");

  const { server, port } = await startStaticServer();
  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: ["--disable-gpu", "--no-first-run"]
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  const errors = [];

  page.on("pageerror", function (error) {
    errors.push("pageerror: " + error.message);
  });
  page.on("console", function (message) {
    if (message.type() === "error") errors.push("console.error: " + message.text());
  });
  page.on("requestfailed", function (request) {
    errors.push("requestfailed: " + request.url() + " " + (request.failure() && request.failure().errorText));
  });

  const results = {};
  try {
    await page.goto("http://127.0.0.1:" + port + "/?debug=1", { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    results.ready = await page.evaluate("document.readyState");
    results.debugApi = await page.evaluate("Boolean(window.__GOLD_MINER__)");
    results.startVisible = await page.locator("#startScreen").evaluate(function (element) {
      return element.classList.contains("is-visible");
    });
    results.viewport = await page.evaluate(function () {
      return {
        w: innerWidth,
        h: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight
      };
    });
    await page.screenshot({ path: path.join(screenshots, "01-start.png") });

    await page.click("#startBtn");
    await page.waitForTimeout(700);
    let snapshot = await page.evaluate("__GOLD_MINER__.snapshot()");
    results.afterStart = {
      mode: snapshot.mode,
      level: snapshot.level,
      itemCount: snapshot.itemCount,
      target: snapshot.target,
      timeLeft: snapshot.timeLeft,
      hookSpeed: snapshot.hookSpeed,
      musicTrack: snapshot.musicTrack
    };
    await page.click("#musicBtn");
    await page.waitForTimeout(150);
    snapshot = await page.evaluate("__GOLD_MINER__.snapshot()");
    results.musicAfterSwitch = snapshot.musicTrack;
    results.musicRunning = snapshot.musicRunning;
    await page.screenshot({ path: path.join(screenshots, "02-playing.png") });

    const priority = { diamond: 0, goldS: 1, goldM: 2, goldL: 3, clover: 4, strength: 5, tnt: 6, rockS: 7, rockL: 8 };
    const candidates = snapshot.items.map(function (item) {
      return Object.assign({}, item, { shotAngle: Math.atan2(item.x - 270, item.y - 208) });
    }).filter(function (item) {
      return Math.abs(item.shotAngle) < 1.16;
    }).sort(function (a, b) {
      return (priority[a.type] || 99) - (priority[b.type] || 99) || a.r - b.r;
    });
    const target = candidates[0] || snapshot.items[0];
    const angle = Math.atan2(target.x - 270, target.y - 208);
    results.target = { type: target.type, x: target.x, y: target.y, angle: angle };
    await page.evaluate(function (value) {
      window.__GOLD_MINER__.setAngle(value);
      window.__GOLD_MINER__.fire();
    }, angle);
    await page.waitForTimeout(3200);
    snapshot = await page.evaluate("__GOLD_MINER__.snapshot()");
    results.afterGrab = {
      mode: snapshot.mode,
      money: snapshot.money,
      levelEarned: snapshot.levelEarned,
      itemCount: snapshot.itemCount,
      hookState: snapshot.hookState
    };
    await page.screenshot({ path: path.join(screenshots, "03-after-grab.png") });

    await page.click("#pauseBtn");
    await page.waitForTimeout(300);
    const pausedA = await page.evaluate("__GOLD_MINER__.snapshot()");
    await page.waitForTimeout(1100);
    const pausedB = await page.evaluate("__GOLD_MINER__.snapshot()");
    results.pause = {
      mode: pausedA.mode,
      timeA: pausedA.timeLeft,
      timeB: pausedB.timeLeft,
      frozen: Math.abs(pausedA.timeLeft - pausedB.timeLeft) < 0.02
    };
    await page.screenshot({ path: path.join(screenshots, "04-pause.png") });
    await page.click("#resumeBtn");
    await page.waitForTimeout(400);

    await page.evaluate("__GOLD_MINER__.setTime(0.05)");
    await page.waitForTimeout(900);
    snapshot = await page.evaluate("__GOLD_MINER__.snapshot()");
    results.failResult = {
      mode: snapshot.mode,
      resultVisible: await page.locator("#resultScreen").evaluate(function (element) {
        return element.classList.contains("is-visible");
      }),
      failActionsVisible: await page.locator("#failActions").evaluate(function (element) {
        return !element.classList.contains("hidden");
      })
    };
    await page.screenshot({ path: path.join(screenshots, "05-result.png") });

    await page.click("#retryBtn");
    await page.waitForTimeout(600);
    snapshot = await page.evaluate("__GOLD_MINER__.snapshot()");
    results.restart = { mode: snapshot.mode, level: snapshot.level, money: snapshot.money };

    await page.evaluate("__GOLD_MINER__.finishLevel(true)");
    await page.waitForTimeout(400);
    await page.click("#shopBtn");
    await page.waitForTimeout(500);
    results.shop = {
      mode: (await page.evaluate("__GOLD_MINER__.snapshot()")).mode,
      visible: await page.locator("#shopScreen").evaluate(function (element) {
        return element.classList.contains("is-visible");
      }),
      money: await page.locator("#shopMoney").textContent()
    };
    await page.screenshot({ path: path.join(screenshots, "06-shop.png") });

    results.shopDisabledBefore = await page.locator('[data-buy="tnt"]').isDisabled();
    await page.evaluate("__GOLD_MINER__.grant('money', 500)");
    await page.waitForTimeout(200);
    results.shopDisabledAfter = await page.locator('[data-buy="tnt"]').isDisabled();
    await page.click('[data-buy="tnt"]');
    await page.click('[data-buy="strength"]');
    await page.click('[data-buy="clover"]');
    await page.waitForTimeout(200);
    snapshot = await page.evaluate("__GOLD_MINER__.snapshot()");
    results.purchase = {
      money: snapshot.money,
      inventory: snapshot.inventory
    };
    await page.screenshot({ path: path.join(screenshots, "07-shop-purchased.png") });

    await page.click("#continueFromShopBtn");
    await page.waitForTimeout(700);
    snapshot = await page.evaluate("__GOLD_MINER__.snapshot()");
    results.nextLevel = {
      mode: snapshot.mode,
      level: snapshot.level,
      strength: snapshot.strength,
      hookSpeed: snapshot.hookSpeed,
      inventory: snapshot.inventory,
      rocks: snapshot.items.filter(function (item) {
        return item.type === "rockS" || item.type === "rockL";
      }).length
    };
    await page.evaluate("__GOLD_MINER__.useTnt()");
    await page.waitForTimeout(400);
    snapshot = await page.evaluate("__GOLD_MINER__.snapshot()");
    results.tnt = {
      inventory: snapshot.inventory,
      rocks: snapshot.items.filter(function (item) {
        return item.type === "rockS" || item.type === "rockL";
      }).length
    };
    await page.screenshot({ path: path.join(screenshots, "08-tnt.png") });

    await page.evaluate("__GOLD_MINER__.start()");
    await page.waitForTimeout(300);
    await page.evaluate("__GOLD_MINER__.clearItems()");
    await page.waitForTimeout(300);
    snapshot = await page.evaluate("__GOLD_MINER__.snapshot()");
    results.earlyClear = {
      mode: snapshot.mode,
      cleared: snapshot.cleared,
      timeLeft: snapshot.timeLeft,
      resultVisible: await page.locator("#resultScreen").evaluate(function (element) {
        return element.classList.contains("is-visible");
      })
    };

    results.serviceWorker = await page.evaluate(function () {
      return navigator.serviceWorker.getRegistrations().then(function (items) {
        return items.length;
      });
    });
    results.overflow = await page.evaluate(function () {
      return document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight;
    });
    results.errors = errors;

    console.log(JSON.stringify(results, null, 2));

    const failed = !results.debugApi || !results.startVisible || results.afterStart.mode !== "playing" ||
      results.afterGrab.mode !== "playing" || results.afterGrab.itemCount >= results.afterStart.itemCount ||
      results.afterGrab.hookState !== "swing" || !results.pause.frozen || !results.failResult.resultVisible ||
      results.restart.money !== 0 || results.shop.mode !== "shop" || !results.shopDisabledBefore ||
      results.shopDisabledAfter || results.purchase.inventory.tnt !== 1 ||
      results.nextLevel.strength <= 0 || results.nextLevel.inventory.strength !== 0 ||
      results.nextLevel.inventory.clover !== 0 || results.tnt.rocks !== 0 ||
      results.tnt.inventory.tnt !== 0 || results.musicAfterSwitch !== 1 || !results.musicRunning ||
      Math.abs(results.afterStart.hookSpeed - 0.72) > 0.001 ||
      !results.earlyClear.cleared || results.earlyClear.mode !== "result" ||
      !results.earlyClear.resultVisible || results.overflow || results.serviceWorker < 1 || errors.length > 0;
    if (failed) process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
    server.closeAllConnections();
    server.close();
  }
}

main().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
