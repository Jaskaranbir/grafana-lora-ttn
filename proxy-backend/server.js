const express = require('express')

const config = require('./config')
const dbWriter = require('./dao/dbWriter')
const dbReader = require('./dao/dbReader')
const dbToGrafanaFormatter = require('./utils/dbToGrafanaFormatter')

const app = express()

app.use(express.json())

// Health check
app.all('/', (req, res) => res.send("Server is working."))

// ============ App Code =================

// Start adding mock data with interval
// as specified in config-file
dbWriter.start()

app.all('/search', (req, res) => {
  const sensorNames = Object.keys(config.sensorModelsMap)
  res.send(sensorNames)
})

// Gets results within time-range from database
const fetchResults = async (sensorNames, timeRangeFrom, timeRangeTo) => {
  return sensorNames.map(async sensorName => {
    if (sensorName) {
      let dbResults;
      try {
        dbResults = await dbReader.getSensorDataInTimeRange(
          sensorName,
          timeRangeFrom,
          timeRangeTo
        )
      }
      catch(err) {
        console.log(err)
      }
      return {
        sensorName,
        dbResults
      }
    }
  })
}

// Formats data fetched from MongoDB to Grafana's Simple-Json query response.
const formatResults = async (dbResults) => {
  const formattedValues = dbResults.map(async dbResult => {
    try{
      const resultData = await dbResult
      return dbToGrafanaFormatter(resultData.sensorName, resultData.dbResults)
    }
    catch(err) {
      console.log(err)
    }
  })

  // Resolves all the promises in formattedValues
  const resolvedFormattedValues = await Promise.all(formattedValues)
  return resolvedFormattedValues
}

app.all('/query', async (req, res) => {
  const reqBody = req.body
  // In our context, Grafana targets refer to sensor-names
  const sensorNames = reqBody.targets.map(t => t.target)

  // The initial Grafana request only contains "type" in "targets".
  // So we filter that out.
  if (sensorNames[0]) {
    // Wait for queries to finish and return results
    const dbResults = await fetchResults(sensorNames, reqBody.range.from, reqBody.range.to)
    const formattedResults = await formatResults(dbResults)
    res.send(formattedResults)
  }
  else {
    res.send([])
  }
})

app.listen(config.port, () => {
    console.log(`Running on http://localhost:${config.port}`)
})
