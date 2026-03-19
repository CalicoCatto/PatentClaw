#!/usr/bin/env node
/**
 * PatentClaw 术语一致性与权利要求检查工具
 *
 * 用法：
 *   node check-consistency.js <input.json>
 *
 * 检查项目：
 *   1. 权利要求书与说明书的术语一致性
 *   2. 从属权利要求与独立权利要求的特征重叠
 *   3. 权利要求书内部术语一致性
 *   4. 说明书是否充分覆盖权利要求的技术特征
 *   5. 摘要字数检查
 *   6. 权利要求编号连续性与引用合法性
 *
 * 输出：JSON 格式的检查报告，包含 errors / warnings / info
 */

const fs = require("fs");
const path = require("path");

// ============================================================
// 停用词：专利法律套话和通用结构性短语，不参与术语一致性检查
// ============================================================

const STOPWORDS = new Set([
  // 权利要求书结构性套话
  "其特征在于", "根据权利要求", "所述的方法", "所述的装置", "所述的系统",
  "所述的设备", "包括以下步骤", "任一项所述", "任一项所述的方法",
  "任一项所述的装置", "任一项所述的系统", "还包括", "进一步包括",
  "其中所述", "优选地", "可选地", "具体地",
  // 说明书结构性套话
  "本发明涉及", "本发明提供", "本发明公开", "本发明属于",
  "本发明的目的", "本发明的技术方案", "技术领域", "背景技术",
  "发明内容", "附图说明", "具体实施方式", "有益效果",
  "现有技术", "本领域技术人员", "实施例",
  // 通用动词短语
  "所述的", "用于", "能够", "可以", "通过", "基于", "根据",
  "包括", "包含", "至少", "其中", "以及", "并且", "或者",
]);

/** 检查是否为停用词或其子串 */
function isStopword(term) {
  if (STOPWORDS.has(term)) return true;
  for (const sw of STOPWORDS) {
    if (term === sw || (term.length <= sw.length + 2 && sw.includes(term))) return true;
  }
  // 过滤以停用词开头/结尾的短语，且自身无实质技术含义
  for (const sw of STOPWORDS) {
    if (term.startsWith(sw) && term.length - sw.length <= 3) return true;
    if (term.endsWith(sw) && term.length - sw.length <= 3) return true;
  }
  return false;
}

// ============================================================
// 工具函数
// ============================================================

/** 中文分词：按标点、空格切分，提取 2-8 字的中文词组 */
function extractTerms(text) {
  if (!text) return [];
  const cleaned = text.replace(/^\d+\.\s*/gm, "");
  const zhChunks = cleaned.match(/[\u4e00-\u9fff\u3400-\u4dbf]{2,}/g) || [];
  return [...new Set(zhChunks)].filter(t => !isStopword(t));
}

/** 提取技术术语（较长的专业词汇，3字以上） */
function extractTechTerms(text) {
  if (!text) return [];
  const cleaned = text.replace(/^\d+\.\s*/gm, "");
  const chunks = cleaned.match(/[\u4e00-\u9fff\u3400-\u4dbf]{3,}/g) || [];
  return [...new Set(chunks)].filter(t => !isStopword(t));
}

/** 从权利要求中提取核心技术特征短语 */
function extractClaimFeatures(claimText) {
  if (!claimText) return [];
  const features = [];
  // 按分号、句号、换行切分
  const parts = claimText.split(/[；;。\n]/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length >= 4) {
      features.push(trimmed);
    }
  }
  return features;
}

/** 计算两个字符串的相似度（基于公共子串） */
function similarity(a, b) {
  if (!a || !b) return 0;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length === 0) return 0;

  let matchCount = 0;
  // 滑动窗口匹配
  for (let len = shorter.length; len >= 2; len--) {
    for (let i = 0; i <= shorter.length - len; i++) {
      const sub = shorter.substring(i, i + len);
      if (longer.includes(sub)) {
        matchCount += len;
        break;
      }
    }
    if (matchCount > 0) break;
  }
  return matchCount / shorter.length;
}

