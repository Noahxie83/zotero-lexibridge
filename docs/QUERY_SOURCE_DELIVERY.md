# 查询来源与可拖动弹窗：实施交付

## Microsoft Edge 独立来源追加交付（2026-10-15）

Edge 实验性来源已独立接入，默认关闭，保留 Google 和其他来源状态。新适配器、按引擎分派、真实请求与响应校验、Zotero 10.0.6 隔离宿主验证及新测试包见 [Microsoft Edge 交付报告](MICROSOFT_EDGE_DELIVERY.md)。本轮产品测试 129/129、F1 回归 2/2，版本维持 1.2.2。

本节是对后续 Edge 能力的追加记录；以下 F1 与 Google 部分保留历史时间点及结论。

日期：2026-10-15。技术总控已完成契约冻结、三路实现分发、交付审查与共享核心集成。

## F1 修复后复测（本次最新交付）

已修复关闭阅读器后 extraToolbar 节点访问抛出 `can't access dead object`、阻断后续刷新和来源切换的问题。产品逻辑仅为 updateUI 的该循环增加逐节点异常隔离，失效节点从集合移除，保留已有全部实现。

本次亲自执行：产品测试 **120/120**、独立 Node 测试 **37/37**、原独立真实 Zotero 验证 **21/21**，其中 **8.4 从 FAIL 转为 PASS**；新隔离配置中的普通标签/独立窗口关闭与重开专项 **10/10**，产品完整宿主流程亦通过。构建成功。Google 本次未联网测试，继续保留已有 429、实网翻译成功未验证结论。

新版安装包为 `dist/local-dictionary-1.2.2-query-sources-f1-test.xpi`，校验和 `dist/SHA256SUMS-f1-test.txt`。修复细节、复测命令、新旧证据区分和本轮文件列表见 [F1_FIX_REPORT.md](F1_FIX_REPORT.md)；以下保留初次交付记录。

## 基线与范围

开始时核对 package.json 与 addon/manifest.json 均为 **1.2.2**，HEAD **764da04**，Git 工作区干净；仓库和两级项目父目录未发现 AGENTS.md。现有测试基线 **78 通过 / 0 失败**。没有发现需要补批的明确产品选择；保持既定 256 字符、16 词范围。

公共协议见 [QUERY_SOURCE_CONTRACT.md](QUERY_SOURCE_CONTRACT.md)。

## 修改摘要

- 保留总开关，新增默认开启的 clickEnabled，沿用 selectionEnabled。四种组合独立生效，关闭自动查询仍能手动查询；关闭划选查询保留插件批注工具；原生菜单模式继续暂停自动划选查询。
- 在本地解析前保存 translationText，覆盖点击、划选、手动及历史；保留翻译标点，本地候选和词形算法沿用原逻辑。
- 来源使用稳定 ID，路径与引擎 ID 分离。统一启停、排序和选择；当前模式只查选中来源，回退严格顺序命中停止，联合本地并发 2、在线全插件并发 1，按用户顺序逐来源展示。
- Google 默认关闭，界面标注实验性并说明文字会发送至服务方。在线结果只有纯文本与复制，不能进入本地收藏、笔记、MDD、原排版或音频路径。
- 每次查询有独立 ID 与取消作用域；新查询、关闭、设置变化、阅读器卸载和停用会取消旧查询。核对安装版 Zotero HTTP 源码后，以 requestObserver 取得 XHR 并 abort，显式禁用两条自动重试路径；429 共享冷却，不轮换域名，不合并跨窗口进行中的请求。
- 只允许标题空白区启动拖动，使用 PDF iframe 的 client 坐标；位置与固定状态独立。自动锚点只计算一次，后续更新仅夹紧边界；输入、历史及内部词条跳转传递位置快照。
- 渐进刷新只更新对应来源。所有来源共享单个弹窗资源预算。词典加载及块读取去重保留；应用缓存最多 6 个空闲索引，使用中索引由租约保护，重载最多保留一个旧索引，释放后回到上限。
- 备份兼容旧 version 1，校验新配置并支持路径重定位；旧备份缺少 clickEnabled 时保留当前用户值。清理函数组合执行，单个清理异常不阻止其余清理。

## 初次交付验证（历史记录）

| 检查 | 结果与证据 |
| --- | --- |
| npm test | **118 通过 / 0 失败**，含原 78 项；[完整日志](verification/npm-test.log) |
| npm run build | 成功；[日志](verification/build.log) |
| git diff --check | 通过；仅有现有文件换行规范提示 |
| 真实 Zotero | **10.0.6，隔离配置完整通过**；[结构化报告](verification/zotero-integration.json) |
| Google 真实网络 | 单次固定端点示例请求返回 **429**，不能视为翻译连通成功；[记录](verification/google-connectivity.json) |

