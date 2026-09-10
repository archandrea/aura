// handler.ts
import { App } from 'antd'

let messageInstance = null
export const setMessageInstance = (instance) => {
  messageInstance = instance
}

export const handleNetworkError = (errStatus: number) => {
  // console.log('[network-error]::', errStatus)
  let errMessage
  if (errStatus) {
    switch (errStatus) {
      case 400:
        errMessage = '错误的请求'
        break
      case 401:
        errMessage = '无权限访问，请重新登陆'
        break
      case 403:
        errMessage = '拒绝访问'
        break
      case 404:
        errMessage = '未找到该资源或请求地址有误'
        break
      case 405:
        errMessage = '请求方法未允许'
        break
      case 408:
        errMessage = '请求超时'
        break
      case 429:
        errMessage = '请求太频繁，请稍后再试'
        break
      case 500:
        errMessage = '服务器端出错'
        break
      case 501:
        errMessage = '网络未实现'
        break
      case 502:
        errMessage = '网络错误'
        break
      case 503:
        errMessage = '服务不可用'
        break
      case 504:
        errMessage = '网络超时'
        break
      case 505:
        errMessage = 'http版本不支持该请求'
        break
      default:
        errMessage = `其他连接错误 --${errStatus}`
    }
  } else {
    errMessage = `无法连接到服务器！`
  }
  handleErrMsg(errMessage)
}

export const handleErrMsg = (msg: string) => {
  if (messageInstance) {
    messageInstance.error(msg)
  } else {
    console.warn('Message instance not set:', msg)
  }
}