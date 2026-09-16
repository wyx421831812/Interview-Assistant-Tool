/**
 * modules/interview.js — 模拟面试 + 回答点评
 * AI 扮演面试官分层追问（项目深挖/技术追问/STAR 话术/综合）。
 */
import { idbList, idbPut, loadSettings, fmtTime } from '../core/store.js';
import {
  startInterview, answerCurrentTurn, advanceTurn,
  persistReport, modeLabel,
} from '../core/services.js';
import { esc, toast, loadingBtn } from './ui.js';

const MODES = [
  ['project-deep', '项目深挖'],
  ['technical', '技术追问'],
  ['star', 'STAR 话术'],
  ['comprehensive', '综合'],
];

let session = null;
let busy = false;

export async function mount(container) {
  const sessions = await idbList('sessions');
  const ongoing = sessions.find(s => s.status === 'ongoing');
  if (ongoing) {
    session = ongoing;
    renderChat(container);
    return;
  }
  session = null;
  renderStart(container);
}

function renderStart(container) {
  const profiles = currentProfiles();
  container.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">模拟面试</h1>
        <div class="view-desc">AI 扮演面试官，基于你的画像与目标岗位出题并逐层追问。</div>
      </div>
    </div>
    <div class="card" style="max-width:620px">
      ${profiles.length === 0 ? `
        <div class="empty-box"><span class="em">◉</span>请先在「简历画像」生成画像，才能开始模拟面试。</div>
      ` : `
        <label class="label">选择画像</label>
        <select class="select" id="in-profile">
          ${profiles.map(p => `<option value="${p.id}">${esc(p.jobTarget || '未命名画像')}（${(p.techStack || []).slice(0, 3).join(' / ')}）</option>`).join('')}
        </select>
        <label class="label">面试模式</label>
        <div class="tags" id="in-mode">
          ${MODES.map(([v, l]) => `<button class="tag" data-mode="${v}">${l}</button>`).join('')}
        </div>
        <label class="label">最大轮数</label>
        <input class="input" id="in-rounds" type="number" min="1" max="50" value="${loadSettings().maxRounds || 10}" style="max-width:120px" />
        <div style="margin-top:18px">
          <button class="btn primary" id="in-start">开始模拟面试</button>
        </div>
      `}
    </div>
  `;
  if (profiles.length === 0) return;

  renderMode(container);
  container.querySelector('#in-mode').querySelectorAll('[data-mode]').forEach(b => {
    b.addEventListener('click', () => renderMode(container, b.dataset.mode));
  });
  container.querySelector('#in-start').addEventListener('click', async () => {
    const mode = container.querySelector('#in-mode')._mode || loadSettings().defaultModes[0] || 'project-deep';
    const cfg = {
      mode,
      profileId: container.querySelector('#in-profile').value,
      maxRounds: Number(container.querySelector('#in-rounds').value) || 10,
    };
    const btn = container.querySelector('#in-start');
    loadingBtn(btn, true, '启动中…');
    try {
      session = await startInterview(cfg);
      toast('模拟面试开始', 'ok');
      renderChat(container);
    } catch (e) {
      toast(e.message, 'err');
      loadingBtn(btn, false);
    }
  });
}

function renderMode(container, force) {
  const box = container.querySelector('#in-mode');
  const mode = force || box._mode || 'project-deep';
  box._mode = mode;
  box.querySelectorAll('[data-mode]').forEach(b => {
    const on = b.dataset.mode === mode;
    b.className = 'tag' + (on ? '' : ' remove');
  });
}

function currentProfiles() {
  return window.__profiles || [];
}

function renderChat(container) {
  container.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">模拟面试 · ${esc(modeLabel(session.mode))}</h1>
        <div class="view-desc">目标岗位：${esc(session.position || '未指定')} · 第 ${session.turnCount}/${session.maxRounds} 轮</div>
      </div>
      <button class="btn danger" id="chat-finish">结束面试</button>
    </div>

    <div class="card">
      <div class="chat" id="chat-log"></div>
    </div>

    <div class="card" id="answer-box">
      <div class="card-title">你的回答</div>
      <textarea class="textarea" id="chat-answer" placeholder="输入你的回答…" style="min-height:120px"></textarea>
      <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" id="a-submit">提交并继续</button>
        <button class="btn primary" id="a-review">提交并点评</button>
        <button class="btn ghost" id="a-next">跳过本题</button>
      </div>
    </div>
  `;
  renderLog(container);
  bindChat(container);
}

