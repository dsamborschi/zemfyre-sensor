const { Agent } = require('./agent')
const cors = require('cors')

class API {
    constructor (app, options) {
        this.options = options

        // Add CORS middleware
        app.use(cors({
            origin: [
                'http://localhost:2000',
                'http://localhost:3000',
                'http://localhost:5173',
                'http://localhost:8080'
            ],
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'Accept']
        }))

        app.get('/api/v1/status', (request, reply) => {
            if (this.agent) {
                reply.send({
                    connected: this.agent.connected,
                    error: this.agent.error
                })
            } else {
                reply.send({
                    connected: false
                })
            }
        })

        app.post('/api/v1/commands/start', async (request, reply) => {
            try {
                if (!this.agent) {
                    this.agent = new Agent(this.options)
                }
                await this.agent.start()
                reply.send({})
            } catch (err) {
                reply.status(400).send({ error: '', message: '' })
            }
        })

        app.post('/api/v1/commands/stop', async (request, reply) => {
            try {
                if (this.agent) {
                    await this.stop()
                } else {
                    // send error about not active
                }
            } catch (err) {
                reply.status(400).send({ error: '', message: '' })
            }
            reply.send({})
        })

        app.get('/api/v1/metrics', async (request, reply) => {
            const stats = await this.agent.stats.getStats()
            reply.json({ ...stats, mqtt_connected: this.agent.stats.connectedClients > 0 })
        })

        // default to running
        this.agent = new Agent(this.options)
        this.agent.start()
    }

    async stop () {
        if (this.agent) {
            await this.agent.stop()
        }
    }
}

module.exports = {
    API
}
