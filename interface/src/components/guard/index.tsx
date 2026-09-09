import { Navigate, Outlet, useMatches } from 'react-router'
import { useUserStore } from '@/store'
import { usePermission } from '@/components/permission'

export default function Guard() {
  const matches = useMatches()
  const user = useUserStore((state) => state.user)
  const { hasPermission } = usePermission()

  if (!user) {
    return <Navigate to="/login" replace />
  }
  const required = [...matches]
    .reverse()
    .map((m) => (m.handle as { permission?: string } | undefined)?.permission)
    .find(Boolean)

  if (!required || !hasPermission(required)) {
    return <Navigate to="/chat" replace />
  }
  return <Outlet />
}