import { deflateRawSync, deflateSync } from "node:zlib";

const positionalBaseUrl = process.argv.find((item, index) => index > 1 && /^https?:\/\//.test(item));
const baseUrl = positionalBaseUrl ?? process.env.FACEWALL_BASE_URL ?? "http://localhost:3000";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function uploadFile(fileName, mimeType, bytes, expectedText) {
  const formData = new FormData();
  formData.append("file", new Blob([bytes], { type: mimeType }), fileName);
  const response = await fetch(`${baseUrl}/api/files/parse`, {
    method: "POST",
    body: formData
  });
  const body = await response.json();
  assert(response.ok && body.ok, `${fileName} parse failed: ${body.error?.message ?? response.status}`);
  assert(body.data.text.includes(expectedText), `${fileName} parsed text missing "${expectedText}"`);
  return body.data;
}

function makeDocx(text) {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    "<w:body>",
    `<w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`,
    "</w:body>",
    "</w:document>"
  ].join("");
  return makeZip([{ name: "word/document.xml", data: Buffer.from(xml, "utf8") }]);
}

function makePdf(text) {
  const stream = deflateSync(Buffer.from(`BT /F1 12 Tf 72 720 Td <${toUtf16BeHex(text)}> Tj ET`, "latin1"));
  const pdf = [
    "%PDF-1.4\n",
    "1 0 obj\n<< /Length ",
    String(stream.byteLength),
    " /Filter /FlateDecode >>\nstream\n"
  ];
  return Buffer.concat([
    Buffer.from(pdf.join(""), "latin1"),
    stream,
    Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1")
  ]);
}

function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.byteLength, 18);
    localHeader.writeUInt32LE(entry.data.byteLength, 22);
    localHeader.writeUInt16LE(name.byteLength, 26);
    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.byteLength, 20);
    centralHeader.writeUInt32LE(entry.data.byteLength, 24);
    centralHeader.writeUInt16LE(name.byteLength, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.byteLength + name.byteLength + compressed.byteLength;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.byteLength, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapePdfLiteral(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function toUtf16BeHex(value) {
  const bytes = [0xfe, 0xff];
  for (const char of value) {
    const code = char.charCodeAt(0);
    bytes.push((code >> 8) & 0xff, code & 0xff);
  }
  return Buffer.from(bytes).toString("hex").toUpperCase();
}

const txt = await uploadFile(
  "resume.txt",
  "text/plain",
  Buffer.from("候选人简历：AI 产品经理实习，负责用户访谈和 PRD。", "utf8"),
  "用户访谈"
);
const docx = await uploadFile(
  "jd.docx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  makeDocx("目标 JD：需要需求调研、竞品分析和数据复盘。"),
  "竞品分析"
);
const pdf = await uploadFile("sample.pdf", "application/pdf", makePdf("PDF 文本解析测试"), "PDF 文本解析测试");

console.log(
  JSON.stringify(
    {
      ok: true,
      baseUrl,
      checks: ["txt upload parse", "docx upload parse", "pdf upload parse"],
      charCounts: {
        txt: txt.charCount,
        docx: docx.charCount,
        pdf: pdf.charCount
      }
    },
    null,
    2
  )
);
