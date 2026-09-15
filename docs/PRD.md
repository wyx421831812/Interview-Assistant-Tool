# 「面伴」AI 面试辅助工具 · 需求文档（PRD）

> 文档版本：v1.0　|　更新日期：2026-09-15　|　文档状态：待评审

## 1. 文档说明

本文档定义「面伴」AI 面试辅助工具的产品需求。它是一套围绕「项目经验」的本地优先面试备战系统，将用户的简历与面试笔记转化为「练习 → 反馈 → 复盘 → 进步」的闭环能力。

### 1.1 名词表

| 名词 | 定义 |
|---|---|
| 简历（Resume） | 用户导入的文本简历，作为画像与项目来源 |
| 笔记（Note） | 用户整理的面试笔记，按项目/主题归类，进入知识库 |
| 画像（Profile） | 由简历解析出的项目、技术栈、职责、能力的结构化描述 |
| 押题清单（Prediction） | 结合画像与目标岗位生成的高频题/预测题列表 |
| 错题本（WrongBook） | 对回答评分不合格的题目集合 |
| 能力雷达图（Radar） | 基于多维评分汇总的能力可视化 |

---

## 2. 功能目标

### 2.1 产品目标

为求职者提供一套**本地、私有、可复现**的面试陪练系统，以项目经验为锚点，覆盖「简历梳理 → 笔记沉淀 → 模拟练习 → 结构化点评 → 复盘提升 → 考前押题」全链路。

### 2.2 六大核心模块（功能需求 FR）

| 编号 | 模块 | 功能目标 |
|---|---|---|
| FR-1 | 简历解析与画像 | 导入简历文本，自动提取项目经历、技术栈、职责与亮点，生成结构化面试画像 |
| FR-2 | 笔记知识库 | 导入/编辑面试笔记，按项目与主题归类，支持关键词与语义检索，供面试中引用 |
| FR-3 | 模拟面试 | AI 扮演面试官，基于画像与目标岗位出题并逐层追问（项目深挖 / 技术追问 / STAR 话术）；支持对话式问答 |
| FR-4 | 回答点评 | 对每轮回答进行多维度结构化评分，并给出改进版回答示范 |
| FR-5 | 面试复盘 | 记录评分形成错题本与能力雷达图，支持跨场次进步趋势追踪 |
| FR-6 | 高频题预测 | 结合画像与目标岗位职责，生成并按类型/优先级组织押题清单 |

### 2.3 非功能目标（NFR）

| 编号 | 类别 | 目标 |
|---|---|---|
| NFR-1 | 隐私 | 简历、笔记、问答数据与 API Key 仅存储在本地浏览器，绝不上传任何第三方服务器 |
| NFR-2 | 离线可用 | 除 LLM 调用外，核心功能可在无网络时使用 |
| NFR-3 | 易用性 | 无任何登录/注册，打开即用，三步完成首次面试 |
| NFR-4 | 兼容性 | 支持主流现代浏览器（Chrome / Edge / Firefox / Safari 最新版） |
| NFR-5 | 稳定性 | 页面 3 秒内首屏可交互，AI 请求失败有明确重试/降级提示 |

---

## 3. 业务规则（BR）

### 3.1 简历解析规则

- BR-1.1：仅支持文本简历（粘贴或上传 `.txt/.md`）。上传后同步解析并生成画像；解析失败时提示用户检查文本格式，不覆盖此前画像。
- BR-1.2：解析结果至少区分「项目经历 / 技术栈 / 职责职责 / 亮点成就 / 目标岗位候选人特征」五类字段；空字段允许保留为空。
- BR-1.3：支持用户手动编辑画像（增删改项目与技术栈），编辑以用户输入为准。

### 3.2 知识库规则

- BR-2.1：每条笔记必填字段为「标题」「正文」，可选字段为「所属项目」「主题标签」。
- BR-2.2：支持全文关键词检索；支持基于向量/语义的「相似话术」召回（作为增强项，未配置语义服务时降级为关键词检索）。
- BR-2.3：笔记创建/删除仅影响本地数据，不触发任何网络请求。

### 3.3 模拟面试规则

- BR-3.1：用户可选择的面试模式：`项目深挖` / `技术追问` / `STAR 话术` / `综合`。
- BR-3.2：面试官提问应基于当前画像与所选目标岗位，不得脱轨询问画像之外的虚构项目。
- BR-3.3：默认最多 N（默认 10，可配置）轮问答，达到轮数或用户主动结束即终止。
- BR-3.4：每轮以「面试官提问 → 用户回答 → 可选点评」推进；用户可随时点击「结束并复盘」。
- BR-3.5：追问应针对上一轮回答中的薄弱点或技术细节，保持上下文连续。

### 3.4 回答点评规则

- BR-4.1：点评维度固定为五类：**技术深度 / 完整度（STAR 结构）/ 表达条理 / 与项目契合度 / 改进空间**，每项 0–5 分。
- BR-4.2：点评输出必须包含：总分、分维度得分、一段总体评价、一段「改进版回答示范」。
- BR-4.3：总分 < 3 的题目自动记入错题本。

