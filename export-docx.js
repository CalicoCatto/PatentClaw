#!/usr/bin/env node
/**
 * PatentClaw 专利文档导出工具
 * 按照中国国家知识产权局（CNIPA）格式要求生成 .docx 文件
 *
 * 用法：
 *   node export-docx.js <input.json> [output_dir]
 *
 * input.json 格式见底部 SCHEMA 注释
 */

const fs = require("fs");
const path = require("path");
const docx = require("docx");

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, TabStopPosition, TabStopType,
  PageNumber, NumberFormat, Header, Footer,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  convertMillimetersToTwip, SectionType, PageOrientation,
  LevelFormat, UnderlineType,
} = docx;

// ============================================================
// 国知局格式常量
// ============================================================

// A4 纸张 (mm)
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;

// 页边距 (mm) — 国知局要求：上 25.4, 下 25.4, 左 25, 右 25 (装订侧)
const MARGIN_TOP = 25.4;
const MARGIN_BOTTOM = 25.4;
const MARGIN_LEFT = 25;
const MARGIN_RIGHT = 25;

// 字号对照 (半磅为单位, half-point)
const FONT_SIZE = {
  XIAO_ER: 36,    // 小二号 = 18pt
  SAN_HAO: 32,    // 三号 = 16pt
  XIAO_SAN: 30,   // 小三号 = 15pt
  SI_HAO: 28,     // 四号 = 14pt
  XIAO_SI: 24,    // 小四号 = 12pt
  WU_HAO: 21,     // 五号 = 10.5pt
};

// 行距 (twips) — 1.5倍行距约 360 twips
const LINE_SPACING = 360;

// 字体
const FONT_SONG = "宋体";
const FONT_HEI = "黑体";

// ============================================================
// 公用样式工厂
// ============================================================

function sectionProperties() {
  return {
    page: {
      size: {
        width: convertMillimetersToTwip(PAGE_WIDTH_MM),
        height: convertMillimetersToTwip(PAGE_HEIGHT_MM),
        orientation: PageOrientation.PORTRAIT,
      },
      margin: {
        top: convertMillimetersToTwip(MARGIN_TOP),
        bottom: convertMillimetersToTwip(MARGIN_BOTTOM),
        left: convertMillimetersToTwip(MARGIN_LEFT),
        right: convertMillimetersToTwip(MARGIN_RIGHT),
      },
    },
  };
}

/** 文档标题段落（居中，小二号黑体加粗） */
function titleParagraph(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200, line: LINE_SPACING },
    children: [
      new TextRun({
        text,
        bold: true,
        size: FONT_SIZE.XIAO_ER,
        font: { name: FONT_HEI, eastAsia: FONT_HEI },
      }),
    ],
  });
}

/** 一级标题段落（四号黑体加粗） */
function heading1(text) {
  return new Paragraph({
    spacing: { before: 240, after: 120, line: LINE_SPACING },
    children: [
      new TextRun({
        text,
        bold: true,
        size: FONT_SIZE.SI_HAO,
        font: { name: FONT_HEI, eastAsia: FONT_HEI },
      }),
    ],
  });
}

/** 二级标题段落（小四号黑体加粗） */
function heading2(text) {
  return new Paragraph({
    spacing: { before: 160, after: 80, line: LINE_SPACING },
    children: [
      new TextRun({
        text,
        bold: true,
        size: FONT_SIZE.XIAO_SI,
        font: { name: FONT_HEI, eastAsia: FONT_HEI },
      }),
    ],
  });
}

/** 正文段落（小四号宋体，首行缩进 2 字符） */
function bodyParagraph(text, { indent = true, bold = false } = {}) {
  return new Paragraph({
    spacing: { after: 0, line: LINE_SPACING },
    indent: indent ? { firstLine: convertMillimetersToTwip(8.47) } : undefined, // 2字符 ≈ 8.47mm @12pt
    children: [
      new TextRun({
        text,
        size: FONT_SIZE.XIAO_SI,
        bold,
        font: { name: FONT_SONG, eastAsia: FONT_SONG },
      }),
    ],
  });
}

/** 无缩进正文段落 */
function bodyParagraphNoIndent(text, opts = {}) {
  return bodyParagraph(text, { ...opts, indent: false });
}

/** 空行 */
function emptyLine() {
  return new Paragraph({ spacing: { after: 0, line: LINE_SPACING }, children: [] });
}

