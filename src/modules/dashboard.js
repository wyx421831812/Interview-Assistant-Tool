/**
 * modules/dashboard.js — 总览首页
 */
import { idbList, loadSettings, fmtTime } from '../core/store.js';
import { esc } from './ui.js';

export async function mount(container) {
  const [profiles, notes, sessions, reports, predictions, wrong, settings] = await Promise.all([
    idbList('profile'), idbList('notes'), idbList('sessions'), idbList('reports'),
    idbList('predictions'), import('../core/services.js').then(m => m.buildWrongBook()),
    Promise.resolve(loadSettings()),
  ]);
  const profile = profiles[profiles.length - 1];
  const finished = sessions.filter(s => s.status === 'finished').length;

  container.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">总览</h1>
        <div class="view-desc">欢迎回来！选择下方功能开始备战，或从「设置」完成配置。</div>
      </div>
    </div>

    ${!settings.apiKey ? `
      <div class="card" style="border-left:4px solid var(--warn)">
        <strong>尚未配置 LLM 服务</strong>
        <p style="margin:6px 0 0;color:var(--text-2)">设置 API Key 与模型后才能启用解析/模拟面试/点评等 AI 能力。</p>
        <button class="btn primary sm" data-goto="settings" style="margin-top:10px">前往设置</button>
      </div>` : ''}

    <div class="stats">
      <div class="stat"><div class="stat-value">${profile ? '✓' : '—'}</div><div class="stat-label">简历画像</div></div>
      <div class="stat"><div class="stat-value">${notes.length}</div><div class="stat-label">笔记</div></div>
      <div class="stat"><div class="stat-value">${finished}</div><div class="stat-label">已完成面试</div></div>
      <div class="stat"><div class="stat-value">${reportAvg(reports)}</div><div class="stat-label">平均得分 /5</div></div>
      <div class="stat"><div class="stat-value">${wrong.length}</div><div class="stat-label">错题</div></div>
      <div class="stat"><div class="stat-value">${predictions.length}</div><div class="stat-label">预测题</div></div>
    </div>

    <div class="card">
      <div class="card-title">快速开始</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        <button class="btn" data-goto="profile">① 导入简历<br>生成画像</button>
        <button class="btn" data-goto="notes">② 整理面试笔记</button>
        <button class="btn primary" data-goto="interview">③ 开始模拟面试</button>
      </div>
      <div class="divider"></div>
      <div class="card-title">最近面试</div>
      ${reports.length ? reports.slice(-5).reverse().map(r => `
        <div class="list-item">
          <div class="item-main">
            <div class="item-title">${esc(modeLabel(r.mode))}</div>
            <div class="item-sub">${fmtTime(r.createdAt)} · ${r.turnCount} 轮 · 平均 ${r.averageScore}</div>
          </div>
          <button class="btn ghost sm" data-goto="review">查看复盘</button>
        </div>`).join('') : '<div class="empty-box">暂无面试记录</div>'}
    </div>
  `;

  container.querySelectorAll('[data-goto]').forEach(b => {
    b.addEventListener('click', () => window.__go(b.getAttribute('data-goto')));
  });
}

function reportAvg(reports) {
  if (!reports.length) return '—';
  const sum = reports.reduce((a, r) => a + r.averageScore, 0);
  return (sum / reports.length).toFixed(1);
}

import { modeLabel } from '../core/services.js';