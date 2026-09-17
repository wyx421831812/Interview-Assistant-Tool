/**
 * core/fileparse.js — 文档文字提取（浏览器端）
 * 支持 .txt/.md、.pdf（pdf.js，CDN 动态加载）、.docx（mammoth.js，CDN 动态加载）。
 */

// 动态加载 pdf.js（CDN ESM 构建）
let pdfjsLib = null;
export async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  const CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/';
  pdfjsLib = await import(CDN + 'pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = CDN + 'pdf.worker.min.mjs';
  return pdfjsLib;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing && window.mammoth) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('mammoth.js 加载失败，请检查网络'));
    document.head.appendChild(s);
  });
}

// Word(.docx) 提取纯文本
export async function docxExtractText(file) {
  await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js');
  if (!window.mammoth) throw new Error('mammoth.js 未就绪，请重试');
  const buf = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
  return String(result.value || '');
}

// PDF 提取纯文本（默认全部页面）
export async function pdfExtractText(file, maxPages = Infinity) {
  const lib = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await lib.getDocument({ data: buf }).promise;
  const pageCount = doc.numPages;
  const limit = Math.min(pageCount, maxPages);
  let text = '';
  for (let i = 1; i <= limit; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
  }
  return { text: text.trim(), pageCount, extractedPages: limit };
}

/**
 * 按文件类型分发提取纯文本。
 * @returns {Promise<{text:string, kind:'text'|'pdf'|'docx', pageCount?:number}>}
 */
export async function extractDocText(file) {
  const name = (file.name || '').toLowerCase();
  if (/\.(txt|md|text)$/.test(name)) {
    return { text: await file.text(), kind: 'text' };
  }
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
    const r = await pdfExtractText(file);
    return { text: r.text, kind: 'pdf', pageCount: r.pageCount };
  }
  if (name.endsWith('.docx')) {
    return { text: await docxExtractText(file), kind: 'docx' };
  }
  if (name.endsWith('.doc')) {
    throw new Error('暂不支持旧版 .doc，请在 Word 中另存为 .docx 后导入');
  }
  throw new Error('不支持的文件格式，请选择 .txt/.md/.pdf/.docx');
}
