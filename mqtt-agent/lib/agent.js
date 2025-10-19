const got = require('got')
const isUtf8 = require('is-utf8')
const mqtt = require('mqtt')

const schemaGen = require('./schema-generator')
const { MQTTStats, MONITORED_TOPICS } = require('./mqtt_stats')

const REPORT_TIME = 1000 * 60 * 2

class Agent {
    constructor (options) {
        this.options = options
        this.topics = {}
        this.error = null
        this.stopped = true
        this.stats = new MQTTStats()
    }

    async connect () {
        const agent = this
        this.connected = false
        this.reconnectCount = 0
        this.stopped = false
        try {
            this.creds = await got.get(`${this.options.apiURL}/api/v1/accounts/${this.options.account}/brokers/${this.options.broker}/credentials`, {
                headers: {
                    Authorization: `Bearer ${this.options.token}`
                }
            }).json()

            console.log(`creds: ${JSON.stringify(this.creds, null, 2)}`)
            this.creds = Object.assign(this.creds, { reconnectPeriod: 0 })

            if (this.creds.ssl) {
                switch (this.creds.protocol) {
                case 'mqtt:':
                    this.creds.protocol = 'mqtts:'
                    break
                case 'ws:':
                    this.creds.protocol = 'wss:'
                    break
                }
            }

            const options = {
                clientId: this.creds.clientId,
                protocolVersion: this.creds.protocolVersion,
                username: this.creds.credentials.username,
                password: this.creds.credentials.password
            }

            if (!this.creds.verifySSL) {
                options.rejectUnauthorized = false
            }

            const url = `${this.creds.protocol}//${this.creds.host}:${this.creds.port}`

            this.client = mqtt.connect(url, options)
            this.client.on('connect', function () {
                agent.connected = true
                console.log(`connected to ${agent.creds.host}:${agent.creds.port} as ${options.clientId}`)
                agent.error = null

                // Ensure topics array exists
                let topics = agent.creds.topicPrefix || ['#']

                // Always include $SYS/#
                if (!topics.includes('$SYS/broker/#')) {
                    topics.push('$SYS/broker/#')
                }

                // Remove any accidental duplicates
                topics = [...new Set(topics)]

                console.log(`subscribing to "${topics.join(',')}"`)
                agent.client.subscribe(topics, (err) => {
                    if (err) {
                        console.error('Subscription error:', err)
                    } else {
                        console.log('Subscribed successfully')
                    }
                })
            })

            this.client.on('subscribe', function () {
                // on successful subscribe reset reconnect count
                agent.reconnectCount = 0
            })
            this.client.on('reconnect', function () {
                // console.log('reconnecting')
            })
            this.client.on('close', function () {
                // console.log('closed')
                if (!agent.stopped) {
                    if (agent.reconnectCount < 3) {
                        agent.reconnectCount++
                        agent.reconnectTimeout = setTimeout(() => {
                            agent.client.reconnect()
                        }, 5000)
                    }
                }
            })
            this.client.on('disconnect', function (packet) {
                console.log('MQTTv5 disconnected')
                // should check the reason code
                console.log(packet)
            })
            this.client.on('error', function (error) {
                console.log('error', error.code)
                console.log(error)
                switch (error.code) {
                case 'ECONNREFUSED': // connection refused
                case 'ENOTFOUND': // DNS lookup failed
                    agent.error = error.code
                    break
                case 1:
                    agent.error = 'WRONGMQTTVERSION'
                    break
                case 2:
                case 133:
                    agent.error = 'CLIENTIDNOTALLOWED'
                    break
                case 4:
                    agent.error = 'MALFORMEDCREDS'
                    break
                case 5:
                case 135: // not authorized
                    agent.error = 'NOTAUTHORIZED'
                    break
                case 138:
                    agent.error = 'BANNED'
                    break
                default:
                    // console.log('default error')
                }
                // console.log(`agent.error set to: ${agent.error}`)
            })
            this.client.on('message', function (topic, payload) {
                let type = { type: 'unknown' }
                try {
                    if (isUtf8(payload)) {
                        const stringPayload = payload.toString('utf8')
                        type = { type: 'string' }
                        if (stringPayload.charAt(0) === '<' && stringPayload.charAt(stringPayload.length - 1) === '>') {
                            type.type = 'xml'
                        } else {
                            try {
                                const json = JSON.parse(stringPayload)
                                type = schemaGen.generateSchema(json)
                            } catch (err) {
                                // Not JSON parseable - default to string
                            }
                        }
                    } else {
                        type.type = 'bin'
                    }
                } catch (err) {
                    console.log(`Error parsing payload on topic '${topic}' ${err}`)
                }
                agent.topics[topic] = {
                    timestamp: Date.now(),
                    type
                }
                if (MONITORED_TOPICS[topic]) {
                    console.log(`Updating stats for ${MONITORED_TOPICS[topic]} with value ${payload.toString()}`)
                    const val = parseFloat(payload.toString())
                    agent.stats[MONITORED_TOPICS[topic]] = val
                } else if (!topic.startsWith('$SYS/')) {
                    agent.stats.incrementUserMessages()
                }
            })
        } catch (err) {
            console.log(err)
            throw err
        }

        this.reportInterval = setInterval(async () => {
            if (agent.connected) {
                console.log(`${agent.options.apiURL}/api/v1/accounts/${agent.options.account}/brokers/${agent.options.broker}/topics`)
                console.log(JSON.stringify(agent.topics, null, 2))
                const upload = []
                Object.keys(agent.topics).forEach((key) => {
                    upload.push({
                        topic: key,
                        type: agent.topics[key].type,
                        timestamp: agent.topics[key].timestamp
                    })
                })
                try {
                    await got.post(`${agent.options.apiURL}/api/v1/accounts/${agent.options.account}/brokers/${agent.options.broker}/topics`, {
                        headers: {
                            Authorization: `Bearer ${this.options.token}`
                        },
                        json: upload
                    })
                    // clear list so only uploading new topics each time
                    agent.topics = {}
                } catch (err) {
                    console.log(err)
                }
            }
        }, REPORT_TIME)
    }

    async start () {
        if (this.client) {
            await this.stop()
        }
        await this.connect()
    }

    async stop () {
        this.stopped = true
        if (this.client) {
            this.client.end()
        }
        clearTimeout(this.reconnectTimeout)
        clearInterval(this.reportInterval)
        this.reportInterval = null
        this.connected = false
    }

    state () {
        return {
            connected: this.connected,
            topics: this.topics
        }
    }
}

module.exports = {
    Agent
}
