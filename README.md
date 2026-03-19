# PatentClaw - 专利龙虾

一个基于 [OpenClaw](https://github.com/nicepkg/openclaw) 的 AI Skill，专为**中国发明专利申请文件**自动生成而设计。

从学术论文到技术交底书，从交底书到专利四件套（请求书、权利要求书、说明书、说明书摘要），PatentClaw 覆盖专利撰写全流程，并自动进行术语一致性检查，最终导出符合国家知识产权局（CNIPA）排版要求的 `.docx` 文件。

## 功能特性

### 两种工作模式

**模式一：论文 → 技术交底书**

提供一篇学术论文，PatentClaw 自动完成：
- 论文解析与创新点识别
- 上位化改写（宽保护版 + 稳妥版供选择）
- 生成完整技术交底书

**模式二：交底书 → 专利四件套**

提供技术交底书，PatentClaw 生成：
- **请求书** — 含发明人、申请人等信息（必须由用户提供，绝不编造）
- **权利要求书** — 独立权利要求 + 从属权利要求，形成保护梯度
- **说明书** — 技术领域、背景技术、发明内容、附图说明、具体实施方式
- **说明书摘要** — 300 字以内，含摘要附图指定

### 自动一致性检查

生成四件套后，**自动运行检查**，修复通过后才输出最终文档：

| 检查项 | 级别 | 说明 |
|--------|------|------|
| 术语一致性 | error | 权利要求书与说明书用词必须完全一致 |
| 从属权利要求重叠 | error | 附加特征不得与独立权利要求重复 |
| 引用编号合法性 | error | 从属权利要求不得前向引用或引用不存在的条目 |
| 说明书覆盖度 | warning | 权利要求的每个特征在说明书中须有充分描述 |
| 独立权利要求宽度 | warning | 检测限定过多或含具体数值，提示上位化 |
| 摘要字数 | error | 超过 300 字自动提示精简 |

内置专利法律套话停用词表（「其特征在于」「根据权利要求」等），避免误报。

### 国知局格式 .docx 导出

自动生成符合 CNIPA 排版规范的 Word 文档：

- A4 纸张，页边距：上下 25.4mm，左右 25mm
- 标题：小二号黑体加粗居中
- 一级标题：四号黑体加粗
- 二级标题：小四号黑体加粗
- 正文：小四号宋体，首行缩进 2 字符，1.5 倍行距
- 页脚居中页码

## 项目结构

```
PatentClaw/
├── SKILL.md                # Skill 定义文件（触发词、流程、提示词）
├── export-docx.js          # .docx 导出工具（国知局格式）
├── check-consistency.js    # 术语一致性检查工具
├── example/
│   └── input-example.json  # 输入数据示例
└── package.json            # Node.js 依赖
```

## 安装

### 前置条件

- [OpenClaw](https://github.com/nicepkg/openclaw) 已安装并完成初始化
- Node.js >= 18

### 安装步骤

1. 将本项目克隆到 OpenClaw workspace 的 `skills/` 目录下：

```bash
cd ~/.openclaw/workspace
mkdir -p skills
cd skills
git clone https://github.com/CalicoCatto/PatentClaw.git patent-claw
```

2. 安装依赖：

```bash
cd patent-claw
npm install
```

3. 完成。在 OpenClaw 对话中输入包含"专利""交底书""四件套"等关键词的消息即可触发。

## 使用方式

### 通过 OpenClaw 对话使用

```
用户：这篇论文要申请专利 [粘贴论文内容或发送 PDF]
龙虾：[自动进入模式一，生成技术交底书]

用户：继续生成四件套
龙虾：[收集申请人信息 → 生成四件套 → 自动检查 → 修复 → 导出 .docx]
```

### 单独使用工具脚本

**一致性检查：**

```bash
node check-consistency.js input.json
```

**导出 .docx：**

```bash
node export-docx.js input.json output_dir/
```

输入 JSON 格式请参考 `example/input-example.json`。

## 核心原则

1. **生成的是初稿，不是终稿**。每次输出都会提醒：最终提交前须经持证专利代理师审核。
2. **绝不捏造身份信息**。发明人、申请人、代理机构等信息必须由用户提供。
3. **专利思维，不是论文思维**。论文追求完整公开便于复现，专利追求抽象概括以最大化保护范围。

## 许可证

MIT
