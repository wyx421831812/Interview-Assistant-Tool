/**
 * core/services.js — 领域服务编排
 * 将 LLM 调用与本地数据结合，实现六大模块的业务逻辑。
 */
import { completeJson, completeText, LlmError } from './llm.js';
import { idbPut, idbGet, idbList, idbDelete, uid, nowISO, loadSettings } from './store.js';

const DIMENSIONS = [
  ['depth', '技术深度'],
  ['structure', '完整度(STAR)'],
  ['clarity', '表达条理'],
  ['fit', '与项目契合度'],
  ['improvement', '改进空间'],
];

export function dimensionLabels() {
  return DIMENSIONS;
}

// 从设置或简历中取目标岗位
function jobTargetOf(profile) {
  return (profile && profile.jobTarget) || loadSettings().jobTarget || '';
}

// ==================== AI-1 简历解析 ====================
export async function parseResume(text) {
  if (!text || !text.trim()) throw new LlmError('config', '简历内容为空');
  const sys = '你是资深技术面试官。请从简历中提取结构化面试画像，只输出 JSON。';
  const user = [
    '请根据以下简历文本，解析为 JSON，字段：',
    '{ "projects": [{"name":"项目名","description":"一句话描述","technology":["技术栈"]}],',
    '  "techStack": ["技术栈列表"], "responsibilities": ["职责"], "highlights": ["亮点/成就"],',
    '  "jobTarget": "推断的目标岗位或填空" }',
    '若某字段无法判断则留空数组或空串。不要捏造简历中没有的内容。',
    '\n简历文本：\n' + text,
  ].join('\n');
  const data = await completeJson(sys, [{ role: 'user', content: user }]);
  return normalizeProfile(data);
}

function normalizeProfile(d) {
  return {
    id: uid(),
    projects: Array.isArray(d.projects) ? d.projects.filter(p => p && p.name).map(p => ({
      name: String(p.name || '').trim(),
      description: String(p.description || '').trim(),
      technology: Array.isArray(p.technology) ? p.technology.map(String) : [],
      star: p.star || null,
    })) : [],
    techStack: arr(d.techStack),
    responsibilities: arr(d.responsibilities),
    highlights: arr(d.highlights),
    jobTarget: String(d.jobTarget || '').trim(),
    updatedAt: nowISO(),
  };
}
const arr = a => (Array.isArray(a) ? a.map(String).map(s => s.trim()).filter(Boolean) : []);

