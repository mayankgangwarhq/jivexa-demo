/**
 * PDF Text & CMap Stream Extractor for JIVEXA Medical Reports (Node.js)
 * Supports compressed streams (FlateDecode), multi-page extraction, ToUnicode CMaps, and text normalization.
 */

const { inflate, inflateRaw } = require('pako');

/**
 * Safely decompress FlateDecode stream with pako inflate / inflateRaw
 */
const decompressFlateStream = (slice) => {
  try {
    return inflate(slice);
  } catch (e1) {
    try {
      const raw = slice.length > 2 && slice[0] === 0x78 ? slice.subarray(2) : slice;
      return inflateRaw(raw);
    } catch (e2) {
      return null;
    }
  }
};

/**
 * Text normalization to heal kerning issues from PDF font outputs
 */
const cleanPdfExtractedText = (text) => {
  if (!text) return '';
  let cleaned = text;
  // Fix common laboratory words split by font kerning
  cleaned = cleaned.replace(/\bT\s+est\b/gi, 'Test');
  cleaned = cleaned.replace(/\bT\s+otal\b/gi, 'Total');
  cleaned = cleaned.replace(/\bL\s+ymphocytes?\b/gi, 'Lymphocytes');
  cleaned = cleaned.replace(/\bV\s+olume\b/gi, 'Volume');
  cleaned = cleaned.replace(/\bW\s+idal\b/gi, 'Widal');
  cleaned = cleaned.replace(/\bC\s+orpuscular\b/gi, 'Corpuscular');
  cleaned = cleaned.replace(/\bM\s+ean\b/gi, 'Mean');
  cleaned = cleaned.replace(/\bP\s+latelet\b/gi, 'Platelet');
  cleaned = cleaned.replace(/\bH\s+aemoglobin\b/gi, 'Haemoglobin');
  cleaned = cleaned.replace(/\bH\s+emoglobin\b/gi, 'Hemoglobin');
  cleaned = cleaned.replace(/\bN\s+eutrophils?\b/gi, 'Neutrophils');
  cleaned = cleaned.replace(/\bE\s+osinophils?\b/gi, 'Eosinophils');
  cleaned = cleaned.replace(/\bM\s+onocytes?\b/gi, 'Monocytes');
  cleaned = cleaned.replace(/\bB\s+asophils?\b/gi, 'Basophils');
  cleaned = cleaned.replace(/\bD\s+engue\b/gi, 'Dengue');
  cleaned = cleaned.replace(/\bM\s+alaria\b/gi, 'Malaria');
  cleaned = cleaned.replace(/\bT\s+yphi\b/gi, 'Typhi');

  // Fix spaced numbers like "1 3 . 9" -> "13.9"
  cleaned = cleaned.replace(/(\d)\s+(\.)\s+(\d)/g, '$1$2$3');
  cleaned = cleaned.replace(/(\d)\s+(\d)/g, (match, d1, d2, offset, string) => {
    // Only collapse if surrounded by clinical parameter labels or within numbers
    const surrounding = string.substring(Math.max(0, offset - 15), Math.min(string.length, offset + 20));
    if (/(?:TLC|Platelet|RBC|MCV|MCH|Hb|PCV|WBC|Result|Value|Range)/i.test(surrounding)) {
      return `${d1}${d2}`;
    }
    return match;
  });

  return cleaned;
};

/**
 * Robust Multi-Page PDF Stream & Font CMap Extractor
 * Accepts Buffer or Uint8Array
 */
