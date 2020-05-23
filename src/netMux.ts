import { connect, Socket, Server } from 'net'
import { TLSSocket } from 'tls'
import cheerio  from 'cheerio'
import tls from 'tls'
import fs from 'fs'
const { log, debug, error, plain } = require('./utils').init('MUX')

type Config = {
  Control_Port: number;
  Plain_Port: number;
  Tls_Port: number;
  Remote_Addr_IP: string;
  Intercepted_Apps: Array<string>
}

const options = {
  rejectUnauthorized: false,
}

const getTlsConn = (url: string): Promise<TLSSocket> => new Promise((resolve, reject) => {
  const tlsConn = tls.connect(443, url, options, () => {
    if (tlsConn.authorized) {
      debug('TLS:', "Connection authorized by a Certificate Authority.")
      resolve(tlsConn)
    } else {
      error('TLS:', "Connection not authorized: " + tlsConn.authorizationError)
      reject(tlsConn.authorizationError)
    }
    debug('TLS:', 'Handshake finished')
  })
  tlsConn.on('error', (err) => {
    error('Could not open OUT1 connection:', err)
    reject(err)
  })
})

const getConn = (url: string): Promise<Socket> => new Promise((resolve, reject) => {
  const conn = connect(8321, url, () => {
    debug('OUT2 Connection established')
    resolve(conn)
  })
  conn.on('error', (err) => {
    error('Could not open OUT2 connection:', err)
    reject(err)
  })
})

let GID: number = 0

export class SocketMux {

  static floatingThingy: string = `<div id="yamm-main-div" ondblclick="document.querySelector('#yamm-main-div').remove()">
<div id="yammFilterDiv"><p>Parsed by YAMM<br/>Page served from: localhost</p></div>
<style>#yammFilterDiv { position: absolute; top: 10px; left: 1px; width: 600px; padding: 10px; opacity: 0.3; color: #000000; cursor: move; z-index: 99999999; background-color: #AAAAAA; border: 1px solid #999999; font-size: 24px; font-style: italic; text-align: center; line-height: 1.3; }</style>
<script type="text/javascript">yamm_draggable(document.getElementById("yammFilterDiv"));
function yamm_draggable(elmnt) { var w = window.screen.width; elmnt.style.left = ((w - 600)-100)+'px'; var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0; elmnt.onmousedown = dragMouseDown;
  function dragMouseDown(e) { e = e || window.event; e.preventDefault(); pos3 = e.clientX; pos4 = e.clientY; document.onmouseup = closeDragElement; document.onmousemove = elementDrag; }
  function elementDrag(e) { e = e || window.event; e.preventDefault(); pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY; pos3 = e.clientX; pos4 = e.clientY; elmnt.style.top = (elmnt.offsetTop - pos2) + "px"; elmnt.style.left = (elmnt.offsetLeft - pos1) + "px"; }
  function closeDragElement() { document.onmouseup = null; document.onmousemove = null; } }</script></div>`

  static config: Config
  static matchStr: string  = ''
  static interceptedApps: string = ''


  #inSkt?: Socket | TLSSocket = null
  #outSkt1?: Socket | TLSSocket = null
  #outSkt2?: Socket | TLSSocket = null
  #out2Created: boolean = false

  ID: string = 'NO-ID'
  outUrl1: string
  outUrl2: string
  server?: Server = null

  constructor(conSkt: Socket, outUrl1: string, outUrl2: string) {
    this.#inSkt = conSkt
    this.outUrl1 = outUrl1
    this.outUrl2 = outUrl2
    this.ID = `MUX-${GID++}`
    const interceptedApps = SocketMux.config.Intercepted_Apps.reduce( (acc, app) => `${acc}|${app}`, '').substring(1)
    if (SocketMux.interceptedApps === '')
      SocketMux.interceptedApps = interceptedApps
    if (SocketMux.matchStr === '')
      SocketMux.matchStr = `(GET|POST|PUT|DELETE)(\\s+?\\/)(v4\\/|)(apps\\/Tradeshift\\.)(${interceptedApps})(.*?)( HTTP\\/\\d\\.\\d)`
    debug(`${this.ID} created -`, 'Intercepted Apps:', interceptedApps)
  }

