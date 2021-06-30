import { PrismaClient, User } from '@prisma/client'

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
  private user?: User
  private cachedSettings: Settings | undefined

  constructor(prisma: PrismaClient, telegramUserId: string) {
    this.prisma = prisma
    this.telegramUserId = telegramUserId
    this.ready = this.init()
  }

  async init(): Promise<void> {
    console.log(`New user connected: [TG=${this.telegramUserId}]`)
    let user = await this.prisma.user.findFirst({ where: { telegramId: this.telegramUserId } })
    if (!user) {
      user = await this.prisma.user.create({ data: { telegramId: this.telegramUserId } })
    }
    this.user = user
  }

  async get(): Promise<Settings> {
    await this.ready
    if (!this.cachedSettings) {
      this.cachedSettings = { ...DEFAULT_SETTINGS, ...((await this.prisma.user.findFirst({ where: { id: this.user!.id } }))!.settings as unknown as Settings) }
    }
    return this.cachedSettings
  }

  async set(key: keyof Settings, value: unknown): Promise<void> {
    await this.ready
    await this.prisma.user.update({
      where: {
        id: this.user!.id
      },
      data: {
        settings: {
          ...DEFAULT_SETTINGS,
          ...(await this.get()),
          ...{ [key]: value }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any
      }
    })
    this.cachedSettings = undefined
  }
}
