# 查询诊断显隐修复交付

日期：2026-10-15。版本保持 1.2.2。本轮只调整诊断显隐逻辑与验证夹具；Microsoft Edge、Google、F1 和既有查询行为均保留。

## 修改

- 每个来源按最新查询状态单独显隐诊断：`empty`、`error`、`cooldown` 显示；`idle`、`queued`、`running`、`ready`、`cancelled` 隐藏。隐藏节点使用 `hidden`，不占布局空间。
- 全局“查询与资源诊断”及折叠入口仅在存在失败来源时显示，内容只由失败来源组成。
- 本地资源加载和更多释义回调仍记录路径、资源目录及 MDD 信息；回调重新渲染时根据当前状态判定显隐，因此不会把成功来源诊断重新显示。
- 新增状态策略单测；扩展隔离 Zotero 测试，覆盖本地/在线成功、未命中、模拟 429、混合来源、失败后成功、资源加载、更多释义、历史返回、取消及零布局高度。测试夹具为“显示更多释义”加入 13 个重复词条。

## 验证

| 类型 | 结果 |
| --- | --- |
| 扩展前产品基线 | 120 项通过，依据本轮开始前用户提供的工作区基线 |
| 产品测试 | `npm test`：131 通过，0 失败；含新增诊断策略测试 |
| F1 回归 | `node --test tests/toolbar-lifecycle.test.mjs`：2 通过，0 失败 |
| Zotero 宿主 UI | Zotero 10.0.6，全新隔离 profile，45 步通过。在线响应由隔离测试中的模拟 HTTP 提供；没有发送真实翻译请求 |
| 布局检查 | 成功来源的来源诊断和全局入口均 `hidden` 且布局高度为 0；失败来源诊断可见。混合查询只显示限流来源 |
| 构建 | 成功；版本仍为 1.2.2，测试包独立命名 |

日志与结构化证据：[产品测试](verification/query-diagnostics-npm-test.log)、[F1 回归](verification/query-diagnostics-f1-regression.log)、[隔离 Zotero 原始报告](verification/query-diagnostics-zotero-integration.json)。隔离 profile 位置为 `verification-diagnostics-20261015-final-ui`。

## 安装包

- 路径：`dist/local-dictionary-1.2.2-diagnostics-visibility-test.xpi`
- SHA-256：`F9944EC3AB5C42DC43D4159CD9EEDACED9648C62F8F8A5B56530E9A852CE29DD`
- 旧测试包与历史验证报告均保留。

没有提交、推送或发布；没有修改版本或线上更新信息。
