# 黄金矿工 · 矿脉深处

一款移动优先的 HTML5 黄金矿工小游戏。摆动钩子、抓取矿物、在 60 秒内完成本关目标。全部美术、音效和背景音乐均由 Canvas / Web Audio 程序化生成，不依赖外部素材；支持离线 PWA，也可以打包成单个 HTML 文件直接传到手机打开。

## 快速开始

### 直接玩单文件版

双击 `dist/gold-miner.html`，或用手机浏览器打开这个文件即可。单文件版已内联 CSS、JavaScript 和图标，不需要服务器，也不需要联网。

### 本地服务器

```powershell
npm run serve
```

然后访问 `http://localhost:8080`。

### 手机上运行

- 手机与电脑连接同一 Wi-Fi，在手机浏览器打开 `http://电脑局域网IP:8080`。
- 或者把 `dist/gold-miner.html` 传到手机，用浏览器打开。
- PWA 安装（添加到主屏幕）需要 HTTP/HTTPS 部署；`file://` 打开时不会注册 Service Worker。

## 玩法

- 每关 60 秒，钩子左右摆动，点击 / 触摸画面发射。
- 钩子抓到物品后自动回收；物品越重，回收越慢。
- 本关收入达到目标即可过关，金币会跨关累计。
- 关卡目标：`650 + 450 × (关卡 - 1)`。
- 时间耗尽后等待钩子返回，再判定通关或失败。
- 如果场上物品全部清空，会立即结算，不再等待倒计时结束。

| 物品 | 价值 | 特点 |
| --- | ---: | --- |
| 小金块 / 金块 / 大金块 | 55 / 110 / 210 | 主要收入来源，越大越重 |
| 钻石 | 400 | 价值高、重量轻、回收快 |
| 小石头 / 大石头 | 12 / 20 | 又重又不值钱，可用炸药清除 |
| 炸药包 | 40 | 抓到后获得炸药库存 |
| 幸运草 | 随机奖励 | 抓到后获得随机金币或道具 |
| 力量饮料 | 0 | 抓到后获得 8 秒力量加成 |

## 道具与商店

每关结算后可进入商店，使用累计金币购买道具：

| 道具 | 价格 | 效果 |
| --- | ---: | --- |
| 炸药包 | ¥150 | 手动使用，清除画面中的石头 |
| 力量饮料 | ¥120 | 下一关开局自动生效，8 秒内回收速度提升 |
| 幸运草 | ¥90 | 下一关开局自动生效，获得随机奖励 |

力量饮料和幸运草在下一关开始时自动消耗；炸药包保留在库存中，由玩家手动使用。

## 操作

- 点击 / 触摸画面：发射钩子
- `空格`：发射钩子
- `P`：暂停 / 继续
- `M`：静音 / 取消静音
- HUD 按钮：音效、背景音乐、暂停、炸药

右下角音符按钮可循环切换 3 首默认背景音乐（矿洞回响、星夜矿歌、老式留声机），再点一次会关闭音乐。当前曲目会保存在本地。

页面切到后台会自动暂停；触控区域不小于 44px，并适配安全区和刘海屏。

## 配置

编辑根目录的 `config.js` 可以调整钩子摆动速度与背景音乐音量：

```js
window.GOLD_MINER_CONFIG = {
  hookSwingSpeed: 0.72,        // 默认摆动速度，越小越慢
  hookSwingSpeedPerLevel: 0.018,
  hookSwingSpeedMax: 0.9,
  musicVolume: 0.9
};
```

修改后刷新网页即可生效；如果使用单文件版，需要重新运行 `npm run build`。

## 开发

```powershell
npm test        # 纯逻辑单元测试
npm run build   # 生成 dist/gold-miner.html 单文件版
npm run smoke   # 使用本机 Edge/Chrome 跑浏览器冒烟测试并保存截图
```

冒烟测试依赖 `playwright-core`，如未安装：

```powershell
npm install
```

### 文件结构

```text
index.html                 页面与覆盖层
css/style.css              移动优先样式
config.js                  可调整的钩子速度与音乐音量
js/core.js                 可测试的纯逻辑（关卡、生成、存档）
js/game.js                 游戏循环、绘制、输入、音效、商店
manifest.webmanifest       PWA 清单
sw.js                      Service Worker 离线缓存
assets/                    图标
tests/core.test.mjs        单元测试
tools/build-single.mjs     单文件构建
tools/smoke-test.mjs       浏览器冒烟测试
dist/gold-miner.html       构建产物（可直接分发）
openspec/                  OpenSpec 变更与规格
```

## OpenSpec

本项目的需求、设计与任务记录在 `openspec/changes/archive/2026-11-10-add-gold-miner-game/`：

```powershell
openspec validate --specs --strict
openspec validate --archived --strict
```

## 说明

网络搜索得到的同类游戏资料质量有限，玩法以经典 GameHouse / 4399 黄金矿工为基线实现：摆动钩子、点击发射、重量影响回收速度、限时目标金额、矿物与道具、关卡间商店。所有图形和音效均为程序化生成，不包含第三方版权素材。
