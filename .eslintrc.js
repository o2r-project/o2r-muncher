module.exports = {
    "extends": "google",
    "installedESLint": true,
    "rules": {
        'max-len': [
            'warn',
            {
                code: 120,
                ignoreTrailingComments: true,
                ignoreUrls: true
            }
            ],
        'camelcase': 'off',
        'object-curly-spacing': 'off'
    }
};