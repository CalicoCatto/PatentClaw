#!/usr/bin/env node
/**
 * 将 PatentClaw 项目说明书 (project-manual.md) 转换为美观的 .docx 文件
 */

const fs = require("fs");
const path = require("path");
const docx = require(path.join(__dirname, "../node_modules/docx"));

const {
  Document, Packer, Paragraph, TextRun, ImageRun,
  AlignmentType, PageNumber, Footer, Header,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  convertMillimetersToTwip, PageOrientation,
  ShadingType, HeadingLevel, TableOfContents,
} = docx;

// ── 样式常量 ──
const MARGIN = 25.4;
const COLOR_PRIMARY = "1a56db";   // 深蓝
const COLOR_ACCENT = "2563eb";    // 亮蓝
const COLOR_LIGHT = "eff6ff";     // 浅蓝底
const COLOR_BORDER = "bfdbfe";    // 边框蓝
const COLOR_TEXT = "1e293b";      // 深灰文字
const COLOR_MUTED = "64748b";     // 次要文字
const FONT_TITLE = "微软雅黑";
const FONT_BODY = "微软雅黑";
const FONT_CODE = "Consolas";

// ── 工厂函数 ──

function coverTitle(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 2400, after: 200 },
    children: [new TextRun({ text, bold: true, size: 52, color: COLOR_PRIMARY, font: { name: FONT_TITLE, eastAsia: FONT_TITLE } })],
  });
}

function coverSubtitle(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text, size: 28, color: COLOR_ACCENT, font: { name: FONT_TITLE, eastAsia: FONT_TITLE } })],
  });
}

function coverMeta(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 22, color: COLOR_MUTED, font: { name: FONT_BODY, eastAsia: FONT_BODY } })],
  });
}

function divider() {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_BORDER } },
    children: [],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_ACCENT } },
    children: [new TextRun({ text, bold: true, size: 36, color: COLOR_PRIMARY, font: { name: FONT_TITLE, eastAsia: FONT_TITLE } })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, bold: true, size: 28, color: COLOR_ACCENT, font: { name: FONT_TITLE, eastAsia: FONT_TITLE } })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, color: COLOR_TEXT, font: { name: FONT_TITLE, eastAsia: FONT_TITLE } })],
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 360 },
    indent: opts.indent !== false ? { firstLine: convertMillimetersToTwip(7) } : undefined,
    children: parseInlineFormatting(text, opts),
  });
}

function bodyNoIndent(text, opts = {}) {
  return body(text, { ...opts, indent: false });
}

function bullet(text, level = 0) {
  return new Paragraph({
    spacing: { after: 80, line: 340 },
    indent: { left: convertMillimetersToTwip(7 + level * 5), hanging: convertMillimetersToTwip(3) },
    children: [
      new TextRun({ text: "  •  ", size: 22, color: COLOR_ACCENT, font: { name: FONT_BODY, eastAsia: FONT_BODY } }),
      ...parseInlineFormatting(text),
    ],
  });
}

function numberedItem(num, text) {
  return new Paragraph({
    spacing: { after: 80, line: 340 },
    indent: { left: convertMillimetersToTwip(7), hanging: convertMillimetersToTwip(5) },
    children: [
      new TextRun({ text: `${num}.  `, bold: true, size: 22, color: COLOR_ACCENT, font: { name: FONT_BODY, eastAsia: FONT_BODY } }),
      ...parseInlineFormatting(text),
    ],
  });
}

function codeBlock(lines) {
  const children = [];
  for (const line of lines) {
    children.push(new Paragraph({
      spacing: { after: 0, line: 280 },
      indent: { left: convertMillimetersToTwip(5) },
      shading: { type: ShadingType.CLEAR, fill: "f1f5f9" },
      children: [new TextRun({ text: line || " ", size: 18, color: "334155", font: { name: FONT_CODE } })],
    }));
  }
  return children;
}

function emptyLine() {
  return new Paragraph({ spacing: { after: 60 }, children: [] });
}

