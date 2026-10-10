<p align="center">
  <img src="docs/assets/cover.jpg" alt="Local Dictionary：本地词典，跟着论文走。支持 MDX、StarDict 和 DSL。" width="100%">
</p>

<h1 align="center">Local Dictionary · 本地词典</h1>

<p align="center"><b>Zotero 本地词典插件 · 点击与划选查词</b></p>
<p align="center">在文献阅读中查询单词与词组，使用本地词典的释义、排版和发音。</p>

<p align="center">
  <a href="https://github.com/Noahxie83/zotero-local-dictionary/releases/tag/v1.2.2"><img alt="版本 1.2.2" src="https://img.shields.io/badge/version-1.2.2-087bd0"></a>
  <img alt="支持 Zotero 10.0 系列" src="https://img.shields.io/badge/Zotero-10.0-102b46">
  <a href="https://github.com/Noahxie83/zotero-local-dictionary/actions/workflows/build.yml"><img alt="构建状态" src="https://github.com/Noahxie83/zotero-local-dictionary/actions/workflows/build.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="GPL 3.0 or later" src="https://img.shields.io/badge/license-GPL--3.0--or--later-586d7f"></a>
</p>

<p align="center">
  <a href="https://github.com/Noahxie83/zotero-local-dictionary/releases/download/v1.2.2/local-dictionary-1.2.2.xpi"><b>下载安装包</b></a> ·
  <a href="https://noahxie83.github.io/zotero-local-dictionary/"><b>体验交互示例</b></a> ·
  <a href="docs/USER_GUIDE.md">使用指南</a> ·
  <a href="docs/RESTORE.md">设置恢复</a> ·
  <a href="docs/CHANGES.md">版本变更</a>
</p>

---

**Local Dictionary** 原名 Local MDX，在 Zotero PDF 阅读器中提供 MDX、StarDict 和 DSL 离线词典查询。插件标识和已有设置保持兼容，支持覆盖升级。

**1.2.2 将 GitHub 仓库更名为 `zotero-local-dictionary`，同步安装、更新与展示页地址。** 运行 `npm run build` 可生成 `dist/local-dictionary-1.2.2.xpi`。支持范围见 [格式支持](docs/FORMAT_SUPPORT.md)。

[仓库改名与插件收录](docs/REPOSITORY_RENAME.md) · [1.2.0 新功能与验证](docs/UPGRADE_1.2.0.md) · [词典格式支持](docs/FORMAT_SUPPORT.md)。工具栏“查询”或 Ctrl/⌘+Alt+D 打开手动查询，词形还原、多词典联合查询、生词与笔记已加入。

**使用流程：** 选择词典目录 → 打开 PDF → 点击或划选文字 → 查看释义与发音

## 功能亮点

| 功能 | 说明 |
| --- | --- |
| **点击与划选查词** | 在阅读器内查询单词或词组；划选后可同时使用高亮、下划线和颜色选择。 |
| **断行单词识别** | 对 `transfor-` 换行 `mation`，分别查询 `transfor-mation` 与 `transformation`，合并相同词条；复合词保留连字符候选。 |
| **多格式与多目录** | 识别 MDX、StarDict .ifo、DSL/.dsl.dz；管理多个目录，可选递归扫描及查询顺序。 |
| **词形与多词典查询** | 原词未命中时尝试常见英语词形；支持单词典、未命中回退和联合查询，释义标注来源。 |
| **手动查询与历史** | 输入框、Ctrl/⌘+Alt+D、返回/前进、固定弹窗、分页词目浏览与拼写建议。 |
| **生词与文献上下文** | 主动收藏单词、释义、原句和页码；写入 Zotero 笔记，导出 CSV/Anki TSV。 |
| **阅读与迁移** | 字号/尺寸/主题、英美发音偏好和重播、展开诊断、MDD 顺序管理、设置备份与路径重新定位。 |
| **MDD 分卷与配套资源** | 自动关联同名 MDD 和数字分卷，按引用读取 CSS、图片、图标、字体与音频；支持手动关联资源包和外置资源目录。 |
| **词典原有排版** | 加载词条引用的 HTML/CSS 和本地资源，呈现各词典的样式；可切换为简洁文字排版。 |
| **内置离线发音解码** | 标准 Ogg/SPX 音频通过内置 Speex 解码器转换为 WAV，无需安装额外解码程序。 |

查词与批注使用同一划选弹窗，提供 **8 色、高亮和下划线**。需要原有操作方式时，可在设置中恢复 Zotero 自带菜单。

## 交互演示

