# 有道、MyMemory 接入与 Google 联网诊断交付

日期：2026-10-15。版本保持 1.2.2。所有改动叠加在现有未提交工作区，没有回退或清理已有成果。

## 新增在线来源

- 新增中央引擎目录 `src/online-engine-catalog.js`，统一维护引擎 ID、默认来源 ID、名称、接收方说明、支持列表和来源数量上限。Google、Microsoft Edge、有道和 MyMemory 均由各自独立来源表示，新增来源默认关闭。
- 有道：`engineId: youdao`、`online:youdao`，POST 表单到 `aidemo.youdao.com/trans`，只接受 HTTP 2xx、`errorCode` 为 0 和有界译文。
- MyMemory：`engineId: mymemory`、`online:mymemory`，匿名只读 GET，固定 `langpair=en|zh-CN`；要求 HTTP 2xx、`responseStatus: 200`、配额未耗尽及有界译文。不发送邮箱，不写入翻译记忆。
- 两个适配器保留原文本、标点、256 字符/16 词限制，共用在线并发 1 和查询取消，分别维护冷却状态；不做内部重试或跨引擎切换。fallback 仍按用户保存的顺序执行。
- 来源名称及启用说明来自中央目录。Google、Microsoft、本地来源原有 ID、顺序、启用状态和所选来源保持兼容。来源列表上限随四个在线引擎更新为 5004；备份和路径重定位继续调用相同来源校验规则。

## Google 修正与诊断

- 已确认代码缺陷：原实现只在 `status` 为 truthy 时检查非 2xx，导致缺失状态或 `status: 0` 的响应可能进入 JSON 解析。现在仅接受整数 HTTP 2xx；缺失状态、0、非 2xx 均失败，并有回归测试。
- Google 请求显式使用匿名模式；保留单一固定端点、10 秒超时、XHR 取消、429 冷却和禁止自动重试。传输异常改为脱敏提示，不显示含查询文本的 URL 或响应页。
- Google **仍受限，未恢复**。本轮总控对其固定端点只请求一次：HTTP 429、`text/html`、Google 拒绝页、无 `Retry-After`。历史真实 Zotero 证据也记有一次 HTTP 429。本轮新安装包没有再次请求 Google；Google 在隔离 UI 测试中的请求是模拟响应，不能证明已恢复。
- 当前进程配置了 `HTTP_PROXY`、`HTTPS_PROXY`，Windows 系统代理也启用；值未记录。尚无路由隔离证据，不能归因到代理，也不能仅凭请求头假设解释 429。没有轮换域名、代理或重复尝试。

Zotero 官方说明其默认使用系统代理设置，并指出其他程序可能采用不同代理路径；可以在 Zotero **设置 → 高级 → Config Editor** 检查 `network.proxy.type`（默认推荐值为 5，使用系统代理），并与 Windows 系统代理及当前网络出口策略核对。[Zotero 连接错误与代理说明](https://www.zotero.org/support/kb/connection_error)。若该端点仍返回 429/拒绝页，需要确认代理或网络出口是否对它限流/拦截，或请网络管理员检查；不要关闭 TLS 校验。

## 验证

开始时运行 `npm test`：**131 通过，0 失败**，日志见 [基线](verification/pre-youdao-mymemory-npm-test.log)。实现后：

| 类型 | 实际结果 |
| --- | --- |
| 自动化/模拟测试 | `npm test`：**144 通过，0 失败**。包括新增引擎解析、来源迁移/备份、业务错误、MyMemory 配额、取消、超时、冷却隔离、分派归属、默认关闭、fallback 顺序和 Google 缺失/0 状态测试 |
| F1 回归 | `node --test tests/toolbar-lifecycle.test.mjs`：**2 通过，0 失败** |
| 普通程序联网 | Node fetch 对有道、MyMemory 各请求 1 次；均 HTTP 200，业务状态通过，`hello` → `你好`。详见 [普通程序探测](verification/youdao-mymemory-node-probe.json) |
| 真实 Zotero | Zotero 10.0.6，全新隔离 profile，**48 步通过**。通过真实 Zotero HTTP 各请求有道和 MyMemory 1 次，弹窗显示正确来源和译文，复制内容匹配；禁用两来源时 0 请求。详见 [宿主原始报告](verification/youdao-mymemory-zotero-integration.json) |
| Google | **仍受限**。沿用本轮唯一 HTTP 429 探测与历史 Zotero 429 证据；本轮未额外请求 Google。详见 [脱敏诊断记录](verification/google-diagnostic-followup.json) |
| 构建 | 成功，版本未变；新包与宿主验证所用 XPI 的 SHA-256 一致，验证工具从该 XPI 解包插件代码后才生成隔离测试副本 |

## 测试安装包

- [local-dictionary-1.2.2-youdao-mymemory-test.xpi](../dist/local-dictionary-1.2.2-youdao-mymemory-test.xpi)
- SHA-256：`175828f7dbf1638c5a321a8079acbb2ecd421e6924a7e717f5e2040518fa7567`
- 大小：323286 字节。包名及校验信息见 [包记录](verification/youdao-mymemory-package.json)。旧测试包和历史报告均保留。

没有提交、推送、发布、升级版本或修改线上更新信息。
