import { useEffect, useState } from 'react'
import { App, Button, Drawer, Form, Input, Layout, Popconfirm, Select, Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { findById, page as pageUser, remove as removeUser, update as updateUser, assignRoles } from '@/api/user'
import { list as listRoles } from '@/api/role'
import { AuthButton } from '@/components/permission'

interface UserRow { id: number; name: string; email: string; createdAt: string }
interface RoleRow { id: number; name: string; code: string; isSystem: number }

// 页面级权限声明：AdminGuard 通过 useMatches 读取（见开发文档 B2）
export const handle = { permission: 'user:list' }

export default function Page() {
  const { message } = App.useApp()
  const [list, setList] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState({ page: 1, pageSize: 10, keyword: '' })
  const [editOpen, setEditOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [current, setCurrent] = useState<UserRow | null>(null)
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [form] = Form.useForm()
  const [roleForm] = Form.useForm()

  const fetchList = async (q = query) => {
    const [err, res] = await pageUser({ page: q.page, pageSize: q.pageSize, keyword: q.keyword || undefined })
    if (res) {
      setList(res.data.rows)
      setTotal(res.data.total)
    }
  }

  useEffect(() => { fetchList() }, [query])

  const openEdit = (record: UserRow) => {
    setCurrent(record)
    form.setFieldsValue({ name: record.name, email: record.email, password: undefined })
    setEditOpen(true)
  }

  const submitEdit = async () => {
    const values = await form.validateFields()
    if (!values.password) delete values.password // 留空不改密码
    const [err, res] = await updateUser(current!.id, values)
    if (res) {
      message.success('更新成功')
      setEditOpen(false)
      fetchList()
    }
  }

  const openAssign = async (record: UserRow) => {
    setCurrent(record)
    if (roles.length === 0) {
      const [err2, res2] = await listRoles()
      if (res2) setRoles(res2.data)
    }
    const [err, res] = await findById(record.id)
    if (res) {
      roleForm.setFieldsValue({ roleIds: res.data.roleIds })
    }
    setAssignOpen(true)
  }

  const submitAssign = async () => {
    const { roleIds } = await roleForm.validateFields()
    const [err, res] = await assignRoles(current!.id, roleIds)
    if (res) {
      message.success('分配成功')
      setAssignOpen(false)
    }
  }

  const handleDelete = async (record: UserRow) => {
    const [err, res] = await removeUser(record.id)
    if (res) {
      message.success('删除成功')
      fetchList()
    }
  }

  const columns: ColumnsType<UserRow> = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: '用户名', dataIndex: 'name' },
    { title: '邮箱', dataIndex: 'email' },
    { title: '创建时间', dataIndex: 'createdAt' },
    {
      title: '操作',
      render: (_, record) => (
        <Space>
          <AuthButton permission="user:update">
            <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          </AuthButton>
          <AuthButton permission="user:assign_role">
            <Button size="small" onClick={() => openAssign(record)}>分配角色</Button>
          </AuthButton>
          <AuthButton permission="user:delete">
            <Popconfirm title="确定删除该用户？" onConfirm={() => handleDelete(record)}>
              <Button size="small" danger>删除</Button>
            </Popconfirm>
          </AuthButton>
        </Space>
      ),
    },
  ]

  return (
    <Layout.Content style={{ padding: '24px 32px' }}>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索用户名/邮箱"
          allowClear
          onSearch={(keyword) => setQuery((q) => ({ ...q, keyword, page: 1 }))}
        />
      </Space>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={list}
        pagination={{
          current: query.page,
          pageSize: query.pageSize,
          total,
          showSizeChanger: true,
          onChange: (page, pageSize) => setQuery((q) => ({ ...q, page, pageSize })),
        }}
      />

      <Drawer
        title={`编辑用户 - ${current?.name ?? ''}`}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        extra={<Button type="primary" onClick={submitEdit}>提交</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入正确邮箱' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="重置密码" extra="至少 8 位，含字母、数字和 -_；留空表示不修改">
            <Input.Password />
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer
        title={`分配角色 - ${current?.name ?? ''}`}
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        extra={<Button type="primary" onClick={submitAssign}>提交</Button>}
      >
        <Form form={roleForm} layout="vertical">
          <Form.Item name="roleIds" label="角色（提交后全量替换）" rules={[{ required: true, message: '至少选择一个角色' }]}>
            <Select mode="multiple" optionLabelProp="label">
              {roles.map((r) => (
                <Select.Option key={r.id} value={r.id} label={r.name}>
                  {r.name}（{r.code}）
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Drawer>
    </Layout.Content>
  )
}