/** 页脚带页码 */
function pageFooter() {
  return {
    default: new Footer({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              children: [PageNumber.CURRENT],
              size: FONT_SIZE.WU_HAO,
              font: { name: FONT_SONG, eastAsia: FONT_SONG },
            }),
          ],
        }),
      ],
    }),
  };
}

/** 将多行文本按换行切分为段落数组 */
function textToParagraphs(text, opts = {}) {
  if (!text) return [];
  return text.split(/\n/).map(line => {
    const trimmed = line.trim();
    if (trimmed === "") return emptyLine();
    return bodyParagraph(trimmed, opts);
  });
}

// ============================================================
// 文件一：请求书
// ============================================================

function buildRequestDoc(data) {
  const info = data.request || {};
  const rows = [
    ["发明名称", info.title || data.title || ""],
    ["发明人", (info.inventors || []).join("、")],
    ["申请人", info.applicant || ""],
    ["联系人", info.contact || ""],
    ["地址", info.address || ""],
    ["邮编", info.zipCode || ""],
    ["电话", info.phone || ""],
    ["邮箱", info.email || ""],
    ["专利代理机构", info.agency || "【待填写】"],
    ["代理人", info.agent || "【待填写】"],
  ];

  const tableRows = rows.map(([label, value]) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: 2400, type: WidthType.DXA },
          children: [bodyParagraphNoIndent(label, { bold: true })],
          verticalAlign: "center",
        }),
        new TableCell({
          width: { size: 6600, type: WidthType.DXA },
          children: [bodyParagraphNoIndent(value)],
          verticalAlign: "center",
        }),
      ],
    })
  );

  return new Document({
    sections: [{
      properties: {
        ...sectionProperties(),
      },
      footers: pageFooter(),
      children: [
        titleParagraph("发明专利请求书"),
        emptyLine(),
        new Table({ rows: tableRows, width: { size: 9000, type: WidthType.DXA } }),
      ],
    }],
  });
}

// ============================================================
// 文件二：权利要求书
// ============================================================

function buildClaimsDoc(data) {
  const claims = data.claims || [];
  const children = [
    titleParagraph("权利要求书"),
    emptyLine(),
  ];

  claims.forEach((claim, i) => {
    // 权利要求编号与内容
    const num = i + 1;
    const lines = claim.split(/\n/);
    lines.forEach((line, li) => {
      const trimmed = line.trim();
      if (trimmed === "") {
        children.push(emptyLine());
        return;
      }
      const prefix = li === 0 ? `${num}. ` : "";
      children.push(bodyParagraph(`${prefix}${trimmed}`));
    });
    children.push(emptyLine());
  });

  return new Document({
    sections: [{
      properties: sectionProperties(),
      footers: pageFooter(),
      children,
    }],
  });
}

// ============================================================
// 文件三：说明书
// ============================================================

function buildSpecificationDoc(data) {
  const spec = data.specification || {};
  const children = [
    titleParagraph("说  明  书"),
    emptyLine(),
  ];

  // 发明名称
  children.push(heading1("发明名称"));
  children.push(bodyParagraph(spec.title || data.title || ""));
  children.push(emptyLine());

  // 技术领域
  children.push(heading1("技术领域"));
  children.push(...textToParagraphs(spec.technicalField || ""));
  children.push(emptyLine());

  // 背景技术
  children.push(heading1("背景技术"));
  children.push(...textToParagraphs(spec.backgroundArt || ""));
  children.push(emptyLine());

  // 发明内容
  children.push(heading1("发明内容"));

  if (spec.technicalProblem) {
    children.push(heading2("技术问题"));
    children.push(...textToParagraphs(spec.technicalProblem));
    children.push(emptyLine());
  }

  if (spec.technicalSolution) {
    children.push(heading2("技术方案"));
    children.push(...textToParagraphs(spec.technicalSolution));
    children.push(emptyLine());
  }

  if (spec.beneficialEffects) {
    children.push(heading2("有益效果"));
    children.push(...textToParagraphs(spec.beneficialEffects));
    children.push(emptyLine());
  }

  // 附图说明
  if (spec.drawingDescriptions && spec.drawingDescriptions.length > 0) {
    children.push(heading1("附图说明"));
    spec.drawingDescriptions.forEach(desc => {
      children.push(bodyParagraph(desc));
    });
    children.push(emptyLine());
  }

  // 具体实施方式
  children.push(heading1("具体实施方式"));
  children.push(...textToParagraphs(spec.detailedDescription || ""));

  return new Document({
    sections: [{
      properties: sectionProperties(),
      footers: pageFooter(),
      children,
    }],
  });
}

