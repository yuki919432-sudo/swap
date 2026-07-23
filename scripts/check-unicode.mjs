// Dangerous-Unicode guard.
//
// Fails (non-zero) if any git-tracked text file contains bidirectional controls,
// zero-width / invisible formatting characters, a byte-order mark, or C0/C1
// control characters (other than tab, LF, CR). These can hide or reorder source
// so that what a reviewer sees differs from what compiles/runs ("Trojan Source").
//
// Ordinary printable Unicode punctuation (em dashes, curly quotes, accents, ...)
// is intentionally NOT flagged. Detection uses NUMERIC codepoint ranges only, so
// this scanner file itself is pure ASCII and can never self-flag.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// [lo, hi] inclusive codepoint ranges considered dangerous.
const RANGES = [
  [0x00, 0x08], // C0 controls (excludes TAB 09, LF 0A, CR 0D)
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x9f], // DEL + C1 controls
  [0x00ad, 0x00ad], // SOFT HYPHEN
  [0x061c, 0x061c], // ARABIC LETTER MARK
  [0x180e, 0x180e], // MONGOLIAN VOWEL SEPARATOR
  [0x200b, 0x200f], // ZWSP, ZWNJ, ZWJ, LRM, RLM
  [0x2028, 0x2029], // LINE / PARAGRAPH SEPARATOR
  [0x202a, 0x202e], // bidi embeddings & overrides
  [0x2060, 0x2064], // WORD JOINER + invisible operators
  [0x2066, 0x206f], // bidi isolates + deprecated format chars
  [0xfeff, 0xfeff], // ZERO WIDTH NO-BREAK SPACE / BOM
  [0xfff9, 0xfffb], // interlinear annotation marks
];

const NAMES = {
  0x00ad: "SOFT HYPHEN",
  0x061c: "ARABIC LETTER MARK",
  0x180e: "MONGOLIAN VOWEL SEPARATOR",
  0x200b: "ZERO WIDTH SPACE",
  0x200c: "ZERO WIDTH NON-JOINER",
  0x200d: "ZERO WIDTH JOINER",
  0x200e: "LEFT-TO-RIGHT MARK",
  0x200f: "RIGHT-TO-LEFT MARK",
  0x2028: "LINE SEPARATOR",
  0x2029: "PARAGRAPH SEPARATOR",
  0x202a: "LEFT-TO-RIGHT EMBEDDING",
  0x202b: "RIGHT-TO-LEFT EMBEDDING",
  0x202c: "POP DIRECTIONAL FORMATTING",
  0x202d: "LEFT-TO-RIGHT OVERRIDE",
  0x202e: "RIGHT-TO-LEFT OVERRIDE",
  0x2060: "WORD JOINER",
  0x2066: "LEFT-TO-RIGHT ISOLATE",
  0x2067: "RIGHT-TO-LEFT ISOLATE",
  0x2068: "FIRST STRONG ISOLATE",
  0x2069: "POP DIRECTIONAL ISOLATE",
  0xfeff: "ZERO WIDTH NO-BREAK SPACE / BOM",
};

const isDangerous = (cp) => RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
const describe = (cp) =>
  NAMES[cp] ||
  (cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f) ? "CONTROL CHARACTER" : "FORMAT/INVISIBLE CHARACTER");

const files = execSync("git ls-files -z", { maxBuffer: 64 * 1024 * 1024 })
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

let hits = 0;
let scanned = 0;

for (const file of files) {
  let buf;
  try {
    buf = readFileSync(file);
  } catch {
    continue; // deleted / submodule / unreadable
  }
  if (buf.includes(0)) continue; // binary
  scanned += 1;

  const lines = buf.toString("utf8").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    let col = 0;
    for (const ch of lines[i]) {
      col += 1;
      const cp = ch.codePointAt(0);
      if (isDangerous(cp)) {
        hits += 1;
        console.log(
          `${file}:${i + 1}:${col}  U+${cp.toString(16).toUpperCase().padStart(4, "0")}  ${describe(cp)}`,
        );
      }
    }
  }
}

if (hits > 0) {
  console.error(`\nFAIL: ${hits} dangerous Unicode character(s) found in ${scanned} scanned files.`);
  process.exit(1);
}
console.log(`OK: no dangerous Unicode characters in ${scanned} scanned files.`);
