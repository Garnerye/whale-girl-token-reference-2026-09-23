// 设置卡片表单语义单测（node:test，零依赖）。归属：lib/client/settings-form.mjs 的行为改动
// 跑本文件（CardForm 暂存语义、快照引用稳定、组整组合并写、文案池行解析）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CARD_FIELDS, groupWrite, leafOf, parseLines, serializeLines, WhaleSettingsForm,
} from '../lib/client/settings-form.mjs'

/** 假 scope：set 落库并广播；可注入「宿主拒绝」模式（set 不生效）。 */
function makeScope(initialValue = {}, applyWrites = true) {
  let snap = { status: 'ready', writable: true, value: { ...initialValue } }
  const listeners = new Set()
  const sets = []
  return {
    sets,
    getSnapshot: () => snap,
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    set: async (field, value) => {
      sets.push([field, value])
      if (applyWrites) {
        snap = { status: 'ready', writable: true, value: { ...snap.value, [field]: value } }
      }
      for (const fn of [...listeners]) fn()
    },
  }
}

const DEFAULTS = { enabled: true, size: 110, opacity: 1, walk: { enabled: true, speedPxPerSec: 45 }, sleepAfterMs: 60000 }

test('CARD_FIELDS 全是合法叶路径（path/group 匹配且 group 字段 leaf 存在）', () => {
  for (const def of CARD_FIELDS) {
    assert.ok(def.path.length > 0)
    if (def.group !== undefined) {
      assert.ok(def.path.startsWith(`${def.group}.`))
      assert.ok(def.path.length > def.group.length + 1)
    }
    assert.ok(def.labelKey.length > 0)
  }
})

test('初始快照：可用可写、无暂存、字段取已提交值、缺省回退默认值', () => {
  const scope = makeScope({ size: 120 })
  const form = new WhaleSettingsForm(scope, DEFAULTS)
  const state = form.getSnapshot()
  assert.equal(state.available, true)
  assert.equal(state.writable, true)
  assert.equal(state.dirty, false)
  assert.equal(state.fields.size, 120) // 已提交值优先
  assert.equal(state.fields.enabled, true) // 缺省回退 DEFAULTS
  assert.equal(state.fields['walk.enabled'], true)
})

test('不可用命名空间 → available false', () => {
  const scope = makeScope()
  scope.sets // noop
  // 模拟宿主 describe 未返回该命名空间
  const raw = scope.getSnapshot()
  Object.defineProperty(raw, 'status', { value: 'unavailable' })
  const form = new WhaleSettingsForm(scope, DEFAULTS)
  assert.equal(form.getSnapshot().available, false)
})

test('edit 暂存 + dirty；快照内容未变时引用稳定（React #185 防线）', () => {
  const scope = makeScope()
  const form = new WhaleSettingsForm(scope, DEFAULTS)
  const before = form.getSnapshot()
  form.edit('size', 130)
  const dirty = form.getSnapshot()
  assert.equal(form.getSnapshot().dirty, true)
  assert.equal(dirty.fields.size, 130)
  assert.equal(form.getSnapshot(), dirty) // 无新变更 → 同一对象
  assert.notEqual(before, dirty)
})

test('save 提交单字段并清暂存', async () => {
  const scope = makeScope()
  const form = new WhaleSettingsForm(scope, DEFAULTS)
  form.edit('size', 130)
  await form.save()
  assert.deepEqual(scope.sets, [['size', 130]])
  const state = form.getSnapshot()
  assert.equal(state.dirty, false)
  assert.equal(state.fields.size, 130)
  assert.equal(state.failed, false)
})

test('组字段整组合并写：保留已提交组内其他叶（幂等）', async () => {
  const scope = makeScope({ walk: { enabled: true, speedPxPerSec: 45, minMs: 3000 } })
  const form = new WhaleSettingsForm(scope, DEFAULTS)
  form.edit('walk.enabled', false)
  await form.save()
  assert.deepEqual(scope.sets, [['walk', { enabled: false, speedPxPerSec: 45, minMs: 3000 }]])
})

test('save 后按宿主接受值重读确认：宿主拒绝 → failed 置位且暂存清空', async () => {
  const scope = makeScope({}, /* applyWrites */ false) // 宿主不落库
  const form = new WhaleSettingsForm(scope, DEFAULTS)
  form.edit('size', 130)
  await form.save()
  const state = form.getSnapshot()
  assert.equal(state.failed, true)
  assert.equal(state.dirty, false) // 暂存仍清空（值保留在宿主侧供修正）
})

test('discard 丢弃暂存', () => {
  const scope = makeScope()
  const form = new WhaleSettingsForm(scope, DEFAULTS)
  form.edit('size', 130)
  form.discard()
  const state = form.getSnapshot()
  assert.equal(state.dirty, false)
  assert.equal(state.fields.size, 110)
})

test('edit 清除 failed 标记；宿主侧变更（scope 广播）驱动重渲', () => {
  const scope = makeScope({}, false)
  const form = new WhaleSettingsForm(scope, DEFAULTS)
  form.edit('size', 130)
  form.edit('size', 140) // 再次编辑 → failed 清除
  assert.equal(form.getSnapshot().failed, false)
  // 宿主侧写（他端/连接重置）→ subscribe 触发 → 快照重算取新值
  const external = makeScope({ size: 99 })
  const form2 = new WhaleSettingsForm(external, DEFAULTS)
  let notified = 0
  form2.subscribe(() => { notified += 1 })
  void external.set('size', 77)
  assert.equal(notified, 1)
  assert.equal(form2.getSnapshot().fields.size, 77)
})

test('文案池行解析：trim/去空/空串回空数组；序列化往返', () => {
  assert.deepEqual(parseLines(' a \n\n b '), ['a', 'b'])
  assert.deepEqual(parseLines(''), [])
  assert.deepEqual(parseLines('   \n  \n'), [])
  assert.deepEqual(serializeLines(['a', 'b']), 'a\nb')
  assert.equal(serializeLines(undefined), '')
  assert.deepEqual(parseLines(serializeLines(['谢谢', '加油'])), ['谢谢', '加油'])
})

test('leafOf / groupWrite 纯函数语义', () => {
  assert.equal(leafOf({ walk: { enabled: true } }, 'walk.enabled'), true)
  assert.equal(leafOf({ walk: null }, 'walk.enabled'), undefined)
  assert.equal(leafOf(undefined, 'enabled'), undefined)
  assert.deepEqual(groupWrite({ walk: { enabled: true, minMs: 3000 } }, 'walk.enabled', false), {
    key: 'walk', value: { enabled: false, minMs: 3000 },
  })
  assert.deepEqual(groupWrite(null, 'replies.feed', ['a']), { key: 'replies', value: { feed: ['a'] } })
})