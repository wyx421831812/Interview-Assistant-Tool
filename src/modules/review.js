/**
 * modules/review.js — 面试复盘
 * 错题本、能力雷达图、进步趋势追踪。
 */
import { idbList, fmtTime } from '../core/store.js';
import { buildWrongBook, dimensionLabels, modeLabel } from '../core/services.js';
import { esc } from './ui.js';

export async function mount(container) {
  const [reports, rows, sessions] = await Promise.all([
    idbList('reports'), buildWrongBook(), idbList('sessions'),
  ]);
  render(container, reports, rows, sessions);
}

function render(container, reports, wrong, sessions) {
  const latest = reports[reports.length - 1];
  container.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">面试复盘</h1>
        <div class="view-desc">错题本、能力雷达图与逐场进步趋势。</div>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><div class="stat-value">${reports.length}</div><div class="stat-label">面试场次</div></div>
      <div class="stat"><div class="stat-value">${wrong.length}</div><div class="stat-label">错题</div></div>
      <div class="stat"><div class="stat-value">${latest ? latest.averageScore : '—'}</div><div class="stat-label">最近平均分 /5</div></div>
    </div>

    <div class="chart-row">
      <div class="chart-box">
        <div class="cb-title">能力雷达图（${latest ? '最近一场' : '暂无数据'}）</div>
        ${latest ? radarSvg(latest.perDimensionAvg) : '<div class="empty-box">完成一场面试后自动生成。</div>'}
      </div>
      <div class="chart-box">
        <div class="cb-title">进步趋势</div>
        ${reports.length ? trendSvg(reports.map(r => ({ label: r.createdAt, v: r.averageScore }))) : '<div class="empty-box">暂无趋势数据。</div>'}
      </div>
    </div>

    <div class="card">
      <div class="card-title">错题本（总分 &lt; 3 自动收录）</div>
      ${wrong.length ? wrong.map(w => `
        <div class="list-item">
          <div class="item-main">
            <div class="item-title">Q${w.turnNo} · ${esc(w.question)}</div>
            <div class="item-sub">${esc(w.answer || '（未作答）').slice(0, 120)}</div>
            <div class="item-sub">${fmtTime(w.time)} · 得分 ${w.total}</div>
          </div>
        </div>`).join('') : '<div class="empty-box"><span class="em">✪</span>暂无错题，继续保持。</div>'}
    </div>

    <div class="card">
      <div class="card-title">历史记录</div>
      ${reports.slice().reverse().map(r => `
        <div class="list-item">
          <div class="item-main">
            <div class="item-title">${esc(modeLabel(r.mode))}</div>
            <div class="item-sub">${fmtTime(r.createdAt)} · ${r.turnCount} 轮 · 平均 ${r.averageScore} · 错题 ${r.wrongCount}</div>
          </div>
        </div>`).join('') || '<div class="empty-box">暂无历史记录。</div>'}
    </div>
  `;
}

function radarSvg(avg) {
  const labels = dimensionLabels();
  const size = 260, cx = size / 2, cy = size / 2, R = 90, N = labels.length;
  const pt = (i, r) => {
    const a = (Math.PI * 2 * i) / N - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = pts => pts.map(p => p.join(',')).join(' ');
  // 网格
  const rings = [0.25, 0.5, 0.75, 1].map(f => poly(labels.map((_, i) => pt(i, R * f))));
  const axes = labels.map((_, i) => {
    const [x, y] = pt(i, R);
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e6e8ec"/>`;
  });
  // 数据
  const vals = labels.map(([k]) => Math.max(0, Math.min(5, (avg || {})[k] || 0)));
  const dataPts = vals.map((v, i) => pt(i, (R * v) / 5));
  const dot = dataPts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#3b6fe0"><title>${labels[i][1]}:${vals[i]}</title></circle>`).join('');
  const lbl = labels.map(([k, l], i) => {
    const [x, y] = pt(i, R + 22);
    return `<text x="${x}" y="${y}" font-size="11" fill="#6b7280" text-anchor="middle">${l}</text>`;
  }).join('');
  const valLabel = vals.map((v, i) => {
    const [x, y] = pt(i, R * (Math.max(v, 0.01) / 5) - 12);
    return `<text x="${x}" y="${y}" font-size="10" fill="#3b6fe0" text-anchor="middle">${v}</text>`;
  }).join('');
  return `<svg width="260" height="260" viewBox="0 0 260 260">
    <g>${rings.map(r => `<polygon points="${r}" fill="none" stroke="#e6e8ec"/>`).join('')}${axes.join('')}</g>
    <polygon points="${poly(dataPts)}" fill="rgba(59,111,224,.15)" stroke="#3b6fe0" stroke-width="2"/>
    ${dot}${lbl}${valLabel}
  </svg>`;
}

function trendSvg(points) {
  const w = 320, h = 200, pad = 30;
  const vs = points.map(p => p.v);
  const maxV = Math.max(5, ...vs) + 0.5;
  const minV = Math.min(0, ...vs);
  const step = Math.max(1, Math.floor((w - pad * 2) / Math.max(1, points.length - 1)));
  const XY = points.map((p, i) => {
    const x = pad + i * step;
    const y = h - pad - ((p.v - minV) / (maxV - minV)) * (h - pad * 2);
    return [x, y];
  });
  const line = XY.map(p => p.join(',')).join(' L');
  const dots = XY.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#2f9e6e"><title>${fmtTime(points[i].label)}: ${points[i].v}</title></circle>`).join('');
  const labels = points.map((p, i) => {
    const [x, y] = XY[i];
    return `<text x="${x}" y="186" font-size="9" fill="#6b7280" text-anchor="middle">${dateShort(p.label)}</text>`;
  }).join('');
  return `<svg width="320" height="200" viewBox="0 0 320 200">
    <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="#e6e8ec"/>
    <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" stroke="#e6e8ec"/>
    <polyline points="${line}" fill="none" stroke="#2f9e6e" stroke-width="2"/>
    ${dots}${labels}
  </svg>`;
}

function dateShort(iso) {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}