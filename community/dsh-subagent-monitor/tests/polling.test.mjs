import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ACTIVE_POLL_MS,
  IDLE_POLL_MS,
  HIDDEN_POLL_MS,
  pollDelay,
} from '../src/client/polling.ts'

test('运行中子代理或打开面板时保持一秒刷新', () => {
  assert.equal(pollDelay({ visible: true, open: false, hasRunning: true }), ACTIVE_POLL_MS)
  assert.equal(pollDelay({ visible: true, open: true, hasRunning: false }), ACTIVE_POLL_MS)
})

test('空闲且面板关闭时退避到五秒', () => {
  assert.equal(pollDelay({ visible: true, open: false, hasRunning: false }), IDLE_POLL_MS)
})

test('页面隐藏时退避到十五秒', () => {
  assert.equal(pollDelay({ visible: false, open: true, hasRunning: true }), HIDDEN_POLL_MS)
})
