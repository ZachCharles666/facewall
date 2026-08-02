import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MAX_FILE_BYTES,
  detectSupportedFileType,
  validateFileSize
} from "../../lib/files/textExtraction";

test("CV and JD uploads accept only TXT or Word docx up to 1MB", () => {
  assert.equal(MAX_FILE_BYTES, 1024 * 1024);
  assert.equal(detectSupportedFileType("resume.txt", "text/plain"), "txt");
  assert.equal(
    detectSupportedFileType(
      "resume.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ),
    "docx"
  );
  assert.throws(() => detectSupportedFileType("resume.pdf", "application/pdf"));
  assert.throws(() => detectSupportedFileType("resume.pdf", "text/plain"));
  assert.throws(() => detectSupportedFileType("resume.doc", "application/msword"));
  assert.doesNotThrow(() => validateFileSize(MAX_FILE_BYTES));
  assert.throws(() => validateFileSize(MAX_FILE_BYTES + 1), /1MB/);
});

test("upload UI advertises and enforces the same file contract", async () => {
  const setup = await readFile("components/setup/SetupPanel.tsx", "utf8");
  const route = await readFile("app/api/files/parse/route.ts", "utf8");

  assert.match(
    setup,
    /您可粘贴至输入框或点击“\+”上传word 文档 最大不超过1M。/
  );
  assert.match(setup, /SUPPORTED_UPLOAD_ACCEPT/);
  assert.doesNotMatch(setup, /\.pdf,\.docx|application\/pdf/);
  assert.match(setup, /file\.size > MAX_UPLOAD_BYTES/);
  assert.match(route, /validateFileSize\(file\.size\)/);
});
