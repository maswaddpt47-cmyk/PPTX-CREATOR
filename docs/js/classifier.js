/* Assigns each extracted content slide to the "Au programme" category it
   overlaps with most (token overlap heuristic), preserving each category's
   original source-slide order. */
(function (global) {
  "use strict";

  const { tokenize } = window.PG_SOURCE;

  function slideText(slide) {
    const parts = [slide.title, slide.intro];
    for (const item of slide.items) parts.push(item.heading, item.body);
    if (slide.table) parts.push(slide.table.headerRow.join(" "));
    return parts.join(" ");
  }

  /* Returns an array parallel to `programme`: groups[i] = content slides
     assigned to programme[i], in original order. If programme is empty,
     returns [[...all slides in order]]. */
  function classifyContentSlides(contentSlides, programme) {
    if (!programme.length) return [contentSlides.slice()];

    const catTokenSets = programme.map(
      (c) => new Set(tokenize(`${c.heading} ${c.body}`))
    );
    const groups = programme.map(() => []);

    for (const slide of contentSlides) {
      const tokens = tokenize(slideText(slide));
      let bestIdx = 0;
      let bestScore = -1;
      catTokenSets.forEach((set, idx) => {
        let score = 0;
        for (const t of tokens) if (set.has(t)) score++;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      });
      groups[bestIdx].push(slide);
    }
    return groups;
  }

  global.PG_CLASSIFIER = { classifyContentSlides };
})(window);
