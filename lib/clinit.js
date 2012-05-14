
var pkginfo = require('pkginfo')
  , pidfile = require('pidfile')
  , path = require('path')
  , fs = require('fs')
  , existsSync = fs.existsSync || path.existsSync
  , EventEmitter = require('events').EventEmitter
  ;

var clinit = module.exports = new EventEmitter()


var cmds = ['start','stop','graceful-stop','restart','reload','status']

clinit.readPackage = function(dir) {
  dir = dir || process.env.NODE_DIR ? path.resolve(process.env.NODE_DIR) : process.cwd()

  while(!existsSync(dir + '/package.json')) {
    if (dir === '/') throw new Error('Could not find package.json')
    dir = path.dirname(dir)
  }

  var data = fs.readFileSync(dir + '/package.json')

  return {
    dir: dir
  , package: JSON.parse(data)
  }
}

clinit.exec = function(opts) {
  if (!opts.lockFile) {
    throw new Error('Missing lock file')
  }

  var cmd = opts.cmd

  if (!~cmds.indexOf(opts.cmd)) {
    cmd = 'usage'
  }

  var msg = clinit[cmd](opts)

  if (typeof msg === 'number') {
    msg = clinit[cmd][msg]
  }

  msg = msg.replace(/\{name\}/g, opts.name)

  process.stdout.write(msg + '\n')

  process.exit()
}

clinit.pid = function(filename) {
  return pidfile.checkSync(filename);
}

function spawn(opts) {
  var env = opts.env || process.env
  env.clinit_lockFile = opts.lockFile;

  var child = require('child_process').fork(opts.main, opts.args,  {
    cwd: opts.cwd || process.cwd()
  , env: env
  })
}

clinit.start = function(opts) {
  if (clinit.pid(opts.lockFile)) return 1

  spawn(opts)
  return 0
}
clinit.start[0] = 'Starting {name}'
clinit.start[1] = '{name} is already running'


clinit.stop = function(opts) {
  var pid = clinit.pid(opts.lockFile)
  if (!pid) return 1

  process.kill(pid, 'SIGTERM')
  return 0
}
clinit.stop[0] = 'Stopping {name}'
clinit.stop[1] = '{name} is not running'


clinit['graceful-stop'] = function(opts) {
  var pid = clinit.pid(opts.lockFile)
  if (!pid) return 1

  process.kill(pid, 'SIGINT')
  return 0
}
clinit['graceful-stop'][0] = 'Gracefully stopping {name}'
clinit['graceful-stop'][1] = clinit.stop[1]


clinit.restart = function(opts) {
  var pid = clinit.pid(opts.lockFile)

  if (pid) {
    process.kill(pid, 'SIGTERM');
    pidfile.waitSync(opts.lockFile);
  }

  spawn(opts)
  return 0
}
clinit.restart[0] = 'Restarting {name}'

clinit.reload = function(opts) {
  var pid = clinit.pid(opts.lockFile)
  if (!pid) return 1

  process.kill(pid, 'SIGHUP')
  return 0
}
clinit['reload'][0] = 'Reloading {name}'
clinit['reload'][1] = clinit.stop[1]


clinit.status = function(opts) {
  var pid = clinit.pid(opts.lockFile)

  if (pid) {
    return opts.name + ' is running (pid ' + pid + ')'
  } else {
    return opts.name + ' is not running'
  }
}

clinit.usage = function() {
  return 'Usage: [' + cmds.join('|') + ']';
}



if (process.env.clinit_lockFile && require('cluster').isMaster) {
  var pid = pidfile.createSync(process.env.clinit_control_lockFile)


  process.on('SIGTERM', function() {
    clinit.emit('stop')
    pidfile.closeSync(pid)
    process.exit()
  })

  process.on('SIGINT', function() {
    clinit.emit('graceful-stop')
    pidfile.closeSync(pid)
    process.exit()
  })

  process.on('SIGHUP', function() {
    clinit.emit('reload')
  })

}
