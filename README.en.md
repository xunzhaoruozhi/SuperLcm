# dsh-superlcm

[中文](./README.md)

A standalone DSH plugin for complete event archiving, detached hierarchical summaries, exact recall, and optional context compaction. All controls live in the native DSH plugin UI. No separate SuperLcm server is required.

Version **0.5.20** ports the DSH engine from the corresponding SuperLcm-Claude-Recall release. The legacy package name `SuperLcm` and database locations remain compatible.

## Install

Node.js 22.16+ is required. Tested with DSH 0.2.1-alpha.1.

Build with `npm pack`, then install the archive through the official DSH CLI:

```sh
dsh plugin --profile web add /absolute/path/SuperLcm-0.5.20.tgz
```

Restart the profile and open **Plugins → SuperLcm**. The UI provides conversations, summary settings, and compaction settings. Provider/model selections use DSH's existing registry.

If using the shared SuperLcm-Claude-Recall global DSH integration, disconnect DSH there before installing this standalone bundle. Retire custom old patches that separately mount the tools or engine; use one bundle.

## Behavior

Original archiving is always active. Detached summarization and compaction takeover default to off, and each needs an explicit model selection. When takeover is off, the actual DSH native compactor is mounted with the host configuration.

Detached summaries use approximately 20K tokens per source chunk. Complete tool groups stay together. Adjacent summaries merge only after the sibling count and body-size thresholds are met. Short tails wait for additional content.

Optional takeover defaults to 80% of the active model's available input capacity. Preparation and fixed-range atomic replacement are internal. The trigger percentage and source chunk size are customizable. Detached drafts do not rewrite live context.

The database uses `DSH_SUPERLCM_DB`, the legacy `DSH_LOSSLESS_DB`, or `$DSH_HOME/SuperLcm/lcm.sqlite` (`~/.dsh` by default). Existing legacy `lossless-context` databases remain usable. Original structured events are retained in full; bounded summary excerpts include explicit source lookup instructions.

Archive tools: `lcm_outline`, `lcm_read`, `lcm_find`. Legacy compaction tools remain available. Summaries are navigation aids; consult originals for exact facts.

## Validate

```sh
npm install --ignore-scripts
npm run validate
npm pack --dry-run
```

See [VALIDATION.md](./docs/VALIDATION.md) for actual runtime evidence and limits. Source summaries use the selected DSH provider. No separate credential store or cross-harness integrations are included.
