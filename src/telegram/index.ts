import { File } from '@prisma/client'
import { Context, Markup, Telegraf } from 'telegraf'
import { CallbackQuery, Message } from 'telegraf/typings/core/types/typegram'

import { ExtendedBdObject, Filesystem } from '../filesystem'
import { getIcon } from './icons'

enum BUTTON_ACTION {
  rm = 'r',
  cd = 'c',
  cat = 'm',
  confirmDelete = 'yd',
  refuteDelete = 'nd'
}

class ButtonAction {
  obj: ExtendedBdObject
  action: BUTTON_ACTION

  constructor(obj: ExtendedBdObject, action: BUTTON_ACTION) {
    this.obj = obj
    this.action = action
  }

  serialize(): string {
    return `${this.action}#${this.obj.isDirectory ? 'd' : 'f'}#${this.obj.id}`
  }

  static async parse(serialized: string, fs: Filesystem): Promise<ButtonAction> {
    const [action, objType, objId] = serialized.split('#')

    let obj: ExtendedBdObject
    if (objType === 'd') obj = { isFile: false, isDirectory: true, ...(await fs.getDirectory(objId))! }
    else if (objType === 'f') obj = { isFile: true, isDirectory: false, ...(await fs.getFile(objId))! }

    return new ButtonAction(obj!, action as BUTTON_ACTION)
  }
}

export class TelegramManager {
  tgBot: Telegraf
  fsFactory: (tgUserId: string) => Filesystem
  filesystems: Record<string, Filesystem> = {}

  constructor(tgBot: Telegraf, fsFactory: (tgUserId: string) => Filesystem) {
    this.tgBot = tgBot
    this.fsFactory = fsFactory
  }

  async getFs(ctx: Context): Promise<Filesystem> {
    const tgUserId = ctx.chat!.id.toString()
    if (!this.filesystems[tgUserId]) {
      this.filesystems[tgUserId] = await this.fsFactory(tgUserId.toString())
      await this.filesystems[tgUserId].ready
    }
    return this.filesystems[tgUserId]
  }

  setup(): void {
    this.tgBot.start((ctx) => ctx.reply('Welcome to FileY (formerly FileX)'))
    this.tgBot.command('/ls', (ctx) => this.handleLs(ctx))
    this.tgBot.command('/mkdir', (ctx) => this.handleMkdir(ctx))

    this.tgBot.on('message', (ctx) => this.handleIncomingMessage(ctx))

    this.tgBot.on('callback_query', async (ctx) => {
      const button = await ButtonAction.parse((ctx.callbackQuery as CallbackQuery.DataCallbackQuery).data, await this.getFs(ctx))
      if (button.action === BUTTON_ACTION.cd) {
        return await this.handleCd(ctx, button)
      } else if (button.action === BUTTON_ACTION.cat) {
        return await this.handleCat(ctx, button)
      } else if (button.action === BUTTON_ACTION.rm) {
        return await this.handleRm(ctx, button)
      } else if (button.action === BUTTON_ACTION.confirmDelete) {
        return await this.handleConfirmDelete(ctx, button, true)
      } else if (button.action === BUTTON_ACTION.refuteDelete) {
        return await this.handleConfirmDelete(ctx, button, false)
      }
    })
  }

  private async handleIncomingMessage(ctx: Context): Promise<void> {
    const attachTypes = ['document', 'audio', 'document', 'photo', 'video', 'video_note', 'voice', 'contact'] as const
    const fs = await this.getFs(ctx)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const untypedMsg = ctx.message as Record<string, any>

    // eslint-disable-next-line camelcase
    let fileName = attachTypes.reduce((acc: { file_name: string } | undefined, e) => {
      if (acc !== undefined) return acc
      else return untypedMsg[e]
    }, undefined)?.file_name as string | undefined

    fileName = fileName ?? untypedMsg?.text ?? ctx.message!.message_id.toString()

    await fs.touch(fileName!, ctx.message!.message_id.toString(), ctx.message)
    await this.handleLs(ctx)
  }

  private async handleMkdir(ctx: Context): Promise<void> {
    const fs = await this.getFs(ctx)
    await fs.mkdir((ctx.message as Message.TextMessage).text.replace('/mkdir ', ''))
    await this.handleLs(ctx)
  }

  private async handleCd(ctx: Context, button: ButtonAction): Promise<void> {
    const fs = await this.getFs(ctx)
    await fs.cdUsingId(button.obj.id)
    return await this.handleLs(ctx)
  }

  private async handleCat(ctx: Context, button: ButtonAction): Promise<void> {
    await this.tgBot.telegram.forwardMessage(ctx.chat!.id, ctx.chat!.id, Number.parseInt((button.obj as File).telegramFileId!))
    return await this.handleLs(ctx)
  }

  private async handleRm(ctx: Context, button: ButtonAction): Promise<void> {
    const name = button.obj.name
    return ctx
      .reply(`Confirm delete "${name}"?`, {
        // eslint-disable-next-line camelcase
        reply_markup: Markup.inlineKeyboard([
          [
            // eslint-disable-next-line camelcase
            { text: '✔️ Yes', callback_data: new ButtonAction(button.obj, BUTTON_ACTION.confirmDelete).serialize() },
            // eslint-disable-next-line camelcase
            { text: '❌ No', callback_data: new ButtonAction(button.obj, BUTTON_ACTION.refuteDelete).serialize() }
          ]
        ]).reply_markup
      })
      .then()
  }

  private async handleConfirmDelete(ctx: Context, button: ButtonAction, confirm: boolean): Promise<void> {
    const fs = await this.getFs(ctx)
    if (confirm) {
      const name = button.obj.name
      await fs.rm(name)
      await ctx.reply(`"${name}" deleted!`)
      return await this.handleLs(ctx)
    } else {
      await ctx.reply('OK!')
      return await this.handleLs(ctx)
    }
  }

  private async handleLs(ctx: Context): Promise<void> {
    const fs = await this.getFs(ctx)
    const lsRes = await fs.ls()
    const parentDirectory = {
      isDirectory: true,
      isFile: false,
      ...(fs.currentPath.slice(-2, -1)?.[0] ?? fs.currentPath[fs.currentPath.length - 1])
    }
    const buttons = [
      [
        {
          text: '⤴ Parent directory',
          // eslint-disable-next-line camelcase
          callback_data: new ButtonAction(parentDirectory, BUTTON_ACTION.cd).serialize()
        }
      ]
    ]
    buttons.push(
      ...lsRes.map((e) => {
        return [
          {
            text: `${getIcon(e)} ${e.name}`,
            // eslint-disable-next-line camelcase
            callback_data: new ButtonAction(e, e.isDirectory ? BUTTON_ACTION.cd : BUTTON_ACTION.cat).serialize()
          },
          {
            text: '❌',
            // eslint-disable-next-line camelcase
            callback_data: new ButtonAction(e, BUTTON_ACTION.rm).serialize()
          }
        ]
      })
    )
    buttons.push()
    const markup = Markup.inlineKeyboard(buttons).reply_markup
    // eslint-disable-next-line camelcase
    ctx.reply(`Path: \`${fs.pwd()}\``, { reply_markup: markup, parse_mode: 'MarkdownV2' })
  }

  async poll(): Promise<void> {
    await this.tgBot.launch()
    console.info('Polling started')
  }
}