const extractAllTextFromPdfBuffer = (buffer) => {
  const bytes = Buffer.isBuffer(buffer) ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) : new Uint8Array(buffer);
  let latinStr = '';
  const CHUNK_SIZE = 65536;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    latinStr += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK_SIZE)));
  }

  // 1. Index all PDF objects
  const objMap = new Map();
  const objRegex = /(\d+)\s+0\s+obj\b/g;
  let m;
  const objIndices = [];

  while ((m = objRegex.exec(latinStr)) !== null) {
    objIndices.push({ num: parseInt(m[1], 10), index: m.index });
  }

  for (let i = 0; i < objIndices.length; i++) {
    const cur = objIndices[i];
    const nextIndex = i + 1 < objIndices.length ? objIndices[i + 1].index : latinStr.length;
    const objBlock = latinStr.slice(cur.index, nextIndex);

    const streamIdx = objBlock.indexOf('stream');
    let dict = '';
    let streamStart = -1;
    let streamEnd = -1;
    let isFlate = false;

    if (streamIdx !== -1) {
      dict = objBlock.substring(0, streamIdx);
      isFlate = /Filter\s*\/\s*FlateDecode/i.test(dict);
      let dStart = cur.index + streamIdx + 6;
      while (dStart < latinStr.length && (bytes[dStart] === 10 || bytes[dStart] === 13)) dStart++;
      streamStart = dStart;
      const endStreamRelative = objBlock.indexOf('endstream', streamIdx);
      if (endStreamRelative !== -1) {
        let dEnd = cur.index + endStreamRelative;
        while (dEnd > streamStart && (bytes[dEnd - 1] === 10 || bytes[dEnd - 1] === 13)) dEnd--;
        streamEnd = dEnd;
      }
    } else {
      dict = objBlock;
    }
    objMap.set(cur.num, { dict, streamStart, streamEnd, isFlate });
  }

  // Helper to obtain decompressed stream content
  function getStreamContent(num) {
    const obj = objMap.get(num);
    if (!obj || obj.streamStart === -1 || obj.streamEnd === -1) return null;
    const slice = bytes.subarray(obj.streamStart, obj.streamEnd);
    if (obj.isFlate) {
      return decompressFlateStream(slice);
    }
    return slice;
  }

  // 2. Parse ToUnicode CMaps
  const cmapCache = new Map();
  function getCMap(cmapObjNum) {
    if (cmapCache.has(cmapObjNum)) return cmapCache.get(cmapObjNum);
    const streamBytes = getStreamContent(cmapObjNum);
    if (!streamBytes) return null;
    let cmapText = '';
    try {
      cmapText = Buffer.from(streamBytes).toString('utf-8');
    } catch (e) {
      cmapText = String.fromCharCode.apply(null, Array.from(streamBytes));
    }
    const map = new Map();

    // Parse beginbfchar
    const bfcharRegex = /beginbfchar([\s\S]*?)endbfchar/g;
    let match;
    while ((match = bfcharRegex.exec(cmapText)) !== null) {
      match[1].trim().split(/\r?\n/).forEach((line) => {
        const parts = line.trim().match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/);
        if (parts) {
          map.set(parseInt(parts[1], 16), String.fromCharCode(parseInt(parts[2], 16)));
        }
      });
    }

    // Parse beginbfrange
    const bfrangeRegex = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((match = bfrangeRegex.exec(cmapText)) !== null) {
      match[1].trim().split(/\r?\n/).forEach((line) => {
        const parts = line.trim().match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/);
        if (parts) {
          const start = parseInt(parts[1], 16);
          const end = parseInt(parts[2], 16);
          let dst = parseInt(parts[3], 16);
          for (let c = start; c <= end; c++) {
            map.set(c, String.fromCharCode(dst++));
          }
        }
      });
    }
    cmapCache.set(cmapObjNum, map);
    return map;
  }

  // 3. Map Fonts to their ToUnicode CMaps
  const fontToCMap = new Map();
  for (const [num, obj] of objMap.entries()) {
    if (/\/Type\s*\/Font\b/i.test(obj.dict)) {
      const toUnicodeMatch = obj.dict.match(/\/ToUnicode\s+(\d+)\s+0\s+R/i);
      if (toUnicodeMatch) {
        fontToCMap.set(num, parseInt(toUnicodeMatch[1], 10));
      }
    }
  }

  // 4. Map Pages and their Content Streams
  const pages = [];
  for (const [num, obj] of objMap.entries()) {
    if (/\/Type\s*\/Page\b/i.test(obj.dict) && !/\/Type\s*\/Pages\b/i.test(obj.dict)) {
      const pageFonts = new Map();
      const fontBlockMatch = obj.dict.match(/\/Font\s*<<([\s\S]*?)>>/i);
      if (fontBlockMatch) {
        const fontEntries = Array.from(fontBlockMatch[1].matchAll(/\/(\w+)\s+(\d+)\s+0\s+R/g));
        fontEntries.forEach((fe) => pageFonts.set(fe[1], parseInt(fe[2], 10)));
      }
      const contentNums = [];
      const contentsArrayMatch = obj.dict.match(/\/Contents\s*\[(.*?)\]/s);
      if (contentsArrayMatch) {
        const refs = Array.from(contentsArrayMatch[1].matchAll(/(\d+)\s+0\s+R/g));
        refs.forEach((r) => contentNums.push(parseInt(r[1], 10)));
      } else {
        const singleRefMatch = obj.dict.match(/\/Contents\s+(\d+)\s+0\s+R/i);
        if (singleRefMatch) contentNums.push(parseInt(singleRefMatch[1], 10));
      }
      pages.push({ pageNum: num, pageFonts, contentNums });
    }
  }

  // 5. Extract text from each page stream
  let fullDocText = '';
  pages.forEach((page, pageIdx) => {
    let pageText = '';
    page.contentNums.forEach((contentNum) => {
      const streamBytes = getStreamContent(contentNum);
      if (!streamBytes) return;
      let streamStr = '';
      try {
        streamStr = Buffer.from(streamBytes).toString('latin1');
      } catch (e) {
        streamStr = String.fromCharCode.apply(null, Array.from(streamBytes));
      }

      let currentFont = 'F4';
      const tokenRegex =
        /(\/F\d+)\s+[\d\.]+\s+Tf|<([0-9a-fA-F]+)>\s*Tj|\(([^)]*)\)\s*Tj|\[(.*?)\]\s*TJ|T\*|ET/g;
      let match;
      while ((match = tokenRegex.exec(streamStr)) !== null) {
        if (match[1]) {
          currentFont = match[1].substring(1);
        } else if (match[0] === 'ET' || match[0] === 'T*') {
          pageText += '\n';
        } else if (match[2]) {
          const hex = match[2];
          const fontObj = page.pageFonts.get(currentFont);
          const cmapObj = fontObj ? fontToCMap.get(fontObj) : null;
          const cmap = cmapObj ? getCMap(cmapObj) : null;
          let decoded = '';
          for (let j = 0; j < hex.length; j += 4) {
            const code = parseInt(hex.substring(j, j + 4), 16);
            decoded += (cmap ? cmap.get(code) : null) || String.fromCharCode(code);
          }
          pageText += decoded + ' ';
        } else if (match[3] !== undefined) {
          pageText += match[3] + ' ';
        } else if (match[4]) {
          const tjParts = match[4];
          const hexParts = Array.from(tjParts.matchAll(/<([0-9a-fA-F]+)>/g));
          const fontObj = page.pageFonts.get(currentFont);
          const cmapObj = fontObj ? fontToCMap.get(fontObj) : null;
          const cmap = cmapObj ? getCMap(cmapObj) : null;
          hexParts.forEach((hp) => {
            const hex = hp[1];
            let decoded = '';
            for (let j = 0; j < hex.length; j += 4) {
              const code = parseInt(hex.substring(j, j + 4), 16);
              decoded += (cmap ? cmap.get(code) : null) || String.fromCharCode(code);
            }
            pageText += decoded + ' ';
          });
          const strParts = Array.from(tjParts.matchAll(/\(([^)]*)\)/g));
          strParts.forEach((sp) => {
            pageText += sp[1] + ' ';
          });
        }
      }
    });
    fullDocText += `--- PAGE ${pageIdx + 1} ---\n` + pageText + '\n\n';
  });

  return { text: fullDocText, pageCount: Math.max(1, pages.length) };
};

module.exports = {
  decompressFlateStream,
  cleanPdfExtractedText,
  extractAllTextFromPdfBuffer
};
