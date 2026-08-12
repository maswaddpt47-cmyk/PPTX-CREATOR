(function () {
  "use strict";

  const titreInput = document.getElementById("titre");
  const thematiqueInput = document.getElementById("thematique");
  const generateBtn = document.getElementById("generate-btn");
  const statusEl = document.getElementById("status");

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "status" + (kind ? ` ${kind}` : "");
  }

  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function triggerDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* Wires click/keyboard/drag-drop on a dropzone to a (hidden) file input,
     calling onFiles(FileList) whenever a selection is made — shared by all
     three modes' dropzones below. */
  function wireDropzone(dropzoneEl, inputEl, onFiles) {
    dropzoneEl.addEventListener("click", () => inputEl.click());
    dropzoneEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        inputEl.click();
      }
    });
    inputEl.addEventListener("change", () => onFiles(inputEl.files));
    ["dragenter", "dragover"].forEach((evt) =>
      dropzoneEl.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzoneEl.classList.add("dragover");
      })
    );
    ["dragleave", "drop"].forEach((evt) =>
      dropzoneEl.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzoneEl.classList.remove("dragover");
      })
    );
    dropzoneEl.addEventListener("drop", (e) => onFiles(e.dataTransfer.files));
  }

  function renderThemeSummary(el, matchedThemeIds, unmatched) {
    const { THEMES } = window.PG_PIX_THEMES;
    const matchedThemes = THEMES.filter((t) => matchedThemeIds.includes(t.id));
    let html = "";
    if (matchedThemes.length) {
      html +=
        "<strong>Thèmes reconnus (" +
        matchedThemes.length +
        ") :</strong><ul>" +
        matchedThemes.map((t) => `<li>${t.heading}</li>`).join("") +
        "</ul>";
    } else {
      html += "<strong>Aucun thème reconnu.</strong>";
    }
    if (unmatched.length) {
      html +=
        '<p class="unmatched"><strong>Captures non reconnues (' +
        unmatched.length +
        ") :</strong></p><ul class=\"unmatched\">" +
        unmatched.map((u) => `<li>${u.filename} — ${u.reason}</li>`).join("") +
        "</ul>";
    }
    el.innerHTML = html;
    el.hidden = false;
  }

  /* ---------- Mode switching ---------- */

  const tabPptx = document.getElementById("tab-pptx");
  const tabPix = document.getElementById("tab-pix");
  const tabMerge = document.getElementById("tab-merge");
  const tabMulti = document.getElementById("tab-multi");
  const tabScratch = document.getElementById("tab-scratch");
  const modePptx = document.getElementById("mode-pptx");
  const modePix = document.getElementById("mode-pix");
  const modeMerge = document.getElementById("mode-merge");
  const modeMulti = document.getElementById("mode-multi");
  const modeScratch = document.getElementById("mode-scratch");
  const tabs = [
    { key: "pptx", tab: tabPptx, panel: modePptx },
    { key: "pix", tab: tabPix, panel: modePix },
    { key: "merge", tab: tabMerge, panel: modeMerge },
    { key: "multi", tab: tabMulti, panel: modeMulti },
    { key: "scratch", tab: tabScratch, panel: modeScratch },
  ];

  let mode = "pptx";

  function refreshGenerateEnabled() {
    if (mode === "pptx") generateBtn.disabled = !sourceFile;
    else if (mode === "pix") generateBtn.disabled = pixFiles.length === 0;
    else if (mode === "merge") generateBtn.disabled = !mergeSourceFile || mergePixFiles.length === 0;
    else if (mode === "multi") generateBtn.disabled = multiFiles.length < 2;
    else generateBtn.disabled = !scratchThemeInput.value.trim();
  }

  function setMode(next) {
    mode = next;
    for (const t of tabs) {
      const active = t.key === mode;
      t.tab.classList.toggle("active", active);
      t.tab.setAttribute("aria-selected", String(active));
      t.panel.hidden = !active;
    }
    setStatus("");
    refreshGenerateEnabled();
  }

  tabPptx.addEventListener("click", () => setMode("pptx"));
  tabPix.addEventListener("click", () => setMode("pix"));
  tabMerge.addEventListener("click", () => setMode("merge"));
  tabMulti.addEventListener("click", () => setMode("multi"));
  tabScratch.addEventListener("click", () => setMode("scratch"));

  /* ---------- Mode 1: adapt an existing PPTX ---------- */

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const fileNameEl = document.getElementById("file-name");
  const pptxTargetMinutesEl = document.getElementById("pptx-target-minutes");
  const pptxMinutesPerSlideEl = document.getElementById("pptx-minutes-per-slide");

  let sourceFile = null;

  pptxTargetMinutesEl.value = window.PG_BUILD.DEFAULT_TARGET_MINUTES;
  pptxMinutesPerSlideEl.textContent = window.PG_BUILD.MINUTES_PER_SLIDE;

  function setFile(files) {
    const file = files && files[0];
    if (!file) return;
    if (!/\.pptx$/i.test(file.name)) {
      setStatus("Le fichier doit être un .pptx.", "error");
      return;
    }
    sourceFile = file;
    fileNameEl.textContent = file.name;
    setStatus("");
    refreshGenerateEnabled();
  }

  wireDropzone(dropzone, fileInput, setFile);

  async function generateFromPptx() {
    const gabaritBuffer = base64ToArrayBuffer(window.PG_GABARIT_BASE64);
    const sourceBuffer = await sourceFile.arrayBuffer();
    const targetMinutes = parseInt(pptxTargetMinutesEl.value, 10) || window.PG_BUILD.DEFAULT_TARGET_MINUTES;

    const { blob, keptCount, droppedCount } = await window.PG_BUILD.generateDeck(gabaritBuffer, sourceBuffer, {
      titre: titreInput.value,
      thematique: thematiqueInput.value,
      targetMinutes,
    });

    const outName = sourceFile.name.replace(/\.pptx$/i, "") + " - mis en forme.pptx";
    triggerDownload(blob, outName);
    setStatus(
      `Livrable généré : ${outName}\n${keptCount} section(s) retenue(s)` +
        (droppedCount ? `, ${droppedCount} écartée(s) pour tenir dans la durée cible.` : ".") +
        "\nVérifiez les messages d'alerte rouge éventuels avant diffusion.",
      "success"
    );
  }

  /* ---------- Mode 2: generate from PIX screenshots ---------- */

  const pixDropzone = document.getElementById("pix-dropzone");
  const pixFileInput = document.getElementById("pix-file-input");
  const pixFileListEl = document.getElementById("pix-file-list");
  const ambianceInput = document.getElementById("ambiance-input");
  const pixSummaryEl = document.getElementById("pix-summary");
  const pixTargetMinutesEl = document.getElementById("pix-target-minutes");
  const pixMinutesPerSlideEl = document.getElementById("pix-minutes-per-slide");

  let pixFiles = [];
  let ambianceFiles = [];

  pixTargetMinutesEl.value = window.PG_BUILD.DEFAULT_TARGET_MINUTES;
  pixMinutesPerSlideEl.textContent = window.PG_BUILD.MINUTES_PER_SLIDE;

  function setPixFiles(files) {
    pixFiles = Array.from(files || []).filter((f) => /\.(png|jpe?g)$/i.test(f.name));
    pixFileListEl.textContent = pixFiles.length
      ? `${pixFiles.length} capture(s) : ${pixFiles.map((f) => f.name).join(", ")}`
      : "";
    setStatus("");
    pixSummaryEl.hidden = true;
    refreshGenerateEnabled();
  }

  wireDropzone(pixDropzone, pixFileInput, setPixFiles);

  ambianceInput.addEventListener("change", () => {
    ambianceFiles = Array.from(ambianceInput.files || []);
  });

  async function generateFromPix() {
    setStatus("Lecture des captures (reconnaissance de texte hors-ligne)…");
    const { matchedThemeIds, unmatched, perFile } = await window.PG_PIX_EXTRACT.extractPixModel(
      pixFiles,
      (i, total, filename) => setStatus(`Lecture de la capture ${i + 1}/${total} : ${filename}`)
    );

    renderThemeSummary(pixSummaryEl, matchedThemeIds, unmatched);

    if (!matchedThemeIds.length) {
      setStatus(
        "Aucun thème n'a été reconnu avec assez de confiance dans ces captures. Essayez des captures plus nettes, ou complétez la bibliothèque de thèmes.",
        "error"
      );
      return;
    }

    setStatus("Génération du support en cours…");
    const gabaritBuffer = base64ToArrayBuffer(window.PG_GABARIT_BASE64);
    const targetMinutes = parseInt(pixTargetMinutesEl.value, 10) || window.PG_BUILD.DEFAULT_TARGET_MINUTES;
    const { blob, keptCount, droppedCount } = await window.PG_PIX_BUILD.generatePixDeck(
      gabaritBuffer,
      matchedThemeIds,
      unmatched,
      perFile,
      ambianceFiles,
      { titre: titreInput.value, thematique: thematiqueInput.value, targetMinutes }
    );

    const outName = (titreInput.value.trim() || "preparation-pix") + " - mis en forme.pptx";
    triggerDownload(blob, outName);
    setStatus(
      `Livrable généré : ${outName}\n${keptCount} thème(s) inclus` +
        (droppedCount ? `, ${droppedCount} thème(s) écarté(s) pour tenir dans la durée cible` : "") +
        (unmatched.length ? `, ${unmatched.length} capture(s) non reconnue(s) signalée(s) dans le récapitulatif.` : ".") +
        "\nVérifiez les messages d'alerte rouge éventuels avant diffusion.",
      "success"
    );
  }

  /* ---------- Mode 3: enrich an old PPTX with PIX screenshots ---------- */

  const mergePptxDropzone = document.getElementById("merge-pptx-dropzone");
  const mergePptxInput = document.getElementById("merge-pptx-file-input");
  const mergePptxNameEl = document.getElementById("merge-pptx-file-name");
  const mergePixDropzone = document.getElementById("merge-pix-dropzone");
  const mergePixInput = document.getElementById("merge-pix-file-input");
  const mergePixListEl = document.getElementById("merge-pix-file-list");
  const mergeAmbianceInput = document.getElementById("merge-ambiance-input");
  const mergeSummaryEl = document.getElementById("merge-summary");
  const mergeTargetMinutesEl = document.getElementById("merge-target-minutes");
  const mergeMinutesPerSlideEl = document.getElementById("merge-minutes-per-slide");

  let mergeSourceFile = null;
  let mergePixFiles = [];
  let mergeAmbianceFiles = [];

  mergeTargetMinutesEl.value = window.PG_MERGE_BUILD.DEFAULT_TARGET_MINUTES;
  mergeMinutesPerSlideEl.textContent = window.PG_MERGE_BUILD.MINUTES_PER_SLIDE;

  function setMergeSourceFile(files) {
    const file = files && files[0];
    if (!file) return;
    if (!/\.pptx$/i.test(file.name)) {
      setStatus("Le fichier doit être un .pptx.", "error");
      return;
    }
    mergeSourceFile = file;
    mergePptxNameEl.textContent = file.name;
    setStatus("");
    refreshGenerateEnabled();
  }

  function setMergePixFiles(files) {
    mergePixFiles = Array.from(files || []).filter((f) => /\.(png|jpe?g)$/i.test(f.name));
    mergePixListEl.textContent = mergePixFiles.length
      ? `${mergePixFiles.length} capture(s) : ${mergePixFiles.map((f) => f.name).join(", ")}`
      : "";
    setStatus("");
    mergeSummaryEl.hidden = true;
    refreshGenerateEnabled();
  }

  wireDropzone(mergePptxDropzone, mergePptxInput, setMergeSourceFile);
  wireDropzone(mergePixDropzone, mergePixInput, setMergePixFiles);

  mergeAmbianceInput.addEventListener("change", () => {
    mergeAmbianceFiles = Array.from(mergeAmbianceInput.files || []);
  });

  async function generateFromMerge() {
    setStatus("Lecture des captures (reconnaissance de texte hors-ligne)…");
    const gabaritBuffer = base64ToArrayBuffer(window.PG_GABARIT_BASE64);
    const sourceBuffer = await mergeSourceFile.arrayBuffer();

    const targetMinutes = parseInt(mergeTargetMinutesEl.value, 10) || window.PG_MERGE_BUILD.DEFAULT_TARGET_MINUTES;
    const { blob, pixResult, keptCount } = await window.PG_MERGE_BUILD.generateMergedDeck(
      gabaritBuffer,
      sourceBuffer,
      mergePixFiles,
      mergeAmbianceFiles,
      { titre: titreInput.value, thematique: thematiqueInput.value, targetMinutes },
      (i, total, filename) => setStatus(`Lecture de la capture ${i + 1}/${total} : ${filename}`)
    );

    renderThemeSummary(mergeSummaryEl, pixResult.matchedThemeIds, pixResult.unmatched);

    const outName = (titreInput.value.trim() || "preparation-pix-enrichie") + " - mis en forme.pptx";
    triggerDownload(blob, outName);
    const minutes = keptCount * window.PG_MERGE_BUILD.MINUTES_PER_SLIDE;
    setStatus(
      `Livrable généré : ${outName}\n${keptCount} section(s) retenue(s) (~${minutes} min).` +
        "\nVérifiez les messages d'alerte rouge éventuels avant diffusion.",
      "success"
    );
  }

  /* ---------- Mode 4: merge several old-charte PPTX into one deck ---------- */

  const multiDropzone = document.getElementById("multi-dropzone");
  const multiFileInput = document.getElementById("multi-file-input");
  const multiFileListEl = document.getElementById("multi-file-list");
  const multiSummaryEl = document.getElementById("multi-summary");
  const multiTargetMinutesEl = document.getElementById("multi-target-minutes");
  const multiMinutesPerSlideEl = document.getElementById("multi-minutes-per-slide");

  let multiFiles = [];

  multiTargetMinutesEl.value = window.PG_BUILD.DEFAULT_TARGET_MINUTES;
  multiMinutesPerSlideEl.textContent = window.PG_BUILD.MINUTES_PER_SLIDE;

  function setMultiFiles(files) {
    multiFiles = Array.from(files || []).filter((f) => /\.pptx$/i.test(f.name));
    multiFileListEl.textContent = multiFiles.length
      ? multiFiles.map((f, i) => `Source ${i + 1} : ${f.name}`).join(" · ")
      : "";
    setStatus("");
    multiSummaryEl.hidden = true;
    refreshGenerateEnabled();
  }

  wireDropzone(multiDropzone, multiFileInput, setMultiFiles);

  async function generateFromMulti() {
    setStatus(`Lecture de ${multiFiles.length} source(s)…`);
    const gabaritBuffer = base64ToArrayBuffer(window.PG_GABARIT_BASE64);
    const targetMinutes = parseInt(multiTargetMinutesEl.value, 10) || window.PG_BUILD.DEFAULT_TARGET_MINUTES;

    const { blob, sectionCount, dedupDroppedCount, durationDroppedCount } = await window.PG_MULTI_BUILD.generateMultiDeck(
      gabaritBuffer,
      multiFiles,
      { titre: titreInput.value, thematique: thematiqueInput.value, targetMinutes }
    );

    let summaryHtml = `<strong>${sectionCount} section(s) retenue(s)</strong> à partir de ${multiFiles.length} source(s).`;
    if (dedupDroppedCount) {
      summaryHtml += `<p class="unmatched">${dedupDroppedCount} diapositive(s) écartée(s) car trop proches d'un contenu déjà retenu (source précédente prioritaire).</p>`;
    }
    if (durationDroppedCount) {
      summaryHtml += `<p class="unmatched">${durationDroppedCount} diapositive(s) supplémentaire(s) écartée(s) pour tenir dans la durée cible (sources les plus tardives réduites en premier).</p>`;
    }
    multiSummaryEl.innerHTML = summaryHtml;
    multiSummaryEl.hidden = false;

    const outName = (titreInput.value.trim() || "fusion-pptx") + " - mis en forme.pptx";
    triggerDownload(blob, outName);
    setStatus(
      `Livrable généré : ${outName}\n${sectionCount} section(s) retenue(s) à partir de ${multiFiles.length} source(s).` +
        "\nVérifiez les messages d'alerte rouge éventuels avant diffusion.",
      "success"
    );
  }

  /* ---------- Mode 5: generate from a theme name alone (curated library, or Claude API as a fallback) ---------- */

  const scratchThemeInput = document.getElementById("scratch-theme");
  const scratchNotesInput = document.getElementById("scratch-notes");
  const scratchTargetMinutesEl = document.getElementById("scratch-target-minutes");
  const scratchMinutesPerSlideEl = document.getElementById("scratch-minutes-per-slide");
  const scratchApiKeyInput = document.getElementById("scratch-api-key");
  const scratchSummaryEl = document.getElementById("scratch-summary");

  scratchTargetMinutesEl.value = window.PG_SCRATCH_BUILD.DEFAULT_TARGET_MINUTES;
  scratchMinutesPerSlideEl.textContent = window.PG_SCRATCH_BUILD.MINUTES_PER_SLIDE;
  scratchApiKeyInput.value = window.PG_SCRATCH_BUILD.getStoredApiKey();

  scratchThemeInput.addEventListener("input", () => {
    setStatus("");
    scratchSummaryEl.hidden = true;
    refreshGenerateEnabled();
  });

  scratchApiKeyInput.addEventListener("change", () => {
    window.PG_SCRATCH_BUILD.setStoredApiKey(scratchApiKeyInput.value.trim());
  });

  async function generateFromScratch() {
    const theme = scratchThemeInput.value.trim();
    setStatus(`Recherche du thème "${theme}" dans la bibliothèque hors-ligne…`);
    const gabaritBuffer = base64ToArrayBuffer(window.PG_GABARIT_BASE64);
    const targetMinutes = parseInt(scratchTargetMinutesEl.value, 10) || window.PG_SCRATCH_BUILD.DEFAULT_TARGET_MINUTES;

    const { blob, source, themeHeading, slideCount } = await window.PG_SCRATCH_BUILD.generateScratchDeck(gabaritBuffer, {
      theme,
      notes: scratchNotesInput.value,
      titre: titreInput.value,
      thematique: thematiqueInput.value,
      targetMinutes,
      apiKey: scratchApiKeyInput.value.trim(),
    });

    scratchSummaryEl.innerHTML =
      source === "curated"
        ? `<strong>Contenu trouvé dans la bibliothèque hors-ligne</strong> (thème « ${themeHeading} ») — aucun appel réseau.`
        : `<strong>Contenu généré par l'API Claude</strong> (${slideCount} diapositive(s) de contenu) — aucun thème correspondant n'a été trouvé dans la bibliothèque hors-ligne.`;
    scratchSummaryEl.hidden = false;

    const outName = (titreInput.value.trim() || theme || "atelier") + " - mis en forme.pptx";
    triggerDownload(blob, outName);
    setStatus(
      `Livrable généré : ${outName}\n` +
        (source === "curated"
          ? `Contenu issu de la bibliothèque hors-ligne (thème « ${themeHeading} »).`
          : `Contenu généré par l'API Claude (${slideCount} diapositive(s) de contenu).`) +
        "\nVérifiez les messages d'alerte rouge éventuels avant diffusion.",
      "success"
    );
  }

  /* ---------- Illustration library panel ---------- */

  const illustrationCountEl = document.getElementById("illustration-count");
  const illustrationGridEl = document.getElementById("illustration-grid");
  const illustrationPanel = document.getElementById("illustration-library-panel");

  /* Shared thumbnail card — used by the main grid and the cleanup review
     views below, so a "Supprimer" action always looks and behaves the
     same regardless of where it's clicked from. `buttons` is an array of
     { label, onClick } rendered as the item's action row, in order. */
  function buildIllustrationCard(entry, buttons) {
    const blob = new Blob([entry.bytes], { type: `image/${entry.ext === "jpg" ? "jpeg" : entry.ext}` });
    const url = URL.createObjectURL(blob);
    const item = document.createElement("div");
    item.className = "illustration-item";
    item.innerHTML = `<img src="${url}" alt="" /><div class="illustration-label"></div>`;
    item.querySelector(".illustration-label").textContent = entry.label;

    const actions = document.createElement("div");
    actions.className = "illustration-item-actions";
    for (const { label, onClick } of buttons) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.addEventListener("click", onClick);
      actions.appendChild(btn);
    }
    item.appendChild(actions);
    return { item, blob };
  }

  async function refreshIllustrationPanel() {
    const all = await window.PG_ILLUSTRATIONS.getAllIllustrations();
    illustrationCountEl.textContent = all.length;
    if (!illustrationPanel.open) return; // avoid building object URLs while collapsed
    illustrationGridEl.innerHTML = "";
    for (const entry of all) {
      const { item, blob } = buildIllustrationCard(entry, [
        {
          label: "Télécharger",
          onClick: () => {
            const safeName = (entry.label || "illustration").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
            triggerDownload(blob, `${safeName}.${entry.ext}`);
          },
        },
        {
          label: "Supprimer",
          onClick: async () => {
            await window.PG_ILLUSTRATIONS.deleteIllustration(entry.id);
            refreshIllustrationPanel();
          },
        },
      ]);
      illustrationGridEl.appendChild(item);
    }
  }

  illustrationPanel.addEventListener("toggle", refreshIllustrationPanel);
  refreshIllustrationPanel();

  /* ---------- Illustration cleanup: exact + near-duplicate review ---------- */

  const illustrationCleanupBtn = document.getElementById("illustration-cleanup-btn");
  const illustrationCleanupResultsEl = document.getElementById("illustration-cleanup-results");

  async function runIllustrationCleanupScan() {
    illustrationCleanupResultsEl.innerHTML = "";
    const { exactGroups, nearPairs, total } = await window.PG_ILLUSTRATIONS.findDuplicateGroups();

    if (!total) {
      illustrationCleanupResultsEl.innerHTML = `<p class="hint">Bibliothèque vide.</p>`;
      return;
    }
    if (!exactGroups.length && !nearPairs.length) {
      illustrationCleanupResultsEl.innerHTML = `<p class="hint">Aucun doublon détecté sur ${total} illustration(s).</p>`;
      return;
    }

    if (exactGroups.length) {
      const section = document.createElement("div");
      section.className = "cleanup-section";
      section.innerHTML = `<h3>Doublons exacts (image strictement identique)</h3>
        <p class="hint">La plus ancienne de chaque groupe est conservée ; les autres peuvent être supprimées sans perte, ce sont les mêmes octets.</p>`;
      for (const group of exactGroups) {
        const [keep, ...rest] = group;
        const groupEl = document.createElement("div");
        groupEl.className = "cleanup-group";
        const header = document.createElement("div");
        header.className = "cleanup-group-header";
        header.innerHTML = `<strong>${group.length} copies — "${keep.label}"</strong>`;
        const bulkBtn = document.createElement("button");
        bulkBtn.type = "button";
        bulkBtn.textContent = `Supprimer les ${rest.length} doublon(s), garder le plus ancien`;
        bulkBtn.addEventListener("click", async () => {
          for (const e of rest) await window.PG_ILLUSTRATIONS.deleteIllustration(e.id);
          await refreshIllustrationPanel();
          await runIllustrationCleanupScan();
        });
        header.appendChild(bulkBtn);
        groupEl.appendChild(header);

        const grid = document.createElement("div");
        grid.className = "illustration-grid";
        for (const entry of group) {
          const isKept = entry === keep;
          const { item } = buildIllustrationCard(entry, [
            {
              label: isKept ? "Conservée" : "Supprimer",
              onClick: async () => {
                if (isKept) return;
                await window.PG_ILLUSTRATIONS.deleteIllustration(entry.id);
                await refreshIllustrationPanel();
                await runIllustrationCleanupScan();
              },
            },
          ]);
          if (isKept) item.classList.add("cleanup-kept");
          grid.appendChild(item);
        }
        groupEl.appendChild(grid);
        section.appendChild(groupEl);
      }
      illustrationCleanupResultsEl.appendChild(section);
    }

    if (nearPairs.length) {
      const section = document.createElement("div");
      section.className = "cleanup-section";
      section.innerHTML = `<h3>Quasi-doublons à vérifier (contenu textuel très proche)</h3>
        <p class="hint">Les images sont différentes mais le titre/contenu se ressemble beaucoup — à toi de juger si ce sont deux illustrations distinctes à garder, ou un doublon à nettoyer.</p>`;
      for (const { score, a, b } of nearPairs) {
        const pairEl = document.createElement("div");
        pairEl.className = "cleanup-pair";
        pairEl.innerHTML = `<div class="cleanup-pair-score">Similarité de contenu : ${Math.round(score * 100)}%</div>`;
        const grid = document.createElement("div");
        grid.className = "illustration-grid";
        for (const entry of [a, b]) {
          const { item } = buildIllustrationCard(entry, [
            {
              label: "Supprimer celle-ci",
              onClick: async () => {
                await window.PG_ILLUSTRATIONS.deleteIllustration(entry.id);
                await refreshIllustrationPanel();
                await runIllustrationCleanupScan();
              },
            },
          ]);
          grid.appendChild(item);
        }
        pairEl.appendChild(grid);
        section.appendChild(pairEl);
      }
      illustrationCleanupResultsEl.appendChild(section);
    }
  }

  illustrationCleanupBtn.addEventListener("click", runIllustrationCleanupScan);

  const illustrationExportBtn = document.getElementById("illustration-export-btn");
  const illustrationImportInput = document.getElementById("illustration-import-input");

  illustrationExportBtn.addEventListener("click", async () => {
    const json = await window.PG_ILLUSTRATIONS.exportLibrary();
    triggerDownload(new Blob([json], { type: "application/json" }), "bibliotheque-illustrations.json");
  });

  const illustrationZipBtn = document.getElementById("illustration-zip-btn");

  illustrationZipBtn.addEventListener("click", async () => {
    const all = await window.PG_ILLUSTRATIONS.getAllIllustrations();
    if (!all.length) {
      setStatus("Bibliothèque vide — rien à télécharger.", "error");
      return;
    }
    const zip = new JSZip();
    const usedNames = new Set();
    for (const entry of all) {
      const base = (entry.label || "illustration").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
      let name = `${base}.${entry.ext}`;
      let n = 2;
      while (usedNames.has(name)) name = `${base} (${n++}).${entry.ext}`;
      usedNames.add(name);
      zip.file(name, entry.bytes);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    triggerDownload(blob, "bibliotheque-illustrations.zip");
  });

  illustrationImportInput.addEventListener("change", async () => {
    const file = illustrationImportInput.files && illustrationImportInput.files[0];
    illustrationImportInput.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const { total, imported, skipped } = await window.PG_ILLUSTRATIONS.importLibrary(text);
      await refreshIllustrationPanel();
      setStatus(`Bibliothèque importée : ${imported}/${total} nouvelle(s) illustration(s) ajoutée(s)${skipped ? ` (${skipped} déjà présente(s))` : ""}.`, "success");
    } catch (err) {
      setStatus(`Erreur d'import : ${err.message}`, "error");
    }
  });

  /* ---------- Shared generate button ---------- */

  generateBtn.addEventListener("click", async () => {
    generateBtn.disabled = true;
    try {
      if (mode === "pptx") await generateFromPptx();
      else if (mode === "pix") await generateFromPix();
      else if (mode === "merge") await generateFromMerge();
      else if (mode === "multi") await generateFromMulti();
      else await generateFromScratch();
      await refreshIllustrationPanel();
    } catch (err) {
      console.error(err);
      setStatus(`Erreur : ${err.message}`, "error");
    } finally {
      refreshGenerateEnabled();
    }
  });

  setMode("pptx");
})();
