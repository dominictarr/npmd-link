# npmd-link

install npm modules using symlinks (FAST)

[![travis](https://travis-ci.org/dominictarr/npmd-link.png?branch=master)
](https://travis-ci.org/dominictarr/npmd-link)

## example

use a leaf hash list as generated my `npmd-leaves`.

``` js
var link = require('npmd-link')
var leaves = require('npmd-leaves')

//take a dep tree generated by 
var depTree = require('./depTree.json')

  //link ensures all links, but leaves it to you

  link(leaves(depTree), function (err) {
    if(err) throw err
    mkdirp(path.join(process.cwd(), 'node_modules'), function () {
      //link a module into a node_modules directory.
      link.linkModule(
        process.cwd(),
        depTree.name,
        depTree.hash, {}, function () {
          console.log('ready')
        })
    })
  })
})

```

## License

MIT
