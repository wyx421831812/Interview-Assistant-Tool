/**
 * modules/settings.js — 设置（LLM 配置与偏好）
 */
import { loadSettings, saveSettings } from '../core/store.js';
import { ping } from '../core/llm.js';
import { esc, toast, loadingBtn } from './ui.js';

const MODES = [
  ['project-deep', '项目深挖'],
  ['technical', '技术追问'],
  ['star', 'STAR 话术'],
  ['comprehensive', '综合'],
];
const PROVIDERS = [
  ['openai-compatible', 'OpenAI Chat Completions 兼容'],
  ['anthropic', 'Anthropic Messages'],
];

export async function mount(container) {
  const s = loadSettings();
  const selectedModes = new Set(s.defaultModes || []);
  const modeTagsEl = document.createElement('div');

  function renderModeTags() {
    modeTagsEl.innerHTML = MODES.map(([v, l]) => `
      <button class="tag ${selectedModes.has(v) ? '' : 'remove'}" data-mode="${v}" style="cursor:pointer">
        ${l} ${selectedModes.has(v) ? '✓' : '+'}
      </button>`).join('');
    modeTagsEl.querySelectorAll('[data-mode]').forEach(b => {
      b.addEventListener('click', () => {
        const v = b.dataset.mode;
        if (selectedModes.has(v)) selectedModes.delete(v); else selectedModes.add(v);
        renderModeTags();
      });
    });
  }

  container.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">设置</h1>
        <div class="view-desc">配置你的大模型服务。API Key 仅保存在本地浏览器，绝不上传。</div>
      </div>
      <button class="btn primary" id="save-settings">保存设置</button>
    </div>

    <div class="card">
      <div class="card-title">LLM 服务</div>
      <div class="field-row">
        <div>
          <label class="label">协议</label>
          <select class="select" id="f-provider">
            ${PROVIDERS.map(([v, l]) => `<option value="${v}" ${s.apiProvider === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="label">Base URL</label>
          <input class="input" id="f-baseurl" placeholder="https://api.openai.com" value="${esc(s.baseUrl)}" />
        </div>
      </div>
      <div class="field-row">
        <div>
          <label class="label">模型名</label>
          <input class="input" id="f-model" placeholder="gpt-4o-mini / claude-3-5-sonnet…" value="${esc(s.model)}" />
        </div>
        <div>
          <label class="label">API Key</label>
          <input class="input" id="f-apikey" type="password" placeholder="sk-…" value="${esc(s.apiKey)}" />
        </div>
      </div>
      <div style="margin-top:14px;display:flex;gap:10px;align-items:center">
        <button class="btn" id="test-conn">测试连接</button>
        <span id="conn-result" class="hint"></span>
      </div>
    </div>

    <div class="card">
      <div class="card-title">面试偏好</div>
      <label class="label">默认面试模式</label>
      <div id="mode-slot"></div>
      <label class="label">默认最大轮数（每次面试）</label>
      <input class="input" id="f-maxrounds" type="number" min="1" max="50" value="${s.maxRounds}" style="max-width:120px" />
      <label class="label">目标岗位（默认）</label>
      <input class="input" id="f-jobtarget" placeholder="例如：高级前端工程师" value="${esc(s.jobTarget)}" />
    </div>
  `;

  container.querySelector('#mode-slot').appendChild(modeTagsEl);
  renderModeTags();

  const testBtn = container.querySelector('#test-conn');
  const result = container.querySelector('#conn-result');
  testBtn.addEventListener('click', async () => {
    collect(true);
    result.textContent = '';
    loadingBtn(testBtn, true, '测试中…');
    try {
      const r = await ping();
      result.textContent = '连接成功：' + r.slice(0, 40);
      toast('连接成功', 'ok');
    } catch (e) {
      result.textContent = e.message;
      toast(e.message, 'err');
    } finally {
      loadingBtn(testBtn, false);
    }
  });

  function collect(noToast) {
    saveSettings({
      apiProvider: container.querySelector('#f-provider').value,
      baseUrl: container.querySelector('#f-baseurl').value.trim(),
      model: container.querySelector('#f-model').value.trim(),
      apiKey: container.querySelector('#f-apikey').value.trim(),
      defaultModes: [...selectedModes],
      maxRounds: Number(container.querySelector('#f-maxrounds').value) || 10,
      jobTarget: container.querySelector('#f-jobtarget').value.trim(),
    });
    if (!noToast) toast('已保存', 'ok');
  }

  container.querySelector('#save-settings').addEventListener('click', () => collect());
  window.__refreshCfgDot && window.__refreshCfgDot();
}