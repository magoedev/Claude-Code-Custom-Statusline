#!/usr/bin/env node
/**
 * claude-statusline - schlanke, konfigurierbare Statusline für Claude Code
 *
 * Liest die Session-Daten, die Claude Code per stdin liefert, und gibt eine oder mehrere Zeilen aus.
 * - Keine Abhängigkeiten (nur Node.js-Bordmittel)
 * - Kein Netzwerkzugriff, schreibt keine Dateien, liest keine Zugangsdaten
 * - Liest nur die eigene Config-Datei und ruft optional lokal `git branch --show-current` auf
 *
 * Eingabefelder: https://code.claude.com/docs/en/statusline
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// ------------------------------------------------------------------ Standardwerte
const DEFAULTS = {
  lines: [
    ['model', 'project', 'branch', 'pr'],
    ['context', 'cache', 'limits', 'budget', 'cost', 'lines'],
  ],
  separator: ' │ ',
  color: true,
  colors: {
    text: 'brightWhite',
    muted: 'white',
    background: 'black',
    accent: 'brightCyan',
    ok: 'brightGreen',
    warn: 'brightYellow',
    crit: 'brightRed',
  },
  barWidth: 10,
  thresholds: { warn: 70, crit: 90 },
  segments: {
    model: { showEffort: true },
    cache: { showHitRatio: true, showRecacheTokens: true },
    limits: { showFiveHour: true, showSevenDay: true, showResetIn: true },
    budget: { showPeriod: true },
    cost: { decimals: 2 },
  },
};

// ------------------------------------------------------------------ Config laden
function deepMerge(base, extra) {
  if (Array.isArray(extra) || typeof extra !== 'object' || extra === null) return extra;
  const out = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    out[key] = key in base && typeof base[key] === 'object' && !Array.isArray(base[key])
      ? deepMerge(base[key], value)
      : value;
  }
  return out;
}

function configPaths() {
  const list = [];
  if (process.env.CLAUDE_STATUSLINE_CONFIG) list.push(process.env.CLAUDE_STATUSLINE_CONFIG);
  list.push(path.join(__dirname, 'statusline.config.json'));
  list.push(path.join(os.homedir(), '.claude', 'statusline.config.json'));
  return list;
}

function loadConfig() {
  for (const file of configPaths()) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue; // Datei existiert nicht, nächsten Pfad versuchen
    }
    try {
      return { config: deepMerge(DEFAULTS, JSON.parse(text)), error: null };
    } catch {
      return { config: DEFAULTS, error: `Config fehlerhaft: ${file}` };
    }
  }
  return { config: DEFAULTS, error: null };
}

const { config: CFG, error: CONFIG_ERROR } = loadConfig();

// ------------------------------------------------------------------ Darstellung
const useColor = CFG.color !== false && !process.env.NO_COLOR;

const COLOR_NAMES = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
];

// Farbe als Name ("white", "brightRed", "gray"), Hex ("#d0d0d0") oder 256er-Index (0-255).
// Leer, null oder "default" = Terminal-Standard.
function colorCode(value, background) {
  if (value === null || value === undefined || value === '' || value === 'default') return '';
  const base = background ? 40 : 30;
  if (typeof value === 'number' && value >= 0 && value <= 255) return `${base + 8};5;${value | 0}`;
  const text = String(value).trim();
  const hex = /^#?([0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `${base + 8};2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}`;
  }
  const name = text.toLowerCase().replace(/[\s_-]/g, '');
  if (name === 'gray' || name === 'grey') return String(base + 60);
  const bright = name.startsWith('bright');
  const index = COLOR_NAMES.indexOf(bright ? name.slice(6) : name);
  return index < 0 ? '' : String(base + index + (bright ? 60 : 0));
}

const COLORS = { ...DEFAULTS.colors, ...(CFG.colors || {}) };
// Grundfarbe (Text + Hintergrund), wird nach jedem farbigen Abschnitt wiederhergestellt
const BASE = [colorCode(COLORS.text), colorCode(COLORS.background, true)].filter(Boolean).join(';');
const restore = BASE ? `\x1b[0;${BASE}m` : '\x1b[0m';
const paint = (color) => {
  const code = colorCode(color);
  return (s) => (useColor && code ? `\x1b[${code}m${s}${restore}` : String(s));
};
const dim = paint(COLORS.muted);
const green = paint(COLORS.ok);
const yellow = paint(COLORS.warn);
const red = paint(COLORS.crit);
const cyan = paint(COLORS.accent);
const plain = (s) => String(s);
const SEP = dim(CFG.separator ?? DEFAULTS.separator);
const line = (s) => (useColor && BASE ? `\x1b[0;${BASE}m${s}\x1b[0m` : s);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const nowSec = () => Date.now() / 1000;
const seg = (name) => CFG.segments?.[name] || {};

function byUsage(pct) {
  const { warn = 70, crit = 90 } = CFG.thresholds || {};
  return pct >= crit ? red : pct >= warn ? yellow : green;
}

function bar(pct) {
  const w = Math.max(1, CFG.barWidth | 0);
  const filled = Math.max(0, Math.min(w, Math.round((pct / 100) * w)));
  return '█'.repeat(filled) + '░'.repeat(w - filled);
}

function duration(sec) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}d${h}h`;
  if (h) return `${h}h${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m`;
  return `${sec}s`;
}

function tokens(n) {
  if (!isNum(n)) return '';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

function workDir(d) {
  return d.workspace?.current_dir || d.cwd || '';
}

// ------------------------------------------------------------------ Segmente
const SEGMENTS = {
  model(d) {
    const name = d.model?.display_name || d.model?.id;
    if (!name) return '';
    let s = cyan(name);
    if (seg('model').showEffort !== false && d.effort?.level) s += ' ' + dim(d.effort.level);
    if (d.fast_mode) s += ' ' + yellow('fast');
    return s;
  },

  project(d) {
    const dir = workDir(d);
    return d.workspace?.repo?.name || (dir ? path.basename(dir) : '');
  },

  branch(d) {
    if (d.worktree?.branch) return dim('branch ') + d.worktree.branch;
    const dir = workDir(d);
    if (!dir) return '';
    try {
      const { execFileSync } = require('child_process');
      const name = execFileSync('git', ['-C', dir, 'branch', '--show-current'], {
        encoding: 'utf8',
        timeout: 500,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      }).trim();
      return name ? dim('branch ') + name : '';
    } catch {
      return '';
    }
  },

  pr(d) {
    if (!d.pr?.number) return '';
    const label = d.pr.kind === 'mr' ? 'MR' : 'PR';
    const state = d.pr.review_state;
    const color = state === 'approved' ? green : state === 'changes_requested' ? red : plain;
    return color(`${label} #${d.pr.number}`) + (state ? ' ' + dim(state) : '');
  },

  context(d) {
    const pct = d.context_window?.used_percentage;
    if (!isNum(pct)) return '';
    const color = byUsage(pct);
    return `ctx ${color(bar(pct))} ${color(Math.round(pct) + '%')}`;
  },

  cache(d) {
    const pc = d.prompt_cache;
    const opts = seg('cache');
    if (!pc) return '';
    if (!pc.caching_observed) return dim('cache aus');

    const hit = opts.showHitRatio !== false && isNum(pc.hit_ratio)
      ? ' ' + dim(`(${Math.round(pc.hit_ratio * 100)}% hit)`)
      : '';
    const left = isNum(pc.expires_at) ? pc.expires_at - nowSec() : -1;

    if (pc.warm && left > 0) {
      const ttl = pc.ttl === '1h' ? 3600 : 300;
      const frac = left / ttl;
      const color = frac < 0.1 ? red : frac < 0.3 ? yellow : green;
      return `cache ${color(duration(left))}${hit}`;
    }
    const recache = opts.showRecacheTokens !== false && isNum(pc.recache_tokens_if_cold)
      ? ' ' + dim(`(${tokens(pc.recache_tokens_if_cold)} neu)`)
      : '';
    return `cache ${red('kalt')}${recache}${hit}`;
  },

  limits(d) {
    const rl = d.rate_limits;
    const opts = seg('limits');
    if (!rl) return '';
    const windowText = (label, w) => {
      if (!w || !isNum(w.used_percentage)) return '';
      const reset = opts.showResetIn !== false && isNum(w.resets_at)
        ? ' ' + dim('reset ' + duration(w.resets_at - nowSec()))
        : '';
      return `${label} ${byUsage(w.used_percentage)(Math.round(w.used_percentage) + '%')}${reset}`;
    };
    return [
      opts.showFiveHour !== false ? windowText('5h', rl.five_hour) : '',
      opts.showSevenDay !== false ? windowText('7d', rl.seven_day) : '',
    ].filter(Boolean).join(SEP);
  },

  budget(d) {
    const sp = d.rate_limits?.spend_limit;
    if (!sp || !isNum(sp.used_percentage)) return '';
    const amount = isNum(sp.used_usd) && isNum(sp.limit_usd)
      ? `$${sp.used_usd.toFixed(0)}/$${sp.limit_usd.toFixed(0)}`
      : `${Math.round(sp.used_percentage)}%`;
    const period = seg('budget').showPeriod !== false && sp.period ? ' ' + dim(sp.period) : '';
    return `budget ${byUsage(sp.used_percentage)(amount)}${period}`;
  },

  cost(d) {
    const cost = d.cost?.total_cost_usd;
    if (!isNum(cost)) return '';
    const decimals = isNum(seg('cost').decimals) ? seg('cost').decimals : 2;
    return dim('≈') + `$${cost.toFixed(decimals)}`;
  },

  lines(d) {
    const add = d.cost?.total_lines_added;
    const rem = d.cost?.total_lines_removed;
    if (!isNum(add) || !isNum(rem) || (!add && !rem)) return '';
    return green(`+${add}`) + ' ' + red(`-${rem}`);
  },

  duration(d) {
    const ms = d.cost?.total_duration_ms;
    return isNum(ms) ? dim('time ') + duration(ms / 1000) : '';
  },

  session(d) {
    return d.session_name ? dim(d.session_name) : '';
  },

  agent(d) {
    return d.agent?.name ? yellow('@' + d.agent.name) : '';
  },

  version(d) {
    return d.version ? dim('v' + d.version) : '';
  },
};

// ------------------------------------------------------------------ Ausgabe
function render(d) {
  const lines = Array.isArray(CFG.lines) ? CFG.lines : DEFAULTS.lines;
  const out = lines
    .map((names) =>
      (Array.isArray(names) ? names : [names])
        .map((name) => {
          const fn = SEGMENTS[name];
          if (!fn) return dim(`?${name}`); // Tippfehler in der Config sichtbar machen
          try {
            return fn(d);
          } catch {
            return '';
          }
        })
        .filter(Boolean)
        .join(SEP),
    )
    .filter(Boolean);
  if (CONFIG_ERROR) out.push(red(CONFIG_ERROR));
  return out.map(line).join('\n');
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  try {
    process.stdout.write(render(JSON.parse(input)) + '\n');
  } catch {
    // Nie mit Fehlercode beenden, sonst bleibt die Statusline leer.
    process.stdout.write('statusline: keine Daten\n');
  }
});
