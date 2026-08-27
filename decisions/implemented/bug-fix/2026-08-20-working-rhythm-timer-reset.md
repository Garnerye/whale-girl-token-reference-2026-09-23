# Decision: 修复 working 插曲永不播放——节奏器 timer 被 refresh 轮询无限重排

Status: implemented

## Problem

手测：会话活跃（sessionThink=true）时宠物长时间停留在 think，working 插曲（12-30s 随机插入、2.5-6s 持续）**从不出现**。根因在宿主节奏器 `armWorking()` 与 refresh 轮询的耦合：

- `armWorking()` 每次调用都清掉旧 timer、按 `nextWorkingRhythm` 重新决策并设置新 timer（12-30s 后翻转进 working）；
- refresh 每次 `/state` 轮询（默认 pollMs 3s）都无条件调用 `armWorking()`——每 3s 清掉 12-30s 的 timer 并重排，等待被无限推后，timer 永不触发，`working.active` 恒 false。

`nextWorkingRhythm` 纯函数与 `workingActive` 行条件本身正确（单测通过），坏在宿主执行层的重排语义——与 v3 决策（[feature/2026-08-09-behavior-rhythm-v3.md](../feature/2026-08-09-behavior-rhythm-v3.md)）「按决策结果设 setTimeout 到点翻转」的设计意图相悖：refresh 挂钩本意是「会话开始武装 / 结束撤防」，却写成了每次轮询重排。

## Decision

- **`armWorking()` 加待触发守卫**：已有 `workingTimer` 待触发时直接返回（不清理、不重排）——refresh 每 pollMs 的调用变成 no-op，只有「决策到点（timeout 回调链）」与「会话思考边沿（撤防后重新武装）」才安排新 timer。
- 撤防路径保留：`sessionMood.thinking === false` 时清 timer + `working` 复位（会话结束插曲撤防）。
- 语义不变：think 常态、12-30s 随机插入 working（2.5-6s）、会话不活跃不武装——只是 timer 不再被轮询推后。

## Alternatives considered

**A：refresh 里只在 `sessionMood.thinking` 边沿（变化时）调用 armWorking。** 需要额外跟踪上一轮 thinking 值；且 timeout 链仍要自管——守卫放执行层更内聚——弃。

**B：轮询间隔 < 决策等待（调短 nextWorkingRhythm 等待）。** 治标：把随机节奏调到与轮询同量级会破坏「偶尔插入」的语义（12-30s 的随机感）；且 3s 轮询是配置项，任何固定等待都会被更短的轮询推后——弃。

**C（选定）：执行层守卫。** 一个 `if (workingTimer !== null) return` 恢复「一次决策一个 timer」的 v3 语义，纯函数与行条件零改动。

## 取代检查

部分取代 [feature/2026-08-09-behavior-rhythm-v3.md](../feature/2026-08-09-behavior-rhythm-v3.md) 的节奏器执行语义：该记录声明「armWorking 按决策结果设 setTimeout 到点翻转」，本记录补上「待触发决策不被 refresh 重排」的守卫（原实现与设计意图相悖）。

## Consequences

- 会话活跃时 working 插曲按 12-30s 随机间隔出现（2.5-6s），不再被 3s 轮询推后；会话结束撤防不变。
- 纯函数/行条件/单测零改动；仅宿主 `armWorking` 加守卫。
- 引用点：`lib/client/index.mjs`（`armWorking` 守卫 + refresh 挂钩注释）；构建产物 `lib/client.js` 同步重建。
