#!/usr/bin/env node
// Regenerates the template cover images used in the Website tab (public/templates/<id>/cover.jpg).
// Run with the frontend dev server up:  node scripts/capture-templates.mjs [baseUrl]
// It opens each demo store (/s/demo-<template>) in headless Chrome and saves the top of the home page.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(import.meta.url)(path.join(root, "node_modules", "sharp"));
const base = (process.argv[2] ?? "http://localhost:3001").replace(/\/$/, "");
const TEMPLATES = ["boutique", "jewellery", "bakery", "beauty", "fitness"];

const chrome = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => p && existsSync(p));
if (!chrome) { console.error("Chrome not found. Set CHROME_PATH."); process.exit(1); }

const tmp = path.join(os.tmpdir(), "dmforgrow-covers");
mkdirSync(tmp, { recursive: true });
for (const id of TEMPLATES) {
  const shot = path.join(tmp, `${id}.png`);
  const r = spawnSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1280,830", "--virtual-time-budget=10000", `--screenshot=${shot}`, `${base}/s/demo-${id}`], { stdio: "ignore" });
  if (r.status !== 0 || !existsSync(shot)) { console.error(`failed: ${id}`); continue; }
  const out = path.join(root, "public", "templates", id, "cover.jpg");
  mkdirSync(path.dirname(out), { recursive: true });
  // Skip the black "Demo store" strip at the top (about 30px) so the cover starts at the store's own header.
  const buf = await sharp(readFileSync(shot)).extract({ left: 0, top: 30, width: 1280, height: 800 }).resize(800, 500).jpeg({ quality: 74, mozjpeg: true }).toBuffer();
  writeFileSync(out, buf);
  rmSync(shot, { force: true });
  console.log(`cover ${id} (${Math.round(buf.length / 1024)} KB)`);
}
