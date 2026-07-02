import { inflateRawSync, inflateSync } from "node:zlib";

export interface ParsedFileText {
  text: string;
  fileName: string;
  fileType: "txt" | "pdf" | "docx";
  warnings: string[];
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function validateFileSize(size: number) {
  if (size <= 0) {
    throw new Error("文件为空。");
  }
  if (size > MAX_FILE_BYTES) {
    throw new Error("文件超过 8MB，请压缩或复制主要内容后再上传。");
  }
}

export function detectSupportedFileType(fileName: string, mimeType: string) {
  const normalizedName = fileName.toLowerCase();
  const normalizedMime = mimeType.toLowerCase();

  if (normalizedName.endsWith(".txt") || normalizedMime.startsWith("text/")) return "txt" as const;
  if (normalizedName.endsWith(".pdf") || normalizedMime === "application/pdf") return "pdf" as const;
  if (
    normalizedName.endsWith(".docx") ||
    normalizedMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx" as const;
  }

  if (normalizedName.endsWith(".doc")) {
    throw new Error("暂不支持旧版 .doc 二进制文档，请另存为 .docx、.pdf 或 .txt 后上传。");
  }

  throw new Error("仅支持 .txt、.pdf 和 .docx 文件。");
}

export function extractTextFromFile(buffer: Buffer, fileName: string, mimeType: string): ParsedFileText {
  validateFileSize(buffer.byteLength);
  const fileType = detectSupportedFileType(fileName, mimeType);
  const warnings: string[] = [];
  const text =
    fileType === "txt" ? parseTxt(buffer) : fileType === "docx" ? parseDocx(buffer) : parsePdf(buffer, warnings);
  const normalizedText = normalizeExtractedText(text);

  if (normalizedText.length < 10) {
    throw new Error("未能从文件中提取到有效文本。若是扫描件 PDF，请先 OCR 或复制文本后再上传。");
  }

  return {
    text: normalizedText,
    fileName,
    fileType,
    warnings
  };
}

function parseTxt(buffer: Buffer) {
  if (buffer.byteLength >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString("utf16le", 2);
  }
  if (buffer.byteLength >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.toString("utf8", 3);
  }
  return buffer.toString("utf8");
}

function parseDocx(buffer: Buffer) {
  const documentXml = readZipEntry(buffer, "word/document.xml");
  if (!documentXml) {
    throw new Error("Word 文档缺少 word/document.xml，请确认文件是有效 .docx。");
  }
  return wordXmlToText(documentXml.toString("utf8"));
}

function readZipEntry(buffer: Buffer, entryName: string) {
  const endOfCentralDirectory = findEndOfCentralDirectory(buffer);
  const centralDirectorySize = buffer.readUInt32LE(endOfCentralDirectory + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOfCentralDirectory + 16);
  let offset = centralDirectoryOffset;
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;

  while (offset < centralDirectoryEnd && buffer.readUInt32LE(offset) === 0x02014b50) {
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength);

    if (fileName === entryName) {
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error("Word 文档 ZIP 结构无效。");
      }
      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);
      if (compressionMethod === 0) return compressedData;
      if (compressionMethod === 8) return inflateRawSync(compressedData);
      throw new Error("Word 文档使用了暂不支持的压缩方式。");
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return null;
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const minimumOffset = Math.max(0, buffer.byteLength - 65557);
  for (let offset = buffer.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("Word 文档 ZIP 结构无效。");
}

function wordXmlToText(xml: string) {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
  );
}

