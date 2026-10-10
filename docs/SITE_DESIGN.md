# 展示页与封面设计

## 设计判断

使用用户指定的 `design-taste-frontend` 技能，把展示页和 README 封面设计为面向论文阅读者的简洁出版物风格。
参数：`DESIGN_VARIANCE: 6`、`MOTION_INTENSITY: 2`、`VISUAL_DENSITY: 3`。使用项目现有的原生 HTML/CSS；这是一种视觉方向，不宣称采用任何官方设计系统。

旧页面标题、说明和示例区的权重相近；旧封面包含装饰网格、多个标签和示意弹窗。
新设计保留蓝色品牌、既有词典示例、交互标识、主导航入口和法律说明，增加阅读场景图片与清晰的文字层次。

## 源文件与生成

- `examples/template.html` 是 GitHub Pages 首页模板；`examples/showcase.js` 使用插件实际解析器与排版组件。
- `examples/page.js` 处理主题切换与示例按需加载；加载失败显示重试按钮，首次点击等待加载后执行原操作。
- `examples/cover.html` 是可编辑封面源文件，浏览器导出范围为 1600×700，结果为 `docs/assets/cover.jpg`。原品牌图形使用既有 `wordmark.svg`。
- `docs/assets/reading-desk.webp` 是通过内置 imagegen 生成的阅读场景，768px 版本用于响应式图片。图片经 WebP 编码以减少下载量，不使用外部图片地址。
- `npm run build:site` 生成 `docs/index.html`、完整界面预览、演示脚本及 source map，并生成 `dist` 中可离线打开的版本化 HTML。线上图片与演示脚本独立缓存；离线 HTML 保持资源内嵌。

生成模式为全新图片，未使用输入图片。生成提示词：

> Authentic editorial desk photograph with an open scholarly book, printed research pages, a slate-blue linen reference dictionary and a graphite pencil. Cool off-white and grey palette, soft directional daylight, realistic paper texture. Objects centred and toward the right. No people, screens, UI, logos, captions, promotional text, decoration or glowing gradients. Landscape 1536×1024; coherent when cropped to a near-square website panel.

图片里的文字与图表仅为生成的阅读场景纹理，不作为真实论文资料使用。词典示例仍为项目自行编写的 MDX/MDD 数据。

## 设计规则

- 浅色配色与插件一致：背景 `#fbfcfd`、文字 `#253440`、辅助文字 `#536575`、强调色 `#246a96`；深色使用同一套冷灰与蓝色层次。
- 页面跟随系统主题，也可手动切换；切换后示例弹窗与词条内容一起更新。深色下仅通过 CSS 将现有标识显示为浅色，原品牌文件未修改。
- 页面标题、说明使用系统无衬线字体。英文示例正文保留 Georgia，以对应论文阅读场景；词典自身字体继续由示例词典提供。
- 图片和阅读面板圆角 12px、控件 8px、正文标记 4px。首屏没有版本标签、虚构产品截图或图片覆盖标签。
- 手机改为单列；保留可见焦点、跳到示例入口、语义化格式表、加载与错误反馈，以及减少动态效果规则。

## 验证（2026-10-10）

- 浏览器检查桌面、375px 和 320px 窄屏，未发现页面横向溢出；手机导航保持单行。
- 检查浅色、深色、首次点击按需加载、断行候选合并、词组与批注反馈、词典切换和原有词条资源渲染。
- Lighthouse 默认手机模拟、本地 HTTP：性能 99，无障碍 100，最佳实践 100，SEO 100；LCP 约 1.9 秒，CLS 0，阻塞时间 0ms。这是实验室结果，实际网络与设备表现会变化。
- 插件 78 项自动测试通过；Zotero 10.0.6 的 1.2.1 隔离配置中 33 项检查通过。

GitHub Pages 沿用 `main` 分支的 `/docs` 目录与现有首页 URL。安装入口和自动更新地址同步为 1.2.1。
