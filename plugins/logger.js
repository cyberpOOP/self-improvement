```js
import fp from 'fastify-plugin'

export default fp(async function customLogger(fastify, opts) {
  fastify.addHook('onRequest', async (request, reply) => {
    fastify.log.info(`[REQ] ${request.method} ${request.url}`)
  })

  fastify.addHook('onResponse', async (request, reply) => {
    fastify.log.info(`[RES] ${request.method} ${request.url} -> ${reply.statusCode}`)
  })

  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error({
      method: request.method,
      url: request.url,
      message: error.message,
      stack: error.stack
    }, `[ERR] ${request.method} ${request.url} → ${reply.statusCode}`)

    // Send error message only if not already sent
    if (!reply.sent) {
      reply.code(500).send({ error: 'Internal Server Error' })
    }
  })

  // Log uncaught exceptions and unhandled rejections
  process.on('uncaughtException', (err) => {
    fastify.log.fatal({ message: 'Uncaught Exception', error: err })
    process.exit(1)
  })

  process.on('unhandledRejection', (reason, promise) => {
    fastify.log.error({ message: 'Unhandled Rejection', reason, promise })
  })

  // Log all incoming request headers for better traceability
  fastify.addHook('onRequest', async (request, reply) => {
    fastify.log.debug({ headers: request.headers }, `[HDR] ${request.method} ${request.url}`)
  })
})
```