function renderLog(container) {
  const log = container.querySelector('#chat-log');
  const turns = session.turns || [];
  log.innerHTML = (turns || []).map(t => `
    <div class="msg assistant"><b>Q${t.turnNo} · 面试官</b>\n${esc(t.question)}<span class="mtime">${fmtTime(session.startedAt)}</span></div>
    ${t.answer ? `<div class="msg user">${esc(t.answer)}<span class="mtime">你</span></div>` : ''}
    ${t.review ? renderReview(t) : ''}
  `).join('')
    + `<div class="msg assistant" id="wait-buffer" hidden><b>面试官</b>\n<span class="spinner" style="border-top-color:var(--accent)"></span> 思考中…</div>`;
  log.scrollTop = log.scrollHeight;
}

function renderReview(t) {
  const dims = [['depth', '技术深度'], ['structure', '结构'], ['clarity', '条理'], ['fit', '契合度'], ['improvement', '改进']];
  return `
    <div class="msg assistant">
      <b>点评 · 总分 ${t.review.total}/5</b>
      <div class="scores" style="margin-top:8px">
        ${dims.map(([k, l]) => {
          const v = t.review.scores[k] || 0;
          return `<div class="score-item"><div class="sk">${l}</div><div class="sv">${v}</div><div class="bar"><i style="width:${v * 20}%"></i></div></div>`;
        }).join('')}
      </div>
      <div>${esc(t.review.comment)}</div>
      <div class="review-block"><div class="rb-title">改进版回答示范</div>${esc(t.review.improvedAnswer)}</div>
      <span class="mtime">点评</span>
    </div>
  `;
}

function bindChat(container) {
  const chatLog = container.querySelector('#chat-log');
  const answer = container.querySelector('#chat-answer');
  const finishBtn = container.querySelector('#chat-finish');
  const wait = () => {
    const w = chatLog.querySelector('#wait-buffer');
    if (w) w.hidden = false;
    chatLog.scrollTop = chatLog.scrollHeight;
  };

  container.querySelector('#a-submit').addEventListener('click', () => submit(false));
  container.querySelector('#a-review').addEventListener('click', () => submit(true));
  container.querySelector('#a-next').addEventListener('click', async () => {
    const last = session.turns[session.turns.length - 1];
    if (last && !last.answer) {
      last.answer = '（跳过）';
      await idbPut('sessions', session);
    }
    await nextStep(container);
  });

  async function submit(withReview) {
    if (busy) return;
    const text = answer.value.trim();
    if (!text) { toast('请输入回答', 'err'); return; }
    busy = true;
    wait();
    try {
      session = await answerCurrentTurn(session, text, withReview);
      renderLog(container);
      if (!withReview) toast('回答已记录', 'ok');
    } catch (e) {
      toast(e.message, 'err');
      renderLog(container);
      busy = false;
      return;
    }
    if (session.status === 'finished') {
      await finishNow(container);
      return;
    }
    await nextStep(container, withReview);
  }

  async function nextStep(container, wasReviewed) {
    try {
      session = await advanceTurn(session);
      answer.value = '';
      renderLog(container);
      renderHeader(container);
      busy = false;
    } catch (e) {
      toast(e.message, 'err');
      renderLog(container);
      busy = false;
    }
  }

  async function renderHeader(container) {
    container.querySelector('.view-desc').textContent =
      `目标岗位：${session.position || '未指定'} · 第 ${session.turnCount}/${session.maxRounds} 轮`;
  }

  finishBtn.addEventListener('click', () => finishNow(container));
}

async function finishNow(container) {
  if (busy) return;
  busy = true;
  const text = container.querySelector('#chat-answer');
  if (text && text.value.trim()) {
    const last = session.turns[session.turns.length - 1];
    if (last && !last.answer) {
      last.answer = text.value.trim();
      await idbPut('sessions', session);
    }
  }
  try {
    session.status = 'finished';
    await idbPut('sessions', session);
    await persistReport(session);
    toast('面试已结束，已生成复盘', 'ok');
    window.__go('review');
  } catch (e) {
    toast(e.message, 'err');
    busy = false;
  }
}