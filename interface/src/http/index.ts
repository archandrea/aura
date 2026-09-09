import service from './request'
import type { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'

export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

export type RequestError = ApiResponse<never> | AxiosError
export type Result<T> = [null, ApiResponse<T>] | [RequestError, null]

export const request = <T = unknown>(
  options: AxiosRequestConfig,
): Promise<Result<T>> =>
  service<unknown, ApiResponse<T>>(options)
    .then((res): Result<T> => [null, res])
    .catch((err): Result<T> => [err, null])