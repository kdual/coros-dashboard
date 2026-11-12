import { readdir, readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
const run = spawnSync(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "build",
    "--mode",
    "hosted",
    "--outDir",
    "web-build",
  ],
  { stdio: "inherit" },
);
if (run.status) process.exit(run.status);
const map = {};
async function walk(dir, prefix = "") {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.isDirectory())
      await walk(dir + "/" + item.name, prefix + "/" + item.name);
    else {
      const path = prefix + "/" + item.name;
      map[path === "/index.html" ? "/" : path] = {
        body: (await readFile(dir + "/" + item.name)).toString("base64"),
        type: path.endsWith(".html")
          ? "text/html; charset=utf-8"
          : path.endsWith(".css")
            ? "text/css; charset=utf-8"
            : "text/javascript; charset=utf-8",
      };
    }
  }
}
await walk("web-build");
await writeFile(
  "web/assets.generated.mjs",
  "export const assets=" + JSON.stringify(map) + ";",
);
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await build({
  entryPoints: ["web/worker.mjs"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
});
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
console.log("Private web Worker built");
