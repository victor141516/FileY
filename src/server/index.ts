import * as http from 'http'

import express from 'express'
import { Telegraf } from 'telegraf'

export class Server {
  private expressApp?: express.Express
  private expressServer?: http.Server
  private tgBot: Telegraf
  private webhookHost: string
  private webhookPath: string

  constructor(tgBot: Telegraf, webhookHost: string, webhookPath: string) {
    this.tgBot = tgBot
    this.webhookHost = webhookHost
    this.webhookPath = webhookPath
  }

  getWebhook(): ReturnType<typeof Telegraf.prototype.webhookCallback> {
    return this.tgBot.webhookCallback(this.webhookPath)
  }

  setWebhook(): ReturnType<typeof Telegraf.prototype.telegram.setWebhook> {
    return this.tgBot.telegram.setWebhook(`${this.webhookHost}${this.webhookPath}`)
  }

  serve(port: string | number): http.Server {
    if (this.expressServer) return this.expressServer

    if (!this.expressApp) {
      this.expressApp = express()
    }

    this.expressApp.use(this.getWebhook())

    return this.expressApp.listen(port.toString(), () => {
      console.log(`Webhook listening on port ${port}!`)
    })
  }

  closeServer(): Promise<void> {
    return new Promise((res, rej) => {
      if (!this.expressServer) res()
      else {
        this.expressServer?.close((err) => {
          if (err) {
            console.error(err)
            rej()
          } else res()
        })
      }
    })
  }
}
