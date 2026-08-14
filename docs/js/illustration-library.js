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

  // 8x8 average hash ("aHash"): downscale to 64 grayscale pixels, compare
  // each to the mean, one bit per pixel. Crude compared to a real
  // perceptual hash, but cheap, dependency-free, and enough to tell "two
  // photos of different scenes" apart — which is the actual bar here.
  const HASH_SIZE = 8;
  const HASH_BITS = HASH_SIZE * HASH_SIZE;

  /* Confirmed in production: comparing the stored *text* (slide title/body)
     instead of the image itself flagged completely unrelated illustrations
     as "quasi-doublons" just because they came from similarly-titled slides
     (e.g. a whole "Budget et numérique" section, each sub-slide's own photo
     paired against every other one). Hashing actual pixel content fixes
     that at the root — two visually different photos won't collide no
     matter how similar their source slide's wording was.

     Returns { hash, avgColor } — avgColor is a second, independent check
     (see NEAR_DUPLICATE_MAX_COLOR_DISTANCE below): an average hash only
     encodes which pixels are lighter/darker than the image's OWN mean, so
     any flat, near-uniform image (a solid-color background, a simple
     pictogram) degenerates toward the same "no contrast" hash regardless
     of its actual color — confirmed while testing this fix, two solid
     blocks of clearly different colors (red vs blue) hashed identically.
     Comparing the mean color too catches exactly that case. */
  async function computeAverageHash(bytes, ext) {
    try {
      const blob = new Blob([bytes], { type: `image/${ext === "jpg" ? "jpeg" : ext}` });
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = HASH_SIZE;
      canvas.height = HASH_SIZE;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0, HASH_SIZE, HASH_SIZE);
      const { data } = ctx.getImageData(0, 0, HASH_SIZE, HASH_SIZE);
      const luminance = new Array(HASH_BITS);
      let sumLum = 0;
      let sumR = 0,
        sumG = 0,
        sumB = 0;
      for (let i = 0; i < HASH_BITS; i++) {
        const o = i * 4;
        const r = data[o],
          g = data[o + 1],
          b = data[o + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        luminance[i] = lum;
        sumLum += lum;
        sumR += r;
        sumG += g;
        sumB += b;
      }
      const avgLum = sumLum / HASH_BITS;
      let hash = 0n;
      for (let i = 0; i < HASH_BITS; i++) {
        hash = (hash << 1n) | (luminance[i] > avgLum ? 1n : 0n);
      }
      const avgColor = [sumR / HASH_BITS, sumG / HASH_BITS, sumB / HASH_BITS];
      return { hash, avgColor };
    } catch {
      // Unrenderable/corrupt image data — exclude from the near-duplicate
      // comparison rather than fail the whole scan over one bad entry.
      return null;
    }
  }

  function hammingDistance(a, b) {
    let x = a ^ b;
    let count = 0;
    while (x > 0n) {
      count += Number(x & 1n);
      x >>= 1n;
    }
    return count;
  }

  function colorDistance(c1, c2) {
    const dr = c1[0] - c2[0],
      dg = c1[1] - c2[1],
      db = c1[2] - c2[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  // Max Euclidean distance in 0-255 RGB space (~441.7) between two entries'
  // mean colors to still count as a near-duplicate — a generous bar (real
  // near-duplicates should be far closer than this), just enough to reject
  // the "different flat colors, same degenerate structural hash" case above.
  const NEAR_DUPLICATE_MAX_COLOR_DISTANCE = 40;

  // Out of 64 bits: how many may differ before two images stop counting as
  // "near duplicates." Conservative on purpose — false positives (flagging
  // genuinely different photos) are the exact complaint this replaced.
  const NEAR_DUPLICATE_MAX_DISTANCE = 5;
  const NEAR_DUPLICATE_THRESHOLD = (HASH_BITS - NEAR_DUPLICATE_MAX_DISTANCE) / HASH_BITS;

  /* Two-tier duplicate scan over the whole library:
     - exactGroups: entries with byte-for-byte identical image data (bucketed
       by length first, then compared directly — no hashing, so zero
       collision risk on a library this size). Unambiguous: safe to
       auto-suggest deleting all but one per group.
     - nearPairs: entries whose actual image content hashes to within
       NEAR_DUPLICATE_MAX_DISTANCE bits of each other, sorted by similarity
       descending. NOT auto-deletable — two crops/edits of the same photo
       can legitimately both be worth keeping, so this tier is surfaced for
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

    // Byte-identical pairs already surfaced above as an exact group — an
    // identical image trivially also hashes to distance 0, so without this
    // it would show up a second time as a "quasi-doublon" too, cluttering
    // the exact section this whole tier exists to keep short and reviewable.
    const exactPairKeys = new Set();
    for (const group of exactGroups) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) exactPairKeys.add(`${group[i].id}:${group[j].id}`);
      }
    }

    const hashed = await Promise.all(all.map((e) => computeAverageHash(e.bytes, e.ext)));
    const nearPairs = [];
    for (let i = 0; i < all.length; i++) {
      if (hashed[i] == null) continue;
      for (let j = i + 1; j < all.length; j++) {
        if (hashed[j] == null) continue;
        if (exactPairKeys.has(`${all[i].id}:${all[j].id}`)) continue;
        const distance = hammingDistance(hashed[i].hash, hashed[j].hash);
        if (
          distance <= NEAR_DUPLICATE_MAX_DISTANCE &&
          colorDistance(hashed[i].avgColor, hashed[j].avgColor) <= NEAR_DUPLICATE_MAX_COLOR_DISTANCE
        ) {
          nearPairs.push({ score: (HASH_BITS - distance) / HASH_BITS, a: all[i], b: all[j] });
        }
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
