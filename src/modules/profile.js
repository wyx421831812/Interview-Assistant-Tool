/**
 * modules/profile.js — 简历解析与画像
 */
import { idbList, idbPut, uid, nowISO, fmtTime } from '../core/store.js';
import { parseResume } from '../core/services.js';
import { esc, toast, loadingBtn } from './ui.js';

let currentProfile = null;
let containerRef = null;

export async function mount(container) {
  containerRef = container;
  const profiles = await idbList('profile');
  currentProfile = profiles[profiles.length - 1] || null;
  render();
}

function render() {
  const p = currentProfile;
  containerRef.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">简历画像</h1>
        <div class="view-desc">粘贴简历文本，AI 自动提取项目、技术栈、职责与亮点，生成可编辑的面试画像。</div>
      </div>
    </div>

    ${!p ? `
    <div class="card">
      <div class="card-title">导入并解析简历</div>
      <label class="label">简历文本（支持粘贴或上传 .txt/.md 内容）</label>
      <textarea class="textarea" id="resume-text" placeholder="粘贴你的简历文本…" style="min-height:220px"></textarea>
      <div style="margin-top:12px;display:flex;gap:10px;align-items:center">
        <label class="btn">上传文件<input type="file" id="resume-file" accept=".txt,.md,.text" hidden /></label>
        <button class="btn primary" id="btn-parse">解析生成画像</button>
        <span id="parse-hint" class="hint"></span>
      </div>
    </div>` : ''}

    <div class="card">
      <div class="card-title">${p ? `当前画像 · 更新于 ${fmtTime(p.updatedAt)}` : '当前画像'}</div>
      ${p ? editorHtml(p) : '<div class="empty-box"><span class="em">▣</span>尚未生成画像，先在上方导入简历。</div>'}
    </div>
  `;
  bindParse();
  bindEditor();
}

function editorHtml(p) {
  return `
    <label class="label">目标岗位</label>
    <input class="input" id="pe-jobtarget" value="${esc(p.jobTarget || '')}" placeholder="例如：高级前端工程师" />

    <label class="label">技术栈</label>
    <div class="tags" id="pe-tech">${(p.techStack || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    <input class="input" id="pe-tech-input" placeholder="输入技术关键词后回车添加" style="margin-top:8px" />

    <label class="label">职责（每行一条）</label>
    <textarea class="textarea" id="pe-resp">${esc((p.responsibilities || []).join('\n'))}</textarea>

    <label class="label">亮点 / 成就（每行一条）</label>
    <textarea class="textarea" id="pe-high">${esc((p.highlights || []).join('\n'))}</textarea>

    <label class="label">项目经历</label>
    ${(p.projects || []).map((pr, i) => `
      <div class="card" style="background:var(--bg)">
        <div style="display:flex;gap:8px;align-items:center">
          <input class="input" data-pname="${i}" value="${esc(pr.name)}" placeholder="项目名" />
          <button class="btn danger sm" data-pdel="${i}">删除</button>
        </div>
        <input class="input" data-pdesc="${i}" value="${esc(pr.description)}" placeholder="一句话描述" style="margin-top:6px" />
        <input class="input" data-ptech="${i}" value="${esc((pr.technology || []).join(', '))}" placeholder="技术栈（逗号分隔）" style="margin-top:6px" />
      </div>`).join('')}
    <button class="btn sm" id="pe-add-project" style="margin-top:8px">+ 添加项目</button>

    <div style="margin-top:18px;display:flex;gap:10px">
      <button class="btn primary" id="pe-save">保存画像</button>
    </div>
  `;
}

function bindParse() {
  const fileInput = containerRef.querySelector('#resume-file');
  if (fileInput) {
    fileInput.addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { containerRef.querySelector('#resume-text').value = r.result; };
      r.readAsText(f);
    });
  }
  const btnParse = containerRef.querySelector('#btn-parse');
  if (btnParse) {
    btnParse.addEventListener('click', async () => {
      const text = containerRef.querySelector('#resume-text').value;
      const hint = containerRef.querySelector('#parse-hint');
      hint.textContent = '';
      loadingBtn(btnParse, true, '解析中…');
      try {
        const parsed = await parseResume(text);
        const prevJob = currentProfile && currentProfile.jobTarget;
        parsed.id = uid();
        parsed.jobTarget = parsed.jobTarget || prevJob || '';
        parsed.updatedAt = nowISO();
        currentProfile = parsed;
        await idbPut('profile', parsed);
        toast('解析成功，已生成画像', 'ok');
        render();
      } catch (e) {
        hint.textContent = e.message;
        hint.style.color = '#d5484d';
        toast(e.message, 'err');
      } finally {
        loadingBtn(btnParse, false);
      }
    });
  }
}

function bindEditor() {
  if (!currentProfile) return;

  const techInput = containerRef.querySelector('#pe-tech-input');
  if (techInput) {
    techInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const v = techInput.value.trim();
        if (v) {
          currentProfile.techStack = currentProfile.techStack || [];
          currentProfile.techStack.push(v);
          techInput.value = '';
          render();
        }
        e.preventDefault();
      }
    });
  }

  const addProject = containerRef.querySelector('#pe-add-project');
  if (addProject) {
    addProject.addEventListener('click', () => {
      currentProfile.projects = currentProfile.projects || [];
      currentProfile.projects.push({ name: '', description: '', technology: [], star: null });
      render();
    });
  }

  containerRef.querySelectorAll('[data-pdel]').forEach(b => {
    b.addEventListener('click', () => {
      currentProfile.projects.splice(Number(b.dataset.pdel), 1);
      render();
    });
  });

  const save = containerRef.querySelector('#pe-save');
  if (save) {
    save.addEventListener('click', async () => {
      const p = currentProfile;
      p.jobTarget = containerRef.querySelector('#pe-jobtarget').value.trim();
      p.techStack = [...new Set(p.techStack || [])];
      p.responsibilities = containerRef.querySelector('#pe-resp').value.split('\n').map(s => s.trim()).filter(Boolean);
      p.highlights = containerRef.querySelector('#pe-high').value.split('\n').map(s => s.trim()).filter(Boolean);
      (p.projects || []).forEach((pr, i) => {
        const name = containerRef.querySelector(`[data-pname="${i}"]`).value.trim();
        if (!name) return;
        pr.name = name;
        pr.description = containerRef.querySelector(`[data-pdesc="${i}"]`).value.trim();
        pr.technology = containerRef.querySelector(`[data-ptech="${i}"]`).value.split(',').map(s => s.trim()).filter(Boolean);
      });
      p.projects = (p.projects || []).filter(pr => pr.name);
      p.updatedAt = nowISO();
      await idbPut('profile', p);
      toast('画像已保存', 'ok');
      render();
    });
  }
}