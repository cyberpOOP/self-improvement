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