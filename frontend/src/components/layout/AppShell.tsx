import type { ReactNode } from 'react'
import { HeartPulse, LayoutDashboard, ShieldCheck, Users } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

const navigation = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/patients', label: 'Patients', icon: Users },
  { to: '/medication-safety', label: 'Medication Safety', icon: ShieldCheck },
]

export function AppShell({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[216px_minmax(0,1fr)]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-4">Skip to content</a>
      <aside className="flex flex-col border-b bg-white lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0">
        <NavLink to="/" aria-label="Patient360 home" className="flex h-16 items-center gap-2 px-5">
          <HeartPulse className="size-7 text-primary" aria-hidden="true" />
          <span className="text-xl font-bold tracking-tight">patient<span className="text-primary">360</span></span>
        </NavLink>
        <nav aria-label="Main navigation" className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:px-3 lg:pt-5">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cn('flex items-center gap-2.5 whitespace-nowrap rounded-md border-l-2 px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'border-primary bg-accent text-accent-foreground' : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground')}>
              <Icon className="size-[18px]" aria-hidden="true" />{label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-3 lg:px-7">
          <span className="text-sm font-medium">{title}</span>
          <div className="flex items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600" aria-hidden="true">CL</span><div><p className="text-sm font-semibold">Demo clinician</p><p className="text-sm text-muted-foreground">Emergency department</p></div></div>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1440px] p-5 outline-none lg:p-7">{children}</main>
        <footer className="mx-5 mb-5 border-t pt-4 text-sm leading-6 text-muted-foreground lg:mx-7" role="note">Demonstration only · Synthetic data · Not clinically validated guidance.</footer>
      </div>
    </div>
  )
}
