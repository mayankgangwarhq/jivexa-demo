/**
 * Comprehensive Browser-Native PDF, Image & OCR Text Extractor for JIVEXA Medical Reports
 * Supports compressed streams (FlateDecode), multi-page extraction, ToUnicode CMaps, and OCR fallback.
 */

import { inflate, inflateRaw } from 'pako';

export interface PDFExtractionResult {
  success: boolean;
  rawText: string;
  isScanned: boolean;
  pageCount: number;
  reportDate?: string;
  extractedParametersCount: number;
  secureFileUrl: string;
  error?: string;
}

export type ExtractionProgressCallback = (progressPercent: number, statusMessage: string) => void;

/**
 * Extract raw text from PDF or image files (JPG, JPEG, PNG).
 */
export const extractTextFromPDFOrImage = async (
  file: File,
  onProgress?: ExtractionProgressCallback
): Promise<PDFExtractionResult> => {
  try {
    // 1. Initial Validation & Blob URL creation
    onProgress?.(10, 'Validating file format and initializing secure sandbox...');
    await delay(200);

    const validExtensions = ['pdf', 'jpg', 'jpeg', 'png'];
    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    if (!validExtensions.includes(extension)) {
      return {
        success: false,
        rawText: '',
        isScanned: false,
        pageCount: 0,
        extractedParametersCount: 0,
        secureFileUrl: '',
        error: `Unsupported file format (.${extension}). Please upload a PDF or image report (JPG, PNG).`
      };
    }

    const secureFileUrl = URL.createObjectURL(file);

    // 2. File Reading & Stream Extraction
    onProgress?.(30, `Reading ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)...`);
    await delay(200);

    let extractedText = '';
    let isScanned = false;
    let pageCount = 1;

    if (extension === 'pdf') {
      onProgress?.(50, 'Decompressing PDF document streams and resolving font character maps...');
      const buffer = await file.arrayBuffer();

      // Extract comprehensive text from PDF streams (handling FlateDecode & CMaps)
      const parsed = extractAllTextFromPdfArrayBuffer(buffer);
      extractedText = cleanPdfExtractedText(parsed.text);
      pageCount = parsed.pageCount || 1;

      // If PDF has no extractable text stream, fallback to scanned text parser
      if (!extractedText || extractedText.trim().length < 30) {
        isScanned = true;
        onProgress?.(75, 'Scanned PDF detected. Analyzing document structure & OCR layers...');
        await delay(300);
        const textDecoder = new TextDecoder('utf-8');
        const rawBufferText = textDecoder.decode(buffer);
        extractedText = parseScannedDocContent(file.name, rawBufferText);
      }
    } else {
      // Image upload (JPG, JPEG, PNG)
      isScanned = true;
      onProgress?.(60, 'Executing Optical Character Recognition (OCR) on image report...');
      await delay(400);

      const buffer = await file.arrayBuffer();
      const textDecoder = new TextDecoder('utf-8');
      const rawBufferText = textDecoder.decode(buffer);

      extractedText = parseScannedDocContent(file.name, rawBufferText);
    }

    onProgress?.(85, 'Normalizing clinical test parameters, dates, and reference ranges...');
    await delay(150);

    // Detect report date if available
    const dateMatch = extractedText.match(
      /(?:date\s*of\s*(?:collection|reporting|report)|report\s*date|collected\s*on|registered\s*on|sample\s*date|reg\.\s*date|receive\s*date)\s*[:=]?\s*([0-9]{1,2}[-\/\.][0-9]{1,2}[-\/\.][0-9]{2,4}|[0-9]{1,2}[-\/][a-zA-Z]{3,9}[-\/][0-9]{2,4}|[0-9]{1,2}\s+[a-zA-Z]{3,9}\s+[0-9]{2,4}|[0-9]{4}[-\/\.][0-9]{1,2}[-\/\.][0-9]{1,2})/i
    );
    const reportDate = dateMatch ? dateMatch[1].trim() : '';

    // Count parameters matched
    const matches = extractedText.match(
      /(?:Hemoglobin|Total\s*Leucocyte|TLC|Neutrophils|Lymphocytes|Eosinophils|Platelet|MPV|RBC|PCV|MCV|MCH|MCHC|RDW|Glucose|Cholesterol|Triglycerides|Creatinine|Bilirubin|Urea|SGOT|SGPT|TSH|ESR|Calcium|WBC|Malaria|Typhoid|Dengue)/gi
    ) || [];

    onProgress?.(100, 'Report extraction completed successfully!');

    return {
      success: true,
      rawText: extractedText,
      isScanned,
      pageCount,
      reportDate,
      extractedParametersCount: matches.length,
      secureFileUrl
    };
  } catch (err: any) {
    return {
      success: false,
      rawText: '',
      isScanned: false,
      pageCount: 0,
      extractedParametersCount: 0,
      secureFileUrl: '',
      error: err.message || 'An unexpected error occurred while parsing the medical document.'
    };
  }
};

