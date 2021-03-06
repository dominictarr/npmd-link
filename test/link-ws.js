
var link = require('../')
var tape = require('tape')
var leaves  = require('npmd-leaves')

function first (obj) {
  for(var k in obj)
    return obj[k]
}

tape('install ws', function (t) {
  var tree = require('./ws.json')
  link.all(tree, {path: __dirname}, function (err) {
    if(err) throw err
    var wsPkg = require('./node_modules/ws/package.json')
    var root = first(leaves.roots(tree))
    t.equal(wsPkg.name, root.name)
    t.equal(wsPkg.version, root.version)
    t.end()
  })
})