/** 查找近义替换（同一概念用了不同说法） */
function findSynonymPairs(termsA, termsB) {
  const pairs = [];
  const checked = new Set();

  for (const a of termsA) {
    for (const b of termsB) {
      if (a === b) continue;
      const key = [a, b].sort().join("|");
      if (checked.has(key)) continue;
      checked.add(key);

      // 长度差异不大、有较高相似度的词对
      if (Math.abs(a.length - b.length) <= 2 && a.length >= 3 && b.length >= 3) {
        const sim = similarity(a, b);
        if (sim >= 0.5 && sim < 1.0) {
          // 额外检查：共享至少一半的字
          const charsA = new Set(a.split(""));
          const common = b.split("").filter(c => charsA.has(c)).length;
          const minLen = Math.min(a.length, b.length);
          if (common >= minLen * 0.5) {
            pairs.push({ termA: a, termB: b, similarity: sim });
          }
        }
      }
    }
  }

  return pairs;
}

// ============================================================
// 检查模块
// ============================================================

function checkTermConsistency(data) {
  const issues = [];
  const claims = data.claims || [];
  const spec = data.specification || {};

  // 合并权利要求书全文
  const claimsFullText = claims.join("\n");
  // 合并说明书全文
  const specFullText = [
    spec.technicalField,
    spec.backgroundArt,
    spec.technicalProblem,
    spec.technicalSolution,
    spec.beneficialEffects,
    (spec.drawingDescriptions || []).join("\n"),
    spec.detailedDescription,
  ].filter(Boolean).join("\n");

  if (!claimsFullText || !specFullText) return issues;

  // 提取技术术语
  const claimTerms = extractTechTerms(claimsFullText);
  const specTerms = extractTechTerms(specFullText);

  // 检查1：权利要求中出现但说明书中未出现的术语
  for (const term of claimTerms) {
    if (term.length >= 4 && !specFullText.includes(term)) {
      // 检查是否有近似表达
      const similar = specTerms.filter(s => similarity(term, s) >= 0.6 && s !== term);
      if (similar.length > 0) {
        issues.push({
          level: "error",
          type: "term_inconsistency",
          message: `术语不一致：权利要求书中使用「${term}」，说明书中使用「${similar[0]}」，应统一用词`,
          claimTerm: term,
          specTerm: similar[0],
        });
      } else if (term.length >= 5) {
        issues.push({
          level: "warning",
          type: "term_missing_in_spec",
          message: `权利要求书中的术语「${term}」在说明书中未出现，可能导致说明书公开不充分`,
          term,
        });
      }
    }
  }

  // 检查2：说明书中出现但权利要求中未出现的核心术语（仅提示）
  // 这个方向不强制，因为说明书通常比权利要求更详细

  // 检查3：两者之间的近义词对
  const synonyms = findSynonymPairs(claimTerms, specTerms);
  for (const pair of synonyms) {
    // 避免与检查1重复
    const alreadyReported = issues.some(
      i => i.type === "term_inconsistency" &&
        (i.claimTerm === pair.termA || i.claimTerm === pair.termB)
    );
    if (!alreadyReported) {
      // 判断哪个在权利要求、哪个在说明书
      const aInClaim = claimsFullText.includes(pair.termA);
      const bInClaim = claimsFullText.includes(pair.termB);
      const aInSpec = specFullText.includes(pair.termA);
      const bInSpec = specFullText.includes(pair.termB);

      if ((aInClaim && bInSpec && !aInSpec) || (bInClaim && aInSpec && !bInSpec)) {
        const claimTerm = aInClaim && !aInSpec ? pair.termA : pair.termB;
        const specTerm = claimTerm === pair.termA ? pair.termB : pair.termA;
        issues.push({
          level: "error",
          type: "term_inconsistency",
          message: `术语不一致：权利要求书中使用「${claimTerm}」，说明书中使用「${specTerm}」，应统一用词`,
          claimTerm,
          specTerm,
        });
      } else if (aInClaim && bInClaim) {
        issues.push({
          level: "warning",
          type: "term_inconsistency_within_claims",
          message: `权利要求书内部用词不一致：同时出现「${pair.termA}」和「${pair.termB}」，建议统一`,
          terms: [pair.termA, pair.termB],
        });
      }
    }
  }

  return issues;
}

