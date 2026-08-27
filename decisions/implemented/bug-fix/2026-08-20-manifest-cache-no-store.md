# Decision: manifest 例外 immutable 缓存——client 以 no-store 每次页面加载重新拉取

Status: implemented

## Problem

用户侧实测：修改 `manifest.json`（wake `frameMs`）部署到运行中的 GUI 后，刷新页面**看不到任何变化**。根因：assets 路由对**全部资源**（含 `manifest.json`）下发 `cache-control: public, max-age=31536000, immutable`（[bug-fix/2026-08-16-assets-cache-idle-first-load.md](../bug-fix/2026-08-16-assets-cache-idle-first-load.md)）——浏览器把 manifest 缓存 365 天、永不重新校验。client 用普通 `fetch(MANIFEST_URL)` 拉取，命中 immutable 缓存后直接用旧 manifest；发布侧「改图必改名」契约只约束 sheet，manifest 作为索引本应随发布变化，却被同一缓存策略滞留（隔离站每次全新浏览器 profile 所以测出的是新值，真实浏览器则一直用缓存旧值）。

## Decision

- **client 拉取 manifest 用 `fetch(MANIFEST_URL, { cache: 'no-store' })`**：每次页面加载绕过 HTTP 缓存、从 assets 路由重新读取磁盘（manifest 是几 KB 的小索引，assets 路由按请求读磁盘）。
- **sheet（PNG）仍走 immutable 缓存**：素材按发布契约不可变，改图必改名/角色 id 的约束不变。
- 语义：manifest = 可变的索引（帧时序/角色 meta/新角色条目），sheet = 不可变的素材——两者缓存策略分离。

## Alternatives considered

**A：assets 路由对 manifest 单独下发 no-cache。** Node half 改动，需 web 重启生效（ESM 缓存）——运行中的 GUI 不能重启（会话宿主），且修改后的头仍要等下一次页面加载——弃。

**B：client 用带版本号的 manifest URL（`?v=`）。** 每次 manifest 变更都要改 client 常量并重建，容易漏——`cache: 'no-store'` 一次到位——弃。

**C：让用户清浏览器缓存。** 不可靠且治标，任何后续 manifest 变更都会再踩——弃。

## 取代检查

部分取代 [bug-fix/2026-08-16-assets-cache-idle-first-load.md](../bug-fix/2026-08-16-assets-cache-idle-first-load.md) 的缓存策略范围：该记录对全部素材统一 immutable，本记录把 manifest 划出（索引随发布变化，client 侧 no-store 拉取）；sheet 的 immutable 契约原样保留。

## Consequences

- manifest 变更（帧时序/角色 meta/新角色）在运行中 GUI 上刷新页面即生效，不再被 immutable 缓存滞留。
- sheet 改图仍需改名/角色 id（契约不变）；manifest 文件名与路径不变。
- 引用点：`lib/client/index.mjs`（`loadAssets` 的 manifest fetch）、`docs/adding-a-character.md`（改图约束补 manifest 例外）、构建产物 `lib/client.js` 同步重建。