真实 Zotero 测试使用新建独立 profile/data 与原创 PDF/词典样本，没有修改用户常用配置，没有使用浏览器预览代替验证。覆盖两本 MDX、一本压缩 StarDict、一本压缩 DSL，以及原排版链接、词典音频、批注保存/重开、生词与笔记、手动输入、快捷键、历史、拼写建议、四种自动触发组合、online-only 来源选择/纯文本/复制/能力限制、慢在线模拟结果、关闭取消、来源固定顺序、本地拖动后内部跳转与 resize、分栏、独立阅读窗口和停用恢复原生菜单。

拖动证据使用跨窗口克隆的完整 PointerEvent 参数，确认 left 从 **42 px 移到 92 px**，再检查慢结果返回及输入/历史后位置相同；避免用浮点字符串差异冒充拖动。在线模拟运行于真实 Zotero 内，但仍明确标记为**离线模拟**。真实网络 429 与模拟成功分别记录。

新增单元测试覆盖受限并行、渐进顺序、严格回退、取消排队/运行任务、隔离窗口作用域、XHR 延迟观察时的取消/超时、429 冷却、离线与异常响应、备份迁移/重定位、位置状态及监听清理、索引租约。执行者均保留先失败再修复的证据。真实集成另发现并修复了 capture 阶段过早检查 Zotero 临时 drag 状态导致单击被跳过的问题。

复审还修复了刷新覆盖在线选择、旧本地选择覆盖较新在线选择、过期来源切换重新打开旧弹窗、两套排序控件不一致，以及清理异常跳过后续资源释放的问题。

## 性能比较

可复现命令：`node --expose-gc scripts/benchmark-query-sources.mjs`。五本生成 MDX，每本 2000 词目，真实临时文件读取，三轮中位数；比较旧串行 API/缓存 3 与当前受限并行/缓存 6。完整数据见 [query-performance.json](verification/query-performance.json)。

| 场景 | 旧版首结果 / 总时间 | 当前首结果 / 总时间 | 索引构建次数：旧 → 新 |
| --- | --- | --- | --- |
| 冷查询 | 55.07 / 55.07 ms | 16.71 / 39.63 ms | 5 → 5 |
| 热查询 | 42.62 / 42.62 ms | 0.26 / 0.38 ms | 4 → 0 |

缓存保留索引为 3 → 5（当前上限 6）。冷查询后进程堆增量中位数约 **1.94 → 2.96 MiB**，说明减少重建有内存代价。报告也记录 ArrayBuffer 增量；这类进程快照受临时 I/O 和 GC 影响，不能解释为索引精确占用或峰值内存。上述数据是引擎小型样本基准，尚无用户大型商业词库样本，不能外推到真实大词库，也没有完成长时间运行的内存稳定性测试。

## 限制与安装包

1. Google 真实翻译成功未验证，环境仍返回 429；首版维持实验性、默认关闭。下一次显式网络验证可给隔离配置准备脚本加 `--network`，默认不会重复发送请求。
2. 大型真实词库性能、长时间内存趋势及其他 Zotero 版本未验证；本轮实际宿主为 10.0.6。
3. 版本保持 1.2.2，安装包是本地测试构建。没有提交、推送、发布 Release、修改 updates.json 或线上版本。

安装包：`dist/local-dictionary-1.2.2-query-sources-test.xpi`。校验和：`dist/SHA256SUMS-test.txt`；包大小、SHA256 与验证摘要见 [package.json](verification/package.json)。以下为本轮完整文件清单。

<!-- FILE_LIST -->

| 类型 | 文件 |
| --- | --- |
| 修改 | `addon/bootstrap.js` |
| 修改 | `addon/content/preferences.xhtml` |
| 修改 | `addon/prefs.js` |
| 新增 | `docs/QUERY_SOURCE_CONTRACT.md` |
| 新增 | `docs/QUERY_SOURCE_DELIVERY.md` |
| 修改 | `docs/USER_GUIDE.md` |
| 新增 | `docs/verification/build.log` |
| 新增 | `docs/verification/google-connectivity.json` |
| 新增 | `docs/verification/npm-test.log` |
| 新增 | `docs/verification/package.json` |
| 新增 | `docs/verification/query-performance.json` |
| 新增 | `docs/verification/zotero-integration.json` |
| 新增 | `scripts/benchmark-query-sources.mjs` |
| 修改 | `scripts/prepare-zotero-verification.mjs` |
| 修改 | `src/appearance.js` |
| 修改 | `src/definition-view.js` |
| 修改 | `src/dictionary-pool.js` |
| 新增 | `src/google-translate.js` |
| 修改 | `src/main.js` |
| 新增 | `src/popup-position.js` |
| 修改 | `src/preferences-panel.js` |
| 修改 | `src/query-controls.js` |
| 修改 | `src/query-engine.js` |
| 新增 | `src/query-sources.js` |
| 修改 | `src/render.js` |
| 修改 | `src/selection-query.js` |
| 修改 | `src/settings-backup.js` |
| 新增 | `src/source-settings.js` |
| 新增 | `tests/popup-position.test.mjs` |
| 新增 | `tests/query-integration.test.mjs` |
| 新增 | `tests/query-sources.test.mjs` |
| 新增 | `tests/source-settings.test.mjs` |
| 修改 | `tests/zotero-integration.js` |
