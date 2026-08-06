/* Low-level .pptx package helpers: zip access, XML parse/serialize, part
   cloning, relationship/content-type bookkeeping, and orphan-part pruning.
   No knowledge of the Département gabarit lives here — see gabarit.js. */
(function (global) {
  "use strict";

  const NS = {
    a: "http://schemas.openxmlformats.org/drawingml/2006/main",
    p: "http://schemas.openxmlformats.org/presentationml/2006/main",
    r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    ct: "http://schemas.openxmlformats.org/package/2006/content-types",
    rel: "http://schemas.openxmlformats.org/package/2006/relationships",
  };

  const SLIDE_CONTENT_TYPE =
    "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
  const SLIDE_REL_TYPE =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";

  const IMAGE_CONTENT_TYPES = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    tiff: "image/tiff",
    emf: "image/x-emf",
    wmf: "image/x-wmf",
    svg: "image/svg+xml",
  };

  function tag(root, ns, local) {
    return Array.from(root.getElementsByTagNameNS(ns, local));
  }

  function firstTag(root, ns, local) {
    return root.getElementsByTagNameNS(ns, local)[0] || null;
  }

  function dirname(path) {
    const i = path.lastIndexOf("/");
    return i === -1 ? "" : path.slice(0, i);
  }

  function joinPath(baseDir, target) {
    if (target.startsWith("/")) return target.slice(1);
    const parts = (baseDir ? baseDir.split("/") : []).concat(target.split("/"));
    const out = [];
    for (const part of parts) {
      if (part === "" || part === ".") continue;
      if (part === "..") out.pop();
      else out.push(part);
    }
    return out.join("/");
  }

  function relsPathFor(partPath) {
    const dir = dirname(partPath);
    const base = partPath.slice(dir.length + (dir ? 1 : 0));
    return (dir ? dir + "/" : "") + "_rels/" + base + ".rels";
  }

  class PptxPackage {
    constructor(zip) {
      this.zip = zip;
      this._parser = new DOMParser();
      this._serializer = new XMLSerializer();
    }

    static async fromArrayBuffer(buf) {
      const zip = await JSZip.loadAsync(buf);
      return new PptxPackage(zip);
    }

    has(path) {
      return this.zip.file(path) != null;
    }

    listFiles() {
      const out = [];
      this.zip.forEach((path, entry) => {
        if (!entry.dir) out.push(path);
      });
      return out;
    }

    async text(path) {
      const f = this.zip.file(path);
      if (!f) throw new Error(`Missing part: ${path}`);
      return f.async("string");
    }

    async bytes(path) {
      const f = this.zip.file(path);
      if (!f) throw new Error(`Missing part: ${path}`);
      return f.async("uint8array");
    }

    setText(path, str) {
      this.zip.file(path, str);
    }

    setBytes(path, bytes) {
      this.zip.file(path, bytes);
    }

    remove(path) {
      this.zip.remove(path);
    }

    parseXml(str) {
      const doc = this._parser.parseFromString(str, "application/xml");
      const err = doc.getElementsByTagName("parsererror")[0];
      if (err) throw new Error("XML parse error: " + err.textContent.slice(0, 200));
      return doc;
    }

    serializeXml(doc) {
      return this._serializer.serializeToString(doc);
    }

    async readXml(path) {
      return this.parseXml(await this.text(path));
    }

    writeXml(path, doc) {
      this.setText(path, this.serializeXml(doc));
    }

    async toBlob() {
      return this.zip.generateAsync({
        type: "blob",
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        compression: "DEFLATE",
      });
    }

    /* Remove every part unreachable from the package root via relationship
       chains (mirrors what the pptx skill's clean.py does for slides). Run
       once, after the final <p:sldIdLst> is written. */
    async pruneUnreferenced() {
      const visited = new Set();
      const queue = [""]; // "" = package root, rels at _rels/.rels
      const alwaysKeep = new Set(["[Content_Types].xml"]);

      while (queue.length) {
        const partPath = queue.shift();
        if (visited.has(partPath) && partPath !== "") continue;
        if (partPath !== "") visited.add(partPath);

        const relsPath = partPath === "" ? "_rels/.rels" : relsPathFor(partPath);
        if (!this.has(relsPath)) continue;
        const relsDoc = await this.readXml(relsPath);
        const baseDir = partPath === "" ? "" : dirname(partPath);
        for (const rel of tag(relsDoc, NS.rel, "Relationship")) {
          const target = rel.getAttribute("Target");
          const mode = rel.getAttribute("TargetMode");
          if (mode === "External") continue;
          const resolved = joinPath(baseDir, target);
          if (!visited.has(resolved)) queue.push(resolved);
        }
      }

      const contentTypesDoc = await this.readXml("[Content_Types].xml");
      let ctChanged = false;
      for (const override of tag(contentTypesDoc, NS.ct, "Override")) {
        const partName = override.getAttribute("PartName").replace(/^\//, "");
        if (!visited.has(partName) && !alwaysKeep.has(partName)) {
          override.parentNode.removeChild(override);
          ctChanged = true;
        }
      }
      if (ctChanged) this.writeXml("[Content_Types].xml", contentTypesDoc);

      for (const path of this.listFiles()) {
        if (path === "[Content_Types].xml") continue;
        if (path.endsWith(".rels")) continue; // dropped alongside their owning part below
        if (!visited.has(path)) this.remove(path);
      }
      // second pass: drop now-orphaned .rels files (owning part gone)
      for (const path of this.listFiles()) {
        if (!path.endsWith(".rels")) continue;
        const dir = dirname(path); // e.g. ppt/slides/_rels
        const owningDir = dirname(dir); // e.g. ppt/slides
        const base = path.slice(dir.length + 1, -".rels".length);
        const owningPath = (owningDir ? owningDir + "/" : "") + base;
        if (path === "_rels/.rels") continue;
        if (!this.has(owningPath)) this.remove(path);
      }
    }
  }

  /* Coordinates package-level bookkeeping (Content_Types, presentation.xml,
     presentation.xml.rels) needed to clone slides and rebuild the deck's
     slide order. */
  class DeckBuilder {
    constructor(pkg) {
      this.pkg = pkg;
      this._nextSlideNum = null;
      this._nextRelId = 900;
    }

    async init() {
      this.presentationDoc = await this.pkg.readXml("ppt/presentation.xml");
      this.presRelsDoc = await this.pkg.readXml("ppt/_rels/presentation.xml.rels");
      this.contentTypesDoc = await this.pkg.readXml("[Content_Types].xml");
      this._nextSlideNum = this._computeNextSlideNum();
      this._nextMediaNum = this._computeNextMediaNum();
      this._usedRelIds = new Set(
        tag(this.presRelsDoc, NS.rel, "Relationship").map((r) => r.getAttribute("Id"))
      );
      this._knownExtensions = new Set(
        tag(this.contentTypesDoc, NS.ct, "Default").map((d) => d.getAttribute("Extension").toLowerCase())
      );
    }

    _computeNextMediaNum() {
      let max = 0;
      for (const f of this.pkg.listFiles()) {
        const m = f.match(/^ppt\/media\/image(\d+)\.\w+$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      }
      return max + 1;
    }

    _computeNextSlideNum() {
      let max = 0;
      for (const f of this.pkg.listFiles()) {
        const m = f.match(/^ppt\/slides\/slide(\d+)\.xml$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      }
      return max + 1;
    }

    _freshRelId() {
      let id;
      do {
        id = `rId${this._nextRelId++}`;
      } while (this._usedRelIds.has(id));
      this._usedRelIds.add(id);
      return id;
    }

    _addContentTypeOverride(partName, contentType) {
      const el = this.contentTypesDoc.createElementNS(NS.ct, "Override");
      el.setAttribute("PartName", partName);
      el.setAttribute("ContentType", contentType);
      this.contentTypesDoc.documentElement.appendChild(el);
    }

    _addPresentationRel(target, type) {
      const relId = this._freshRelId();
      const el = this.presRelsDoc.createElementNS(NS.rel, "Relationship");
      el.setAttribute("Id", relId);
      el.setAttribute("Type", type);
      el.setAttribute("Target", target);
      this.presRelsDoc.documentElement.appendChild(el);
      return relId;
    }

    /* Clone ppt/slides/slideN.xml (+ its media/layout rels) into a brand new
       slide part. The notesSlide relationship is dropped (generated content
       gets no speaker notes). Returns {num, relId, path}. */
    async cloneSlide(sourceNum) {
      const newNum = this._nextSlideNum++;
      const xmlText = await this.pkg.text(`ppt/slides/slide${sourceNum}.xml`);
      let relsText = await this.pkg.text(`ppt/slides/_rels/slide${sourceNum}.xml.rels`);
      relsText = relsText.replace(
        /<Relationship[^>]*Type="[^"]*\/notesSlide"[^>]*\/>/,
        ""
      );
      const newPath = `ppt/slides/slide${newNum}.xml`;
      this.pkg.setText(newPath, xmlText);
      this.pkg.setText(`ppt/slides/_rels/slide${newNum}.xml.rels`, relsText);
      this._addContentTypeOverride(`/${newPath}`, SLIDE_CONTENT_TYPE);
      const relId = this._addPresentationRel(`slides/slide${newNum}.xml`, SLIDE_REL_TYPE);
      return { num: newNum, relId, path: newPath };
    }

    /* Write raw image bytes as a new ppt/media part, adding a Content_Types
       Default entry for the extension if this is the first part using it.
       Returns the new part's path (e.g. "ppt/media/image42.jpg"). */
    importMedia(bytes, ext) {
      const cleanExt = ext.toLowerCase().replace(/^\./, "");
      const num = this._nextMediaNum++;
      const path = `ppt/media/image${num}.${cleanExt}`;
      this.pkg.setBytes(path, bytes);
      if (!this._knownExtensions.has(cleanExt)) {
        const el = this.contentTypesDoc.createElementNS(NS.ct, "Default");
        el.setAttribute("Extension", cleanExt);
        el.setAttribute("ContentType", IMAGE_CONTENT_TYPES[cleanExt] || "application/octet-stream");
        this.contentTypesDoc.documentElement.appendChild(el);
        this._knownExtensions.add(cleanExt);
      }
      return path;
    }

    /* Register an image relationship on a specific (already-written) slide
       part and return the new rId for use in that slide's <p:pic>. */
    async addSlideImageRel(slideNum, mediaPartPath) {
      const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
      const relsDoc = await this.pkg.readXml(relsPath);
      const relId = this._freshRelId();
      const el = relsDoc.createElementNS(NS.rel, "Relationship");
      el.setAttribute("Id", relId);
      el.setAttribute(
        "Type",
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
      );
      el.setAttribute("Target", `../media/${mediaPartPath.split("/").pop()}`);
      relsDoc.documentElement.appendChild(el);
      this.pkg.writeXml(relsPath, relsDoc);
      return relId;
    }

    /* Existing (un-cloned) slide part already has a presentation.xml.rels
       entry; look it up by target so callers can reference it uniformly. */
    relIdForExistingSlide(num) {
      const target = `slides/slide${num}.xml`;
      for (const r of tag(this.presRelsDoc, NS.rel, "Relationship")) {
        if (r.getAttribute("Target") === target) return r.getAttribute("Id");
      }
      throw new Error(`No existing relationship for ${target}`);
    }

    async loadSlideDoc(num) {
      return this.pkg.readXml(`ppt/slides/slide${num}.xml`);
    }

    saveSlideDoc(num, doc) {
      this.pkg.writeXml(`ppt/slides/slide${num}.xml`, doc);
    }

    setFinalOrder(relIds) {
      const sldIdLst = firstTag(this.presentationDoc, NS.p, "sldIdLst");
      while (sldIdLst.firstChild) sldIdLst.removeChild(sldIdLst.firstChild);
      let id = 256;
      for (const relId of relIds) {
        const el = this.presentationDoc.createElementNS(NS.p, "p:sldId");
        el.setAttribute("id", String(id++));
        el.setAttributeNS(NS.r, "r:id", relId);
        sldIdLst.appendChild(el);
      }
    }

    async finalize() {
      this.pkg.writeXml("ppt/presentation.xml", this.presentationDoc);
      this.pkg.writeXml("ppt/_rels/presentation.xml.rels", this.presRelsDoc);
      this.pkg.writeXml("[Content_Types].xml", this.contentTypesDoc);
      await this.pkg.pruneUnreferenced();
      return this.pkg.toBlob();
    }
  }

  global.PG_OOXML = { NS, tag, firstTag, PptxPackage, DeckBuilder };
})(window);
