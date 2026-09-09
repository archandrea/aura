import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useUserStore } from '@/store'

/**
 * 权限判断 hook：只查后端下发的权限码集合（super_admin 的全量权限由后端 profile 实体化）
 */
export const usePermission = () => {
  const roles = useUserStore((state) => state.roles)
  const permissions = useUserStore((state) => state.permissions)

  return useMemo(() => {
    // isSuperAdmin 仅用于交互提示（如角色管理页系统角色按钮置灰），不参与权限判断
    const isSuperAdmin = !!roles?.includes('super_admin')
    return {
      isSuperAdmin,
      hasPermission: (code: string) => !!permissions?.includes(code),
    }
  }, [roles, permissions])
}

interface AuthButtonProps {
  permission: string
  children: ReactNode
  /** 无权限时渲染的替代内容，默认不渲染 */
  fallback?: ReactNode
}

/**
 * 按钮级权限组件（与后端 requirePermission 的权限码一一对应）
 *
 * <AuthButton permission="user:create"><Button>新增用户</Button></AuthButton>
 */
export const AuthButton = ({ permission, children, fallback = null }: AuthButtonProps) => {
  const { hasPermission } = usePermission()
  if (!hasPermission(permission)) {
    return <>{fallback}</>
  }
  return <>{children}</>
}
