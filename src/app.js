/**
 * app.js — 应用入口 / 控制器
 * 负责侧边导航、模块挂载、共享上下文与配置状态指示。
 */
import * as dashboard from './modules/dashboard.js';
import * as settings from './modules/settings.js';
import * as profile from './modules/profile.js';
import * as notes from './modules/notes.js';
import * as interview from './modules/interview.js';
import * as review from './modules/review.js';
import * as prediction from './modules/prediction.js';
import { idbList, loadSettings } from './core/store.js';

const MODULES = { dashboard, settings, profile, notes, interview, review, prediction };

const content = document.getElementById('content');
let current = 'dashboard';

// 供各模块使用的共享上下文
window.__profiles = [];
window.__go = go;
window.__refreshCfgDot = refreshCfgDot;

async function refreshCfgDot() {
  const s = loadSettings();
  const dot = document.getElementById('cfg-dot');
  const status = document.getElementById('cfg-status');
  dot.className = 'dot ' + (s.apiKey ? 'ok' : (s.baseUrl || s.model ? 'bad' : ''));
  status.textContent = s.apiKey ? (s.model || '已配置') : '未配置';
}

function highlightNav() {
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.view === current);
  });
}

async function go(name) {
  current = name;
  highlightNav();
  const mod = MODULES[name];
  if (!mod) return;
  content.innerHTML = '';
  await mod.mount(content, go);
  if (name === 'interview' || name === 'dashboard') {
    // interview/profile 需要最新画像上下文
    const profiles = await idbList('profile');
    window.__profiles = profiles;
  }
}

async function boot() {
  refreshCfgDot();
  document.querySelectorAll('.nav-item').forEach(b => {
    b.addEventListener('click', () => go(b.dataset.view));
  });
  const profiles = await idbList('profile');
  window.__profiles = profiles;
  await go('dashboard');
}

boot();