import { route, layout, prefix, index } from '@react-router/dev/routes'

export default [
  index('./pages/index.tsx'),
  route('login', './pages/login/index.tsx'),
  layout('./components/layout/index.tsx', [
    route('chat', './pages/chat/index.tsx'),
    ...prefix('note', [index('./pages/note/index.tsx'), route('edit/:id?', './pages/note/edit.tsx')]),
    ...prefix('setting', [index('./pages/setting/index.tsx'), route('model-config', './pages/setting/model-config.tsx')]),
    layout('./components/guard/index.tsx', [
      ...prefix('admin', [
        route('users', './pages/admin/users/index.tsx'),
        route('roles', './pages/admin/roles/index.tsx'),
        route('menus', './pages/admin/menus/index.tsx'),
      ]),
    ]),
  ]),
]
