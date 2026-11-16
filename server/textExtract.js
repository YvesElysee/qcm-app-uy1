/**
 * Extraction de texte multi-format pour les documents de référence IA.
 *
 * Objectif : accepter réellement « n'importe quel document » de cours.
 * - PDF (couche texte, avec repli `pdftotext` si disponible) ;
 * - Word / PowerPoint / Excel modernes (.docx, .pptx, .xlsx) lus directement
 *   dans l'archive ZIP (aucune dépendance externe) ;
 * - OpenDocument (.odt, .ods, .odp), EPUB et archives ZIP de documents ;
 * - RTF, HTML, XML, texte brut (UTF-8 / UTF-16 / latin1) ;
 * - anciens formats binaires (.doc, .ppt, .xls) : extraction heuristique,
 *   avec repli facultatif sur LibreOffice s'il est installé.
 *
 * Le texte renvoyé est nettoyé (caractères de contrôle, lignes vides en trop)
 * et plafonné pour rester exploitable par l'IA et la base SQLite.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const MAX_EXTRACTED_CHARS = 400000;
const MAX_ENTRY_BYTES = 30 * 1024 * 1024;
const MAX_TOTAL_UNZIPPED = 80 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  'txt', 'text', 'md', 'markdown', 'mdx', 'csv', 'tsv', 'json', 'jsonl',
  'xml', 'html', 'htm', 'xhtml', 'yml', 'yaml', 'log', 'tex', 'rst',
  'ini', 'cfg', 'conf', 'sql', 'svg'
]);

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'heif'
]);

const BINARY_OFFICE_EXTENSIONS = new Set(['doc', 'dot', 'ppt', 'pps', 'xls']);

const ODF_KINDS = {
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.text-template': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.spreadsheet-template': 'ods',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/vnd.oasis.opendocument.presentation-template': 'odp'
};

// ── Utilitaires texte ────────────────────────────────────────────────

function decodeEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

function stripMarkup(xml) {
  return decodeEntities(String(xml || '').replace(/<[^>]*>/g, ' '));
}

/**
 * Nettoie un texte extrait : supprime les caractères de contrôle, normalise
 * les espaces et les sauts de ligne, puis tronque.
 */
export function cleanExtractedText(value) {
  let text = String(value || '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/\u0000/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\uFEFF/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length > MAX_EXTRACTED_CHARS) {
    text = text.slice(0, MAX_EXTRACTED_CHARS);
  }
  return text;
}

function meaningfulLength(value) {
  return cleanExtractedText(value).replace(/\s+/g, '').length;
}

function decodeTextBuffer(buffer) {
  if (!buffer?.length) return '';

  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    if (swapped.length % 2 !== 0) return swapped.toString('utf8');
    swapped.swap16();
    return swapped.toString('utf16le');
  }

  // Détection d'un texte UTF-16LE sans BOM (beaucoup de zéros côté fort).
  const probe = buffer.subarray(0, Math.min(buffer.length, 4096));
  let zeros = 0;
  for (let i = 1; i < probe.length; i += 2) {
    if (probe[i] === 0) zeros += 1;
  }
  if (probe.length > 20 && zeros > probe.length * 0.3) {
    const clean = buffer.length % 2 === 0 ? buffer : buffer.subarray(0, buffer.length - 1);
    return clean.toString('utf16le');
  }

  const utf8 = buffer.toString('utf8');
  const replacementRatio = (utf8.match(/\uFFFD/g) || []).length / Math.max(1, utf8.length);
  return replacementRatio > 0.01 ? buffer.toString('latin1') : utf8;
}

// ── Lecture des archives ZIP (Office / OpenDocument / EPUB) ───────────

