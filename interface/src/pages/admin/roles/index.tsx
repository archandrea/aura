import { useEffect, useState } from 'react'
import { App, Button, Drawer, Form, Input, Layout, Popconfirm, Space, Table, Tag, Tree } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { list as listRoles, create as createRole, update as updateRole, remove as removeRole, getMenus, assignMenus } from '@/api/role'
import { tree as menuTree } from '@/api/menu'
import { AuthButton, usePermission } from '@/components/permission'

interface RoleRow { id: number; name: string; code: string; description: string; isSystem: number }
interface MenuNode { id: number; name: string; permission: string | null; type: string; children?: MenuNode[] }

// menu 树 → antd Tree treeData（标题上带权限码，勾选时更直观）
const toTreeData = (menus: MenuNode[]): any[] =>
  menus.map((m) => ({
    key: m.id,
    title: m.permission ? `${m.name}（${m.permission}）` : m.name,
    children: m.children?.length ? toTreeData(m.children) : undefined,
  }))

// 收集所有有子节点的 menu id（这些 id 由 Tree 依据子节点自动推导勾选/半选状态）
const collectParentIds = (menus: MenuNode[], set = new Set<number>()): Set<number> => {
  menus.forEach((m) => {
    if (m.children?.length) {
      set.add(m.id)
      collectParentIds(m.children, set)
    }
  })
  return set
}

// 页面级权限声明：AdminGuard 通过 useMatches 读取（见开发文档 B2）
export const handle = { permission: 'role:list' }

export default function Page() {
  const { message } = App.useApp()
  const { isSuperAdmin } = usePermission()
  const [list, setList] = useState<RoleRow[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [permOpen, setPermOpen] = useState(false)
  const [current, setCurrent] = useState<RoleRow | null>(null)
  const [menuData, setMenuData] = useState<MenuNode[]>([])
  const [checkedMenuIds, setCheckedMenuIds] = useState<number[]>([])
  const [halfCheckedMenuIds, setHalfCheckedMenuIds] = useState<number[]>([])
  const [form] = Form.useForm()

  const fetchList = async () => {
    const [err, res] = await listRoles()
    if (res) setList(res.data)
  }

  useEffect(() => { fetchList() }, [])

  const openCreate = () => {
    setCurrent(null)
    form.resetFields()
    setEditOpen(true)
  }

  const openEdit = (record: RoleRow) => {
    setCurrent(record)
    form.setFieldsValue({ name: record.name, description: record.description })
    setEditOpen(true)
  }

  const submitEdit = async () => {
    const values = await form.validateFields()
    const [err, res] = current ? await updateRole(current.id, values) : await createRole(values)
    if (res) {
      message.success('操作成功')
      setEditOpen(false)
      fetchList()
    }
  }

  const openPerm = async (record: RoleRow) => {
    setCurrent(record)
    const [err1, res1] = await menuTree()
    if (res1) setMenuData(res1.data)
    const [err2, res2] = await getMenus(record.id)
    if (res2) {
      // 后端返回含父节点 id；只把叶子/按钮喂给 Tree 作 checkedKeys，
      // 父节点的勾选/半选状态交给 Tree 依据子节点自动推导，避免 antd 级联把未勾选的兄弟节点带亮
      const parentIds = collectParentIds(res1?.data ?? [])
      setCheckedMenuIds((res2.data as number[]).filter((id) => !parentIds.has(id)))
    }
    setHalfCheckedMenuIds([])
    setPermOpen(true)
  }

  const submitPerm = async () => {
    // 提交全量 menuIds = 勾选节点 + 半选父节点（父节点也要入库，目录才能在菜单树中正确挂载）
    const menuIds = [...checkedMenuIds, ...halfCheckedMenuIds]
    const [err, res] = await assignMenus(current!.id, menuIds)
    if (res) {
      message.success('权限已更新')
      setPermOpen(false)
    }
  }

  const handleDelete = async (record: RoleRow) => {
    const [err, res] = await removeRole(record.id)
    if (res) {
      message.success('删除成功')
      fetchList()
    }
  }

  const columns: ColumnsType<RoleRow> = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    {
      title: '名称',
      dataIndex: 'name',
      render: (v, r) => (
        <Space>
          {v}
          {r.isSystem === 1 && <Tag color="blue">系统</Tag>}
        </Space>
      ),
    },
    { title: '标识', dataIndex: 'code' },
    { title: '描述', dataIndex: 'description' },
    {
      title: '操作',
      render: (_, record) => (
        <Space>
          <AuthButton permission="role:update">
            <Button size="small" disabled={record.isSystem === 1} onClick={() => openEdit(record)}>编辑</Button>
          </AuthButton>
          <AuthButton permission="role:assign_permission">
            {/* 系统角色仅 super_admin 可改（服务端强校验），非 super 点击会被 403 提示 */}
            <Button size="small" disabled={record.isSystem === 1 && !isSuperAdmin} onClick={() => openPerm(record)}>分配权限</Button>
          </AuthButton>
          <AuthButton permission="role:delete">
            <Popconfirm title="确定删除该角色？" onConfirm={() => handleDelete(record)}>
              <Button size="small" danger disabled={record.isSystem === 1}>删除</Button>
            </Popconfirm>
          </AuthButton>
        </Space>
      ),
    },
  ]

  return (
    <Layout.Content style={{ padding: '24px 32px' }}>
      <AuthButton permission="role:create">
        <Button type="primary" style={{ marginBottom: 16 }} onClick={openCreate}>新增角色</Button>
      </AuthButton>
      <Table rowKey="id" columns={columns} dataSource={list} pagination={false} />

      <Drawer
        title={current ? `编辑角色 - ${current.name}` : '新增角色'}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        extra={<Button type="primary" onClick={submitEdit}>提交</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          {!current && (
            <Form.Item
              name="code"
              label="标识"
              rules={[{ required: true, pattern: /^[a-z][a-z0-9_]{1,63}$/, message: '小写字母开头，仅小写字母/数字/下划线' }]}
              extra="创建后不可修改"
            >
              <Input />
            </Form.Item>
          )}
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} maxLength={255} />
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer
        title={`分配权限 - ${current?.name ?? ''}`}
        open={permOpen}
        onClose={() => setPermOpen(false)}
        extra={<Button type="primary" onClick={submitPerm}>提交</Button>}
      >
        <Tree
          checkable
          defaultExpandAll
          selectable={false}
          treeData={toTreeData(menuData)}
          checkedKeys={checkedMenuIds}
          onCheck={(checked: any, info: any) => {
            setCheckedMenuIds(checked as number[])
            setHalfCheckedMenuIds((info.halfCheckedKeys as number[]) ?? [])
          }}
        />
      </Drawer>
    </Layout.Content>
  )
}
