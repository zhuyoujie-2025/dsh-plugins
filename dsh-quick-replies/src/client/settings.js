/**
 * 「快捷语」设置页（`settings.section` slot 的渲染体）。
 *
 * 两组列表管理：置顶快捷语（常驻 chip 排，上限 PINNED_MAX 条）/ 更多快捷语
 * （「更多」面板）。每组条目支持行内编辑文字（上限 MAX_LEN 字符）、置顶/
 * 取消置顶、删除；添加框新增的快捷语默认进「更多」组。
 * 组件自包含（读写 store 模块），不依赖框架注入的 props。
 */
import { createElement, useState } from 'react'
import * as store from './store.js'
import { MAX_LEN, PINNED_MAX } from './store.js'
import { useQuickReplies } from './chips.js'

function OpButton({ label, onClick, danger, disabled, title }) {
  return createElement(
    'button',
    {
      type: 'button',
      className: 'qrs-op' + (danger ? ' qrs-op-danger' : ''),
      onClick,
      disabled: disabled === true,
      title: title === undefined ? undefined : title,
    },
    label,
  )
}

/** 单条快捷语行：展示态（文字 + 操作按钮）或编辑态（输入框 + 保存/取消）。 */
function PhraseRow({ item, actions, editing, editDraft, onDraft, onBegin, onSave, onCancel }) {
  if (editing) {
    return createElement(
      'div', { className: 'qrs-item qrs-item-editing' },
      createElement('input', {
        className: 'qrs-input qrs-editInput',
        value: editDraft,
        maxLength: MAX_LEN,
        autoFocus: true,
        onChange: (event) => { onDraft(event.target.value) },
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onSave()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        },
      }),
      createElement(
        'span', { className: 'qrs-itemOps' },
        createElement(OpButton, {
          label: '保存', onClick: onSave, disabled: editDraft.trim() === '',
        }),
        createElement(OpButton, { label: '取消', onClick: onCancel }),
      ),
    )
  }
  return createElement(
    'div', { key: item.id, className: 'qrs-item' },
    createElement('span', { className: 'qrs-itemText', title: item.text }, item.text),
    createElement(
      'span', { className: 'qrs-itemOps' },
      createElement(OpButton, { label: '编辑', onClick: () => { onBegin(item) } }),
      actions.pin !== undefined
        ? createElement(OpButton, {
            label: '置顶', onClick: () => { actions.pin(item.id) },
            disabled: actions.pinDisabled === true,
            title: actions.pinDisabled === true ? `直接显示的快捷语最多 ${PINNED_MAX} 条` : undefined,
          })
        : null,
      actions.unpin !== undefined
        ? createElement(OpButton, { label: '取消置顶', onClick: () => { actions.unpin(item.id) } })
        : null,
      createElement(OpButton, {
        label: '删除', danger: true,
        onClick: () => { actions.remove(item.id) },
      }),
    ),
  )
}

function Group({ title, hint, items, renderRow }) {
  return createElement(
    'div', { className: 'qrs-group' },
    createElement(
      'div', { className: 'qrs-groupHead' },
      createElement('span', { className: 'qrs-groupTitle' }, title),
      createElement('span', { className: 'qrs-groupHint' }, hint),
    ),
    items.length === 0
      ? createElement('div', { className: 'qrs-emptyRow' }, '（空）')
      : createElement('div', { className: 'qrs-list' }, ...items.map(renderRow)),
  )
}

export function QuickRepliesSettings() {
  const snap = useQuickReplies()
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState('')

  const beginEdit = (item) => {
    setEditingId(item.id)
    setEditDraft(item.text)
  }
  const saveEdit = () => {
    if (editingId === null) return
    store.update(editingId, editDraft)
    setEditingId(null)
  }
  const cancelEdit = () => { setEditingId(null) }

  const add = () => {
    const text = draft.trim()
    if (text === '') return
    store.addExtra(text)
    setDraft('')
  }

  const rowProps = {
    editing: false,
    editDraft,
    onDraft: setEditDraft,
    onBegin: beginEdit,
    onSave: saveEdit,
    onCancel: cancelEdit,
  }

  return createElement(
    'div', { className: 'qrs-page' },
    createElement(
      'p', { className: 'qrs-desc' },
      `点击输入框上方的快捷语即把该短语发送到当前会话；直接显示的快捷语最多 ${PINNED_MAX} 条，每条最多 ${MAX_LEN} 个字符。`,
    ),
    createElement(Group, {
      title: '直接显示的快捷语',
      hint: `常驻显示在输入框上方，最多 ${PINNED_MAX} 条；点「编辑」修改文字`,
      items: snap.pinned,
      renderRow: (item) => createElement(PhraseRow, {
        ...rowProps,
        key: item.id,
        item,
        editing: editingId === item.id,
        actions: { unpin: store.unpin, remove: store.remove },
      }),
    }),
    createElement(Group, {
      title: '更多快捷语',
      hint: '收进「更多」展开面板；新添加的默认进这一组',
      items: snap.extra,
      renderRow: (item) => createElement(PhraseRow, {
        ...rowProps,
        key: item.id,
        item,
        editing: editingId === item.id,
        actions: {
          pin: store.pin,
          pinDisabled: snap.pinned.length >= PINNED_MAX,
          remove: store.remove,
        },
      }),
    }),
    createElement(
      'div', { className: 'qrs-add' },
      createElement('input', {
        className: 'qrs-input',
        value: draft,
        maxLength: MAX_LEN,
        placeholder: `输入新的快捷语（最多 ${MAX_LEN} 字），回车或点添加`,
        onChange: (event) => { setDraft(event.target.value) },
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            add()
          }
        },
      }),
      createElement(
        'button',
        {
          type: 'button',
          className: 'qrs-addBtn',
          onClick: add,
          disabled: draft.trim() === '',
        },
        '添加',
      ),
    ),
  )
}