function findEndOfCentralDirectory(buffer) {
  const start = Math.max(0, buffer.length - 66000);
  for (let i = buffer.length - 22; i >= start; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function zip64Values(extra) {
  const values = [];
  let offset = 0;
  while (offset + 4 <= extra.length) {
    const id = extra.readUInt16LE(offset);
    const size = extra.readUInt16LE(offset + 2);
    if (offset + 4 + size > extra.length) break;
    if (id === 0x0001) {
      const data = extra.subarray(offset + 4, offset + 4 + size);
      for (let i = 0; i + 8 <= data.length; i += 8) {
        values.push(Number(data.readBigUInt64LE(i)));
      }
      break;
    }
    offset += 4 + size;
  }
  return values;
}

/**
 * Lit les entrées d'une archive ZIP sans dépendance externe.
 * @returns {Map<string, Buffer>}
 */
export function readZipEntries(buffer) {
  const entries = new Map();
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) throw new Error('Archive ZIP illisible.');

  const count = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  let pointer = directoryOffset;
  let totalUnzipped = 0;

  for (let index = 0; index < count; index += 1) {
    if (pointer + 46 > buffer.length || buffer.readUInt32LE(pointer) !== 0x02014b50) break;

    const flags = buffer.readUInt16LE(pointer + 8);
    const method = buffer.readUInt16LE(pointer + 10);
    let compressedSize = buffer.readUInt32LE(pointer + 20);
    let uncompressedSize = buffer.readUInt32LE(pointer + 24);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    let localOffset = buffer.readUInt32LE(pointer + 42);
    const nameStart = pointer + 46;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      const extra = buffer.subarray(nameStart + nameLength, nameStart + nameLength + extraLength);
      const values = zip64Values(extra);
      let cursor = 0;
      const takeValue = (fallback) => {
        const value = values[cursor];
        cursor += 1;
        return value ?? fallback;
      };
      if (uncompressedSize === 0xffffffff) { uncompressedSize = takeValue(uncompressedSize); }
      if (compressedSize === 0xffffffff) { compressedSize = takeValue(compressedSize); }
      if (localOffset === 0xffffffff) { localOffset = takeValue(localOffset); }
    }

    pointer = nameStart + nameLength + extraLength + commentLength;

    if (!name || name.endsWith('/')) continue;
    if (flags & 0x0001) continue; // archive chiffrée
    if (uncompressedSize > MAX_ENTRY_BYTES) continue;
    if (totalUnzipped + uncompressedSize > MAX_TOTAL_UNZIPPED) break;

    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) continue;
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart > buffer.length) continue;

    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let data;
    try {
      if (method === 0) data = Buffer.from(compressed);
      else if (method === 8) data = zlib.inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_BYTES });
      else continue;
    } catch {
      continue;
    }
    totalUnzipped += data.length;
    entries.set(name, data);
  }

  if (entries.size === 0) throw new Error('Archive ZIP vide ou corrompue.');
  return entries;
}

function zipText(entries, name) {
  const data = entries.get(name);
  return data ? decodeTextBuffer(data) : '';
}

function sortedNumeric(entries, pattern) {
  return [...entries.keys()]
    .filter((name) => pattern.test(name))
    .sort((a, b) => {
      const na = Number((a.match(/(\d+)\.xml$/) || [])[1] || 0);
      const nb = Number((b.match(/(\d+)\.xml$/) || [])[1] || 0);
      return na - nb || a.localeCompare(b);
    });
}

// ── Convertisseurs spécialisés ───────────────────────────────────────