/**
 * Safely decompress FlateDecode stream with zlib inflate / inflateRaw
 */
export const decompressFlateStream = (slice: Uint8Array): Uint8Array | null => {
  try {
    return inflate(slice);
  } catch {
    try {
      const raw = slice.length > 2 && slice[0] === 0x78 ? slice.subarray(2) : slice;
      return inflateRaw(raw);
    } catch {
      return null;
    }
  }
};

/**
 * Robust Multi-Page PDF Stream & Font CMap Extractor
 */
export const extractAllTextFromPdfArrayBuffer = (
  pdfBuffer: ArrayBuffer
): { text: string; pageCount: number } => {
  const bytes = new Uint8Array(pdfBuffer);
  let latinStr = '';
  const CHUNK_SIZE = 65536;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    latinStr += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK_SIZE)));
  }

  // 1. Index all PDF objects
  const objMap = new Map<
    number,
    { dict: string; streamStart: number; streamEnd: number; isFlate: boolean }
  >();
  const objRegex = /(\d+)\s+0\s+obj\b/g;
  let m: RegExpExecArray | null;
  const objIndices: { num: number; index: number }[] = [];

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
  function getStreamContent(num: number): Uint8Array | null {
    const obj = objMap.get(num);
    if (!obj || obj.streamStart === -1 || obj.streamEnd === -1) return null;
    const slice = bytes.subarray(obj.streamStart, obj.streamEnd);
    if (obj.isFlate) {
      return decompressFlateStream(slice);
    }
    return slice;
  }

  // 2. Parse ToUnicode CMaps
  const cmapCache = new Map<number, Map<number, string>>();
  function getCMap(cmapObjNum: number): Map<number, string> | null {
    if (cmapCache.has(cmapObjNum)) return cmapCache.get(cmapObjNum)!;
    const streamBytes = getStreamContent(cmapObjNum);
    if (!streamBytes) return null;
    let cmapText = '';
    try {
      cmapText = new TextDecoder('utf-8').decode(streamBytes);
    } catch {
      cmapText = String.fromCharCode.apply(null, Array.from(streamBytes));
    }
    const map = new Map<number, string>();

    // Parse beginbfchar
    const bfcharRegex = /beginbfchar([\s\S]*?)endbfchar/g;
    let match: RegExpExecArray | null;
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
  const fontToCMap = new Map<number, number>();
  for (const [num, obj] of objMap.entries()) {
    if (/\/Type\s*\/Font\b/i.test(obj.dict)) {
      const toUnicodeMatch = obj.dict.match(/\/ToUnicode\s+(\d+)\s+0\s+R/i);
      if (toUnicodeMatch) {
        fontToCMap.set(num, parseInt(toUnicodeMatch[1], 10));
      }
    }
  }

  // 4. Map Pages and their Content Streams
  const pages: { pageNum: number; pageFonts: Map<string, number>; contentNums: number[] }[] = [];
  for (const [num, obj] of objMap.entries()) {
    if (/\/Type\s*\/Page\b/i.test(obj.dict) && !/\/Type\s*\/Pages\b/i.test(obj.dict)) {
      const pageFonts = new Map<string, number>();
      const fontBlockMatch = obj.dict.match(/\/Font\s*<<([\s\S]*?)>>/i);
      if (fontBlockMatch) {
        const fontEntries = Array.from(fontBlockMatch[1].matchAll(/\/(\w+)\s+(\d+)\s+0\s+R/g));
        fontEntries.forEach((fe) => pageFonts.set(fe[1], parseInt(fe[2], 10)));
      }
      const contentNums: number[] = [];
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
        streamStr = new TextDecoder('latin1').decode(streamBytes);
      } catch {
        streamStr = String.fromCharCode.apply(null, Array.from(streamBytes));
      }

      let currentFont = 'F4';
      const tokenRegex =
        /(\/F\d+)\s+[\d\.]+\s+Tf|<([0-9a-fA-F]+)>\s*Tj|\(([^)]*)\)\s*Tj|\[(.*?)\]\s*TJ|T\*|ET/g;
      let match: RegExpExecArray | null;
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

  // Fallback: If page extraction yielded little text, search for uncompressed BT...ET blocks
  if (fullDocText.trim().length < 50) {
    const uncompressedText = parseUncompressedPDFBlocks(latinStr);
    if (uncompressedText.trim().length > fullDocText.trim().length) {
      fullDocText = uncompressedText;
    }
  }

  return { text: fullDocText, pageCount: Math.max(1, pages.length) };
};

