import { App, Flex, Card, Space, Button, Checkbox, Form, Input } from 'antd'
import { LockOutlined, UserOutlined, MailOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams, useSubmit } from 'react-router'
import { useState, useEffect } from 'react'
import { login, register, profile } from '@/api/user'
import { useUserStore } from '@/store'

const submitLogin = async (payload: any) => {
  const [err, res] = await login(payload)
  if (res) {
    return res.data
  }
  return null
}

const submitRegister = async (payload: any) => {
  const [err, res] = await register(payload)
  if (res) {
    return res.data
  }
  return null
}

export async function clientAction({ request }) {
  const formData = await request.formData()
  const payload = Object.fromEntries(formData)
  if (payload.type === 'login') {
    return await submitLogin(payload)
  }
  if (payload.type === 'register') {
    return await submitRegister(payload)
  }
}

export function LoginPanel() {
  const submit = useSubmit()
  const navigate = useNavigate()

  const handleSubmit = (values) => {
    submit(values, { method: 'post' })
  }

  return (
    <Card title="用户登录">
      <Form
        name="login"
        initialValues={{ type: 'login' }}
        onFinish={handleSubmit}>
        <Form.Item
          name="type"
          hidden></Form.Item>
        <Form.Item
          name="email"
          rules={[{ required: true, message: '请输入邮箱' }]}>
          <Input
            prefix={<MailOutlined />}
            placeholder="请输入邮箱"
          />
        </Form.Item>
        <Form.Item
          name="password"
          rules={[{ required: true, message: '请输入密码' }]}>
          <Input
            prefix={<LockOutlined />}
            type="password"
            placeholder="请输入密码"
          />
        </Form.Item>
        {/* <Form.Item>
              <Flex
                justify="space-between"
                align="center">
                <Form.Item
                  name="remember"
                  valuePropName="checked"
                  noStyle>
                  <Checkbox>Remember me</Checkbox>
                </Form.Item>
                <a href="">Forgot password</a>
              </Flex>
            </Form.Item> */}

        <Form.Item>
          <Button
            block
            type="primary"
            htmlType="submit">
            登录
          </Button>
          没有账户？
          <Button
            type="link"
            htmlType="button"
            onClick={() => navigate('/login?type=register')}>
            立即注册
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}

export function RegisterPanel() {
  const submit = useSubmit()
  const [form] = Form.useForm()
  const navigate = useNavigate()

  const handleSubmit = (values) => {
    submit(values, { method: 'post' })
  }

  return (
    <Card title="用户注册">
      <Form
        name="register"
        form={form}
        initialValues={{ type: 'register' }}
        onFinish={handleSubmit}>
        <Form.Item
          name="type"
          hidden></Form.Item>
        <Form.Item
          name="name"
          rules={[
            { required: true, message: '请输入用户名' },
            { pattern: /^[a-zA-Z0-9_-]{4,16}$/, message: '用户名只能包含字母、数字、下划线和减号，且长度在4-16之间' },
          ]}>
          <Input
            prefix={<UserOutlined />}
            placeholder="请输入用户名"
          />
        </Form.Item>
        <Form.Item
          name="email"
          rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '请输入正确的邮箱' },
          ]}>
          <Input
            prefix={<MailOutlined />}
            placeholder="请输入邮箱"
          />
        </Form.Item>
        <Form.Item
          name="password"
          rules={[
            { required: true, message: '请输入密码' },
            { pattern: /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[-_])[A-Za-z\d-_]{8,}$/, message: '密码至少8位，包含字母、数字和特殊字符 (-_)' },
          ]}>
          <Input
            prefix={<LockOutlined />}
            type="password"
            placeholder="请输入密码"
          />
        </Form.Item>
        <Form.Item
          name="password2"
          validateTrigger="onBlur"
          rules={[
            { required: true, message: '请再次输入密码' },
            {
              validator: (rule, value) => {
                return new Promise((resolve, reject) => {
                  if (value !== form.getFieldValue('password')) {
                    reject('两次输入的密码不一致')
                  } else {
                    resolve()
                  }
                })
              },
            },
          ]}>
          <Input
            prefix={<LockOutlined />}
            type="password"
            placeholder="请再次输入密码"
          />
        </Form.Item>
        <Form.Item>
          <Button
            block
            type="primary"
            htmlType="submit">
            注册
          </Button>
          已有账户？
          <Button
            type="link"
            htmlType="button"
            onClick={() => navigate('/login?type=login')}>
            立即登录
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}

export default function Page({ actionData }) {
  const { message } = App.useApp()
  let [searchParams] = useSearchParams()
  const [type, setType] = useState('login')
  const setUser = useUserStore((state) => state.setUser)
  const setRoles = useUserStore((state) => state.setRoles)
  const setMenus = useUserStore((state) => state.setMenus)
  const setPermissions = useUserStore((state) => state.setPermissions)
  const navigate = useNavigate()

  const setProfile = async () => {
    const [err, res] = await profile()
    if (res?.data) {
      const { roles, permissions, menus } = res.data
      setRoles(roles)
      setMenus(menus)
      setPermissions(permissions)
    }
    return null
  }

  useEffect(() => {
    const type = searchParams.get('type')
    if (type && ['login', 'register'].includes(type)) {
      setType(type)
    }
  }, [searchParams])

  useEffect(() => {
    if (!actionData) return
    message.success('提交成功')
    const go = async () => {
      if (type === 'login') {
        setUser(actionData)
        // 等角色/菜单写入 store 再进主界面，避免首帧空菜单
        await setProfile()
        navigate('/chat')
      }
      if (type === 'register') {
        setType('login')
      }
    }
    go()
  }, [actionData])

  return (
    <div className="w-full h-full flex justify-center items-center">
      <div className="w-100">{type === 'login' ? <LoginPanel /> : <RegisterPanel />}</div>
    </div>
  )
}
