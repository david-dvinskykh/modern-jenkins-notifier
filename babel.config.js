// Jest runs the sources through Babel: the extension code uses ES modules,
// which the default Jest runtime cannot parse.
module.exports = {
  presets: [
    ['@babel/preset-env', {targets: {node: 'current'}}]
  ]
};
