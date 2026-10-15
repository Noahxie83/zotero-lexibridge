# 短句实测补项与 Google 网络路径诊断

日期：2026-10-15。只运行指定有道/MyMemory短句实测，没有修改插件产品代码、用户常用 Zotero 或系统网络设置。

## 短句实测

在 Zotero 10.0.6 的新隔离配置中，使用已验收插件版本 1.2.2 测试包（SHA-256：`175828f7dbf1638c5a321a8079acbb2ecd421e6924a7e717f5e2040518fa7567`）执行 **49 步宿主验证**，并分别向有道和 MyMemory 发出一次真实请求。两个来源均返回“神经网络可以学习有用的表示。”，HTTP 与业务状态成功；弹窗来源 ID 和 engineId 匹配，各自复制内容与译文完全一致，成功诊断均隐藏。在线禁用检查为 0 请求。此次 Google 请求数为 0。

| 服务 | engineId / sourceId | HTTP | 业务状态 | 译文 | 复制与显隐 |
| --- | --- | ---: | --- | --- | --- |
| 有道 | `youdao` / `online:youdao` | 200 | `errorCode=0` | 神经网络可以学习有用的表示。 | 复制匹配；诊断隐藏 |
| MyMemory | `mymemory` / `online:mymemory` | 200 | `responseStatus=200`，`quotaFinished=false` | 神经网络可以学习有用的表示。 | 复制匹配；诊断隐藏 |

原始隔离报告位于 `verification-youdao-mymemory-sentence-20261015/report.json`；脱敏证据见 [短句验证记录](verification/youdao-mymemory-sentence-zotero.json)。验证器从已验收 XPI 解包插件代码后运行，记录的包和插件 bundle 哈希均与上轮验收一致。

## Google 路径核对

- 本次诊断工具进程仍配置 `HTTP_PROXY` 和 `HTTPS_PROXY`，Windows 用户级手动代理也仍启用、无 PAC。代理 host:port 在内存中比较后相同；原始值和 userinfo 未显示或保存。Zotero 默认 profile 没有显式代理覆盖，按默认 `network.proxy.type=5` 使用 Windows 系统代理；没有读取 Zotero 进程环境变量。
- 默认 Zotero profile 的 `prefs.js` 没有显式 `network.proxy.type` 或手动代理覆盖。Zotero 文档说明默认 `network.proxy.type=5` 使用系统代理，因此有效配置继承 Windows 用户级代理。上轮记录的配置状态与本轮一致；由于旧代理端点值没有留存，不能确认端点本身是否变化。
- 没有普通程序对 Google 的连接超时实测证据。本轮独立 UI 运行的 Google 状态仅推断为冷却，没有记录 HTTP 数字状态；这不是 429 证据。历史另一份 Zotero 记录有 429，但不属于本轮验收包的请求。
- Google 严格 HTTP 状态校验只修复缺失状态/0 被误解析的问题，**不能解释或修复 429**。没有证据表明路由有变化，本轮不重复请求；Google 状态仍为“未恢复”。见[代理核对记录](verification/google-proxy-path-diagnostic.json)。

## 下一步

本轮 profile 没有显式代理值、默认使用系统代理，且诊断工具进程代理与 Windows 系统代理的 host:port 一致。可在 Zotero Config Editor 复核 `network.proxy.type`；若显示显式类型或手动设置与本轮 profile 不同，再核对 `network.proxy.http`、`network.proxy.http_port`、`network.proxy.ssl`、`network.proxy.ssl_port`。不要改常用 profile 或 Windows 网络设置。

当前网络路径上不要重复请求。请网络管理员检查代理/出口对 `translate.googleapis.com` 的访问策略或限流记录。若之后确认有获准的不同路由，只在新的隔离 profile 中按批准配置调整，再用当前测试包发送一次 `hello`；验证脚本的 `--google-diagnostic` 选项会记录脱敏 HTTP 状态、Content-Type、响应类别、冷却状态和译文是否显示。获得有效译文前，Google 仍标为“未恢复”。代理依据见[Zotero 官方连接错误说明](https://www.zotero.org/support/kb/connection_error)。

本轮没有提交、推送或发布，也没有覆盖历史报告或旧包。
