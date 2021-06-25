export const CONFIG = {
  PORT: process.env.PORT ?? 3000,
  HTTP_SERVE: ['yes', 'true', '1'].includes(process.env.HTTP_SERVE?.toLowerCase() ?? ''),
  WEBHOOK_HOST: process.env.WEBHOOK_HOST!,
  WEBHOOK_PATH: process.env.WEBHOOK_PATH!,
  TG_BOT_TOKEN: process.env.TG_BOT_TOKEN!,
  DATABASE_URL: process.env.DATABASE_URL!
} as const

let error = false
if (CONFIG.HTTP_SERVE && (!CONFIG.WEBHOOK_HOST || !CONFIG.WEBHOOK_PATH)) {
  console.error("You're trying to use HTTP server but didn't set the WEBHOOK_HOST or WEBHOOK_PATH env var")
  error = true
}

if (!CONFIG.TG_BOT_TOKEN) {
  console.error('TG_BOT_TOKEN env var must be set')
  error = true
}

if (!CONFIG.DATABASE_URL) {
  console.error('DATABASE_URL env var must be set')
  error = true
}

if (error) {
  console.error('Config error(s) happened, this will probably explode with an exception just after this message')
}
