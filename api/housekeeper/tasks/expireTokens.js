const AccessToken = require('../../models/token')
const OAuthSession = require('../../models/oauth')
const { randomInt } = require('../utils')

module.exports = {
    name: 'expireTokens',
    startup: true,
    // Pick a random hour/minute for this task to run at. If the application is
    // horizontally scaled, this will avoid two instances running at the same time
    schedule: `${randomInt(0, 59)} ${randomInt(0, 23)} * * *`,
    run: async function () {
        // Remove expired access tokens
        await AccessToken.deleteMany({
            expiresAt: { $lt: new Date() }
        })

        // Remove any OAuthSession objects that were created more than 5 minutes ago
        await OAuthSession.deleteMany({
            createdAt: { $lt: new Date(Date.now() - 1000 * 60 * 5) }
        })
    }
}
