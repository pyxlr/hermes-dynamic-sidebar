import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import test from 'node:test'

test('installable single-file plugin includes the complete upstream MIT license', async () => {
  const license = (await readFile(new URL('../LICENSE', import.meta.url), 'utf8')).trim()
  const plugin = await readFile(new URL('../hermes-dynamic-sidebar/plugin.js', import.meta.url), 'utf8')
  assert.ok(plugin.includes(license), 'installed ESM must carry FPSUnleashed copyright and the complete license')
  assert.ok(plugin.includes('Copyright (c) 2021-present Tanner Linsley'))
  const checksum = await readFile(new URL('../CHECKSUMS.sha256', import.meta.url), 'utf8')
  assert.equal(checksum, `${createHash('sha256').update(plugin).digest('hex')}  hermes-dynamic-sidebar/plugin.js\n`)
})