### 3.5 复盘规则

- BR-5.1：每次面试结束生成一条复盘记录（时间、模式、题目数、平均分、错题）。
- BR-5.2：能力雷达图基于各维度累计均分绘制，维度与点评维度一致。
- BR-5.3：错题本按「最近回答时间」倒序，支持标记「已掌握」从错题本移除。
- BR-5.4：进步追踪按时间展示最近若干场次总分趋势。

### 3.6 高频题预测

- BR-6.1：预测输入 = 画像 + 目标岗位 + 历史错题（可选）。
- BR-6.2：押题清单按`类型`（项目/技术/行为）与`优先级`（高/中/低）组织，每道题标注来源依据。

### 3.7 通用规则

- BR-7.1：所有涉及 LLM 的调用均需 API Key 有效；Key 失效时给出可读错误。
- BR-7.2：LLM 输出采用严格 JSON 结构，解析失败时向用户提示并允许重试。
- BR-7.3：所有本地数据变更即时持久化，刷新页面不丢失。

---

## 4. 接口定义（Interface）

### 4.1 前端内部数据模型（本地存储）

数据统一存放于浏览器 `IndexedDB`（本地自动持久化，无需后端存储）。核心表结构如下（TypeScript 示意）。

```ts
// 系统设置
interface Settings {
  apiProvider: "openai-compatible" | "anthropic";
  apiKey: string;        // 仅本地
  baseUrl: string;
  model: string;
  defaultModes: InterviewMode[];
  maxRounds: number;     // 默认 10
}

// 画像
interface Profile {
  id: string;
  projects: ProjectItem[];
  techStack: string[];
  responsibilities: string[];
  highlights: string[];
  jobTarget?: string;
  updatedAt: string;
}

interface ProjectItem {
  name: string;
  description: string;
  technology: string[];
  star?: StarEntry;       // Situation/Task/Action/Result
}

// 笔记
interface Note {
  id: string;
  title: string;
  content: string;
  projectId?: string;
  tags: string[];
  createdAt: string;
}

// 面试会话
interface InterviewSession {
  id: string;
  mode: InterviewMode;
  profileId: string;
  position: string;
  status: "ongoing" | "finished";
  createdAt: string;
  startedAt: string;
}

interface InterviewTurn {
  sessionId: string;
  turnNo: number;
  question: string;
  answer?: string;
  review?: Review;
}

interface Review {
  scores: Record<ReviewDimension, number>; // 0–5
  total: number;
  comment: string;
  improvedAnswer: string;
}

// 复盘
interface SessionReport {
  sessionId: string;
  averageScore: number;
  wrongQuestions: string[];
  perDimensionAvg: Record<ReviewDimension, number>;
  trendPoints: number[];
}

// 押题
interface PredictionItem {
  type: "project" | "technical" | "behavior";
  priority: "high" | "medium" | "low";
  question: string;
  basis: string;          // 来源依据
}
```

枚举定义：

```ts
type InterviewMode = "project-deep" | "technical" | "star" | "comprehensive";
type ReviewDimension = "depth" | "structure" | "clarity" | "fit" | "improvement";
```

### 4.2 LLM 接口约定（后端协议）

工具作为「客户端」调用用户自有大模型服务，兼容 OpenAI Chat Completions（`/chat/completions`）与 Anthropic Messages（`/v1/messages`）两种协议，由 `apiProvider` 决定。

#### 4.2.1 请求规范

- 通过 `fetch` 发送，携带鉴权头：OpenAI 用 `Authorization: Bearer <key>`，Anthropic 用 `x-api-key`。
- 每次结构化输出请求必须携带明确 `response_format`（OpenAI 支持 JSON）或在系统提示中强约束输出为 JSON。
- 需透传的参数：`model`、`messages`、`temperature`（默认 0.7）、`max_tokens`。
- 需映射的参数：`max_tokens` ↔ Anthropic `max_tokens`；`messages` 中 `system` 角色按对应协议转换。

#### 4.2.2 六大解析/生成调用（语义接口）

| 接口编号 | 名称 | 输入 | 输出结构 |
|---|---|---|---|
| AI-1 | 简历解析 | 简历文本 | `Profile`（JSON 化字段） |
| AI-2 | 笔记归类/相似话术召回 | 检索 query + 笔记集合 | `Note[]`（含相似度排序） |
| AI-3 | 面试官出题 | 画像 + 岗位 + 轮次 + 历史对话 | `{ question: string }` |
| AI-4 | 追问 | 画像 + 上一轮问答 | `{ question: string }` |
| AI-5 | 回答点评 | 画像 + 题目 + 用户回答 | `Review`（含 `scores`/`comment`/`improvedAnswer`） |
| AI-6 | 高频题预测 | 画像 + 岗位 + 历史错题 | `PredictionItem[]` |

