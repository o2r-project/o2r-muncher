'use strict';
/*
 *  Function to rewrite the basepath of a directory-tree listing.
 *  It will recursively remove a number trunc of chars from the
 *  beginning of tree.path and replace them with the string newpath.
 *
 *  Also adds MIME type information to entries that are not folders (i. e.
 *  have no children array).
 */

var mime = require('mime');

function rewriteTree (tree, trunc, newpath) {
  var mimetype = mime.lookup(tree.path);
  tree.path = tree.path.substring(trunc);
  tree.path = newpath + tree.path;
  if (tree.children) {
    tree.children.map( child => {
      return rewriteTree(child, trunc, newpath);
    });
  } else {
    tree.type = mimetype;
  }
  return tree;
}

module.exports = rewriteTree;
