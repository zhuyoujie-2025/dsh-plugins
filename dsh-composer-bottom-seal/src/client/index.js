/** Browser half: close the official composer's bottom clearance. */
export const name = 'dsh-composer-bottom-seal-client'
export const inject = []

const STYLE_ID = 'dsh-composer-bottom-seal-style'
const CSS = `
[data-conversation-scroll] {
  margin-bottom: -2px !important;
}
[data-composer-seat] div:has(> [data-composer-card]) {
  padding-bottom: 0 !important;
}
[data-phase='active'] [data-composer-seat] {
  background: transparent !important;
}
`

export function apply(ctx) {
  ctx.effect(() => {
    if (document.getElementById(STYLE_ID) !== null) return () => {}
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = CSS
    document.head.appendChild(style)
    return () => { style.remove() }
  }, 'composer-bottom-seal: style')
}
