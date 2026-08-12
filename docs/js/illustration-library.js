/* Persistent, in-browser library of illustrations extracted from every
   source PPTX processed by any mode (IndexedDB — still 100% client-side,
   no server, survives across sessions in the same browser profile).

   Populated automatically by source-extract.js's extractSourceModel()
   whenever a content slide carries its own image. Looked up by the other
   modes (build.js's renderContentSlide, merge-build.js) to illustrate a
   slide that has no image of its own.

   Picked at random (pickAny), not matched to the slide's content: an
   earlier version tried free-text Jaccard similarity between the slide
   and each entry's stored text, but confirmed in production this barely
   ever cleared the match threshold (2 matches out of 29 slides on a real
   deck) — these are decorative "images d'ambiance" the user collects
   across every generated deck, not a tagged/categorized set, so a
   same-topic match was rarely there to find. Treating the whole library
   as one ambiance pool gives every slide a real illustration instead of
   an empty placeholder, at the cost of no longer trying for topical
   relevance — an accepted, explicit trade the user asked for. */
(function (global) {
  "use strict";

  const { tokenize } = window.PG_SOURCE;

  const DB_NAME = "pg-illustration-library";
  const DB_VERSION = 1;
  const STORE = "illustrations";

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

  function bytesToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  /* Portable JSON export — no server, no commit: just a file the user can
     hand to someone else (email, clé USB...) who imports it into their own
     browser's library via importLibrary() below. */
  async function exportLibrary() {
    const all = await getAllIllustrations();
    const payload = all.map((e) => ({
      label: e.label,
      text: e.text,
      ext: e.ext,
      bytesBase64: bytesToBase64(e.bytes),
    }));
    return JSON.stringify({ format: "pg-illustration-library", version: 1, entries: payload }, null, 2);
  }

  /* Reuses addIllustration()'s existing dedup (same label + byte size), so
     importing a file twice — or one that overlaps with entries already
     present — doesn't create duplicates. */
  async function importLibrary(jsonText) {
    const data = JSON.parse(jsonText);
    const entries = Array.isArray(data.entries) ? data.entries : [];
    let imported = 0;
    for (const e of entries) {
      const before = await getAllIllustrations();
      await addIllustration({ label: e.label, text: e.text, ext: e.ext, bytes: base64ToBytes(e.bytesBase64) });
      const after = await getAllIllustrations();
      if (after.length > before.length) imported++;
    }
    return { total: entries.length, imported, skipped: entries.length - imported };
  }

  function jaccard(setA, setB) {
    let inter = 0;
    for (const t of setA) if (setB.has(t)) inter++;
    const union = setA.size + setB.size - inter;
    return union > 0 ? inter / union : 0;
  }

  /* Random pick from the whole library, treated as one undifferentiated
     ambiance pool — see the file header for why this replaced a
     similarity-based match. excludeIds: entries already picked for an
     earlier slide in the same deck are skipped, so a deck with several
     slides doesn't visibly repeat the same photo (still possible once
     excludeIds covers the whole library — falls back to the full pool
     rather than returning nothing). */
  async function pickAny(excludeIds) {
    const all = await getAllIllustrations();
    if (!all.length) return null;
    let pool = excludeIds ? all.filter((e) => !excludeIds.has(e.id)) : all;
    if (!pool.length) pool = all;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // "Are these two library entries essentially the same content" is a much
  // stronger claim than illustrating a slide ever needed, hence the high bar.
  const NEAR_DUPLICATE_THRESHOLD = 0.5;

  /* Two-tier duplicate scan over the whole library:
     - exactGroups: entries with byte-for-byte identical image data (bucketed
       by length first, then compared directly — no hashing, so zero
       collision risk on a library this size). Unambiguous: safe to
       auto-suggest deleting all but one per group.
     - nearPairs: entries whose stored text (title+intro+items) is highly
       similar by the Jaccard measure above, sorted by score descending.
       NOT auto-deletable —
       two different slides can legitimately share most of their wording
       (e.g. two "créer votre mot de passe" sections) while carrying
       different, both-worth-keeping photos, so this tier is surfaced for
       a human to review side by side, never removed automatically. */
  async function findDuplicateGroups() {
    const all = await getAllIllustrations();

    const byLength = new Map();
    for (const e of all) {
      const list = byLength.get(e.bytes.length) || [];
      list.push(e);
      byLength.set(e.bytes.length, list);
    }
    const exactGroups = [];
    for (const bucket of byLength.values()) {
      if (bucket.length < 2) continue;
      const used = new Set();
      for (let i = 0; i < bucket.length; i++) {
        if (used.has(i)) continue;
        const group = [bucket[i]];
        for (let j = i + 1; j < bucket.length; j++) {
          if (!used.has(j) && bytesEqual(bucket[i].bytes, bucket[j].bytes)) {
            group.push(bucket[j]);
            used.add(j);
          }
        }
        if (group.length > 1) {
          group.sort((a, b) => a.addedAt - b.addedAt);
          exactGroups.push(group);
        }
      }
    }

    const tokensById = new Map(all.map((e) => [e.id, new Set(tokenize(e.text))]));
    const nearPairs = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i],
          b = all[j];
        const score = jaccard(tokensById.get(a.id), tokensById.get(b.id));
        if (score >= NEAR_DUPLICATE_THRESHOLD) nearPairs.push({ score, a, b });
      }
    }
    nearPairs.sort((x, y) => y.score - x.score);

    return { exactGroups, nearPairs, total: all.length };
  }

  global.PG_ILLUSTRATIONS = {
    addIllustration,
    getAllIllustrations,
    deleteIllustration,
    pickAny,
    findDuplicateGroups,
    exportLibrary,
    importLibrary,
    NEAR_DUPLICATE_THRESHOLD,
  };
})(window);
