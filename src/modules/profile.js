/**
 * modules/profile.js — 简历解析与画像
 */
import { idbList, idbPut, uid, nowISO, fmtTime } from '../core/store.js';
import { parseResume, parseResumeFromParts } from '../core/services.js';
import { loadPdfjs } from '../core/fileparse.js';
import { esc, toast, loadingBtn } from './ui.js';

let currentProfile = null;
let containerRef = null;
let pendingParts = []; // 待解析的图片内容块（OpenAI image_url 格式）

export async function mount(container) {
  containerRef = container;
  pendingParts = [];
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
        <div class="view-desc">上传 PDF / 图片或粘贴简历文本，AI 自动提取项目、技术栈、职责与亮点，生成可编辑的面试画像。</div>
      </div>
    </div>

    ${!p ? `
    <div class="card">
      <div class="card-title">导入并解析简历</div>
      <label class="label">简历文本（支持粘贴，或上传 .txt/.md/.pdf 与图片）</label>
      <textarea class="textarea" id="resume-text" placeholder="粘贴你的简历文本，或直接在下方上传 PDF / 图片…" style="min-height:220px"></textarea>
      <div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <label class="btn">上传文件<input type="file" id="resume-file" accept=".txt,.md,.text,.pdf,image/png,image/jpeg,image/webp" hidden /></label>
        <button class="btn primary" id="btn-parse">解析生成画像</button>
        <span id="file-status" class="hint"></span>
        <span id="parse-hint" class="hint"></span>
      </div>
      <div class="hint" style="margin-top:6px">PDF 自动提取文字；扫描版 PDF 与图片（png/jpg/webp）将使用视觉模型识别，需在设置中配置支持视觉的模型。</div>
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

function fileStatus(html, isError) {
  const el = containerRef.querySelector('#file-status');
  if (!el) return;
  el.innerHTML = html;
  el.style.color = isError ? '#d5484d' : '';
  const clearBtn = el.querySelector('#btn-clear-attach');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      pendingParts = [];
      fileStatus('');
    });
  }
}

// 位图缩放转为 JPEG dataURL，控制请求体大小
async function bitmapToJpegPart(source, srcW, srcH) {
  const maxDim = 1600;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  const url = canvas.toDataURL('image/jpeg', 0.85);
  return { type: 'image_url', image_url: { url } };
}

async function imageToPart(file) {
  const bitmap = await createImageBitmap(file);
  try {
    return await bitmapToJpegPart(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

// PDF 处理：优先提取内嵌文字；几乎无文字（扫描件）时逐页渲染为图片
async function pdfToContent(file) {
  const lib = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await lib.getDocument({ data: buf }).promise;
  const pageCount = doc.numPages;
  const pageLimit = Math.min(pageCount, 8);
  let text = '';
  for (let i = 1; i <= pageLimit; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
  }
  if (text.replace(/\s/g, '').length >= 80) {
    return { mode: 'text', text: text.trim(), pageCount };
  }
  const parts = [];
  for (let i = 1; i <= pageLimit; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(2, 1600 / base.width) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    parts.push({ type: 'image_url', image_url: { url: canvas.toDataURL('image/jpeg', 0.85) } });
  }
  return { mode: 'image', parts, pageCount, pageLimit };
}

function bindParse() {
  const fileInput = containerRef.querySelector('#resume-file');
  if (fileInput) {
    fileInput.addEventListener('change', async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const textArea = containerRef.querySelector('#resume-text');
      try {
        if (/\.(txt|md|text)$/i.test(f.name)) {
          const text = await f.text();
          textArea.value = text;
          pendingParts = [];
          fileStatus(`已载入文本：${esc(f.name)}`);
        } else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
          fileStatus('正在解析 PDF…');
          const r = await pdfToContent(f);
          if (r.mode === 'text') {
            textArea.value = r.text;
            pendingParts = [];
            fileStatus(`已提取 PDF 文本（${r.pageCount} 页）：${esc(f.name)}，可编辑后解析`);
          } else {
            pendingParts = r.parts;
            textArea.value = '';
            const extra = r.pageCount > r.pageLimit ? `（仅取前 ${r.pageLimit} 页）` : '';
            fileStatus(`扫描版 PDF 已转 ${r.parts.length} 页图片${extra}：${esc(f.name)} <button class="btn sm ghost" id="btn-clear-attach">移除</button>`);
          }
        } else if (f.type.startsWith('image/')) {
          fileStatus('正在处理图片…');
          pendingParts = [await imageToPart(f)];
          fileStatus(`已附加图片：${esc(f.name)} <button class="btn sm ghost" id="btn-clear-attach">移除</button>`);
        } else {
          pendingParts = [];
          fileStatus('不支持的文件格式，请选择 .txt/.md/.pdf 或图片', true);
        }
      } catch (err) {
        pendingParts = [];
        fileStatus('文件处理失败：' + (err && err.message ? err.message : '未知错误'), true);
      }
    });
  }
  const btnParse = containerRef.querySelector('#btn-parse');
  if (btnParse) {
    btnParse.addEventListener('click', async () => {
      const text = containerRef.querySelector('#resume-text').value.trim();
      const hint = containerRef.querySelector('#parse-hint');
      hint.textContent = '';
      if (!text && !pendingParts.length) {
        hint.textContent = '请先粘贴简历文本或上传文件';
        hint.style.color = '#d5484d';
        return;
      }
      loadingBtn(btnParse, true, '解析中…');
      try {
        let parsed;
        if (pendingParts.length) {
          const parts = [];
          if (text) parts.push({ type: 'text', text });
          parts.push(...pendingParts);
          parsed = await parseResumeFromParts(parts);
        } else {
          parsed = await parseResume(text);
        }
        const prevJob = currentProfile && currentProfile.jobTarget;
        parsed.id = uid();
        parsed.jobTarget = parsed.jobTarget || prevJob || '';
        parsed.updatedAt = nowISO();
        currentProfile = parsed;
        await idbPut('profile', parsed);
        pendingParts = [];
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