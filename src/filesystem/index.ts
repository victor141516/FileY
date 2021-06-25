import { Directory, File, PrismaClient, User } from '@prisma/client'

export class FilesystemError extends Error {}
export class CannotFindUserError extends FilesystemError {}
export class DirectoryDoesntExistsError extends FilesystemError {}
export class DirectoryAlreadyExistsError extends FilesystemError {}
export class FileExistsWithSameNameError extends FilesystemError {}
export class FileAlreadyExistsError extends FilesystemError {}
export class DirectoryExistsWithSameNameError extends FilesystemError {}
export class CannotFindFileOrDirectoryError extends FilesystemError {}
export class ForbiddenNameError extends FilesystemError {}

const DOT_DOT = '..'

interface DbTypeExtension {
  isFile: boolean
  isDirectory: boolean
}

export type ExtendedBdObject = (Directory | File) & DbTypeExtension

export class Filesystem {
  prisma: PrismaClient
  telegramUserId: string
  user?: User
  currentPath: Directory[] = []
  ready: Promise<void>

  constructor(prisma: PrismaClient, telegramUserId: string) {
    this.prisma = prisma
    this.telegramUserId = telegramUserId
    this.ready = this.init()
  }

  private getUserAttr(): { userId: string } {
    return { userId: this.user!.id }
  }

  private getUserAndDirAttrs(): { userId: string; directoryId: string } {
    return {
      ...this.getUserAttr(),
      directoryId: this.currentPath[this.currentPath.length - 1].id
    }
  }

  private async init(): Promise<void> {
    let user = await this.prisma.user.findFirst({ where: { telegramId: this.telegramUserId } })
    if (!user) {
      user = await this.prisma.user.create({ data: { telegramId: this.telegramUserId } })
    }
    this.user = user

    let dir = await this.prisma.directory.findFirst({
      where: {
        name: '',
        directoryId: null,
        ...this.getUserAttr()
      }
    })
    if (!dir) {
      dir = await this.prisma.directory.create({
        data: {
          name: '',
          directoryId: null,
          ...this.getUserAttr()
        }
      })
    }

    this.currentPath.push(dir)
  }

  async getFile(id: string): Promise<File | null> {
    return await this.prisma.file.findFirst({
      where: {
        id,
        ...this.getUserAttr()
      }
    })
  }

  async getDirectory(id: string): Promise<Directory | null> {
    return await this.prisma.directory.findFirst({
      where: {
        id,
        ...this.getUserAttr()
      }
    })
  }

  pwd(): string {
    return this.currentPath.reduce((acc, d) => `${acc}${d.name}/`, '')
  }

  async cd(name: string): Promise<void> {
    if (name === DOT_DOT) return this.cdDotDot()

    const dir = await this.prisma.directory.findFirst({
      where: {
        name,
        ...this.getUserAndDirAttrs()
      }
    })
    if (!dir) throw new DirectoryDoesntExistsError(name)
    this.currentPath.push(dir)
  }

  async cdUsingId(id: string): Promise<void> {
    const dir = (await this.getDirectory(id))!
    let newDir = dir
    let newCurrentPath = [dir]
    while (newDir.directoryId !== null) {
      newDir = (await this.getDirectory(newDir.directoryId))!
      newCurrentPath = [newDir, ...newCurrentPath]
    }
    this.currentPath = newCurrentPath
  }

  async mkdir(name: string): Promise<void> {
    if (name === DOT_DOT) throw new ForbiddenNameError(name)

    const dir = await this.prisma.directory.findFirst({
      where: {
        name,
        ...this.getUserAndDirAttrs()
      }
    })

    const file = await this.prisma.file.findFirst({
      where: {
        name,
        ...this.getUserAndDirAttrs()
      }
    })
    if (dir) throw new DirectoryAlreadyExistsError(name)
    if (file) throw new FileExistsWithSameNameError(name)
    await this.prisma.directory.create({
      data: {
        name,
        ...this.getUserAndDirAttrs()
      }
    })
  }

  async touch(name: string, telegramFileId: string, metadata?: unknown): Promise<void> {
    if (name === DOT_DOT) throw new ForbiddenNameError(name)

    const dir = await this.prisma.directory.findFirst({
      where: {
        name,
        ...this.getUserAndDirAttrs()
      }
    })

    const file = await this.prisma.file.findFirst({
      where: {
        name,
        ...this.getUserAndDirAttrs()
      }
    })
    if (dir) throw new FileAlreadyExistsError(name)
    if (file) throw new DirectoryExistsWithSameNameError(name)

    await this.prisma.file.create({
      data: {
        name,
        telegramFileId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata: metadata as any,
        ...this.getUserAndDirAttrs()
      }
    })
  }

  async rm(name: string): Promise<void> {
    const file = await this.prisma.file.findFirst({
      where: {
        name,
        ...this.getUserAndDirAttrs()
      }
    })
    let dir
    if (!file) {
      dir = await this.prisma.directory.findFirst({
        where: {
          name,
          ...this.getUserAndDirAttrs()
        }
      })
    }

    if (!file && !dir) throw new CannotFindFileOrDirectoryError(name)

    if (file) await this.prisma.file.delete({ where: { id: file.id } })
    if (dir) await this.prisma.$queryRaw(`DELETE FROM public."Directory" WHERE public."Directory".id = '${dir.id}';`)
  }

  cdDotDot(): void {
    if (this.currentPath.length === 1) return
    this.currentPath = this.currentPath.slice(0, -1)
  }

  async ls(): Promise<Array<ExtendedBdObject>> {
    return [
      ...(await this.prisma.directory.findMany({ where: this.getUserAndDirAttrs() })).map((e) => ({ isFile: false, isDirectory: true, ...e })),
      ...(await this.prisma.file.findMany({ where: this.getUserAndDirAttrs() })).map((e) => ({ isFile: true, isDirectory: false, ...e }))
    ]
  }
}
