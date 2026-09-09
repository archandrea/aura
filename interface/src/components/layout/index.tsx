import { useState, useEffect } from 'react'
import { Navigate, Outlet, useNavigate, useLocation } from 'react-router'
import { Flex, Layout, Menu, Avatar, Tooltip } from 'antd'
import {
  LogoutOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  BookOutlined,
  OpenAIFilled,
  SettingFilled,
  TeamOutlined,
} from '@ant-design/icons'
import { useUserStore } from '@/store'
import { profile } from '@/api/user'
const { Header, Footer, Sider, Content } = Layout

const ICON_MAP: Record<string, React.ReactNode> = {
  OpenAIFilled: <OpenAIFilled />,
  BookOutlined: <BookOutlined />,
  SettingFilled: <SettingFilled />,
  TeamOutlined: <TeamOutlined />,
}

const transformMenu = (menus: any[]): any[] =>
  menus
    .filter((menu) => menu.visible === 1 && menu.type !== 'button') // 只显示可见的目录/菜单
    .map((menu) => ({
      key: String(menu.id),
      label: menu.name,
      path: menu.path,
      icon: ICON_MAP[menu.icon],
      children: menu.children ? transformMenu(menu.children) : undefined,
    }))

const findKey = (path: string, items: any[]): string | undefined => {
  let find
  for (let i = 0; i < items.length; i++) {
    let item = items[i]
    if (item.path === path) {
      find = item.key
      break
    }
    if (item.children && item.children.length > 0) {
      let res = findKey(path, item.children)
      if (res) {
        find = res
        break
      }
    }
  }
  return find
}

export default function MyLayout() {
  let location = useLocation().pathname
  const navigate = useNavigate()
  const user = useUserStore((state) => state.user)
  const clearUser = useUserStore((state) => state.clearUser)
  const setRoles = useUserStore((state) => state.setRoles)
  const setMenus = useUserStore((state) => state.setMenus)
  const setPermissions = useUserStore((state) => state.setPermissions)
  const menus = useUserStore((state) => state.menus)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [collapsed, setCollapsed] = useState(false)

  // 已登录时静默刷新 profile，管理员改动角色/菜单后无需重新登录
  useEffect(() => {
    if (!user?.token) return
    const refresh = async () => {
      const [err, res] = await profile()
      if (res?.data) {
        setRoles(res.data.roles)
        setMenus(res.data.menus)
        setPermissions(res.data.permissions)
      }
    }
    refresh()
  }, [])

  const menuItems = transformMenu(menus || [])
  const handleMenuClick = ({ item, key, keyPath, domEvent }: any) => {
    setSelectedKeys([key])
    item?.props?.path && navigate(item.props.path)
  }

  const handleLogout = () => {
    clearUser()
    navigate('/login', { replace: true })
  }

  // 初始化菜单选中
  useEffect(() => {
    const key = findKey(location, menuItems)
    setSelectedKeys(key ? [key] : [])
  }, [location, menus])

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    )
  }

  const username = user?.name || 'U'
  const CollapseIcon = collapsed ? MenuUnfoldOutlined : MenuFoldOutlined

  return (
    <Flex className="w-full h-full">
      <Layout>
        <Sider
          className="relative"
          collapsed={collapsed}
          theme="light">
          {/* 品牌区：悬浮 Logo 时交叉淡变为折叠/展开图标；折叠时 Logo 水平居中 */}
          <Tooltip title={collapsed ? '展开' : '折叠'}>
            <div
              className="brand group relative flex items-center h-16 border-b border-ashen/70 cursor-pointer select-none overflow-hidden px-5"
              onClick={() => setCollapsed(!collapsed)}>
              <span
                className={`flex-none w-7 h-7 ${
                  collapsed
                    ? 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
                    : 'relative'
                }`}>
                <span className="absolute inset-0 rounded-full bg-primary/30 blur-[6px] transition-opacity duration-300 group-hover:opacity-0" />
                <span className="relative flex w-7 h-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-400 text-white text-sm font-bold shadow-sm transition-opacity duration-200 group-hover:opacity-0">
                  A
                </span>
                <CollapseIcon className="absolute inset-0 flex w-7 h-7 items-center justify-center text-base text-primary opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
              </span>
              <span
                className={`absolute left-16 text-[17px] font-semibold tracking-wide whitespace-nowrap transition-all duration-300 ease-out ${
                  collapsed ? 'opacity-0 -translate-x-2' : 'opacity-100 translate-x-0'
                }`}>
                Aura
              </span>
            </div>
          </Tooltip>

          <Menu
            className="!border-inline-end-none"
            style={{ height: 'calc(100% - 16rem)' }}
            selectedKeys={selectedKeys}
            items={menuItems}
            onClick={handleMenuClick}
            inlineCollapsed={collapsed}
            mode="inline"
            theme="light"
          />

          {/* 用户区：头像 + 用户名 + 退出（悬浮用户栏时浮现退出按钮） */}
          <div className="absolute bottom-0 left-0 w-full border-t border-ashen/70 bg-white">
            <div className="user-bar group relative flex items-center h-16 overflow-hidden px-5">
              <span
                className={`flex-none w-7 h-7 ${
                  collapsed
                    ? 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
                    : 'relative'
                }`}>
                <Avatar
                  size={28}
                  className="bg-gradient-to-br from-primary to-blue-400"
                  style={{ color: '#fff' }}>
                  {username.charAt(0).toUpperCase()}
                </Avatar>
              </span>
              <span
                className={`absolute left-16 text-sm text-gray-700 truncate transition-all duration-300 ease-out ${
                  collapsed ? 'opacity-0 -translate-x-2' : 'opacity-100 translate-x-0'
                }`}>
                {username}
              </span>
              <Tooltip title="退出登录">
                <LogoutOutlined
                  className={`absolute right-4 text-base text-gray-400 transition-all duration-300 ease-out hover:!text-red-500 ${
                    collapsed
                      ? 'opacity-0'
                      : 'opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0'
                  }`}
                  onClick={handleLogout}
                />
              </Tooltip>
            </div>
          </div>
        </Sider>
        <Layout>
          <Outlet />
        </Layout>
      </Layout>
    </Flex>
  )
}
