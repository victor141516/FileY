import { PrismaClient } from '@prisma/client'

interface Settings {
  showListOptions: boolean
}

const DEFAULT_SETTINGS = {
  showListOptions: true
} as Settings

export class UserSettings {
  prisma: PrismaClient
  telegramUserId: string
  ready: Promise<void>
  private userId: string | undefined
  private cachedSettings: Settings | undefined

  constructor(prisma: PrismaClient, telegramUserId: string) {
    this.prisma = prisma
    this.telegramUserId = telegramUserId
    this.ready = this.init()
  }

  async init(): Promise<void> {
    this.userId = (await this.prisma.user.findFirst({ where: { telegramId: this.telegramUserId } }))!.id
  }

  async get(): Promise<Settings> {
    await this.ready
    if (!this.cachedSettings) {
      this.cachedSettings = { ...DEFAULT_SETTINGS, ...((await this.prisma.user.findFirst({ where: { id: this.userId! } }))!.settings as unknown as Settings) }
    }
    return this.cachedSettings
  }

  async set(key: keyof Settings, value: unknown): Promise<void> {
    await this.ready
    await this.prisma.user.update({
      where: {
        id: this.userId!
      },
      data: {
        settings: {
          ...DEFAULT_SETTINGS,
          ...(await this.get()),
          ...{ [key]: value }
        }
      }
    })
    this.cachedSettings = undefined
  }
}
