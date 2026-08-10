/* Turns OCR-matched PIX themes into the same {title, programme,
   contentSlides, closing} model shape extractSourceModel() produces for
   mode 1, then reuses build.js's assembleDeck() to render it — no
   duplicated slide-rendering logic between the two modes. */
(function (global) {
  "use strict";

  const { PptxPackage, DeckBuilder } = window.PG_OOXML;
  const { THEMES } = window.PG_PIX_THEMES;
  const { assembleDeck } = window.PG_BUILD;
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

  function buildClosingSlide(matchedThemes, unmatched) {
    const headings = matchedThemes.map((t) => t.heading).join(", ") || "les notions abordées";
    const items = [
      {
        heading: "Les réflexes à retenir",
        body: `Relisez les points clés de : ${headings}.`,
      },
      {
        heading: "Vous êtes prêt",
        body: "Ces notions couvrent les situations les plus fréquentes rencontrées dans le parcours PIX préparé.",
      },
    ];
    if (unmatched.length) {
      items.push({
        heading: "Captures non reconnues",
        body:
          "À compléter manuellement : " +
          unmatched.map((u) => u.filename).join(", ") +
          ".",
      });
    }
    return {
      title: "Récapitulatif avant le parcours PIX",
      intro: "",
      items,
      image: null,
      table: null,
    };
  }

  /* matchedThemeIds/unmatched come from pix-extract.js's extractPixModel().
     Illustration priority per theme: an explicit ambiance image (round-robin
     across matched themes) if the user supplied any; otherwise a real
     illustration borrowed from the persistent library (illustration-library.js)
     if a similar one has been learned from a past PPTX; otherwise that
     theme's generic pictogram as a last resort. */
  async function buildPixModel(matchedThemeIds, unmatched, ambianceFiles, options) {
    // Canonical library order, not screenshot-upload order, for a stable read.
    const matchedThemes = THEMES.filter((t) => matchedThemeIds.includes(t.id));

    const ambianceBytes = [];
    for (const file of ambianceFiles || []) {
      const buf = await file.arrayBuffer();
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      ambianceBytes.push({ bytes: new Uint8Array(buf), ext });
    }

    const contentSlides = [];
    for (let i = 0; i < matchedThemes.length; i++) {
      const theme = matchedThemes[i];
      let image = ambianceBytes.length ? ambianceBytes[i % ambianceBytes.length] : null;
      if (!image && window.PG_ILLUSTRATIONS) {
        const match = await window.PG_ILLUSTRATIONS.findBestMatch(`${theme.heading} ${theme.intro}`);
        if (match) image = { bytes: match.bytes, ext: match.ext };
      }
      if (!image) image = pictoImage(theme.id);
      contentSlides.push({
        title: theme.title,
        intro: theme.intro,
        items: theme.items.map(([heading, body]) => ({ heading, body })),
        image,
        table: null,
      });
    }

    return {
      title: { main: (options.titre || "").trim(), intro: "", tags: [] },
      programme: matchedThemes.map((t) => ({ heading: t.heading, body: t.programmeBody })),
      contentSlides,
      closing: buildClosingSlide(matchedThemes, unmatched),
    };
  }

  async function generatePixDeck(gabaritBuffer, matchedThemeIds, unmatched, ambianceFiles, options) {
    options = Object.assign({ titre: "", thematique: "" }, options);

    const gabaritPkg = await PptxPackage.fromArrayBuffer(gabaritBuffer);
    const deck = new DeckBuilder(gabaritPkg);
    await deck.init();

    const model = await buildPixModel(matchedThemeIds, unmatched, ambianceFiles, options);
    const { groups } = await assembleDeck(deck, model, options);
    const blob = await deck.finalize();
    return { blob, model, groups };
  }

  global.PG_PIX_BUILD = { generatePixDeck };
})(window);
