# 项目地址与插件收录

LexiBridge · 词译桥的仓库、下载、自动更新与网页入口统一使用 `zotero-lexibridge`。

## 当前入口

- [GitHub 仓库](https://github.com/Noahxie83/zotero-lexibridge)
- [安装包与历史版本](https://github.com/Noahxie83/zotero-lexibridge/releases)
- [交互示例](https://noahxie83.github.io/zotero-lexibridge/lexibridge/)
- [弹窗与设置预览](https://noahxie83.github.io/zotero-lexibridge/interface-preview.html)
- [自动更新清单](https://raw.githubusercontent.com/Noahxie83/zotero-lexibridge/main/updates.json)

## 升级兼容

仓库改名会保留 GitHub 的提交、议题、历史 Release 与收藏。旧仓库和 Git 操作会重定向，新版安装包直接使用当前仓库的更新清单。插件身份、设置前缀和备份格式保持兼容，因此覆盖升级保留词典配置与生词记录。

GitHub 不保证项目 Pages 网址随仓库改名跳转。按维护者选择，仅维护上方的新网页地址，不额外建立跳转仓库。不要重新占用旧仓库名，以免破坏已有下载和更新链接的仓库重定向。参考 [GitHub 官方改名说明](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)。

## 上游收录

上游使用 `addons/{owner}@{repo}` 文件名确定抓取仓库。此次只把既有收录条目改为 `addons/Noahxie83@zotero-lexibridge`，保留 `reader` 标签，不重复新增插件。

上游 PR #274（commit `d5c13d6`）已于 2026-10-16 正式合并，且上游 publish 分支的 `addon_infos.json` 已完成抓取与发布。`Noahxie83/zotero-addons-scraper` 是提交上游贡献所用的 fork，不是本插件的独立抓取服务。

迁移检查与上游 PR 链接记录在 `docs/verification/repository-migration-1.3.1.json`。
