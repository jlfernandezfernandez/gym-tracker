import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TELEGRAM_SDK = "https://telegram.org/js/telegram-web-app.js";

function filesBelow(directory, current = directory) {
  return readdirSync(current).flatMap(name => {
    const path = resolve(current, name);
    return statSync(path).isDirectory() ? filesBelow(directory, path) : [path];
  });
}

export function injectPrecache(distDirectory, version) {
  const dist = resolve(distDirectory);
  const workerPath = resolve(dist, "sw.js");
  const assets = filesBelow(dist)
    .filter(path => path !== workerPath)
    .map(path => posix.join("/", relative(dist, path).split("\\").join("/")))
    .map(path => path === "/index.html" ? "/" : path)
    .sort();
  assets.push(TELEGRAM_SDK);
  const fingerprint = createHash("sha256").update(`${version}\n${assets.join("\n")}`).digest("hex").slice(0, 12);
  const source = readFileSync(workerPath, "utf8");
  writeFileSync(
    workerPath,
    `self.__PRECACHE = ${JSON.stringify(assets)};\nself.__CACHE = ${JSON.stringify(`gym-shell-${version}-${fingerprint}`)};\n${source}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = fileURLToPath(new URL("../dist", import.meta.url));
  const manifest = JSON.parse(readFileSync(new URL("../../../.release-please-manifest.json", import.meta.url), "utf8"));
  injectPrecache(dist, manifest["."]);
}
