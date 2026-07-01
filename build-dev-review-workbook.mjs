import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = path.resolve("outputs", "dev-review");
const outputPath = path.join(outputDir, "开发侧需求评审表.xlsx");

const sheets = [
  {
    name: "01_需产品补充",
    title: "需要产品补充的内容",
    headers: ["类型", "需求点", "当前问题", "对开发的影响", "建议处理"],
    rows: [
      ["需产品补充", "MVP 主链路", "当前同时包含文字、语音、TTS、动效、流式报告，范围偏大", "1 个开发 1 周业余时间交付风险高", "要求产品明确 P0 只保留：输入简历/JD、生成 3 题、文字答题、生成报告、复制答案"],
      ["需产品补充", "功能验收标准", "每个功能只有描述，没有完成标准", "开发无法判断做到什么程度算完成", "要求产品给每个 P0 补充可测试验收条件"],
      ["需产品补充", "报告结构", "只写“雷区”和“AI 嘴替”，没有页面和字段结构", "前端页面和后端返回 schema 无法稳定设计", "要求产品确认报告字段：问题、原回答、诊断、优化答案、复制按钮、总评是否需要"],
      ["需产品补充", "Prompt 输出格式", "题目生成只说 JSON 数组，报告生成没有结构化格式", "LLM 输出不可控，前端解析困难", "要求产品确认固定 JSON schema"],
      ["需产品补充", "异常状态", "没写空输入、模型失败、网络失败、语音失败怎么处理", "容易 Demo 翻车", "要求产品补充失败提示、重试、降级方案"],
      ["需产品补充", "隐私提示", "简历/JD 会传给模型，但文档未说明", "开发需要知道是否展示隐私提示、是否记录日志", "要求产品确认数据处理文案和存储策略"],
      ["需产品补充", "Example 数据", "文档提到 Example 按钮，但没给测试数据", "Demo 需要稳定样例", "要求产品提供一套简历 + JD + 预期面试方向"],
      ["需产品补充", "UI 页面状态", "只有流程描述，没有页面状态", "前端实现需要自行猜状态机", "要求产品补充：输入页、题目页、答题页、报告页、加载页、错误页"],
    ],
  },
  {
    name: "02_需澄清",
    title: "需要产品澄清的问题",
    headers: ["类型", "需求点", "需要澄清的问题", "对开发的影响", "建议产品决策"],
    rows: [
      ["需澄清", "是否必须做语音答题", "Web Speech API 是否作为 P0？", "语音权限、浏览器兼容、识别错误都会增加开发和测试成本", "建议文字答题为 P0，语音为 P1"],
      ["需澄清", "是否必须做 TTS 读题", "TTS 是必须功能还是体验增强？", "TTS 接口/浏览器语音合成兼容性不稳定", "建议 TTS 为 P1，失败不阻断主流程"],
      ["需澄清", "是否必须流式输出", "1.5 秒 TTFT 是否硬性验收？", "Stream 会影响接口设计和前端渲染", "建议 P0 支持加载态，流式为增强；若要求流式则需明确模型和接口"],
      ["需澄清", "前后端架构", "文档说 SPA，但 LLM Key 不能放前端", "影响是否要写后端/API 代理", "建议至少做一个 Serverless/API 代理"],
      ["需澄清", "报告生成时机", "是每题后生成，还是三题后统一生成？", "影响状态管理、接口数量和缓存策略", "建议三题结束后统一生成报告"],
      ["需澄清", "面试官风格作用", "风格影响题目、点评，还是只影响语气？", "影响 Prompt 参数和测试用例", "建议只影响语气和点评风格，不影响核心判断"],
      ["需澄清", "跳过题目", "跳过后报告如何展示？", "需要定义空答案处理", "建议报告中标记“未回答”，不生成嘴替或生成答题建议"],
      ["需澄清", "历史记录", "刷新即消失是否可以接受？", "影响是否需要数据库、本地存储、导出", "MVP 不做历史，只保留复制功能"],
    ],
  },
  {
    name: "03_不合理风险",
    title: "不合理或开发风险较高的需求",
    headers: ["类型", "需求点", "不合理点", "开发风险", "建议调整"],
    rows: [
      ["不合理", "STT 作为 P0", "Web Speech API 在不同浏览器和网络下不稳定", "Demo 现场失败概率高", "降为 P1，保留手动输入主路径"],
      ["不合理", "TTS 作为 P0", "增加接口、加载、权限和兼容性问题", "投入产出比低", "降为 P1 或只做浏览器原生兜底"],
      ["不合理", "1.5 秒 TTFT 硬指标", "受模型、网络、部署环境影响", "开发无法稳定保证", "改成“展示加载态，尽可能流式输出”"],
      ["不合理", "前端直接固化 Prompt/调用 LLM", "API Key 暴露，Prompt 易被复制", "安全和费用风险", "Prompt 放服务端/API 代理"],
      ["不合理", "“完美答案/代写”", "LLM 容易编造用户经历", "生成内容不可控，可能被质疑", "改成“基于真实经历的表达优化稿”"],
      ["不合理", "“面试作弊助手”定位", "容易引发负面观感", "影响 Demo 讲述和 UI 文案", "对外改成“AI 面试教练/表达优化器”"],
      ["不合理", "深色科技风强绑定", "可能影响可读性，也会增加 UI 调试成本", "前端样式成本升高", "保留视觉方向，但优先保证可读性和交付"],
      ["不合理", "1 周内做完整沉浸式体验", "范围超出 1 名开发的稳定交付能力", "主流程质量被拖累", "先做稳定主链路，再加语音/动效"],
    ],
  },
  {
    name: "04_MVP范围",
    title: "建议开发版 MVP 功能范围",
    headers: ["功能", "是否保留", "优先级", "开发实现建议"],
    rows: [
      ["简历/经历输入", "保留", "P0", "textarea，支持 Example 一键填充"],
      ["JD 输入", "保留", "P0", "textarea，支持 Example 一键填充"],
      ["面试官风格", "保留但简化", "P1", "单选 3 项，仅作为 Prompt 参数"],
      ["生成 3 道题", "保留", "P0", "一个接口返回结构化数组"],
      ["文字答题", "保留", "P0", "每题 textarea，可编辑"],
      ["跳过题目", "保留", "P0", "空答案进入下一题，报告中标记"],
      ["语音转文字", "延后", "P1", "有时间再接 Web Speech API"],
      ["TTS 读题", "延后", "P1", "有时间再接浏览器 speechSynthesis"],
      ["进度条", "保留", "P0", "1/3、2/3、3/3"],
      ["报告生成", "保留", "P0", "三题完成后统一生成"],
      ["雷区诊断", "保留", "P0", "每题 1-2 条短评"],
      ["AI 嘴替改写", "保留", "P0", "每题 300 字以内，支持复制"],
      ["流式输出", "可选", "P1", "优先做加载态；有后端能力再流式"],
      ["历史记录", "不做", "P2", "MVP 刷新即失效"],
      ["登录鉴权", "不做", "P2", "Demo 不需要"],
      ["数据库存储", "不做", "P2", "Session/前端状态即可"],
    ],
  },
  {
    name: "05_产品确认清单",
    title: "开发需要产品立即确认的清单",
    headers: ["开发需要产品立即确认的清单", "建议答案"],
    rows: [
      ["P0 是否只做文字主链路？", "是"],
      ["STT/TTS 是否可以降级为 P1？", "是"],
      ["是否需要后端/API 代理？", "是"],
      ["报告是否三题后统一生成？", "是"],
      ["LLM 是否禁止编造经历？", "是"],
      ["Example 简历和 JD 谁提供？", "产品提供"],
      ["报告 JSON schema 谁定？", "产品和开发一起定，开发需要最终版"],
      ["隐私提示文案谁提供？", "产品提供"],
      ["Demo 目标浏览器是什么？", "建议 Chrome"],
      ["部署目标是什么？", "建议 Vercel/Netlify + Serverless API"],
    ],
  },
];

