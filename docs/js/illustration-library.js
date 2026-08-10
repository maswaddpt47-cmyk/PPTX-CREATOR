/* Persistent, in-browser library of illustrations extracted from every
   source PPTX processed by any mode (IndexedDB — still 100% client-side,
   no server, survives across sessions in the same browser profile).

   Populated automatically by source-extract.js's extractSourceModel()
   whenever a content slide carries its own image. Looked up by the other
   modes (build.js's renderContentSlide, pix-build.js, merge-build.js) to
   illustrate a slide that has no image of its own, via free-text
   similarity — not a fixed theme id — so it works on arbitrary PPTX
   content, not just the curated PIX theme library.

   UNVERIFIED HEURISTIC: same Jaccard token-overlap approach as mode 4's
   cross-source dedup, not yet tuned against a real, larger library. */
(function (global) {
  "use strict";

  const { tokenize } = window.PG_SOURCE;

  const DB_NAME = "pg-illustration-library";
  const DB_VERSION = 1;
  const STORE = "illustrations";
  const MATCH_THRESHOLD = 0.15;

  let dbPromise = null;
  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function withStore(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const result = fn(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  }

  function getAllIllustrations() {
    return new Promise((resolve, reject) => {
      withStore("readonly", (store) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }).catch(reject);
    });
  }

  /* label: the slide's own title (human-readable, per the user's request
     to name entries after the slide they came from). text: title + intro +
     items, used for similarity matching — not the label itself, to avoid
     fragmenting near-identical titles ("Créer un mot de passe robuste" vs
     "Bien choisir son mot de passe") into unrelated buckets. */
  async function addIllustration({ label, text, bytes, ext }) {
    const existing = await getAllIllustrations();
    // Cheap re-run dedup: same label + same byte size already stored.
    if (existing.some((e) => e.label === label && e.bytes.byteLength === bytes.byteLength)) return;
    await withStore("readwrite", (store) => {
      store.add({ label, text, bytes, ext, addedAt: Date.now() });
    });
  }

  async function deleteIllustration(id) {
    await withStore("readwrite", (store) => store.delete(id));
  }

  function jaccard(setA, setB) {
    let inter = 0;
    for (const t of setA) if (setB.has(t)) inter++;
    const union = setA.size + setB.size - inter;
    return union > 0 ? inter / union : 0;
  }

  async function findBestMatch(queryText) {
    const all = await getAllIllustrations();
    if (!all.length) return null;
    const queryTokens = new Set(tokenize(queryText));
    let best = null;
    let bestScore = 0;
    for (const entry of all) {
      const score = jaccard(queryTokens, new Set(tokenize(entry.text)));
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    return bestScore >= MATCH_THRESHOLD ? best : null;
  }

  global.PG_ILLUSTRATIONS = { addIllustration, getAllIllustrations, deleteIllustration, findBestMatch, MATCH_THRESHOLD };
})(window);
