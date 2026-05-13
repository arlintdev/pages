// Curated visual styles for the MCP `list_styles` tool.
//
// Each entry describes a distinct design language. Agents (or humans)
// pick one by name, copy the starter_html as a baseline, and fill in the
// CONTENT block. The example_html is a worked example showing the look
// applied to a realistic page — agents can also pattern-match against
// that when generating fresh markup.
//
// Adding a new style: just add an entry. Keep example_html under ~100
// lines so the list response stays cheap to ship.

export type Style = {
  /** Short slug used as the `name` argument to list_styles. */
  name: string
  /** One-line summary for the agent's first-glance scan. */
  summary: string
  /** When the agent should reach for this style. */
  when_to_use: string
  /** Self-contained HTML demonstrating the style on a realistic page. */
  example_html: string
  /** A minimal shell agents can use as a starting point. The literal
   *  string `<!-- CONTENT -->` is the slot to replace. */
  starter_html: string
}

// ---------- 1. Nothing ----------

const NOTHING_EXAMPLE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Battery — 87%</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Doto:wght@400;700&family=Space+Grotesk:wght@300;400;500&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --black: #000;
      --surface: #111;
      --border: #222;
      --text-display: #fff;
      --text-primary: #e8e8e8;
      --text-secondary: #999;
      --text-disabled: #666;
      --accent: #d71921;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--black);
      color: var(--text-primary);
      font-family: "Space Grotesk", system-ui, sans-serif;
      min-height: 100vh;
      padding: 64px 32px;
      background-image:
        radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0);
      background-size: 24px 24px;
    }
    .grid {
      max-width: 920px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 64px;
    }
    .label {
      font-family: "Space Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-secondary);
      margin-bottom: 12px;
    }
    .display {
      font-family: "Doto", "Space Mono", monospace;
      font-size: 96px;
      line-height: 1;
      letter-spacing: -0.03em;
      color: var(--text-display);
      font-weight: 700;
    }
    .display sup {
      font-family: "Space Mono", monospace;
      font-size: 16px;
      vertical-align: super;
      color: var(--text-secondary);
      margin-left: 4px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
      font-family: "Space Mono", monospace;
      font-size: 13px;
    }
    .row span:last-child { color: var(--text-display); }
    .pulse {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent);
      margin-right: 8px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  </style>
</head>
<body>
  <div class="grid">
    <section>
      <div class="label">Charge</div>
      <div class="display">87<sup>%</sup></div>
    </section>
    <section>
      <div class="label"><span class="pulse"></span>Status</div>
      <div class="row"><span>Cycles</span><span>284</span></div>
      <div class="row"><span>Health</span><span>92%</span></div>
      <div class="row"><span>Voltage</span><span>3.91V</span></div>
      <div class="row"><span>Temp</span><span>34°C</span></div>
    </section>
  </div>
</body>
</html>`

const NOTHING_STARTER = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Untitled</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Doto:wght@400;700&family=Space+Grotesk:wght@300;400;500&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --black: #000; --surface: #111; --border: #222;
      --text-display: #fff; --text-primary: #e8e8e8;
      --text-secondary: #999; --text-disabled: #666; --accent: #d71921;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--black); color: var(--text-primary);
      font-family: "Space Grotesk", system-ui, sans-serif;
      min-height: 100vh; padding: 64px 32px;
      background-image: radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0);
      background-size: 24px 24px;
    }
    .container { max-width: 920px; margin: 0 auto; }
    .label {
      font-family: "Space Mono", monospace; font-size: 11px;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--text-secondary); margin-bottom: 12px;
    }
    .display {
      font-family: "Doto", "Space Mono", monospace;
      font-size: 72px; line-height: 1; letter-spacing: -0.03em;
      color: var(--text-display); font-weight: 700; margin-bottom: 32px;
    }
    h1, h2, h3 { color: var(--text-display); font-weight: 500; margin-bottom: 16px; }
    h1 { font-size: 36px; letter-spacing: -0.02em; }
    h2 { font-size: 24px; }
    p { color: var(--text-primary); line-height: 1.6; margin-bottom: 16px; }
    .mono { font-family: "Space Mono", monospace; font-size: 13px; color: var(--text-secondary); }
  </style>
</head>
<body>
  <div class="container">
    <!-- CONTENT -->
  </div>
</body>
</html>`

// ---------- 2. Editorial ----------

const EDITORIAL_EXAMPLE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>The Quiet Walk Home</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,700&family=Inter:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #fbfaf6; --ink: #1a1814; --muted: #6b6760; --rule: #d9d4c7; --accent: #8a1f1f;
    }
    * { box-sizing: border-box; }
    body {
      background: var(--bg); color: var(--ink); margin: 0;
      font-family: "Fraunces", Georgia, serif;
      font-optical-sizing: auto; font-size: 19px; line-height: 1.7;
    }
    .article { max-width: 38rem; margin: 0 auto; padding: 6rem 1.5rem 8rem; }
    .kicker {
      font-family: "Inter", sans-serif; font-size: 12px; font-weight: 500;
      letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent);
      margin-bottom: 1.5rem;
    }
    h1 {
      font-family: "Fraunces", serif; font-weight: 300;
      font-size: clamp(2.5rem, 5vw, 4rem); line-height: 1.05;
      letter-spacing: -0.02em; margin: 0 0 1.25rem;
    }
    .byline {
      font-family: "Inter", sans-serif; font-size: 13px; color: var(--muted);
      padding-bottom: 2rem; border-bottom: 1px solid var(--rule); margin-bottom: 2.5rem;
    }
    p { margin: 0 0 1.25rem; }
    p:first-of-type::first-letter {
      font-weight: 700; font-size: 4.2rem; line-height: 1;
      float: left; padding: 0.4rem 0.6rem 0 0; color: var(--accent);
    }
    blockquote {
      font-style: italic; font-size: 1.2em; line-height: 1.6;
      border-left: 2px solid var(--accent); padding-left: 1.25rem;
      margin: 2rem 0; color: var(--ink);
    }
    em { font-style: italic; }
  </style>
</head>
<body>
  <article class="article">
    <div class="kicker">Field Notes · Issue 14</div>
    <h1>The quiet walk home</h1>
    <div class="byline">By a wanderer · Six minute read · November 2026</div>
    <p>There is a particular hour of evening that exists only on the long walk back from somewhere unimportant. The sky thickens to a slow blue; the lights along the street come on one at a time, never all together, as if conferring about it first.</p>
    <p>On those walks the mind does its best work, or its truest. I walked home tonight and found a sentence I had been chasing for weeks lying in the gutter, the way you sometimes find a coin.</p>
    <blockquote>The road home is the same road as the road away — only the direction of attention has changed.</blockquote>
    <p>I picked it up. I kept walking.</p>
  </article>
