/**
 * modules/notes.js — 笔记知识库
 * 导入/编辑面试笔记，按项目与主题归类，支持关键词检索。
 */
import { idbList, idbPut, idbDelete, idbGet, uid, nowISO, fmtTime } from '../core/store.js';
import { searchNotes } from '../core/services.js';
import { extractDocText } from '../core/fileparse.js';
import { esc, toast, confirmModal } from './ui.js';

let profiles = [];

export async function mount(container) {
  profiles = await idbList('profile');
  const notes = await idbList('notes');
  renderList(container, notes, '');
}

function renderList(container, notes, query) {
  const results = searchNotes(notes, query);
  const hide = !!query;
  container.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">笔记知识库</h1>
        <div class="view-desc">沉淀面试笔记与话术，按项目/主题归类，支持关键词检索，供面试中引用。</div>
      </div>
      <button class="btn primary" data-new>+ 新建笔记</button>
    </div>

    <div class="card">
      <div class="card-title">检索</div>
      <input class="input" id="note-search" placeholder="输入关键词搜索笔记（标题优先加权）…" value="${esc(query)}" />
    </div>

    <div class="card">
      ${notes.length === 0 ? '<div class="empty-box"><span class="em">☰</span>还没有笔记，点击右上角「新建笔记」开始。</div>' : `
        <div id="note-list">
        ${(hide ? results.map(r => r.note) : notes).map(noteItemHtml).join('')}
        </div>
        ${hide ? `<div class="hint">${results.length} 条命中「${esc(query)}」</div>` : ''}
      `}
    </div>
  `;

  const search = container.querySelector('#note-search');
  if (search) {
    let t = null;
    search.addEventListener('input', e => {
      clearTimeout(t);
      t = setTimeout(() => {
        const q = e.target.value;
        if (!q && container.querySelector('#note-list')) {
          renderList(container, notes, '');
          return;
        }
        const r = searchNotes(notes, q);
        const list = container.querySelector('#note-list');
        if (list) {
          const shown = r.map(x => x.note);
          list.innerHTML = shown.map(noteItemHtml).join('')
            || '<div class="empty-box"><span class="em">?</span>无匹配笔记</div>';
        }
      }, 180);
    });
  }

  container.querySelectorAll('[data-new]').forEach(b => {
    b.addEventListener('click', () => openEditor(container, null));
  });
  container.querySelectorAll('[data-edit]').forEach(b => {
    b.addEventListener('click', () => {
      const n = notes.find(x => x.id === b.dataset.edit);
      openEditor(container, n);
    });
  });
  container.querySelectorAll('[data-del]').forEach(b => {
    b.addEventListener('click', async () => {
      const n = notes.find(x => x.id === b.dataset.del);
      const ok = await confirmModal({ title: '删除笔记', body: `确认删除「${n.title}」？此操作仅影响本地数据。`, okText: '删除', danger: true });
      if (!ok) return;
      await idbDelete('notes', n.id);
      toast('已删除', 'ok');
      mount(container);
    });
  });
}

function noteItemHtml(n) {
  const proj = profiles.find(p => (p.projects || []).some(pr => pr.name === n.projectId));
  return `
    <div class="list-item">
      <div class="item-main">
        <div class="item-title">${esc(n.title)}</div>
        <div class="item-sub">
          ${n.projectId ? `<b>${esc(n.projectId)}</b> · ` : ''}${fmtTime(n.createdAt)}
          ${(n.tags || []).map(t => `<span class="tag" style="margin-left:6px">${esc(t)}</span>`).join('')}
        </div>
        <div class="item-sub" style="margin-top:4px;color:var(--text);white-space:pre-wrap;max-height:44px;overflow:hidden">${esc(n.content.slice(0, 120))}${n.content.length > 120 ? '…' : ''}</div>
      </div>
      <div class="item-actions">
        <button class="btn ghost sm" data-edit="${n.id}">编辑</button>
        <button class="btn ghost sm" data-del="${n.id}">删除</button>
      </div>
    </div>
  `;
}

async function openEditor(container, note) {
  const projects = [];
  for (const p of profiles) {
    for (const pr of (p.projects || [])) projects.push(pr.name);
  }
  const n = note || { title: '', content: '', projectId: '', tags: [], createdAt: nowISO() };
  container.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">${note ? '编辑笔记' : '新建笔记'}</h1>
        <div class="view-desc">标题与正文为必填，所属项目与主题标签可选。支持导入 .txt/.md/.pdf/.docx 文档，自动填入正文。</div>
      </div>
    </div>
    <div class="card" style="max-width:760px">
      <label class="label">标题 *</label>
      <input class="input" id="n-title" value="${esc(n.title)}" placeholder="例如：Vue3 响应式原理" />
      <label class="label">正文 *</label>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
        <label class="btn sm">导入文档<input type="file" id="n-file" accept=".txt,.md,.text,.pdf,.docx" hidden /></label>
        <span id="n-file-status" class="hint"></span>
      </div>
      <textarea class="textarea" id="n-content" style="min-height:200px" placeholder="输入面试笔记内容，或点击上方「导入文档」…">${esc(n.content)}</textarea>
      <div class="field-row">
        <div>
          <label class="label">所属项目</label>
          <select class="select" id="n-proj">
            <option value="">（不关联）</option>
            ${projects.map(pn => `<option value="${esc(pn)}" ${n.projectId === pn ? 'selected' : ''}>${esc(pn)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="label">主题标签</label>
          <input class="input" id="n-tags" value="${esc((n.tags || []).join(', '))}" placeholder="逗号分隔，如：八股, 项目深挖" />
        </div>
      </div>
      <div style="margin-top:16px;display:flex;gap:10px">
        <button class="btn" id="n-cancel">返回</button>
        <button class="btn primary" id="n-save">保存笔记</button>
      </div>
    </div>
  `;

  container.querySelector('#n-cancel').addEventListener('click', () => mount(container));

  const fileInput = container.querySelector('#n-file');
  if (fileInput) {
    fileInput.addEventListener('change', async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const status = container.querySelector('#n-file-status');
      const contentEl = container.querySelector('#n-content');
      status.textContent = '正在解析文档…';
      status.style.color = '';
      try {
        const r = await extractDocText(f);
        if (!r.text || !r.text.trim()) {
          throw new Error('未能提取到文字（扫描版 PDF 需先 OCR）');
        }
        const prev = contentEl.value.trim();
        contentEl.value = prev ? prev + '\n\n' + r.text : r.text;
        const titleEl = container.querySelector('#n-title');
        if (!titleEl.value.trim()) {
          titleEl.value = f.name.replace(/\.[^.]+$/, '');
        }
        const meta = r.pageCount ? `（${r.pageCount} 页）` : '';
        status.textContent = `已导入：${f.name}${meta}`;
      } catch (err) {
        status.textContent = '导入失败：' + (err && err.message ? err.message : '未知错误');
        status.style.color = '#d5484d';
      }
    });
  }

  container.querySelector('#n-save').addEventListener('click', async () => {
    const title = container.querySelector('#n-title').value.trim();
    const content = container.querySelector('#n-content').value.trim();
    if (!title || !content) { toast('标题与正文为必填', 'err'); return; }
    const obj = {
      id: note ? note.id : uid(),
      title,
      content,
      projectId: container.querySelector('#n-proj').value,
      tags: container.querySelector('#n-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean),
      createdAt: note ? note.createdAt : nowISO(),
    };
    await idbPut('notes', obj);
    toast('已保存', 'ok');
    mount(container);
  });
}