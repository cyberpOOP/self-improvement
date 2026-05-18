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
})
```