/** 解析行内加粗和代码 */
function parseInlineFormatting(text, opts = {}) {
  const runs = [];
  const baseSize = opts.size || 22;
  // 分割 **bold** 和 `code`
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index), size: baseSize, color: COLOR_TEXT, font: { name: FONT_BODY, eastAsia: FONT_BODY } }));
    }
    if (match[2]) { // bold
      runs.push(new TextRun({ text: match[2], bold: true, size: baseSize, color: COLOR_TEXT, font: { name: FONT_BODY, eastAsia: FONT_BODY } }));
    } else if (match[3]) { // code
      runs.push(new TextRun({ text: match[3], size: baseSize - 2, color: COLOR_ACCENT, font: { name: FONT_CODE }, shading: { type: ShadingType.CLEAR, fill: "f1f5f9" } }));
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex), size: baseSize, color: COLOR_TEXT, font: { name: FONT_BODY, eastAsia: FONT_BODY } }));
  }
  if (runs.length === 0) {
    runs.push(new TextRun({ text, size: baseSize, color: COLOR_TEXT, font: { name: FONT_BODY, eastAsia: FONT_BODY } }));
  }
  return runs;
}

/** 表格 */
function makeTable(headers, rows) {
  const colCount = headers.length;
  const colWidth = Math.floor(9000 / colCount);

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(h => new TableCell({
      width: { size: colWidth, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: COLOR_PRIMARY },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 60 },
        children: [new TextRun({ text: h, bold: true, size: 20, color: "ffffff", font: { name: FONT_BODY, eastAsia: FONT_BODY } })],
      })],
      verticalAlign: "center",
    })),
  });

  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map(cell => new TableCell({
      width: { size: colWidth, type: WidthType.DXA },
      shading: ri % 2 === 0 ? { type: ShadingType.CLEAR, fill: COLOR_LIGHT } : undefined,
      children: [new Paragraph({
        spacing: { before: 40, after: 40 },
        indent: { left: convertMillimetersToTwip(1) },
        children: parseInlineFormatting(cell, { size: 20 }),
      })],
      verticalAlign: "center",
    })),
  }));

  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    rows: [headerRow, ...dataRows],
  });
}

// ── 内容构建 ──