#### 4.2.3 错误处理

| 场景 | 表现 |
|---|---|
| 401 / 403 | 提示「API Key 无效或未授权」，引导去设置页修改 |
| 402 / 429 | 提示「额度或限流」，建议稍后重试或更换模型 |
| 网络/超时（无响应） | 提示「网络异常」，提供「重试」按钮，不丢会话上下文 |
| JSON 解析失败 | 提示「模型输出格式异常」，提供「重试一次」 |

### 4.3 前端内部函数接口（示意）

```ts
// 存储层
export function save<T>(store: string, obj: T): Promise<void>;
export function load<T>(store: string, id: string): Promise<T | undefined>;
export function list<T>(store: string): Promise<T[]>;
export function remove(store: string, id: string): Promise<void>;

// LLM 封装
export function completeText(req: LlmRequest): Promise<LlmResponse>;
export function completeJson<T>(req: LlmRequest): Promise<T>; // 自动校验 + 重试 JSON

// 业务服务
export interface InterviewService {
  start(config: StartConfig): Promise<InterviewSession>;
  askNextQuestion(sessionId: string, lastAnswer?: string): Promise<Question>;
  review(sessionId: string, turnNo: number): Promise<Review>;
  finish(sessionId: string): Promise<SessionReport>;
}
```

---

## 5. 验收标准（Acceptance Criteria / AC）

### 5.1 通用

- AC-0.1：无离线构建依赖，双击 `index.html` 或静态服务器即可启动全部功能。
- AC-0.2：页面刷新/关闭重开后，简历、笔记、画像、历史面试与错题本均完整保留（NFR-1、BR-7.3）。
- AC-0.3：数据或 API Key 不经任何应用服务器转发，仅存在于本地（可通过浏览器 Network 面板验证，除用户配置的 LLM BaseUrl 外无第三方请求）。

### 5.2 简历解析

- AC-1.1：输入含项目与技术栈的文本简历，正确生成五大字段画像；项目与技术栈数量与原文一致（BR-1.1/1.2）。
- AC-1.2：解析失败或空输入时提示用户，原画像保持不变（BR-1.1）。
- AC-1.3：用户可手动修改画像任一字段，保存后以用户输入为准（BR-1.3）。

### 5.3 笔记知识库

- AC-2.1：可新增/编辑/删除笔记，必填字段缺失时有校验提示（BR-2.1、BR-7.3）。
- AC-2.2：关键词检索能命中正文中包含该关键词的笔记（BR-2.2）。
- AC-2.3：新增/删除笔记不触发任何网络请求（Network 面板无额外请求）（BR-2.3）。

### 5.4 模拟面试

- AC-3.1：可选四种模式，并在「综合」模式下按项目/技术/行为混合出题（BR-3.1）。
- AC-3.2：所有提问均与当前画像相关，不出现画像之外的虚构项目（BR-3.2）。
- AC-3.3：达到默认 10 轮或用户「结束」，会话正常终止并进入复盘（BR-3.3/3.4）。
- AC-3.4：用户回答后，下一轮追问可命中上一轮回答的技术薄弱点（BR-3.5，人工抽样验证上下文连续性）。

### 5.5 回答点评

- AC-4.1：每轮点评包含五个维度 0–5 分、总分、总体评价、改进版回答示范（BR-4.1/4.2）。
- AC-4.2：总分 < 3 的题目自动进入错题本，刷新后仍存在（BR-4.3、BR-7.3）。

### 5.6 面试复盘

- AC-5.1：每次结束的面试生成一条复盘记录（模式/题目数/平均分/错题）（BR-5.1）。
- AC-5.2：能力雷达图五维数据正确，随评分累计更新（BR-5.2）。
- AC-5.3：错题可标记「已掌握」并被移除（BR-5.3）。
- AC-5.4：进步趋势按时间展示最近场次总分（BR-5.4）。

### 5.7 高频题预测

- AC-6.1：基于画像+目标岗位生成的押题清单，含类型与优先级，题目均有来源依据（BR-6.1/6.2）。

### 5.8 稳定性与错误处理

- AC-7.1：Key 无效/限流/网络异常/JSON 解析失败四类错误均有可读提示与处理路径（BR-7.1/7.2）。
- AC-7.2：重试后能恢复，且原会话上下文不丢失（BR-7.2）。

---

## 6. 里程碑（建议）

| 阶段 | 内容 | 验收 |
|---|---|---|
| M1 | 脚手架 + 数据模型 + 本地存储层 + 设置页 | 通过 AC-0.x |
| M2 | 简历解析与画像 | 通过 AC-1.x |
| M3 | 笔记知识库 | 通过 AC-2.x |
| M4 | 模拟面试 + 回答点评 | 通过 AC-3.x / AC-4.x |
| M5 | 复盘 + 押题预测 | 通过 AC-5.x / AC-6.x |
| M6 | 全场景错误处理与体验打磨 | 已通过全部 AC |