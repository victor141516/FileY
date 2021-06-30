import { File } from '@prisma/client'
import { Context, Markup, Telegraf } from 'telegraf'
import { CallbackQuery, Message } from 'telegraf/typings/core/types/typegram'

import { DirectoryExistsWithSameNameError, ExtendedBdObject, FileExistsWithSameNameError, Filesystem, ForbiddenNameError } from '../filesystem'
import { UserSettings } from '../settings'
import { getIcon } from './icons'

enum BUTTON_ACTION {
  rm = 'r',
  cd = 'c',
  cat = 'm',
  confirmDelete = 'yd',
  refuteDelete = 'nd',
  nextPage = 'np',
  prevPage = 'pp',
  rename = 'ren'
}

class ButtonAction {
  obj: ExtendedBdObject
  action: BUTTON_ACTION
  extra?: string

  constructor(obj: ExtendedBdObject, action: BUTTON_ACTION, extra?: string) {
    this.obj = obj
    this.action = action
    if (extra) {
      this.extra = extra
    }
  }

  serialize(): string {
    return `${this.action}#${this.obj.isDirectory ? 'd' : 'f'}#${this.obj.id}${this.extra ? '#' + this.extra : ''}`
  }

  static async parse(serialized: string, fs: Filesystem): Promise<ButtonAction> {
    const [action, objType, objId, extra] = serialized.split('#')

    let obj: ExtendedBdObject
    if (objType === 'd') obj = { isFile: false, isDirectory: true, ...(await fs.getDirectory(objId))! }
    else if (objType === 'f') obj = { isFile: true, isDirectory: false, ...(await fs.getFile(objId))! }

    return new ButtonAction(obj!, action as BUTTON_ACTION, extra)
  }
}

enum SpecialModes {
  rename
}

interface SpecialModeRenameData {
  objectId: string
  isFile: boolean
  isDirectory: boolean
}

type SpecialModeData = {
  mode: SpecialModes
  data: unknown
}

export class TelegramManager {
  tgBot: Telegraf
  fsFactory: (tgUserId: string) => Filesystem
  settingsFactory: (tgUserId: string) => UserSettings
  filesystems: Record<string, Filesystem> = {}
  userSettings: Record<string, UserSettings> = {}
  private specialModes = {} as Record<string, SpecialModeData>

  constructor(tgBot: Telegraf, fsFactory: (tgUserId: string) => Filesystem, settingsFactory: (tgUserId: string) => UserSettings) {
    this.tgBot = tgBot
    this.fsFactory = fsFactory
    this.settingsFactory = settingsFactory
  }

  async getFs(ctx: Context): Promise<Filesystem> {
    const tgUserId = ctx.chat!.id.toString()
    if (!this.filesystems[tgUserId]) {
      this.filesystems[tgUserId] = await this.fsFactory(tgUserId.toString())
      await this.filesystems[tgUserId].ready
    }
    return this.filesystems[tgUserId]
  }

  async getSettings(ctx: Context): Promise<UserSettings> {
    const tgUserId = ctx.chat!.id.toString()
    if (!this.userSettings[tgUserId]) {
      this.userSettings[tgUserId] = await this.settingsFactory(tgUserId.toString())
      await this.userSettings[tgUserId].ready
    }
    return this.userSettings[tgUserId]
  }

