/**
 * core/store.js — 本地持久化层
 * 数据统一存放于浏览器 localStorage（设置）/ IndexedDB（业务数据）。
 * 提供简易的 promise 化增删改查接口，全部数据不上传。
 */

const SETTINGS_KEY = 'mianb.settings.v1';

// ---------- 设置（localStorage） ----------
const DEFAULTS = {
  apiProvider: 'openai-compatible', // "openai-compatible" | "anthropic"
  apiKey: '',
  baseUrl: '',
  model: '',
  defaultModes: ['project-deep'],
  maxRounds: 10,
  jobTarget: '',
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

// ---------- IndexedDB ----------
const DB_NAME = 'mianb.db';
const DB_VER = 2;

const openDB = (() => {
  let promise = null;
  return () => {
    if (promise) return promise;
    promise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        const stores = ['profile', 'notes', 'sessions', 'turns', 'reports', 'predictions', 'resumes', 'resumeOpts'];
        for (const s of stores) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return promise;
  };
})();

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

export async function idbPut(store, obj) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = tx(db, store, 'readwrite').put(obj);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export async function idbGet(store, id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = tx(db, store, 'readonly').get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function idbList(store) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = tx(db, store, 'readonly').getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}

export async function idbDelete(store, id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = tx(db, store, 'readwrite').delete(id);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export async function idbClear(store) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = tx(db, store, 'readwrite').clear();
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

export function nowISO() {
  return new Date().toISOString();
}

export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}