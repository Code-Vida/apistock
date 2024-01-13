const { join } = require('path')
const { readdirSync } = require('fs')

const allFilesButIndex = readdirSync(join(__dirname)).filter((f) => f !== 'index.js')
const resolvers = allFilesButIndex.map((file) => require(`./${file}`))

const initialState = {
  Query: {},
  Mutation: {},
}

module.exports = resolvers.reduce(
  (acc, resolver) => ({
    ...acc,
    ...resolver,

    Query: {
      ...acc.Query,
      ...resolver.Query,
    },

    Mutation: {
      ...acc.Mutation,
      ...resolver.Mutation,
    },
  }),
  initialState
)