  ////////////////////////////////////// PRIVATE METHODS /////////////////////////////////////
  
  _dumpData(data: string, sktNum: number, targetSktNum: number, after: boolean) {
    const fn = after ? error : plain
    if ( (sktNum === 0 && targetSktNum === 2) || (sktNum === 2 && targetSktNum === 0) ) {
      const prefix = sktNum > 0 ? '<<--<<--<<--<<--<<--<<--<<--<<--': '-->>-->>-->>-->>-->>-->>-->>-->>'
      fn(this.ID,
        `\n${prefix} ${sktNum > 0 ?'IN':'OUT'} DATA START (${this.ID} skt${sktNum} --> skt${targetSktNum})${prefix}\n`,
        data,
        `\n${prefix}  ${sktNum > 0 ?'IN':'OUT'} DATA END (${this.ID} skt${sktNum} --> skt${targetSktNum}) ${prefix}`
      )
    }
  }

  _filterData(data: Buffer, sktNum: number, targetSktNum): Buffer {
    let newData = data.toString()
    this._dumpData(newData, sktNum, targetSktNum, false)
    if (sktNum === 0) {
      if (/(.*)Accept-Encoding:.*?\r?\n(.*)/s.test(newData)) {
        newData = newData.replace(/(.*)Accept-Encoding:.*?\r?\n(.*)/s, '$1$2')
      }
      if (targetSktNum === 2) {
        debug(this.ID, 'No gzip please !!')
        // newData = newData.replace(/(HTTP\/\d\.\d.*Host: ).*?(\r?\n.*)/s, '$1localhost:8321$2')
        // newData = newData.replace(/(HTTP\/\d\.\d.*Referer: ).*?(\r?\n.*)/s, '$1http://localhost:8321$2')
        debug(this.ID, 'changing headers to reflect new url and path')
        newData = newData.replace(new RegExp(SocketMux.matchStr), '$1$2$4$5$6$7')
        /* newData = newData.replace(/(GET|POST|PUT|DELETE)(\s+?\/)v4\/(apps\/Tradeshift\.BranchManager HTTP\/\d\.\d)/, '$1$2$3') */
        newData = newData.replace(/(Connection:.*?\r?\n)/, '$1Cache-Control: no-cache\nCache-Control: no-store\n')
      }
    }
    if (sktNum === 2) {
      if (
        /HTTP\/\d\.\d 200 .*Content-Type: text\/html/s.test(newData) &&  // test if the result is html
        /(HTTP\/\d\.\d.*Content-Length: )\d+(.*)/s.test(newData)     // test if we have Content-Length (a body)
      ) {
        debug(this.ID, `Will inspect respose of OUT2`)
        let header = newData.match(/HTTP.*?\r?\n\r?\n/s)[0]
        let body = newData.replace(/HTTP.*?\r?\n\r?\n/s, '')
        // error('HEADER', header)
        // error('BODY', body)

        const configScript = this._getConfigScript(body)
        // error('CONFIG-SCRIPT', configScript)
        body.replace('__config', '__configOriginal')
        body = this._insertConfig(body, configScript, 'http://localhost:8321')
        // error('NEW-BODY', body)

        const newLength = body.length
        header = header.replace(/(HTTP\/\d\.\d.*Content-Length: )\d+(.*)/s, `\$1${newLength}\$2`)
        newData = `${header}${body}`
        // error('NEW DATA NEW DATA', newData)
      } else
        debug(this.ID, 'Will NOT inspect OUT2')
    }
    this._dumpData(newData, sktNum, targetSktNum, true)
    return Buffer.from(newData)
  }

  _getConfigScript = html => {
    const matches = html.match(/<script type="text\/javascript">\s+var __config = \{.+\};\s+<\/script>/)
    return matches && matches.length > 0 && matches[0] || ''
  }

