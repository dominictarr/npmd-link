var pull    = require('pull-stream')
var paramap = require('pull-paramap')
var path    = require('path')
var unpack  = require('npmd-unpack').unpack
var mkdirp  = require('mkdirp')
var fs      = require('fs')
var leaves  = require('npmd-leaves')
//var merge   = require('pull-merge')
var deps    = require('get-deps')
//var pushable  = require('pull-pushable')
var linkBin = require('npmd-bin')

function linkable(pkg, opts) {
  var linkRoot = (opts && opts.linkRoot)
    || path.join(process.env.HOME, '.npmd', 'linkable')
  return path.join(linkRoot, 'string' === typeof pkg ? pkg : pkg.hash)
}

//install a module with a symlink.
//adds $moduleDir/node_modules/$name -> $hash

function linkModule(moduleDir, name, hash, opts, cb) {
  if(!cb)
    cb = opts, opts = {}
  name = name.name || name
  var source = path.join(moduleDir, 'node_modules', name)
  var target = path.join(linkable(hash, opts), 'package')

  fs.readlink (source, function (err, found) {
    if(found === target)
      done()
    else if(err)
      fs.symlink(target, source, done)
    else 
      fs.unlink(source, function (err) {
        if(err) return cb(err)
        fs.symlink(target, source, done)
      })
  })

  function done (err) {
    if(err) {
      err.source = source
      err.target = target
    }
    cb(err)
  }
}

//var spawn = require('child_process').spawn
//
//function compile(opts, cb) {
//  var cp = spawn('node-gyp', ['rebuild'], {
//    cwd: opts.target
//  })
//  cp.stdout.pipe(process.stdout)
//  cp.stderr.pipe(process.stderr)
//  cp.on('exit', function (code) {
//    cb(code === 0 ? null : new Error('exit status:'+code))
//  })
//}

function once(fun) {
  return function () {
    var args = [].slice.call(arguments)
    var cb = args.pop()
    var err = new Error('twice!')
    var i = 0
    args.push(function (err, val) {
      if(i++) throw err
      cb(err, val)
    })
    fun.apply(this, args)
  }
}


var link = 
module.exports = function (ltree, opts, cb) {
  if(!cb)
    cb = opts, opts = {}
  var dirs = {}
  var linked = {}
//  var queue = pushable()

  pull(
    pull.values(ltree),
    paramap(function (pkg, cb) {
      var dir = linkable(pkg, opts)
      if(dirs[dir]) return cb(null, pkg)
      fs.stat(dir, function (err) {

        if(dirs[dir]) return cb(null, pkg)
        dirs[dir] = true
        if(!err) return cb(null, pkg)

        unpack(pkg, {
          cache: opts.cache,
          target: dir
        }, function (err) {
          if(err) return cb(err)
          cb(null, pkg)
        })
      })
    }),
    pull.asyncMap(function (pkg, cb) {
      //unpack to 
      //.npmd/linkable/HASH
      //then symlink to the deps

      var moduleDir = path.join(linkable(pkg), 'package')

      if(linked[pkg.hash]) return cb(null, pkg)
      linked[pkg.hash] = true
      mkdirp(path.join(moduleDir, 'node_modules'), function () {
        var n = 0

        for(var name in pkg.dependencies) {
          n ++
          linkModule(moduleDir, name, pkg.dependencies[name], next)
        }
        if(!n) cb()

        function next (err) {
          if(--n) return
          cb()
        }
      })
    }),
    pull.drain(null, function (err) {
      cb(err, ltree)
    })
  )
}

module.exports.db = function (db, config) {
  db.methods.lResolve = {type: 'async'}
  db.lResolve = function (module, opts, cb) {
    if(!cb)
      cb = opts, opts = {}

    opts.hash = true
    opts.check = false

    db.resolve(module, opts, function (err, tree) {
      if(err) cb(err)
      cb(err, leaves(tree), tree)
    })
  }
}

var all = module.exports.all = function (tree, opts, cb) {
  var roots = leaves.roots(tree), n = 0
  opts = opts || {}
  opts.dir = opts.dir || process.cwd()

  var installPath = opts.path || opts.dir || process.cwd()

  var i = 0
  link(tree, function (err) {
    if(err) throw err
    if(i++) throw new Error('finished twice!')

    for(var k in roots) {
      n ++
      ;(function (root) {
        mkdirp(path.join(installPath, 'node_modules'), function () {
        console.error(root.name + '@' + root.version + ' (' + root.hash + ')')
          linkModule(installPath, root.name, root.hash, opts, function (err) {
            if(err) return next(err)
            console.log(opts)
            if(!opts.bin) return next()

            var target = path.join(linkable(root.hash, opts), 'package')
            console.log(target, opts.bin)
            linkBin(target, opts.bin, next)
          })
        })
      })(roots[k])
    }
  })

  function next (err) {
    if(err) return cb(err, n = null)
    if(--n) return
    cb()
  }

}

module.exports.linkModule = linkModule

module.exports.commands = function (db) {
  var start = Date.now()
  db.commands.push(function (db, config, cb) {
    var args = config._.slice()
    var cmd = args.shift()
    if(!/link|lresolve/.test(cmd)) return
    if(!args.length)
      args = deps(config.path || process.cwd(), config)


    if('link' === cmd){
      if(!config.global)
        config.bin = config.global
          ? path.join(config.prefix, 'lib', 'bin')
          : path.join(config.path || process.cwd(), 
            'node_modules', '.bin')

      db.lResolve(args, config, function (err, tree) {
        if(err) cb(err)
        else all(tree, config, cb)
      })
    } else if('lresolve' === cmd) {
      db.lResolve(args, config, function (err, tree, root) {
        if(err) return cb(err)
        console.log(JSON.stringify(tree, null, 2))
        cb(null, tree)
      })
    }
    else
      return

    return true
  })
}

