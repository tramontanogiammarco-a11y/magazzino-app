import { NavLink, useLocation } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'

const navItems = [
  { to: '/', label: 'Carica nuovo prodotto' },
  { to: '/inventario', label: 'Inventario' },
  { to: '/eliminati', label: 'Eliminati' },
  { to: '/clienti', label: 'Clienti' },
  { to: '/statistiche', label: 'Statistiche' },
]

const routeIntro = {
  '/': { title: 'Nuovo articolo', subtitle: 'Foto, estrazione AI e salvataggio in magazzino' },
  '/inventario': { title: 'Inventario', subtitle: '' },
  '/eliminati': { title: 'Articoli eliminati', subtitle: 'Storico articoli archiviati con possibilita di ripristino' },
  '/clienti': { title: 'Clienti', subtitle: 'Riepilogo per venditore e export PDF' },
  '/statistiche': { title: 'Statistiche', subtitle: 'KPI, distribuzione stati e totali da pagare' },
}

function ThemeIcon({ dark }) {
  if (dark) {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    )
  }
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  )
}

export default function Layout({ children }) {
  const { dark, toggleTheme } = useTheme()
  const location = useLocation()
  const intro = routeIntro[location.pathname] ?? routeIntro['/']

  return (
    <div className="min-h-screen">
      <div className="app-page-bg" aria-hidden />
      <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-[var(--paper)]/85 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-[var(--paper)]/80">
        <div className="mx-auto flex max-w-[min(96rem,calc(100vw-2rem))] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <div className="min-w-0">
              <p className="app-kicker mb-0.5">Telovendo</p>
              <h1 className="app-page-title truncate text-xl sm:text-3xl">Magazzino</h1>
            </div>
            <img
              src="/Logo_TLV-removebg-preview.png"
              alt="Telovendo"
              className="h-10 w-auto max-w-[42vw] shrink-0 object-contain sm:h-16 sm:max-w-[min(280px,52vw)] dark:brightness-0 dark:invert"
            />
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="app-btn-ghost flex shrink-0 items-center gap-2 px-3 py-2 sm:px-4"
            aria-label={dark ? 'Passa a tema chiaro' : 'Passa a tema scuro'}
          >
            <ThemeIcon dark={dark} />
            <span className="hidden sm:inline">{dark ? 'Chiaro' : 'Scuro'}</span>
          </button>
        </div>

        <div className="mx-auto max-w-[min(96rem,calc(100vw-2rem))] border-t border-zinc-200/70 px-4 pb-3 pt-3 dark:border-zinc-800/80 sm:px-6 sm:pb-4">
          <nav className="app-mobile-nav-scroll flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0" aria-label="Sezioni">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  [
                    'shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition sm:px-5 sm:text-base',
                    isActive
                      ? 'bg-[#0ABAB5] text-white shadow-sm'
                      : 'text-zinc-600 hover:bg-zinc-500/10 dark:text-zinc-400 dark:hover:bg-zinc-500/15',
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[min(96rem,calc(100vw-2rem))] px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-8">
        <header className="mb-8 max-w-none">
          <h2 className="app-page-title text-xl sm:text-3xl">{intro.title}</h2>
          {intro.subtitle ? <p className="app-page-lead mt-2 text-base sm:text-lg">{intro.subtitle}</p> : null}
        </header>
        <main>{children}</main>
      </div>
    </div>
  )
}
