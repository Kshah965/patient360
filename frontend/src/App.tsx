import { PatientProvider } from '@/state/PatientProvider'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { WorkspaceOverview } from '@/components/WorkspaceOverview'
import { Button } from '@/components/ui/button'

function App() {
  return <BrowserRouter><PatientProvider><Routes>
    <Route path="/" element={<AppShell title="Dashboard"><WorkspaceOverview view="dashboard" /></AppShell>} />
    <Route path="/patients" element={<AppShell title="Patients"><WorkspaceOverview view="patients" /></AppShell>} />
    <Route path="/medication-safety" element={<AppShell title="Medication Safety"><WorkspaceOverview view="safety" /></AppShell>} />
    <Route path="*" element={<AppShell title="Page not found"><h1 className="text-2xl font-semibold">Page not found</h1><p className="my-4 text-muted-foreground">This page isn’t part of the clinical workspace.</p><Button asChild><Link to="/">Return to dashboard</Link></Button></AppShell>} />
  </Routes></PatientProvider></BrowserRouter>
}

export default App
