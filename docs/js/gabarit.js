/* Edits specific to the Département 47 gabarit's slide shells: title,
   sommaire, section dividers, 1/2-column content, the "liens" block on the
   avant-dernière page, and native table slides. Hardcoded to this template's
   known shape names/placeholder types (see CLAUDE.md decision: tool is
   specific to this gabarit, not a generic detector). */
(function (global) {
  "use strict";

  const { NS, tag, firstTag } = window.PG_OOXML;

  const RED = "FF0000";
  const ALERT_PREFIX = "⚠ CONTENU MANQUANT : ";

  function alertText(fieldLabel) {
    return `${ALERT_PREFIX}${fieldLabel}`;
  }

  function findShapeByName(root, name) {
    return tag(root, NS.p, "sp").find((sp) => {
      const cNvPr = firstTag(sp, NS.p, "cNvPr");
      return cNvPr && cNvPr.getAttribute("name") === name;
    });
  }

  function findShapeByPhType(root, phType) {
    return tag(root, NS.p, "sp").find((sp) => {
      const ph = firstTag(sp, NS.p, "ph");
      return ph && ph.getAttribute("type") === phType;
    });
  }

  function findShapeByPhIdx(root, idx, { noType = false } = {}) {
    return tag(root, NS.p, "sp").find((sp) => {
      const ph = firstTag(sp, NS.p, "ph");
      if (!ph) return false;
      if (noType && ph.getAttribute("type")) return false;
      return ph.getAttribute("idx") === String(idx);
    });
  }

  function paragraphs(shape) {
    const txBody = firstTag(shape, NS.p, "txBody");
    return tag(txBody, NS.a, "p");
  }

  function runsOf(p) {
    return tag(p, NS.a, "r");
  }

  function textOf(p) {
    return runsOf(p)
      .map((r) => (firstTag(r, NS.a, "t") || {}).textContent || "")
      .join("");
  }

  /* Set the first run's text, drop any extra runs in the paragraph so no
     stale trailing text survives. If the paragraph has no run at all (some
     gabarit placeholders, e.g. slide8's title, ship empty — only an
     <a:endParaRPr>), synthesize one from that endParaRPr's formatting. */
  function setParagraphText(p, text) {
    const runs = runsOf(p);
    if (runs.length === 0) {
      const doc = p.ownerDocument;
      const endParaRPr = firstTag(p, NS.a, "endParaRPr");
      const r = doc.createElementNS(NS.a, "a:r");
      if (endParaRPr) {
        const renamed = doc.createElementNS(NS.a, "a:rPr");
        for (const attr of Array.from(endParaRPr.attributes)) {
          renamed.setAttribute(attr.name, attr.value);
        }
        for (const child of Array.from(endParaRPr.childNodes)) {
          renamed.appendChild(child.cloneNode(true));
        }
        r.appendChild(renamed);
      }
      const t = doc.createElementNS(NS.a, "a:t");
      t.textContent = text;
      r.appendChild(t);
      if (endParaRPr) p.insertBefore(r, endParaRPr);
      else p.appendChild(r);
      return true;
    }
    firstTag(runs[0], NS.a, "t").textContent = text;
    for (let i = runs.length - 1; i >= 1; i--) runs[i].parentNode.removeChild(runs[i]);
    return true;
  }

  function markRunRed(p) {
    const runs = runsOf(p);
    if (!runs.length) return;
    const rPr = firstTag(runs[0], NS.a, "rPr");
    if (!rPr) return;
    const existingFill = firstTag(rPr, NS.a, "solidFill");
    if (existingFill) rPr.removeChild(existingFill);
    const fill = p.ownerDocument.createElementNS(NS.a, "a:solidFill");
    const clr = p.ownerDocument.createElementNS(NS.a, "a:srgbClr");
    clr.setAttribute("val", RED);
    fill.appendChild(clr);
    // solidFill must sit before typeface elements per CT_TextCharacterProperties
    const latin = firstTag(rPr, NS.a, "latin");
    if (latin) rPr.insertBefore(fill, latin);
    else rPr.appendChild(fill);
  }

  function setTitle(doc, text, { missing = false, fieldLabel = "titre" } = {}) {
    const shape = findShapeByPhType(doc, "title") || findShapeByPhType(doc, "ctrTitle");
    if (!shape) throw new Error("Title placeholder not found");
    const p = paragraphs(shape)[0];
    const value = missing || !text ? alertText(fieldLabel) : text;
    setParagraphText(p, value);
    if (missing || !text) markRunRed(p);
  }

  /* Slide 1 only: "X - GRANDE THÉMATIQUE" eyebrow above the title. */
  function setEyebrow(doc, text) {
    const shape = findShapeByName(doc, "Subtitle 2") || findShapeByPhType(doc, "subTitle");
    if (!shape) throw new Error("Eyebrow/subtitle placeholder not found");
    const p = paragraphs(shape)[0];
    const value = text && text.trim() ? text.trim() : alertText("thématique (page de titre)");
    setParagraphText(p, value);
    if (!text || !text.trim()) markRunRed(p);
  }

  /* Sommaire slide: replace the (up to 4) numbered item paragraphs inside
     "ZoneTexte 13", leaving spacer paragraphs untouched. Extra slots (fewer
     than 4 categories) get their item + following spacer removed. */
  function setSommaireItems(doc, items) {
    const shape = findShapeByName(doc, "ZoneTexte 13");
    if (!shape) throw new Error("Sommaire text box not found");
    const txBody = firstTag(shape, NS.p, "txBody");
    const allP = tag(txBody, NS.a, "p");
    const itemParas = allP.filter((p) => textOf(p).trim().length > 0);

    itemParas.forEach((p, i) => {
      if (i < items.length) {
        setParagraphText(p, ` ${items[i]}`);
      } else {
        const idx = allP.indexOf(p);
        const spacer = allP[idx + 1];
        p.parentNode.removeChild(p);
        if (spacer && textOf(spacer).trim() === "") spacer.parentNode.removeChild(spacer);
      }
    });
  }

  /* Section divider slide (clone of the gabarit's "Titre de la partie"). */
  function setDividerTitle(doc, text) {
    setTitle(doc, text);
  }

  function buildRunEl(doc, text, { bold = false, size = 1600, color = "1F1F1F" } = {}) {
    const r = doc.createElementNS(NS.a, "a:r");
    const rPr = doc.createElementNS(NS.a, "a:rPr");
    rPr.setAttribute("lang", "fr-FR");
    rPr.setAttribute("sz", String(size));
    rPr.setAttribute("b", bold ? "1" : "0");
    const fill = doc.createElementNS(NS.a, "a:solidFill");
    const clr = doc.createElementNS(NS.a, "a:srgbClr");
    clr.setAttribute("val", color);
    fill.appendChild(clr);
    rPr.appendChild(fill);
    const latin = doc.createElementNS(NS.a, "a:latin");
    latin.setAttribute("typeface", "Calibri");
    rPr.appendChild(latin);
    r.appendChild(rPr);
    const t = doc.createElementNS(NS.a, "a:t");
    t.textContent = text;
    r.appendChild(t);
    return r;
  }

  /* bullet:false paragraphs (intros, standalone notes) must pin marL/indent
     to 0 — otherwise they inherit the layout's hanging-indent list style and
     the first line sits left of the wrapped continuation lines. lnSpcPct
     (OOXML spcPct units, 100000 = single spacing) tightens line spacing on
     the densest cards — cheaper on legibility than shrinking the font
     further once a slide is genuinely too full for the space available. */
  function buildBulletParagraph(doc, text, { bold = false, size = 1600, color = "1F1F1F", bullet = true, lnSpcPct = 100000 } = {}) {
    const p = doc.createElementNS(NS.a, "a:p");
    const pPr = doc.createElementNS(NS.a, "a:pPr");
    if (lnSpcPct !== 100000) {
      const lnSpc = doc.createElementNS(NS.a, "a:lnSpc");
      const spcPct = doc.createElementNS(NS.a, "a:spcPct");
      spcPct.setAttribute("val", String(lnSpcPct));
      lnSpc.appendChild(spcPct);
      pPr.appendChild(lnSpc);
    }
    if (bullet) {
      pPr.setAttribute("marL", "285750");
      pPr.setAttribute("indent", "-285750");
      const buFont = doc.createElementNS(NS.a, "a:buFont");
      buFont.setAttribute("typeface", "Arial");
      pPr.appendChild(buFont);
      const buChar = doc.createElementNS(NS.a, "a:buChar");
      buChar.setAttribute("char", "•");
      pPr.appendChild(buChar);
    } else {
      pPr.setAttribute("marL", "0");
      pPr.setAttribute("indent", "0");
      const buNone = doc.createElementNS(NS.a, "a:buNone");
      pPr.appendChild(buNone);
    }
    p.appendChild(pPr);
    p.appendChild(buildRunEl(doc, text, { bold, size, color }));
    return p;
  }

  /* ~ character/line-height ratios for Calibri, used to estimate wrapped
     text height since this environment can't render the deck to measure
     it. Generous on purpose: an oversized card is far less bad than a
     clipped one. */
  /* fontSz is in OOXML hundredths-of-a-point (e.g. 1400 = 14pt), matching
     the `size` convention used everywhere else in this file. */
  function estimateTextHeightEmu(text, widthEmu, fontSz, { bold = false, lnSpcPct = 100000 } = {}) {
    if (!text) return 0;
    const pt = fontSz / 100;
    const widthIn = widthEmu / 914400;
    const charWidthIn = (pt / 72) * (bold ? 0.56 : 0.52);
    const lineHeightIn = (pt / 72) * 1.22 * (lnSpcPct / 100000);
    const charsPerLine = Math.max(1, Math.floor(widthIn / charWidthIn));
    // Body text often joins several source bullets with literal "\n"
    // (rendered as forced line breaks, not wrappable characters) — counting
    // the whole string as one flowing paragraph undercounts real height
    // whenever it contains one of these. Each "\n"-separated segment wraps
    // on its own.
    const numLines = text
      .split("\n")
      .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
    return Math.round(numLines * lineHeightIn * 914400 * 1.15);
  }

  const CARD_PAD_L = 137160,
    CARD_PAD_R = 137160,
    CARD_PAD_T = 91440,
    CARD_PAD_B = 91440;
  const CARD_HEADING_BODY_GAP = 45720;

  function estimateCardHeight(item, cardWidth, sizes) {
    const innerWidth = cardWidth - CARD_PAD_L - CARD_PAD_R;
    const lnSpcPct = sizes.lnSpcPct || 100000;
    const hH = item.heading
      ? estimateTextHeightEmu(item.heading, innerWidth, sizes.heading, { bold: true, lnSpcPct })
      : 0;
    const bH = item.body ? estimateTextHeightEmu(item.body, innerWidth, sizes.body, { lnSpcPct }) : 0;
    const gap = item.heading && item.body ? CARD_HEADING_BODY_GAP : 0;
    return CARD_PAD_T + CARD_PAD_B + hH + gap + bH;
  }

  function estimatePlainHeight(text, width, fontPt, lnSpcPct = 100000) {
    return estimateTextHeightEmu(text, width, fontPt, { lnSpcPct });
  }

  let shapeIdCounter = 800000;
  function freshShapeId() {
    return String(shapeIdCounter++);
  }

  /* A bordered "cartouche" card: bold heading + body, matching the source
     deck's boxed items (kept as a full border, never a one-edge accent
     stripe). */
  function buildCard(doc, { x, y, cx, cy, heading, body, sizes }) {
    const sp = doc.createElementNS(NS.p, "p:sp");
    const nvSpPr = doc.createElementNS(NS.p, "p:nvSpPr");
    const cNvPr = doc.createElementNS(NS.p, "p:cNvPr");
    cNvPr.setAttribute("id", freshShapeId());
    cNvPr.setAttribute("name", "Cartouche");
    nvSpPr.appendChild(cNvPr);
    nvSpPr.appendChild(doc.createElementNS(NS.p, "p:cNvSpPr"));
    nvSpPr.appendChild(doc.createElementNS(NS.p, "p:nvPr"));
    sp.appendChild(nvSpPr);

    const spPr = doc.createElementNS(NS.p, "p:spPr");
    const xfrm = doc.createElementNS(NS.a, "a:xfrm");
    const off = doc.createElementNS(NS.a, "a:off");
    off.setAttribute("x", String(Math.round(x)));
    off.setAttribute("y", String(Math.round(y)));
    const ext = doc.createElementNS(NS.a, "a:ext");
    ext.setAttribute("cx", String(Math.round(cx)));
    ext.setAttribute("cy", String(Math.round(cy)));
    xfrm.appendChild(off);
    xfrm.appendChild(ext);
    spPr.appendChild(xfrm);
    const prstGeom = doc.createElementNS(NS.a, "a:prstGeom");
    prstGeom.setAttribute("prst", "roundRect");
    const avLst = doc.createElementNS(NS.a, "a:avLst");
    const gd = doc.createElementNS(NS.a, "a:gd");
    gd.setAttribute("name", "adj");
    gd.setAttribute("fmla", "val 4000");
    avLst.appendChild(gd);
    prstGeom.appendChild(avLst);
    spPr.appendChild(prstGeom);
    const fill = doc.createElementNS(NS.a, "a:solidFill");
    const fillClr = doc.createElementNS(NS.a, "a:srgbClr");
    fillClr.setAttribute("val", "E0F2FE");
    fill.appendChild(fillClr);
    spPr.appendChild(fill);
    const ln = doc.createElementNS(NS.a, "a:ln");
    const lnNoFill = doc.createElementNS(NS.a, "a:noFill");
    ln.appendChild(lnNoFill);
    spPr.appendChild(ln);
    sp.appendChild(spPr);

    const txBody = doc.createElementNS(NS.p, "p:txBody");
    const bodyPr = doc.createElementNS(NS.a, "a:bodyPr");
    bodyPr.setAttribute("lIns", String(CARD_PAD_L));
    bodyPr.setAttribute("tIns", String(CARD_PAD_T));
    bodyPr.setAttribute("rIns", String(CARD_PAD_R));
    bodyPr.setAttribute("bIns", String(CARD_PAD_B));
    bodyPr.setAttribute("anchor", "ctr");
    // Safety net for whatever estimateCardHeight() still gets wrong (or a
    // card whose height got clamped to the space left in its column): let
    // PowerPoint shrink the text to fit rather than spilling it outside the
    // cartouche. Same technique the gabarit template itself already uses
    // on the section-divider title.
    bodyPr.appendChild(doc.createElementNS(NS.a, "a:normAutofit"));
    txBody.appendChild(bodyPr);
    txBody.appendChild(doc.createElementNS(NS.a, "a:lstStyle"));
    const lnSpcPct = sizes.lnSpcPct || 100000;
    if (heading) {
      txBody.appendChild(
        buildBulletParagraph(doc, heading, { bold: true, size: sizes.heading, color: "1F1F1F", bullet: false, lnSpcPct })
      );
    }
    if (body) {
      txBody.appendChild(
        buildBulletParagraph(doc, body, { bold: false, size: sizes.body, color: "1F1F1F", bullet: false, lnSpcPct })
      );
    }
    sp.appendChild(txBody);
    return sp;
  }

  function buildPlainTextBox(doc, { x, y, cx, cy, text, fontPt, lnSpcPct = 100000 }) {
    const sp = doc.createElementNS(NS.p, "p:sp");
    const nvSpPr = doc.createElementNS(NS.p, "p:nvSpPr");
    const cNvPr = doc.createElementNS(NS.p, "p:cNvPr");
    cNvPr.setAttribute("id", freshShapeId());
    cNvPr.setAttribute("name", "Texte");
    nvSpPr.appendChild(cNvPr);
    const cNvSpPr = doc.createElementNS(NS.p, "p:cNvSpPr");
    cNvSpPr.setAttribute("txBox", "1");
    nvSpPr.appendChild(cNvSpPr);
    nvSpPr.appendChild(doc.createElementNS(NS.p, "p:nvPr"));
    sp.appendChild(nvSpPr);

    const spPr = doc.createElementNS(NS.p, "p:spPr");
    const xfrm = doc.createElementNS(NS.a, "a:xfrm");
    const off = doc.createElementNS(NS.a, "a:off");
    off.setAttribute("x", String(Math.round(x)));
    off.setAttribute("y", String(Math.round(y)));
    const ext = doc.createElementNS(NS.a, "a:ext");
    ext.setAttribute("cx", String(Math.round(cx)));
    ext.setAttribute("cy", String(Math.round(cy)));
    xfrm.appendChild(off);
    xfrm.appendChild(ext);
    spPr.appendChild(xfrm);
    const prstGeom = doc.createElementNS(NS.a, "a:prstGeom");
    prstGeom.setAttribute("prst", "rect");
    prstGeom.appendChild(doc.createElementNS(NS.a, "a:avLst"));
    spPr.appendChild(prstGeom);
    const noFill = doc.createElementNS(NS.a, "a:noFill");
    spPr.appendChild(noFill);
    sp.appendChild(spPr);

    const txBody = doc.createElementNS(NS.p, "p:txBody");
    const bodyPr = doc.createElementNS(NS.a, "a:bodyPr");
    bodyPr.setAttribute("wrap", "square");
    bodyPr.setAttribute("lIns", "0");
    bodyPr.setAttribute("tIns", "0");
    bodyPr.setAttribute("rIns", "0");
    bodyPr.setAttribute("bIns", "0");
    bodyPr.appendChild(doc.createElementNS(NS.a, "a:normAutofit"));
    txBody.appendChild(bodyPr);
    txBody.appendChild(doc.createElementNS(NS.a, "a:lstStyle"));
    txBody.appendChild(
      buildBulletParagraph(doc, text, { bold: false, size: fontPt, color: "1F1F1F", bullet: false, lnSpcPct })
    );
    sp.appendChild(txBody);
    return sp;
  }

  function buildPicture(doc, { x, y, cx, cy, rId }) {
    const pic = doc.createElementNS(NS.p, "p:pic");
    const nvPicPr = doc.createElementNS(NS.p, "p:nvPicPr");
    const cNvPr = doc.createElementNS(NS.p, "p:cNvPr");
    cNvPr.setAttribute("id", freshShapeId());
    cNvPr.setAttribute("name", "Illustration");
    nvPicPr.appendChild(cNvPr);
    const cNvPicPr = doc.createElementNS(NS.p, "p:cNvPicPr");
    const locks = doc.createElementNS(NS.a, "a:picLocks");
    locks.setAttribute("noChangeAspect", "1");
    cNvPicPr.appendChild(locks);
    nvPicPr.appendChild(cNvPicPr);
    nvPicPr.appendChild(doc.createElementNS(NS.p, "p:nvPr"));
    pic.appendChild(nvPicPr);

    const blipFill = doc.createElementNS(NS.p, "p:blipFill");
    const blip = doc.createElementNS(NS.a, "a:blip");
    blip.setAttributeNS(NS.r, "r:embed", rId);
    blipFill.appendChild(blip);
    blipFill.appendChild(doc.createElementNS(NS.a, "a:stretch")).appendChild(doc.createElementNS(NS.a, "a:fillRect"));
    pic.appendChild(blipFill);

    const spPr = doc.createElementNS(NS.p, "p:spPr");
    const xfrm = doc.createElementNS(NS.a, "a:xfrm");
    const off = doc.createElementNS(NS.a, "a:off");
    off.setAttribute("x", String(Math.round(x)));
    off.setAttribute("y", String(Math.round(y)));
    const ext = doc.createElementNS(NS.a, "a:ext");
    ext.setAttribute("cx", String(Math.round(cx)));
    ext.setAttribute("cy", String(Math.round(cy)));
    xfrm.appendChild(off);
    xfrm.appendChild(ext);
    spPr.appendChild(xfrm);
    const prstGeom = doc.createElementNS(NS.a, "a:prstGeom");
    prstGeom.setAttribute("prst", "rect");
    prstGeom.appendChild(doc.createElementNS(NS.a, "a:avLst"));
    spPr.appendChild(prstGeom);
    pic.appendChild(spPr);
    return pic;
  }

  /* Dashed, unfilled placeholder drawn in the illustration slot when the
     layout reserved room for an image but no automatic match (library or
     ambiance) was found for this slide — confirmed as a real-world need
     from production: a deck with no library coverage at all rendered with
     zero indication of where a presenter could manually drop a picture in
     PowerPoint afterwards. Deliberately subtle (dashed outline, muted
     label, no fill) so it reads as an intentional "add your own image
     here" spot rather than a broken/empty box. */
  function buildImagePlaceholder(doc, { x, y, cx, cy }) {
    const sp = doc.createElementNS(NS.p, "p:sp");
    const nvSpPr = doc.createElementNS(NS.p, "p:nvSpPr");
    const cNvPr = doc.createElementNS(NS.p, "p:cNvPr");
    cNvPr.setAttribute("id", freshShapeId());
    cNvPr.setAttribute("name", "Emplacement illustration");
    nvSpPr.appendChild(cNvPr);
    nvSpPr.appendChild(doc.createElementNS(NS.p, "p:cNvSpPr"));
    nvSpPr.appendChild(doc.createElementNS(NS.p, "p:nvPr"));
    sp.appendChild(nvSpPr);

    const spPr = doc.createElementNS(NS.p, "p:spPr");
    const xfrm = doc.createElementNS(NS.a, "a:xfrm");
    const off = doc.createElementNS(NS.a, "a:off");
    off.setAttribute("x", String(Math.round(x)));
    off.setAttribute("y", String(Math.round(y)));
    const ext = doc.createElementNS(NS.a, "a:ext");
    ext.setAttribute("cx", String(Math.round(cx)));
    ext.setAttribute("cy", String(Math.round(cy)));
    xfrm.appendChild(off);
    xfrm.appendChild(ext);
    spPr.appendChild(xfrm);
    const prstGeom = doc.createElementNS(NS.a, "a:prstGeom");
    prstGeom.setAttribute("prst", "roundRect");
    const avLst = doc.createElementNS(NS.a, "a:avLst");
    const gd = doc.createElementNS(NS.a, "a:gd");
    gd.setAttribute("name", "adj");
    gd.setAttribute("fmla", "val 4000");
    avLst.appendChild(gd);
    prstGeom.appendChild(avLst);
    spPr.appendChild(prstGeom);
    spPr.appendChild(doc.createElementNS(NS.a, "a:noFill"));
    const ln = doc.createElementNS(NS.a, "a:ln");
    ln.setAttribute("w", "12700");
    const lnFill = doc.createElementNS(NS.a, "a:solidFill");
    const lnClr = doc.createElementNS(NS.a, "a:srgbClr");
    lnClr.setAttribute("val", "B7C2CB");
    lnFill.appendChild(lnClr);
    ln.appendChild(lnFill);
    const dash = doc.createElementNS(NS.a, "a:prstDash");
    dash.setAttribute("val", "dash");
    ln.appendChild(dash);
    spPr.appendChild(ln);
    sp.appendChild(spPr);

    const txBody = doc.createElementNS(NS.p, "p:txBody");
    const bodyPr = doc.createElementNS(NS.a, "a:bodyPr");
    bodyPr.setAttribute("anchor", "ctr");
    bodyPr.setAttribute("wrap", "square");
    bodyPr.setAttribute("lIns", "91440");
    bodyPr.setAttribute("rIns", "91440");
    txBody.appendChild(bodyPr);
    txBody.appendChild(doc.createElementNS(NS.a, "a:lstStyle"));
    const p = buildBulletParagraph(doc, "Illustration à ajouter", {
      bold: false,
      size: 1100,
      color: "8A97A0",
      bullet: false,
    });
    firstTag(p, NS.a, "pPr").setAttribute("algn", "ctr");
    txBody.appendChild(p);
    sp.appendChild(txBody);
    return sp;
  }

  const CONTENT_X = 685800,
    CONTENT_Y = 1650000,
    CONTENT_CX = 10820400,
    CONTENT_BOTTOM = 6100000;
  const IMAGE_CX = 3600000,
    COL_GAP = 300000;

  /* Progressively smaller font tiers, tried in order until the estimated
     total card height (across however many columns) fits the space left
     below the intro/plain items. A real deck's cards can carry far more
     text than the old fixed "items.length >= 4 ? small : big" split
     anticipated — confirmed in production (cards spilling past the bottom
     of the slide) — so this tries harder before falling back to the
     smallest tier and letting each card's own normAutofit take over. */
  /* Below the first two tiers, also tighten line spacing (spcPct) and the
     gap left between cards — a real deck can pack more heading/body pairs
     onto one slide than a comfortably-spaced layout has room for, and
     shrinking the font alone hits diminishing returns fast. Confirmed in
     production: a 5-card slide (plus 5 plain lines above it) still
     overflowed at the old fixed {1200,1000} floor. */
  const CARD_SIZE_TIERS = [
    { heading: 1500, body: 1300, lnSpcPct: 100000, gap: 182880 },
    { heading: 1400, body: 1200, lnSpcPct: 100000, gap: 182880 },
    { heading: 1300, body: 1100, lnSpcPct: 95000, gap: 137160 },
    { heading: 1200, body: 1000, lnSpcPct: 92000, gap: 137160 },
    { heading: 1100, body: 950, lnSpcPct: 88000, gap: 91440 },
    { heading: 1000, body: 900, lnSpcPct: 85000, gap: 91440 },
  ];

  function pickCardSizes(cardItems, colWidth, availableHeight, twoCols) {
    if (!cardItems.length) return { sizes: CARD_SIZE_TIERS[0], fits: true };
    for (const sizes of CARD_SIZE_TIERS) {
      const total = cardItems.reduce((sum, it) => sum + estimateCardHeight(it, colWidth, sizes) + sizes.gap, 0);
      const neededPerCol = twoCols ? total / 2 : total;
      if (neededPerCol <= availableHeight) return { sizes, fits: true };
    }
    return { sizes: CARD_SIZE_TIERS[CARD_SIZE_TIERS.length - 1], fits: false };
  }

  /* Title + intro + heading/body items rendered as bordered cards (plus an
     optional side illustration), replacing the gabarit's plain content
     placeholder — which this function deletes from the cloned slide7.
     `hasImage` here means "a real image is available to place" — the slot
     itself is attempted regardless (see below), so a presenter always has
     a predictable spot to drop in their own picture later even when no
     automatic match was found.
     Returns { imageSlot, hasImage }: both can come back false/null even
     when a real image was passed in — see below. */
  function fillCardLayout(doc, { title, intro, items, missingTitle, hasImage: hasRealImage }) {
    setTitle(doc, title, { missing: missingTitle, fieldLabel: "titre de la diapositive" });

    const placeholder = findShapeByPhIdx(doc, 1, { noType: true });
    if (placeholder) placeholder.parentNode.removeChild(placeholder);

    const spTree = firstTag(doc, NS.p, "spTree");
    const cardItems = items.filter((it) => it.heading);
    const plainItems = items.filter((it) => !it.heading);

    // A side illustration forces a single text column, roughly doubling
    // the vertical space each card needs versus a 2-column grid. Confirmed
    // in production: a 6-card slide with an image genuinely didn't fit at
    // any font/spacing tier in single column, while the same cards fit
    // comfortably 2-up once the image was dropped. Try both layouts (when
    // there are enough cards for 2 columns to matter) and only keep the
    // image if its layout actually fits — legible content beats a
    // decorative illustration.
    let provisionalIntroY = CONTENT_Y;
    if (intro) provisionalIntroY += estimatePlainHeight(intro, CONTENT_CX, 1400) + 137160;

    function evaluate(useImage) {
      const textZoneCx = useImage ? CONTENT_CX - IMAGE_CX - COL_GAP : CONTENT_CX;
      const twoCols = !useImage && cardItems.length >= 3;
      const colWidth = twoCols ? (textZoneCx - COL_GAP) / 2 : textZoneCx;
      let provisionalY = provisionalIntroY;
      for (const it of plainItems) provisionalY += estimatePlainHeight(it.body, textZoneCx, 1300) + 91440;
      const { sizes, fits } = pickCardSizes(cardItems, colWidth, CONTENT_BOTTOM - provisionalY, twoCols);
      return { useImage, textZoneCx, twoCols, colWidth, sizes, fits };
    }

    // Reserve the illustration slot whenever the layout can fit it — even
    // with no real image yet — so there's always a predictable manual
    // insertion point. Confirmed missing in production: a deck with zero
    // library/ambiance matches rendered every card slide full-width, with
    // literally nowhere set aside for the presenter to add a picture
    // afterwards. Scoped to slides that actually have cards: pickCardSizes()
    // has no "does this overflow" check at all when there are zero cards
    // (its early return just assumes plain text fits), so attempting the
    // narrower with-image column on a plain-text-only slide with no real
    // image would risk pushing text past the bottom with no safety net —
    // unlike the card case just below, which always re-checks fit. A
    // plain-only slide with an actual real image is unaffected: that already
    // requested the slot before this change.
    const attemptSlot = cardItems.length > 0 || hasRealImage;
    let layout = evaluate(attemptSlot);
    if (attemptSlot && !layout.fits && cardItems.length >= 3) {
      const withoutImage = evaluate(false);
      if (withoutImage.fits) layout = withoutImage;
    }
    const { textZoneCx, twoCols, colWidth, sizes } = layout;
    const reserved = layout.useImage;
    const hasImage = reserved && !!hasRealImage;

    let y = CONTENT_Y;
    if (intro) {
      const h = estimatePlainHeight(intro, textZoneCx, 1400);
      spTree.appendChild(buildPlainTextBox(doc, { x: CONTENT_X, y, cx: textZoneCx, cy: h, text: intro, fontPt: 1400 }));
      y += h + 137160;
    }
    for (const it of plainItems) {
      const h = estimatePlainHeight(it.body, textZoneCx, sizes.body, sizes.lnSpcPct);
      spTree.appendChild(
        buildPlainTextBox(doc, {
          x: CONTENT_X,
          y,
          cx: textZoneCx,
          cy: h,
          text: it.body,
          fontPt: sizes.body,
          lnSpcPct: sizes.lnSpcPct,
        })
      );
      y += h + 91440;
    }

    // Real decks can carry more cartouches (or longer plain items pushing
    // the starting y down) than this fixed-height layout was designed for.
    // CONTENT_BOTTOM - colY[col] goes negative once a column's already-
    // stacked content passes the bottom bound — confirmed in production: a
    // <a:ext cy="-169878"/> is invalid OOXML that PowerPoint silently
    // strips ("some content could not be read and was removed") rather
    // than rendering. Floor it to a small positive height instead: the
    // card still overflows visually in that rare case, but the file stays
    // valid — a visible layout issue beats a corrupted deliverable.
    const MIN_CARD_HEIGHT = 300000;
    const colX = [CONTENT_X, CONTENT_X + colWidth + COL_GAP];
    const colY = [y, y];
    cardItems.forEach((it, idx) => {
      const col = twoCols ? idx % 2 : 0;
      const h = Math.max(Math.min(estimateCardHeight(it, colWidth, sizes), CONTENT_BOTTOM - colY[col]), MIN_CARD_HEIGHT);
      spTree.appendChild(
        buildCard(doc, { x: colX[col], y: colY[col], cx: colWidth, cy: h, heading: it.heading, body: it.body, sizes })
      );
      colY[col] += h + sizes.gap;
    });

    return {
      hasImage,
      imageSlot: reserved
        ? { x: CONTENT_X + textZoneCx + COL_GAP, y: CONTENT_Y, cx: IMAGE_CX, cy: CONTENT_BOTTOM - CONTENT_Y }
        : null,
    };
  }

  /* Native <a:tbl> table, sized to roughly match the 1-col content zone,
     inserted as a graphicFrame alongside the title on a slide7-style clone.
     An optional intro paragraph is placed above the table as a plain text
     box (the slide's own content placeholder is dropped, as with cards). */
  function insertTable(doc, { title, intro, headerRow, rows, missingTitle }) {
    setTitle(doc, title, { missing: missingTitle, fieldLabel: "titre de la diapositive" });

    const placeholder = findShapeByPhIdx(doc, 1, { noType: true });
    if (placeholder) placeholder.parentNode.removeChild(placeholder);

    const spTree = firstTag(doc, NS.p, "spTree");
    if (intro) {
      spTree.appendChild(
        buildPlainTextBox(doc, { x: 685800, y: 1650000, cx: 10820400, cy: 700000, text: intro, fontPt: 1400 })
      );
    }
    const nCols = headerRow.length;
    const x = 685800,
      y = intro ? 2450000 : 1650000,
      cx = 10820400,
      cy = intro ? 4000600 : 4800600;
    const colWidth = Math.floor(cx / nCols);
    const rowHeight = Math.floor(cy / (rows.length + 1));

    const gf = doc.createElementNS(NS.p, "p:graphicFrame");
    const nv = doc.createElementNS(NS.p, "p:nvGraphicFramePr");
    const cNvPr = doc.createElementNS(NS.p, "p:cNvPr");
    cNvPr.setAttribute("id", freshShapeId());
    cNvPr.setAttribute("name", "Tableau");
    nv.appendChild(cNvPr);
    const cNvGf = doc.createElementNS(NS.p, "p:cNvGraphicFramePr");
    const locks = doc.createElementNS(NS.a, "a:graphicFrameLocks");
    locks.setAttribute("noGrp", "1");
    cNvGf.appendChild(locks);
    nv.appendChild(cNvGf);
    nv.appendChild(doc.createElementNS(NS.p, "p:nvPr"));
    gf.appendChild(nv);

    const xfrm = doc.createElementNS(NS.p, "p:xfrm");
    const off = doc.createElementNS(NS.a, "a:off");
    off.setAttribute("x", String(x));
    off.setAttribute("y", String(y));
    const ext = doc.createElementNS(NS.a, "a:ext");
    ext.setAttribute("cx", String(cx));
    ext.setAttribute("cy", String(cy));
    xfrm.appendChild(off);
    xfrm.appendChild(ext);
    gf.appendChild(xfrm);

    const graphic = doc.createElementNS(NS.a, "a:graphic");
    const graphicData = doc.createElementNS(NS.a, "a:graphicData");
    graphicData.setAttribute("uri", "http://schemas.openxmlformats.org/drawingml/2006/table");
    const tbl = doc.createElementNS(NS.a, "a:tbl");
    const tblPr = doc.createElementNS(NS.a, "a:tblPr");
    tblPr.setAttribute("firstRow", "1");
    tblPr.setAttribute("bandRow", "1");
    const styleId = doc.createElementNS(NS.a, "a:tableStyleId");
    styleId.textContent = "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}";
    tblPr.appendChild(styleId);
    tbl.appendChild(tblPr);

    const grid = doc.createElementNS(NS.a, "a:tblGrid");
    for (let c = 0; c < nCols; c++) {
      const gridCol = doc.createElementNS(NS.a, "a:gridCol");
      gridCol.setAttribute("w", String(colWidth));
      grid.appendChild(gridCol);
    }
    tbl.appendChild(grid);

    function buildCell(text, { header = false } = {}) {
      const tc = doc.createElementNS(NS.a, "a:tc");
      const txBody = doc.createElementNS(NS.a, "a:txBody");
      txBody.appendChild(doc.createElementNS(NS.a, "a:bodyPr"));
      txBody.appendChild(doc.createElementNS(NS.a, "a:lstStyle"));
      const p = doc.createElementNS(NS.a, "a:p");
      const pPr = doc.createElementNS(NS.a, "a:pPr");
      pPr.setAttribute("algn", header ? "ctr" : "l");
      p.appendChild(pPr);
      p.appendChild(
        buildRunEl(doc, text, {
          bold: header,
          size: header ? 1400 : 1300,
          color: header ? "FFFFFF" : "1F1F1F",
        })
      );
      txBody.appendChild(p);
      tc.appendChild(txBody);
      const tcPr = doc.createElementNS(NS.a, "a:tcPr");
      tcPr.setAttribute("anchor", "ctr");
      if (header) {
        const fill = doc.createElementNS(NS.a, "a:solidFill");
        const clr = doc.createElementNS(NS.a, "a:srgbClr");
        clr.setAttribute("val", "4389BD");
        fill.appendChild(clr);
        tcPr.appendChild(fill);
      }
      tc.appendChild(tcPr);
      return tc;
    }

    function buildRow(cells, opts) {
      const tr = doc.createElementNS(NS.a, "a:tr");
      tr.setAttribute("h", String(rowHeight));
      for (const cellText of cells) tr.appendChild(buildCell(cellText, opts));
      return tr;
    }

    tbl.appendChild(buildRow(headerRow, { header: true }));
    for (const row of rows) tbl.appendChild(buildRow(row, {}));

    graphicData.appendChild(tbl);
    graphic.appendChild(graphicData);
    gf.appendChild(graphic);
    spTree.appendChild(gf);
  }

  /* Recompute a text box's stored height from its actual paragraphs (each
     paragraph's own run size, spacer paragraphs counted as one blank line)
     so viewers that don't honor <a:spAutoFit/> (only real PowerPoint does,
     reliably) don't render a box that's shorter than its text. */
  function recomputeTextBoxHeight(shape, widthEmu) {
    const txBody = firstTag(shape, NS.p, "txBody");
    let total = 91440; // top+bottom inset default
    for (const p of tag(txBody, NS.a, "p")) {
      const runs = runsOf(p);
      const rPr = runs.length ? firstTag(runs[0], NS.a, "rPr") : null;
      const sz = rPr && rPr.getAttribute("sz") ? parseInt(rPr.getAttribute("sz"), 10) : 1800;
      const text = textOf(p);
      total += text ? estimateTextHeightEmu(text, widthEmu, sz) : Math.round((sz / 100 / 72) * 1.22 * 914400);
    }
    return total;
  }

  /* Avant-dernière page ("Pour aller plus loin"): the "Sur la thématique :"
     block between the heading and "Pour être accompagné..." now tracks
     however many suggestions actually apply, instead of always forcing
     exactly the 4 "Lien" placeholders the gabarit ships with — confirmed
     as a real complaint: a theme with only 1-2 genuinely relevant
     resources was padding the rest with red "⚠ CONTENU MANQUANT" alerts,
     which reads as content the user forgot to fill in rather than what it
     actually is (nothing more relevant to suggest). Extra "Lien"
     paragraphs (clones of the template one, same formatting) are added
     when there are more than 4; unused ones are removed when there are
     fewer, including the heading itself + its spacer when there are none
     at all. The "Pour être accompagné..." block is always left untouched
     (fixed per user decision). The gabarit ships this box at cx=7427456
     (~8.1in), sized for short "Lien" placeholders — our suggestion labels
     ("Titre — url") are much longer, so it's widened toward the full
     content width and its stored height recomputed before filling, to
     avoid text overflowing past the slide's bottom edge in viewers that
     don't honor spAutoFit. */
  function setLiensSuggestions(doc, suggestions) {
    const shape = findShapeByName(doc, "ZoneTexte 9");
    if (!shape) throw new Error("Liens text box (ZoneTexte 9) not found");
    const xfrm = firstTag(shape, NS.p, "spPr").getElementsByTagNameNS(NS.a, "xfrm")[0];
    const newWidth = 10450000;
    firstTag(xfrm, NS.a, "ext").setAttribute("cx", String(newWidth));
    const txBody = firstTag(shape, NS.p, "txBody");
    const allP = tag(txBody, NS.a, "p");

    let headingPara = null;
    let spacerPara = null;
    let anchorPara = null; // "Pour être accompagné..." — new "Lien" paras are inserted before it
    const lienParas = [];
    let inBlock = false;
    for (const p of allP) {
      const txt = textOf(p).trim();
      if (txt === "Sur la thématique :") {
        headingPara = p;
        inBlock = true;
        continue;
      }
      if (inBlock && !spacerPara && txt === "") {
        spacerPara = p;
        continue;
      }
      if (txt.startsWith("Pour être accompagné")) {
        inBlock = false;
        anchorPara = p;
        continue;
      }
      if (inBlock && txt === "Lien") lienParas.push(p);
    }

    while (lienParas.length > suggestions.length) {
      const p = lienParas.pop();
      p.parentNode.removeChild(p);
    }
    while (lienParas.length < suggestions.length && lienParas.length) {
      const clone = lienParas[lienParas.length - 1].cloneNode(true);
      txBody.insertBefore(clone, anchorPara);
      lienParas.push(clone);
    }
    if (!suggestions.length && headingPara) {
      headingPara.parentNode.removeChild(headingPara);
      if (spacerPara) spacerPara.parentNode.removeChild(spacerPara);
    }

    lienParas.forEach((p, i) => {
      const label = suggestions[i].url ? `${suggestions[i].title} — ${suggestions[i].url}` : suggestions[i].title;
      setParagraphText(p, label);
      // The gabarit's "Lien" placeholder is sz2000 (20pt); our labels
      // carry a title + URL and are much longer, so shrink just these
      // generated lines to keep the box from needing extra wrapped lines.
      const rPr = firstTag(runsOf(p)[0], NS.a, "rPr");
      if (rPr) rPr.setAttribute("sz", "1400");
    });

    const innerWidth = newWidth - 182880; // default 91440 lIns/rIns
    const boxTop = parseInt(firstTag(xfrm, NS.a, "off").getAttribute("y"), 10);
    const maxCy = 6858000 - boxTop; // never let the stored box claim past the slide edge
    // Same defensive floor as fillCardLayout's card heights: a non-positive
    // cy is invalid OOXML PowerPoint will strip on open.
    const computedCy = Math.max(Math.min(recomputeTextBoxHeight(shape, innerWidth), maxCy), 300000);
    firstTag(xfrm, NS.a, "ext").setAttribute("cy", String(computedCy));
  }

  global.PG_GABARIT = {
    findShapeByName,
    findShapeByPhType,
    findShapeByPhIdx,
    paragraphs,
    textOf,
    setParagraphText,
    markRunRed,
    alertText,
    setTitle,
    setEyebrow,
    setSommaireItems,
    setDividerTitle,
    fillCardLayout,
    buildPicture,
    buildImagePlaceholder,
    insertTable,
    setLiensSuggestions,
    CONTENT_X,
    CONTENT_Y,
    CONTENT_CX,
    CONTENT_BOTTOM,
  };
})(window);
