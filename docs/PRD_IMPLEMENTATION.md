# FundLink AI PRD V1.0 实现与验收

当前交付是按上传文档持续完善的本地 MVP，尚非 PRD 全部产品愿景的完成证明。2026-10-10 补齐项见 `UPGRADE_2026-10-10.md`。原始实现按第 17、20 节的可演示 MVP 边界展开。原文归档为 `FundLink_AI_PRD_V1.0.md`。下表记录可执行入口；“真实”指实际运行的功能，不表示公开披露已经审计或交易对手已注册。

| 模块 | 交付的行为 | 主要实现 | 验证 |
|---|---|---|---|
| M1 引导建档 | 首页投资/融资双入口、角色十维访谈、文字/选项/跳过/未知、金额辅导、解释与有限追问、可编辑语音输入、DeepSeek 抽取原文引用、用户选择确认、字段来源与历史；融资方 19 / 投资方 17 项专业字段；带来源与明确确认的人工核验 | `components/onboarding.tsx`、`lib/profile-extraction.ts`、`api/profile-extract`、`lib/workspace-state.ts` | profile / workflow 测试 |
| M2 双边发现 | 投资侧 GitHub、Hugging Face、arXiv；融资侧基金官网/公告导入；双方公开页面与招聘页采集；新闻搜索配置入口；检索结果入库而非只显示网页卡片 | `lib/public-sources.ts`、`lib/knowledge-server.ts`、`components/knowledge.tsx` | 采集/重定向/域名/去重测试，本机真实接口与页面验证 |
| M3 证据知识库 | 按账户及身份隔离的主体、来源、原文、主张、关系、核查发现、采集运行记录；URL 去重；人工确认关联；PDF/文本私有材料提取入库；文件删除清理派生证据 | `db/schema.ts`、`drizzle/0001_knowledge.sql`、`api/knowledge`、`api/analyze`、`api/files` | 实际 SQLite 仓库测试、身份隔离、删除传播及本地接口验证 |
| M4 跨源核查 | 对齐主体、期间、范围、单位和币种；ARR/营业收入不可直接比较；数值差异不判定欺诈；研发自述与招聘/公开活动变化的非因果解释；复核理由和状态；证据改变后重新复核 | `lib/knowledge.ts`、`lib/evidence-extraction.ts` | 单位/同源/期间/范围/币种/引用校验测试；两份主张 → 发现 → 人工复核 → 重读保留 |
| M5 双向匹配 | 投融资两端共用服务端推荐链路；持久化画像、可见证据、统一事件反馈共同参与；硬条件先过滤；关键词分词 + 人工概念向量/同义词检索；分别计算双方适配并取平均为 PairScore；质量/新鲜度/风险独立展示；多样性排序和已看去重 | `lib/recommendation-server.ts`、`/api/recommendations`、`lib/matching.ts`、`components/explore.tsx` | 匹配引擎、统一事件及推荐服务测试；浏览器检查两端发现入口 |
| M6 工具型 Agent | 模型规划受限工具；实际执行公开搜索、证据检索、交叉核查、匹配、公式计算、交易待办读取、可编辑草稿；展示工具步骤和引用；画像修改需确认；逐工具权限；按当前对象保存历史上下文、可单轮停用、财务追问继承明确用户输入 | `lib/agent-tools.ts`、`api/agent`、`components/agent-panel.tsx` | provider / agent-tools 测试；浏览器真实 DeepSeek 任务返回 300÷50=6 个月，并展示工具轨迹 |
| M7 Deal Room | 指定对象交易记录、研究→意向→双方模拟确认→会谈→尽调→条款→决策/关闭；服务端逐步校验；负责人、日期、原因、待办、纪要、资料、草稿预览与确认记录；关联风险复核 | `components/operations.tsx`、`lib/workspace-state.ts`、`api/state` | workflow 阶段/布尔/新建/主体/关闭边界，乐观版本冲突与同源写入测试 |
| M8 数据飞轮 | 平台架构能力，无独立双端菜单；两端业务变化投影为统一事件，共用服务消费授权反馈；企业—投资机构固定方向与来源分级；画像内管理授权及偏好，交易内登记实际业务自报；真实/模拟隔离、去重、衰减与曝光校正；保留内部诊断及清除机制 | `lib/platform-flywheel*.ts`、`lib/recommendation-server.ts`、`lib/learning-insights.ts`、`lib/flywheel*.ts` | 统一事件的事务/隔离/撤回及服务端推荐测试；见 `DATA_FLYWHEEL.md`、`PLATFORM_ARCHITECTURE.md` |
| M9 金融工具 | 六类资本诊断、资金需求与里程碑、Runway/毛利率/投后估值/稀释/MOIC、可编辑股权表与两种期权池假设、双方尽调框架、输入来源、保存/恢复/导出 | `lib/finance.ts`、`components/financial-tools.tsx` | finance 数值、缺失、零分母、无穷、股权守恒与期权池测试 |
| M10 变化监测 | 关注真实主体、逐页读取全部公开来源、网址与版本去重、变化片段及主题记录；按同一主体确认联合研究；本地服务运行时可按 1/6/12/24 小时后台巡检；租约去重、失败计数与重试 | `watchKnowledge`、`KnowledgeWatch` | 去重/引用更新与记录测试；按需巡检入口 |
| 第 19 节指标 | 保留内部评估：来源计数、证据追溯、确认关联比例、复核误报、曝光后互动及用户自报业务转化；分母限当前账户、角色和留存窗口 | `lib/flywheel.ts`、`lib/flywheel-server.ts` | 不冒充全站指标、独立核验准确率或已验证的网络效应 |

