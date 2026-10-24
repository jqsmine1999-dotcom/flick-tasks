import type { SVGProps } from 'react'

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p,
})

export const ArrowUp = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" /></svg>
)
export const Sparkles = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} strokeWidth={1.9}>
    <path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9z" fill="currentColor" fillOpacity=".18" />
    <path d="M19 15.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8zM5 15l.6 1.2 1.2.6-1.2.6L5 18.6l-.6-1.2-1.2-.6 1.2-.6z" />
  </svg>
)
export const Check = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} strokeWidth={2.6}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
)
export const Play = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M8 5.5v13l10-6.5z" fill="currentColor" /></svg>
)
export const Undo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
)
export const Trash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
)
export const Inbox = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} strokeWidth={1.6} width={44} height={44}>
    <path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" />
  </svg>
)
export const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
)
