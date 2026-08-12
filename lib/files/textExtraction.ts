import { inflateRawSync } from "node:zlib";

export interface ParsedFileText {
  text: string;
  fileName: string;
  fileType: "txt" | "pdf" | "docx";
  warnings: string[];
}

export const MAX_FILE_BYTES = 1024 * 1024;

export const PDF_TEXT_UNRECOGNIZABLE_MESSAGE =
  "无法识别该 PDF 中的可提取文字。暂不支持纯图片或扫描版 PDF，请上传含可复制文字的 PDF，或粘贴文字内容。";

export class FileTextExtractionError extends Error {
  constructor(
    public readonly code: "PDF_TEXT_UNRECOGNIZABLE",
    message: string
  ) {
    super(message);
    this.name = "FileTextExtractionError";
  }
}

export function validateFileSize(size: number) {
  if (size <= 0) {
    throw new Error("文件为空。");
  }
  if (size > MAX_FILE_BYTES) {
    throw new Error("文件超过 1MB，请压缩或复制主要内容后再上传。");
  }
}

export function detectSupportedFileType(fileName: string, mimeType: string) {
  const normalizedName = fileName.toLowerCase();
  void mimeType;

  // The extension is authoritative because multipart MIME values are supplied
  // by the client and can be empty or forged.
  if (normalizedName.endsWith(".txt")) return "txt" as const;
  if (normalizedName.endsWith(".pdf")) return "pdf" as const;
  if (normalizedName.endsWith(".docx")) return "docx" as const;

  if (normalizedName.endsWith(".doc")) {
    throw new Error("暂不支持旧版 .doc 二进制文档，请另存为 .docx、.pdf 或 .txt 后上传。");
  }

  throw new Error("仅支持 .txt、.pdf 和 .docx 文件。");
}

export async function extractTextFromFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<ParsedFileText> {
  validateFileSize(buffer.byteLength);
  const fileType = detectSupportedFileType(fileName, mimeType);
  const warnings: string[] = [];
  const text =
    fileType === "txt"
      ? parseTxt(buffer)
      : fileType === "docx"
        ? parseDocx(buffer)
        : await parsePdf(buffer);
  const normalizedText = normalizeExtractedText(text);

  if (normalizedText.length < 10) {
    if (fileType === "pdf") {
      throw new FileTextExtractionError(
        "PDF_TEXT_UNRECOGNIZABLE",
        PDF_TEXT_UNRECOGNIZABLE_MESSAGE
      );
    }
    throw new Error("未能从文件中提取到有效文本，请复制主要内容后粘贴。");
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

async function parsePdf(buffer: Buffer) {
  const header = buffer.subarray(0, 5).toString("latin1");
  if (header !== "%PDF-") {
    throw new Error("PDF 文件头无效。");
  }

  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({
    // Copy the bytes because PDF.js may transfer ownership of its Uint8Array.
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useWorkerFetch: false
  });
  try {
    const result = await parser.getText({ pageJoiner: "\n" });
    return result.text;
  } finally {
    await parser.destroy();
  }
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
