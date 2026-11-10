#!/usr/bin/env node
// Zeigt die Statusline mit Beispieldaten an, ohne Claude Code zu starten.
// Aufruf: node examples/demo.js
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const now = Math.floor(Date.now() / 1000);
const sample = {
  session_id: 'demo-session',
  version: '2.1.300',
  model: { id: 'claude-sonnet-5-5', display_name: 'Sonnet 5.5' },
  workspace: { current_dir: process.cwd(), repo: { host: 'github.com', owner: 'acme', name: 'webshop' } },
  effort: { level: 'medium' },
  context_window: { used_percentage: 34 },
  cost: { total_cost_usd: 1.234, total_duration_ms: 900000, total_lines_added: 156, total_lines_removed: 23 },
  prompt_cache: { warm: true, caching_observed: true, ttl: '1h', expires_at: now + 54 * 60, hit_ratio: 0.91, recache_tokens_if_cold: 45000 },
  rate_limits: {
    five_hour: { used_percentage: 23.5, resets_at: now + 2 * 3600 + 600 },
    seven_day: { used_percentage: 41.2, resets_at: now + 4 * 86400 },
    spend_limit: { used_percentage: 62.8, resets_at: now + 12 * 86400, used_usd: 314.12, limit_usd: 500, period: 'monthly' },
  },
  pr: { number: 1234, review_state: 'pending' },
};

process.stdout.write(
  execFileSync(process.execPath, [path.join(__dirname, '..', 'statusline.js')], {
    input: JSON.stringify(sample),
    encoding: 'utf8',
  }),
);
