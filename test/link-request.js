var link = require('../')
var tape = require('tape')
var leaves  = require('npmd-leaves')

function first (obj) {
  for(var k in obj)
    return obj[k]
}

tape('install request', function (t) {
  var tree = require('./request-tree.json')
  link.all(tree, {path: __dirname}, function (err) {
    if(err) throw err
    var requestPkg = require('./node_modules/request/package.json')
    var root = first(leaves.roots(tree))
    t.equal(requestPkg.name, root.name)
    t.equal(requestPkg.version, root.version)
    t.end()
  })
})
