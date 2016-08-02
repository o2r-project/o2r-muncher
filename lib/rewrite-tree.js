'use strict';
/*
 *  Function to rewrite the basepath of a directory-tree listing.
 *  It will recursively remove a number trunc of chars from the
 *  beginning of tree.path and replace them with the string newpath.
 *
 *  Also adds MIME type information to entries that are not folders (i. e.
 *  have no children array).
 */

var override = require('../config/custom-mime.json');
var Mimos = require('mimos');
var mime = new Mimos({override});

function rewriteTree (tree, trunc, newpath) {
  tree.path = tree.path.substring(trunc);
  tree.path = newpath + tree.path;
  if (tree.children) {
    tree.children.map( child => {
      return rewriteTree(child, trunc, newpath);
    });
  } else {
    var mimetype = mime.path(tree.path).type;
    tree.type = mimetype;
  }
  return tree;
}

module.exports = rewriteTree;
