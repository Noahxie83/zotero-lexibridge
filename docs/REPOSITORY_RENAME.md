# 仓库改名与插件收录 · 1.2.2

GitHub 仓库由 `Noahxie83/zotero-local-mdx-click` 更名为 **`Noahxie83/zotero-local-dictionary`**，与 MDX、StarDict、DSL 多格式支持及 Local Dictionary 产品名称一致。

## 当前入口

- [GitHub 仓库](https://github.com/Noahxie83/zotero-local-dictionary)
- [安装包与历史版本](https://github.com/Noahxie83/zotero-local-dictionary/releases)
- [在线查词示例](https://noahxie83.github.io/zotero-local-dictionary/)
- [弹窗与设置页预览](https://noahxie83.github.io/zotero-local-dictionary/interface-preview.html)
- [插件更新清单](https://raw.githubusercontent.com/Noahxie83/zotero-local-dictionary/main/updates.json)

## 已有安装与链接

插件 ID 继续使用 `local-mdx-click@noahx.local`，偏好命名空间和兼容 API 别名保留。1.2.2 安装包使用新的更新地址，可覆盖安装并保留词典设置和生词数据。

[GitHub 的改名规则](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)说明旧仓库链接和 Git 操作会重定向；GitHub Pages 项目网址不在这项保障范围内，请使用上面的新网站地址。不要新建同名的 `zotero-local-mdx-click` 仓库，否则会破坏旧仓库链接的重定向。

## zotero-addons-scraper 收录

按 [上游贡献规则](https://github.com/syt2/zotero-addons-scraper#contributing)，收录入口采用 `addons/{owner}@{repo}` 文件名，可选最多两个标签。现有收录记录来自已合并的 [PR #259](https://github.com/syt2/zotero-addons-scraper/pull/259)，内容为 `{"tags": ["reader"]}`。

上游应将 `addons/Noahxie83@zotero-local-mdx-click` 重命名为 `addons/Noahxie83@zotero-local-dictionary`，保留原 `reader` 标签，并替换旧条目，避免同时留下两个入口。对应的 [改名补丁](integrations/zotero-addons-scraper-rename.patch) 已准备；本项目发布不会自动修改上游收录文件，上游合并与刷新需另行完成。

[抓取器](https://github.com/syt2/zotero-addons-scraper/blob/master/src/zotero_scraper/services/cache_builder.py)读取 GitHub Releases，优先选择类型为 `application/x-xpinstall` 的文件，再解析根目录的 `manifest.json`。显示名称、版本、插件 ID、Zotero 版本范围和更新地址由安装包提供，不要求安装包文件名与仓库名一致。发布时保留 XPI 文件类型，并保持安装包、更新清单及其 SHA256 校验一致。

本插件声明支持 Zotero `10.0`–`10.0.*`。仓库改名不会扩大这个范围，也不需要更换插件 ID。

## 迁移验证（2026-10-10）

- 78 项自动测试通过，插件及网站重新构建成功。
- 改名后，旧仓库 API 和旧 Release 下载链接返回重定向，目标可正常访问；旧名称的原始更新清单也返回 HTTP 200。
- 当前已发布的 1.2.1 XPI 类型为 `application/x-xpinstall`，符合上游优先选择规则。上游公开列表仍显示 1.1.3；当日最近一次抓取早于 1.2.1 发布，因此不能将该列表视为最新发布验证。

这些是迁移时的实测结果。上游改名补丁尚未提交或合并，不代表上游列表已经刷新。