</body>
</html>`

const EDITORIAL_STARTER = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Untitled</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,700&family=Inter:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    :root { --bg: #fbfaf6; --ink: #1a1814; --muted: #6b6760; --rule: #d9d4c7; --accent: #8a1f1f; }
    * { box-sizing: border-box; }
    body { background: var(--bg); color: var(--ink); margin: 0;
      font-family: "Fraunces", Georgia, serif; font-size: 19px; line-height: 1.7; }
    .article { max-width: 38rem; margin: 0 auto; padding: 6rem 1.5rem 8rem; }
    h1 { font-weight: 300; font-size: clamp(2.5rem, 5vw, 4rem); line-height: 1.05;
      letter-spacing: -0.02em; margin: 0 0 1.25rem; }
    h2 { font-weight: 400; font-size: 1.6rem; margin: 3rem 0 1rem; }
    p { margin: 0 0 1.25rem; }
    a { color: var(--accent); }
    blockquote { font-style: italic; font-size: 1.2em; border-left: 2px solid var(--accent);
      padding-left: 1.25rem; margin: 2rem 0; }
  </style>
</head>
<body>
  <article class="article">
    <!-- CONTENT -->
  </article>
</body>
</html>`

// ---------- 3. Terminal ----------

const TERMINAL_EXAMPLE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>system.status</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
  <style>
    body {
      margin: 0; background: #0a0e0a; color: #7fff7f;
      font-family: "JetBrains Mono", "SF Mono", Menlo, monospace;
      font-size: 14px; line-height: 1.5; padding: 32px;
      text-shadow: 0 0 4px rgba(127, 255, 127, 0.4);
    }
    body::before {
      content: ""; position: fixed; inset: 0; pointer-events: none;
      background: repeating-linear-gradient(
        to bottom, transparent 0, transparent 2px,
        rgba(0, 0, 0, 0.18) 3px, rgba(0, 0, 0, 0.18) 3px
      );
    }
    pre { margin: 0; white-space: pre-wrap; }
    .dim { color: #4a8a4a; }
    .accent { color: #ffea7f; text-shadow: 0 0 4px rgba(255, 234, 127, 0.4); }
    .danger { color: #ff7f7f; text-shadow: 0 0 4px rgba(255, 127, 127, 0.4); }
    .prompt::before { content: "$ "; color: #4a8a4a; }
    .blink { animation: blink 1.1s steps(2, start) infinite; }
    @keyframes blink { to { visibility: hidden; } }
  </style>
</head>
<body>
<pre>
<span class="dim">// SYSTEM CHECK · 2026-05-13 14:22:08 UTC</span>

<span class="prompt">uptime</span>
17 days, 4:21
<span class="prompt">whoami</span>
operator

<span class="prompt">df -h /</span>
Filesystem    Size  Used  Avail  Use%
/dev/sda1     460G  221G   216G  <span class="accent">51%</span>

<span class="prompt">systemctl status core</span>
   <span class="accent">●</span> core.service - main loop
     Loaded:  loaded
     Active:  <span class="accent">active (running)</span>
     Memory:  1.2G
     CPU:     <span class="accent">14.2%</span>

<span class="prompt">tail -n 3 /var/log/sys.log</span>
[14:21:50] handshake ok      <span class="dim">peer=01</span>
[14:21:52] handshake ok      <span class="dim">peer=02</span>
[14:21:55] <span class="danger">latency spike 412ms</span> <span class="dim">peer=02</span>

<span class="prompt"><span class="blink">_</span></span>
</pre>
</body>
</html>`

const TERMINAL_STARTER = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Untitled</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
  <style>
    body { margin: 0; background: #0a0e0a; color: #7fff7f;
      font-family: "JetBrains Mono", monospace; font-size: 14px;
      line-height: 1.5; padding: 32px;
      text-shadow: 0 0 4px rgba(127, 255, 127, 0.4); }
    body::before { content: ""; position: fixed; inset: 0; pointer-events: none;
      background: repeating-linear-gradient(to bottom, transparent 0, transparent 2px,
        rgba(0,0,0,0.18) 3px, rgba(0,0,0,0.18) 3px); }
    pre { margin: 0; white-space: pre-wrap; }
    .dim { color: #4a8a4a; }
    .accent { color: #ffea7f; }
    .danger { color: #ff7f7f; }
    .prompt::before { content: "$ "; color: #4a8a4a; }
  </style>
</head>
<body>
<pre>
<!-- CONTENT -->
</pre>
</body>
</html>`

// ---------- 4. Notebook ----------

const NOTEBOOK_EXAMPLE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Tuesday — Notes</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Kalam:wght@400;700&display=swap" rel="stylesheet" />
  <style>
    body {
      margin: 0; min-height: 100vh; padding: 48px 16px;
      background: #fbf6ea; color: #2b2618;
      font-family: "Kalam", "Comic Sans MS", cursive;
      background-image:
        linear-gradient(to bottom, transparent 0, transparent 38px, #d9c8a0 38px, #d9c8a0 39px, transparent 39px),
        linear-gradient(to right, transparent 0, transparent 56px, #c87171 56px, #c87171 57px, transparent 57px);
      background-size: 100% 40px, 100% 100%;
    }
    .page {
      max-width: 640px; margin: 0 auto; padding: 32px 32px 32px 88px;
      position: relative;
    }
    h1 {
      font-family: "Caveat", cursive; font-weight: 700;
      font-size: 3rem; margin: 0 0 1rem; line-height: 1.1;
      transform: rotate(-1.2deg);
    }
    .date {
      font-family: "Caveat", cursive; font-size: 1.4rem; color: #8a7a4a;
      margin-bottom: 2rem; transform: rotate(0.5deg);
    }
    h2 { font-family: "Caveat", cursive; font-size: 1.8rem; margin: 1.5rem 0 0.5rem;
      text-decoration: underline; text-decoration-style: wavy; text-decoration-color: #c87171; }
    p { font-size: 18px; line-height: 40px; margin: 0; }
    ul { padding-left: 1.5rem; }
    li { line-height: 40px; margin: 0; }
    li::marker { color: #c87171; content: "→ "; }
    .doodle {
      display: inline-block; padding: 2px 8px;
      border: 2px solid #2b2618; border-radius: 18px;
      transform: rotate(-2deg); margin: 0 2px;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="date">Tuesday, May 12 — 9:41am</div>
    <h1>Today's three things</h1>
    <ul>
      <li>Fix the <span class="doodle">latency bug</span> in the worker</li>
      <li>Call Sam about the lease</li>
      <li>Walk before 5pm — no excuses</li>
    </ul>
    <h2>Random</h2>
    <p>Tea is better than coffee in the morning if it's cold outside. Coffee wins everywhere else. This is settled.</p>
  </div>
</body>
</html>`

const NOTEBOOK_STARTER = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Untitled</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Kalam:wght@400;700&display=swap" rel="stylesheet" />
  <style>
    body { margin: 0; min-height: 100vh; padding: 48px 16px;
      background: #fbf6ea; color: #2b2618;
      font-family: "Kalam", cursive;
      background-image:
        linear-gradient(to bottom, transparent 0, transparent 38px, #d9c8a0 38px, #d9c8a0 39px, transparent 39px),
        linear-gradient(to right, transparent 0, transparent 56px, #c87171 56px, #c87171 57px, transparent 57px);
      background-size: 100% 40px, 100% 100%; }
    .page { max-width: 640px; margin: 0 auto; padding: 32px 32px 32px 88px; }
    h1 { font-family: "Caveat", cursive; font-weight: 700; font-size: 3rem;
      margin: 0 0 1rem; line-height: 1.1; transform: rotate(-1.2deg); }
    h2 { font-family: "Caveat", cursive; font-size: 1.8rem; margin: 1.5rem 0 0.5rem;
      text-decoration: underline wavy #c87171; }
    p, li { font-size: 18px; line-height: 40px; margin: 0; }
    ul { padding-left: 1.5rem; }
    li::marker { color: #c87171; content: "→ "; }
  </style>
</head>
<body>
  <div class="page">
    <!-- CONTENT -->
  </div>
</body>
</html>`

// ---------- 5. Minimal ----------

const MINIMAL_EXAMPLE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Aria — Field Recordings</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root { --bg: #fafaf9; --ink: #0c0a09; --muted: #57534e; --rule: #e7e5e4; --accent: #0c0a09; }
    * { box-sizing: border-box; }
    body {
      margin: 0; background: var(--bg); color: var(--ink);
      font-family: "Inter", system-ui, -apple-system, sans-serif;
      font-size: 16px; line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    .wrap { max-width: 720px; margin: 0 auto; padding: 6rem 1.5rem 4rem; }
    .nav { font-size: 13px; color: var(--muted); display: flex; gap: 1.5rem; margin-bottom: 5rem; }
    .nav a { color: var(--muted); text-decoration: none; }
    .nav a:hover { color: var(--ink); }
    .nav .me { color: var(--ink); font-weight: 500; }
    h1 { font-size: 2.5rem; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 1rem; line-height: 1.1; }
    .lede { font-size: 1.125rem; color: var(--muted); max-width: 36rem; margin: 0 0 3rem; }
    h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em;
      color: var(--muted); margin: 3rem 0 1rem; font-weight: 500; }
    .row { display: flex; justify-content: space-between; align-items: baseline;
      padding: 0.75rem 0; border-bottom: 1px solid var(--rule); }
    .row .title { font-weight: 500; }
    .row .meta { font-size: 13px; color: var(--muted); }
    a.cta {
      display: inline-block; margin-top: 2rem; padding: 0.625rem 1rem;
      background: var(--ink); color: var(--bg);
      text-decoration: none; font-size: 14px; font-weight: 500;
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <nav class="nav">
      <a href="#" class="me">Recordings</a>
      <a href="#">About</a>
      <a href="#">Contact</a>
    </nav>
    <h1>Field Recordings</h1>
    <p class="lede">Ambient and field recordings collected over six years across four continents. Slow, attentive listening.</p>
    <h2>Recent</h2>
    <div class="row"><span class="title">Coast, after rain</span><span class="meta">14:02 · Lisbon, 2025</span></div>
    <div class="row"><span class="title">Train station, off-peak</span><span class="meta">8:47 · Tokyo, 2024</span></div>
    <div class="row"><span class="title">Wind through pine</span><span class="meta">11:18 · Sierra Nevada, 2024</span></div>
    <a class="cta" href="#">Subscribe to new recordings</a>
  </div>
</body>
</html>`

const MINIMAL_STARTER = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Untitled</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root { --bg: #fafaf9; --ink: #0c0a09; --muted: #57534e; --rule: #e7e5e4; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink);
      font-family: "Inter", system-ui, sans-serif; font-size: 16px; line-height: 1.6;
      -webkit-font-smoothing: antialiased; }
    .wrap { max-width: 720px; margin: 0 auto; padding: 6rem 1.5rem 4rem; }
    h1 { font-size: 2.5rem; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 1rem; line-height: 1.1; }
    h2 { font-size: 1.25rem; font-weight: 600; margin: 2.5rem 0 1rem; }
    p { margin: 0 0 1rem; color: var(--ink); }
    .muted { color: var(--muted); }
    a { color: var(--ink); }
  </style>
</head>
<body>
  <div class="wrap">
    <!-- CONTENT -->
  </div>
</body>
</html>`

// ---------- 6. Slides ----------
//
// Vanilla-JS presentation deck. No build step, no framework — each slide
// is a <section class="slide">, navigation by arrow keys, click, or
// swipe. F toggles fullscreen. The starter is intentionally a few slides
// so agents see the pattern and can extend it.

const SLIDES_EXAMPLE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>The Future of Pages</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&display=swap" rel="stylesheet" />
  <style>
    :root { --bg: #0a0a0f; --ink: #f5f5f7; --muted: #8a8a93; --accent: #7c5cff; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      background: var(--bg); color: var(--ink);
      font-family: "Inter", system-ui, sans-serif;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
    }
    .deck { position: relative; width: 100vw; height: 100vh; }
    .slide {
      position: absolute; inset: 0; padding: 8vh 10vw;
      display: flex; flex-direction: column; justify-content: center;
      opacity: 0; pointer-events: none;
      transition: opacity 0.4s ease;
    }
    .slide.active { opacity: 1; pointer-events: auto; }
    .slide .eyebrow {
      font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase;
      color: var(--accent); margin-bottom: 24px; font-weight: 500;
    }
    .slide h1 {
      font-size: clamp(2.5rem, 7vw, 6rem); font-weight: 900;
      line-height: 1.05; letter-spacing: -0.03em; margin-bottom: 24px;
    }
    .slide h2 {
      font-size: clamp(1.8rem, 4vw, 3.2rem); font-weight: 700;
      line-height: 1.1; letter-spacing: -0.02em; margin-bottom: 16px;
    }
    .slide p { font-size: clamp(1rem, 1.6vw, 1.4rem); color: var(--muted); max-width: 60ch; line-height: 1.5; }
    .slide ul { list-style: none; padding: 0; margin-top: 24px; }
    .slide ul li {
      font-size: clamp(1.1rem, 1.8vw, 1.5rem); line-height: 1.7;
      padding-left: 28px; position: relative;
    }
    .slide ul li::before {
      content: "→"; position: absolute; left: 0; color: var(--accent);
    }
    .stat {
      font-size: clamp(5rem, 14vw, 12rem); font-weight: 900;
      line-height: 1; color: var(--accent); letter-spacing: -0.04em;
    }
    .chrome {
      position: fixed; bottom: 24px; left: 0; right: 0;
      display: flex; justify-content: space-between; align-items: center;
      padding: 0 32px; font-size: 12px; color: var(--muted);
      letter-spacing: 0.08em; text-transform: uppercase;
    }
    .progress {
      position: fixed; top: 0; left: 0; height: 2px;
      background: var(--accent); transition: width 0.3s ease;
    }
    .hint {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      font-size: 11px; letter-spacing: 0.1em; color: var(--muted);
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="progress" id="progress"></div>
  <div class="deck" id="deck">
    <section class="slide active">
      <div class="eyebrow">Keynote · 2026</div>
      <h1>The Future of Pages</h1>
      <p>A short walk through where this is going.</p>
    </section>
    <section class="slide">
      <div class="eyebrow">Chapter 01</div>
      <h2>Why now?</h2>
      <ul>
        <li>Authoring is moving from files to conversations</li>
        <li>Every URL deserves a thumbnail</li>
        <li>Sharing should be one click</li>
      </ul>
    </section>
    <section class="slide" style="text-align: center; align-items: center;">
      <div class="stat">10×</div>
      <p style="text-align: center; margin-top: 24px;">faster from idea to live URL</p>
    </section>
    <section class="slide">
      <h2>What's next</h2>
      <p>Live collaboration. Inline AI edits. A real publish target.</p>
    </section>
    <section class="slide" style="align-items: center; text-align: center;">
      <h1 style="font-size: clamp(3rem, 8vw, 7rem);">Thank you</h1>
      <p>Questions?</p>
    </section>
  </div>
  <div class="chrome">
    <span>The Future of Pages</span>
    <span><span id="i">1</span> / <span id="n">5</span></span>
  </div>
  <div class="hint">← → to navigate · F for fullscreen</div>
  <script>
    (function () {
      const slides = [...document.querySelectorAll('.slide')];
      const progress = document.getElementById('progress');
      const cur = document.getElementById('i');
      const tot = document.getElementById('n');
      let idx = 0;
      tot.textContent = slides.length;
      function go(n) {
        idx = Math.max(0, Math.min(slides.length - 1, n));
        slides.forEach((s, i) => s.classList.toggle('active', i === idx));
        cur.textContent = idx + 1;
        progress.style.width = ((idx + 1) / slides.length * 100) + '%';
      }
      document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(idx + 1); }
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(idx - 1); }
        if (e.key === 'Home') go(0);
        if (e.key === 'End') go(slides.length - 1);
        if (e.key.toLowerCase() === 'f') {
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen();
        }
      });
      document.addEventListener('click', (e) => {
        if (e.target.closest('a, button, input, textarea')) return;
        go(idx + 1);
      });
      let touchX = null;
      document.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; });
      document.addEventListener('touchend', (e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 50) go(idx + (dx < 0 ? 1 : -1));
        touchX = null;
      });
      go(0);
    })();
  </script>
</body>
</html>`

const SLIDES_STARTER = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Untitled deck</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&display=swap" rel="stylesheet" />
  <style>
    :root { --bg: #0a0a0f; --ink: #f5f5f7; --muted: #8a8a93; --accent: #7c5cff; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body { background: var(--bg); color: var(--ink);
      font-family: "Inter", system-ui, sans-serif; overflow: hidden;
      -webkit-font-smoothing: antialiased; }
    .deck { position: relative; width: 100vw; height: 100vh; }
    .slide { position: absolute; inset: 0; padding: 8vh 10vw;
      display: flex; flex-direction: column; justify-content: center;
      opacity: 0; pointer-events: none; transition: opacity 0.4s ease; }
    .slide.active { opacity: 1; pointer-events: auto; }
    .slide .eyebrow { font-size: 13px; letter-spacing: 0.18em;
      text-transform: uppercase; color: var(--accent); margin-bottom: 24px; font-weight: 500; }
    .slide h1 { font-size: clamp(2.5rem, 7vw, 6rem); font-weight: 900;
      line-height: 1.05; letter-spacing: -0.03em; margin-bottom: 24px; }
    .slide h2 { font-size: clamp(1.8rem, 4vw, 3.2rem); font-weight: 700;
      line-height: 1.1; margin-bottom: 16px; }
    .slide p { font-size: clamp(1rem, 1.6vw, 1.4rem); color: var(--muted);
      max-width: 60ch; line-height: 1.5; }
    .slide ul { list-style: none; padding: 0; margin-top: 24px; }
    .slide ul li { font-size: clamp(1.1rem, 1.8vw, 1.5rem); line-height: 1.7;
      padding-left: 28px; position: relative; }
    .slide ul li::before { content: "→"; position: absolute; left: 0; color: var(--accent); }
    .stat { font-size: clamp(5rem, 14vw, 12rem); font-weight: 900;
      line-height: 1; color: var(--accent); letter-spacing: -0.04em; }
    .chrome { position: fixed; bottom: 24px; left: 0; right: 0;
      display: flex; justify-content: space-between; align-items: center;
      padding: 0 32px; font-size: 12px; color: var(--muted);
      letter-spacing: 0.08em; text-transform: uppercase; }
    .progress { position: fixed; top: 0; left: 0; height: 2px;
      background: var(--accent); transition: width 0.3s ease; }
  </style>
</head>
<body>
  <div class="progress" id="progress"></div>
  <div class="deck" id="deck">
    <!-- Add as many <section class="slide"> blocks as you want.
         The first one starts visible (class="active"). -->
    <section class="slide active">
      <div class="eyebrow">Section</div>
      <h1>Title slide</h1>
      <p>Subtitle here.</p>
    </section>
    <!-- CONTENT -->
  </div>
  <div class="chrome">
    <span>Deck title</span>
    <span><span id="i">1</span> / <span id="n">1</span></span>
  </div>
  <script>
    (function () {
      const slides = [...document.querySelectorAll('.slide')];
      const progress = document.getElementById('progress');
      const cur = document.getElementById('i');
      const tot = document.getElementById('n');
      let idx = 0;
      tot.textContent = slides.length;
      function go(n) {
        idx = Math.max(0, Math.min(slides.length - 1, n));
        slides.forEach((s, i) => s.classList.toggle('active', i === idx));
        cur.textContent = idx + 1;
        progress.style.width = ((idx + 1) / slides.length * 100) + '%';
      }
      document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(idx + 1); }
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(idx - 1); }
        if (e.key === 'Home') go(0);
        if (e.key === 'End') go(slides.length - 1);
        if (e.key.toLowerCase() === 'f') {
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen();
        }
      });
      document.addEventListener('click', (e) => {
        if (e.target.closest('a, button, input, textarea')) return;
        go(idx + 1);
      });
      go(0);
    })();
  </script>
</body>
</html>`

// ---------- 7. Landing ----------

const LANDING_EXAMPLE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Cadence — invoices that pay themselves</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #ffffff; --ink: #0a0a0a; --muted: #525252;
      --rule: #e5e5e5; --accent: #0a0a0a; --tint: #f5f5f5;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; background: var(--bg); color: var(--ink);
      font-family: "Inter", system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .nav {
      max-width: 1120px; margin: 0 auto; padding: 1.5rem 1.5rem;
      display: flex; justify-content: space-between; align-items: center;
    }
    .nav .brand { font-weight: 700; font-size: 1rem; }
    .nav ul { list-style: none; display: flex; gap: 2rem; margin: 0; padding: 0; font-size: 14px; }
    .nav a { color: var(--muted); text-decoration: none; }
    .nav a:hover { color: var(--ink); }
    .hero { max-width: 1120px; margin: 0 auto; padding: 6rem 1.5rem 4rem; text-align: center; }
    .badge {
      display: inline-block; padding: 6px 12px;
      background: var(--tint); border-radius: 999px;
      font-size: 12px; font-weight: 500; margin-bottom: 1.5rem;
    }
    h1 {
      font-size: clamp(2.5rem, 5.5vw, 4.5rem); font-weight: 800;
      letter-spacing: -0.03em; line-height: 1.05; margin: 0 0 1.25rem;
      max-width: 16ch; margin-inline: auto;
    }
    .lede {
      font-size: 1.25rem; color: var(--muted); max-width: 38rem;
      margin: 0 auto 2rem; line-height: 1.5;
    }
    .ctas { display: flex; gap: 12px; justify-content: center; }
    .btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 12px 22px; border-radius: 8px; font-size: 15px;
      font-weight: 500; text-decoration: none; transition: opacity 0.2s;
    }
    .btn-primary { background: var(--ink); color: var(--bg); }
    .btn-primary:hover { opacity: 0.85; }
    .btn-ghost { color: var(--ink); border: 1px solid var(--rule); }
    .btn-ghost:hover { background: var(--tint); }
    .features {
      max-width: 1120px; margin: 0 auto; padding: 4rem 1.5rem 8rem;
      display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px;
    }
    .feature { padding: 28px; border: 1px solid var(--rule); border-radius: 12px; }
    .feature .ic {
      width: 32px; height: 32px; background: var(--tint);
      border-radius: 8px; display: grid; place-items: center;
      margin-bottom: 18px; font-size: 16px;
    }
    .feature h3 { font-size: 17px; font-weight: 600; margin: 0 0 6px; }
    .feature p { font-size: 14px; color: var(--muted); line-height: 1.55; margin: 0; }
  </style>
</head>
<body>
  <header class="nav">
    <div class="brand">Cadence</div>
    <ul>
      <li><a href="#">Product</a></li>
      <li><a href="#">Pricing</a></li>
      <li><a href="#">Docs</a></li>
      <li><a href="#">Sign in</a></li>
    </ul>
  </header>
  <section class="hero">
    <div class="badge">Now with auto-reconciliation</div>
    <h1>Invoices that pay themselves.</h1>
    <p class="lede">
      Cadence sends, chases, and reconciles every invoice for your business —
      so you can stop chasing and start building.
    </p>
    <div class="ctas">
      <a class="btn btn-primary" href="#">Start free →</a>
      <a class="btn btn-ghost" href="#">See a demo</a>
    </div>
  </section>
  <section class="features">
    <div class="feature">
      <div class="ic">⚡</div>
      <h3>Send in seconds</h3>
      <p>From quote to invoice in one keystroke. No spreadsheet roundtrips.</p>
    </div>
    <div class="feature">
      <div class="ic">🔁</div>
      <h3>Polite, persistent chasing</h3>
      <p>We follow up so you don't have to. Tone-matched to your brand.</p>
    </div>
    <div class="feature">
      <div class="ic">📊</div>
      <h3>Reconciles on the fly</h3>
      <p>Bank feeds in. Books up to date. Always.</p>
    </div>
  </section>
</body>
</html>`

const LANDING_STARTER = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Untitled</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root { --bg: #ffffff; --ink: #0a0a0a; --muted: #525252;
      --rule: #e5e5e5; --tint: #f5f5f5; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink);
      font-family: "Inter", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
    .nav { max-width: 1120px; margin: 0 auto; padding: 1.5rem;
      display: flex; justify-content: space-between; align-items: center; }
    .hero { max-width: 1120px; margin: 0 auto; padding: 6rem 1.5rem 4rem; text-align: center; }
    h1 { font-size: clamp(2.5rem, 5.5vw, 4.5rem); font-weight: 800;
      letter-spacing: -0.03em; line-height: 1.05; margin: 0 0 1.25rem; max-width: 16ch; margin-inline: auto; }
    .lede { font-size: 1.25rem; color: var(--muted); max-width: 38rem;
      margin: 0 auto 2rem; line-height: 1.5; }
    .ctas { display: flex; gap: 12px; justify-content: center; }
    .btn { display: inline-flex; align-items: center; gap: 8px;
      padding: 12px 22px; border-radius: 8px; font-size: 15px; font-weight: 500; text-decoration: none; }
    .btn-primary { background: var(--ink); color: var(--bg); }
    .btn-ghost { color: var(--ink); border: 1px solid var(--rule); }
    .features { max-width: 1120px; margin: 0 auto; padding: 4rem 1.5rem 8rem;
      display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; }
    .feature { padding: 28px; border: 1px solid var(--rule); border-radius: 12px; }
    .feature h3 { font-size: 17px; font-weight: 600; margin: 0 0 6px; }
    .feature p { font-size: 14px; color: var(--muted); line-height: 1.55; margin: 0; }
  </style>
</head>
<body>
  <!-- CONTENT -->
</body>
</html>`

// ---------- 8. Docs ----------

const DOCS_EXAMPLE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>API · pages.arlint.dev</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #ffffff; --side: #fafafa; --ink: #1a1a1a; --muted: #6b7280;
      --rule: #e5e7eb; --code-bg: #f6f8fa; --accent: #2563eb;
      --kw: #d73a49; --str: #032f62; --com: #6a737d; --num: #005cc5;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink);
      font-family: "Inter", system-ui, sans-serif; line-height: 1.6;
      -webkit-font-smoothing: antialiased; display: grid;
      grid-template-columns: 240px 1fr 220px; min-height: 100vh; }
    aside.toc-left { background: var(--side); border-right: 1px solid var(--rule);
      padding: 32px 24px; font-size: 14px; }
    aside.toc-left h4 { margin: 0 0 12px; font-size: 12px;
      text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    aside.toc-left ul { list-style: none; padding: 0; margin: 0 0 24px; }
    aside.toc-left li { padding: 4px 0; }
    aside.toc-left a { color: var(--ink); text-decoration: none; display: block; padding: 4px 8px; border-radius: 4px; }
    aside.toc-left a:hover { background: var(--rule); }
    aside.toc-left a.active { background: var(--accent); color: white; }
    main { padding: 48px 56px; max-width: 760px; }
    main h1 { font-size: 2rem; font-weight: 700; margin: 0 0 8px; letter-spacing: -0.02em; }
    main .lede { color: var(--muted); margin-bottom: 32px; }
    main h2 { font-size: 1.4rem; font-weight: 600; margin: 36px 0 12px;
      padding-top: 16px; border-top: 1px solid var(--rule); scroll-margin-top: 24px; }
    main h2:first-of-type { border-top: none; padding-top: 0; }
    main h3 { font-size: 1.05rem; font-weight: 600; margin: 24px 0 8px; }
    main p { margin: 0 0 14px; }
    main code { font-family: "JetBrains Mono", monospace; font-size: 0.88em;
      background: var(--code-bg); padding: 2px 6px; border-radius: 4px; }
    pre { background: var(--code-bg); padding: 16px 18px; border-radius: 8px;
      font-family: "JetBrains Mono", monospace; font-size: 13px;
      line-height: 1.55; overflow-x: auto; border: 1px solid var(--rule); }
    pre code { background: none; padding: 0; }
    .kw { color: var(--kw); }
    .str { color: var(--str); }
    .com { color: var(--com); }
    .num { color: var(--num); }
    .badge { display: inline-block; font-family: "JetBrains Mono", monospace;
      font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600;
      letter-spacing: 0.02em; }
    .badge.get { background: #dcfce7; color: #166534; }
    .badge.post { background: #dbeafe; color: #1e40af; }
    aside.toc-right { padding: 48px 24px; font-size: 13px;
      border-left: 1px solid var(--rule); position: sticky; top: 0; height: 100vh; }
    aside.toc-right h4 { margin: 0 0 8px; font-size: 11px;
      text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    aside.toc-right ul { list-style: none; padding: 0; margin: 0; }
    aside.toc-right a { color: var(--muted); text-decoration: none; display: block; padding: 4px 0; }
    aside.toc-right a:hover { color: var(--ink); }
  </style>
</head>
<body>
  <aside class="toc-left">
    <h4>Getting started</h4>
    <ul>
      <li><a href="#">Overview</a></li>
      <li><a href="#" class="active">Authentication</a></li>
      <li><a href="#">Quickstart</a></li>
    </ul>
    <h4>API</h4>
    <ul>
      <li><a href="#">Pages</a></li>
      <li><a href="#">Tokens</a></li>
      <li><a href="#">MCP</a></li>
    </ul>
  </aside>
  <main>
    <h1>Authentication</h1>
    <p class="lede">All API requests require either a session cookie or a bearer token.</p>

    <h2 id="bearer">Bearer tokens</h2>
    <p>Mint a token at <code>/tokens</code> and pass it on every request:</p>
    <pre><code><span class="com"># curl with a bearer token</span>
curl https://pages.arlint.dev/api/pages \\
  -H <span class="str">"Authorization: Bearer pt_..."</span></code></pre>

    <h2 id="endpoints">Endpoints</h2>
    <h3><span class="badge get">GET</span> &nbsp;<code>/api/pages</code></h3>
    <p>List the caller's pages. Returns an array of summary objects.</p>
    <h3><span class="badge post">POST</span> &nbsp;<code>/api/pages</code></h3>
    <p>Create a new page. Body: <code>{ title?, html }</code>.</p>
    <pre><code><span class="kw">const</span> res = <span class="kw">await</span> fetch(<span class="str">'/api/pages'</span>, {
  method: <span class="str">'POST'</span>,
  headers: { <span class="str">'content-type'</span>: <span class="str">'application/json'</span> },
  body: <span class="kw">JSON</span>.stringify({ title: <span class="str">'Hello'</span>, html: <span class="str">'&lt;h1&gt;Hi&lt;/h1&gt;'</span> }),
});
<span class="kw">const</span> page = <span class="kw">await</span> res.json();</code></pre>
  </main>
  <aside class="toc-right">
    <h4>On this page</h4>
    <ul>
      <li><a href="#bearer">Bearer tokens</a></li>
      <li><a href="#endpoints">Endpoints</a></li>
    </ul>
  </aside>
</body>
</html>`

const DOCS_STARTER = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Docs</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    :root { --bg: #ffffff; --side: #fafafa; --ink: #1a1a1a; --muted: #6b7280;
      --rule: #e5e7eb; --code-bg: #f6f8fa; --accent: #2563eb; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink);
      font-family: "Inter", system-ui, sans-serif; line-height: 1.6;
      -webkit-font-smoothing: antialiased; display: grid;
      grid-template-columns: 240px 1fr; min-height: 100vh; }
    aside.toc-left { background: var(--side); border-right: 1px solid var(--rule);
      padding: 32px 24px; font-size: 14px; }
    aside.toc-left h4 { margin: 0 0 12px; font-size: 12px;
      text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    aside.toc-left ul { list-style: none; padding: 0; margin: 0 0 24px; }
    aside.toc-left a { color: var(--ink); text-decoration: none;
      display: block; padding: 6px 8px; border-radius: 4px; }
    aside.toc-left a:hover { background: var(--rule); }
    main { padding: 48px 56px; max-width: 760px; }
    h1 { font-size: 2rem; font-weight: 700; margin: 0 0 8px; letter-spacing: -0.02em; }
    h2 { font-size: 1.4rem; font-weight: 600; margin: 36px 0 12px;
      padding-top: 16px; border-top: 1px solid var(--rule); }
    h2:first-of-type { border-top: none; padding-top: 0; }
    h3 { font-size: 1.05rem; font-weight: 600; margin: 24px 0 8px; }
    p { margin: 0 0 14px; }
    code { font-family: "JetBrains Mono", monospace; font-size: 0.88em;
      background: var(--code-bg); padding: 2px 6px; border-radius: 4px; }
    pre { background: var(--code-bg); padding: 16px 18px; border-radius: 8px;
      font-family: "JetBrains Mono", monospace; font-size: 13px;
      line-height: 1.55; overflow-x: auto; border: 1px solid var(--rule); }
    pre code { background: none; padding: 0; }
  </style>
</head>
<body>
  <aside class="toc-left">
    <h4>Navigation</h4>
    <ul>
      <li><a href="#">Overview</a></li>
    </ul>
  </aside>
  <main>
    <!-- CONTENT -->
  </main>
</body>
</html>`

// ---------- 9. Bento ----------

const BENTO_EXAMPLE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Atlas · Q2 in numbers</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root { --bg: #0b0d10; --ink: #f5f5f7; --muted: #8b8d93; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--ink);
      font-family: "Inter", system-ui, sans-serif;
      -webkit-font-smoothing: antialiased; min-height: 100vh; padding: 48px 24px; }
    .wrap { max-width: 1120px; margin: 0 auto; }
    .head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 32px; }
    .head h1 { font-size: 32px; font-weight: 700; letter-spacing: -0.02em; }
    .head .when { color: var(--muted); font-size: 14px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      grid-auto-rows: minmax(160px, auto);
      gap: 16px;
    }
    .tile {
      background: #16191e; border-radius: 16px; padding: 24px;
      position: relative; overflow: hidden;
      transition: transform 0.2s;
    }
    .tile:hover { transform: translateY(-2px); }
    .tile .label {
      font-size: 12px; color: var(--muted); text-transform: uppercase;
      letter-spacing: 0.08em; margin-bottom: 12px;
    }
    .tile .stat { font-size: 56px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
    .tile .delta { font-size: 14px; color: #4ade80; margin-top: 8px; }
    .tile.wide { grid-column: span 2; }
    .tile.tall { grid-row: span 2; }
    .tile.violet { background: linear-gradient(135deg, #7c5cff 0%, #4f3cc9 100%); }
    .tile.amber { background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); color: #0b0d10; }
    .tile.amber .label, .tile.amber .delta { color: rgba(11, 13, 16, 0.7); }
    .tile.emerald { background: linear-gradient(135deg, #10b981 0%, #047857 100%); }
    .tile.dark { background: #16191e; }
    .tile.title { display: flex; flex-direction: column; justify-content: flex-end; }
    .tile.title h2 { font-size: 36px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; }
    .tile.title p { color: var(--muted); margin-top: 8px; font-size: 15px; }
    .sparkline { position: absolute; bottom: 16px; right: 16px;
      width: 80px; height: 32px; opacity: 0.5; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <h1>Q2 in numbers</h1>
      <div class="when">April – June · 2026</div>
    </div>
    <div class="grid">
      <div class="tile title wide tall">
        <h2>A solid quarter.</h2>
        <p>Revenue up, churn flat, team grew by three.</p>
      </div>
      <div class="tile violet">
        <div class="label">MRR</div>
        <div class="stat">$48K</div>
        <div class="delta" style="color: rgba(255,255,255,0.85)">+18% QoQ</div>
      </div>
      <div class="tile amber">
        <div class="label">Active customers</div>
        <div class="stat">312</div>
        <div class="delta">+24 this Q</div>
      </div>
      <div class="tile dark">
        <div class="label">Net revenue retention</div>
        <div class="stat">114%</div>
      </div>
      <div class="tile dark">
        <div class="label">NPS</div>
        <div class="stat">62</div>
      </div>
      <div class="tile emerald wide">
        <div class="label">Headcount</div>
        <div class="stat">14</div>
        <div class="delta" style="color: rgba(255,255,255,0.85)">+3 hires</div>
      </div>
      <div class="tile dark">
        <div class="label">Uptime</div>
        <div class="stat">99.98%</div>
      </div>
    </div>
  </div>
</body>
</html>`

const BENTO_STARTER = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Untitled</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root { --bg: #0b0d10; --ink: #f5f5f7; --muted: #8b8d93; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--ink);
      font-family: "Inter", system-ui, sans-serif; min-height: 100vh;
      padding: 48px 24px; -webkit-font-smoothing: antialiased; }
    .wrap { max-width: 1120px; margin: 0 auto; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr);
      grid-auto-rows: minmax(160px, auto); gap: 16px; }
    .tile { background: #16191e; border-radius: 16px; padding: 24px;
      position: relative; overflow: hidden; }
    .tile .label { font-size: 12px; color: var(--muted); text-transform: uppercase;
      letter-spacing: 0.08em; margin-bottom: 12px; }
    .tile .stat { font-size: 56px; font-weight: 800;
      letter-spacing: -0.03em; line-height: 1; }
    .tile.wide { grid-column: span 2; }
    .tile.tall { grid-row: span 2; }
    .tile.violet { background: linear-gradient(135deg, #7c5cff 0%, #4f3cc9 100%); }
    .tile.amber { background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); color: #0b0d10; }
    .tile.emerald { background: linear-gradient(135deg, #10b981 0%, #047857 100%); }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="grid">
      <!-- CONTENT — Use tiles with classes like .wide, .tall, .violet, .amber, .emerald. -->
    </div>
  </div>
</body>
</html>`

// ---------- 10. Magazine ----------

const MAGAZINE_EXAMPLE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>The Long Game — Issue 04</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root { --bg: #f5f1ea; --ink: #14110d; --muted: #6b5d4f; --accent: #b53a1c; --rule: #c9bea9; }
    * { box-sizing: border-box; }
    body {
      margin: 0; background: var(--bg); color: var(--ink);
      font-family: "Inter", system-ui, sans-serif; line-height: 1.6;
    }
    .masthead {
      max-width: 1080px; margin: 0 auto; padding: 32px 32px 16px;
      border-bottom: 1px solid var(--rule);
      display: flex; justify-content: space-between; align-items: baseline;
    }
    .masthead .title {
      font-family: "Playfair Display", serif; font-weight: 900;
      font-size: 28px; letter-spacing: -0.01em;
    }
    .masthead .meta {
      font-family: "Inter", sans-serif; font-size: 11px;
      letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted);
    }
    article { max-width: 1080px; margin: 0 auto; padding: 64px 32px 96px; }
    .kicker {
      font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase;
      color: var(--accent); font-weight: 600; margin-bottom: 1rem;
    }
    h1 {
      font-family: "Playfair Display", serif; font-weight: 900;
      font-size: clamp(3rem, 7vw, 6rem); line-height: 0.95;
      letter-spacing: -0.03em; margin: 0 0 1rem; max-width: 16ch;
    }
    .deck {
      font-family: "Playfair Display", serif; font-weight: 400; font-style: italic;
      font-size: clamp(1.2rem, 2vw, 1.6rem); color: var(--muted);
      max-width: 36rem; line-height: 1.4; margin: 0 0 3rem;
    }
    .byline {
      font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
      color: var(--muted); padding-bottom: 2rem;
      border-bottom: 2px solid var(--ink); margin-bottom: 3rem;
    }
    .body {
      column-count: 2; column-gap: 48px; column-rule: 1px solid var(--rule);
      font-size: 17px; line-height: 1.7;
    }
    .body p { margin: 0 0 1.1rem; }
    .body p:first-child::first-letter {
      font-family: "Playfair Display", serif;
      font-weight: 900; font-size: 5.5rem; line-height: 1;
      float: left; padding: 0.3rem 0.8rem 0 0; color: var(--accent);
    }
    .pullquote {
      column-span: all;
      font-family: "Playfair Display", serif; font-weight: 700;
      font-size: clamp(1.6rem, 3vw, 2.4rem); line-height: 1.25;
      text-align: center; max-width: 28ch; margin: 2.5rem auto;
      padding: 1.5rem 0; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule);
    }
    @media (max-width: 700px) { .body { column-count: 1; } }
  </style>
</head>
<body>
  <header class="masthead">
    <div class="title">The Long Game</div>
    <div class="meta">Issue 04 · Spring 2026</div>
  </header>
  <article>
    <div class="kicker">Profile</div>
    <h1>The slow patience of building.</h1>
    <p class="deck">A decade of decisions, almost none of them dramatic. How a quiet team kept making good things on purpose.</p>
    <p class="byline">By a careful observer · 18 minute read</p>
    <div class="body">
      <p>The most surprising thing about visiting their offices is how little surprises you. There are no whiteboards covered in war-room arrows. No motivational posters. There is, at the end of the hallway, a window that looks out onto a parking lot, and someone has put a chair near it.</p>
      <p>That, more than anything, is the secret. The chair. Someone, at some point, decided that what was missing was a place to sit and look at nothing.</p>
      <div class="pullquote">"We optimize for the boring middle. Everyone wants the start and the finish. The middle is where the work is."</div>
      <p>For ten years they have been writing the same software, more or less, in the same way. Customers come. Customers stay. The team grows by one or two people a year. The product, asked what it does, says it the same way it said it in 2016.</p>
      <p>It is easy to mistake this for a lack of ambition. It is easy and it is wrong.</p>
    </div>
  </article>
</body>
</html>`

const MAGAZINE_STARTER = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Untitled</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root { --bg: #f5f1ea; --ink: #14110d; --muted: #6b5d4f; --accent: #b53a1c; --rule: #c9bea9; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink);
      font-family: "Inter", system-ui, sans-serif; line-height: 1.6; }
    article { max-width: 1080px; margin: 0 auto; padding: 64px 32px 96px; }
    h1 { font-family: "Playfair Display", serif; font-weight: 900;
      font-size: clamp(3rem, 7vw, 6rem); line-height: 0.95;
      letter-spacing: -0.03em; margin: 0 0 1rem; max-width: 16ch; }
    .deck { font-family: "Playfair Display", serif; font-style: italic;
      font-size: clamp(1.2rem, 2vw, 1.6rem); color: var(--muted);
      max-width: 36rem; line-height: 1.4; margin: 0 0 3rem; }
    .body { column-count: 2; column-gap: 48px; column-rule: 1px solid var(--rule);
      font-size: 17px; line-height: 1.7; }
    .body p { margin: 0 0 1.1rem; }
    .body p:first-child::first-letter {
      font-family: "Playfair Display", serif; font-weight: 900;
      font-size: 5.5rem; line-height: 1; float: left;
      padding: 0.3rem 0.8rem 0 0; color: var(--accent); }
    .pullquote { column-span: all; font-family: "Playfair Display", serif;
      font-weight: 700; font-size: clamp(1.6rem, 3vw, 2.4rem); line-height: 1.25;
      text-align: center; max-width: 28ch; margin: 2.5rem auto;
      padding: 1.5rem 0; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
    @media (max-width: 700px) { .body { column-count: 1; } }
  </style>
</head>
<body>
  <article>
    <!-- CONTENT -->
  </article>
</body>
</html>`

// ---------- registry ----------

export const STYLES: Style[] = [
  {
    name: 'nothing',
    summary: 'Monochrome, dot-grid, technical — Nothing-style design language.',
    when_to_use:
      'Dashboards, status pages, anything where data should feel like it lives in an instrument panel. Black background, oversized numeric displays, Space Mono labels in ALL CAPS, sparse use of one red accent.',
    example_html: NOTHING_EXAMPLE,
    starter_html: NOTHING_STARTER,
  },
  {
    name: 'editorial',
    summary: 'Long-form serif reading — essays, articles, letters.',
    when_to_use:
      'Anything text-heavy meant to be read end-to-end. Generous whitespace, narrow column (~38rem), Fraunces serif body, drop cap on the first paragraph, italic pull-quotes with a colored rule.',
    example_html: EDITORIAL_EXAMPLE,
    starter_html: EDITORIAL_STARTER,
  },
  {
    name: 'terminal',
    summary: 'Retro CRT terminal — green-on-black monospace with scanlines.',
    when_to_use:
      'Logs, dev-facing pages, anything wanting a hacker / retrofuture feel. Use `$ ` prompts, dim secondary text, yellow for accents, red for errors. Don\'t overuse — it\'s a strong vibe.',
    example_html: TERMINAL_EXAMPLE,
    starter_html: TERMINAL_STARTER,
  },
  {
    name: 'notebook',
    summary: 'Hand-drawn paper notebook — Caveat/Kalam, ruled lines, wavy underlines.',
    when_to_use:
      'Informal notes, drafts, brainstorms, "back of the napkin" content. Adds warmth and lowers stakes — good for friendly status updates or personal pages.',
    example_html: NOTEBOOK_EXAMPLE,
    starter_html: NOTEBOOK_STARTER,
  },
  {
    name: 'minimal',
    summary: 'Clean sans-serif product page — Inter, off-white, neutral palette.',
    when_to_use:
      'The safe default for product pages, portfolios, lists, anything where the content matters more than the look. Single-column 720px, subtle horizontal rules, one optional black CTA.',
    example_html: MINIMAL_EXAMPLE,
    starter_html: MINIMAL_STARTER,
  },
  {
    name: 'slides',
    summary: 'Presentation deck — full-viewport slides, arrow-key nav, F for fullscreen.',
    when_to_use:
      'Any "deck" or "presentation" request. Each <section class="slide"> is one slide; the first is .active. Arrow keys / spacebar / click advance, F toggles fullscreen, swipe works on touch. Good for keynote-style content, pitches, walkthroughs.',
    example_html: SLIDES_EXAMPLE,
    starter_html: SLIDES_STARTER,
  },
  {
    name: 'landing',
    summary: 'SaaS landing page — hero headline, dual CTA, three-up feature grid.',
    when_to_use:
      'Marketing pages for a product or service. Centered 4xl headline (max ~16ch), supporting paragraph, two CTAs (primary black button + ghost outline), three feature cards underneath in a responsive grid. Light, generous whitespace.',
    example_html: LANDING_EXAMPLE,
    starter_html: LANDING_STARTER,
  },
  {
    name: 'docs',
    summary: 'Technical documentation — left sidebar, code blocks with syntax color, right TOC.',
    when_to_use:
      'API references, guides, anything code-heavy. Three-column grid: left nav, body (max 760px), right "on this page" TOC. Monospace code in tinted boxes with .kw/.str/.com/.num syntax classes for highlighting. GET/POST badges for endpoints.',
    example_html: DOCS_EXAMPLE,
    starter_html: DOCS_STARTER,
  },
  {
    name: 'bento',
    summary: 'Bento-box stat grid — uneven tiles, gradient accents, oversized numbers.',
    when_to_use:
      'Dashboards, recap pages, "year in review" content. 4-column grid where some tiles span .wide (2 cols) or .tall (2 rows). Use .violet/.amber/.emerald classes for gradient tiles, .dark for plain ones. Big stat values, tiny uppercase labels.',
    example_html: BENTO_EXAMPLE,
    starter_html: BENTO_STARTER,
  },
  {
    name: 'magazine',
    summary: 'Magazine feature — Playfair display serif, multi-column body, pullquote.',
    when_to_use:
      'Long-form pieces wanting glossy/print-feel. Larger and heavier than `editorial`: huge Playfair Display headline, italic "deck" subhead, 2-column body with a drop cap and a column-spanning pullquote in the middle. Cream paper background. Good for profiles, retrospectives.',
    example_html: MAGAZINE_EXAMPLE,
    starter_html: MAGAZINE_STARTER,
  },
]

export function findStyle(name: string): Style | undefined {
  return STYLES.find((s) => s.name === name)
}