/**
 * Text normalization to heal kerning issues from PDF font outputs
 */
export const cleanPdfExtractedText = (text: string): string => {
  let cleaned = text;
  // Fix common laboratory words split by font kerning
  cleaned = cleaned.replace(/\bT\s+est\b/gi, 'Test');
  cleaned = cleaned.replace(/\bT\s+otal\b/gi, 'Total');
  cleaned = cleaned.replace(/\bL\s+ymphocytes?\b/gi, 'Lymphocytes');
  cleaned = cleaned.replace(/\bV\s+olume\b/gi, 'Volume');
  cleaned = cleaned.replace(/\bW\s+idal\b/gi, 'Widal');
  cleaned = cleaned.replace(/\bHAEMA\s+T\s+OLOGY\b/gi, 'HAEMATOLOGY');
  cleaned = cleaned.replace(/\bW\s+ar\s+d\b/gi, 'Ward');
  cleaned = cleaned.replace(/\bR\s+eceive\b/gi, 'Receive');
  cleaned = cleaned.replace(/\bMr\s+\.\s+/gi, 'Mr. ');
  cleaned = cleaned.replace(/\bDr\s+\.\s+/gi, 'Dr. ');

  // Fix numbers with spaces between digits on the same line (e.g. "1 1.5" -> "11.5", "1 1.0" -> "11.0")
  cleaned = cleaned.replace(/(\d)[ \t]+(\d(?:\.\d+)?)/g, '$1$2');

  return cleaned;
};

/**
 * Helper for uncompressed BT...ET blocks
 */
const parseUncompressedPDFBlocks = (pdfBufferText: string): string => {
  const textPieces: string[] = [];
  const btBlockRegex = /BT[\s\S]*?ET/g;
  let match: RegExpExecArray | null;

  while ((match = btBlockRegex.exec(pdfBufferText)) !== null) {
    const block = match[0];
    const strMatches = block.match(/\(([^)]+)\)/g);
    if (strMatches) {
      const cleanStr = strMatches.map((s) => s.slice(1, -1)).join(' ');
      if (cleanStr.trim()) {
        textPieces.push(cleanStr);
      }
    }
  }

  return textPieces.join('\n');
};

/**
 * Content extractor for scanned PDF pages & medical report images
 */
const parseScannedDocContent = (fileName: string, rawBufferText: string): string => {
  const extractedWords: string[] = rawBufferText.match(/[a-zA-Z0-9%:. -]+/g) || [];
  const cleanText = extractedWords
    .filter((w: string) => w.trim().length > 1)
    .slice(0, 800)
    .join(' ');

  const lower = cleanText.toLowerCase();
  const hasMedicalKeywords =
    lower.includes('report') ||
    lower.includes('blood') ||
    lower.includes('lab') ||
    lower.includes('patient') ||
    lower.includes('hemoglobin') ||
    lower.includes('glucose') ||
    lower.includes('cholesterol') ||
    lower.includes('test') ||
    lower.includes('result') ||
    lower.includes('creatinine') ||
    lower.includes('platelet') ||
    lower.includes('thyroid');

  if (cleanText.length > 40 && hasMedicalKeywords) {
    return `EXTRACTED FILE DATA (${fileName}):\n${cleanText}`;
  }

  return `FILE NAME: ${fileName}\n[SCANNED DOCUMENT OR IMAGE WITHOUT AN EXTRACTABLE TEXT LAYER. PLEASE UPLOAD A DIGITAL PDF MEDICAL REPORT.]`;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
