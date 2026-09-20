---
name: "resume-optimizer"
description: "Extracts text from PDF resumes and produces a structured diagnosis plus an optimized rewrite with a change log. Invoke when the user uploads a resume file (PDF/txt) or asks to 优化/润色/评估/修改简历."
---

# Resume Optimizer（简历优化）

将用户提供的 PDF 简历提取为文本，进行结构化诊断并输出优化后的简历。整个流程不依赖任何外部 API，由当前 Agent 直接完成分析与改写。

## 使用流程

### 第 1 步：提取 PDF 文本

```bash
python3 .trae/skills/resume-optimizer/scripts/extract_resume.py <pdf路径> -o /tmp/resume.txt
```

脚本按退出码报告结果：

| 退出码 | 含义 | 应对 |
|--------|------|------|
| 0 | 提取成功 | 继续第 2 步 |
| 2 | PDF 已加密 | 请用户提供未加密版本 |
| 3 | 提取文本过少（<200 字符），疑似扫描件 | 请用户直接粘贴简历文本或上传图片版 |
| 1 | 其他解析失败 | 查看脚本的 stderr 错误信息 |

也支持纯文本简历：用户上传 `.txt`/`.md` 时跳过脚本直接读取。

### 第 2 步：结构化解析

从提取文本中识别出：联系方式、教育背景、技能清单、工作经历、项目经历、其他（证书/奖项等）。解析结果先向用户简要确认缺失或模糊的部分。

### 第 3 步：按清单诊断

逐项检查并标注严重程度（🔴 必须改 / 🟡 建议改 / 🟢 可选优化）：

1. **量化不足**：经历描述缺少数字、规模、成果指标（如 QPS、用户量、转化率、节省成本）
2. **弱动词与空话**：「参与」「负责」「熟悉」「了解」等无证据表述；连续动词堆砌但无结果
3. **STAR 结构缺失**：每条经历应有 背景→任务→行动→结果，重点在「行动」与「结果」
4. **关键词覆盖**：若用户提供了目标岗位 JD，逐条比对硬技能/软技能关键词的命中率
5. **信息密度**：简历超过 2 页、单条要点超过 2 行、与目标岗位无关的冗余内容
6. **技能与经历脱节**：技能区罗列但没有任何项目佐证的技术
7. **格式与排版**：时间线断档、联系方式不完整、中英混排不一致

### 第 4 步：输出四部分报告

输出为 Markdown 文件（默认 `docs/resume-optimized.md`，用户指定路径时从其指定）：

1. **诊断报告**：按严重度分级列出问题，每条包含「原文引用 → 问题 → 建议改法」
2. **优化后简历**：完整 Markdown 版；所有需要用户补充的数据用占位符 `【补充：xxx数据】` 标注
3. **修改对照表**：表格列出 原文 → 优化后 → 修改理由
4. **岗位定制建议**（可选，仅在用户提供 JD 时）：关键词对齐情况与定制方向

### 第 5 步：生成 PDF

把「优化后简历」单独写成受限 Markdown（只含简历本体，不含诊断/对照表），默认存 `/tmp/resume-final.md`，然后构建 PDF：

```bash
python3 .trae/skills/resume-optimizer/scripts/build_pdf.py /tmp/resume-final.md \
  -o "docs/<姓名>-<岗位>-优化后.pdf" --title "<姓名>-<岗位>"
```

受限 Markdown 仅支持：`#`（姓名大标题）、`##`（分区标题）、`###`（条目标题）、`>`（联系方式/意向行）、`-` 要点、`1.` 编号、`**加粗**`。**不支持**表格、图片、HTML、代码块。`【补充：…】` 占位符会自动渲染为加粗。

生成后做一次回读校验（用 extract_resume.py 抽取 PDF 文本，确认姓名、意向、关键技能存在）。字体以 CIDFontType2（TTF）嵌入，pdfminer / pdfium / pypdf 三类解析器均兼容，ATS 可正常读取。

## 硬性规则

- **严禁编造**：不得虚构经历、职级、数字、技术细节。只能重组、澄清、突出用户已有内容；缺数据一律用占位符提示补充
- **语言一致**：中文简历用中文优化，英文简历用英文优化，不混译
- **保持真实结构**：不合并/删除用户未授权删除的经历条目；大改动前先说明
- **隐私安全**：不要把简历内容写入 skill 目录或日志，中间文本放 `/tmp/`

## 依赖说明

- 提取脚本依赖 `pdfplumber` 或 `pypdf`（任一即可），沙箱内已预装；若在未安装的环境运行，先执行 `pip install pypdf`
- PDF 构建依赖 `fpdf2` 与 Noto Sans SC 字体：首次运行 `build_pdf.py` 时会自动调用 `prepare_fonts.py` 下载 OTF 并转换为 TTF（GB2312 全字集 + ASCII + 常用标点子集，覆盖常见生僻姓名用字），缓存于 `~/.cache/resume-skill-fonts/`
- 离线环境可手动放置 `NotoSansSC-{Regular,Bold}.ttf/.otf` 到该缓存目录，或用 `RESUME_FONT_DIR` 指定路径
