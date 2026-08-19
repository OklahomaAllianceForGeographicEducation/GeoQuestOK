// webpack.config.js
// Expo's webpack config is extended here so web builds keep their defaults.

const createExpoWebpackConfigAsync = require('@expo/webpack-config');

module.exports = async function (env, argv) {
    const config = await createExpoWebpackConfigAsync(env, argv);
    return config;
};