function buildDocument() {
  const children = [];

  // ═══════ 封面 ═══════
  children.push(emptyLine());
  children.push(emptyLine());
  children.push(emptyLine());
  children.push(coverTitle("PatentClaw"));
  children.push(coverSubtitle("专 利 龙 虾"));
  children.push(emptyLine());
  children.push(divider());
  children.push(coverSubtitle("项 目 说 明 书"));
  children.push(emptyLine());
  children.push(coverMeta("基于多 Agent 编排的中国发明专利申请文件自动生成系统"));
  children.push(emptyLine());
  children.push(emptyLine());
  children.push(coverMeta("版本 2.0.0"));
  children.push(coverMeta("2026 年 3 月"));
  children.push(emptyLine());
  children.push(coverMeta("https://github.com/CalicoCatto/PatentClaw"));

  // ═══════ 目录页 ═══════
  children.push(new Paragraph({ children: [], pageBreakBefore: true }));
  children.push(h1("目  录"));
  children.push(emptyLine());
  const tocItems = [
    "一、项目概述",
    "二、系统架构",
    "三、工作流程",
    "四、一致性检查引擎",
    "五、文档导出规范",
    "六、项目结构",
    "七、安装与部署",
    "八、使用指南",
    "九、设计原则",
    "十、许可证",
  ];
  tocItems.forEach((item, i) => {
    children.push(bodyNoIndent(item));
  });

  // ═══════ 一、项目概述 ═══════
  children.push(new Paragraph({ children: [], pageBreakBefore: true }));
  children.push(h1("一、项目概述"));

  children.push(h2("1.1 项目定位"));
  children.push(body("PatentClaw 是一个运行在 OpenClaw 平台上的 AI Skill，专门面向**中国发明专利申请**场景。它解决科研人员在专利撰写中面临的核心痛点："));
  children.push(bullet("从学术论文到专利文件的**思维模式转换**（论文追求公开复现，专利追求抽象保护）"));
  children.push(bullet("权利要求书与说明书之间的**术语一致性**维护"));
  children.push(bullet("权利要求**保护范围策略**的选择与权衡"));
  children.push(bullet("符合国家知识产权局（CNIPA）排版规范的**格式化输出**"));

  children.push(h2("1.2 核心能力"));
  children.push(emptyLine());
  children.push(makeTable(
    ["能力", "说明"],
    [
      ["论文解析与上位化", "自动从学术论文中提取技术方案，抽象为专利语言"],
      ["多策略权利要求生成", "并行生成宽保护、稳妥、窄保护 3 套策略供用户选择"],
      ["现有技术检索", "自动搜索相关专利和论文，评估新颖性风险"],
      ["术语一致性审校", "6 类检查规则，自动修复术语不一致"],
      ["国知局格式导出", "输出符合 CNIPA 排版要求的 .docx 文件"],
    ]
  ));

  children.push(h2("1.3 适用场景"));
  children.push(bullet("高校科研团队将论文成果转化为专利申请"));
  children.push(bullet("企业研发部门批量撰写技术交底书"));
  children.push(bullet("专利代理机构辅助初稿生成"));
  children.push(bullet("个人发明人快速生成专利申请文件初稿"));

  // ═══════ 二、系统架构 ═══════
  children.push(new Paragraph({ children: [], pageBreakBefore: true }));
  children.push(h1("二、系统架构"));

  children.push(h2("2.1 整体架构"));
  children.push(body("PatentClaw 采用**编排器 + 4 个专业子 Agent** 的多 Agent 协作架构，基于 OpenClaw 的 `sessions_spawn` 原生子 Agent 能力实现。"));
  children.push(emptyLine());
  children.push(...codeBlock([
    "  ┌─────────────────────────────────────────┐",
    "  │          PatentClaw 编排器 (SKILL.md)     │",
    "  │                                          │",
    "  │  Phase 1 ──→ Phase 3 ──→ Phase 5         │",
    "  │  交互分析     用户决策     导出交付         │",
    "  │     │            ▲           ▲            │",
    "  │     ▼            │           │            │",
    "  │  Phase 2      Phase 4                     │",
    "  │  并行生成      自动审校                     │",
    "  └────┬──────────────┬───────────────────────┘",
    "       │              │",
    "       ▼              ▼",
    "  sessions_spawn  sessions_spawn",
    "   ┌──┬──┬──┐     ┌──────┐",
    "   │A ││B ││C │    │  D   │",
    "   └──┘└──┘└──┘    └──────┘",
    "",
    "  A = 权利要求策略师    C = 现有技术检索员",
    "  B = 说明书撰写师      D = 审校修复师",
  ]));

  children.push(h2("2.2 技术栈"));
  children.push(emptyLine());
  children.push(makeTable(
    ["层级", "技术"],
    [
      ["AI 平台", "OpenClaw Agent Platform"],
      ["子 Agent 调度", "sessions_spawn 原生工具"],
      ["一致性检查", "check-consistency.js（Node.js，正则 + 相似度算法）"],
      ["文档导出", "export-docx.js（Node.js + docx 库）"],
      ["网络搜索", "web_search 工具（现有技术检索员使用）"],
    ]
  ));

  children.push(h2("2.3 子 Agent 通信协议"));
  children.push(body("各子 Agent 通过在输出中嵌入带标记的 JSON 数据与编排器通信："));
  children.push(emptyLine());
  children.push(makeTable(
    ["子 Agent", "输出标记"],
    [
      ["权利要求策略师", "__CLAIMS_RESULT__{...}__CLAIMS_RESULT__"],
      ["说明书撰写师", "__SPEC_RESULT__{...}__SPEC_RESULT__"],
      ["现有技术检索员", "__PRIOR_ART_RESULT__{...}__PRIOR_ART_RESULT__"],
      ["审校修复师", "__FIXED_RESULT__{...}__FIXED_RESULT__"],
    ]
  ));

  // ═══════ 三、工作流程 ═══════
  children.push(new Paragraph({ children: [], pageBreakBefore: true }));
  children.push(h1("三、工作流程"));

  children.push(h2("3.1 模式一：论文 → 技术交底书"));
  children.push(body("此模式由编排器直接处理，无需子 Agent 参与。按以下四步执行："));
  children.push(numberedItem(1, "**论文解析** — 提取标题、作者、技术背景、方案、实验结果、附图"));
  children.push(numberedItem(2, "**创新点识别** — 提炼 2-5 个核心创新点"));
  children.push(numberedItem(3, "**上位化改写** — 具体描述抽象为上位概念（提供宽保护版 + 稳妥版）"));
  children.push(numberedItem(4, "**生成交底书** — 输出结构化技术交底书并导出 .docx"));

  children.push(h3("上位化改写示例"));
  children.push(emptyLine());
  children.push(makeTable(
    ["论文原文", "上位化表述"],
    [
      ["使用 220nm SOI 平台", "基于绝缘体上半导体平台"],
      ["微环谐振器", "基于谐振结构的波长选择单元"],
      ["采用 ResNet-50 网络", "采用深度卷积神经网络"],
      ["使用 COMSOL 进行仿真", "通过数值仿真验证"],
    ]
  ));

  children.push(h2("3.2 模式二：交底书 → 专利四件套"));
  children.push(body("此模式采用多 Agent 并行编排，分 5 个阶段执行："));

  children.push(h3("Phase 1：前置准备"));
  children.push(body("编排器与用户交互，收集发明人、申请人、联系地址、电话、邮箱、代理机构等必要信息。系统绝不自行编造任何身份信息。"));

  children.push(h3("Phase 2：并行生成"));
  children.push(body("编排器同时 spawn 3 个子 Agent 并行工作，各自拥有独立的上下文窗口："));
  children.push(bullet("**Agent A 权利要求策略师** — 生成宽保护/稳妥/窄保护 3 套权利要求策略"));
  children.push(bullet("**Agent B 说明书撰写师** — 撰写完整说明书 + 说明书摘要"));
  children.push(bullet("**Agent C 现有技术检索员** — 搜索相关专利和论文，输出查新报告"));

  children.push(h3("Phase 3：用户决策"));
  children.push(body("编排器汇总结果，向用户展示查新报告和 3 套策略对比："));
  children.push(emptyLine());
  children.push(makeTable(
    ["维度", "宽保护", "稳妥保护", "窄保护"],
    [
      ["独立权利要求特征数", "1-2 个", "3-4 个", "5-6 个"],
      ["从属权利要求数", "3-4 条", "4-6 条", "2-3 条"],
      ["保护范围", "最大", "适中", "较小"],
      ["授权可能性", "较低", "较高", "最高"],
    ]
  ));
  children.push(body("结合查新结果给出综合建议，用户选择后编排器组装完整的四件套。"));

  children.push(h3("Phase 4：自动审校"));
  children.push(body("编排器 spawn 审校修复师，自动运行 `check-consistency.js` 一致性检查，修复 error 和 warning 级别问题，最多迭代 3 轮直到 error 为 0。"));

  children.push(h3("Phase 5：导出交付"));
  children.push(numberedItem(1, "展示修复报告摘要（检查轮数、已修复项、剩余警告）"));
  children.push(numberedItem(2, "展示最终四件套 Markdown"));
  children.push(numberedItem(3, "调用 `export-docx.js` 导出国知局格式 .docx 文件"));
  children.push(numberedItem(4, "提醒用户提交前须经专利代理师审核"));

  // ═══════ 四、一致性检查引擎 ═══════
  children.push(new Paragraph({ children: [], pageBreakBefore: true }));
  children.push(h1("四、一致性检查引擎"));

  children.push(h2("4.1 检查规则"));
  children.push(emptyLine());
  children.push(makeTable(
    ["编号", "检查类型", "级别", "说明"],
    [
      ["C1", "term_inconsistency", "error", "权利要求书与说明书使用不同术语描述同一概念"],
      ["C2", "claim_overlap", "error", "从属权利要求的附加特征与独立权利要求重复"],
      ["C3", "claim_ref_forward", "error", "从属权利要求引用了编号更大的权利要求"],
      ["C4", "claim_ref_invalid", "error", "引用了不存在的权利要求编号"],
      ["C5", "abstract_too_long", "error", "说明书摘要超过 300 字"],
      ["W1", "term_missing_in_spec", "warning", "权利要求中的术语在说明书中未出现"],
      ["W2", "spec_insufficient_coverage", "warning", "说明书对权利要求特征覆盖不足"],
      ["W3", "claim_near_overlap", "warning", "从属权利要求与独立权利要求高度相似"],
      ["W4", "independent_claim_narrow", "warning", "独立权利要求限定特征过多"],
      ["W5", "independent_claim_too_specific", "warning", "独立权利要求含具体数值参数"],
      ["W6", "dependent_claims_overlap", "warning", "两条从属权利要求附加特征相似"],
      ["I1", "abstract_no_drawing", "info", "摘要未指定摘要附图"],
    ]
  ));

  children.push(h2("4.2 智能过滤"));
  children.push(body("内置专利法律套话停用词表，避免将结构性短语误判为术语不一致。包括：「其特征在于」「根据权利要求」「包括以下步骤」「本发明涉及」「本领域技术人员」等。"));

  children.push(h2("4.3 相似度算法"));
  children.push(body("使用基于公共子串的相似度计算，配合字符重叠率判断，识别近义替换："));
  children.push(bullet("「全局池化」vs「全局平均池化」→ 相似度 0.75 → 标记为术语不一致"));
  children.push(bullet("「卷积神经网络」vs「深度学习模型」→ 相似度 0.2 → 不标记"));

  // ═══════ 五、文档导出规范 ═══════
  children.push(new Paragraph({ children: [], pageBreakBefore: true }));
  children.push(h1("五、文档导出规范"));

  children.push(h2("5.1 CNIPA 排版要求"));
  children.push(emptyLine());
  children.push(makeTable(
    ["要素", "规范"],
    [
      ["纸张", "A4（210mm x 297mm）"],
      ["页边距", "上下 25.4mm，左右 25mm"],
      ["文档标题", "小二号（18pt）黑体加粗，居中"],
      ["一级标题", "四号（14pt）黑体加粗"],
      ["二级标题", "小四号（12pt）黑体加粗"],
      ["正文", "小四号（12pt）宋体"],
      ["首行缩进", "2 字符（约 8.47mm）"],
      ["行距", "1.5 倍（360 twips）"],
      ["页码", "页脚居中，五号宋体"],
    ]
  ));

  children.push(h2("5.2 输出文件"));
  children.push(emptyLine());
  children.push(makeTable(
    ["文件", "模式", "说明"],
    [
      ["{名称}_技术交底书.docx", "模式一", "技术交底书"],
      ["{名称}_请求书.docx", "模式二", "发明专利请求书"],
      ["{名称}_权利要求书.docx", "模式二", "权利要求书"],
      ["{名称}_说明书.docx", "模式二", "说明书（含附图说明）"],
      ["{名称}_说明书摘要.docx", "模式二", "说明书摘要"],
    ]
  ));

  // ═══════ 六、项目结构 ═══════
  children.push(new Paragraph({ children: [], pageBreakBefore: true }));
  children.push(h1("六、项目结构"));
  children.push(emptyLine());
  children.push(...codeBlock([
    "PatentClaw/",
    "│",
    "├── SKILL.md                     # 核心：编排器定义",
    "│",
    "├── check-consistency.js         # 工具：术语一致性检查引擎",
    "├── export-docx.js               # 工具：国知局格式 .docx 导出",
    "│",
    "├── prompts/                     # 子 Agent Prompt 模板",
    "│   ├── claims-strategist.md     #   权利要求策略师",
    "│   ├── spec-writer.md           #   说明书撰写师",
    "│   ├── prior-art-scout.md       #   现有技术检索员",
    "│   └── review-fixer.md          #   审校修复师",
    "│",
    "├── docs/                        # 文档",
    "│   ├── architecture.md          #   架构文档",
    "│   └── project-manual.md        #   项目说明书",
    "│",
    "├── example/",
    "│   └── input-example.json       # 输入数据示例",
    "│",
    "├── package.json                 # Node.js 依赖",
    "├── LICENSE                      # MIT 许可证",
    "└── README.md                    # 自述文件",
  ]));

  // ═══════ 七、安装与部署 ═══════
  children.push(new Paragraph({ children: [], pageBreakBefore: true }));
  children.push(h1("七、安装与部署"));

  children.push(h2("7.1 环境要求"));
  children.push(bullet("OpenClaw >= 2026.3.2"));
  children.push(bullet("Node.js >= 18"));
  children.push(bullet("已配置的 AI 模型（通过 OpenClaw 模型管理）"));

  children.push(h2("7.2 安装步骤"));
  children.push(emptyLine());
  children.push(...codeBlock([
    "# 1. 进入 OpenClaw workspace 的 skills 目录",
    "cd ~/.openclaw/workspace",
    "mkdir -p skills && cd skills",
    "",
    "# 2. 克隆项目",
    "git clone https://github.com/CalicoCatto/PatentClaw.git patent-claw",
    "",
    "# 3. 安装依赖",
    "cd patent-claw && npm install",
  ]));

  children.push(h2("7.3 验证安装"));
  children.push(body('通过 OpenClaw 对话发送包含触发词的消息（如"帮我写个专利"），如果龙虾进入 PatentClaw 模式则安装成功。'));

  // ═══════ 八、使用指南 ═══════
  children.push(new Paragraph({ children: [], pageBreakBefore: true }));
  children.push(h1("八、使用指南"));

  children.push(h2("8.1 模式一：从论文生成交底书"));
  children.push(emptyLine());
  children.push(...codeBlock([
    "用户：这篇论文要申请专利",
    "     [粘贴论文内容 / 发送 PDF]",
    "",
    "龙虾：我已阅读论文，以下是我的理解摘要：",
    "     ...（展示摘要）请确认是否正确？",
    "",
    "用户：正确，继续",
    "",
    "龙虾：识别到以下创新点：",
    "     1. ...",
    "     2. ...",
    "",
    "用户：用稳妥版",
    "",
    "龙虾：技术交底书初稿已生成。",
    "     文件已导出到 ~/.openclaw/workspace/patent-output/",
  ]));

  children.push(h2("8.2 模式二：从交底书生成四件套"));
  children.push(emptyLine());
  children.push(...codeBlock([
    "用户：继续生成四件套",
    "     发明人：张三、李四",
    "     申请人：XX理工大学",
    "     地址：北京市海淀区XX路XX号 100080",
    "     电话：010-88888888",
    "",
    "龙虾：正在并行启动 3 个专业子 Agent...",
    "     ├── 权利要求策略师：生成 3 套保护策略",
    "     ├── 说明书撰写师：撰写说明书和摘要",
    "     └── 现有技术检索员：检索相关专利和论文",
    "",
    "龙虾：【查新报告】整体新颖性评估：较高",
    "     【3 套策略对比】",
    "     请选择：(1) 宽保护 (2) 稳妥 (3) 窄保护",
    "",
    "用户：选 2",
    "",
    "龙虾：【审校报告】已修复 3 个术语不一致",
    "     .docx 文件已导出。",
    "     以上为初稿，建议交由专利代理人审核。",
  ]));

  children.push(h2("8.3 单独使用工具脚本"));
  children.push(emptyLine());
  children.push(...codeBlock([
    "# 一致性检查",
    "node check-consistency.js input.json",
    "",
    "# 导出 .docx",
    "node export-docx.js input.json output_dir/",
  ]));

  // ═══════ 九、设计原则 ═══════
  children.push(new Paragraph({ children: [], pageBreakBefore: true }));
  children.push(h1("九、设计原则"));

  children.push(h2("9.1 专利思维优先"));
  children.push(body("PatentClaw 始终以**最大化保护范围**为目标进行撰写，而非以论文的**完整公开复现**为目标。体现在："));
  children.push(bullet("上位化改写：将具体实现抽象为功能性描述"));
  children.push(bullet("多策略生成：提供不同保护范围的选择"));
  children.push(bullet("独立权利要求精简化：只包含最核心的区别特征"));

  children.push(h2("9.2 绝不编造"));
  children.push(body('系统绝不自行编造发明人、申请人、代理机构等身份信息。所有此类信息必须由用户提供，缺失时明确标注"待填写"。'));

  children.push(h2("9.3 初稿定位"));
  children.push(body("PatentClaw 生成的所有文件均为初稿。每次输出完成后都会提醒用户：最终提交前须经持证专利代理师审核。"));

  // ═══════ 十、许可证 ═══════
  children.push(emptyLine());
  children.push(divider());
  children.push(h1("十、许可证"));
  children.push(body("本项目基于 MIT 许可证开源。"));
  children.push(emptyLine());
  children.push(coverMeta("PatentClaw — 专利龙虾 v2.0.0"));
  children.push(coverMeta("Copyright (c) 2026 CalicoCatto"));

  return children;
}

