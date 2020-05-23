import configBlob from '../config.json';
import net from 'net'
import fs from 'fs'
import tls from 'tls'
import { TLSSocket } from 'tls'
import { Socket, Server } from 'net'
import { SocketMux } from './netMux'
import { asyncTimeout } from './utils'
const { log, debug, error } = require('./utils').init('MAIN')

let config
try {
  config = {...configBlob}
} catch (err) {
  error("Could not read from configuration file. Exiting process.")
  process.exit(-1)
}

log('Config loaded\n', config)
SocketMux.config = config


const CNTRL_PORT: number = config.Control_Port
const PLAIN_PORT: number = config.Plain_Port
const TLS_PORT: number   = config.Tls_Port
const REMOTE_ADDR: string = config.Remote_Addr_IP
const APP_PATH: string = process.cwd()

log('WORKING DIR:', APP_PATH)

// **************************************************
// Create the plain (non-secure) listening server
// **************************************************
const plainServer = net.createServer(async (conSock: Socket) => {
  log('client connected to PLAIN port')

  const mux = new SocketMux(conSock, REMOTE_ADDR, 'localhost')
  const initialized = await mux.init()

  if (!initialized) {
    error('Could not initialize mux. Closing new connection')
    conSock.end()
    return
  }
  
  mux.server = plainServer

  if (!plainServer['muxs'])
    plainServer['muxs'] = {}
  plainServer['muxs'][mux.ID] = mux

})

plainServer.on('error', (err) => {
  error('Plain Server error', err)
  plainServer && plainServer.close()
  tlsServer && tlsServer.close()
})

plainServer.on('close', () => {
})

plainServer.listen(PLAIN_PORT, () => {
  log(`Server listening on port ${PLAIN_PORT}`)
})

// **************************************************
// Create the TLS (secure) listening server
// **************************************************
const options = {
  key: fs.readFileSync(`${APP_PATH}/certs/sandbox.tradeshift.com.key`),
  cert: fs.readFileSync(`${APP_PATH}/certs/sandbox.tradeshift.com.crt`)
};

const tlsServer = tls.createServer(options, async (tlsSock: TLSSocket) => {
  try {
    const mux = new SocketMux(tlsSock, REMOTE_ADDR, 'localhost')
    const initialized = await mux.init()

    if (!initialized) {
      error('Client connected but could not initialize mux. Closing new connection')
      tlsSock.end()
      return
    }

    mux.server = tlsServer

    if (!tlsServer['muxs'])
      tlsServer['muxs'] = {}
    tlsServer['muxs'][mux.ID] = mux

    log(`Client connected to TLS port. Created ${mux.ID} to handle it.`)
    debug(`Current open muxes: ${Object.keys(tlsServer['muxs']).length}`)

  } catch (ex) {
    error('ERROR:', ex)
  }
})

tlsServer.on('error', (err) => {
  error('TLS Server error', err)
  plainServer && plainServer.close()
  tlsServer && tlsServer.close()
})

tlsServer.on('close', () => {
})

tlsServer.listen(TLS_PORT, () => {
  log(`TLS Secure Server listening on port ${TLS_PORT}`)
})








process.on( 'SIGINT', async () => {
  log( "Starting gracefullly shutting down from SIGINT (Ctrl-C)" )
  setTimeout(() => {
    error('Timeout while trying to close servers. Forcing process exit')
    process.exit(1)
  }, 10000)
  finalizeServer('Plain Server', plainServer)
  finalizeServer('TLS Server', tlsServer)
  await closeSocket(plainServer, 'Plain Server stopped')
  await closeSocket(tlsServer, 'TLS Server stopped')
  log('Servers were closed. Exiting process ...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  log('SIGTERM')
})
process.on('SIGUSR2', () => {
  log('SIGUSR2')
})
process.on('uncaughtException', (err) => {
  error('UNCAUGHT-EXCEPTION', err)
  plainServer && plainServer.close()
  tlsServer && tlsServer.close()
})
process.on('exit', (code) => {
  log('Process Exit with code:', code)
});

const event = 'unhandledRejection'

process.on(event, function (err) {
  module.exports.logError(err)
  if (module.exports.abort) {
    process.abort()
  }
  process.exit(1)
})

module.exports.abort = false
module.exports.logError = error

const closeSocket = (skt, msg) => new Promise((resolve, reject) => {
  skt.close(() => {
    log(msg)
    resolve()
  })
})

const finalizeServer = (TAG: string, server: Server) => {
  log('Finalizing server:', TAG)
  if (server['muxs'])
    for (const m in server['muxs'])
      server['muxs'][m].kill()
}


debug('MAIN', 'Init done')