function extractDocx(entries) {
  const xml = zipText(entries, 'word/document.xml');
  if (!xml) throw new Error('Document Word sans contenu lisible.');
  const text = xml
    .replace(/<w:instrText[\s\S]*?<\/w:instrText>/gi, ' ')
    .replace(/<w:tab[^>]*\/>/gi, '\t')
    .replace(/<w:br[^>]*\/>/gi, '\n')
    .replace(/<w:cr[^>]*\/>/gi, '\n')
    .replace(/<\/w:tc>/gi, '\t')
    .replace(/<\/w:tr>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n');
  return stripMarkup(text);
}

function extractPptx(entries) {
  const slides = sortedNumeric(entries, /^ppt\/slides\/slide\d+\.xml$/);
  const source = slides.length ? slides : [...entries.keys()].filter((n) => /\.xml$/i.test(n) && /slide/i.test(n));
  const parts = [];
  source.forEach((name) => {
    const xml = zipText(entries, name);
    if (!xml) return;
    const text = xml
      .replace(/<a:br[^>]*\/>/gi, '\n')
      .replace(/<a:tab[^>]*\/>/gi, '\t')
      .replace(/<\/a:p>/gi, '\n');
    const cleaned = stripMarkup(text);
    if (meaningfulLength(cleaned) > 0) parts.push(cleaned);
  });
  if (!parts.length) throw new Error('Présentation PowerPoint sans texte lisible.');
  return parts.join('\n\n');
}

function extractXlsx(entries) {
  const shared = [];
  const sharedXml = zipText(entries, 'xl/sharedStrings.xml');
  if (sharedXml) {
    const blocks = sharedXml.match(/<si\b[\s\S]*?<\/si>/gi) || [];
    blocks.forEach((block) => {
      const pieces = [...block.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((m) => m[1]);
      shared.push(decodeEntities(pieces.join('')));
    });
  }

  const sheets = sortedNumeric(entries, /^xl\/worksheets\/sheet\d+\.xml$/);
  const parts = [];
  sheets.forEach((name, sheetIndex) => {
    const xml = zipText(entries, name);
    if (!xml) return;
    const rows = xml.match(/<row\b[\s\S]*?<\/row>/gi) || [];
    const lines = [];
    rows.forEach((rowXml) => {
      const cells = rowXml.match(/<c\b[^>]*>[\s\S]*?<\/c>/gi) || [];
      const values = cells.map((cell) => {
        const type = (cell.match(/\bt="([^"]+)"/i) || [])[1] || '';
        if (type === 's') {
          const idx = Number((cell.match(/<v>([\s\S]*?)<\/v>/i) || [])[1]);
          return Number.isFinite(idx) ? (shared[idx] || '') : '';
        }
        if (type === 'inlineStr') {
          const pieces = [...cell.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((m) => m[1]);
          return decodeEntities(pieces.join(''));
        }
        const value = (cell.match(/<v>([\s\S]*?)<\/v>/i) || [])[1] || '';
        return decodeEntities(value);
      }).map((value) => String(value).replace(/\s+/g, ' ').trim());
      const line = values.join('\t').replace(/\t+$/g, '');
      if (line.trim()) lines.push(line);
    });
    if (lines.length) {
      parts.push(`Feuille ${sheetIndex + 1}\n${lines.join('\n')}`);
    }
  });

  if (!parts.length) {
    // Repli : tout le texte de l'archive (certains classeurs n'ont pas de
    // sharedStrings mais des chaînes en ligne).
    const fallback = [...entries.keys()]
      .filter((n) => /^xl\/.*\.xml$/i.test(n))
      .map((n) => stripMarkup(zipText(entries, n)))
      .join('\n');
    if (meaningfulLength(fallback) > 0) return fallback;
    throw new Error('Classeur Excel sans texte lisible.');
  }
  return parts.join('\n\n');
}

function extractOpenDocument(entries) {
  const xml = zipText(entries, 'content.xml');
  if (!xml) throw new Error('Document OpenDocument sans contenu.');
  const text = xml
    .replace(/<text:tab[^>]*\/>/gi, '\t')
    .replace(/<text:line-break[^>]*\/>/gi, '\n')
    .replace(/<\/text:p>/gi, '\n')
    .replace(/<\/text:h>/gi, '\n')
    .replace(/<\/table:table-cell>/gi, '\t')
    .replace(/<\/table:table-row>/gi, '\n');
  return stripMarkup(text);
}

function extractEpub(entries) {
  const pages = [...entries.keys()]
    .filter((name) => /\.(xhtml|html|htm)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const parts = pages
    .map((name) => stripMarkup(zipText(entries, name)))
    .filter((text) => meaningfulLength(text) > 0);
  if (!parts.length) throw new Error('EPUB sans texte lisible.');
  return parts.join('\n\n');
}

function extractRtf(buffer) {
  let rtf = buffer.toString('latin1');
  // Groupes de destination ignorés (polices, styles, images…).
  let previous;
  do {
    previous = rtf;
    rtf = rtf.replace(/\{\\\*[^{}]*\}/g, '');
  } while (rtf !== previous);

  rtf = rtf
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\u(-?\d+)\s?\??/g, (_, dec) => {
      const code = ((Number(dec) % 65536) + 65536) % 65536;
      return String.fromCharCode(code);
    })
    .replace(/\\par[d]?\b/gi, '\n')
    .replace(/\\line\b/gi, '\n')
    .replace(/\\tab\b/gi, '\t')
    .replace(/\\[a-z]+-?\d*\s?/gi, '')
    .replace(/[{}]/g, '');
  return rtf;
}

function extractHtml(buffer) {
  const html = decodeTextBuffer(buffer)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head\b[\s\S]*?<\/head>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, '\t');
  return stripMarkup(html);
}

// ── Anciens formats binaires (.doc, .ppt, .xls) ──────────────────────

function isReadableCode(code) {
  if (code === 9 || code === 10 || code === 13) return true;
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0x2ff) return true;
  if (code >= 0x2010 && code <= 0x203a) return true;
  return false;
}

function looksMeaningful(value) {
  const text = value.trim();
  if (text.length < 6) return false;
  const letters = (text.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  return letters / text.length >= 0.55;
}

function extractBinaryOffice(buffer) {
  const parts = [];

  // Chaînes UTF-16LE (format interne de Word / PowerPoint / Excel).
  let current = '';
  for (let i = 0; i + 1 < buffer.length; i += 2) {
    const code = buffer[i] | (buffer[i + 1] << 8);
    if (isReadableCode(code)) {
      current += String.fromCharCode(code);
    } else {
      if (current.trim().length >= 6 && looksMeaningful(current)) parts.push(current.trim());
      current = '';
    }
  }
  if (current.trim().length >= 6 && looksMeaningful(current)) parts.push(current.trim());

  // Chaînes 8 bits (cp1252 / latin1).
  current = '';
  for (let i = 0; i < buffer.length; i += 1) {
    const byte = buffer[i];
    const readable = (byte >= 0x20 && byte <= 0x7e) || byte === 9 || byte === 10 || byte === 13 ||
      (byte >= 0xa0 && byte <= 0xff);
    if (readable) {
      current += String.fromCharCode(byte);
    } else {
      if (current.trim().length >= 8 && looksMeaningful(current)) parts.push(current.trim());
      current = '';
    }
  }
  if (current.trim().length >= 8 && looksMeaningful(current)) parts.push(current.trim());

  // Dédoublonnage en conservant l'ordre.
  const seen = new Set();
  const unique = [];
  parts.forEach((part) => {
    const key = part.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(part);
  });
  return unique.join('\n');
}

// ── Replis optionnels (binaires système) ─────────────────────────────

function tempWorkspace(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function pdftotextFallback(buffer) {
  const dir = tempWorkspace('qcm-pdftotext-');
  try {
    const input = path.join(dir, 'document.pdf');
    fs.writeFileSync(input, buffer);
    const result = spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', input, '-'], {
      timeout: 20000,
      maxBuffer: 40 * 1024 * 1024
    });
    return result.status === 0 && result.stdout ? result.stdout.toString('utf8') : '';
  } catch {
    return '';
  } finally {
    cleanupDir(dir);
  }
}

function libreOfficeFallback(buffer, extension) {
  if (!BINARY_OFFICE_EXTENSIONS.has(extension)) return '';
  const dir = tempWorkspace('qcm-libreoffice-');
  try {
    const input = path.join(dir, `source.${extension}`);
    fs.writeFileSync(input, buffer);
    const profile = path.join(dir, 'profile');
    const isSpreadsheet = extension === 'xls';
    const target = isSpreadsheet
      ? 'csv:Text - txt - csv (StarCalc):59,34,76'
      : 'txt:Text (encoded):UTF8';
    const result = spawnSync(
      process.env.LIBREOFFICE_BIN || 'libreoffice',
      [
        '--headless',
        '--norestore',
        `-env:UserInstallation=file://${profile}`,
        '--convert-to',
        target,
        '--outdir',
        dir,
        input
      ],
      { timeout: 30000, maxBuffer: 40 * 1024 * 1024 }
    );
    if (result.error || result.status !== 0) return '';
    const output = path.join(dir, `source.${isSpreadsheet ? 'csv' : 'txt'}`);
    return fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '';
  } catch {
    return '';
  } finally {
    cleanupDir(dir);
  }
}

// ── Détection du type ───────────────────────────────────────────────

function normalizeFilename(name) {
  const raw = String(name || 'document');
  const decoded = Buffer.from(raw, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? raw : decoded;
}

export function detectDocumentKind({ filename = '', mimetype = '', buffer }) {
  const extension = path.extname(normalizeFilename(filename)).replace('.', '').toLowerCase();
  const mime = String(mimetype || '').toLowerCase();

  if (['pdf'].includes(extension) || mime === 'application/pdf') return 'pdf';
  if (['docx', 'docm', 'dotx'].includes(extension)) return 'docx';
  if (['pptx', 'pptm', 'ppsx', 'potx'].includes(extension)) return 'pptx';
  if (['xlsx', 'xlsm', 'xltx'].includes(extension)) return 'xlsx';
  if (extension === 'odt') return 'odt';
  if (extension === 'ods') return 'ods';
  if (extension === 'odp') return 'odp';
  if (extension === 'epub') return 'epub';
  if (['doc', 'dot'].includes(extension)) return 'doc';
  if (['ppt', 'pps'].includes(extension)) return 'ppt';
  if (extension === 'xls') return 'xls';
  if (extension === 'rtf' || mime === 'application/rtf' || mime === 'text/rtf') return 'rtf';
  if (['html', 'htm', 'xhtml'].includes(extension) || mime === 'text/html') return 'html';
  if (TEXT_EXTENSIONS.has(extension) || mime.startsWith('text/') || mime.includes('json') || mime.includes('xml')) {
    return 'text';
  }
  if (IMAGE_EXTENSIONS.has(extension) || mime.startsWith('image/')) return 'image';
  if (extension === 'zip' || mime.includes('zip')) return 'zip';

  if (!buffer?.length) return 'unknown';
  const head = buffer.subarray(0, 8);
  if (head.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
  if (head[0] === 0x50 && head[1] === 0x4b) return 'zip';
  if (head.toString('latin1').startsWith('{\\rtf')) return 'rtf';
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return 'binary';
  return 'text';
}

function zipKind(entries) {
  const names = new Set(entries.keys());
  if (names.has('word/document.xml')) return 'docx';
  if (names.has('xl/workbook.xml')) return 'xlsx';
  if (names.has('ppt/presentation.xml')) return 'pptx';
  if (names.has('content.xml')) {
    const mime = entries.get('mimetype')?.toString('utf8').trim() || '';
    return ODF_KINDS[mime] || 'odf';
  }
  if (names.has('META-INF/container.xml')) {
    const mime = entries.get('mimetype')?.toString('utf8').trim() || '';
    if (mime.includes('epub') || names.has('mimetype')) return 'epub';
  }
  return 'zip';
}

// ── Point d'entrée ──────────────────────────────────────────────────

function finalize(text, { method, warning = '' } = {}) {
  const cleaned = cleanExtractedText(text);
  return {
    text: cleaned,
    method: method || 'natif',
    warning,
    charCount: cleaned.length
  };
}

async function extractFromBuffer(buffer, filename, mimetype, depth = 0) {
  const kind = detectDocumentKind({ filename, mimetype, buffer });
  const extension = path.extname(normalizeFilename(filename)).replace('.', '').toLowerCase();

  switch (kind) {
    case 'pdf': {
      let text = '';
      let failure = '';
      try {
        const parsed = await pdfParse(buffer);
        text = String(parsed?.text || '');
      } catch (err) {
        failure = err?.message || '';
      }
      if (meaningfulLength(text) < 20) {
        const fallback = pdftotextFallback(buffer);
        if (meaningfulLength(fallback) > meaningfulLength(text)) {
          text = fallback;
          failure = '';
        }
      }
      if (meaningfulLength(text) < 20) {
        throw new Error(
          failure
            ? `PDF illisible ou protégé (${failure.slice(0, 120)}). Exportez-le à nouveau en PDF, ou déposez la version Word/PowerPoint.`
            : 'Ce PDF ne contient pas de texte sélectionnable (document scanné ou photocopié). Exportez-le en PDF avec couche texte, en DOCX ou déposez une version texte.'
        );
      }
      return finalize(text, { method: 'PDF' });
    }

    case 'docx':
      return finalize(extractDocx(readZipEntries(buffer)), { method: 'Word (.docx)' });

    case 'pptx':
      return finalize(extractPptx(readZipEntries(buffer)), { method: 'PowerPoint (.pptx)' });

    case 'xlsx':
      return finalize(extractXlsx(readZipEntries(buffer)), { method: 'Excel (.xlsx)' });

    case 'odt':
    case 'ods':
    case 'odp':
    case 'odf':
      return finalize(extractOpenDocument(readZipEntries(buffer)), { method: 'OpenDocument' });

    case 'epub':
      return finalize(extractEpub(readZipEntries(buffer)), { method: 'EPUB' });

    case 'rtf':
      return finalize(extractRtf(buffer), { method: 'RTF' });

    case 'html':
      return finalize(extractHtml(buffer), { method: 'HTML' });

    case 'text':
      return finalize(decodeTextBuffer(buffer), { method: 'texte' });

    case 'doc':
    case 'ppt':
    case 'xls': {
      let text = extractBinaryOffice(buffer);
      let method = 'ancien format Office (extraction approximative)';
      if (meaningfulLength(text) < 120) {
        const fallback = libreOfficeFallback(buffer, extension);
        if (meaningfulLength(fallback) > meaningfulLength(text)) {
          text = fallback;
          method = 'LibreOffice';
        }
      }
      if (meaningfulLength(text) < 20) {
        throw new Error(
          `Impossible de lire ce fichier .${extension}. Enregistrez-le au format .docx, .pptx ou .xlsx puis déposez-le à nouveau.`
        );
      }
      return finalize(text, {
        method,
        warning: 'Ancien format Office : le texte peut être partiellement incomplet. Vérifiez les questions générées.'
      });
    }

    case 'binary': {
      if (depth > 0) throw new Error('Fichier binaire non pris en charge.');
      const text = extractBinaryOffice(buffer);
      if (meaningfulLength(text) < 20) {
        throw new Error(
          'Format binaire non reconnu. Enregistrez le document en PDF, DOCX, PPTX ou XLSX puis réessayez.'
        );
      }
      return finalize(text, {
        method: 'binaire (extraction approximative)',
        warning: 'Extraction approximative : vérifiez le texte avant de générer les questions.'
      });
    }

    case 'zip': {
      if (depth > 0) throw new Error('Archive imbriquée ignorée.');
      const entries = readZipEntries(buffer);
      const nestedKind = zipKind(entries);
      if (nestedKind === 'docx') return finalize(extractDocx(entries), { method: 'Word (.docx)' });
      if (nestedKind === 'pptx') return finalize(extractPptx(entries), { method: 'PowerPoint (.pptx)' });
      if (nestedKind === 'xlsx') return finalize(extractXlsx(entries), { method: 'Excel (.xlsx)' });
      if (['odt', 'ods', 'odp', 'odf'].includes(nestedKind)) {
        return finalize(extractOpenDocument(entries), { method: 'OpenDocument' });
      }
      if (nestedKind === 'epub') return finalize(extractEpub(entries), { method: 'EPUB' });

      const parts = [];
      for (const [name, data] of entries) {
        if (data.length > 8 * 1024 * 1024) continue;
        const nestedExt = path.extname(name).replace('.', '').toLowerCase();
        const isNestedText = TEXT_EXTENSIONS.has(nestedExt);
        const isNestedOffice = ['docx', 'pptx', 'xlsx', 'odt', 'ods', 'odp', 'pdf'].includes(nestedExt);
        if (!isNestedText && !isNestedOffice) continue;
        try {
          if (isNestedText) {
            const text = cleanExtractedText(decodeTextBuffer(data));
            if (text) parts.push(`— ${name} —\n${text}`);
          } else {
            const nested = await extractFromBuffer(data, name, '', depth + 1);
            if (nested.text) parts.push(`— ${name} —\n${nested.text}`);
          }
        } catch {
          // Un fichier illisible ne bloque pas l'archive entière.
        }
      }
      if (!parts.length) {
        throw new Error(
          "Cette archive ZIP ne contient aucun document texte lisible. Déposez directement les fichiers PDF, DOCX ou PPTX."
        );
      }
      return finalize(parts.join('\n\n'), {
        method: 'archive ZIP',
        warning: 'Archive ZIP : vérifiez que tous les documents utiles ont bien été lus.'
      });
    }

    case 'image':
      throw new Error(
        "Les photos et images n'ont pas de texte sélectionnable (OCR indisponible). Convertissez l'image en PDF avec couche texte, ou déposez le cours en DOCX/PPTX/PDF."
      );

    default:
      throw new Error(
        'Format non reconnu. Formats acceptés : PDF, Word, PowerPoint, Excel, OpenDocument, RTF, HTML, EPUB, TXT, MD, CSV, JSON, XML et ZIP de documents.'
      );
  }
}

/**
 * Extrait le texte d'un document, quel que soit son format.
 * @param {{ buffer: Buffer, filename?: string, mimetype?: string }} input
 * @returns {Promise<{ text: string, method: string, warning: string, charCount: number }>}
 */
export async function extractText({ buffer, filename = '', mimetype = '' }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Le fichier est vide.');
  }
  const result = await extractFromBuffer(buffer, normalizeFilename(filename), mimetype);
  if (meaningfulLength(result.text) < 20) {
    throw new Error(
      "Le document ne contient pas assez de texte exploitable. Vérifiez qu'il n'est pas scanné, protégé ou composé uniquement d'images."
    );
  }
  return result;
}

export const SUPPORTED_DOCUMENT_HINT =
  'PDF, Word (.docx/.doc), PowerPoint (.pptx/.ppt), Excel (.xlsx/.xls), OpenDocument, RTF, HTML, EPUB, TXT, MD, CSV, JSON, XML et ZIP de documents · 25 Mo max.';
