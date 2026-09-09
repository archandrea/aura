import axios from 'axios'
import { handleNetworkError, handleErrMsg, } from './handler'
const env = import.meta.env
import { useUserStore } from '@/store'

const service = axios.create({
  baseURL: env.VITE_APP_BASE_API,
})

service.interceptors.request.use(config => {
  // console.log('request-interceptors', config)
  const { user } = useUserStore.getState()
  if (user?.token) {
    config.headers.Authorization = `Bearer ${user.token}`
  }
  return config
})

service.interceptors.response.use(response => {
  // console.log('response-interceptors', response)
  if (response.config?.data && JSON.parse(response.config.data).stream === true) {
    return response
  }
  if (response.data?.code !== 200) {
    handleErrMsg(response.data?.message)
    return Promise.reject(response.data)
  }
  return response.data
}, error => {
  // console.log('response-interceptors-error', error)
  const errStatus = error.status ?? error.response?.status
  handleNetworkError(errStatus)
  if (errStatus === 401) {
    window.location.href = '/login'
  }
  return Promise.reject(error)
})

export default service
