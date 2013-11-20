#! /usr/bin/env node
var pull    = require('pull-stream')
var paramap = require('pull-paramap')
var path    = require('path')
var unpack  = require('npmd-unpack').unpack
var mkdirp  = require('mkdirp')
var fs      = require('fs')
var rimraf  = require('rimraf')

/***************************

Link Install

this installs node modules by unpacking all modules
into a global directory (~/.npmd/linkable/HASH)
and then symlinking all dependencies.

This means that installing a very large dependency
tree is only one symlink if dependencies are already set up.

this module requires a the resolve tree to be transformed by
the npmd-leaves module. Each module is ided by the shasum
of it's tarball + it's dep's hashes.

(so, each hash is identified by it's entire subtree)

To install the tree. 

****************************/


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
    //already linked
    if(found === target)
      done()
    //there is no link.
    else if(err && err.code === 'ENOENT')
      fs.symlink(target, source, done)
    //a directory is linked, or no link.
    //or there is a different link
    else if (!err || (err && err.code === 'EINVAL'))
      rimraf(source, function (err) {
        if(err) return cb(err)
        fs.symlink(target, source, done)
      })
    else {
      console.log(err, found)
      done(new Error('this should never happen'))
    }
  })

  function done (err) {
    if(err) {
      console.log(err)
      err.source = source
      err.target = target
    }
    cb(err)
  }
}

var link =  function (ltree, opts, cb) {
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
          if(err) return n=-1, cb(err)
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

function getRoots (tree) {
  var deps = {}, roots = {}
  for(var k in tree) {
    for(var j in tree[k].dependencies)
      deps[tree[k].dependencies[j]] = true
  }
  for(var k in tree) {
    var pkg = tree[k]
    if(!deps[k])
      roots[k] = {name: pkg.name, version: pkg.version, hash: pkg.hash}
  }
  return roots
}


var linkAll = exports = module.exports = function (tree, opts, cb) {
  var roots = getRoots(tree), n = 0
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
        mkdirp(path.join(installPath, 'node_modules'), function (err) {
          if(err) console.log('mkdirp err')
          if(err) return next(err)
          console.error(root.name + '@' + root.version + ' (' + root.hash + ')')
          //after linking the module, is when you'd want to link it's bin if you are installing
          //it globally. note... you'd only link root deps.
          linkModule(installPath, root.name, root.hash, opts, next)
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

exports.linkModule = linkModule
exports.link       = link

if(!module.parent) {
  var data = ''
  process.stdin
    .on('data', function (d) { data += d })
    .on('end', function () {
      linkAll(JSON.parse(data), {}, function (err) {
        if(err) throw err
      })
    })
}