## 本次验收命令

```powershell
node node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/test-all.mjs
node scripts/run-framework.mjs build
$env:FUNDLINK_TEST_URL='http://127.0.0.1:5173'
node --import ./scripts/test-loader.mjs scripts/verify.mjs
node --import ./scripts/test-loader.mjs scripts/verify-capital.mjs
node --import ./scripts/test-loader.mjs scripts/verify-profile.mjs
node --import ./scripts/test-loader.mjs scripts/verify-live-evidence.mjs
```

## 5 分钟验收路径

1. 首页选投资或融资；建档时输入一段自述，抽取后只采用勾选字段。
2. 发现机会查看三项推荐理由、两个方向评分、证据质量和下一步；换批后对象不重复；明确点击重新浏览才重置。
3. 雷达检索项目或导入官网，进入证据库核对 URL、采集时间与主张。资料库可上传 PDF/文本并归入已有主体。
4. 在证据库为同一主体录入 ARR 与营业收入，填写包含数值的原文，核对“不直接可比”的解释；填写理由后改变复核状态。
5. Agent 选择对象研究；展开实际工具轨迹与引用；用明确数字计算；准备草稿后在交易工作台预览模拟发送。
6. 在画像中主动授权学习；在发现和交易页面产生反馈，再返回发现查看服务端生成的结果。偏好建议可确认或撤销，撤回授权后停止使用行为调整。

## 明确的交付边界

- 内置企业、基金与双方意向为模拟案例；未认领公开线索与真实账户不合并。界面明确区分公开资料、用户自述、推断和人工复核。
- 数据飞轮是双端共用事件和推荐基础设施，不等于跨客户私有数据共享。当前真实路径仍使用账户/角色范围内的主体标识；跨账户主体认领、组织权限及双方独立确认尚未接通。
- 检索算法是可解释的本地混合检索，不声称训练过专属 embedding 或学习排序模型。真实线索缺少金额、币种、地域或身份资料时保留待确认。
- 新闻搜索需另行配置 `BRAVE_SEARCH_API_KEY`。未配置时返回明确错误，官网/公告链接导入仍可用。专业付费金融数据库不包含在本地文件中。
- 语音依赖浏览器 SpeechRecognition 支持和用户点击授权；不支持时仍可使用文字。扫描 PDF 需先 OCR；自动资料分析支持文本 PDF、TXT、Markdown、CSV、JSON。
- 支持手动及本地后台巡检。后台由 npm run dev 启动，只在本地网站进程运行期间执行；电脑休眠或关闭服务时不会执行，恢复后检查到期任务。没有独立云端 Cron 或邮件/系统通知。
- 对外邮件、成员邀请、真实资料共享、签署与资金交易没有接入。本地 Deal Room 记录模拟审批和共享意图，文件仍只对其拥有者可见。这符合原文 17.2 排除的真实交易执行范围。
- 模型失败会明确提示；资料抽取可以退回标注清楚的规则草稿。无模型时仍可使用检索、规则核查、匹配、公式和规则草稿。
- 移动端提供响应式布局；麦克风支持由浏览器决定。所有本地数据存储于 `.wrangler/state`，源码压缩包不包含用户记录或密钥。
