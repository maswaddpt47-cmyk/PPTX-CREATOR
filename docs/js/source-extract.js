/* Turns an arbitrary uploaded source .pptx into a structured content model:
   title slide, "Au programme" categories, and a list of content slides each
   broken into title + intro + heading/body items (or table rows, when a
   slide's shapes form a clean grid). Generic — no gabarit knowledge here. */
(function (global) {
  "use strict";

  const { NS, tag, firstTag } = window.PG_OOXML;

  const STOPWORDS = new Set(
    (
      "le la les un une des de du au aux et ou en dans sur pour par avec sans " +
      "ce cet cette ces son sa ses leur leurs votre vos notre nos vous nous " +
      "est sont être avoir a ont qui que quoi dont où comme plus moins bien " +
      "tout tous toute toutes pas ne se ça il elle on y d l qu s c j"
    ).split(" ")
  );

  function tokenize(text) {
    return (text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  }

  /* Truncates at the last word boundary at or before maxLen (never mid-word).
     If the text has no space before maxLen, returns it whole rather than
     chopping a single long word. */
  function truncateAtWord(text, maxLen) {
    const t = (text || "").trim();
    if (t.length <= maxLen) return t;
    const cut = t.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(" ");
    const safe = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
    return safe.trim() + "…";
  }

  /* Locates the shape's own <a:xfrm> — scoped to its <p:spPr> (sp/pic) or
     its direct <p:xfrm> (graphicFrame) — rather than a deep subtree search.
     A deep search via getElementsByTagNameNS can match an unrelated <a:ext>
     sitting inside <p:cNvPr><a:extLst> metadata (e.g. PowerPoint's
     a16:creationId tracking element), which appears earlier in document
     order than the real geometry and yields NaN position/size. */
  function readXfrm(child, local) {
    let xfrm = null;
    if (local === "sp" || local === "pic") {
      const spPr = firstTag(child, NS.p, "spPr");
      if (spPr) xfrm = firstTag(spPr, NS.a, "xfrm");
    } else if (local === "graphicFrame") {
      xfrm = firstTag(child, NS.p, "xfrm");
    }
    return xfrm;
  }

  function readShapes(slideDoc) {
    const spTree = firstTag(slideDoc, NS.p, "spTree");
    const shapes = [];
    for (const child of Array.from(spTree.children)) {
      const local = child.localName;
      if (local !== "sp" && local !== "pic" && local !== "graphicFrame") continue;
      const xfrm = readXfrm(child, local);
      const off = xfrm ? firstTag(xfrm, NS.a, "off") : null;
      const ext = xfrm ? firstTag(xfrm, NS.a, "ext") : null;
      const pos = off
        ? {
            x: parseInt(off.getAttribute("x"), 10),
            y: parseInt(off.getAttribute("y"), 10),
            cx: ext ? parseInt(ext.getAttribute("cx"), 10) : 0,
            cy: ext ? parseInt(ext.getAttribute("cy"), 10) : 0,
          }
        : null;

      let text = "";
      let bold = false;
      let maxSize = 0;
      let blipRid = null;
      if (local === "pic") {
        const blip = firstTag(child, NS.a, "blip");
        if (blip) blipRid = blip.getAttributeNS(NS.r, "embed");
      }
      if (local === "sp") {
        const txBody = firstTag(child, NS.p, "txBody");
        if (txBody) {
          const paraTexts = [];
          for (const p of tag(txBody, NS.a, "p")) {
            let pText = "";
            for (const r of tag(p, NS.a, "r")) {
              const t = firstTag(r, NS.a, "t");
              if (t) pText += t.textContent;
              const rPr = firstTag(r, NS.a, "rPr");
              if (rPr) {
                if (rPr.getAttribute("b") === "1") bold = true;
                const sz = rPr.getAttribute("sz");
                if (sz) maxSize = Math.max(maxSize, parseInt(sz, 10));
              }
            }
            paraTexts.push(pText);
          }
          text = paraTexts.join("\n").trim();
        }
      }

      shapes.push({ kind: local, text, bold, maxSize, pos, blipRid });
    }
    return shapes;
  }

  function isNumericLabel(text) {
    return /^\d{1,2}$/.test(text.trim());
  }

  /* Reading order by position (row-major: top-to-bottom, then left-to-right
     within a row band) — more reliable than raw XML shape order, which some
     generators (e.g. diagonal step diagrams) don't emit in visual order. */
  function sortByPosition(shapes) {
    const YB = 50000; // ~0.05in tolerance for "same row"
    return shapes.slice().sort((a, b) => {
      const ay = a.pos ? a.pos.y : 0;
      const by = b.pos ? b.pos.y : 0;
      if (Math.abs(ay - by) > YB) return ay - by;
      const ax = a.pos ? a.pos.x : 0;
      const bx = b.pos ? b.pos.x : 0;
      return ax - bx;
    });
  }

  /* Split a shape list into {heading, body} items. Headings (short/bold
     shapes) are ordered top-to-bottom/left-to-right; each then geometrically
     claims the nearest unclaimed non-heading shape roughly below it at a
     similar x (its "body") — this matches multi-column card grids (heading
     directly above its own body, shared row-y across columns) without
     depending on the source's raw XML shape order, which some generators
     (e.g. diagonal step diagrams) don't emit in visual/logical order. */
  function pairItems(rawShapes) {
    const shapes = rawShapes.filter((s) => s.text && !isNumericLabel(s.text));
    const headings = [];
    const bodies = [];
    for (const s of shapes) {
      const looksLikeHeading = s.text.length <= 90 && (s.bold || s.maxSize >= 1500);
      (looksLikeHeading ? headings : bodies).push(s);
    }

    if (headings.length === 0) {
      return shapes.map((s) => ({ heading: "", body: s.text }));
    }

    const orderedHeadings = sortByPosition(headings);
    const claimed = new Set();
    const X_TOLERANCE = 500000; // ~0.55in: same "column" as its heading

    const items = orderedHeadings.map((h) => {
      let best = null;
      let bestDist = Infinity;
      for (const b of bodies) {
        if (claimed.has(b) || !b.pos || !h.pos) continue;
        const dx = Math.abs(b.pos.x - h.pos.x);
        if (dx > X_TOLERANCE) continue;
        const dy = b.pos.y - h.pos.y;
        const dist = dy >= 0 ? dy : Math.abs(dy) + 1e7; // strongly prefer bodies below their heading
        if (dist < bestDist) {
          bestDist = dist;
          best = b;
        }
      }
      if (best) claimed.add(best);
      return { heading: h.text, body: best ? best.text : "" };
    });

    for (const b of bodies) {
      if (!claimed.has(b)) items.push({ heading: "", body: b.text });
    }
    return items;
  }

  /* Detect a grid of short text shapes (used for slides that fake a table
     with individually positioned cells, e.g. pptxgenjs-built comparisons). */
  function detectTable(shapes) {
    const cells = shapes.filter((s) => s.kind === "sp" && s.text && s.pos);
    if (cells.length < 9) return null;

    const bucket = (v) => Math.round(v / 150000);
    const xVals = [...new Set(cells.map((c) => bucket(c.pos.x)))].sort((a, b) => a - b);
    const yVals = [...new Set(cells.map((c) => bucket(c.pos.y)))].sort((a, b) => a - b);
    const xBuckets = new Map(xVals.map((v, i) => [v, i]));
    const yBuckets = new Map(yVals.map((v, i) => [v, i]));
    const nCols = xBuckets.size;
    const nRows = yBuckets.size;
    if (nCols < 3 || nRows < 3) return null;
    if (cells.length < nCols * nRows * 0.7) return null;

    const grid = Array.from({ length: nRows }, () => new Array(nCols).fill(""));
    for (const c of cells) {
      const r = yBuckets.get(bucket(c.pos.y));
      const col = xBuckets.get(bucket(c.pos.x));
      grid[r][col] = c.text;
    }
    return { headerRow: grid[0], rows: grid.slice(1) };
  }

  function extractSlideContent(shapes) {
    const textShapes = shapes.filter((s) => s.text);
    if (textShapes.length === 0) return null;

    const title = textShapes[0].text;
    let rest = textShapes.slice(1);

    let intro = "";
    let introShape = null;
    if (rest.length && rest[0].text.length >= 70 && rest[0].pos && rest[0].pos.cx > 3000000) {
      introShape = rest[0];
      intro = introShape.text;
      rest = rest.slice(1);
    }

    const excluded = new Set([textShapes[0], introShape].filter(Boolean));
    const table = detectTable(shapes.filter((s) => !excluded.has(s)));
    const items = table ? [] : pairItems(rest);

    // 1.2M EMU (~1.3in) floor excludes small per-item icon glyphs (~0.3in)
    // that sit inline with a heading rather than serving as the slide's
    // illustration.
    const ILLUSTRATION_MIN = 1200000;
    const pics = shapes.filter(
      (s) => s.kind === "pic" && s.blipRid && s.pos && s.pos.cx >= ILLUSTRATION_MIN && s.pos.cy >= ILLUSTRATION_MIN
    );
    let imageRid = null;
    if (pics.length) {
      pics.sort((a, b) => b.pos.cx * b.pos.cy - a.pos.cx * a.pos.cy);
      // A "cards with a background picture per item" layout (e.g. 4 cards,
      // each backed by the same or a same-size decorative PNG reused as a
      // tinted panel) produces several large pics above ILLUSTRATION_MIN
      // that are NOT a genuine single hero illustration. Confirmed on a
      // real deck: 3 of 4 "pictures" on one slide were literally the same
      // rId reused as each card's backdrop. Only pick an image when either
      // a single rId repeats (unambiguous decorative reuse — never a real
      // illustration) is absent, and the top candidate clearly dominates
      // the runner-up in area (a real hero photo isn't matched in size by
      // a second large picture on the same slide).
      const ridCounts = new Map();
      for (const p of pics) ridCounts.set(p.blipRid, (ridCounts.get(p.blipRid) || 0) + 1);
      const hasRepeatedRid = [...ridCounts.values()].some((n) => n > 1);
      const top = pics[0];
      const runnerUp = pics[1];
      const topArea = top.pos.cx * top.pos.cy;
      const runnerUpArea = runnerUp ? runnerUp.pos.cx * runnerUp.pos.cy : 0;
      const topDominates = !runnerUp || runnerUpArea < topArea * 0.6;
      if (!hasRepeatedRid && topDominates) imageRid = top.blipRid;
    }

    return { title, intro, items, table, imageRid };
  }

  function resolveRelTarget(baseDir, target) {
    if (target.startsWith("/")) return target.slice(1);
    const parts = baseDir.split("/").concat(target.split("/"));
    const out = [];
    for (const part of parts) {
      if (part === "" || part === ".") continue;
      if (part === "..") out.pop();
      else out.push(part);
    }
    return out.join("/");
  }

  /* Resolve a slide-local blip rId to raw image bytes + extension via that
     slide's own .rels file (rels Targets are relative to ppt/slides/, the
     directory of the slide part itself — not its _rels subfolder). */
  async function resolveSlideImage(pkg, slideNum, rid) {
    if (!rid) return null;
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    if (!pkg.has(relsPath)) return null;
    const relsDoc = await pkg.readXml(relsPath);
    const rel = tag(relsDoc, NS.rel, "Relationship").find((r) => r.getAttribute("Id") === rid);
    if (!rel) return null;
    const mediaPath = resolveRelTarget("ppt/slides", rel.getAttribute("Target"));
    if (!pkg.has(mediaPath)) return null;
    const bytes = await pkg.bytes(mediaPath);
    const ext = mediaPath.split(".").pop().toLowerCase();
    return { bytes, ext };
  }

  const CLOSING_KEYWORDS = ["recapitulat", "conclusion", "resume", "bilan"];

  function looksLikeClosing(title) {
    const norm = title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    return CLOSING_KEYWORDS.some((k) => norm.includes(k));
  }

  /* pkg: PptxPackage of the uploaded source deck. Returns:
     { title: {main, intro, tags}, programme: [{heading,body}],
       contentSlides: [{num,title,intro,items,table}], closing: {...}|null } */
  async function extractSourceModel(pkg) {
    const slideNums = pkg
      .listFiles()
      .map((f) => f.match(/^ppt\/slides\/slide(\d+)\.xml$/))
      .filter(Boolean)
      .map((m) => parseInt(m[1], 10))
      .sort((a, b) => a - b);

    if (slideNums.length < 3) {
      throw new Error("Le fichier source doit contenir au moins 3 diapositives.");
    }

    const docs = {};
    for (const n of slideNums) docs[n] = await pkg.readXml(`ppt/slides/slide${n}.xml`);

    const titleShapes = readShapes(docs[slideNums[0]]);
    const titleText = titleShapes.filter((s) => s.text);
    const title = {
      main: titleText[0] ? titleText[0].text : "",
      intro: titleText[1] ? titleText[1].text : "",
      tags: titleText.slice(2).map((s) => s.text),
    };

    const programmeShapes = readShapes(docs[slideNums[1]]);
    const programmeItems = pairItems(
      programmeShapes.filter((s) => s.text && !isNumericLabel(s.text)).slice(2)
    );
    const programme = programmeItems.map((it) => ({
      heading: it.heading || truncateAtWord(it.body, 60),
      body: it.body,
    }));

    const contentNums = slideNums.slice(2);
    const contentSlides = [];
    let closing = null;
    for (let i = 0; i < contentNums.length; i++) {
      const num = contentNums[i];
      const shapes = readShapes(docs[num]);
      const extracted = extractSlideContent(shapes);
      if (!extracted) continue;
      const image = await resolveSlideImage(pkg, num, extracted.imageRid);
      const entry = { num, ...extracted, image };
      if (image && window.PG_ILLUSTRATIONS) {
        const text = [entry.title, entry.intro, ...entry.items.map((it) => `${it.heading} ${it.body}`)].join(" ");
        await window.PG_ILLUSTRATIONS.addIllustration({
          label: entry.title || `Illustration slide ${num}`,
          text,
          bytes: image.bytes,
          ext: image.ext,
        });
      }
      if (i === contentNums.length - 1 && looksLikeClosing(entry.title)) {
        closing = entry;
      } else {
        contentSlides.push(entry);
      }
    }

    return { title, programme, contentSlides, closing, tokenize };
  }

  global.PG_SOURCE = { extractSourceModel, tokenize, readShapes, pairItems };
})(window);
