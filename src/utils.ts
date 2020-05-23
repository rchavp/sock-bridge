const colors = {
  // Special
  Reset: "\x1b[0m",
  Bright: "\x1b[1m",
  Dim: "\x1b[2m",
  Underscore: "\x1b[4m",
  Blink: "\x1b[5m",
  Reverse: "\x1b[7m",
  Hidden: "\x1b[8m",
  // Foreground
  FgBlack: "\x1b[30m",
  FgRed: "\x1b[31m",
  FgGreen: "\x1b[32m",
  FgYellow: "\x1b[33m",
  FgBlue: "\x1b[34m",
  FgMagenta: "\x1b[35m",
  FgCyan: "\x1b[36m",
  FgWhite: "\x1b[37m",
  // Background
  BgBlack: "\x1b[40m",
  BgRed: "\x1b[41m",
  BgGreen: "\x1b[42m",
  BgYellow: "\x1b[43m",
  BgBlue: "\x1b[44m",
  BgMagenta: "\x1b[45m",
  BgCyan: "\x1b[46m",
  BgWhite: "\x1b[47m",
}

function logger (TAG: string = '') {
  this.log = (...args) => {
    console.log(colors.FgGreen, `[INFO--${TAG}]`, ...args, colors.Reset)
  }
  this.debug = (...args) => {
    if (process.env.LOG_LEVEL && process.env.LOG_LEVEL === 'debug')
      console.log(colors.FgYellow, `[DEBUG-${TAG}]`, ...args, colors.Reset)
  }
  this.error = (...args) => {
    console.error(colors.FgRed, `[ERROR-${TAG}]`, ...args, colors.Reset)
  }
  this.plain = (...args) => {
    console.log(colors.FgCyan, `[PLAIN-${TAG}]`, ...args, colors.Reset)
  }
}

logger.prototype.init = function() {
  return {
    log: this.log,
    debug: this.debug,
    error: this.error,
    plain: this.plain
  }
}

const init = TAG => (new logger(TAG)).init()

const asyncTimeout = (time) => new Promise((resolve, reject) => {
  setTimeout(resolve, time)
})

export {
  init,
  asyncTimeout
}