function checkClaimOverlap(data) {
  const issues = [];
  const claims = data.claims || [];
  if (claims.length < 2) return issues;

  // 识别独立权利要求和从属权利要求
  const parsed = claims.map((text, idx) => {
    const num = idx + 1;
    const isDependent = /根据权利要求\d+/.test(text);
    const refMatch = text.match(/根据权利要求(\d+(?:(?:至|到|-)\d+)?(?:(?:任一|中任一|或\d+)(?:项)?)?)/);
    let refs = [];
    if (refMatch) {
      const refStr = refMatch[1];
      const nums = refStr.match(/\d+/g);
      if (nums) refs = nums.map(Number);
    }

    const features = extractClaimFeatures(text);
    return { num, text, isDependent, refs, features };
  });

  const independentClaims = parsed.filter(c => !c.isDependent);
  const dependentClaims = parsed.filter(c => c.isDependent);

  for (const dep of dependentClaims) {
    // 找到其引用的独立权利要求
    for (const refNum of dep.refs) {
      const parent = parsed.find(c => c.num === refNum);
      if (!parent) continue;

      // 检查从属权利要求的附加特征是否与独立权利要求重叠
      // 提取从属权利要求中"其特征在于"之后的部分
      const depFeatureMatch = dep.text.match(/其特征在于[，,：:\s]*([\s\S]*)/);
      const parentFeatureMatch = parent.text.match(/其特征在于[，,：:\s]*([\s\S]*)/);

      if (depFeatureMatch && parentFeatureMatch) {
        const depFeatureText = depFeatureMatch[1];
        const parentFeatureText = parentFeatureMatch[1];

        // 提取特征片段并比较
        const depFragments = depFeatureText.split(/[；;。\n]/).map(s => s.trim()).filter(s => s.length >= 4);
        const parentFragments = parentFeatureText.split(/[；;。\n]/).map(s => s.trim()).filter(s => s.length >= 4);

        for (const depFrag of depFragments) {
          for (const parentFrag of parentFragments) {
            // 检查是否有大量重叠文本
            if (depFrag.length >= 6 && parentFrag.includes(depFrag)) {
              issues.push({
                level: "error",
                type: "claim_overlap",
                message: `权利要求${dep.num}的附加特征「${depFrag.substring(0, 30)}...」与权利要求${parent.num}的特征重复，从属权利要求应当引入新的限定特征`,
                dependentClaim: dep.num,
                parentClaim: parent.num,
                overlappingText: depFrag.substring(0, 50),
              });
            } else if (depFrag.length >= 8 && similarity(depFrag, parentFrag) >= 0.7) {
              issues.push({
                level: "warning",
                type: "claim_near_overlap",
                message: `权利要求${dep.num}的特征与权利要求${parent.num}的特征高度相似，可能导致保护范围不清晰：「${depFrag.substring(0, 30)}...」`,
                dependentClaim: dep.num,
                parentClaim: parent.num,
              });
            }
          }
        }
      }
    }
  }

  // 检查从属权利要求之间是否重叠
  for (let i = 0; i < dependentClaims.length; i++) {
    for (let j = i + 1; j < dependentClaims.length; j++) {
      const a = dependentClaims[i];
      const b = dependentClaims[j];

      const aMatch = a.text.match(/其特征在于[，,：:\s]*([\s\S]*)/);
      const bMatch = b.text.match(/其特征在于[，,：:\s]*([\s\S]*)/);

      if (aMatch && bMatch) {
        const aFeature = aMatch[1].trim();
        const bFeature = bMatch[1].trim();

        if (aFeature.length >= 10 && bFeature.length >= 10 && similarity(aFeature, bFeature) >= 0.8) {
          issues.push({
            level: "warning",
            type: "dependent_claims_overlap",
            message: `权利要求${a.num}和权利要求${b.num}的附加特征高度相似，建议合并或区分`,
            claims: [a.num, b.num],
          });
        }
      }
    }
  }

  return issues;
}

