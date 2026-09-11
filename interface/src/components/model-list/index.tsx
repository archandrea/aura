import React, { useState, useEffect } from 'react'
import { App, Space, Card, Switch, Drawer, Form, Input, InputNumber, Button, Popconfirm, Select } from 'antd'
import { SettingOutlined, DeleteOutlined } from '@ant-design/icons'
import { getProviderList, getModelList, getModelConfigGroup, createModelConfig, updateModelConfig, deleteModelConfig } from '@/api/setting'

const NATIVE_PROVIDERS = ['openai', 'anthropic', 'google']

export function ModelConfigPanel({ data = null, open, setOpen, refresh }) {
  const [form] = Form.useForm()
  const { message } = App.useApp()
  const [providerList, setProviderList] = useState([])
  const [modelList, setModelList] = useState([])
  const [custom, setCustom] = useState(false)

  const fetchProviderList = async () => {
    const [err, res] = await getProviderList()
    if (res) {
      setProviderList(res.data || [])
    }
  }

  const fetchModelList = async (provider: string) => {
    const [err, res] = await getModelList(provider)
    if (res) {
      setModelList(res.data || [])
    }
  }

  const handleSubmit = async () => {
    await form.validateFields()
    const values = form.getFieldsValue()
    values.isActive = values.isActive ? 1 : 0
    const payload = data ? [data.id, values] : [values]
    const api = data ? updateModelConfig : createModelConfig
    const [err, res] = await api(...payload)
    if (res) {
      message.success('操作成功')
      setOpen(false)
      refresh()
    }
  }

  const handleProviderChange = (value: string) => {
    if (value) {
      fetchModelList(value)
    } else {
      setModelList([])
      form.setFieldValue('modelName', '')
    }
  }

  useEffect(() => {
    fetchProviderList()
    if (data) {
      form.setFieldsValue(data)
      data.provider && fetchModelList(data.provider)
    } else {
      form.resetFields()
      setModelList([])
    }
  }, [data])

  return (
    <Drawer
      title={data ? '编辑配置' : '新增配置'}
      size="large"
      closable
      open={open}
      onClose={() => setOpen(false)}
      extra={
        <Space>
          <Button
            onClick={handleSubmit}
            type="primary">
            提交
          </Button>
        </Space>
      }>
      <Form
        name="modelConfig"
        form={form}
        initialValues={{ remember: true }}
        labelAlign="right"
        labelCol={{ span: 3 }}
        wrapperCol={{ span: 21 }}>
        <Form.Item label="自定义">
          <Switch
            value={custom}
            onChange={(checked) => setCustom(checked)}
          />
        </Form.Item>
        <Form.Item
          label="Provider"
          name="provider"
          rules={[{ required: true, message: '请选择' }]}>
          {custom ? (
            <Input />
          ) : (
            <Select
              onChange={handleProviderChange}
              showSearch
              options={[...new Set([...providerList, 'openai-compatible'])].map((item) => {
                return { value: item, label: item }
              })}
            />
          )}
        </Form.Item>
        <Form.Item
          label="模型名称"
          name="modelName"
          rules={[{ required: true, message: '请选择' }]}>
          {custom || modelList.length === 0 ? (
            <Input />
          ) : (
            <Select
              showSearch
              options={modelList.map((item) => {
                return { value: item, label: item }
              })}
            />
          )}
        </Form.Item>
        <Form.Item
          label="Base URL"
          name="baseUrl"
          dependencies={['provider']}
          rules={[
            ({ getFieldValue }) => ({
              validator(_, value) {
                const provider = getFieldValue('provider')
                if (provider && !NATIVE_PROVIDERS.includes(provider) && !value) {
                  return Promise.reject(new Error('该 Provider 需要填写 Base URL'))
                }
                return Promise.resolve()
              },
            }),
          ]}>
          <Input />
        </Form.Item>
        <Form.Item
          label="API key"
          name="apiKey">
          <Input />
        </Form.Item>
        <Form.Item
          label="启用"
          name="isActive"
          valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Drawer>
  )
}

export default function ModelList({ editable = false, selectHander = () => {} }) {
  const [modelConfigList, setModelConfigList] = useState({})
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)

  const handleConfig = (item: any) => {
    setData(item)
    setOpen(true)
  }

  const handleDelete = async (id: string) => {
    const [err, res] = await deleteModelConfig(id)
    if (res) {
      fetchModelConfigGroup()
    }
  }

  const handleSwitch = async (checked: boolean, item: any) => {
    const payload = { isActive: Number(checked) }
    const [err, res] = await updateModelConfig(item.id, payload)
    if (res) {
      fetchModelConfigGroup()
    }
  }

  const modelConfigGroup = Object.entries(modelConfigList).map(([provider, list]) => {
    if (!list.length) return null
    const modelList = list.map((item) => {
      return (
        <Card
          key={item.id}
          style={{ width: 200 }}
          onClick={selectHander}
          actions={
            editable
              ? [
                  <SettingOutlined
                    key="setting"
                    onClick={() => handleConfig(item)}
                  />,
                  <Popconfirm
                    title="删除配置"
                    description="你确定要删除该配置吗"
                    onConfirm={() => handleDelete(item.id)}
                    okText="确定"
                    cancelText="取消">
                    <DeleteOutlined key="delete" />
                  </Popconfirm>,
                  <Switch
                    size="small"
                    value={item.isActive}
                    onChange={(checked) => handleSwitch(checked, item)}
                  />,
                ]
              : null
          }>
          <Card.Meta title={item.modelName} />
        </Card>
      )
    })
    return (
      <React.Fragment key={provider}>
        <h3 className="my-4 text-xl font-bold">{provider} </h3>
        <Space
          size={[8, 16]}
          wrap>
          {modelList}
        </Space>
      </React.Fragment>
    )
  })

  const fetchModelConfigGroup = async () => {
    const [err, res] = await getModelConfigGroup()
    console.log('[API]::[fetchModelConfigGroup]::', res, err)
    if (res) {
      setModelConfigList(res.data || {})
    }
  }

  useEffect(() => {
    fetchModelConfigGroup()
  }, [])

  return (
    <>
      {editable && (
        <Space className="w-full justify-end">
          <Button
            onClick={() => handleConfig(null)}
            type="primary">
            新增配置
          </Button>
        </Space>
      )}
      {modelConfigGroup}
      <ModelConfigPanel
        data={data}
        open={open}
        setOpen={setOpen}
        refresh={fetchModelConfigGroup}
      />
    </>
  )
}
