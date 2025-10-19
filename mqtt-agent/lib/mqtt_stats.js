const fs = require('fs')
const HistoricalDataStorage = require('./data_storage')
const { Mutex } = require('async-mutex')

const logger = console // Replace with your actual logger

const MONITORED_TOPICS = {
    '$SYS/broker/messages/sent': 'messagesSent',
    '$SYS/broker/subscriptions/count': 'subscriptions',
    '$SYS/broker/retained messages/count': 'retainedMessages',
    '$SYS/broker/clients/connected': 'connectedClients',
    '$SYS/broker/load/bytes/received/15min': 'bytesReceived15min',
    '$SYS/broker/load/bytes/sent/15min': 'bytesSent15min'
}

// MessageCounter
class MessageCounter {
    constructor (filePath = './data/message_counts.json') {
        this.filePath = filePath
        this.dailyCounts = this.loadCounts()
    }

    loadCounts () {
        if (fs.existsSync(this.filePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.filePath))
                return Object.fromEntries(
                    data.map(item => [item.timestamp.split(' ')[0], item.messageCounter])
                )
            } catch {
                return {}
            }
        }
        return {}
    }

    saveCounts () {
        const data = Object.entries(this.dailyCounts).map(([date, count]) => ({
            timestamp: `${date} 00:00`,
            messageCounter: count
        }))
        fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2))
    }

    incrementCount () {
        const today = new Date().toISOString().split('T')[0]
        this.dailyCounts[today] = (this.dailyCounts[today] || 0) + 1
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - 7)
        this.dailyCounts = Object.fromEntries(
            Object.entries(this.dailyCounts).filter(([date]) => new Date(date) >= cutoff)
        )
        this.saveCounts()
    }

    getTotalCount () {
        return Object.values(this.dailyCounts).reduce((a, b) => a + b, 0)
    }
}

// Stats

class MQTTStats {
    constructor () {
        this._lock = new Mutex()

        // Direct values from $SYS topics
        this.messagesSent = 0
        this.subscriptions = 0
        this.retainedMessages = 0
        this.connectedClients = 0
        this.bytesReceived15min = 0.0
        this.bytesSent15min = 0.0

        // Initialize message counter
        this.messageCounter = new MessageCounter()

        // Initialize data storage
        this.dataStorage = new HistoricalDataStorage()
        this.lastStorageUpdate = new Date()

        // Message rate tracking
        this.messagesHistory = Array(15).fill(0)
        this.publishedHistory = Array(15).fill(0)
        this.lastMessagesSent = 0
        this.lastUserMessages = 0
        this.lastUpdate = new Date()
    }

    formatNumber (number) {
        if (number >= 1_000_000) {
            return (number / 1_000_000).toFixed(1) + 'M'
        } else if (number >= 1_000) {
            return (number / 1_000).toFixed(1) + 'K'
        }
        return String(number)
    }

    async incrementUserMessages () {
        const release = await this._lock.acquire()
        try {
            this.messageCounter.incrementCount()
            this.dataStorage.updateDailyMessages(1)
        } finally {
            release()
        }
    }

    async updateStorage () {
        const now = new Date()
        if ((now - this.lastStorageUpdate) / 1000 >= 180) { // 3 minutes
            const release = await this._lock.acquire()
            try {
                this.dataStorage.addHourlyData(
                    parseFloat(this.bytesReceived15min),
                    parseFloat(this.bytesSent15min)
                )
                this.lastStorageUpdate = now
            } catch (err) {
                logger.error(`Error updating storage: ${err}`)
            } finally {
                release()
            }
        }
    }

    async updateMessageRates () {
        const now = new Date()
        if ((now - this.lastUpdate) / 1000 >= 60) { // 1 minute
            const release = await this._lock.acquire()
            try {
                const publishedRate = Math.max(
                    0,
                    this.messagesSent - this.lastMessagesSent
                )
                this.publishedHistory.push(publishedRate)
                if (this.publishedHistory.length > 15) {
                    this.publishedHistory.shift()
                }
                this.lastMessagesSent = this.messagesSent

                const currentUserMessages = this.messageCounter.getTotalCount()
                const userMessageRate = Math.max(0, currentUserMessages - this.lastUserMessages)
                this.messagesHistory.push(userMessageRate)
                this.lastUserMessages = currentUserMessages

                this.lastUpdate = now
            } finally {
                release()
            }
        }
    }

    async getStats () {
        await this.updateMessageRates()
        await this.updateStorage()

        const release = await this._lock.acquire()
        try {
            const actualSubscriptions = Math.max(0, this.subscriptions - 2)
            const actualConnectedClients = Math.max(0, this.connectedClients - 1)

            const totalMessages = this.messageCounter.getTotalCount()
            const hourlyData = this.dataStorage.getHourlyData()
            const dailyMessages = this.dataStorage.getDailyMessages()

            return {
                totalConnectedClients: actualConnectedClients,
                totalMessagesReceived: this.formatNumber(totalMessages),
                totalSubscriptions: actualSubscriptions,
                retainedMessages: this.retainedMessages,
                messagesHistory: [...this.messagesHistory],
                publishedHistory: [...this.publishedHistory],
                bytesStats: hourlyData,
                dailyMessageStats: dailyMessages
            }
        } finally {
            release()
        }
    }
}

module.exports = {
    MQTTStats,
    MONITORED_TOPICS
}
