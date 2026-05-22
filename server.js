```js
import Fastify from 'fastify'
import cors from '@fastify/cors'
import dotenv from 'dotenv'
import customLogger from './plugins/logger.js'
import proxy from './utils/proxy.js'
import helmet from '@fastify/helmet'

dotenv.config({ path: './.env' })

const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss Z',
        ignore: 'pid,hostname,reqId,req,res,err,responseTime'
      }
    }
  },
  disableRequestLogging: true
})

// Security headers
await fastify.register(helmet)

//CORS
const corsOrigins = process.env.CORS_ORIGIN
  ?.split(',')
  .map(o => o.trim())

await fastify.register(cors, {
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
})
//Logger
await fastify.register(customLogger)

// Register routers
fastify.register(proxy)

// Add a simple health check route with error handling
fastify.get('/health', async (request, reply) => {
  try {
    return { status: 'ok' }
  } catch (err) {
    fastify.log.error(err)
    reply.code(500).send({ error: 'Internal Server Error' })
  }
})

// Add centralized error handler for uncaught errors in routes
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error)
  reply.code(error.statusCode || 500).send({ error: error.message || 'Internal Server Error' })
})

// Add a not found handler for unmatched routes
fastify.setNotFoundHandler((request, reply) => {
  reply.code(404).send({ error: 'Not Found' })
})

// Add a global onSend hook to add security headers for all responses
fastify.addHook('onSend', async (request, reply, payload) => {
  reply.header('X-Content-Type-Options', 'nosniff')
  reply.header('X-Frame-Options', 'DENY')
  reply.header('Referrer-Policy', 'no-referrer')
  return payload
})

// Add global onRequest hook to reject requests with missing Authorization header on /api routes (additional security)
fastify.addHook('onRequest', async (request, reply) => {
  if (request.url.startsWith('/api') && !request.headers.authorization) {
    fastify.log.warn(`[AUTH] Missing Authorization header on ${request.method} ${request.url}`)
    reply.code(401).send({ error: 'Unauthorized' })
  }
})
// Add global onRequest hook to log request IP address for all requests (enhanced logging)
fastify.addHook('onRequest', async (request, reply) => {
  const ip = request.ip || request.raw.socket.remoteAddress
  fastify.log.info(`[IP] ${ip} - ${request.method} ${request.url}`)
})

// New addition: Add a global onResponse hook to log response time for all requests
fastify.addHook('onResponse', async (request, reply) => {
  const responseTime = reply.getResponseTime()
  fastify.log.info(`[RT] ${request.method} ${request.url} -> ${reply.statusCode} - ${responseTime.toFixed(2)} ms`)
})

// New addition: Add a global onRequest hook to limit request body size to 1MB for security
fastify.addHook('onRequest', async (request, reply) => {
  const contentLength = request.headers['content-length']
  if (contentLength && Number(contentLength) > 1_000_000) {
    fastify.log.warn(`[SEC] Request body too large: ${contentLength} bytes on ${request.method} ${request.url}`)
    reply.code(413).send({ error: 'Payload Too Large' })
  }
})

// New addition: Add a global onRequest hook to reject requests with invalid JSON body (syntax errors)
fastify.addHook('preParsing', async (request, reply, payload) => {
  if (request.headers['content-type']?.includes('application/json')) {
    try {
      await new Promise((resolve, reject) => {
        let data = ''
        payload.on('data', chunk => {
          data += chunk
        })
        payload.on('end', () => {
          try {
            JSON.parse(data)
            resolve()
          } catch (err) {
            reject(err)
          }
        })
        payload.on('error', err => {
          reject(err)
        })
      })
    } catch (err) {
      fastify.log.warn(`[SEC] Invalid JSON body on ${request.method} ${request.url}: ${err.message}`)
      reply.code(400).send({ error: 'Bad Request: Invalid JSON' })
    }
  }
})

// New addition: Add a global onRequest hook to reject requests with missing or empty Authorization header on /api routes (enhanced security)
fastify.addHook('onRequest', async (request, reply) => {
  if (request.url.startsWith('/api')) {
    const authHeader = request.headers.authorization
    if (!authHeader || authHeader.trim() === '') {
      fastify.log.warn(`[AUTH] Empty or missing Authorization header on ${request.method} ${request.url}`)
      reply.code(401).send({ error: 'Unauthorized' })
    }
  }
})

// New addition: Add a global onRequest hook to reject requests with HTTP methods other than GET, POST, PATCH, DELETE, OPTIONS (basic method filtering)
fastify.addHook('onRequest', async (request, reply) => {
  const allowedMethods = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
  if (!allowedMethods.includes(request.method)) {
    fastify.log.warn(`[SEC] Method Not Allowed: ${request.method} on ${request.url}`)
    reply.code(405).send({ error: 'Method Not Allowed' })
  }
})

// New addition: Add a global onRequest hook to reject requests with User-Agent header containing suspicious substrings (enhanced security)
fastify.addHook('onRequest', async (request, reply) => {
  const userAgent = request.headers['user-agent'] || ''
  if (/sqlmap|curl|nikto|fuzz/i.test(userAgent)) {
    fastify.log.warn(`[SEC] Suspicious User-Agent detected: ${userAgent} on ${request.method} ${request.url}`)
    reply.code(403).send({ error: 'Forbidden' })
  }
})

// New addition: Add a global onRequest hook to reject requests with User-Agent header missing (enhanced security)
fastify.addHook('onRequest', async (request, reply) => {
  const userAgent = request.headers['user-agent']
  if (!userAgent) {
    fastify.log.warn(`[SEC] Missing User-Agent header on ${request.method} ${request.url}`)
    reply.code(400).send({ error: 'Bad Request: Missing User-Agent header' })
  }
})

// New addition: Add a global onRequest hook to reject requests with suspicious Referer header (security improvement)
fastify.addHook('onRequest', async (request, reply) => {
  const referer = request.headers['referer'] || ''
  if (referer && /javascript:|data:/i.test(referer)) {
    fastify.log.warn(`[SEC] Suspicious Referer header detected: ${referer} on ${request.method} ${request.url}`)
    reply.code(403).send({ error: 'Forbidden' })
  }
})

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: process.env.GATEWAY_PORT, host: '0.0.0.0' })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
```