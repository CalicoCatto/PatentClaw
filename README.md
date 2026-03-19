# PatentClaw - 专利龙虾

<p align="center">
  <strong>基于多 Agent 编排的中国发明专利申请文件自动生成系统</strong>
</p>

<p align="center">
  学术论文 → 技术交底书 → 专利四件套 → 国知局格式 .docx
</p>

<p align="center">
  <a href="#安装">安装</a> |
  <a href="#快速开始">快速开始</a> |
  <a href="docs/project-manual.md">项目说明书</a> |
  <a href="docs/architecture.md">架构文档</a>
</p>

---

## 特性

- **多 Agent 并行编排** — 4 个专业子 Agent 协作，基于 OpenClaw `sessions_spawn` 原生能力
- **多策略权利要求** — 并行生成宽保护/稳妥/窄保护 3 套策略，用户对比选择
- **现有技术检索** — 自动搜索相关专利和论文，评估新颖性，辅助策略决策
- **自动术语审校** — 6 类错误检查 + 6 类警告检查，自动修复后再输出
- **国知局格式导出** — 输出符合 CNIPA 排版规范的 .docx 文件（A4、宋体/黑体、标准页边距）

## 架构

```
Phase 1: 编排器 ─── 论文解析 → 创新点识别 → 上位化 → 收集信息
                │
Phase 2: 并行   ├── 权利要求策略师 ──→ 3 套策略（宽/稳/窄）
                ├── 说明书撰写师  ──→ 说明书 + 摘要
                └── 现有技术检索员 ──→ 查新报告
                │
Phase 3: 编排器 ─── 展示查新 + 策略对比 → 用户选择
                │
Phase 4: 串行   └── 审校修复师 ──→ 自动检查修复（最多 3 轮）
                │
Phase 5: 编排器 ─── 展示文档 → 导出 .docx
```

> 详细架构说明见 [docs/architecture.md](docs/architecture.md)，完整项目文档见 [docs/project-manual.md](docs/project-manual.md)

### 为什么用多 Agent？

| 对比 | 单 Agent | 多 Agent |
|------|---------|---------|
| 权利要求 | 生成 1 套 | 并行生成 3 套供选择 |
| 效率 | 串行 | 权利要求 + 说明书 + 查新并行 |
| 查新 | 无 | 自动检索现有技术 |
| 审校 | 内联检查 | 独立 Agent 自动检查 + 修复 |
| 上下文 | 共享窗口 | 各 Agent 独立上下文 |

## 安装

**前置条件**：[OpenClaw](https://github.com/nicepkg/openclaw) >= 2026.3.2，Node.js >= 18

```bash
cd ~/.openclaw/workspace
mkdir -p skills && cd skills
git clone https://github.com/CalicoCatto/PatentClaw.git patent-claw
cd patent-claw && npm install
```

## 快速开始

### 模式一：论文 → 交底书

```
用户：这篇论文要申请专利 [发送论文]
龙虾：[解析 → 创新点 → 上位化 → 交底书 → 导出 .docx]
```

### 模式二：交底书 → 四件套

```
用户：继续生成四件套，发明人张三、李四，申请人XX大学...

龙虾：正在并行启动 3 个专业子 Agent...
     ├── 权利要求策略师：生成 3 套策略
     ├── 说明书撰写师：撰写说明书
     └── 现有技术检索员：检索相关专利

龙虾：[展示查新报告 + 3 套策略对比]
     请选择策略：(1) 宽保护 (2) 稳妥 (3) 窄保护

用户：选 2

龙虾：[审校修复 → 展示四件套 → 导出 .docx]
```

### 命令行工具

```bash
# 术语一致性检查
node check-consistency.js input.json

# 导出国知局格式 .docx
node export-docx.js input.json output_dir/
```

## 项目结构

```
PatentClaw/
├── SKILL.md                     # 编排器（触发词、5 阶段流程）
├── check-consistency.js         # 术语一致性检查引擎
├── export-docx.js               # 国知局格式 .docx 导出
├── prompts/                     # 子 Agent Prompt 模板
│   ├── claims-strategist.md     #   权利要求策略师
│   ├── spec-writer.md           #   说明书撰写师
│   ├── prior-art-scout.md       #   现有技术检索员
│   └── review-fixer.md          #   审校修复师
├── docs/
│   ├── architecture.md          #   架构文档
│   └── project-manual.md        #   项目说明书
├── example/
│   └── input-example.json       #   输入数据示例
└── package.json
```

## 一致性检查规则

| 检查项 | 级别 | 说明 |
|--------|------|------|
| 术语一致性 | error | 权利要求书与说明书用词不一致 |
| 权利要求重叠 | error | 从属权利要求特征与独立权利要求重复 |
| 引用编号 | error | 前向引用或引用不存在的权利要求 |
| 摘要字数 | error | 超过 300 字 |
| 说明书覆盖度 | warning | 权利要求特征在说明书中覆盖不足 |
| 独立权利要求宽度 | warning | 限定过多或含具体数值 |

## 核心原则

1. **生成初稿，不是终稿** — 提醒用户须经专利代理师审核
2. **绝不捏造身份信息** — 发明人、申请人等必须用户提供
3. **专利思维优先** — 抽象概括以最大化保护范围，而非详细公开

## 许可证

[MIT](LICENSE)
