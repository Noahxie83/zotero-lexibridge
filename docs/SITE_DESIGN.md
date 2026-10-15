# 词译桥展示页与封面

## 设计方向

使用用户指定的 design-taste-frontend 与 imagegen。对原站做保留品牌的更新：沿用蓝色与书本放大镜图形，名称改为 LexiBridge，面向论文阅读者，采用清爽、克制的原生 HTML/CSS 展示页。

参数：DESIGN_VARIANCE 6、MOTION_INTENSITY 4、VISUAL_DENSITY 3。字体以系统无衬线为主，原创论文示例保留 Georgia。背景、文字、强调色分别为 #fbfcfd、#253440、#246a96；深色使用同一冷灰与蓝色体系。大区域 16px、阅读面板 12px、按钮 8px 圆角。

首屏用左右布局呈现用途与阅读场景；新版变化采用两列内容，交互示例采用阅读/词条双栏，来源策略使用折叠列表，格式使用小表格。手机改为单列。进入与滚动出现动画只服务于内容层次，减少动态效果偏好下全部取消。

## 源文件与产物

- `examples/template.html`、`site.css`、`page.js`：新版展示页及主题、按需加载和内容出现动画。
- `examples/showcase.js`：使用插件真实 MDX/MDD 解析及排版组件的原创离线示例。
- `examples/cover.html`：1600×720 封面源文件。
- `examples/interface-preview.*`：实际弹窗和设置组件预览，含四个在线来源；所有回调只影响浏览器页面。
- `docs/lexibridge/index.html`：新展示页；原 `docs/index.html` 跳转并保留查询参数和片段。
- `docs/assets/cover.jpg`、`lookup-demo.gif`、`lookup-preview.jpg`：README 封面、动图和静态替代。
- README 三个 SVG 文字按钮链接到 Releases、交互示例、使用指南。GitHub README 不执行页面脚本，动效以 GIF 实现。

构建命令 `npm run build:site` 生成 Pages 与离线自包含 HTML。仓库地址保持稳定，因此自动更新、旧 Release 与收录入口继续兼容。网站素材在仓库内保存，不依赖外部图片主机或字体服务。

## 图片来源

新阅读场景由内置 image_gen 生成，未使用外部参考图片。保留最终 WebP 及 768px 响应式版本；无商业词典截图。图片中的印刷纹理不作为真实论文内容。

生成提示词：

> Use case: ads-marketing. Asset type: hero photograph for Local Dictionary, a Zotero plugin used by academic paper readers. Primary request: a refined, believable still-life photograph communicating reading and a bridge between a local dictionary and translation. Scene: close view of an open reference dictionary and a few neatly arranged research pages on a cool pale grey desk, a single muted cobalt blue linen bookmark gently curves across the open page. One closed deep-blue linen reference book behind. Real paper edges and subtle ink textures, precise daylight from a window, slight soft shadow, unhurried academic atmosphere. Composition: landscape 3:2, sculptural books and bookmark mostly in the right two-thirds, left has calm negative space; tight art-directed crop suitable for a website hero and cover. Color palette: cool silver grey, paper white, graphite and one medium cobalt blue accent. Style: premium editorial product photography, tactile materials, realistic studio quality. Constraints: no screens, no floating UI, no logos, no watermarks, no readable words or fake diagrams, no neon, no gradients, no extra objects, no people. The page should have subtle indistinct print texture only. This is an atmospheric illustration, not a product screenshot.

品牌图形保留原有书本与放大镜，仅更新文字与颜色。GIF 由真实浏览器中的原创示例录制，展示点击、词典切换、词组批注与断行候选，没有联网请求。图片转换和 GIF 编码只用于文件格式与输出尺寸处理。

## 检查范围

桌面、375px/320px 窄屏、浅色/深色、减少动态效果、示例加载、词典切换、三个示例、错误重试、原入口跳转、设置页来源列表均作为交付检查项。当前结果与限制见 [交付记录](DELIVERY_1.3.0.md)；历史 1.2.1 的 Lighthouse 分数不代表本版结果。

