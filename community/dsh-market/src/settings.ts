/**
 * The market's own settings namespace: the half that makes `allowRestart`
 * a switch on the plugin configuration page instead of a line the user has
 * to hand-write into cordis.yml.
 *
 * `allowRestart: false` is the documented answer for a host owned by
 * systemd, launchd or pm2 — a supervisor restarts it, so the market's
 * one-click restart must not launch a second one. Until now the only way to
 * say that was editing YAML in the right place with the right indentation,
 * where a stray space stops the profile booting.
 *
 * Only `allowRestart` is exposed. `profile` names which profile this
 * instance manages: it is decided at mount from the composition or the
 * command line, and a running instance cannot switch to another one, so
 * offering it as a field would promise something the write cannot deliver.
 *
 * installSettingsSection rides the scoped fiber, so a host with no settings
 * service — every dsh before 0.1.0-rc.7 — simply never runs any of this and
 * the entry configuration stands as composed.
 *
 * dsh-settings 0.1.7 removed `installSettingsSection`/`settingsNamespace`
 * outright (the SettingsForms rewrite deleted the register API), and the
 * runtime's package interception pins this specifier to the installed copy —
 * so a static import fails at link time and takes the whole market entry
 * down with it. Loading dynamically keeps the card a no-op on runtimes
 * that no longer offer the section API, exactly like a host whose settings
 * service never mounted.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

const dshSettings = await import('@deepseek-ai/dsh-settings').catch(() => undefined)
const installSettingsSection = dshSettings?.installSettingsSection
const settingsNamespace: (value: string) => SettingsNamespace =
  dshSettings?.settingsNamespace ?? ((value) => value as SettingsNamespace)

/** Namespace the card on the browser side keys itself to. */
export const MARKET_SETTINGS_NS = settingsNamespace('dsh-market')

/** The market settings a user may edit at runtime. */
export interface MarketSettings {
  allowRestart: boolean
}

export const MarketSettings: z<MarketSettings> = z.object({
  allowRestart: z.boolean().default(true),
})

/**
 * Wire the namespace so a saved change reaches the routes immediately.
 *
 * The routes read `allowRestart` off this object on every request (the
 * status route reports the capability, the restart route enforces it), so
 * updating it in place is what makes a toggle take effect without a
 * restart — which would be a poor thing to require of a setting whose whole
 * subject is restarting.
 *
 * @param ctx - the plugin context owning the wiring.
 * @param resolved - the live config object the routes read.
 */
export function installMarketSettings(ctx: Context, resolved: { allowRestart?: boolean }): void {
  // Runtimes whose dsh-settings dropped the section API (0.1.7+) leave
  // `installSettingsSection` undefined — the composed entry config then
  // stands unchanged, matching the no-settings-service contract above.
  if (installSettingsSection === undefined)
    return
  // `!== false` is the routes' own reading: an absent value allows restart,
  // so the entry layer this registers must say the same thing rather than
  // presenting "unset" as "off".
  const entry = { allowRestart: resolved.allowRestart !== false }
  let source = (): MarketSettings => entry
  installSettingsSection(
    ctx,
    MARKET_SETTINGS_NS,
    MarketSettings,
    entry,
    {
      setSource: (current) => { source = current },
      onChange: () => { resolved.allowRestart = source().allowRestart },
    },
  )
}
