/**
 * core/services.js — 领域服务编排
 * 将 LLM 调用与本地数据结合，实现六大模块的业务逻辑。
 */
import { completeJson, completeText, LlmError } from './llm.js';
import { idbPut, idbGet, idbList, idbDelete, idbClear, uid, nowISO, loadSettings } from './store.js';

const DIMENSIONS = [
  ['depth', '技术深度'],
  ['structure', '完整度(STAR)'],
  ['clarity', '表达条理'],
  ['fit', '与项目契合度'],
  ['improvement', '改进空间'],
];

// 人事（HR）面试点评维度
const DIMENSIONS_HR = [
  ['motivation', '求职动机'],
  ['stability', '稳定性'],
  ['clarity', '表达条理'],
  ['fit', '城市/岗位匹配'],
  ['salary', '薪资合理性'],
];

export function dimensionLabels(mode) {
  return mode === 'hr' ? DIMENSIONS_HR : DIMENSIONS;
}

// 从设置或简历中取目标岗位
function jobTargetOf(profile) {
  return (profile && profile.jobTarget) || loadSettings().jobTarget || '';
}

// ==================== AI-1 简历解析 ====================
function resumeParsePrompt(resumeRef) {
  return [
    '请根据以下简历内容，解析为 JSON，字段：',
    '{ "projects": [{"name":"项目名","description":"一句话描述","technology":["技术栈"]}],',
    '  "techStack": ["技术栈列表"], "responsibilities": ["职责"], "highlights": ["亮点/成就"],',
    '  "jobTarget": "推断的目标岗位或填空" }',
    '若某字段无法判断则留空数组或空串。不要捏造简历中没有的内容。',
    '\n简历内容：\n' + resumeRef,
  ].join('\n');
}

// 文本简历解析
export async function parseResume(text) {
  if (!text || !text.trim()) throw new LlmError('config', '简历内容为空');
  const sys = '你是资深技术面试官。请从简历中提取结构化面试画像，只输出 JSON。';
  const data = await completeJson(sys, [{ role: 'user', content: resumeParsePrompt(text) }]);
  return normalizeProfile(data);
}

// 图片/扫描件简历解析（parts 为 OpenAI 多模态内容块，含 image_url）
export async function parseResumeFromParts(parts) {
  if (!Array.isArray(parts) || !parts.length) throw new LlmError('config', '简历内容为空');
  const sys = '你是资深技术面试官。请仔细阅读简历图片/页面中的文字，提取结构化面试画像，只输出 JSON。';
  const content = [{ type: 'text', text: resumeParsePrompt('见下方文本/随附图片，请逐页识别后解析。') }, ...parts];
  const data = await completeJson(sys, [{ role: 'user', content }]);
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
  hr: '人事面试',
};

export function modeLabel(m) { return MODE_LABEL[m] || m; }

