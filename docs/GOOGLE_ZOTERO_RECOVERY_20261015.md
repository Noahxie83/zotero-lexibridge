# Google 真实 Zotero 单次恢复验证

结果：**当前网络环境下 Google 真实 Zotero 翻译通过**。

- 验证时间：2026-10-15；宿主 Zotero 10.0.6，插件版本 1.2.2。
- 在新隔离 profile `verification-google-once-20261015` 中，使用当前已验收包，仅启用 Google 来源查询一次：`Neural networks can learn useful representations.`
- 插件向 Google 固定接口发出 **1 次 GET**。脱敏请求记录为 HTTP **200**、`application/json; charset=utf-8`；返回结构成功解析为 1 个有效译文段。
- `engineId=google`、`sourceId=online:google`；弹窗显示“神经网络可以学习有用的表示。”，复制内容完全匹配，来源状态为“已完成”，成功诊断隐藏，未进入冷却。
- Microsoft、有道和 MyMemory 的实时探测均关闭；本轮其他引擎真实请求数为 0。未重试 Google，也未更改适配器、代理或常用配置。

## 包与代码校验和

使用的已验收测试包：[local-dictionary-1.2.2-youdao-mymemory-test.xpi](../dist/local-dictionary-1.2.2-youdao-mymemory-test.xpi)

- 原测试包 SHA-256：`175828f7dbf1638c5a321a8079acbb2ecd421e6924a7e717f5e2040518fa7567`
- 原包产品 `content/plugin.js` SHA-256：`0e7fa6fce48126600e1b0fc7b66b242676848b2a133ec3c936df50f478b0fd14`
- 隔离运行扩展 XPI SHA-256：`7c9899046d52476b9f3b3f4e9443607e1a1ca0931b50e2e478bb74a6013eb682`
- 隔离运行中经测试 harness 插桩的 `content/plugin.js` SHA-256：`032f3715493dc9475456e17b4c028ca4891677b7e99778aa8924dfc29c803afd`

隔离运行使用原测试包解包出的产品代码；隔离 XPI 只增加验证 harness 与轻量观测插桩，不改翻译适配器。测试包版本未变，未重新构建。

完整脱敏数值和状态记录见 [JSON 证据](verification/google-zotero-recovery-20261015.json)。此前 Google 失败报告均保留；本记录仅补充当前环境下的成功证据。
