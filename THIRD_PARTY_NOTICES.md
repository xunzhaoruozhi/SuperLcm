# 第三方声明 / Third-party notices

This project is an independent DeepSeek Harness plugin.

Its architecture is inspired by:

- **“LCM: Lossless Context Management”** by Clint Ehrlich and Theodore Blackman, Voltropy PBC: deterministic hierarchical summary DAGs, recursive context compression, and lossless pointers to original messages. Paper: https://papers.voltropy.com/LCM. Interactive visual explainer: https://www.losslesscontext.ai/.
- **Lossless Claw** by Martian Engineering: an open-source LCM implementation for OpenClaw. License: MIT.
- **DeepSeek Harness** by DeepSeek AI: append-only session logs, surface replacement, the `ctx.compaction` capability seam, and model-facing tools. Repository license: MIT; individual published package metadata may carry its own license notice.

Version 0.5.20 ports the DSH compaction engine and shared summary policy from
SuperLcm-Claude-Recall (MIT), maintained by the same repository owner. Its
standalone archive and UI use published DSH APIs. No source from Lossless Claw
or the DSH runtime is vendored. Preserve upstream notices when adapting code.
