import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = function (relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
};
const readBase64 = function (relativePath) {
  return fs.readFileSync(path.join(root, relativePath)).toString("base64");
};

const html = read("index.html");
const css = read("css/style.css");
const config = read("config.js");
const core = read("js/core.js");
const game = read("js/game.js");
const iconSvg = readBase64("assets/icon.svg");
const iconPng = readBase64("assets/icon-192.png");

function inlineScript(source) {
  return source.replace(/<\/script/gi, "<\\/script");
}

let output = html
  .replace(/[ \t]*<link rel="manifest"[^>]*>\r?\n?/g, "")
  .replace(
    /<link rel="icon"[^>]*>/,
    '<link rel="icon" href="data:image/svg+xml;base64,' + iconSvg + '">'
  )
  .replace(
    /<link rel="apple-touch-icon"[^>]*>/,
    '<link rel="apple-touch-icon" href="data:image/png;base64,' + iconPng + '">'
  )
  .replace(
    /<link rel="stylesheet" href="css\/style\.css">/,
    "<style>\n" + css + "\n</style>"
  )
  .replace(
    /<script src="config\.js"><\/script>/,
    "<script>\n" + inlineScript(config) + "\n</script>"
  )
  .replace(
    /<script src="js\/core\.js"><\/script>/,
    "<script>\n" + inlineScript(core) + "\n</script>"
  )
  .replace(
    /<script src="js\/game\.js"><\/script>/,
    "<script>\n" + inlineScript(game) + "\n</script>"
  )
  .replace("</head>", '  <meta name="gold-miner-single" content="1">\n</head>');

const externalReferences = output.match(/(?:src|href)="(?:js|css|assets|manifest)[^"]*"/g);
if (externalReferences) {
  throw new Error("单文件构建仍包含外部引用: " + externalReferences.join(", "));
}
if (output.includes('src="js/') || output.includes('href="css/')) {
  throw new Error("单文件构建未完整内联 CSS/JS");
}

const outputDir = path.join(root, "dist");
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "gold-miner.html");
fs.writeFileSync(outputPath, output, "utf8");

const sizeKb = (Buffer.byteLength(output, "utf8") / 1024).toFixed(1);
console.log("Built " + path.relative(root, outputPath));
console.log("Size: " + sizeKb + " KB");
console.log("External requests: none");
