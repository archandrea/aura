import { request } from '@/http'

export const list = (params?: any) => {
  return request({ url: '/api/role/list', method: 'GET', params })
}

export const create = (payload: any) => {
  return request({ url: '/api/role', method: 'POST', data: payload })
}

export const update = (id: number, payload: any) => {
  return request({ url: `/api/role/${id}`, method: 'PUT', data: payload })
}

export const remove = (id: number) => {
  return request({ url: `/api/role/${id}`, method: 'DELETE' })
}

export const getMenus = (id: number) => {
  return request({ url: `/api/role/${id}/menus`, method: 'GET' })
}

export const assignMenus = (id: number, menuIds: number[]) => {
  return request({ url: `/api/role/${id}/menus`, method: 'PUT', data: { menuIds } })
}
