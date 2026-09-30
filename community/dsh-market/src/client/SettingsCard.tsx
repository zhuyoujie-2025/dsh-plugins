/**
 * The market's card on the plugin configuration page (dsh >= 0.1.0-rc.7).
 *
 * One switch: whether the market may relaunch the host. Turning it off is
 * the documented answer for a host owned by systemd, launchd or pm2, and
 * until this card the only way to say it was hand-editing YAML.
 *
 * The chrome is drawn here rather than imported: the section's own cards
 * come from `dsh-client-ui-settings-plugins`, and a VALUE import from that
 * package fails the client bundle-purity gate — a card is expected to own
 * its appearance. The switch reuses the market's existing one so a user
 * meets the same control on both pages.
 *
 * Writes go through the settings scope, which fences each one with the
 * revision it read, so two surfaces editing this namespace cannot silently
 * overwrite each other. A field counts as overridden by its PRESENCE in the
 * user layer, never by comparing values: an override that happens to equal
 * the composed default is still the user's choice, and reverting has to be
 * able to remove it.
 */

import { createElement as h, useCallback, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import css from './Market.module.css'
import type { Translate } from './market-data.ts'

/** The slice of `SettingsScope` this card uses. */
export interface CardScope {
  getSnapshot(): {
    status: 'loading' | 'ready' | 'unavailable'
    value: { allowRestart?: boolean } | undefined
    user: unknown
    writable: boolean
  }
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
}

export interface SettingsCardProps {
  scope: CardScope
  t: Translate
}

/** Whether the user layer carries this field — presence, not value. */
export function isOverridden(user: unknown, field: string): boolean {
  return typeof user === 'object' && user !== null && Object.hasOwn(user, field)
}

export function SettingsCard({ scope, t }: SettingsCardProps): ReactElement | null {
  const snapshot = useSyncExternalStore(
    useCallback(listener => scope.subscribe(listener), [scope]),
    useCallback(() => scope.getSnapshot(), [scope]),
  )

  const allowRestart = snapshot.value?.allowRestart !== false
  const onToggle = useCallback(() => {
    void scope.set('allowRestart', !allowRestart)
  }, [scope, allowRestart])
  const onRevert = useCallback(() => { void scope.unset('allowRestart') }, [scope])

  // A namespace the host does not serve renders nothing: a deployment that
  // never composed this half should show no trace of it, rather than a dead
  // control the user cannot act on.
  if (snapshot.status === 'unavailable') return null

  const busy = !snapshot.writable || snapshot.status === 'loading'
  const overridden = isOverridden(snapshot.user, 'allowRestart')

  return h('div', { className: css.setCard },
    h('div', { className: css.setHead },
      h('div', { className: css.setTitle }, t('nav')),
      h('div', { className: css.setDesc }, t('setCardDesc')),
    ),
    h('div', { className: css.setRow },
      h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': allowRestart,
        'aria-label': t('setAllowRestart'),
        className: allowRestart ? `${css.switch} ${css.switchOn}` : css.switch,
        disabled: busy,
        onClick: onToggle,
      }, h('span', { className: css.switchKnob })),
      h('div', { className: css.setLabelBox },
        h('div', { className: css.setLabel }, t('setAllowRestart')),
        h('div', { className: css.setHint }, t('setAllowRestartHint')),
      ),
      // Offered only once the user layer actually carries the field: that is
      // the only state a revert can undo.
      overridden
        ? h('button', { type: 'button', className: css.setRevert, disabled: busy, onClick: onRevert }, t('setRevert'))
        : null,
    ),
  )
}