// ── 主入口 ──

async function main() {
  const children = buildDocument();

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { size: 22, color: COLOR_TEXT, font: { name: FONT_BODY, eastAsia: FONT_BODY } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: {
            width: convertMillimetersToTwip(210),
            height: convertMillimetersToTwip(297),
            orientation: PageOrientation.PORTRAIT,
          },
          margin: {
            top: convertMillimetersToTwip(MARGIN),
            bottom: convertMillimetersToTwip(MARGIN),
            left: convertMillimetersToTwip(MARGIN),
            right: convertMillimetersToTwip(MARGIN),
          },
        },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "PatentClaw 项目说明书  |  第 ", size: 18, color: COLOR_MUTED, font: { name: FONT_BODY, eastAsia: FONT_BODY } }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: COLOR_MUTED, font: { name: FONT_BODY, eastAsia: FONT_BODY } }),
              new TextRun({ text: " 页", size: 18, color: COLOR_MUTED, font: { name: FONT_BODY, eastAsia: FONT_BODY } }),
            ],
          })],
        }),
      },
      children,
    }],
  });

  const outPath = path.join(__dirname, "PatentClaw_项目说明书.docx");
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buffer);
  console.log(`✓ 项目说明书已导出 → ${outPath}`);
}

main().catch(err => { console.error("导出失败:", err); process.exit(1); });
