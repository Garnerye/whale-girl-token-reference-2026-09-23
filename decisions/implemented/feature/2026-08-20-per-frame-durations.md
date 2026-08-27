# Decision: 逐帧停留时长（frameMs）——非均匀动画节奏的数据驱动表达

Status: implemented

## Problem

动画帧推进目前统一按 `1000 / fps` 节拍（每帧停留相同时长）。wake（2 帧 once）需要「首帧稍长、后续稍短」的缓动节奏（帧0 酝酿、帧1 落定），统一节拍表达不了这种非均匀节奏；若在播放器里按状态名特判（wake 首帧多停留）会破坏「播放器零状态名特判」契约（[feature/2026-08-09-playback-data-driven.md](../feature/2026-08-09-playback-data-driven.md)）。

## Decision

- **manifest 状态新增可选 `frameMs`**：正数数组、长度 === `frames`，`frameMs[i]` = 帧 i 的停留 ms；**缺省回退统一 fps 节拍**（`1000 / fps`）——既有状态零迁移。
- **播放器推进条件**：当前帧的停留时长取 `cfg.frameMs?.[frame] ?? 1000 / cfg.fps`（帧推进逻辑不变，只换节拍来源）。
- **verify-assets 门禁**：`frameMs` 若声明必须为正数数组且长度 === frames（非正数/长度不符即拒收）——投放期拦截非法组合。
- **wake 应用**：`frameMs: [1000, 200]`（帧0 停留 1000ms、帧1 停留 200ms，替代原 333ms 均匀节拍）。

## Alternatives considered

**A：`holdFirstMs`（仅首帧加长）。** 只解决「首帧稍长」；后续帧想各自不同节奏时又要加字段，表达力不足——弃。

**B：播放器按状态名特判 wake 首帧加长。** 播放器重新认识状态名，违反数据驱动契约（第二角色/新状态无法复用）——弃。

**C（选定）：逐帧数组 `frameMs`。** 一个字段覆盖任意非均匀节奏（首帧长、中间快、末帧慢等），语义与既有 `frames` 数组一一对应，校验直观。

## 取代检查

部分取代 [feature/2026-08-09-playback-data-driven.md](../feature/2026-08-09-playback-data-driven.md) 的帧时序契约：统一 fps 节拍扩展为「可选逐帧停留时长，缺省回退 fps」——playback 模式语义不变（loop/pingpong/once/blink 的帧序与下限契约原样保留）。

无重叠：`bug-fix/2026-08-20-state-entry-skip-first-frame.md`（首帧可见性时序）——本记录只改逐帧停留时长，不动首帧展示逻辑。

## Consequences

- wake 节奏变为帧0 1000ms → 帧1 200ms（首帧酝酿、后续落定）；其余状态未声明 frameMs，行为不变。
- 第二角色/新状态可按需声明 frameMs 表达缓动，零代码改动；门禁在投放期拦截长度/数值非法声明。
- 引用点：`lib/assets/manifest.json`（wake `frameMs`）、`lib/client/index.mjs`（推进条件 `holdFor`）、`scripts/gates/verify-assets.mjs`（校验）+ 自证测试、`docs/sprites-spec.md`（字段契约 + 模板）。