export async function startInterview(cfg) {
  const profile = await idbGet('profile', cfg.profileId);
  const session = {
    id: uid(),
    mode: cfg.mode,
    profileId: cfg.profileId,
    position: jobTargetOf(profile),
    city: cfg.city || '',
    stage: cfg.stage || '',
    salary: cfg.salary || '',
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
  const history = durationHistory(session);
  let sys;
  let user;
  if (session.mode === 'hr') {
    // 人事面试：HR 人设 + 城市/身份/薪资上下文，围绕人事话题出题
    sys = '你是一位经验丰富的人事（HR）面试官，正在进行 HR 面/综合面。只输出 JSON {"question":"..."}。';
    user = [
      '面试模式：人事面试',
      session.city ? `面试城市：${session.city}` : '',
      session.stage ? `求职身份：${session.stage === 'campus' ? '应届生/校招' : '社招'}` : '',
      session.salary ? `期望薪资范围：${session.salary}` : '',
      `目标岗位：${session.position || '未指定'}`,
      `画像：\n${profileText(session.profile)}`,
      history.length ? `\n已有对话：\n${history.join('\n')}` : '',
      lastAnswer
        ? `\n候选人上一轮回答：${lastAnswer}\n请从人事视角针对其中含糊、矛盾或值得深挖的点追问。`
        : '\n请提出第一轮人事面试问题，建议从求职动机切入（如为什么选择这个城市、为什么考虑我们）。',
      '出题要求：围绕求职动机、城市选择原因、异地工作意愿与稳定性、离职原因、职业规划、团队协作与沟通、抗压能力、薪资期望等人事话题；不要问技术细节；语气自然、贴近真实 HR 面。',
    ].filter(Boolean).join('\n');
  } else {
    sys = '你是严格专业的面试官，根据候选人画像提问，只输出 JSON {"question":"..."}。不得询问画像之外的虚构项目。';
    user = [
      `面试模式：${MODE_LABEL[session.mode] || session.mode}`,
      `目标岗位：${session.position || '未指定'}`,
      `画像：\n${profileText(session.profile)}`,
      history.length ? `\n已有对话：\n${history.join('\n')}` : '',
      lastAnswer ? `\n候选人上一轮回答：${lastAnswer}\n请针对其中技术细节或薄弱点追问。` : '\n请提出第一轮面试问题。',
    ].join('\n');
  }
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
  const isHr = session.mode === 'hr';
  const dimsDef = dimensionLabels(session.mode);
  const sys = isHr
    ? '你是资深 HR 面试官与沟通教练。请从人事视角对候选人回答进行结构化点评，只输出 JSON。'
    : '你是资深面试官与表达教练。请对候选人回答进行结构化点评，只输出 JSON。';
  const dims = dimsDef.map(([k, l]) => `"${k}": 0-5 分`).join(', ');
  const user = [
    `问题：${turn.question}`,
    `候选人回答：${turn.answer}`,
    `画像：\n${profileText(session.profile)}`,
    isHr && session.city ? `面试城市：${session.city}` : '',
    `请输出 JSON：{"scores": {${dims}}, "total": 总分数字, "comment": "一段总体评价", "improvedAnswer": "改进版回答示范${isHr ? '（真诚自然、符合 HR 面语境）' : '（STAR 结构）'}"}`,
  ].filter(Boolean).join('\n');
  const data = await completeJson(sys, [{ role: 'user', content: user }]);
  const scores = {};
  let sum = 0;
  let count = 0;
  for (const [k] of dimsDef) {
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
  const dimsDef = dimensionLabels(session.mode);
  const perDim = {};
  let sumTotal = 0;
  const wrong = [];
  for (const [k] of dimsDef) perDim[k] = [];
  for (const t of reviews) {
    sumTotal += t.review.total;
    for (const [k, label] of dimsDef) {
      const v = t.review.scores[k];
      if (v != null) (perDim[k] = perDim[k] || []).push(v);
    }
    if (t.review.total < 3) wrong.push({ turnNo: t.turnNo, question: t.question, answer: t.answer, total: t.review.total });
  }
  const dimAvgs = {};
  const trendPoints = reviews.map(t => t.review.total);
  for (const [k] of dimsDef) {
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

// ==================== AI-7 简历优化 ====================
const RESUME_OPT_INPUT_LIMIT = 12000; // 简历原文最大注入长度，控制 token

function resumeOptimizePrompt(resumeText, jobTarget) {
  return [
    '请对以下简历进行优化分析，输出 JSON，字段：',
    '{',
    '  "overallScore": 0-100 的整数，简历总体评分,',
    '  "summary": "总体评价，100 字以内，指出最关键的 3 个问题与最大优势",',
    '  "formatIssues": [{"issue": "格式/结构问题", "suggestion": "修改建议"}],',
    '  "wordingIssues": [{"original": "原文片段", "problem": "存在的问题", "suggestion": "改写建议"}],',
    '  "projectRewrites": [{"name": "项目名", "original": "原项目描述", "rewritten": "优化后的项目描述（突出量化成果与亮点）", "reason": "优化理由"}],',
    '  "strengths": ["可进一步挖掘或放大的亮点，以及内容补强建议"],',
    '  "optimizedResume": "优化后的完整简历文本（保留真实信息，润色措辞与结构，纯文本排版）"',
    '}',
    '要求：不捏造简历中不存在的经历与数据；如需补充量化数字，用「需本人确认」标注。',
    jobTarget ? `目标岗位：${jobTarget}，请针对该岗位优化关键词与内容侧重。` : '目标岗位：未指定，按通用最佳实践优化。',
    `\n简历原文：\n${resumeText.slice(0, RESUME_OPT_INPUT_LIMIT)}`,
  ].join('\n');
}

export async function optimizeResume(rawText, { jobTarget } = {}) {
  if (!rawText || !rawText.trim()) throw new LlmError('config', '简历内容为空，请先上传文件或粘贴文本');
  const sys = '你是资深 HR 与简历优化专家，熟悉 ATS 筛选规则与招聘方阅读习惯。只输出 JSON。';
  const data = await completeJson(sys, [{ role: 'user', content: resumeOptimizePrompt(rawText, jobTarget) }], { maxTokens: 8000 });
  return normalizeResumeOpt(data);
}

function normalizeResumeOpt(d) {
  d = d || {};
  return {
    overallScore: Math.max(0, Math.min(100, Math.round(Number(d.overallScore) || 0))),
    summary: String(d.summary || ''),
    formatIssues: optItems(d.formatIssues, ['issue', 'suggestion']),
    wordingIssues: optItems(d.wordingIssues, ['original', 'problem', 'suggestion']),
    projectRewrites: optItems(d.projectRewrites, ['name', 'original', 'rewritten', 'reason']),
    strengths: arr(d.strengths),
    optimizedResume: String(d.optimizedResume || ''),
  };
}

function optItems(v, keys) {
  return (Array.isArray(v) ? v : []).filter(it => it && typeof it === 'object').map(it => {
    const o = {};
    for (const k of keys) o[k] = String(it[k] || '').trim();
    return o;
  }).filter(o => keys.some(k => o[k]));
}

// 保存优化记录（简历原文与报告分离存储）
export async function saveResumeOptimization(rawText, report, meta = {}) {
  const resumeId = uid();
  await idbPut('resumes', {
    id: resumeId,
    text: rawText,
    fileName: meta.fileName || '',
    kind: meta.kind || '',
    createdAt: nowISO(),
  });
  const rec = {
    id: uid(),
    resumeId,
    jobTarget: meta.jobTarget || '',
    report,
    createdAt: nowISO(),
  };
  await idbPut('resumeOpts', rec);
  return rec;
}

export async function listResumeOptimizations() {
  const [opts, resumes] = await Promise.all([idbList('resumeOpts'), idbList('resumes')]);
  return opts
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .map(o => ({ ...o, resume: resumes.find(r => r.id === o.resumeId) || null }));
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