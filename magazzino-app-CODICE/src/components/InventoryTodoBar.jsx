const QUICK = {
  expiring: 'expiring',
  clients_incomplete: 'clients_incomplete',
  missing_details: 'missing_details',
  magazzino: 'magazzino',
}

/**
 * @param {{
 *   counts: { expiring: number, clientsIncomplete: number, missingDetails: number, magazzino: number },
 *   active: string | null,
 *   onSelect: (key: string) => void,
 *   onClear: () => void
 * }} props
 */
export default function InventoryTodoBar({ counts, active, onSelect, onClear }) {
  const chips = [
    { key: QUICK.expiring, label: 'In scadenza', sub: 'Caricato, meno di 5 giorni', count: counts.expiring },
    {
      key: QUICK.clients_incomplete,
      label: 'Clienti',
      sub: 'Senza tutti i dati (nome, telefono, email, IBAN)',
      count: counts.clientsIncomplete,
    },
    {
      key: QUICK.missing_details,
      label: 'Dettagli mancanti',
      sub: 'SKU, slot, proprietario o prezzo',
      count: counts.missingDetails,
    },
    { key: QUICK.magazzino, label: 'In magazzino', sub: 'Da pubblicare su Vinted', count: counts.magazzino },
  ]

  const total = counts.expiring + counts.clientsIncomplete + counts.missingDetails + counts.magazzino

  return (
    <div className="app-card p-6 sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">Da fare oggi</h3>
        {active ? (
          <button
            type="button"
            onClick={onClear}
            className="app-btn-secondary shrink-0 self-start px-5 py-3 text-base font-semibold sm:self-center"
          >
            Mostra tutti
          </button>
        ) : null}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {chips.map(({ key, label, sub, count }) => {
          const isOn = active === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={[
                'rounded-2xl border-2 px-5 py-5 text-left transition',
                isOn
                  ? 'border-[#0ABAB5] bg-[#0ABAB5]/12 shadow-sm dark:border-[#0ABAB5] dark:bg-[#0ABAB5]/18'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/80 dark:border-zinc-600 dark:bg-zinc-900/40 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/50',
              ].join(' ')}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{label}</span>
                <span
                  className={[
                    'tabular-nums text-3xl font-bold sm:text-4xl',
                    count > 0 ? 'text-[#0ABAB5]' : 'text-zinc-400 dark:text-zinc-500',
                  ].join(' ')}
                >
                  {count}
                </span>
              </span>
              <span className="mt-2 block text-base leading-snug text-zinc-600 dark:text-zinc-400">{sub}</span>
            </button>
          )
        })}
      </div>
      {total === 0 && !active ? (
        <p className="app-text-muted mt-6 text-center text-base">Nessuna attività in coda: ottimo lavoro.</p>
      ) : null}
    </div>
  )
}
