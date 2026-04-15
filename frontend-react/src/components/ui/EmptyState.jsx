import { Film } from 'lucide-react'

export function EmptyState({ title = 'No results found', subtitle = '', action }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <Film size={48} className="text-[var(--text-muted)] opacity-40" />
      <div>
        <p className="text-lg font-semibold text-[var(--text-main)]">{title}</p>
        {subtitle && <p className="text-sm text-[var(--text-muted)] mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