function checkClaimNumbering(data) {
  const issues = [];
  const claims = data.claims || [];

  // 检查权利要求引用的编号是否合法
  claims.forEach((text, idx) => {
    const num = idx + 1;
    const refs = text.match(/权利要求(\d+)/g);
    if (refs) {
      for (const ref of refs) {
        const refNum = parseInt(ref.match(/\d+/)[0]);
        if (refNum >= num) {
          issues.push({
            level: "error",
            type: "claim_ref_forward",
            message: `权利要求${num}引用了权利要求${refNum}，从属权利要求只能引用编号更小的权利要求`,
            claim: num,
            refClaim: refNum,
          });
        }
        if (refNum < 1 || refNum > claims.length) {
          issues.push({
            level: "error",
            type: "claim_ref_invalid",
            message: `权利要求${num}引用了不存在的权利要求${refNum}`,
            claim: num,
            refClaim: refNum,
          });
        }
      }
    }
  });

  return issues;
}

function checkSpecCoverage(data) {
  const issues = [];
  const claims = data.claims || [];
  const spec = data.specification || {};

  const specFullText = [
    spec.technicalSolution,
    spec.detailedDescription,
  ].filter(Boolean).join("\n");

  if (!specFullText) return issues;

  // 对每条权利要求，检查其核心特征是否在说明书中有对应描述
  claims.forEach((claimText, idx) => {
    const num = idx + 1;
    const featureMatch = claimText.match(/其特征在于[，,：:\s]*([\s\S]*)/);
    if (!featureMatch) return;

    const features = featureMatch[1].split(/[；;。\n]/).map(s => s.trim()).filter(s => s.length >= 6);

    for (const feature of features) {
      // 跳过纯结构性短语
      if (isStopword(feature) || /^(包括以下|还包括|进一步)/.test(feature)) continue;

      // 提取特征中的核心术语（过滤停用词）
      const coreTerms = extractTechTerms(feature).filter(t => t.length >= 4 && !isStopword(t));
      if (coreTerms.length === 0) continue;

      let coveredCount = 0;
      for (const term of coreTerms) {
        if (specFullText.includes(term)) {
          coveredCount++;
        }
      }

      if (coveredCount < coreTerms.length * 0.4) {
        issues.push({
          level: "warning",
          type: "spec_insufficient_coverage",
          message: `权利要求${num}中的特征「${feature.substring(0, 40)}...」在说明书的技术方案/具体实施方式中覆盖不足，可能导致公开不充分`,
          claim: num,
          feature: feature.substring(0, 60),
          uncoveredTerms: coreTerms.filter(t => !specFullText.includes(t)),
        });
      }
    }
  });

  return issues;
}

function checkAbstract(data) {
  const issues = [];
  const abs = data.abstract || {};

  if (abs.content) {
    const charCount = abs.content.replace(/\s/g, "").length;
    if (charCount > 300) {
      issues.push({
        level: "error",
        type: "abstract_too_long",
        message: `说明书摘要超过300字（当前${charCount}字），国知局要求摘要不超过300字`,
        charCount,
      });
    }
    if (charCount < 50) {
      issues.push({
        level: "warning",
        type: "abstract_too_short",
        message: `说明书摘要过短（当前${charCount}字），建议充实内容`,
        charCount,
      });
    }
  }

  if (!abs.drawingRef) {
    issues.push({
      level: "info",
      type: "abstract_no_drawing",
      message: "说明书摘要未指定摘要附图，建议选择最能体现技术方案的一幅图",
    });
  }

  return issues;
}

