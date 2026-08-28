"use strict";
/* Cognitive Gym — module-timed practice for gamified cognitive assessments.
 * All state is client-side; the answer log persists in localStorage. */

// ------------------------------------------------------------------ utils
const $ = id => document.getElementById(id);
const rint = n => Math.floor(Math.random() * n);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rint(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pad2 = n => String(n).padStart(2, "0");

// ------------------------------------------------------------------ logger
const LOGKEY = "cognitiveGymLog";
let LOG = [];
try { LOG = JSON.parse(localStorage.getItem(LOGKEY) || "[]"); } catch (e) { LOG = []; }
function refreshLogCount() { $("logcount").textContent = LOG.length + " answers logged"; }
function logItem(o) {
  o.ts = new Date().toISOString();
  LOG.push(o);
  try { localStorage.setItem(LOGKEY, JSON.stringify(LOG)); } catch (e) {}
  refreshLogCount();
}
function dlLog(fmt) {
  let data, mime, name;
  if (fmt === "json") { data = JSON.stringify(LOG, null, 1); mime = "application/json"; name = "cognitive_gym_log.json"; }
  else {
    const cols = ["ts", "mode", "game", "level", "question", "expected", "given", "correct", "detail", "ms"];
    const esc = v => `"${String(v === undefined ? "" : v).replace(/"/g, '""')}"`;
    data = cols.join(",") + "\n" + LOG.map(r => cols.map(c => esc(r[c])).join(",")).join("\n");
    mime = "text/csv"; name = "cognitive_gym_log.csv";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: mime }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
$("btn-log-json").onclick = () => dlLog("json");
$("btn-log-csv").onclick = () => dlLog("csv");
$("btn-log-clear").onclick = () => { LOG = []; localStorage.removeItem(LOGKEY); refreshLogCount(); };
refreshLogCount();

// ------------------------------------------------------------------ clock
class Clock {
  constructor(seconds, { onExpire, onTick } = {}) {
    this.total = seconds * 1000;
    this.left = this.total;
    this.onExpire = onExpire;
    this.onTick = onTick;
    this.running = false;
    this._last = 0;
    this._raf = null;
  }
  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    const step = now => {
      if (!this.running) return;
      this.left -= now - this._last;
      this._last = now;
      if (this.onTick) this.onTick(this);
      if (this.left <= 0) { this.running = false; this.left = 0; if (this.onExpire) this.onExpire(); return; }
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }
  pause() { this.running = false; cancelAnimationFrame(this._raf); }
  resume() { if (this.left > 0) this.start(); }
  stop() { this.pause(); }
  frac() { return Math.max(0, this.left / this.total); }
  mmss() { const s = Math.ceil(this.left / 1000); return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`; }
}

// ------------------------------------------------------------- screens
function show(screen) {
  ["screen-home", "screen-module", "screen-report"].forEach(id =>
    $(id).classList.toggle("hidden", id !== screen));
}
$("brand").onclick = () => { if (RUNNER) RUNNER.abort(); show("screen-home"); };

// ------------------------------------------------------------- module runner
let RUNNER = null;

class ModuleRunner {
  /* Runs one game against a countdown; collects stats.
   * onFinish(stats) fires when the clock expires or the runner is aborted. */
  constructor(gameKey, seconds, mode, onFinish) {
    this.game = GAMES[gameKey];
    this.key = gameKey;
    this.mode = mode;
    this.onFinish = onFinish;
    this.stats = { key: gameKey, name: this.game.name, attempted: 0, correct: 0,
                   points: 0, sumMs: 0, maxLevel: 1, seconds };
    this.level = 1;
    this.streak = 0;
    this.finished = false;
    this.itemClock = null;
    this._timeouts = [];
    this.clock = new Clock(seconds, {
      onExpire: () => this.finish(),
      onTick: c => { $("mod-time").textContent = c.mmss(); $("mod-bar").style.width = (c.frac() * 100) + "%"; },
    });
  }
  start() {
    RUNNER = this;
    show("screen-module");
    $("mod-title").textContent = this.game.name;
    $("mod-fb").textContent = "";
    $("item-timerwrap").classList.add("hidden");
    this.refreshStatus();
    $("mod-time").textContent = this.clock.mmss();
    this.clock.start();
    this.game.item(this);
  }
  refreshStatus() {
    $("mod-level").textContent = this.level;
    $("mod-attempted").textContent = this.stats.attempted;
    $("mod-correct").textContent = this.stats.correct;
    $("mod-points").textContent = this.stats.points;
  }
  later(fn, ms) { this._timeouts.push(setTimeout(() => { if (!this.finished) fn(); }, ms)); }
  feedback(msg, ok) { const fb = $("mod-fb"); fb.textContent = msg; fb.className = "feedback " + (ok ? "ok" : "bad"); }
  // called by games when an item resolves
  record({ question, expected, given, correct, detail = "", ms = 0, points = 1 }) {
    if (this.finished) return;
    this.stats.attempted++;
    if (correct) { this.stats.correct++; this.stats.points += points; this.streak++; }
    else this.streak = 0;
    this.stats.sumMs += ms;
    logItem({ mode: this.mode, game: this.key, level: this.level, question,
              expected, given, correct, detail, ms });
    // monotonic difficulty: up on a 2-streak, never down
    if (this.streak >= 2 && this.level < this.game.maxLevel) { this.level++; this.streak = 0; }
    this.stats.maxLevel = Math.max(this.stats.maxLevel, this.level);
    this.refreshStatus();
  }
  next(delay = 1000) { this.later(() => { $("mod-fb").textContent = ""; this.game.item(this); }, delay); }
  startItemTimer(seconds, onExpire) {
    this.stopItemTimer();
    $("item-timerwrap").classList.remove("hidden");
    this.itemClock = new Clock(seconds, {
      onExpire,
      onTick: c => { $("item-bar").style.width = (c.frac() * 100) + "%"; },
    });
    this.itemClock.start();
  }
  stopItemTimer() { if (this.itemClock) { this.itemClock.stop(); this.itemClock = null; } }
  pause() { this.clock.pause(); if (this.itemClock) this.itemClock.pause(); }
  resume() { this.clock.resume(); if (this.itemClock) this.itemClock.resume(); }
  finish() {
    if (this.finished) return;
    this.finished = true;
    this.stopItemTimer();
    this.clock.stop();
    this._timeouts.forEach(clearTimeout);
    $("arena").innerHTML = "";
    RUNNER = null;
    this.onFinish(this.stats);
  }
  abort() { this.finished = true; this.stopItemTimer(); this.clock.stop(); this._timeouts.forEach(clearTimeout); $("arena").innerHTML = ""; RUNNER = null; }
}

// pause when the tab is hidden (the old version kept timers running)
document.addEventListener("visibilitychange", () => {
  if (document.hidden && RUNNER && !RUNNER.finished) { RUNNER.pause(); $("pause").classList.remove("hidden"); }
});
$("pause").onclick = () => { $("pause").classList.add("hidden"); if (RUNNER) RUNNER.resume(); };

// ================================================================== SWITCH
const SYMS = ["■", "●", "▲", "♥", "✚", "◆", "☀", "★"];
const applyCode = (row, code) => code.map(p => row[p - 1]);
function randCode(n) {
  let p = shuffle([...Array(n).keys()]).map(x => x + 1);
  if (p.every((v, i) => v === i + 1)) p = p.reverse();
  return p;
}

const SwitchGame = {
  name: "Switch", maxLevel: 4,
  item(run) {
    // level config: number of chained steps and options offered per step.
    // Intermediate symbol rows are NOT shown (as in the real test): you pick
    // one code per step so the whole chain maps the top row to the final row.
    const cfg = [{ steps: 1, opts: 4 }, { steps: 2, opts: 2 },
                 { steps: 3, opts: 2 }, { steps: 3, opts: 3 }][run.level - 1];
    const n = 4;
    const syms = shuffle(SYMS).slice(0, n);

    const countSolutions = (optionSets, final) => {
      let count = 0;
      const rec = (i, row) => {
        if (count > 1) return;
        if (i === optionSets.length) { if (row.join("") === final.join("")) count++; return; }
        for (const code of optionSets[i])
          rec(i + 1, applyCode(row, code.split("").map(Number)));
      };
      rec(0, syms);
      return count;
    };

    let truth, final, optionSets;
    for (let guard = 0; guard < 200; guard++) {
      truth = [...Array(cfg.steps)].map(() => randCode(n));
      final = truth.reduce((row, c) => applyCode(row, c), syms);
      optionSets = truth.map(c => {
        const set = new Set([c.join("")]);
        while (set.size < cfg.opts) set.add(randCode(n).join(""));
        return shuffle([...set]);
      });
      if (countSolutions(optionSets, final) === 1) break;
    }
    const t0 = Date.now();
    const chosen = Array(cfg.steps).fill(null);

    let html = `<div class="symrow">${syms.map(s => `<div class="slot">${s}</div>`).join("")}</div>`;
    optionSets.forEach((opts, s) => {
      html += `<div class="codebetween">&darr; step ${s + 1}: pick the code &darr;</div>
        <div class="opts steprow" data-step="${s}">${opts.map(o =>
          `<button data-code="${o}">${o}</button>`).join("")}</div>`;
    });
    html += `<div class="codebetween">&darr; result &darr;</div>
      <div class="symrow">${final.map(s => `<div class="slot">${s}</div>`).join("")}</div>
      <p class="small center">Each code reads left to right: the digit says which position in the
      row above the symbol came from. The intermediate rows are hidden: choose one code per step so
      the whole chain produces the result row.</p>`;
    $("arena").innerHTML = html;

    $("arena").querySelectorAll(".steprow button").forEach(b => b.onclick = () => {
      const stepEl = b.closest(".steprow");
      const s = Number(stepEl.dataset.step);
      stepEl.querySelectorAll("button").forEach(x => x.classList.remove("sel"));
      b.classList.add("sel");
      chosen[s] = b.dataset.code;
      if (chosen.every(c => c !== null)) {
        const got = chosen.reduce((row, c) => applyCode(row, c.split("").map(Number)), syms);
        const ok = got.join("") === final.join("");
        const expected = truth.map(c => c.join("")).join("+");
        run.record({ question: `${syms.join("")} -> ${final.join("")} (${cfg.steps} steps, ${cfg.opts} options)` ,
                     expected, given: chosen.join("+"), correct: ok,
                     ms: Date.now() - t0, points: cfg.steps });
        run.feedback(ok ? "Correct" : "Wrong: the chain was " + expected, ok);
        run.next(ok ? 800 : 1800);
      }
    });
  },
};

// =================================================================== DIGIT
/* Level 1: a + b = c            Level 2: subtraction / two-digit addition
 * Level 3: multiplication mixes Level 4: division and mixed precedence  */
function digitTemplates(level) {
  const T = [];
  if (level === 1) T.push(["a", "+", "b", "=", "c"]);
  if (level === 2) T.push(["a", "−", "b", "=", "c"], ["a", "b", "+", "c", "=", "d", "e"]);
  if (level === 3) T.push(["a", "×", "b", "=", "c", "d"], ["a", "×", "b", "+", "c", "=", "d", "e"],
                          ["a", "×", "b", "−", "c", "=", "d"]);
  if (level >= 4) T.push(["a", "b", "÷", "c", "=", "d"], ["a", "×", "b", "÷", "c", "=", "d"],
                         ["a", "+", "b", "×", "c", "=", "d", "e"]);
  return T;
}
function evalTokens(tokens) {
  // adjacent digits form multi-digit numbers; × ÷ − mapped to JS operators
  const s = tokens.join("").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  const [lhs, rhs] = s.split("=");
  if (!/^[0-9+*/\-]+$/.test(lhs) || !/^[0-9]+$/.test(rhs)) return false;
  const v = Function('"use strict";return (' + lhs + ')')();
  return Number.isFinite(v) && Math.abs(v - Number(rhs)) < 1e-9;
}
function genDigit(level) {
  const templates = digitTemplates(level);
  for (let guard = 0; guard < 4000; guard++) {
    const tpl = templates[rint(templates.length)];
    const letters = [...new Set(tpl.filter(t => /^[a-z]$/.test(t)))];
    const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, letters.length);
    const map = Object.fromEntries(letters.map((L, i) => [L, digits[i]]));
    const tokens = tpl.map(t => /^[a-z]$/.test(t) ? map[t] : t);
    if (!evalTokens(tokens)) continue;
    // blanks: hide 2 (level<3) or 3 (level>=3) of the digit positions, never all
    const digitIdx = tokens.map((t, i) => typeof t === "number" ? i : -1).filter(i => i >= 0);
    const nBlanks = Math.min(level >= 3 ? 3 : 2, digitIdx.length - 1);
    const blanks = shuffle(digitIdx).slice(0, nBlanks).sort((x, y) => x - y);
    return { tokens, blanks };
  }
  return genDigit(Math.max(1, level - 1));
}

const DigitGame = {
  name: "Digit", maxLevel: 4,
  item(run) {
    const eq = genDigit(run.level);
    const t0 = Date.now();
    const shownDigits = new Set(eq.tokens.filter((t, i) =>
      typeof t === "number" && !eq.blanks.includes(i)));
    const used = new Set(shownDigits);
    const qStr = eq.tokens.map((t, i) => eq.blanks.includes(i) ? "_" : t).join("");
    const solution = eq.blanks.map(i => eq.tokens[i]).join("");

    let html = `<div class="equation">`;
    let group = "";
    const flush = () => { if (group) { html += `<div class="numgroup">${group}</div>`; group = ""; } };
    eq.tokens.forEach((t, i) => {
      if (typeof t === "number") {
        group += eq.blanks.includes(i)
          ? `<div class="dslot" data-i="${i}"></div>`
          : `<div class="dslot filled shown">${t}</div>`;
      } else { flush(); html += `<span>${t}</span>`; }
    });
    flush();
    html += `</div><div class="digitpad">` +
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d =>
        `<button data-d="${d}" ${shownDigits.has(d) ? "disabled" : ""}>${d}</button>`).join("") +
      `<button class="util" data-clear>Clear</button></div>
      <p class="small center">Each digit 1-9 at most once in the whole equation. Joined cells are one number.</p>`;
    $("arena").innerHTML = html;

    const slots = () => [...$("arena").querySelectorAll(".dslot[data-i]")];
    const mark = () => {
      slots().forEach(s => s.classList.remove("cur"));
      const nxt = slots().find(s => !s.textContent);
      if (nxt) nxt.classList.add("cur");
    };
    mark();

    const resolve = (ok, detail, msg) => {
      run.stopItemTimer();
      const given = slots().map(s => s.textContent || "_").join("");
      run.record({ question: qStr, expected: solution, given, correct: ok,
                   detail, ms: Date.now() - t0, points: run.level });
      run.feedback(msg, ok);
      run.next(ok ? 700 : 1500);
    };
    run.startItemTimer(run.level >= 3 ? 20 : 14, () => resolve(false, "timeout", "Time up"));

    $("arena").querySelectorAll("button[data-d]").forEach(b => b.onclick = () => {
      const d = Number(b.dataset.d);
      if (used.has(d)) return;
      const slot = slots().find(s => !s.textContent);
      if (!slot) return;
      slot.textContent = d;
      slot.classList.add("filled");
      used.add(d);
      b.disabled = true;
      mark();
      if (slots().every(s => s.textContent)) {
        const vals = eq.tokens.slice();
        slots().forEach(s => { vals[Number(s.dataset.i)] = Number(s.textContent); });
        const allDigits = vals.filter(v => typeof v === "number");
        if (new Set(allDigits).size !== allDigits.length)
          resolve(false, "repeated digit", "Wrong: a digit is used twice");
        else if (evalTokens(vals))
          resolve(true, "ok", "Correct");
        else
          resolve(false, "arithmetic", "Wrong: the arithmetic doesn't hold");
      }
    });
    $("arena").querySelector("[data-clear]").onclick = () => {
      slots().forEach(s => { s.textContent = ""; s.classList.remove("filled"); });
      used.clear();
      shownDigits.forEach(d => used.add(d));
      $("arena").querySelectorAll("button[data-d]").forEach(b => {
        b.disabled = shownDigits.has(Number(b.dataset.d));
      });
      mark();
    };
  },
};

// ================================================================== MEMORY
function memoryPositions(n, w, h, minDist) {
  const pts = [];
  let guard = 0;
  while (pts.length < n && guard++ < 4000) {
    const p = { x: 40 + rint(w - 80), y: 40 + rint(h - 80) };
    if (pts.every(q => Math.hypot(p.x - q.x, p.y - q.y) >= minDist)) pts.push(p);
  }
  return pts;
}
function patternGrid(rows, cols, fill = 0.45) {
  return [...Array(rows)].map(() => [...Array(cols)].map(() => Math.random() < fill));
}
const rot90 = g => g[0].map((_, c) => g.map(r => r[c]).reverse());
function gridHtml(g, cellCls = "mcell") {
  return `<div class="mgrid" style="grid-template-columns:repeat(${g[0].length},32px)">` +
    g.flat().map(on => `<div class="${cellCls} ${on ? "on" : ""}"></div>`).join("") + `</div>`;
}

const MemoryGame = {
  name: "Memory", maxLevel: 6,
  item(run) {
    const dots = run.level + 1;             // level 1 -> 2 dots ... level 6 -> 7
    const W = $("arena").clientWidth ? Math.min($("arena").clientWidth, 850) : 700;
    const H = 360;
    const seq = memoryPositions(dots, W, H, 85);
    const decoys = (() => {
      const all = seq.slice();
      const d = [];
      let guard = 0;
      while (d.length < dots && guard++ < 4000) {
        const p = { x: 40 + rint(W - 80), y: 40 + rint(H - 80) };
        if (all.concat(d).every(q => Math.hypot(p.x - q.x, p.y - q.y) >= 70)) d.push(p);
      }
      return d;
    })();
    let distractorScore = 0, distractorCount = 0;

    const showDot = i => {
      if (run.finished) return;
      $("arena").innerHTML = `<p class="small center">Memorize position ${i + 1} of ${dots}</p>
        <div class="canvas"><div class="dot show" style="left:${seq[i].x}px; top:${seq[i].y}px"></div></div>`;
      run.later(() => (i + 1 < dots ? distractor(() => showDot(i + 1)) : distractor(recall)), 1150);
    };

    const distractor = next => {
      if (run.finished) return;
      distractorCount++;
      const t0 = Date.now();
      if (Math.random() < 0.5) {
        // symmetry: mirrored 5x4 pattern, possibly broken
        const symmetric = Math.random() < 0.5;
        const half = patternGrid(5, 2);
        const full = half.map(r => [...r, ...r.slice().reverse()]);
        if (!symmetric) { const r = rint(5), c = rint(4); full[r][c] = !full[r][c]; }
        $("arena").innerHTML = `<p class="small center">Is this pattern symmetric about the vertical axis?</p>
          <div class="minigrids">${gridHtml(full)}</div>
          <div class="yn"><button data-yn="1">Yes</button><button data-yn="0">No</button></div>`;
        wireYN(symmetric, "symmetry", t0, next);
      } else {
        // rotation: right = left rotated 90° clockwise, or not
        const truth = Math.random() < 0.5;
        const left = patternGrid(3, 3);
        let right = rot90(left);
        if (!truth) { const r = rint(3), c = rint(3); right = right.map(row => row.slice()); right[r][c] = !right[r][c]; }
        $("arena").innerHTML = `<p class="small center">Is the right pattern the left one rotated 90&deg; clockwise?</p>
          <div class="minigrids">${gridHtml(left)}<span style="font-size:26px">&rarr;</span>${gridHtml(right)}</div>
          <div class="yn"><button data-yn="1">Yes</button><button data-yn="0">No</button></div>`;
        wireYN(truth, "rotation", t0, next);
      }
    };

    const wireYN = (truth, kind, t0, next) => {
      $("arena").querySelectorAll("[data-yn]").forEach(b => b.onclick = () => {
        const said = b.dataset.yn === "1";
        const ok = said === truth;
        if (ok) distractorScore++;
        run.record({ question: kind + " check", expected: truth, given: said,
                     correct: ok, detail: kind, ms: Date.now() - t0, points: 1 });
        next();
      });
    };

    const recall = () => {
      if (run.finished) return;
      const candidates = shuffle(seq.map((p, i) => ({ ...p, real: i }))
        .concat(decoys.map(p => ({ ...p, real: -1 }))));
      const picked = [];
      $("arena").innerHTML = `<p class="small center">Click the memorized positions in order (${dots})</p>
        <div class="canvas">${candidates.map((p, i) =>
          `<div class="dot pick" data-i="${i}" style="left:${p.x}px; top:${p.y}px"></div>`).join("")}</div>`;
      $("arena").querySelectorAll(".dot.pick").forEach(d => d.onclick = () => {
        if (d.classList.contains("picked")) return;
        d.classList.remove("pick");
        d.classList.add("picked");
        picked.push(candidates[Number(d.dataset.i)]);
        d.textContent = picked.length;
        if (picked.length === dots) {
          const ok = picked.every((p, i) => p.real === i);
          run.record({ question: `recall ${dots} positions`,
                       expected: "0.." + (dots - 1),
                       given: picked.map(p => p.real).join("-"),
                       correct: ok, detail: "recall", points: dots });
          run.feedback(ok ? "Correct sequence"
            : "Wrong: that wasn't the memorized order", ok);
          run.next(1400);
        }
      });
    };

    showDot(0);
  },
};

const GAMES = { switch: SwitchGame, digit: DigitGame, memory: MemoryGame };

// ------------------------------------------------------------------ reports
function statLine(s) {
  const acc = s.attempted ? Math.round(s.correct / s.attempted * 100) : 0;
  const avg = s.correct + (s.attempted - s.correct) ? (s.sumMs / Math.max(1, s.attempted) / 1000).toFixed(1) : "0";
  return `<tr><td>${s.name}</td><td>${s.attempted}</td><td>${s.correct}</td>
    <td>${acc}%</td><td>${s.maxLevel}</td><td>${avg}s</td><td><b>${s.points}</b></td></tr>`;
}
function reportTable(list) {
  return `<table class="report"><tr><th>Exercise</th><th>Answered</th><th>Correct</th>
    <th>Accuracy</th><th>Max level</th><th>Avg time</th><th>Points</th></tr>
    ${list.map(statLine).join("")}</table>`;
}
function showModuleReport(stats) {
  show("screen-report");
  $("report-card").innerHTML = `<h2>${stats.name}: done</h2>
    <div class="bigscore">${stats.points} points</div>
    ${reportTable([stats])}
    <button class="go" data-again="${stats.key}">Practice again</button>
    <button class="go" data-home style="background:#5a6b78">Home</button>`;
  wireReportButtons();
}
function showFullReport(list) {
  const total = list.reduce((a, s) => a + s.points, 0);
  show("screen-report");
  $("report-card").innerHTML = `<h2>Full Assessment: complete</h2>
    <div class="bigscore">${total} points</div>
    ${reportTable(list)}
    <p class="small">Difficulty in each exercise only ramps up, so a hard finish means a strong run.
    Compare points across attempts to track progress; the answer log holds every item.</p>
    <button class="go" data-home>Home</button>`;
  wireReportButtons();
}
function wireReportButtons() {
  const again = $("report-card").querySelector("[data-again]");
  if (again) again.onclick = () => startModule(again.dataset.again, "practice");
  $("report-card").querySelector("[data-home]").onclick = () => show("screen-home");
}

// ------------------------------------------------------------------ start
function startModule(key, mode, seconds, onFinish) {
  const dur = seconds || Number($("dur-" + key).value);
  new ModuleRunner(key, dur, mode,
    onFinish || (stats => showModuleReport(stats))).start();
}
document.querySelectorAll("[data-start]").forEach(b =>
  b.onclick = () => startModule(b.dataset.start, "practice"));

const FULL_SECONDS = { switch: 360, digit: 360, memory: 540 };
$("btn-full").onclick = () => {
  const order = $("full-order").value.split(",");
  const results = [];
  const runNext = i => {
    if (i >= order.length) { showFullReport(results); return; }
    $("mod-progress").textContent = `Exercise ${i + 1} of ${order.length}`;
    startModule(order[i], "full", FULL_SECONDS[order[i]], stats => {
      results.push(stats);
      runNext(i + 1);
    });
  };
  runNext(0);
};
