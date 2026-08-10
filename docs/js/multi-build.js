/* Mode 4: merge several old-charte PPTX sources into one new-gabarit deck.

   Design choices confirmed with the user before building this (see chat):
   - de-duplicate near-identical content across sources (not just within one)
   - keep each source's own "Au programme" categories grouped separately, in
     upload order (Source 1's sections, then Source 2's, etc.) — NOT
     flattened to one-slide-per-section like mode 3's old-deck side, because
     that's specifically what was asked for here.

   This is why assembleDeck() (build.js) isn't reused as-is: it classifies
   one flat slide list against one flat programme in a single pass, which
   would let the classifier reshuffle a source's slide under a DIFFERENT
   source's category if the fuzzy keyword match happened to score higher
   there. Classifying each source against its own programme independently
   (below) avoids that cross-contamination.

   UNVERIFIED HEURISTIC: slide-similarity uses a Jaccard token-overlap
   threshold (SIMILARITY_THRESHOLD) to decide "same topic, drop the later
   one". Not validated against real old-charte decks yet — tune after
   real-world testing shows false positives/negatives. */
(function (global) {
  "use strict";

  const { PptxPackage, DeckBuilder } = window.PG_OOXML;
  const G = window.PG_GABARIT;
  const { extractSourceModel, tokenize } = window.PG_SOURCE;
  const { classifyContentSlides } = window.PG_CLASSIFIER;
  const { renderContentSlide, pickLienSuggestions } = window.PG_BUILD;

  const SIMILARITY_THRESHOLD = 0.35;

  function slideText(slide) {
    const parts = [slide.title, slide.intro];
    for (const item of slide.items) parts.push(item.heading, item.body);
    if (slide.table) parts.push(slide.table.headerRow.join(" "));
    return parts.join(" ");
  }

  function jaccard(setA, setB) {
    let inter = 0;
    for (const t of setA) if (setB.has(t)) inter++;
    const union = setA.size + setB.size - inter;
    return union > 0 ? inter / union : 0;
  }

  /* Keeps the first-seen version of any near-duplicate slide — since
     sources are processed in upload order, this is what makes an earlier
     source's content win over a later, similar one. */
  function makeDedup() {
    const seen = [];
    return function isDuplicate(slide) {
      const tokens = new Set(tokenize(slideText(slide)));
      for (const prev of seen) {
        if (jaccard(tokens, prev) >= SIMILARITY_THRESHOLD) return true;
      }
      seen.push(tokens);
      return false;
    };
  }

  async function assembleMultiDeck(deck, sourceModels, options) {
    const doc1 = await deck.loadSlideDoc(1);
    const titre = options.titre.trim() || (sourceModels[0] ? sourceModels[0].title.main : "");
    G.setTitle(doc1, titre, { missing: !titre, fieldLabel: "titre de l'atelier" });
    G.setEyebrow(doc1, options.thematique);
    deck.saveSlideDoc(1, doc1);

    const isDuplicate = makeDedup();
    const sommaireHeadings = [];
    const orderedRelIds = [
      deck.relIdForExistingSlide(1),
      deck.relIdForExistingSlide(2),
      deck.relIdForExistingSlide(3),
      deck.relIdForExistingSlide(4),
      deck.relIdForExistingSlide(5),
    ];

    let droppedCount = 0;

    for (const model of sourceModels) {
      const groups = classifyContentSlides(model.contentSlides, model.programme);
      for (let ci = 0; ci < groups.length; ci++) {
        const survivors = [];
        for (const slide of groups[ci]) {
          if (isDuplicate(slide)) droppedCount++;
          else survivors.push(slide);
        }
        if (!survivors.length) continue;

        if (model.programme.length) {
          sommaireHeadings.push(model.programme[ci].heading);
          const divider = await deck.cloneSlide(6);
          const divDoc = await deck.loadSlideDoc(divider.num);
          G.setDividerTitle(divDoc, model.programme[ci].heading);
          deck.saveSlideDoc(divider.num, divDoc);
          orderedRelIds.push(divider.relId);
        }

        for (const slide of survivors) {
          const rendered = await renderContentSlide(deck, slide);
          orderedRelIds.push(rendered.relId);
        }
      }
    }

    const doc5 = await deck.loadSlideDoc(5);
    G.setSommaireItems(
      doc5,
      sommaireHeadings.length ? sommaireHeadings : [G.alertText("sommaire — aucune section détectée dans les sources")]
    );
    deck.saveSlideDoc(5, doc5);

    // Each source's own closing/recap slide (if any), subject to the same
    // dedup as regular content, appended in source order at the very end.
    for (const model of sourceModels) {
      if (!model.closing || isDuplicate(model.closing)) continue;
      const rendered = await renderContentSlide(deck, model.closing);
      orderedRelIds.push(rendered.relId);
    }

    // Combined corpus (all sources' titles + programme) for the resource-link
    // suggestions, same mechanism as single-source generateDeck().
    const combinedModel = {
      title: sourceModels[0] ? sourceModels[0].title : { main: "", intro: "" },
      programme: sourceModels.flatMap((m) => m.programme),
    };
    const doc9 = await deck.loadSlideDoc(9);
    G.setLiensSuggestions(doc9, pickLienSuggestions(combinedModel));
    deck.saveSlideDoc(9, doc9);
    orderedRelIds.push(deck.relIdForExistingSlide(9));

    orderedRelIds.push(deck.relIdForExistingSlide(10));

    deck.setFinalOrder(orderedRelIds);
    return { sommaireHeadings, droppedCount };
  }

  async function generateMultiDeck(gabaritBuffer, sourceFiles, options) {
    options = Object.assign({ titre: "", thematique: "" }, options);

    const sourceModels = [];
    for (const file of sourceFiles) {
      const buf = await file.arrayBuffer();
      const pkg = await PptxPackage.fromArrayBuffer(buf);
      sourceModels.push(await extractSourceModel(pkg));
    }

    const gabaritPkg = await PptxPackage.fromArrayBuffer(gabaritBuffer);
    const deck = new DeckBuilder(gabaritPkg);
    await deck.init();

    const { sommaireHeadings, droppedCount } = await assembleMultiDeck(deck, sourceModels, options);
    const blob = await deck.finalize();

    return { blob, sectionCount: sommaireHeadings.length, droppedCount };
  }

  global.PG_MULTI_BUILD = { generateMultiDeck, SIMILARITY_THRESHOLD };
})(window);