## 2026-10-16 封面精修与复验

本次采用保留品牌的局部精修。保留书本放大镜标识、LexiBridge 名称、蓝灰配色与阅读场景；封面参数为 DESIGN_VARIANCE 6、MOTION_INTENSITY 2、VISUAL_DENSITY 2，网页既有交互与动效保持原有设计。

- 标题取消负字距和粗重字重，改用等线常规体；两行分别使用石墨色和品牌蓝。英文品牌与中文名称对齐，说明文字缩减为两行，删除底部功能标语。
- 图片由内置 image_gen 参考原阅读场景精修，柔化窗影，保留纸张和蓝色亚麻书签的纹理。所有中文和英文排版由浏览器真实字体输出，避免生成图片中的字形偏差。
- 封面源文件仍为 `examples/cover.html`，画布 1600×720；在 Windows 等线字体已加载后以 2 倍像素密度导出 `docs/assets/cover.jpg`（3200×1440）。不把系统字体文件分发进仓库。README 引用地址保持不变，展示页首屏同步字重与字距。
- 复验修正了原创示例词典在窄屏下的插图浮动：400px 以下改为图文上下排列。页面二级标题使用平衡换行。两处均属于网页示例排版，不修改插件的词典渲染逻辑。

最终图片提示词（内置工具 edit；输入为原 `reading-desk.webp`）：

> Use case: lighting-weather / precise-object-edit. Input image is the EDIT TARGET for the photographic half of the LexiBridge academic reading plugin cover. Refine this existing still-life into an exquisite, art-directed editorial photograph, retaining its recognizable scene and cool blue-grey identity. Preserve: open dictionary, single muted blue linen bookmark, closed blue reference book behind, research pages, no extra props. Improve light into soft diffused silver daylight; preserve realistic paper detail without overly sharpened tiny pseudo-print; lower the harsh contrast of window patches; sculpt elegant clean shadows with richer but subtle blue linen texture. Composition: landscape 3:2, main open book and blue ribbon clearly visible toward the right, generous calm cool pale grey table toward the left for a clean transition into a separate white typography panel. A slightly wider and calmer camera framing than the reference, carefully balanced objects, quiet intellectual atmosphere, excellent tactile photography. No readable words, no logo, no text overlay, no UI, no watermark, no person, no gradients or glowing effects. Do not invent additional bookmarks. This is a background photographic asset; all typography will be rendered separately with real fonts. Return the refined photograph only.

本轮范围与结果见 [封面精修验收记录](verification/cover-refinement-20261016.json)。性能分数为本地 Lighthouse 模拟结果，未重新进行真实联网翻译或 Zotero 宿主验收；既有 1.3.0 安装包继续使用。

## 最终字体确认

维护者确认三款字体预览中的 C 方案，采用 **霞鹜臻楷 Slab GB Regular v0.827**。封面左侧的中文品牌名、主标题和说明使用同一字体，英文品牌和 Zotero 字样保留无衬线排版；图片、布局、颜色和文案不变。网页首屏中文同步该字体，正文和操作控件保留原有界面字体。

字体以本地 WOFF2 提供，覆盖封面及网页首屏所需的 47 个中文字和标点，共 15,960 字节。字体子集及完整授权位于 `docs/assets/fonts/`；未将原始的 17MB TTF 放进仓库。离线演示内嵌字体，线上页面使用同源字体并预加载，无需依赖第三方字体服务。

调整首屏中文文案后，可安装 `fonttools[woff]`，再运行 `python scripts/subset-cover-font.py 原始字体.ttf` 更新字形子集。随后运行 `npm run build:site`。封面源文件通过浏览器加载字体、等待图片解码后，以 1600×720 画布、2 倍像素密度导出 3200×1440 JPEG。

本次字体确认检查记录见 [最终字体验收](verification/selected-cover-font-20261016.json)。
