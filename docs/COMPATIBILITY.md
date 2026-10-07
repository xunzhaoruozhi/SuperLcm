# 兼容性

要求 Node.js 22.16+，使用内置 node:sqlite。真实宿主版本为 DSH 0.2.1-alpha.1。

运行时代码使用平台标准路径、文件与 SQLite 接口，没有固定用户名或本机绝对地址。数据库保留旧 SuperLcm 路径，旧压缩节点可继续读取。模型和账户复用 DSH 注册表，不复制凭证。

本地验证覆盖 macOS。GitHub Actions 配置包含 Windows、Linux、macOS 的 Node.js 22，以及 Linux Node.js 24；发布前应检查对应流水线实际结果。

默认组合包针对含标准 `compaction-basic` 节点的 DSH profile。自定义 profile 如果已另挂其他压缩服务，先退掉旧接入，再启用本组合包。不要将旧 standalone 引擎补丁与本组合包并列使用。
