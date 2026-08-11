/* Mode 3: enrich an existing PPTX with PIX-derived training content,
   trimmed to fit a target session length.

   Priority rule (per instructions): when a PIX theme and an old-deck slide
   cover the same notion, the PIX version wins — it's the one aligned with
   the upcoming evaluation. And when there isn't room for everything, PIX
   content is kept first; the old deck's slides are what gets trimmed.

   Simplification: unlike mode 1 (which groups an old deck's slides under
   its own "Au programme" categories via classifier.js's fuzzy matching),
   here every surviving slide — PIX-derived or from the old deck — becomes
   its own top-level section. This sacrifices the old deck's original
   category grouping, but keeps the merge/trim logic tractable: one slide
   = one section, exactly like pix-build.js already does. */
(function (global) {
  "use strict";

  const { PptxPackage, DeckBuilder } = window.PG_OOXML;
  const { extractSourceModel } = window.PG_SOURCE;
  const { THEMES } = window.PG_PIX_THEMES;
  const { assembleDeck, computeMaxSlides, MINUTES_PER_SLIDE, DEFAULT_TARGET_MINUTES } = window.PG_BUILD;
  const { extractPixModel, matchTheme } = window.PG_PIX_EXTRACT;
  const PICTOS = window.PG_PICTOS;

  function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function pictoImage(themeId) {
    const b64 = PICTOS[themeId];
    if (!b64) return null;
    return { bytes: base64ToBytes(b64), ext: "png" };
  }

  function slideText(slide) {
    const parts = [slide.title, slide.intro];
    for (const item of slide.items) parts.push(item.heading, item.body);
    return parts.join(" ");
  }

  function buildClosingSlide(matchedThemes, unmatched, keptCount, targetMinutes) {
    const headings = matchedThemes.map((t) => t.heading).join(", ") || "les notions abordées";
    const items = [
      {
        heading: "Les réflexes à retenir",
        body: `Relisez les points clés de : ${headings}.`,
      },
      {
        heading: "Séance calibrée",
        body:
          `${keptCount} section(s) retenue(s), pour une séance d'environ ${keptCount * MINUTES_PER_SLIDE} minutes ` +
          `(cible ${targetMinutes} min, ~${MINUTES_PER_SLIDE} min/section — les captures PIX sont toujours ` +
          `conservées en priorité, le contenu de l'ancien support est réduit en premier si besoin).`,
      },
    ];
    if (unmatched.length) {
      items.push({
        heading: "Captures non reconnues",
        body: "À compléter manuellement : " + unmatched.map((u) => u.filename).join(", ") + ".",
      });
    }
    return { title: "Récapitulatif avant le parcours PIX", intro: "", items, image: null, table: null };
  }

  async function buildMergedModel(oldModel, pixResult, ambianceFiles, options) {
    const targetMinutes = options.targetMinutes > 0 ? options.targetMinutes : DEFAULT_TARGET_MINUTES;
    const maxSlides = computeMaxSlides(targetMinutes);
    const counts = {};
    for (const f of pixResult.perFile) if (f.theme) counts[f.theme] = (counts[f.theme] || 0) + 1;
    // Most-confirmed PIX theme first: both the natural priority order and,
    // if PIX content alone ever outgrows the budget, the trim order.
    const matchedThemes = THEMES.filter((t) => pixResult.matchedThemeIds.includes(t.id)).sort(
      (a, b) => (counts[b.id] || 0) - (counts[a.id] || 0)
    );

    const ambianceBytes = [];
    for (const file of ambianceFiles || []) {
      const buf = await file.arrayBuffer();
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      ambianceBytes.push({ bytes: new Uint8Array(buf), ext });
    }

    const pixEntries = [];
    for (let i = 0; i < matchedThemes.length; i++) {
      const theme = matchedThemes[i];
      let image = ambianceBytes.length ? ambianceBytes[i % ambianceBytes.length] : null;
      if (!image && window.PG_ILLUSTRATIONS) {
        const match = await window.PG_ILLUSTRATIONS.findBestMatch(`${theme.heading} ${theme.intro}`);
        if (match) image = { bytes: match.bytes, ext: match.ext };
      }
      if (!image) image = pictoImage(theme.id);
      pixEntries.push({
        programme: { heading: theme.heading, body: theme.programmeBody },
        slide: {
          title: theme.title,
          intro: theme.intro,
          items: theme.items.map(([heading, body]) => ({ heading, body })),
          image,
          table: null,
        },
      });
    }

    // Drop old-deck slides that already cover a kept PIX theme — the PIX
    // version wins on overlap.
    const keptThemeIds = new Set(matchedThemes.map((t) => t.id));
    const oldEntries = oldModel.contentSlides
      .filter((slide) => {
        const m = matchTheme(slideText(slide));
        return !(m && keptThemeIds.has(m.theme.id));
      })
      .map((slide) => ({
        programme: { heading: slide.title || "Section", body: slide.intro || "" },
        slide,
      }));

    let combined = pixEntries.concat(oldEntries);
    if (combined.length > maxSlides) combined = combined.slice(0, maxSlides);

    return {
      title: { main: (options.titre || "").trim() || oldModel.title.main, intro: "", tags: [] },
      programme: combined.map((c) => c.programme),
      contentSlides: combined.map((c) => c.slide),
      closing: buildClosingSlide(matchedThemes, pixResult.unmatched, combined.length, targetMinutes),
    };
  }

  async function generateMergedDeck(gabaritBuffer, sourceBuffer, pixFiles, ambianceFiles, options, onProgress) {
    options = Object.assign({ titre: "", thematique: "", targetMinutes: DEFAULT_TARGET_MINUTES }, options);

    const sourcePkg = await PptxPackage.fromArrayBuffer(sourceBuffer);
    const oldModel = await extractSourceModel(sourcePkg);
    const pixResult = await extractPixModel(pixFiles, onProgress);
    const model = await buildMergedModel(oldModel, pixResult, ambianceFiles, options);

    const gabaritPkg = await PptxPackage.fromArrayBuffer(gabaritBuffer);
    const deck = new DeckBuilder(gabaritPkg);
    await deck.init();
    const { groups } = await assembleDeck(deck, model, options);
    const blob = await deck.finalize();

    return { blob, model, groups, pixResult, keptCount: model.contentSlides.length };
  }

  global.PG_MERGE_BUILD = { generateMergedDeck, MINUTES_PER_SLIDE, DEFAULT_TARGET_MINUTES };
})(window);
