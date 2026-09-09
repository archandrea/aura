import { request } from '@/http'

export const list = (params?: any) => {
  return request({ url: '/api/menu/list', method: 'GET', params })
}

export const tree = (params?: any) => {
  return request({ url: '/api/menu/tree', method: 'GET', params })
}

export const create = (payload: any) => {
  return request({ url: '/api/menu', method: 'POST', data: payload })
}

export const update = (id: number, payload: any) => {
  return request({ url: `/api/menu/${id}`, method: 'PUT', data: payload })
}

export const remove = (id: number) => {
  return request({ url: `/api/menu/${id}`, method: 'DELETE' })
}
