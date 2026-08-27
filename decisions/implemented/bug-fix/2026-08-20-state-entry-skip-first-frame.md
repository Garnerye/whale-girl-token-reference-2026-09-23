# Decision: 修复进入状态时首帧被跳过——帧 0 至少展示一个帧间隔

Status: implemented

## Problem

手测反馈：wake 动画只播放了一帧。实测（单击入睡宠物触发互动唤醒）：`wake.png` 全程只显示 `background-position: -256px 0`（第 2 帧），帧 0（`0px 0`）从未出现。

根因在帧播放器的进入时序。`setState` 进入新状态时把 `lastFrameAt` 重置为 **0**，而同一 tick 紧随其后的帧推进条件是 `now - lastFrameAt >= 1000 / cfg.fps`——`now` 是毫秒级时间戳，`now - 0` 恒大于任何帧间隔，条件恒真 → **进入状态的同一次 tick 立即推进到帧 1，帧 0 从不被绘制**。

后果按状态放大：

- **wake（frames:2, once）**：帧 0 被跳过 → 只剩帧 1，动画退化为单帧静态图（用户观察到的现象）。
- 所有多帧状态（idle/walk/sleep/working/think 等）进入时同样从帧 1 起播——idle 的「帧 0=睁眼常态」起点姿态（[feature/2026-08-09-playback-data-driven.md](../feature/2026-08-09-playback-data-driven.md) 契约的「帧0=常态起点」）在每次进入状态时都不可见。

## Decision

- `setState`、tick 的迟到换肤路径（`!showingSprite`）、`switchCharacter` 收尾三处的 `lastFrameAt = 0` 统一改为 `lastFrameAt = Date.now()`——即**帧 0 的应用时刻**。
- 语义：进入状态时帧 0 立即显示，至少展示一个帧间隔（`1000/fps`）后才按 fps 推进；推进逻辑本身（loop/pingpong/once/blink）不变。

## Alternatives considered

**A：tick 内检测「本 tick 状态刚变更」跳过当次推进（setState 返回变更标志）。** 把「状态变更」事实与帧推进耦合进 tick 控制流，且换肤/换角色路径也要带标志——状态面扩大——弃。

**B：给帧推进加「帧 0 已展示」独立标志。** 多一个布尔状态要与 lastFrameAt 同步维护，无收益——弃。

**C（选定）：lastFrameAt = 帧 0 应用时刻。** lastFrameAt 的既有语义就是「当前帧的应用时刻」（推进处 `lastFrameAt = now` 同样如此），帧 0 应用时刻就是进入时刻——语义自洽，改动最小（三处赋值统一），推进条件无需改动。

## 取代检查

部分取代 [feature/2026-08-09-playback-data-driven.md](../feature/2026-08-09-playback-data-driven.md) 的帧播放时序语义：该记录确立「帧0=起点」契约与 playback 数据驱动播放器，但未约束「进入状态时首帧的可见性」——本记录补齐该时序（原实现与契约相悖）。

无重叠：`bug-fix/2026-08-09-wake-visual-edge-trigger.md`（wake 触发机制）——触发时机不变，本记录修的是触发后的帧推进。

## Consequences

- wake（2 帧 once）完整播放帧 0 → 帧 1；所有多帧状态进入时首帧可见（idle 从睁眼帧 0 起播，不再从帧 1 切入）。
- 帧推进节奏不变（仍按 fps 节流）；blink 分支不受影响（其推进独立于该时序，常态帧 0 语义由 blink 分支自身维护）。
- 引用点：`lib/client/index.mjs`（`setState` / tick 换肤路径 / `switchCharacter` 的 `lastFrameAt` 赋值）；构建产物 `lib/client.js` 同步重建。
