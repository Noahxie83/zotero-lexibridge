# LexiBridge 1.3.1 升级说明

本版统一词译桥的仓库、下载、更新与展示页地址，并精简公开说明。

- 仓库为 [`Noahxie83/zotero-lexibridge`](https://github.com/Noahxie83/zotero-lexibridge)。
- 展示页为 [词译桥交互示例](https://noahxie83.github.io/zotero-lexibridge/lexibridge/)。按维护者选择，仅维护新网页地址。
- README 删除个人主页入口、内部插件标识和历史名称介绍，使用当前产品名称。
- 安装包沿用既有插件身份、设置前缀和备份格式，可覆盖升级，保留词典目录、资源配置、生词与查询设置。
- 新版安装包使用当前仓库的更新清单；旧版更新清单地址由 GitHub 仓库改名重定向继续兼容。
- 设置备份格式保持不变，仅将导入错误提示中的产品名称改为词译桥。

下载 `lexibridge-1.3.1.xpi`，在 Zotero 中选择“工具 → 插件 → 齿轮 → 从文件安装插件”。如提示重启，重启 Zotero。

四个在线翻译适配器及查询调度沿用已验收实现。来源默认关闭、文本发送说明、限流与取消行为保持不变；本次维护不重新发送翻译探测请求。

功能、兼容范围和此前的实机证据见 [1.3 系列功能说明](UPGRADE_1.3.0.md)。仓库与收录说明见 [项目地址与插件收录](REPOSITORY_RENAME.md)。本轮构建及迁移验证另记于 `docs/verification/repository-migration-1.3.1.json`。
