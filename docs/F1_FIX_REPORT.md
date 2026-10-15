# F1：销毁阅读器后工具栏节点异常修复

2026-10-15，Asia/Shanghai。本报告区分本次执行与已有证据。

## 确认与最小修复

实际基线仍为 1.2.2 / 764da04，已有查询来源、拖动和迁移实现均未提交。本次未重置或覆盖这些实现；开始时为原有改动生成 [SHA256 快照](verification/f1/preexisting-worktree.json)。

读取独立审查报告 `../independent-verification/VERIFICATION_REPORT.md` 的 F1，并核对其已有真实 Zotero 失败记录：原 8.4 的两次 scanLibrary 均因 `can't access dead object` 失败。[原失败摘录](verification/f1/prior-8.4-failure.json) 是本次读取的旧证据，不是本次亲自执行的修复前宿主复现。

当前 `src/main.js` 的 updateUI 在 extraToolbar 循环直接读取节点 isConnected、写入 disabled；异常会中断整次界面刷新。相邻 toolbarButtons 和 selectors 循环已有逐节点保护。本次只为 extraToolbar 循环补上同样的 try/catch：断开连接或属性访问、更新抛错时从集合移除该节点，继续处理其他节点。没有修改公共接口、来源调度或设置协议。

新增 `tests/toolbar-lifecycle.test.mjs`，通过真实 createApp 和注册的工具栏回调建立节点，分别让 isConnected getter、disabled setter 抛错。修复前 **0/2 通过**，与独立证据相同的 TypeError 从 scanLibrary 冒出；修复后 **2/2 通过**。断言覆盖失效节点只访问一次、断开节点移除、后续查询按钮及主按钮更新、后续刷新/来源切换成功、新工具栏仍正常。[失败日志](verification/f1/regression-red.log) · [通过日志](verification/f1/regression-green.log)。

## 本次亲自执行的验证

| 验证 | 结果 | 本次证据 |
| --- | --- | --- |
| npm test | **120 通过，0 失败** | [日志](verification/f1/npm-test.log) |
| 独立 Node 测试，两份原验证器测试文件 | **37 通过，0 失败** | [日志](verification/f1/independent-node.log) |
| npm run build | **成功** | [日志](verification/f1/build.log) |
| 原独立 Zotero 验证器，代码未修改 | **21/21 通过，8.4 PASS** | [报告](verification/f1/independent-zotero.json) |
| F1 生命周期专项，未插桩产品包 | **10/10 通过** | [报告](verification/f1/focused-toolbar-lifecycle.json) |
| 产品原真实 Zotero 集成流程 | **44 条记录，流程通过** | [报告](verification/f1/product-zotero.json) |
| 安装包检查 | 版本 1.2.2，未包含验证脚本或探针 | [元数据](verification/f1/package.json) |

三个实际宿主复测均为 **Zotero 10.0.6 / Windows**，使用本次新建的 profile/data、原创 PDF 和词典样本；没有使用浏览器预览或用户常用配置。独立验证器源文件未改动，[输入文件校验和](verification/f1/verifier-inputs.json) 可追溯。本次独立验证由修复者亲自重跑，未声称有新的第三方审查签字。

| 新隔离配置目录（项目父目录下） | 用途 |
| --- | --- |
| verification-f1-focused-20261015-a | 分别验证普通阅读标签和独立阅读窗口 |
| verification-f1-independent-20261015-a | 原完整独立验证器，含 8.4 |
| verification-f1-product-20261015-a | 产品完整宿主集成流程 |

专项对两类阅读器分别执行：关闭前查询；关闭后连续两次刷新五本词典；关闭后切换到不同本地来源并确认选择提交；重新打开相同类型阅读器，再刷新、切换来源、查询并确认释义 DOM；再次关闭后刷新。两类各五项，全部通过。

原独立检查 8.4 在新配置中关闭独立阅读窗口后，两次 scanLibrary 均成功，明确从旧证据的 FAIL 转为本次 PASS。普通标签关闭后及两类重新打开的恢复能力由上述专项单独验证，未用 8.4 的覆盖范围替代。

可复现命令（仓库根目录）：

```powershell
npm test
node --test ../independent-verification/tests/query-sources.independent.test.mjs ../independent-verification/tests/settings.independent.test.mjs
npm run build
node ../independent-verification/scripts/prepare-independent-zotero.mjs <新的独立验证目录>
node ../independent-verification/scripts/prepare-independent-zotero.mjs <新的专项目录> --harness=../../zotero-local-mdx-click/tests/zotero-toolbar-lifecycle.js --entry=runToolbarLifecycleVerification --report=toolbar-lifecycle.json
node scripts/prepare-zotero-verification.mjs <新的产品验证目录>
```

准备脚本仅创建配置。随后使用 Zotero 的 `-no-remote -profile <新目录/profile>` 启动对应配置，等待报告完整写入；报告的 ok/summary 必须通过。每次使用新目录，不能复用已有测试资料库。

## 本次修改与保留

- 产品逻辑仅修改 `src/main.js` 的上述循环。
- 新增 `tests/toolbar-lifecycle.test.mjs`、`tests/zotero-toolbar-lifecycle.js`。
- 更新 `docs/QUERY_SOURCE_DELIVERY.md`；新增本报告及 `docs/verification/f1/` 证据。
- 重新构建本地 XPI；保留先前测试包和历史证据，不改独立审查原报告。
- 原有实现文件的保留情况见 [工作区比对](verification/f1/worktree-preservation.json)。

## 限制与测试包

Google 实网翻译成功继续列为**未验证**。已有真实请求状态为 **429**；本次未重发 Google 请求。独立验证中的在线路径是模拟测试，不能作为实网成功证据。

本次未重跑性能微基准、未测试大型真实词库/长期内存或其他 Zotero 版本；这些仍沿用初次交付的历史记录和限制，不作为本轮新结果。

新版测试包：`dist/local-dictionary-1.2.2-query-sources-f1-test.xpi`。校验和：`dist/SHA256SUMS-f1-test.txt`。SHA256 和大小见 [安装包元数据](verification/f1/package.json)。版本保持 1.2.2；未提交、推送、创建 Release 或更新线上版本。
