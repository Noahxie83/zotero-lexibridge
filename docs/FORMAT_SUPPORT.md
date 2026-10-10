# 词典格式支持 · Local Dictionary 1.2.0

| 格式 | 选择入口 | 配套文件 |
| --- | --- | --- |
| MDX | `.mdx` | 同名 `.mdd`、数字分卷、外置资源（如有） |
| StarDict | `.ifo` | 同名 `.idx`/`.idx.gz`、`.dict`/`.dict.dz`、可选 `.syn` |
| DSL | `.dsl` 或 `.dsl.dz` | 同目录或 `词典.dsl.files/` 外置资源（如有） |

## MDX / MDD

支持 1.x、2.x、raw/zlib/LZO、2.x `Encrypted=2` 索引混淆、大小写配置、内部别名和跨块词条。资源可自动关联或手动指定。不支持 MDX 3、密码解密和 StyleSheet 反引号宏。

数据块最大 128 MB、词条最大 16 MB、原有排版 HTML 最大 4 MB。资源最大 64 MB；每个弹窗最多 256 个生成资源、累计 96 MB。CSS 单文件 4 MB、累计 12 MB、导入深度 12。

## StarDict

支持 2.4.2、3.0.0；32/64 位大端偏移、重复词目、UTF-8、同义词、`sametypesequence` 和逐字段类型标记。验证索引长度、词目数量、同义词目标和释义偏移。

常见文本、HTML、音标、Pango 和 XDXF 文本进入统一显示流程。XDXF/Pango 提供基础标记转换，不保证复现全部样式。支持 XDXF `kref`、HTML `bword://` 链接及 `r` 字段中的外置图片与发音；其他文本类型退为文字并给出提示，内嵌二进制字段暂不显示。

资源可放在同目录 `res/` 或指定外置目录。当前不读取 `res.rifo/res.ridx/res.rdic` 资源数据库，需先提取为文件。

标准 Dictzip RA 分块表按所需块解压，缓存最近 32 块。普通 Gzip 则有界解压至内存。索引、同义词或普通 Gzip 解压结果最大 64 MB，最多 200 万词目，单条释义最大 16 MB。分块 Dictzip 支持按偏移读取更大的数据文件；验证分块长度，不逐字节扫描整个文件。

依据 [StarDict 项目格式规范](https://github.com/huzheng001/stardict-3/blob/master/dict/doc/StarDictFileFormat)；Dictzip 结构核对参考 [GoldenDict 读取器](https://github.com/goldendict/goldendict/blob/master/dictzip.c)。新增解析器为独立实现。

## ABBYY Lingvo DSL

支持 `.dsl` 及 Gzip/Dictzip `.dsl.dz`；UTF-8、带 BOM 的 UTF-16LE/BE、无 BOM 的 UTF-16LE，以及声明的 Latin/Cyrillic/EasternEuropean 代码页。文件需要 `#NAME`。

支持多个词目共用释义、可选括号词形、花括号非排序部分、转义字符、`~`/`^~` 替换、多行注释和基础子词条。转换粗体、斜体、下划线、上下标、缩进、颜色、音标和例句；支持 `[ref]`/`<<…>>` 内部链接、`[s]` 外置图片与发音。原文中的 HTML 字符作为文字处理。

资源可放在同目录、`词典.dsl.files/` 或指定目录。`.files.zip` 须先提取成文件夹。跨词典 `dict=` 引用以文字显示，`#INCLUDE` 须先合并文件；编译 `.lsd`、专用声音库和复杂私有标记尚未支持。

DSL 原文本/解压结果最大 64 MB、最多 200 万词条、单条文本最大约 4 MB 字符。打开时建立词目索引，查询时才转换对应释义。语义核对参考 [GoldenDict DSL 阅读器](https://github.com/goldendict/goldendict/blob/master/dsl_details.cc)。

## 通用行为

三类词典共享点击/划选/手动查询、词形还原、回退/联合查询、历史、生词、笔记、导出，以及资源过滤和显示隔离。词典脚本和远程资源不执行、不加载。专有格式仍需按实际文件验证。
