#!/usr/bin/env node
// IZ-Click: JSON structure and key parity preflight for Spanish translations.
// Runs without installing dependencies. This does not replace Plane's i18n checks.
import fs from "node:fs";
import path from "node:path";

const root = "packages/i18n/src/locales";
const sourceDir = path.join(root, "en");
const targetDir = path.join(root, "es");
const flatten = (value, prefix = "", result = {}) => {
  for (const [key, entry] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (typeof entry === "string") result[next] = entry;
    else if (entry && typeof entry === "object" && !Array.isArray(entry)) flatten(entry, next, result);
    else throw new Error(`Unexpected translation type at ${next}`);
  }
  return result;
};
let errors = 0;
let total = 0;
for (const file of fs.readdirSync(sourceDir).filter((name) => name.endsWith(".json"))) {
  const english = flatten(JSON.parse(fs.readFileSync(path.join(sourceDir, file), "utf8")));
  const spanishPath = path.join(targetDir, file);
  if (!fs.existsSync(spanishPath)) {
    console.error(`Missing Spanish file: ${file}`);
    errors++;
    continue;
  }
  const spanish = flatten(JSON.parse(fs.readFileSync(spanishPath, "utf8")));
  const missing = Object.keys(english).filter((key) => !(key in spanish));
  const extra = Object.keys(spanish).filter((key) => !(key in english));
  if (missing.length || extra.length) {
    errors += missing.length + extra.length;
    console.error(`${file}: missing=${missing.length}, extra=${extra.length}`);
    for (const key of missing.slice(0, 10)) console.error(`  missing: ${key}`);
    for (const key of extra.slice(0, 10)) console.error(`  extra: ${key}`);
  }
  total += Object.keys(english).length;
}
console.log(`Checked ${total} translation keys; errors: ${errors}`);
if (errors > 0) process.exit(1);
