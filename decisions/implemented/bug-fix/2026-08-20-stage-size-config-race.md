# Decision: 修复 size 配置被 stageSize 竞态覆盖——用户配置为权威

Status: implemented

## Problem

issue #12：设置 `whale-girl.size`（如 160）后，每次重启 `dsh web` / 刷新页面，宠物先以角色 `meta.stageSize`（110px）显示，在首个 `/state` 轮询（默认 pollMs 3s）后才跳到配置尺寸——可见的「先默认后跳变」。

根因是竞态守卫语义错误。`loadAssets()`/`switchCharacter()` 用 `lastConfigRevision === 0` 表达「用户未配置 size」，但 `lastConfigRevision` **只在 `refresh()` 里更新**（/state 返回 configRevision 时），而 boot 的配置应用路径是：

1. `boot()` 先 `await fetchConfig()` → `applyClientConfig(config)` 立即把 `--pet-size` 设为配置值（160px）——此时 `lastConfigRevision` 仍是 0；
2. `loadAssets()`（manifest 拉取）与 `refresh()`（/state 拉取）并发发出；
3. manifest 是磁盘静态小文件（且浏览器缓存友好），常先于 /state 返回 → `lastConfigRevision === 0` 仍成立 → stageSize 把已应用的 160px 覆盖回 110px；
4. 首个 /state 到达 → configRevision 变化 → 重新拉取配置 → 跳回 160px。

即「已应用配置」与「守卫认为未拉取配置」脱节，窗口内 stageSize 覆盖生效。issue 实测注释掉 client.js 683-686/716-719 行后不再跳变，与根因一致。

## Decision

- 新增 `sizeConfigured` 标志：`applyClientConfig` 在 `typeof config.size === 'number'` 时**同步置位**（boot 与 refresh 共用同一路径，boot 里 applyClientConfig 先于 loadAssets() 调用，标志在 manifest 拉取开始前就绪——时序无关）。
- `loadAssets()`/`switchCharacter()` 的 stageSize 兜底守卫从 `lastConfigRevision === 0` 改为 `!sizeConfigured`。
- 语义：`meta.stageSize` 仅在**用户从未配置过 size** 时作为 `--pet-size` 默认（多角色差异化默认保留）；用户显式配置过 size 后，任何角色加载/切换都不再覆盖。

## Alternatives considered

**A：删除 stageSize 兜底（恒 110px）。** 多角色 stageSize 差异化（如 cat 96px）是 manifest 契约（[feature/2026-08-09-character-manifest.md](../feature/2026-08-09-character-manifest.md)）的一部分，删除即砍能力——弃。

**B：串行化启动（先等首个 /state 应用配置后再 loadAssets）。** 拖慢首帧渲染（首帧依赖 manifest/idle sheet，配置到达前宠物不可见），且 switchCharacter 路径（用户点换角色）仍需守卫；把「配置是否可覆盖」变成启动时序问题，不是正确建模——弃。

**C：boot 时先拉 /state 初始化 lastConfigRevision。** 引入额外往返、仍无法表达「用户是否配置过 size」这一事实本身（/state 的 configRevision 只反映配置版本，不反映 size 是否被显式配置）——弃。

## 取代检查

部分取代 [feature/2026-08-09-character-manifest.md](../feature/2026-08-09-character-manifest.md) 的 stageSize 语义段：默认尺寸的权威从「lastConfigRevision 时序」（隐含、有竞态）细化为「用户是否配置过 size」（显式标志）；该记录已加回链。其余 --pet-size 触点记录（effects-inline-style / showsprite-shadowing-scale-nan / blank-pet-host-inline-retry-fade / config-system）均不覆盖「配置 size 与 stageSize 的优先级竞争」，无重叠。

## Consequences

- 用户配置 size 后重启/刷新不再出现 110→160 跳变（首帧即按配置尺寸渲染；host 在 boot 的 applyClientConfig 之后才显示，配置在首帧前已就绪）。
- 未配置 size 时行为不变：stageSize 作为默认（当前单角色 110px；多角色扩展后各角色差异化默认保留）。
- boot 的 /config 拉取失败（瞬态）时仍可能先显示默认再跳变——那是「配置尚未到达」的正确降级，不是本竞态。
- 引用点：`lib/client/index.mjs`（`sizeConfigured` 声明、`applyClientConfig` 置位、`loadAssets`/`switchCharacter` 守卫）；构建产物 `lib/client.js` 同步重建。
