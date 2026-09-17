/**
 * modules/resume-optimize.js — 简历优化
 * 上传/粘贴简历 → AI 生成结构化优化方案（评分/格式/措辞/项目改写/优化后全文），
 * 支持历史记录、一键复制与 Markdown 导出。
 */
import { extractDocText } from '../core/fileparse.js';
import { optimizeResume, saveResumeOptimization, listResumeOptimizations } from '../core/services.js';
import { loadSettings, fmtTime, idbDelete } from '../core/store.js';
import { esc, toast, loadingBtn, confirmModal } from './ui.js';

let containerRef = null;
let records = [];   // 历史优化记录（含简历原文引用）
let current = null; // 当前查看的记录
let pendingFile = null;

export async function mount(container) {
  containerRef = container;
  records = await listResumeOptimizations();
  current = null;
  pendingFile = null;
  render();
}

function render() {
  containerRef.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">简历优化</h1>
        <div class="view-desc">上传或粘贴简历，AI 从格式、措辞、项目描述等维度给出优化方案与优化后全文。</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">导入简历</div>
      <label class="label">简历文本（支持上传 .txt/.md/.pdf/.docx，或直接粘贴）</label>
      <textarea class="textarea" id="ro-text" placeholder="粘贴你的简历文本，或点击下方上传文件自动提取…" style="min-height:200px"></textarea>
      <div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <label class="btn">上传文件<input type="file" id="ro-file" accept=".txt,.md,.text,.pdf,.docx" hidden /></label>
        <input class="input" id="ro-jobtarget" placeholder="目标岗位（选填，例如：高级前端工程师）" value="${esc(loadSettings().jobTarget || '')}" style="max-width:280px" />
        <button class="btn primary" id="ro-run">生成优化方案</button>
        <span id="ro-file-status" class="hint"></span>
        <span id="ro-hint" class="hint"></span>
      </div>
      <div class="hint" style="margin-top:6px">扫描版 PDF 可能无法提取文字，请直接粘贴文本。优化完整简历输出较长，约需 1-2 分钟。</div>
    </div>

    <div id="ro-report">${current ? reportHtml(current) : ''}</div>

    <div class="card">
      <div class="card-title">历史优化记录</div>
      ${records.length ? records.map(rec => `
        <div class="list-item">
          <div class="item-main">
            <div class="item-title">${esc(rec.resume && rec.resume.fileName ? rec.resume.fileName : '粘贴文本')} · ${rec.report ? rec.report.overallScore : '—'} 分</div>
            <div class="item-sub">${fmtTime(rec.createdAt)}${rec.jobTarget ? ' · ' + esc(rec.jobTarget) : ''}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn ghost sm" data-ro-view="${rec.id}">查看</button>
            <button class="btn danger sm" data-ro-del="${rec.id}">删除</button>
          </div>
        </div>`).join('') : '<div class="empty-box"><span class="em">✎</span>暂无优化记录，先在上方导入简历。</div>'}
    </div>
  `;
  bind();
}

function reportHtml(rec) {
  const r = rec.report || {};
  return `
    <div class="card">
      <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <span>优化报告${rec.jobTarget ? ` · 目标岗位：${esc(rec.jobTarget)}` : ''} · ${fmtTime(rec.createdAt)}</span>
        <span style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn sm" id="ro-copy">复制优化后简历</button>
          <button class="btn sm" id="ro-export">导出 Markdown</button>
          <button class="btn ghost sm" id="ro-close">关闭</button>
        </span>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat-value">${r.overallScore != null ? r.overallScore : '—'}</div><div class="stat-label">总体评分 /100</div></div>
        <div class="stat"><div class="stat-value">${(r.formatIssues || []).length}</div><div class="stat-label">格式问题</div></div>
        <div class="stat"><div class="stat-value">${(r.wordingIssues || []).length}</div><div class="stat-label">措辞建议</div></div>
        <div class="stat"><div class="stat-value">${(r.projectRewrites || []).length}</div><div class="stat-label">项目改写</div></div>
      </div>
      ${r.summary ? `<div style="margin-top:12px;line-height:1.7">${esc(r.summary)}</div>` : ''}
      ${section('格式问题', (r.formatIssues || []).map(fi => `
        <div class="list-item"><div class="item-main">
          <div class="item-title">${esc(fi.issue)}</div>
          <div class="item-sub">建议：${esc(fi.suggestion)}</div>
        </div></div>`).join(''), '未发现明显格式问题。')}
      ${section('措辞优化', (r.wordingIssues || []).map(w => `
        <div class="list-item"><div class="item-main">
          <div class="item-title">原文：${esc(w.original)}</div>
          <div class="item-sub">问题：${esc(w.problem)}</div>
          <div class="item-sub">建议：${esc(w.suggestion)}</div>
        </div></div>`).join(''), '未发现明显措辞问题。')}
      ${section('项目描述改写（前后对照）', (r.projectRewrites || []).map(p => `
        <div class="list-item"><div class="item-main">
          <div class="item-title">${esc(p.name || '项目')}</div>
          <div class="item-sub">原描述：${esc(p.original)}</div>
          <div class="item-sub">优化后：${esc(p.rewritten)}</div>
          <div class="item-sub">理由：${esc(p.reason)}</div>
        </div></div>`).join(''), '未提供项目改写。')}
      ${section('亮点挖掘与补强建议', (r.strengths || []).map(s => `
        <div class="list-item"><div class="item-main"><div class="item-title">${esc(s)}</div></div></div>`).join(''), '暂无。')}
      ${r.optimizedResume ? `
        <div class="review-block" style="margin-top:16px">
          <div class="rb-title">优化后完整简历</div>
          <div style="white-space:pre-wrap;line-height:1.7">${esc(r.optimizedResume)}</div>
        </div>` : ''}
    </div>`;
}

function section(title, inner, empty) {
  return `
    <div style="margin-top:16px">
      <div class="card-title">${title}</div>
      ${inner || `<div class="empty-box">${empty || '暂无'}</div>`}
    </div>`;
}

function bind() {
  const c = containerRef;

  const fileInput = c.querySelector('#ro-file');
  if (fileInput) {
    fileInput.addEventListener('change', async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const status = c.querySelector('#ro-file-status');
      try {
        status.textContent = '正在解析文件…';
        status.style.color = '';
        const r = await extractDocText(f);
        if (!r.text || r.text.replace(/\s/g, '').length < 20) {
          throw new Error('未能提取到有效文字（可能是扫描版 PDF），请直接粘贴简历文本');
        }
        c.querySelector('#ro-text').value = r.text;
        pendingFile = { name: f.name, kind: r.kind };
        status.textContent = `已载入：${f.name}${r.pageCount ? `（${r.pageCount} 页）` : ''}`;
      } catch (err) {
        pendingFile = null;
        status.textContent = '文件处理失败：' + (err && err.message ? err.message : '未知错误');
        status.style.color = '#d5484d';
      }
    });
  }

  const runBtn = c.querySelector('#ro-run');
  if (runBtn) {
    runBtn.addEventListener('click', async () => {
      const text = c.querySelector('#ro-text').value.trim();
      const hint = c.querySelector('#ro-hint');
      hint.textContent = '';
      if (!text) { toast('请先上传简历文件或粘贴简历文本', 'err'); return; }
      loadingBtn(runBtn, true, '优化分析中…（约 1-2 分钟）');
      try {
        const jobTarget = c.querySelector('#ro-jobtarget').value.trim();
        const report = await optimizeResume(text, { jobTarget });
        current = await saveResumeOptimization(text, report, {
          fileName: pendingFile ? pendingFile.name : '',
          kind: pendingFile ? pendingFile.kind : '',
          jobTarget,
        });
        records = await listResumeOptimizations();
        toast('优化方案已生成', 'ok');
        render();
        const box = c.querySelector('#ro-report');
        if (box && box.firstElementChild) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        hint.textContent = e.message;
        hint.style.color = '#d5484d';
        toast(e.message, 'err');
      } finally {
        loadingBtn(runBtn, false);
      }
    });
  }

  const copyBtn = c.querySelector('#ro-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      if (!current || !current.report || !current.report.optimizedResume) return;
      try {
        await copyText(current.report.optimizedResume);
        toast('已复制优化后简历', 'ok');
      } catch {
        toast('复制失败，请手动选择文本复制', 'err');
      }
    });
  }

  const exportBtn = c.querySelector('#ro-export');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (!current) return;
      const name = `简历优化报告-${fmtTime(current.createdAt).replace(/[: ]/g, '-')}.md`;
      download(name, reportToMarkdown(current));
      toast('已导出 Markdown', 'ok');
    });
  }

  const closeBtn = c.querySelector('#ro-close');
  if (closeBtn) closeBtn.addEventListener('click', () => { current = null; render(); });

  c.querySelectorAll('[data-ro-view]').forEach(b => b.addEventListener('click', () => {
    current = records.find(r => r.id === b.dataset.roView) || null;
    render();
  }));

  c.querySelectorAll('[data-ro-del]').forEach(b => b.addEventListener('click', async () => {
    const rec = records.find(r => r.id === b.dataset.roDel);
    if (!rec) return;
    const ok = await confirmModal({
      title: '删除记录',
      body: '将删除该条优化记录及其保存的简历原文，确定删除？',
      danger: true,
      okText: '删除',
    });
    if (!ok) return;
    await idbDelete('resumeOpts', rec.id);
    if (rec.resumeId) await idbDelete('resumes', rec.resumeId);
    records = await listResumeOptimizations();
    if (current && current.id === rec.id) current = null;
    toast('已删除', 'ok');
    render();
  }));
}

function reportToMarkdown(rec) {
  const r = rec.report || {};
  const lines = [];
  lines.push('# 简历优化报告', '');
  lines.push(`- 生成时间：${fmtTime(rec.createdAt)}`);
  if (rec.jobTarget) lines.push(`- 目标岗位：${rec.jobTarget}`);
  lines.push('', `## 总体评分：${r.overallScore != null ? r.overallScore : '—'}/100`, '');
  if (r.summary) lines.push(r.summary, '');
  if ((r.formatIssues || []).length) {
    lines.push('## 格式问题', '');
    r.formatIssues.forEach(fi => lines.push(`- **问题**：${fi.issue}`, `  - 建议：${fi.suggestion}`));
    lines.push('');
  }
  if ((r.wordingIssues || []).length) {
    lines.push('## 措辞优化', '');
    r.wordingIssues.forEach(w => lines.push(`- **原文**：${w.original}`, `  - 问题：${w.problem}`, `  - 建议：${w.suggestion}`));
    lines.push('');
  }
  if ((r.projectRewrites || []).length) {
    lines.push('## 项目描述改写', '');
    r.projectRewrites.forEach(p => lines.push(`### ${p.name || '项目'}`, '', `- 原描述：${p.original}`, `- 优化后：${p.rewritten}`, `- 理由：${p.reason}`, ''));
  }
  if ((r.strengths || []).length) {
    lines.push('## 亮点挖掘与补强建议', '');
    r.strengths.forEach(s => lines.push(`- ${s}`));
    lines.push('');
  }
  if (r.optimizedResume) lines.push('## 优化后完整简历', '', r.optimizedResume, '');
  return lines.join('\n');
}

async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

function download(filename, content) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
