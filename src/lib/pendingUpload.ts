// src/lib/pendingUpload.ts
// IndexedDB-backed stash for files the user picked before hitting the
// Stripe paywall. After they pay, the redirect lands back on /labs and
// the upload page auto-resumes with the same files — no re-pick needed.
//
// Why IndexedDB and not localStorage: File objects can't be serialized
// to localStorage (string-only), but IndexedDB's structured-clone serializer
// natively handles File / Blob / ArrayBuffer.
//
// Single record per user. Key by userId so multiple browser tabs / devices
// don't collide. TTL 1 hour — anything older is stale (user abandoned the
// payment, files no longer trustworthy).

const DB_NAME = 'causehealth';
const STORE = 'pending_uploads';
const TTL_MS = 60 * 60 * 1000; // 1 hour

interface PendingRecord {
  userId: string;
  files: File[];
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'userId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePendingUpload(userId: string, files: File[]): Promise<void> {
  if (!files.length) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put({
        userId,
        files,
        savedAt: Date.now(),
      } as PendingRecord);
    });
    db.close();
  } catch (e) {
    console.warn('[pendingUpload] save failed:', e);
  }
}

export async function loadPendingUpload(userId: string): Promise<File[] | null> {
  try {
    const db = await openDb();
    const rec = await new Promise<PendingRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(userId);
      req.onsuccess = () => resolve(req.result as PendingRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!rec) return null;
    if (Date.now() - rec.savedAt > TTL_MS) {
      // Stale — clear it
      await clearPendingUpload(userId);
      return null;
    }
    return rec.files ?? null;
  } catch (e) {
    console.warn('[pendingUpload] load failed:', e);
    return null;
  }
}

export async function clearPendingUpload(userId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).delete(userId);
    });
    db.close();
  } catch (e) {
    console.warn('[pendingUpload] clear failed:', e);
  }
}