function parsePdf(buffer: Buffer, warnings: string[]) {
  const header = buffer.subarray(0, 5).toString("latin1");
  if (header !== "%PDF-") {
    throw new Error("PDF 文件头无效。");
  }

  const chunks: string[] = [];
  const content = buffer.toString("latin1");
  const streamPattern = /<<([\s\S]*?)>>\s*stream\r?\n?/g;
  let match: RegExpExecArray | null;

  while ((match = streamPattern.exec(content))) {
    const dictionary = match[1];
    const streamStart = match.index + match[0].length;
    const streamEnd = content.indexOf("endstream", streamStart);
    if (streamEnd < 0) break;

    const rawStream = trimPdfStream(buffer.subarray(streamStart, streamEnd));
    const decodedStream = decodePdfStream(rawStream, dictionary);
    if (!decodedStream) continue;

    chunks.push(...extractPdfTextOperators(decodedStream.toString("latin1")));
  }

  if (chunks.length === 0) {
    warnings.push("PDF 未提取到文本流，可能是扫描件或使用了复杂字体编码。");
  }

  return chunks.join("\n");
}

function trimPdfStream(stream: Buffer) {
  let start = 0;
  let end = stream.byteLength;
  if (stream[start] === 0x0d && stream[start + 1] === 0x0a) start += 2;
  else if (stream[start] === 0x0a) start += 1;
  if (stream[end - 2] === 0x0d && stream[end - 1] === 0x0a) end -= 2;
  else if (stream[end - 1] === 0x0a) end -= 1;
  return stream.subarray(start, end);
}

function decodePdfStream(stream: Buffer, dictionary: string) {
  if (!dictionary.includes("/Filter")) return stream;
  if (!dictionary.includes("/FlateDecode")) return null;

  try {
    return inflateSync(stream);
  } catch {
    try {
      return inflateRawSync(stream);
    } catch {
      return null;
    }
  }
}

function extractPdfTextOperators(stream: string) {
  const textChunks: string[] = [];
  const textBlocks = stream.match(/BT[\s\S]*?ET/g) ?? [];

  for (const block of textBlocks) {
    const literalPattern = /\((?:\\.|[^\\)])*\)\s*Tj/g;
    let literalMatch: RegExpExecArray | null;
    while ((literalMatch = literalPattern.exec(block))) {
      textChunks.push(decodePdfLiteral(literalMatch[0].replace(/\s*Tj$/, "")));
    }

    const hexPattern = /<[\da-fA-F\s]+>\s*Tj/g;
    let hexMatch: RegExpExecArray | null;
    while ((hexMatch = hexPattern.exec(block))) {
      textChunks.push(decodePdfHexString(hexMatch[0].replace(/\s*Tj$/, "")));
    }

    const arrayPattern = /\[(?:[^\[\]]|\((?:\\.|[^\\)])*\))*\]\s*TJ/g;
    let arrayMatch: RegExpExecArray | null;
    while ((arrayMatch = arrayPattern.exec(block))) {
      const literals = arrayMatch[0].match(/\((?:\\.|[^\\)])*\)|<[\da-fA-F\s]+>/g) ?? [];
      const text = literals
        .map((item) => (item.startsWith("(") ? decodePdfLiteral(item) : decodePdfHexString(item)))
        .join("");
      if (text) textChunks.push(text);
    }
  }

  return textChunks.map((item) => item.trim()).filter(Boolean);
}

function decodePdfLiteral(value: string) {
  const body = value.slice(1, -1);
  return body.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, escaped: string) => {
    if (escaped === "n") return "\n";
    if (escaped === "r") return "\r";
    if (escaped === "t") return "\t";
    if (escaped === "b") return "\b";
    if (escaped === "f") return "\f";
    if (/^[0-7]+$/.test(escaped)) return String.fromCharCode(Number.parseInt(escaped, 8));
    return escaped;
  });
}

function decodePdfHexString(value: string) {
  const hex = value.slice(1, -1).replace(/\s+/g, "");
  const bytes: number[] = [];
  for (let index = 0; index < hex.length; index += 2) {
    bytes.push(Number.parseInt(hex.slice(index, index + 2).padEnd(2, "0"), 16));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let result = "";
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      result += String.fromCharCode((bytes[index] << 8) + bytes[index + 1]);
    }
    return result;
  }
  return Buffer.from(bytes).toString("latin1");
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizeExtractedText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
