# dsh-superlcm

[English](./README.en.md) · [设计](./docs/ARCHITECTURE.md) · [验证](./docs/VALIDATION.md)

**DSH 独立插件：保存完整原文，在后台生成分层摘要，需要时精确召回。**摘要模型和可选压缩接管都在 DSH 自己的插件设置页管理。无需 SuperLcm Web 后台。

当前版本 **0.5.21**，移植自 [SuperLcm-Claude-Recall](https://github.com/yu381792/SuperLcm-Claude-Recall) 的 0.5.20 DSH 引擎。只支持 DSH，保留旧版 `SuperLcm` 包名和数据库路径。

## 安装

要求 Node.js **22.16+**。本版实测宿主为 **DSH 0.2.1-alpha.1**。

下载或在本仓库执行 `npm pack`，得到 `SuperLcm-0.5.21.tgz`。使用 DSH 官方安装命令：

```sh
dsh plugin --profile web add /absolute/path/SuperLcm-0.5.21.tgz
```

重启对应 DSH 宿主，在「插件 → SuperLcm」管理界面进入：

- **摘要设置**：选择 DSH 已配置的模型，开启后台摘要，设置分块大小和摘要合并段数。
- **压缩**：可选接管，单独选择压缩模型和触发百分比。

已安装旧版同名包时，以上命令更新包。若当前安装的是 `SuperLcm-Claude-Recall` 的全局 DSH 接入，先在它的「管理接入」取消 DSH 接入，再装独立版，避免重复接管。旧版自定义补丁若另行挂载 `SuperLcm/tool` 或压缩引擎，应先退出该旧入口，仅保留本包的默认组合包。

## 默认行为

后台摘要和压缩接管默认关闭，选择模型后分别开启。原文归档始终运行。接管关闭时实际挂载 DSH 原生压缩，沿用宿主原生配置。

后台摘要按约 **20K token** 原文分块。至少四个相邻同层摘要且正文积累足够后，再合并成上层摘要；小尾段等待后续内容。摘要用于定位历史，精确事实通过原文核对。

接管压缩默认在模型有效输入容量的 **80%** 附近替换。准备、固定范围和一次提交由引擎管理。比例与分块支持自定义。准备中的摘要不会提前替换正在使用的上下文。摘要模型与任务模型分别配置。

## 数据与召回

数据库优先使用 `DSH_SUPERLCM_DB`，兼容旧 `DSH_LOSSLESS_DB`；默认 `$DSH_HOME/SuperLcm/lcm.sqlite`，未设置 `DSH_HOME` 时用 `~/.dsh`。旧 `lossless-context/lcm.sqlite` 作为迁移兼容入口。

归档保留完整结构化事件。设置和数据库留在本机，模型请求通过 DSH 已配置的供应商发送。长输入的摘要请求可能使用明确标注的片段，完整原文仍可查询。

插件设置页只提供摘要设置和压缩设置，历史查询通过召回工具完成。

新增后台归档工具：`lcm_outline`、`lcm_read`、`lcm_find`。保留旧版 `lcm_grep`、`lcm_describe`、`lcm_expand`、`lcm_reindex`、`lcm_expand_query`、`lcm_doctor`，用于压缩节点与原始事件召回。

## 开发验证

```sh
npm install --ignore-scripts
npm run validate
npm pack --dry-run
```

本版通过真实 DSH 宿主加载、登录连接、设置读写、历史导入和原生压缩切换检查。自动测试覆盖摘要树、工具边界、取消后的迟到结果、跨进程设置保存和界面交互。完整证据和适用范围见 [VALIDATION.md](./docs/VALIDATION.md)。摘要准确性仍取决于模型，原文是最终核对依据。

MIT License。参考机制与依赖说明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
