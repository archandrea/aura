import { request } from '@/http'

export const login = (payload: any) => {
  return request({
    url: '/api/user/login',
    method: 'POST',
    data: payload,
  })
}

export const register = (payload: any) => {
  return request({
    url: '/api/user/register',
    method: 'POST',
    data: payload,
  })
}

export const profile = () => {
  return request({
    url: '/api/user/profile',
    method: 'GET',
  })
}

export const findById = (id: number) => {
  return request({
    url: `/api/user/${id}`,
    method: 'GET',
  })
}

export const page = (params: any) => {
  return request({
    url: '/api/user/page',
    method: 'GET',
    params,
  })
}

export const update = (id: number, payload: any) => {
  return request({
    url: `/api/user/${id}`,
    method: 'PUT',
    data: payload,
  })
}

export const remove = (id: number) => {
  return request({
    url: `/api/user/${id}`,
    method: 'DELETE',
  })
}

export const assignRoles = (id: number, roleIds: number[]) => {
  return request({
    url: `/api/user/${id}/roles`,
    method: 'PUT',
    data: { roleIds },
  })
}