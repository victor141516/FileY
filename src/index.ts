import { PrismaClient } from '@prisma/client'
import { Telegraf } from 'telegraf'
import { CONFIG } from './config'

import { Filesystem } from './filesystem'
import { Server } from './server'
import { UserSettings } from './settings'
import { TelegramManager } from './telegram'

const prisma = new PrismaClient()

const tgBot = new Telegraf(CONFIG.TG_BOT_TOKEN)
const tgManager = new TelegramManager(
  tgBot,
  (tgUserId: string) => new Filesystem(prisma, tgUserId),
  (tgUserId: string) => new UserSettings(prisma, tgUserId)
)
const server = new Server(tgBot, CONFIG.WEBHOOK_HOST, CONFIG.WEBHOOK_PATH)

tgManager.setup()

if (CONFIG.HTTP_SERVE) {
  server.setWebhook().then(() => {
    server.serve(CONFIG.PORT)
  })
} else {
  tgManager.poll()
}

function exit() {
  console.info('Stopping services')
  server.closeServer()
  prisma.$disconnect()
  tgBot.stop('SIGINT')
  tgBot.stop('SIGTERM')
  console.info('Bye!')
}
process.once('SIGINT', () => exit())
process.once('SIGTERM', () => exit())
