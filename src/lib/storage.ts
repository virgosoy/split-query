/**
 * IndexedDB 薄封装：单集合（key='all'）整体保存/读取「条目」。
 * 文件是唯一真源（GLOSSARY.md），这里只是浏览器内的本地缓存：
 * 启动时若存在则直接展示，重新导入时整体替换。
 */
import type { Item } from './parse';

const DB_NAME = 'split-query';
const DB_VERSION = 1;
const STORE = 'items';
const KEY = 'all';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 读取全部条目；从未导入过时返回 null。 */
export async function loadItems(): Promise<Item[] | null> {
  const db = await openDB();
  return new Promise<Item[] | null>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as Item[]) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** 整体保存（替换）全部条目。 */
export async function saveItems(items: Item[]): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(items, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