  setup(): void {
    this.tgBot.start((ctx) => ctx.reply('Welcome to FileY (formerly FileX)'))
    this.tgBot.command('/ls', (ctx) => this.handleLs(ctx))
    this.tgBot.command('/mkdir', (ctx) => this.handleMkdir(ctx))
    this.tgBot.command('/toggle_list_options', (ctx) => this.hnaldeToggleListOptions(ctx))

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
      } else if (button.action === BUTTON_ACTION.nextPage) {
        return await this.changePage(ctx, Number.parseInt(button.extra!))
      } else if (button.action === BUTTON_ACTION.prevPage) {
        return await this.changePage(ctx, Number.parseInt(button.extra!))
      } else if (button.action === BUTTON_ACTION.rename) {
        return await this.handleRenameInit(ctx, button)
      }
    })
  }

  private async handleIncomingMessage(ctx: Context): Promise<void> {
    const attachTypes = ['document', 'audio', 'document', 'photo', 'video', 'video_note', 'voice', 'contact'] as const
    const fs = await this.getFs(ctx)

    if (this.specialModes[ctx.chat!.id]) {
      if (this.specialModes[ctx.chat!.id].mode === SpecialModes.rename) {
        return await this.handleRenameAction(ctx)
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const untypedMsg = ctx.message as Record<string, any>

    // eslint-disable-next-line camelcase
    let fileName = attachTypes.reduce((acc: { file_name: string } | undefined, e) => {
      if (acc !== undefined) return acc
      else return untypedMsg[e]
    }, undefined)?.file_name as string | undefined

    fileName = fileName ?? untypedMsg?.text ?? ctx.message!.message_id.toString()

    await fs.touch(fileName!, ctx.message!.message_id.toString(), ctx.message).catch((e) => {
      if (e instanceof DirectoryExistsWithSameNameError) {
        return ctx.reply(`There is already a directory with the same name: ${fileName}`)
      } else if (e instanceof FileExistsWithSameNameError) {
        return ctx.reply(`There is already a file with the same name: ${fileName}`)
      } else if (e instanceof ForbiddenNameError) {
        return ctx.reply(`That name is forbidden: ${fileName}`)
      } else throw e
    })
    await this.handleLs(ctx)
  }

  private async handleRenameInit(ctx: Context, button: ButtonAction): Promise<void> {
    this.specialModes[ctx.chat!.id.toString()] = {
      mode: SpecialModes.rename,
      data: { objectId: button.obj.id, isFile: button.obj.isFile, isDirectory: button.obj.isDirectory } as SpecialModeRenameData
    }
    await ctx.reply('Write the new name and send the message')
  }

  private async handleRenameAction(ctx: Context): Promise<void> {
    const newName = (ctx.message as Message.TextMessage).text
    const fs = await this.getFs(ctx)
    const specialModeData = this.specialModes[ctx.chat!.id].data as SpecialModeRenameData
    let renameOperation: Promise<void>
    if (specialModeData.isFile) {
      const fileToRename = { isFile: true, isDirectory: false, ...(await fs.getFile(specialModeData.objectId))! }
      renameOperation = fs.rename(fileToRename, newName)
    } else {
      const directoryToRename = { isFile: false, isDirectory: true, ...(await fs.getDirectory(specialModeData.objectId))! }
      renameOperation = fs.rename(directoryToRename, newName)
    }
    await renameOperation.catch((e) => {
      if (e instanceof FileExistsWithSameNameError) {
        return ctx.reply(`There is already a file with the same name: ${newName}`)
      } else if (e instanceof DirectoryExistsWithSameNameError) {
        return ctx.reply(`There is already a directory with the same name: ${newName}`)
      } else throw e
    })
    delete this.specialModes[ctx.chat!.id]
    return await this.handleLs(ctx)
  }

  private async changePage(ctx: Context, page: number): Promise<void> {
    await this.handleLs(ctx, page)
  }

  private async hnaldeToggleListOptions(ctx: Context): Promise<void> {
    const settings = await this.getSettings(ctx)
    await settings.set('showListOptions', !(await settings.get()).showListOptions)
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

  private async handleLs(ctx: Context, page = 0): Promise<void> {
    const PAGE_SIZE = 10 as const
    const settings = await (await this.getSettings(ctx)).get()
    const fs = await this.getFs(ctx)
    const lsRes = await fs.ls()
    const pageContent = lsRes.slice(PAGE_SIZE * page, PAGE_SIZE * (page + 1))
    const currentDirectory = {
      isDirectory: true,
      isFile: false,
      ...fs.currentPath[fs.currentPath.length - 1]
    }
    const parentDirectory = {
      isDirectory: true,
      isFile: false,
      ...(fs.currentPath.slice(-2, -1)?.[0] ?? currentDirectory)
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
      ...pageContent.map((e) => {
        const row = [
          {
            text: `${getIcon(e)} ${e.name}`,
            // eslint-disable-next-line camelcase
            callback_data: new ButtonAction(e, e.isDirectory ? BUTTON_ACTION.cd : BUTTON_ACTION.cat).serialize()
          }
        ]
        if (settings.showListOptions) {
          row.push(
            ...[
              {
                text: '✏',
                // eslint-disable-next-line camelcase
                callback_data: new ButtonAction(e, BUTTON_ACTION.rename).serialize()
              },
              {
                text: '❌',
                // eslint-disable-next-line camelcase
                callback_data: new ButtonAction(e, BUTTON_ACTION.rm).serialize()
              }
            ]
          )
        }
        return row
      })
    )
    if (lsRes.length > pageContent.length) {
      buttons.push([])
      if (page > 0) {
        // if not first page, show previous
        buttons[buttons.length - 1].push({
          text: '⬅ Previous',
          // eslint-disable-next-line camelcase
          callback_data: new ButtonAction(currentDirectory, BUTTON_ACTION.prevPage, (page - 1).toString()).serialize()
        })
      }

      if (pageContent[pageContent.length - 1] !== lsRes[lsRes.length - 1]) {
        // if the last item of all the items is not shown in the current page, show next
        buttons[buttons.length - 1].push({
          text: '➡ Next',
          // eslint-disable-next-line camelcase
          callback_data: new ButtonAction(currentDirectory, BUTTON_ACTION.nextPage, (page + 1).toString()).serialize()
        })
      }
    }
    const markup = Markup.inlineKeyboard(buttons).reply_markup
    // eslint-disable-next-line camelcase
    ctx.reply(`Path: \`${fs.pwd()}\``, { reply_markup: markup, parse_mode: 'MarkdownV2' })
  }

  async poll(): Promise<void> {
    await this.tgBot.launch()
    console.info('Polling started')
  }
}
