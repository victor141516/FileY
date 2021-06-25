import { File } from '@prisma/client'
import { ExtendedBdObject } from '../filesystem'

const TYPE_TO_ICON = {
  A: '🎵',
  D: '📄',
  P: '🏞',
  U: '❔',
  V: '📹'
} as const

const MIME_TO_ICON = {
  'application/epub+zip': TYPE_TO_ICON.D,
  'application/java-archive': TYPE_TO_ICON.D,
  'application/javascript': TYPE_TO_ICON.D,
  'application/json': TYPE_TO_ICON.D,
  'application/msword': TYPE_TO_ICON.D,
  'application/octet-stream': TYPE_TO_ICON.D,
  'application/ogg': TYPE_TO_ICON.A,
  'application/pdf': TYPE_TO_ICON.D,
  'application/rtf': TYPE_TO_ICON.D,
  'application/sql': TYPE_TO_ICON.D,
  'application/vnd.amazon.ebook': TYPE_TO_ICON.D,
  'application/vnd.apple.installer+xml': TYPE_TO_ICON.D,
  'application/vnd.mozilla.xul+xml': TYPE_TO_ICON.D,
  'application/vnd.ms-excel': TYPE_TO_ICON.D,
  'application/vnd.ms-powerpoint': TYPE_TO_ICON.D,
  'application/vnd.oasis.opendocument.presentation': TYPE_TO_ICON.D,
  'application/vnd.oasis.opendocument.spreadsheet': TYPE_TO_ICON.D,
  'application/vnd.oasis.opendocument.text': TYPE_TO_ICON.D,
  'application/vnd.visio': TYPE_TO_ICON.D,
  'application/x-abiword': TYPE_TO_ICON.D,
  'application/x-bzip': TYPE_TO_ICON.D,
  'application/x-bzip2': TYPE_TO_ICON.D,
  'application/x-csh': TYPE_TO_ICON.D,
  'application/x-rar-compressed': TYPE_TO_ICON.D,
  'application/x-sh': TYPE_TO_ICON.D,
  'application/x-shockwave-flash': TYPE_TO_ICON.D,
  'application/x-tar': TYPE_TO_ICON.D,
  'application/xhtml+xml': TYPE_TO_ICON.D,
  'application/xml': TYPE_TO_ICON.D,
  'application/zip': TYPE_TO_ICON.D,
  'audio/aac': TYPE_TO_ICON.A,
  'audio/midi': TYPE_TO_ICON.A,
  'audio/ogg': TYPE_TO_ICON.A,
  'audio/webm': TYPE_TO_ICON.A,
  'audio/x-wav': TYPE_TO_ICON.A,
  'font/ttf': TYPE_TO_ICON.D,
  'font/woff': TYPE_TO_ICON.D,
  'font/woff2': TYPE_TO_ICON.D,
  'image/gif': TYPE_TO_ICON.P,
  'image/jpeg': TYPE_TO_ICON.P,
  'image/png': TYPE_TO_ICON.P,
  'image/svg+xml': TYPE_TO_ICON.P,
  'image/tiff': TYPE_TO_ICON.P,
  'image/webp': TYPE_TO_ICON.P,
  'image/x-icon': TYPE_TO_ICON.P,
  'text/calendar': TYPE_TO_ICON.D,
  'text/css': TYPE_TO_ICON.D,
  'text/csv': TYPE_TO_ICON.D,
  'text/html': TYPE_TO_ICON.D,
  'video/3gpp': TYPE_TO_ICON.V,
  'video/3gpp2': TYPE_TO_ICON.V,
  'video/mpeg': TYPE_TO_ICON.V,
  'video/ogg': TYPE_TO_ICON.V,
  'video/webm': TYPE_TO_ICON.V,
  'video/x-msvideo': TYPE_TO_ICON.V
} as Record<string, string>

function flatten(obj = {}): Record<string, unknown> {
  const doneObject = {} as Record<string, unknown>
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v == 'object' && !(v instanceof Date) && !Array.isArray(v) && !(v instanceof RegExp)) {
      Object.assign(doneObject, flatten(v ?? {}))
    } else {
      doneObject[k] = v
    }
  }
  return doneObject
}

export function getIcon(f: ExtendedBdObject): string {
  let icon = TYPE_TO_ICON.D as string
  if (f.isDirectory) {
    icon = '📂'
  } else if (f.isFile) {
    const mime = flatten((f as File)?.metadata as Record<string, unknown>)?.mime_type as string
    if (mime && MIME_TO_ICON[mime]) {
      icon = MIME_TO_ICON[mime]
    }
  }
  return icon
}