// ==================== AI-2 笔记检索（语义为增强，现实现关键词召回） ====================
export function searchNotes(notes, query) {
  const q = query.trim().toLowerCase();
  if (!q) return notes.map(n => ({ note: n, score: 0 }));
  const tokens = q.split(/\s+/).filter(Boolean);
  return notes.map(n => {
    const hay = (n.title + '\n' + n.content + '\n' + (n.tags || []).join(' ')).toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (hay.includes(t)) score += t.length;
    }
    // 标题命中加权
    if (n.title.toLowerCase().includes(q)) score += 5;
    return { note: n, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
}

// ==================== AI-3/4 模拟面试 ====================
const MODE_LABEL = {
  'project-deep': '项目深挖',
  technical: '技术追问',
  star: 'STAR 话术',
  comprehensive: '综合',
};

export function modeLabel(m) { return MODE_LABEL[m] || m; }

export async function startInterview(cfg) {
  const profile = await idbGet('profile', cfg.profileId);
  const session = {
    id: uid(),
    mode: cfg.mode,
    profileId: cfg.profileId,
    position: jobTargetOf(profile),
    profile,
    status: 'ongoing',
    createdAt: nowISO(),
    startedAt: nowISO(),
    turnCount: 0,
    maxRounds: cfg.maxRounds || loadSettings().maxRounds || 10,
    turns: [],
  };
  const q = await nextQuestion(session, null);
  session.turns.push({ turnNo: 1, question: q, answerRoom: '' });
  session.turnCount = 1;
  await idbPut('sessions', session);
  return session;
}

async function nextQuestion(session, lastAnswer) {
  const sys = '你是严格专业的面试官，根据候选人画像提问，只输出 JSON {"question":"..."}。不得询问画像之外的虚构项目。';
  const history = durationHistory(session);
  const user = [
    `面试模式：${MODE_LABEL[session.mode] || session.mode}`,
    `目标岗位：${session.position || '未指定'}`,
    `画像：\n${profileText(session.profile)}`,
    history.length ? `\n已有对话：\n${history.join('\n')}` : '',
    lastAnswer ? `\n候选人上一轮回答：${lastAnswer}\n请针对其中技术细节或薄弱点追问。` : '\n请提出第一轮面试问题。',
  ].join('\n');
  const data = await completeJson(sys, [{ role: 'user', content: user }]);
  return String(data.question || '').trim();
}

function durationHistory(session) {
  const base = session.turns || [];
  const last = base[base.length - 1];
  if (!last) return [];
  const parts = [`Q${last.turnNo}: ${last.question}`];
  if (last.answer) parts.push(`A${last.turnNo}: ${last.answer}`);
  return parts;
}

// 记录用户回答；可选点评
export async function answerCurrentTurn(session, userAnswer, withReview) {
  const turn = session.turns[session.turns.length - 1];
  turn.answer = userAnswer;
  if (withReview && !turn.review) {
    turn.review = await reviewAnswer(session, turn);
  }
  // 终止条件
  if (session.turnCount >= session.maxRounds) {
    session.status = 'finished';
  }
  await idbPut('sessions', session);
  return session;
}

// AI-3b：在回答后生成下一轮问题
export async function advanceTurn(session) {
  if (session.status === 'finished') return session;
  const last = session.turns[session.turns.length - 1];
  const q = await nextQuestion(session, last.answer);
  session.turns.push({ turnNo: session.turnCount + 1, question: q, answerRoom: '' });
  session.turnCount += 1;
  await idbPut('sessions', session);
  return session;
}

// ==================== AI-5 回答点评 ====================
export async function reviewAnswer(session, turn) {
  const sys = '你是资深面试官与表达教练。请对候选人回答进行结构化点评，只输出 JSON。';
  const dims = DIMENSIONS.map(([k, l]) => `"${k}": 0-5 分`).join(', ');
  const user = [
    `问题：${turn.question}`,
    `候选人回答：${turn.answer}`,
    `画像：\n${profileText(session.profile)}`,
    `请输出 JSON：{"scores": {${dims}}, "total": 总分数字, "comment": "一段总体评价", "improvedAnswer": "改进版回答示范（STAR 结构）"}`,
  ].join('\n');
  const data = await completeJson(sys, [{ role: 'user', content: user }]);
  const scores = {};
  let sum = 0;
  let count = 0;
  for (const [k] of DIMENSIONS) {
    const v = Number(data.scores && data.scores[k]);
    const sv = isNaN(v) ? 0 : Math.max(0, Math.min(5, v));
    scores[k] = sv;
    sum += sv; count++;
  }
  const review = {
    scores,
    total: Number.isFinite(Number(data.total)) ? Number(data.total) : Number((sum / Math.max(1, count)).toFixed(1)),
    comment: String(data.comment || ''),
    improvedAnswer: String(data.improvedAnswer || ''),
  };
  turn.review = review;
  await idbPut('sessions', session);
  return review;
}

// ==================== 面试复盘（生成报告） ====================
export function generateReport(session) {
  const reviews = (session.turns || []).filter(t => t.review && t.review.total != null);
  const perDim = {};
  let sumTotal = 0;
  const wrong = [];
  for (const [k] of DIMENSIONS) perDim[k] = [];
  for (const t of reviews) {
    sumTotal += t.review.total;
    for (const [k, label] of DIMENSIONS) {
      const v = t.review.scores[k];
      if (v != null) (perDim[k] = perDim[k] || []).push(v);
    }
    if (t.review.total < 3) wrong.push({ turnNo: t.turnNo, question: t.question, answer: t.answer, total: t.review.total });
  }
  const dimAvgs = {};
  const trendPoints = reviews.map(t => t.review.total);
  for (const [k] of DIMENSIONS) {
    const list = perDim[k] || [];
    dimAvgs[k] = list.length ? Number((list.reduce((a, b) => a + b, 0) / list.length).toFixed(1)) : 0;
  }
  const report = {
    id: session.id,
    mode: session.mode,
    position: session.position,
    createdAt: session.createdAt,
    turnCount: session.turnCount,
    reviewedCount: reviews.length,
    averageScore: reviews.length ? Number((sumTotal / reviews.length).toFixed(1)) : 0,
    perDimensionAvg: dimAvgs,
    trendPoints,
    wrongCount: wrong.length,
  };
  return report;
}

export async function persistReport(session) {
  const report = generateReport(session);
  await idbPut('reports', report);
  return report;
}

// 错题本：从所有报告重建
export async function buildWrongBook() {
  const reports = await idbList('reports');
  const wrong = [];
  const sessions = await idbList('sessions');
  for (const r of reports) {
    const s = sessions.find(x => x.id === r.id);
    if (!s) continue;
    for (const t of (s.turns || [])) {
      if (t.review && t.review.total < 3) {
        wrong.push({
          id: s.id + '-' + t.turnNo,
          sessionId: s.id,
          turnNo: t.turnNo,
          question: t.question,
          answer: t.answer,
          total: t.review.total,
          time: s.createdAt,
        });
      }
    }
  }
  return wrong.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
}

// ==================== AI-6 高频题预测 ====================
export async function predictQuestions() {
  const profiles = await idbList('profile');
  const profile = profiles[profiles.length - 1];
  if (!profile) throw new LlmError('config', '请先在「简历画像」中生成画像');
  const job = jobTargetOf(profile);
  const wrong = await buildWrongBook();
  const sys = '你是面试押题专家，只输出 JSON 数组。';
  const user = [
    `画像：\n${profileText(profile)}`,
    `目标岗位：${job || '未指定'}`,
    wrong.length ? `历史薄弱点：${wrong.map(w => w.question).slice(0, 5).join('；')}` : '',
    `请生成 6 道高频预测题，JSON 格式：`,
    `[{"type":"project|technical|behavior","priority":"high|medium|low","question":"...","basis":"来源依据"}]`,
  ].join('\n');
  const data = await completeJson(sys, [{ role: 'user', content: user }]);
  const list = (Array.isArray(data) ? data : data.items) || [];
  const items = list.filter(Boolean).map((it, i) => ({
    id: uid(),
    type: ['project', 'technical', 'behavior'].includes(it.type) ? it.type : 'technical',
    priority: ['high', 'medium', 'low'].includes(it.priority) ? it.priority : 'medium',
    question: String(it.question || '').trim(),
    basis: String(it.basis || '').trim(),
    createdAt: nowISO(),
  })).filter(it => it.question);
  await idbClear('predictions');
  for (const it of items) await idbPut('predictions', it);
  return items;
}

function profileText(p) {
  if (!p) return '';
  const lines = [];
  if (p.jobTarget) lines.push(`目标岗位：${p.jobTarget}`);
  if (p.techStack && p.techStack.length) lines.push(`技术栈：${p.techStack.join(', ')}`);
  if (p.projects && p.projects.length) {
    lines.push('项目经历：');
    for (const pr of p.projects) {
      lines.push(`- ${pr.name}：${pr.description}（${(pr.technology || []).join('/')}）`);
    }
  }
  if (p.responsibilities && p.responsibilities.length) lines.push(`职责：${p.responsibilities.join('；')}`);
  if (p.highlights && p.highlights.length) lines.push(`亮点：${p.highlights.join('；')}`);
  return lines.join('\n');
}