function checkIndependentClaimBreadth(data) {
  const issues = [];
  const claims = data.claims || [];
  if (claims.length === 0) return issues;

  // 第一条一般是独立权利要求
  const firstClaim = claims[0];
  const featureMatch = firstClaim.match(/其特征在于[，,：:\s]*([\s\S]*)/);
  if (!featureMatch) return issues;

  const featureText = featureMatch[1];
  const features = featureText.split(/[；;。\n]/).map(s => s.trim()).filter(s => s.length >= 4);

  // 检查独立权利要求是否包含过多限定（特征超过6个可能保护范围过窄）
  if (features.length > 6) {
    issues.push({
      level: "warning",
      type: "independent_claim_narrow",
      message: `独立权利要求1包含${features.length}个技术特征，限定过多可能导致保护范围过窄。建议将部分特征移至从属权利要求`,
      featureCount: features.length,
    });
  }

  // 检查是否包含具体数值（独立权利要求中不宜有具体参数）
  const numericPatterns = featureText.match(/\d+(\.\d+)?\s*(mm|cm|nm|μm|Hz|kHz|MHz|GHz|%|℃|°|kg|mol|mL|μL|ms|μs|ns|维|层|倍|个|次|步)/g);
  if (numericPatterns && numericPatterns.length > 0) {
    issues.push({
      level: "warning",
      type: "independent_claim_too_specific",
      message: `独立权利要求1中包含具体数值参数（${numericPatterns.slice(0, 3).join("、")}），建议上位化以扩大保护范围`,
      specificTerms: numericPatterns,
    });
  }

  return issues;
}

// ============================================================
// 主入口
// ============================================================

function runAllChecks(data) {
  const allIssues = [
    ...checkTermConsistency(data),
    ...checkClaimOverlap(data),
    ...checkClaimNumbering(data),
    ...checkSpecCoverage(data),
    ...checkAbstract(data),
    ...checkIndependentClaimBreadth(data),
  ];

  // 统计
  const errors = allIssues.filter(i => i.level === "error");
  const warnings = allIssues.filter(i => i.level === "warning");
  const infos = allIssues.filter(i => i.level === "info");

  const report = {
    passed: errors.length === 0,
    summary: {
      total: allIssues.length,
      errors: errors.length,
      warnings: warnings.length,
      info: infos.length,
    },
    issues: allIssues,
  };

  return report;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("用法: node check-consistency.js <input.json>");
    process.exit(1);
  }

  const inputPath = path.resolve(args[0]);
  if (!fs.existsSync(inputPath)) {
    console.error(`错误: 文件不存在 ${inputPath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const report = runAllChecks(data);

  // 人类可读输出
  console.log("═══════════════════════════════════════════");
  console.log("  PatentClaw 专利文档一致性检查报告");
  console.log("═══════════════════════════════════════════\n");

  if (report.passed) {
    console.log("✅ 检查通过，未发现严重问题\n");
  } else {
    console.log(`❌ 发现 ${report.summary.errors} 个错误，需要修复后才能导出\n`);
  }

  console.log(`  错误: ${report.summary.errors}  |  警告: ${report.summary.warnings}  |  提示: ${report.summary.info}\n`);

  if (report.issues.length > 0) {
    console.log("───────────────────────────────────────────");

    const levelIcon = { error: "❌", warning: "⚠️", info: "ℹ️" };
    const levelLabel = { error: "错误", warning: "警告", info: "提示" };

    for (const issue of report.issues) {
      console.log(`\n${levelIcon[issue.level]} [${levelLabel[issue.level]}] ${issue.type}`);
      console.log(`  ${issue.message}`);
    }

    console.log("\n───────────────────────────────────────────");
  }

  // 机器可读输出
  console.log(`\n__REPORT__${JSON.stringify(report)}__REPORT__`);

  process.exit(report.passed ? 0 : 1);
}

main();
