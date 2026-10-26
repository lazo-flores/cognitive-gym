# Cognitive Gym

Free, browser-based practice for gamified cognitive assessments: deductive-logic
switch puzzles, timed mental-arithmetic digit puzzles, and dual-task spatial
memory exercises.

**Practice here: https://www.joselazoflores.com/cognitive-gym/**

Many employers screen candidates with short, game-like cognitive tests. The
formats are learnable, but most practice material sits behind paywalls, and
first-time exposure to the mechanics is what costs strong candidates the most.
Cognitive Gym gives you unlimited, free practice with the three most common
mechanics, timed like the real thing.

## The exercises

- **Switch**: deduce the position code that transforms one row of symbols into
  another, including multi-layer chains at higher difficulty.
- **Digit**: place digits into equations under time pressure, from simple
  addition up to mixed operations. Each digit can be used only once.
- **Memory** (freeform): memorize sequences of circle positions while solving
  interleaved symmetry and rotation tasks, then click the positions back in
  order.

Each exercise runs on a fixed countdown, difficulty only ramps upward, and you
get a scorecard at the end. A Full Assessment mode runs all three back to back,
in the order you choose, with a combined report.

## Run it locally

Cognitive Gym is three static files with no dependencies, no build step and no
backend, so it runs on Windows, macOS, Linux, or anything else with a current
browser. Clone it and pick whichever option below is easiest for you.

```sh
git clone https://github.com/lazo-flores/cognitive-gym.git
cd cognitive-gym
```

**Option 1 — just open the file.** Double-click `index.html`, or drag it onto a
browser window. Nothing to install, and every exercise works. Tested this way in
Chrome; Chromium-based browsers (Chrome, Edge, Brave) and Firefox all allow a
`file://` page to keep its practice log. Safari is stricter about local files, and
if a browser does block storage on a `file://` page the exercises still run — only
the saved log is lost. Option 2 avoids the question entirely.

**Option 2 — serve it on a local port.** Any static server works; all of these
serve the current directory, then you open <http://localhost:8000>.

```sh
python3 -m http.server 8000      # Python 3 — preinstalled on macOS and most Linux
npx serve .                      # Node.js
php -S localhost:8000            # PHP
ruby -run -e httpd . -p 8000     # Ruby
```

On Windows, run the same commands from PowerShell (use `py -m http.server 8000`
if `python3` is not on your `PATH`).

**Option 3 — skip the clone.** The hosted copy is always current:
<https://www.joselazoflores.com/cognitive-gym/>

### Requirements

Any browser released from roughly 2021 onward: Chrome/Edge 90+, Firefox 90+, or
Safari 15+. There is no mobile app, but the layout adapts down to phone widths.
No network access is needed after the first load.

### Hosting your own copy

Because it is fully static, the folder can be dropped on any static host
(GitHub Pages, Netlify, Cloudflare Pages, S3, or a plain nginx directory) with
no configuration. The page needs no inline scripts and never calls `eval`, so it
also runs unchanged under a strict `Content-Security-Policy`.

## Privacy

Everything runs in your browser. No accounts, no server, no analytics. Your
practice log is stored locally (downloadable as CSV/JSON) and never leaves
your machine.

## Project layout

```
index.html   screens and markup
app.js       exercise generators, countdown clock, scoring, answer log
style.css    all styling (no framework)
```

Each exercise is an object with a `name` and an `item(run)` method in `app.js`,
registered in `GAMES`; `ModuleRunner` drives one against a countdown and
collects the stats. Adding an exercise means writing one more such object.

## Disclaimer

Cognitive Gym is an independent practice tool with original exercise content.
It is not affiliated with, endorsed by, or derived from any assessment vendor
or employer. Formats are inspired by publicly known styles of gamified
cognitive testing; any resemblance to specific commercial tests is limited to
the general mechanics, which are not proprietary.

## License

MIT. Built by [Jose Lazo-Flores](https://www.joselazoflores.com).
