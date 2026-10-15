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