// ============================================================
// 文件四：说明书摘要
// ============================================================

function buildAbstractDoc(data) {
  const abs = data.abstract || {};
  const children = [
    titleParagraph("说明书摘要"),
    emptyLine(),
  ];

  // 发明名称
  children.push(heading1("发明名称"));
  children.push(bodyParagraph(abs.title || data.title || ""));
  children.push(emptyLine());

  // 摘要正文
  children.push(heading1("摘要"));
  children.push(...textToParagraphs(abs.content || ""));
  children.push(emptyLine());

  // 摘要附图
  if (abs.drawingRef) {
    children.push(bodyParagraphNoIndent(`摘要附图：${abs.drawingRef}`, { bold: true }));
  }

  return new Document({
    sections: [{
      properties: sectionProperties(),
      footers: pageFooter(),
      children,
    }],
  });
}

// ============================================================
// 交底书导出
// ============================================================

function buildDisclosureDoc(data) {
  const disc = data.disclosure || {};
  const children = [
    titleParagraph("技术交底书"),
    emptyLine(),
  ];

  // 一、发明名称
  children.push(heading1("一、发明名称"));
  children.push(bodyParagraph(disc.title || data.title || ""));
  children.push(emptyLine());

  // 二、技术领域
  children.push(heading1("二、技术领域"));
  children.push(...textToParagraphs(disc.technicalField || ""));
  children.push(emptyLine());

  // 三、背景技术
  children.push(heading1("三、背景技术"));
  children.push(...textToParagraphs(disc.backgroundArt || ""));
  children.push(emptyLine());

  // 四、发明内容
  children.push(heading1("四、发明内容"));

  if (disc.technicalProblem) {
    children.push(heading2("4.1 要解决的技术问题"));
    children.push(...textToParagraphs(disc.technicalProblem));
    children.push(emptyLine());
  }

  if (disc.technicalSolution) {
    children.push(heading2("4.2 技术方案"));
    children.push(...textToParagraphs(disc.technicalSolution));
    children.push(emptyLine());
  }

  if (disc.keyFeatures && disc.keyFeatures.length > 0) {
    children.push(heading2("4.3 关键技术特征"));
    disc.keyFeatures.forEach((f, i) => {
      children.push(bodyParagraphNoIndent(`特征${i + 1}：${f}`));
    });
    children.push(emptyLine());
  }

  if (disc.beneficialEffects) {
    children.push(heading2("4.4 有益效果"));
    children.push(...textToParagraphs(disc.beneficialEffects));
    children.push(emptyLine());
  }

  // 五、附图及附图说明
  if (disc.drawings && disc.drawings.length > 0) {
    children.push(heading1("五、附图及附图说明"));
    disc.drawings.forEach(d => {
      children.push(bodyParagraphNoIndent(d));
    });
    children.push(emptyLine());
  }

  // 六、具体实施方式
  if (disc.detailedDescription) {
    children.push(heading1("六、具体实施方式"));
    children.push(...textToParagraphs(disc.detailedDescription));
    children.push(emptyLine());
  }

  // 七、替代方案
  if (disc.alternatives) {
    children.push(heading1("七、替代方案"));
    children.push(...textToParagraphs(disc.alternatives));
  }

  return new Document({
    sections: [{
      properties: sectionProperties(),
      footers: pageFooter(),
      children,
    }],
  });
}

