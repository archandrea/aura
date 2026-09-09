import { request } from '@/http'

export const getChatListByWorkspaceId = (workspaceId: string) => {
  return request({
    url: `/api/chat/list/${workspaceId}`,
    method: 'GET',
  })
}

export const chatToWorkspace = (workspaceId: string, content: string) => {
  return request({
    url: `/api/chat/${workspaceId}`,
    method: 'POST',
    data: {
      content,
      stream: false,
    },
  })
}

export const streamChatToWorkspace = (workspaceId: string, content: string, onDownloadProgress: any) => {
  return request({
    url: `/api/chat/${workspaceId}`,
    method: 'POST',
    data: {
      content,
      stream: true,
    },
    onDownloadProgress,
  })
}