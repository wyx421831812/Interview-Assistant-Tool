/**
 * core/llm.js — LLM 接口封装
 * 兼容 OpenAI Chat Completions 与 Anthropic Messages 两种协议。
 * 支持严格 JSON 结构化输出、失败重试与可读错误映射。
 */
import { loadSettings, saveSettings } from './store.js';

export class LlmError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // "auth" | "quota" | "network" | "json" | "config"
  }
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// 统一的鉴权/通信错误映射
function mapHttpError(status) {
  if (status === 401 || status === 403) return new LlmError('auth', 'API Key 无效或未授权，请到设置页检查');
  if (status === 402 || status === 429) return new LlmError('quota', '额度或限流，建议稍后重试或更换模型');
  return new LlmError('network', `请求失败（HTTP ${status}），请检查网络与配置`);
}

// 将 OpenAI 风格的 image_url 内容块转为 Anthropic image 块
function toAnthropicContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content;
  const out = [];
  for (const part of content) {
    if (part && part.type === 'image_url' && part.image_url && part.image_url.url) {
      const m = String(part.image_url.url).match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (m) {
        out.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
      }
    } else if (part && part.type === 'text') {
      out.push({ type: 'text', text: part.text });
    }
  }
  return out;
}

// 构建请求体与鉴权头（opts.maxTokens 可覆盖默认输出长度）
function buildRequest(settings, systemPrompt, userMsgs, jsonMode, opts = {}) {
  if (settings.apiProvider === 'anthropic') {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    for (const m of userMsgs) messages.push(m);
    const headers = {
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };
    const body = {
      model: settings.model,
      max_tokens: opts.maxTokens || 2048,
      temperature: 0.7,
      messages: messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: toAnthropicContent(m.content) })),
      system: systemPrompt || undefined,
    };
    return { url: settings.baseUrl.endsWith('/') ? settings.baseUrl + 'v1/messages' : settings.baseUrl + '/v1/messages', headers, body };
  }

  // openai-compatible
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  for (const m of userMsgs) messages.push(m);
  const headers = {
    Authorization: `Bearer ${settings.apiKey}`,
    'Content-Type': 'application/json',
  };
  const body = {
    model: settings.model,
    temperature: 0.7,
    messages,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }
  const base = settings.baseUrl.endsWith('/') ? settings.baseUrl.slice(0, -1) : settings.baseUrl;
  const url = base.endsWith('/chat/completions') ? base : base + '/chat/completions';
  return { url, headers, body };
}

function extractText(settings, data) {
  if (settings.apiProvider === 'anthropic') {
    const content = data?.content || [];
    return content.map(c => (typeof c === 'string' ? c : c.text || '')).join('');
  }
  return data?.choices?.[0]?.message?.content || '';
}

/**
 * 一次 LLM 文本补全。
 * @param {string} systemPrompt 系统提示
 * @param {Array<{role:string,content:string}>} messages 用户/助手消息
 * @param {object} opts { json:boolean, retries:number }
 * @returns {Promise<string>}
 */
export async function completeText(systemPrompt, messages, opts = {}) {
  const settings = loadSettings();
  if (!settings.apiKey) throw new LlmError('config', '尚未配置 API Key，请先到设置页完成配置');
  if (!settings.baseUrl || !settings.model) throw new LlmError('config', '请完整填写 Base URL 与模型名称');

  const jsonMode = !!opts.json;
  const { url, headers, body } = buildRequest(settings, systemPrompt, messages, jsonMode, opts);

  let lastErr = null;
  const retries = opts.retries ?? 1;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let resp;
    try {
      resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (e) {
      const msg = (e && e.message) ? e.message : '';
      const hint = msg && msg.toLowerCase().includes('cors')
        ? '跨域（CORS）被拦截：该 API 可能不支持浏览器端直接调用，建议使用支持 CORS 的服务商或通过本地代理中转。'
        : '请求失败，请检查 Base URL、网络连接与 CORS 限制。';
      lastErr = new LlmError('network', hint + (msg ? `（${msg}）` : ''));
    }
    if (resp) {
      if (!resp.ok) throw mapHttpError(resp.status);
      let data;
      try {
        data = await resp.json();
      } catch {
        lastErr = new LlmError('json', '模型输出格式异常');
        continue;
      }
      const text = extractText(settings, data);
      if (jsonMode) {
        // 已有 response_format 时通常直接是 JSON；仍做一次兜底提取
        const cleaned = cleanJson(text);
        if (cleaned) return cleaned;
        lastErr = new LlmError('json', '模型输出格式异常，未返回有效 JSON');
      } else {
        return text;
      }
    }
    if (attempt < retries) await delay(400 * (attempt + 1));
  }
  throw lastErr || new LlmError('network', '请求失败');
}

// 提取真正 JSON 对象片段（从文本中剥离 markdown 代码块等外壳）
function cleanJson(text) {
  try {
    JSON.parse(text);
    return text;
  } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = candidate.slice(start, end + 1);
    try {
      JSON.parse(slice);
      return slice;
    } catch {}
  }
  return null;
}

/**
 * 结构化 JSON 补全：自动提取、校验并重试。
 * @returns {Promise<object>} 解析后的对象
 */
export async function completeJson(systemPrompt, messages, opts = {}) {
  const text = await completeText(systemPrompt, messages, { ...opts, json: true, retries: 2 });
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new LlmError('json', '模型输出格式异常，请重试一次');
  }
}

// 供设置页探测连通性
export async function ping() {
  const text = await completeText('你是连通性测试助手。', [{ role: 'user', content: '请只回复: ok' }]);
  return text.trim();
}