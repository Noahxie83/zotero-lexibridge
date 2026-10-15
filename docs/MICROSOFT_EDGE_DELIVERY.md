# Microsoft Edge 翻译接入交付

日期：2026-10-15。版本保持 1.2.2。本报告及证据只追加本轮结果，旧测试包、F1 报告和历史证据均保留。

## 实现

- 新增独立在线来源 `engineId: "bing"`、ID `online:bing`，偏好名称为“Microsoft 翻译（Edge，实验性）”。迁移只追加默认关闭的新来源；现有 Google ID、启用、顺序及 `selectedSource` 均不转写。Google 与 Edge 仍可独立启用、选择及排序。
- 新增 Edge 适配器与按 `engineId` 分派模块。请求为 POST JSON 数组，只发送 `translationText`，固定目标 `zh-Hans`，不传源语言。请求使用 Zotero HTTP `anon: true`，只设置 `Content-Type`，不注入 API Key、Cookie、Authorization 或伪造 User-Agent。
- 输入继续限制在 256 字符、16 词。响应必须是 HTTP 2xx，结构中含且仅含一个有界非空译文，并明确匹配目标语言；拒绝错误对象、畸形/超限内容和错误目标。响应只作为在线纯文本及复制能力展示。
- Edge 和 Google 共用全插件在线并发 1 与查询取消作用域；超时、关闭和新查询会中止实际 XHR。429 冷却按引擎独立，禁止自动重试；Google 失败不会转发到 Microsoft，反之亦然。
- 验证脚本仅在显式 `--network` 下发送真实请求，单次 Zotero 运行最多两条示例。新增构建后缀支持，使本轮包不会覆盖旧测试包。

## 验证结果

扩展前工作区测试基线为 **120/120**，见 [基线记录](verification/edge-baseline.json)。

| 类别 | 实际结果 | 证据 |
| --- | --- | --- |
| 模拟/单元测试 | `npm test`：**129 通过，0 失败**；含原 120 项和 9 项新增断言 | [完整日志](verification/edge-npm-test.log) |
| F1 回归 | `node --test tests/toolbar-lifecycle.test.mjs`：**2/2 通过** | [日志](verification/edge-f1-regression.log) |
| 普通联网探测 | Node fetch 两次真实 POST 均 HTTP 200；`hello` → `你好`、`Hello, world!` → `你好，世界！`。无 Cookie、API Key、源语言字段或自定义 User-Agent | [请求与响应摘要](verification/edge-network-probe.json) |
| 真实 Zotero 端到端 | Zotero **10.0.6**，新建隔离 profile/data，完整集成流程 **46 步通过**。插件适配器通过 Zotero HTTP 发出两条 POST；单词和短句译文均显示在 Microsoft 来源卡片中，点击复制后确认复制回调接收的内容与译文相同。目标语言自动识别，两个请求都未带 `from` | [结构化原始报告](verification/edge-zotero-integration.json) |
| Edge 关闭行为 | 同一真实宿主验证中，禁用所有来源后零 Edge 请求 | [端到端报告](verification/edge-zotero-integration.json) |
| 构建与安装包 | 构建成功；版本未变；新包为 `local-dictionary-1.2.2-microsoft-edge-test.xpi` | [构建日志](verification/edge-build.log)、[包校验记录](verification/edge-package.json) |

普通联网探测显示 Edge 返回对象可能省略顶层 `to`，但在每个 `translations` 项上返回 `to: "zh-Hans"`。适配器接受这两种明确目标语言的位置；若两处都缺失或任一处给出不匹配目标，都会拒绝译文。实际 Zotero 查询成功，使用的是适配器而非旁路探针。

首次隔离宿主尝试的译文请求成功，但新增验证脚本误选了状态段落作为译文，导致复制断言失败；在全新 profile 修正选择器后，完整流程通过。保留首次记录以区分验证器修正与产品结果：[首次运行报告](verification/edge-zotero-harness-attempt.json)。

## 剩余限制

- Edge URL 来自本轮可访问的公开示例；实验性公共接口可能改变或限流，无服务稳定性保证。Google 本轮未发真实请求；既有 429 记录仍不视为成功。
- 宿主端只验证 Zotero 10.0.6 / Windows。首版仍只翻译最多 256 字符、16 词，不支持全文。
- 真实 Zotero 的复制验证确认了插件复制按钮调用复制 API 并传入正确译文；隔离自动化不作为桌面剪贴板人工粘贴验证。

没有提交、推送、发布或修改线上更新信息；未升级版本。