function colLetter(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

function applySheetLayout(sheet, spec) {
  const colCount = spec.headers.length;
  const rowCount = spec.rows.length + 3;
  const lastCol = colLetter(colCount);

  sheet.showGridLines = false;
  sheet.getRange(`A1:${lastCol}1`).merge();
  sheet.getRange("A1").values = [[spec.title]];
  sheet.getRange("A1").format = {
    fill: "#17324D",
    font: { bold: true, color: "#FFFFFF", size: 15 },
    horizontalAlignment: "left",
    verticalAlignment: "center",
  };
  sheet.getRange("A1").format.rowHeight = 30;

  sheet.getRange(`A3:${lastCol}3`).values = [spec.headers];
  sheet.getRange(`A4:${lastCol}${rowCount}`).values = spec.rows;

  sheet.getRange(`A3:${lastCol}3`).format = {
    fill: "#2563EB",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
  };
  sheet.getRange(`A3:${lastCol}${rowCount}`).format = {
    wrapText: true,
    verticalAlignment: "top",
    borders: { preset: "all", style: "thin", color: "#D6DEE8" },
  };
  sheet.getRange(`A4:${lastCol}${rowCount}`).format = {
    fill: "#FFFFFF",
    font: { color: "#1F2937" },
    wrapText: true,
    verticalAlignment: "top",
  };

  sheet.getRange(`A4:A${rowCount}`).format = {
    fill: "#EFF6FF",
    font: { bold: true, color: "#1D4ED8" },
    wrapText: true,
    verticalAlignment: "top",
  };

  const table = sheet.tables.add(`A3:${lastCol}${rowCount}`, true, `Table_${spec.name.replaceAll("_", "")}`);
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;

  const widths = colCount === 2 ? [42, 62] : colCount === 4 ? [24, 16, 12, 68] : [16, 22, 42, 42, 58];
  widths.forEach((width, i) => {
    sheet.getRange(`${colLetter(i + 1)}:${colLetter(i + 1)}`).format.columnWidth = width;
  });
  sheet.getRange(`A4:${lastCol}${rowCount}`).format.rowHeight = 58;
  sheet.freezePanes.freezeRows(3);
}

await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
for (const spec of sheets) {
  const sheet = workbook.worksheets.add(spec.name);
  applySheetLayout(sheet, spec);
}

for (const spec of sheets) {
  const preview = await workbook.render({
    sheetName: spec.name,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(
    path.join(outputDir, `${spec.name}.png`),
    new Uint8Array(await preview.arrayBuffer()),
  );
}

const scan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "final formula error scan",
});
console.log(scan.ndjson);

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(outputPath);
