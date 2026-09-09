import express from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { CronJob } from 'cron'

let data = null
let providerList = []

const fetchData = async () => {
  const res = await fetch('https://models.dev/api.json')
  data = await res.json()
  providerList = Object.keys(data || {})
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
    if (providerList.length) {
      res.status(200).json({
        data: providerList,
        code: 200,
        message: 'success'
      })
      return
    }
    await fetchData()
    res.status(200).json({
      data: providerList,
      code: 200,
      message: 'success'
    })
  }))

  router.get('/:provider/model-list', asyncHandler(async (req, res) => {
    const { provider } = req.params
    res.status(200).json({
      data: Object.keys(data[provider]?.models || {}),
      code: 200,
      message: 'success'
    })
  }))
}

export default modelsEndpoints