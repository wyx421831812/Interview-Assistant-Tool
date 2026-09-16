/**
 * modules/prediction.js — 高频题预测
 * 结合画像与目标岗位及历史错题，生成押题清单。
 */
import { idbList, idbPut, idbClear, fmtTime } from '../core/store.js';
import { predictQuestions } from '../core/services.js';
import { esc, toast, loadingBtn } from './ui.js';

const TYPE_LABEL = { project: '项目', technical: '技术', behavior: '行为' };
const PRIORITY = { high: ['高', 'hi'], medium: ['中', 'mid'], low: ['低', 'lo'] };

export async function mount(container) {
  const [predictions, profiles] = await Promise.all([idbList('predictions'), idbList('profile')]);
  render(container, predictions, profiles.length > 0);
}

function render(container, list, hasProfile) {
  container.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">高频题预测</h1>
        <div class="view-desc">结合你的画像、目标岗位与历史错题，生成考前押题清单。</div>
      </div>
      <button class="btn primary" id="pd-generate">生成押题清单</button>
    </div>

    <div class="card">
      <div class="card-title">近期预测</div>
      ${list.length ? list.map(itemHtml).join('') : `<div class="empty-box"><span class="em">◎</span>${hasProfile ? '点击「生成押题清单」开始。' : '请先到「简历画像」生成画像。'}</div>`}
    </div>
  `;

  container.querySelector('#pd-generate').addEventListener('click', async () => {
    const btn = container.querySelector('#pd-generate');
    loadingBtn(btn, true, '生成中…');
    try {
      const items = await predictQuestions();
      toast('已生成押题清单', 'ok');
      mount(container);
    } catch (e) {
      toast(e.message, 'err');
      loadingBtn(btn, false);
    }
  });
}

function itemHtml(it) {
  const type = TYPE_LABEL[it.type] || it.type;
  const [pLabel, pCls] = PRIORITY[it.priority] || ['中', 'mid'];
  const cls = { project: 'proj', technical: 'tech', behavior: 'beh' }[it.type] || 'tech';
  return `
    <div class="list-item">
      <div class="item-main">
        <div class="item-title">
          <span class="badge ${cls}">${type}</span>
          <span class="badge ${pCls}">${pLabel}</span>
          ${esc(it.question)}
        </div>
        <div class="item-sub">依据：${esc(it.basis || '—')}</div>
        <div class="item-sub">${fmtTime(it.createdAt)}</div>
      </div>
    </div>`;
}