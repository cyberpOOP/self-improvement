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
      reply.code(error.statusCode || 500).send({ error: error.message || 'Internal Server Error' })
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

  // Log request body for POST, PATCH methods for better traceability
  fastify.addHook('preHandler', async (request, reply) => {
    if (['POST', 'PATCH'].includes(request.method)) {
      fastify.log.debug({ body: request.body }, `[BODY] ${request.method} ${request.url}`)
    }
  })

  // Add security: log and reject requests without Authorization header for /api routes
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api') && !request.headers.authorization) {
      fastify.log.warn(`[AUTH] Missing Authorization header on ${request.method} ${request.url}`)
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  // Add security: reject requests with suspicious User-Agent header
  fastify.addHook('onRequest', async (request, reply) => {
    const userAgent = request.headers['user-agent'] || ''
    if (/sqlmap|curl|nikto|fuzz/i.test(userAgent)) {
      fastify.log.warn(`[SEC] Suspicious User-Agent detected: ${userAgent} on ${request.method} ${request.url}`)
      reply.code(403).send({ error: 'Forbidden' })
    }
  })

  // Add security: reject requests with missing or invalid Content-Type header for POST and PATCH
  fastify.addHook('onRequest', async (request, reply) => {
    if (['POST', 'PATCH'].includes(request.method)) {
      const contentType = request.headers['content-type'] || ''
      if (!contentType.includes('application/json')) {
        fastify.log.warn(`[SEC] Invalid Content-Type header: ${contentType} on ${request.method} ${request.url}`)
        reply.code(415).send({ error: 'Unsupported Media Type' })
      }
    }
  })

  // Add security: reject requests with empty body for POST and PATCH
  fastify.addHook('preHandler', async (request, reply) => {
    if (['POST', 'PATCH'].includes(request.method)) {
      if (!request.body || (typeof request.body === 'object' && Object.keys(request.body).length === 0)) {
        fastify.log.warn(`[SEC] Empty request body on ${request.method} ${request.url}`)
        reply.code(400).send({ error: 'Bad Request: Empty body' })
      }
    }
  })

  // Add security: reject requests with query parameters containing suspicious characters
  fastify.addHook('onRequest', async (request, reply) => {
    const suspiciousPattern = /['";--]/ // simple pattern to detect SQL injection attempts
    for (const key in request.query) {
      const value = request.query[key]
      if (typeof value === 'string' && suspiciousPattern.test(value)) {
        fastify.log.warn(`[SEC] Suspicious query parameter detected: ${key}=${value} on ${request.method} ${request.url}`)
        reply.code(400).send({ error: 'Bad Request: Suspicious query parameter' })
        return
      }
    }
  })

  // Add security: reject requests with query parameters containing spaces (common in injection attempts)
  fastify.addHook('onRequest', async (request, reply) => {
    for (const key in request.query) {
      const value = request.query[key]
      if (typeof value === 'string' && /\s/.test(value)) {
        fastify.log.warn(`[SEC] Suspicious query parameter with spaces detected: ${key}=${value} on ${request.method} ${request.url}`)
        reply.code(400).send({ error: 'Bad Request: Suspicious query parameter' })
        return
      }
    }
  })

  // Add security: reject requests with excessively long URLs to prevent DoS attacks
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.raw.url && request.raw.url.length > 2048) {
      fastify.log.warn(`[SEC] Request URL too long: length ${request.raw.url.length} on ${request.method} ${request.url}`)
      reply.code(414).send({ error: 'Request-URI Too Long' })
    }
  })

  // Add security: reject requests with query parameters containing non-ASCII characters
  fastify.addHook('onRequest', async (request, reply) => {
    for (const key in request.query) {
      const value = request.query[key]
      if (typeof value === 'string' && /[^\x00-\x7F]/.test(value)) {
        fastify.log.warn(`[SEC] Non-ASCII characters detected in query parameter: ${key}=${value} on ${request.method} ${request.url}`)
        reply.code(400).send({ error: 'Bad Request: Invalid characters in query parameter' })
        return
      }
    }
  })

  // Add security: reject requests with suspicious Referer header
  fastify.addHook('onRequest', async (request, reply) => {
    const referer = request.headers['referer'] || ''
    if (referer && /javascript:|data:/i.test(referer)) {
      fastify.log.warn(`[SEC] Suspicious Referer header detected: ${referer} on ${request.method} ${request.url}`)
      reply.code(403).send({ error: 'Forbidden' })
    }
  })

  // Add security: reject requests with query parameters containing only digits (simple bot detection)
  fastify.addHook('onRequest', async (request, reply) => {
    for (const key in request.query) {
      const value = request.query[key]
      if (typeof value === 'string' && /^\d+$/.test(value)) {
        fastify.log.warn(`[SEC] Query parameter with only digits detected: ${key}=${value} on ${request.method} ${request.url}`)
        reply.code(400).send({ error: 'Bad Request: Suspicious query parameter' })
        return
      }
    }
  })

  // Add security: reject requests with query parameters containing JavaScript event handlers (simple XSS detection)
  fastify.addHook('onRequest', async (request, reply) => {
    const xssPattern = /on\w+=/i
    for (const key in request.query) {
      const value = request.query[key]
      if (typeof value === 'string' && xssPattern.test(value)) {
        fastify.log.warn(`[SEC] Possible XSS attack detected in query parameter: ${key}=${value} on ${request.method} ${request.url}`)
        reply.code(400).send({ error: 'Bad Request: Suspicious query parameter' })
        return
      }
    }
  })

  // New addition: Log response payload size for all responses
  fastify.addHook('onSend', async (request, reply, payload) => {
    let size = 0
    if (payload) {
      if (typeof payload === 'string') {
        size = Buffer.byteLength(payload)
      } else if (Buffer.isBuffer(payload)) {
        size = payload.length
      } else if (typeof payload === 'object') {
        try {
          size = Buffer.byteLength(JSON.stringify(payload))
        } catch {
          size = 0
        }
      }
    }
    fastify.log.info(`[RES-SIZE] ${request.method} ${request.url} -> ${reply.statusCode} (${size} bytes)`)
    return payload
  })
})
```