  _insertConfig = (html, configScript, redirectIndex) => {
		debug(this.ID, 'inserting configScript')
    const $ = cheerio.load(html, {xmlMode: true})
    configScript !== '' && $('body').prepend(configScript.replace(/"CDN_URL":"[^"]*"/, `"CDN_URL":"${redirectIndex}"`))
    $('*').each((index, element) => {
      if (element.name === 'script') {
        const attrSrc = $(element).attr('src')
        if (attrSrc && (attrSrc.indexOf('/webpack') === 0 || attrSrc.indexOf('/locale.js') === 0 || attrSrc.indexOf('/bundles') === 0)) {
          $(element).attr('src', redirectIndex + attrSrc)
        }
      }
      if (element.name === 'link') {
        const attrSrc = $(element).attr('href')
        if (attrSrc && (attrSrc.indexOf('/webpack') === 0)) {
          $(element).attr('href', redirectIndex + attrSrc)
        }
      }
      if (!$(element).html()) {
        $(element).html(' ')
      }
    })
    $('body').append(SocketMux.floatingThingy)
    return $.html();
  }

  _getTargetSkt(sktNum: number, data: Buffer): number {
    if (sktNum === 0) {
      /* const matchExpr: string = `(GET|POST|PUT|DELETE)(\\s+?\\/)v4\\/(apps\\/Tradeshift\\.)(${this.#interceptedApps})(.*?)( HTTP\\/\\d\\.\\d)` */
      const matchOut = data.toString().match(new RegExp(SocketMux.matchStr))
      /* error('MATCHOUT1!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!', SocketMux.matchStr) */
      /* error('MATCHOUT2!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!', matchOut) */
      /* error('MATCHOUT3!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!', data.toString()) */
      if (matchOut) {
        error(this.ID, '********* MUX criteria matched. Redirecting to OUT2 ********')
        debug('Matched:', matchOut[0])
      } else {
        error(this.ID, '********* MUX criteria NOT matched ********')
      }
      return matchOut ? 2 : 1
    }
    return 0
  }

  _setupSocket(sktNum: number, skt: Socket) {
    const isInSkt = sktNum === 0
    const TAG = isInSkt ? 'IN' : `OUT${sktNum}`
      skt.on('end', () => {
        debug(this.ID, `${TAG} socket disconnected`)
        skt = null
        this.kill()
      })
      skt.on('close', (hasError: boolean) => {
        debug(this.ID, `${TAG} socket closed. Has Error:`, hasError)
        this.kill()
      })
      skt.on('error', (err: Error) => {
        error(this.ID, `${TAG} socket error:`, err)
        this.kill()
      })
      skt.on('data', async data => {
        try {
          if (skt) {
            debug(this.ID, `... writing data to ${isInSkt ? 'OUT -->>': 'IN <<--'}`)
            const targetSktNum = this._getTargetSkt(sktNum, data);
            if (!this.#out2Created && sktNum === 0 && targetSktNum === 2) {
              debug(this.ID, 'Creating OUT2 on demand')
              this.#outSkt2 = await getConn(this.outUrl2)
              this._setupSocket(2, this.#outSkt2)
              this.#out2Created = true
            }
            ( (targetSktNum === 0 && this.#inSkt)   ||
              (targetSktNum === 1 && this.#outSkt1) ||
              (targetSktNum === 2 && this.#outSkt2)
            ).write(this._filterData(data, sktNum, targetSktNum))
          } else {
            error(this.ID, `Could not write data to ${TAG}: TLS Socket is null`)
          }
        } catch (ex) {
          error(this.ID, `Could not write data to ${TAG}:`, ex)
        }
      })
  }

  ////////////////////////////////////// PUBLIC METHODS /////////////////////////////////////

  async init(): Promise<boolean> {
    try {
      debug(this.ID, 'Creating OUT1:', this.outUrl1)
      this.#outSkt1 = await getTlsConn(this.outUrl1)
      this._setupSocket(0, this.#inSkt)
      this._setupSocket(1, this.#outSkt1)
    } catch(ex) {
      error(this.ID, "Could not connect to both OUT1 and OUT2 sockets", ex)
      this.kill()
    }
    return !!this.#outSkt1
  }

  kill() {
    log(this.ID, `killing all sockets`)
    this.#inSkt && this.#inSkt.end()
    this.#outSkt1 && this.#outSkt1.end()
    this.#outSkt2 && this.#outSkt2.end()

    if (this.server && this.server['muxs'] && this.server['muxs'][this.ID]) {
      this.server['muxs'][this.ID] = null
      delete this.server['muxs'][this.ID]
      log(this.ID, 'unreferencing mux')
    } else
      log(this.ID, 'no mux reference found to delete')
  }

}

