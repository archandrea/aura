import express from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { cacheSet, cacheGet } from '../utils/redis.js'
import { CronJob } from 'cron'

const MODELS_KEY = 'models:all'

const fetchData = async () => {
  const res = await fetch('https://models.dev/api.json')
  const data = await res.json()
  await cacheSet(MODELS_KEY, data, 7 * 24 * 3600)
  return data
}

const getModelsData = async () => {
  const cached = await cacheGet(MODELS_KEY)
  if (cached) return cached
  return await fetchData()
}

const job = new CronJob(
  '0 0 * * *', // cronTime
  fetchData, // onTick
  null, // onComplete
  true, // start
  'Asia/Shanghai' // timeZone
);


const router = express.Router()

function modelsEndpoints(apiRouter) {
  apiRouter.use('/models', router)

  router.get('/provider-list', asyncHandler(async (req, res) => {
    const data = await getModelsData()
    res.status(200).json({
      data: Object.keys(data || {}),
      code: 200,
      message: 'success'
    })
  }))

  router.get('/:provider/model-list', asyncHandler(async (req, res) => {
    const { provider } = req.params
    const data = await getModelsData()
    res.status(200).json({
      data: Object.keys(data[provider]?.models || {}),
      code: 200,
      message: 'success'
    })
  }))
}

export default modelsEndpoints