**[打开在线示例 →](https://noahxie83.github.io/zotero-local-dictionary/)** · [下载单文件 HTML](https://github.com/Noahxie83/zotero-local-dictionary/releases/download/v1.2.2/local-dictionary-demo-1.2.2.html)

| 场景 | 示例操作 |
| --- | --- |
| **单词查询** · `network` | 点击阅读区词语，切换“研究英语”与“简明双语”示例词典，体验不同排版和分卷图片资源。 |
| **断行查询** · `transfor-` / `mation` | 划选跨行的两部分文字，查看保留连字符与拼接后的查询候选。 |
| **词组与批注** · `neural network` | 查询完整词组，体验颜色、高亮和下划线按钮。 |

演示使用项目自制的 MDX/MDD 数据和插件的解析、排版组件。网页批注按钮仅展示操作反馈；音频为提示音。实际词典查询、单词发音和文献批注需在 Zotero 中使用插件。

[查看新版弹窗与设置页](https://noahxie83.github.io/zotero-local-dictionary/interface-preview.html) · [封面与展示页设计](docs/SITE_DESIGN.md)

## 快速开始

### 1. 安装插件

从 [1.2.2 Release](https://github.com/Noahxie83/zotero-local-dictionary/releases/tag/v1.2.2) 下载 `local-dictionary-1.2.2.xpi`，在 Zotero 中依次选择：

**工具 → 插件 → 齿轮 → 从文件安装插件**

选择 `.xpi` 安装包，安装后重启 Zotero。已有版本可覆盖安装，词典路径与资源设置会保留。

### 2. 添加词典

打开 **设置 → 本地词典**，选择词典目录或 `.mdx`、`.ifo`、`.dsl`、`.dsl.dz` 入口文件，从下拉框选择当前词典。StarDict 需保留同名索引与数据文件；详情见 [格式支持](docs/FORMAT_SUPPORT.md)。默认采用“词典原有排版”；也可切换为文字模式。

### 3. 开始查询

打开有文字层的 PDF，用普通指针单击英文单词，或拖选完整单词/词组后松开鼠标。可在弹窗或 PDF 工具栏切换词典。

- 点击词条发音图标播放本地音频，点击内部词条链接继续查询。
- 划选后选择颜色，再点击高亮或下划线保存批注。
- 使用 ×、Esc 关闭弹窗；未固定时点击外部或滚动 PDF 也会关闭。
- 工具栏“本地词典 ✓”可切换启用状态；安装前已打开的 PDF 可重新打开标签。

更多设置见 [完整使用指南](docs/USER_GUIDE.md)。

## 词典与资源

### 获取词典

可在 **[PDAWiki · MDict 专区](https://www.pdawiki.com/forum/forum.php?gid=7)** 搜索 MDX 词典及配套资源，按帖子与词典作者的授权说明获取文件。安装包不附带词典，词典需单独准备。

下载后保留 MDD 分卷、CSS、图片、图标和字体的目录结构。完整资源有助于呈现词典排版、插图与发音。

| 格式 | 在插件中选择 | 需要保留的配套文件 |
| --- | --- | --- |
| **MDX** | `.mdx` | 同名 `.mdd`、数字分卷及外置资源（如有） |
| **StarDict** | `.ifo` | 同名 `.idx` / `.idx.gz` 和 `.dict` / `.dict.dz`；可选 `.syn` 同义词文件 |
| **DSL** | `.dsl` / `.dsl.dz` | 同目录或 `词典.dsl.files/` 中的图片和发音（如有）；`.files.zip` 需先解压 |

各格式的编码、压缩与排版支持范围见 [词典格式说明](docs/FORMAT_SUPPORT.md)。

### 目录示例

```text
Dictionaries/
  DictionaryA.mdx
  DictionaryA.mdd
  DictionaryA.1.mdd
  DictionaryA.2.mdd
  DictionaryA.10.mdd
  DictionaryB.ifo
  DictionaryB.idx
  DictionaryB.dict.dz
  DictionaryB.syn
  DictionaryC.dsl
  DictionaryC.dsl.files/
    images/
    sounds/
  style.css
  images/
  fonts/
```

以上名称仅为示例，可使用任意词典名称和目录。插件识别三类词典入口，可添加多个目录、开启递归扫描并调整查询顺序。默认查询当前词典，也可设置为“未命中回退”或“联合查询”；释义会标明来源。MDX 的数字分卷按编号排序，名称不同或位于其他目录的 MDD 可手动添加。

## 设置与恢复

| 需求 | 设置方式 |
| --- | --- |
| **恢复 Zotero 自带划选菜单** | 划选菜单 → **Zotero 自带菜单**。此模式暂停划选自动查询，保留单击查词。 |
| **关闭划选自动查询** | 取消“划选单词或词组后自动查询”；插件批注工具仍可使用。 |
| **暂停全部插件功能** | 关闭“启用本地查词”或使用工具栏开关；也可在插件管理器停用。 |
| **切换词条显示方式** | 显示方式 → **简洁文字排版** / **词典原有排版**。 |
| **恢复自动资源关联** | 选择当前词典 → **恢复自动关联**，清除该词典的手动资源配置。 |
| **更新词典文件** | 增加、替换或删除文件后，点击“刷新词典列表”。 |
| **回退插件版本** | 从 [Releases](https://github.com/Noahxie83/zotero-local-dictionary/releases) 下载目标 XPI，按 [回退教程](docs/RESTORE.md#回退到历史插件版本) 安装。 |

停用或卸载后，阅读器菜单恢复原有行为，已保存的批注和词典文件保留。所有设置的具体影响见 **[恢复设置与回退教程](docs/RESTORE.md)**；完整功能及历史变更见 **[版本变更](docs/CHANGES.md)**。

## 兼容性

| 项目 | 支持范围 |
| --- | --- |
| 阅读器 | Zotero **10.0 系列** PDF 阅读器；扫描文献需要 OCR 文字层 |
| MDX / MDD | 1.x、2.x；raw/zlib/LZO；2.x `Encrypted=2` 索引混淆 |
| StarDict | 2.4.2、3.0.0；32/64 位偏移、压缩索引、Dictzip 与同义词 |
| DSL | `.dsl` / `.dsl.dz`；UTF-8、UTF-16、常见标记、内部链接与外置资源 |
| 查询 | MDX、StarDict、DSL；大小写、内部链接、英语词形、单词典/回退/联合查询 |
| 划选 | 规范化后最多 256 字符、16 个词；最多 3 个连字符候选 |
| 资源 | 本地 HTML/CSS、导入样式、图片、字体、背景与音频 |
| Speex | 标准 Ogg/SPX；单/双声道、多帧；单文件累计最多 30 秒，输入限额 8 MB |

<details>
<summary><b>格式限制与使用说明</b></summary>

- 词组查询需要词典收录对应词目或跳转项；长句翻译不属于当前功能。
- 断行单词需要划选完整的两部分；普通单击取词不跨行扩展。
- 词典 JavaScript 与远程资源不运行或加载，依赖脚本的折叠、统计和特殊控件可能无法呈现。
- 暂不支持 MDX/MDD 3、密码解密、StyleSheet 反引号宏、StarDict res.rdic 资源数据库和 DSL .files.zip/.lsd。词形还原使用有限英语规则。
- 音频播放受文件格式与 Zotero/系统解码能力影响，第三方私有格式的兼容性需按实际文件确认。

编码、资源查找顺序和读取限额见 [使用指南](docs/USER_GUIDE.md)、[资源支持](docs/RESOURCE_SUPPORT.md)、[Speex 说明](docs/SPEEX_AUDIO.md)。

</details>

<details>
<summary><b>常见问题</b></summary>

**有释义，但缺少样式、图片或发音？** 先确认配套 MDD 与外置资源完整。名称不同的 MDD 需手动关联；资源提示可悬停查看具体缺失项，补齐后刷新词典列表。

**划选后出现多个弹窗？** 在设置中选择合适的划选菜单模式。若同时使用其他查词扩展，可在其中一个扩展中关闭重叠的触发方式。

**可以离线使用吗？** 查询本地词典和播放本地发音均在设备上完成，无需翻译账号。词典文件需预先准备。

</details>

## 开发与构建

开发需要 Node.js；插件运行无需 Node.js 或 Python。

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run pack:source
```

生成独立 HTML 示例：

```sh
node scripts/build-showcase.mjs
```

预览查词弹窗与设置页的新界面（浅色、深色和查询状态，使用实际插件组件）：

```sh
npm run preview:ui
```

生成项目上级目录中的 `本地词典-界面预览.html`、线上使用的 `docs/interface-preview.html` 和 `dist` 中的离线预览，可离线打开。设计规则与验证记录见 [界面设计](docs/UI_DESIGN.md)。

源码结构与预览命令见 [开发指南](docs/USER_GUIDE.md#开发)。各版本安装包、源码快照与校验和见 [Releases](https://github.com/Noahxie83/zotero-local-dictionary/releases)；历史记录见 [版本变更](docs/CHANGES.md) 和 [发布说明](RELEASE_NOTES.md)。

## 开源许可

项目采用 **[GPL-3.0-or-later](LICENSE)**，第三方依赖许可见 [THIRD_PARTY.md](THIRD_PARTY.md)。Local Dictionary 是独立开发的 Zotero 插件，非 Zotero 官方产品。词典内容与资源的使用权限以各自作者的授权为准。
