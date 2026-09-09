import { useEffect, useState } from 'react'
import { App, Button, Drawer, Form, Input, InputNumber, Layout, Popconfirm, Select, Space, Switch, Table, Tag, TreeSelect } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { tree as menuTree, create as createMenu, update as updateMenu, remove as removeMenu } from '@/api/menu'
import { AuthButton } from '@/components/permission'

interface MenuRow {
  id: number
  parentId: number | null
  name: string
  code: string
  permission: string | null
  path: string | null
  icon: string | null
  sortOrder: number
  type: 'directory' | 'menu' | 'button'
  visible: number
  children?: MenuRow[]
}

const TYPE_LABEL: Record<string, string> = { directory: '目录', menu: '菜单', button: '按钮' }

// 页面级权限声明：AdminGuard 通过 useMatches 读取（见开发文档 B2）
export const handle = { permission: 'menu:list' }

export default function Page() {
  const { message } = App.useApp()
  const [list, setList] = useState<MenuRow[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [current, setCurrent] = useState<MenuRow | null>(null)
  const [form] = Form.useForm()

  const fetchList = async () => {
    const [err, res] = await menuTree()
    if (res) setList(res.data)
  }

  useEffect(() => { fetchList() }, [])

  // 父节点选择数据：排除 button 与自身（防自引用）
  const toParentOptions = (menus: MenuRow[]): any[] =>
    menus
      .filter((m) => m.type !== 'button' && m.id !== current?.id)
      .map((m) => ({
        value: m.id,
        title: m.name,
        children: m.children?.length ? toParentOptions(m.children) : undefined,
      }))

  const openCreate = () => {
    setCurrent(null)
    form.resetFields()
    form.setFieldsValue({ type: 'menu', visible: true, sortOrder: 0 })
    setEditOpen(true)
  }

  const openEdit = (record: MenuRow) => {
    setCurrent(record)
    form.setFieldsValue({ ...record, parentId: record.parentId ?? undefined, visible: record.visible === 1 })
    setEditOpen(true)
  }

  const submit = async () => {
    const values = await form.validateFields()
    const payload = { ...values, visible: values.visible ? 1 : 0, parentId: values.parentId ?? null }
    const [err, res] = current ? await updateMenu(current.id, payload) : await createMenu(payload)
    if (res) {
      message.success('操作成功')
      setEditOpen(false)
      fetchList()
    }
  }

  const handleDelete = async (record: MenuRow) => {
    const [err, res] = await removeMenu(record.id)
    if (res) {
      message.success('删除成功')
      fetchList()
    }
  }

  const columns: ColumnsType<MenuRow> = [
    { title: '名称', dataIndex: 'name' },
    { title: '标识', dataIndex: 'code' },
    { title: '权限码', dataIndex: 'permission', render: (v) => v || '-' },
    { title: '路由', dataIndex: 'path', render: (v) => v || '-' },
    { title: '类型', dataIndex: 'type', width: 80, render: (v) => <Tag>{TYPE_LABEL[v] ?? v}</Tag> },
    { title: '排序', dataIndex: 'sortOrder', width: 70 },
    {
      title: '操作',
      width: 160,
      render: (_, record) => (
        <Space>
          <AuthButton permission="menu:update">
            <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          </AuthButton>
          <AuthButton permission="menu:delete">
            <Popconfirm title="确定删除该菜单？" onConfirm={() => handleDelete(record)}>
              {/* 有子菜单时后端会 400，前端直接禁用 */}
              <Button size="small" danger disabled={!!record.children?.length}>删除</Button>
            </Popconfirm>
          </AuthButton>
        </Space>
      ),
    },
  ]

  return (
    <Layout.Content style={{ padding: '24px 32px' }}>
      <AuthButton permission="menu:create">
        <Button type="primary" style={{ marginBottom: 16 }} onClick={openCreate}>新增菜单</Button>
      </AuthButton>
      <Table rowKey="id" columns={columns} dataSource={list} pagination={false} />

      <Drawer
        title={current ? `编辑菜单 - ${current.name}` : '新增菜单'}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        extra={<Button type="primary" onClick={submit}>提交</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="parentId" label="上级菜单">
            <TreeSelect treeData={toParentOptions(list)} allowClear treeDefaultExpandAll />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="code"
            label="标识"
            rules={[{ required: true, pattern: /^[a-z][a-z0-9_]{1,63}$/, message: '小写字母开头，仅小写字母/数字/下划线' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="permission"
            label="权限码"
            extra="如 user:create；目录类型留空"
            rules={[{ pattern: /^[a-z][a-z0-9_]*(?::[a-z][a-z0-9_]*)+$/, message: '冒号分隔，如 user:create' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="path" label="前端路由" extra="仅菜单类型需要，如 /admin/users">
            <Input />
          </Form.Item>
          <Form.Item name="icon" label="图标标识" extra="对应前端 ICON_MAP 的键名，可留空">
            <Input />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'directory', label: '目录' },
                { value: 'menu', label: '菜单' },
                { value: 'button', label: '按钮' },
              ]}
            />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序" extra="数值越小越靠前">
            <InputNumber min={0} />
          </Form.Item>
          <Form.Item name="visible" label="是否可见" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </Layout.Content>
  )
}
