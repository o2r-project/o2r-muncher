'use strict';
/*
 *  Function to rewrite the basepath of a directory-tree listing.
 *  It will recursively remove a number trunc of chars from the
 *  beginning of tree.path and replace them with the string newpath.
 */
function rewriteTree (tree, trunc, newpath) {
  tree.path = tree.path.substring(trunc);
  tree.path = newpath + tree.path;
  if (tree.children) {
    tree.children.map( child => {
      return rewriteTree(child, trunc, newpath);
    });
  }
  return tree;
}

module.exports = rewriteTree;
