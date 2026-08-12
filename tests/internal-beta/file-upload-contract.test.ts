import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  FileTextExtractionError,
  MAX_FILE_BYTES,
  PDF_TEXT_UNRECOGNIZABLE_MESSAGE,
  detectSupportedFileType,
  extractTextFromFile,
  validateFileSize
} from "../../lib/files/textExtraction";
import { handleFileParsePost } from "../../app/api/files/parse/handler";

function buildPdf(objects: string[]) {
  let body = "%PDF-1.7\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

function makeTextPdf(text: string) {
  const characters = [...text];
  const encoded = characters
    .map((_, index) => (index + 1).toString(16).padStart(4, "0"))
    .join("");
  const mappings = characters
    .map((character, index) => {
      const source = (index + 1).toString(16).padStart(4, "0");
      const target = character.charCodeAt(0).toString(16).padStart(4, "0");
      return `<${source}> <${target}>`;
    })
    .join("\n");
  const cmap = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "/CMapName /PassBuddy-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    `${characters.length} beginbfchar`,
    mappings,
    "endbfchar",
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
    "end"
  ].join("\n");
  const content = `BT /F1 12 Tf 72 720 Td <${encoded}> Tj ET`;
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type0 /BaseFont /PassBuddyChinese /Encoding /Identity-H /DescendantFonts [5 0 R] /ToUnicode 6 0 R >>",
    "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /PassBuddyChinese /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /CIDToGIDMap /Identity >>",
    `<< /Length ${Buffer.byteLength(cmap, "latin1")} >>\nstream\n${cmap}\nendstream`,
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`
  ]);
}

function makeImageOnlyPdf() {
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream"
  ]);
}

test("CV and JD uploads accept TXT, text PDF, or Word docx up to the same 1MB limit", () => {
  assert.equal(MAX_FILE_BYTES, 1024 * 1024);
  assert.equal(detectSupportedFileType("resume.txt", "text/plain"), "txt");
  assert.equal(detectSupportedFileType("resume.pdf", "application/pdf"), "pdf");
  assert.equal(detectSupportedFileType("resume.pdf", "text/plain"), "pdf");
  assert.equal(detectSupportedFileType("resume.txt", "application/pdf"), "txt");
  assert.equal(
    detectSupportedFileType(
      "resume.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ),
    "docx"
  );
  assert.throws(() => detectSupportedFileType("resume.doc", "application/msword"));
  assert.doesNotThrow(() => validateFileSize(MAX_FILE_BYTES));
  assert.throws(() => validateFileSize(MAX_FILE_BYTES + 1), /1MB/);
});

test("text PDF extraction succeeds without OCR", async () => {
  const parsed = await extractTextFromFile(
    makeTextPdf("PDF 简历文本解析测试：负责产品设计与数据分析。"),
    "resume.pdf",
    "application/pdf"
  );

  assert.equal(parsed.fileType, "pdf");
  assert.match(parsed.text, /产品设计与数据分析/);
  assert.deepEqual(parsed.warnings, []);
});

test("image-only PDF is rejected as unrecognizable instead of attempting OCR", async () => {
  await assert.rejects(
    extractTextFromFile(makeImageOnlyPdf(), "scan.pdf", "application/pdf"),
    (error: unknown) => {
      assert.ok(error instanceof FileTextExtractionError);
      assert.equal(error.code, "PDF_TEXT_UNRECOGNIZABLE");
      assert.equal(error.message, PDF_TEXT_UNRECOGNIZABLE_MESSAGE);
      assert.match(error.message, /纯图片或扫描版 PDF/);
      return true;
    }
  );
});

test("file parse handler maps an unrecognizable PDF to a non-retryable HTTP 422", async () => {
  const formData = new FormData();
  formData.append(
    "file",
    new File([makeImageOnlyPdf()], "scan.pdf", { type: "application/pdf" })
  );

  const response = await handleFileParsePost(
    new Request("http://localhost/api/files/parse", {
      method: "POST",
      body: formData
    })
  );
  const payload = (await response.json()) as {
    ok: boolean;
    data: null;
    error: { code: string; message: string; retryable: boolean };
  };

  assert.equal(response.status, 422);
  assert.equal(payload.ok, false);
  assert.equal(payload.data, null);
  assert.equal(payload.error.code, "PDF_TEXT_UNRECOGNIZABLE");
  assert.equal(payload.error.message, PDF_TEXT_UNRECOGNIZABLE_MESSAGE);
  assert.equal(payload.error.retryable, false);
});

test("upload UI advertises and enforces the same file contract", async () => {
  const setup = await readFile("components/setup/SetupPanel.tsx", "utf8");
  const route = await readFile("app/api/files/parse/route.ts", "utf8");

  assert.match(
    setup,
    /您可粘贴至输入框或点击“\+”上传 PDF 或 Word 文档，最大不超过1M。/
  );
  assert.match(setup, /SUPPORTED_UPLOAD_ACCEPT/);
  assert.match(setup, /\.pdf/);
  assert.match(setup, /application\/pdf/);
  assert.match(setup, /normalizedName\.endsWith\("\.pdf"\)/);
  assert.match(setup, /file\.size > MAX_UPLOAD_BYTES/);
  const handler = await readFile("app/api/files/parse/handler.ts", "utf8");
  assert.match(route, /handleFileParsePost/);
  assert.match(handler, /validateFileSize\(file\.size\)/);
});
