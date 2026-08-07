/* OCRs a batch of PIX screenshots (entirely offline, see vendor/tesseract/)
   and matches each one against the theme library (pix-themes.js) by keyword
   overlap. Screenshots matching the same theme are naturally de-duplicated
   (two screenshots of the same underlying question — or of two questions
   covering the same notion — just confirm one theme, they don't produce two
   slides). Screenshots that don't score confidently against any theme are
   reported as unmatched so the deck can flag them instead of guessing. */
(function (global) {
  "use strict";

  const { tokenize } = window.PG_SOURCE;
  const { THEMES } = window.PG_PIX_THEMES;

  const MIN_SCORE = 2; // require at least 2 distinct keyword hits before trusting a match

  function matchTheme(text) {
    const tokens = new Set(tokenize(text));
    let best = null;
    let bestScore = 0;
    for (const theme of THEMES) {
      let score = 0;
      for (const kw of theme.keywords) if (tokens.has(kw)) score++;
      if (score > bestScore) {
        bestScore = score;
        best = theme;
      }
    }
    return bestScore >= MIN_SCORE ? { theme: best, score: bestScore } : null;
  }

  let workerPromise = null;
  function getWorker() {
    if (!workerPromise) {
      workerPromise = Tesseract.createWorker("fra", 1, {
        workerPath: "js/vendor/tesseract/worker-offline.js",
        corePath: "js/vendor/tesseract/tesseract-core-simd-lstm.wasm.js",
        langPath: ".",
        gzip: true,
      });
    }
    return workerPromise;
  }

  async function ocrFile(file) {
    const worker = await getWorker();
    const { data } = await worker.recognize(file);
    return data.text || "";
  }

  /* files: array of File (PNG/JPEG screenshots). onProgress(i, total, filename)
     is called before each OCR pass, for UI feedback (OCR takes a few seconds
     per image). Returns { matchedThemeIds, unmatched, perFile } — perFile is
     for debugging/inspection (raw OCR text + which theme, if any, it hit). */
  async function extractPixModel(files, onProgress) {
    const matchedIds = [];
    const seen = new Set();
    const unmatched = [];
    const perFile = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (onProgress) onProgress(i, files.length, file.name);
      let text = "";
      try {
        text = await ocrFile(file);
      } catch (e) {
        unmatched.push({ filename: file.name, reason: "Échec de la lecture (OCR) : " + e.message });
        perFile.push({ filename: file.name, text: "", theme: null });
        continue;
      }
      const match = matchTheme(text);
      perFile.push({ filename: file.name, text, theme: match ? match.theme.id : null });
      if (!match) {
        unmatched.push({ filename: file.name, reason: "Aucun thème reconnu avec confiance" });
        continue;
      }
      if (!seen.has(match.theme.id)) {
        seen.add(match.theme.id);
        matchedIds.push(match.theme.id);
      }
    }

    return { matchedThemeIds: matchedIds, unmatched, perFile };
  }

  async function terminateWorker() {
    if (workerPromise) {
      const worker = await workerPromise;
      await worker.terminate();
      workerPromise = null;
    }
  }

  global.PG_PIX_EXTRACT = { extractPixModel, matchTheme, terminateWorker };
})(window);