// ============================================================
// 主入口
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error(`用法: node export-docx.js <input.json> [output_dir]

input.json 应包含以下结构（按需提供）:
{
  "title": "发明名称",
  "mode": "disclosure" | "full",   // disclosure=仅交底书, full=四件套
  "disclosure": { ... },           // 交底书数据
  "request": { ... },              // 请求书数据
  "claims": [ ... ],               // 权利要求（字符串数组）
  "specification": { ... },        // 说明书数据
  "abstract": { ... }              // 摘要数据
}`);
    process.exit(1);
  }

  const inputPath = path.resolve(args[0]);
  const outputDir = args[1] ? path.resolve(args[1]) : path.dirname(inputPath);

  if (!fs.existsSync(inputPath)) {
    console.error(`错误: 文件不存在 ${inputPath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const mode = data.mode || "full";
  const baseName = (data.title || "patent").replace(/[\\/:*?"<>|]/g, "_");

  fs.mkdirSync(outputDir, { recursive: true });

  const results = [];

  if (mode === "disclosure" || data.disclosure) {
    const doc = buildDisclosureDoc(data);
    const outPath = path.join(outputDir, `${baseName}_技术交底书.docx`);
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outPath, buffer);
    results.push(outPath);
    console.log(`✓ 技术交底书 → ${outPath}`);
  }

  if (mode === "full") {
    // 请求书
    if (data.request) {
      const doc = buildRequestDoc(data);
      const outPath = path.join(outputDir, `${baseName}_请求书.docx`);
      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(outPath, buffer);
      results.push(outPath);
      console.log(`✓ 请求书 → ${outPath}`);
    }

    // 权利要求书
    if (data.claims && data.claims.length > 0) {
      const doc = buildClaimsDoc(data);
      const outPath = path.join(outputDir, `${baseName}_权利要求书.docx`);
      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(outPath, buffer);
      results.push(outPath);
      console.log(`✓ 权利要求书 → ${outPath}`);
    }

    // 说明书
    if (data.specification) {
      const doc = buildSpecificationDoc(data);
      const outPath = path.join(outputDir, `${baseName}_说明书.docx`);
      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(outPath, buffer);
      results.push(outPath);
      console.log(`✓ 说明书 → ${outPath}`);
    }

    // 说明书摘要
    if (data.abstract) {
      const doc = buildAbstractDoc(data);
      const outPath = path.join(outputDir, `${baseName}_说明书摘要.docx`);
      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(outPath, buffer);
      results.push(outPath);
      console.log(`✓ 说明书摘要 → ${outPath}`);
    }
  }

  console.log(`\n共导出 ${results.length} 个文件到 ${outputDir}`);

  // 输出结果 JSON 供调用方解析
  console.log(`\n__RESULT__${JSON.stringify({ files: results })}__RESULT__`);
}

main().catch(err => {
  console.error("导出失败:", err.message);
  process.exit(1);
});

/*
 * ============================================================
 * INPUT JSON SCHEMA
 * ============================================================
 *
 * {
 *   "title": "一种基于XXX的方法",
 *   "mode": "disclosure" | "full",
 *
 *   "disclosure": {
 *     "title": "发明名称",
 *     "technicalField": "技术领域描述",
 *     "backgroundArt": "背景技术\n多段文字用换行分隔",
 *     "technicalProblem": "要解决的技术问题",
 *     "technicalSolution": "技术方案详述",
 *     "keyFeatures": ["特征1描述", "特征2描述"],
 *     "beneficialEffects": "有益效果",
 *     "drawings": ["图1：XXX示意图", "图2：XXX流程图"],
 *     "detailedDescription": "具体实施方式",
 *     "alternatives": "替代方案"
 *   },
 *
 *   "request": {
 *     "title": "发明名称",
 *     "inventors": ["张三", "李四"],
 *     "applicant": "XX大学",
 *     "contact": "张三",
 *     "address": "XX省XX市XX路XX号",
 *     "zipCode": "100000",
 *     "phone": "010-12345678",
 *     "email": "xxx@example.com",
 *     "agency": "XX专利代理事务所",
 *     "agent": "王五"
 *   },
 *
 *   "claims": [
 *     "一种XXX方法，其特征在于，包括以下步骤：\n步骤一：...\n步骤二：...",
 *     "根据权利要求1所述的方法，其特征在于，所述步骤一中..."
 *   ],
 *
 *   "specification": {
 *     "title": "发明名称",
 *     "technicalField": "技术领域",
 *     "backgroundArt": "背景技术",
 *     "technicalProblem": "技术问题",
 *     "technicalSolution": "技术方案",
 *     "beneficialEffects": "有益效果",
 *     "drawingDescriptions": ["图1是...的结构示意图；", "图2是...的流程图；"],
 *     "detailedDescription": "具体实施方式"
 *   },
 *
 *   "abstract": {
 *     "title": "发明名称",
 *     "content": "摘要正文（300字以内）",
 *     "drawingRef": "图1"
 *   }
 * }
 */
