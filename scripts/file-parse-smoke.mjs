import { deflateRawSync } from "node:zlib";

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

function buildPdf(objects) {
  let body = "%PDF-1.7\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
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
