/**
 * Real Redis Client for Phase 3C.5 Integration Testing
 * Communicates directly with Redis server over TCP via RESP protocol.
 */
import net from 'net'

export class RealRedisTestClient {
  private socket: net.Socket | null = null
  private host: string
  private port: number
  private buffer = Buffer.alloc(0)
  private responseQueue: { resolve: (val: any) => void; reject: (err: any) => void }[] = []

  constructor(host = '127.0.0.1', port = 6379) {
    this.host = host
    this.port = port
  }

  async connect(): Promise<void> {
    if (this.socket) return

    return new Promise((resolve, reject) => {
      const socket = new net.Socket()
      this.socket = socket

      socket.connect(this.port, this.host, () => {
        resolve()
      })

      socket.on('data', (chunk) => {
        this.buffer = Buffer.concat([this.buffer, chunk])
        this.processBuffer()
      })

      socket.on('error', (err) => {
        while (this.responseQueue.length > 0) {
          const item = this.responseQueue.shift()
          item?.reject(err)
        }
      })

      socket.on('close', () => {
        this.socket = null
      })
    })
  }

  async close(): Promise<void> {
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }
  }

  private encodeCommand(args: (string | number)[]): Buffer {
    let resp = `*${args.length}\r\n`
    for (const arg of args) {
      const str = String(arg)
      const len = Buffer.byteLength(str)
      resp += `$${len}\r\n${str}\r\n`
    }
    return Buffer.from(resp, 'utf-8')
  }

  private processBuffer() {
    while (this.buffer.length > 0 && this.responseQueue.length > 0) {
      const parsed = this.parseRESP(this.buffer, 0)
      if (parsed === null) {
        // Need more data
        break
      }
      this.buffer = this.buffer.slice(parsed.offset)
      const queueItem = this.responseQueue.shift()
      if (queueItem) {
        if (parsed.error) {
          queueItem.reject(parsed.error)
        } else {
          queueItem.resolve(parsed.value)
        }
      }
    }
  }

  private parseRESP(buf: Buffer, start: number): { value?: any; error?: Error; offset: number } | null {
    if (buf.length <= start) return null
    const type = String.fromCharCode(buf[start])
    const crlf = buf.indexOf('\r\n', start)
    if (crlf === -1) return null

    const line = buf.toString('utf-8', start + 1, crlf)

    if (type === '+') {
      // Simple String
      return { value: line, offset: crlf + 2 }
    } else if (type === '-') {
      // Error
      return { error: new Error(line), offset: crlf + 2 }
    } else if (type === ':') {
      // Integer
      return { value: Number(line), offset: crlf + 2 }
    } else if (type === '$') {
      // Bulk String
      const length = Number(line)
      if (length === -1) {
        return { value: null, offset: crlf + 2 }
      }
      const dataStart = crlf + 2
      const dataEnd = dataStart + length
      if (buf.length < dataEnd + 2) return null
      const value = buf.toString('utf-8', dataStart, dataEnd)
      return { value, offset: dataEnd + 2 }
    } else if (type === '*') {
      // Array
      const count = Number(line)
      if (count === -1) return { value: null, offset: crlf + 2 }
      let curOffset = crlf + 2
      const arr: any[] = []
      for (let i = 0; i < count; i++) {
        const item = this.parseRESP(buf, curOffset)
        if (item === null) return null
        if (item.error) return { error: item.error, offset: item.offset }
        arr.push(item.value)
        curOffset = item.offset
      }
      return { value: arr, offset: curOffset }
    }

    throw new Error(`Unknown RESP type: ${type}`)
  }

  async sendCommand(...args: (string | number)[]): Promise<any> {
    await this.connect()
    return new Promise((resolve, reject) => {
      this.responseQueue.push({ resolve, reject })
      this.socket!.write(this.encodeCommand(args))
    })
  }

  async set(key: string, value: any, options?: { nx?: boolean; px?: number; ex?: number }): Promise<any> {
    const args: (string | number)[] = ['SET', key, String(value)]
    if (options?.nx) args.push('NX')
    if (options?.px) {
      args.push('PX', options.px)
    } else if (options?.ex) {
      args.push('EX', options.ex)
    }
    return this.sendCommand(...args)
  }

  async get(key: string): Promise<string | null> {
    return this.sendCommand('GET', key)
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0
    return this.sendCommand('DEL', ...keys)
  }

  async eval(script: string, keys: string[], args: (string | number)[] = []): Promise<any> {
    // Strip Upstash-specific shebang headers (e.g. #!lua flags=allow-key-locking) which are rejected by standard Redis engine
    const cleanedScript = script.replace(/^#!lua[^\n]*\r?\n/, '')
    return this.sendCommand('EVAL', cleanedScript, keys.length, ...keys, ...args)
  }

  async evalsha(_sha: string, _keys: string[], _args: (string | number)[] = []): Promise<any> {
    throw new Error('NOSCRIPT')
  }

  async flushdb(): Promise<string> {
    return this.sendCommand('FLUSHDB')
  }
}
