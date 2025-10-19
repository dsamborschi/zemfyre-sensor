const fs = require('fs')
const path = require('path')

class HistoricalDataStorage {
    constructor (filename = './data/historical_data.json') {
        this.filename = filename
        this.maxAgeDays = 7

        // Ensure data directory exists
        fs.mkdirSync(path.dirname(this.filename), { recursive: true })

        this.ensureFileExists()
    }

    ensureFileExists () {
        if (!fs.existsSync(this.filename)) {
            const initialData = {
                daily_messages: [],
                hourly: [],
                daily: []
            }
            this.saveData(initialData)
        }
    }

    loadData () {
        try {
            if (!fs.existsSync(this.filename)) {
                return { daily_messages: [], hourly: [], daily: [] }
            }
            const raw = fs.readFileSync(this.filename, 'utf-8')
            const data = JSON.parse(raw)

            // Ensure keys exist
            if (!data.daily_messages) data.daily_messages = []
            if (!data.hourly) data.hourly = []
            if (!data.daily) data.daily = []

            return data
        } catch (err) {
            console.error('Error loading data:', err)
            return { daily_messages: [], hourly: [], daily: [] }
        }
    }

    saveData (data) {
        try {
            fs.writeFileSync(this.filename, JSON.stringify(data, null, 2))
        } catch (err) {
            console.error('Error saving data:', err)
        }
    }

    updateDailyMessages (messageCount) {
        const data = this.loadData()
        const today = this.formatDate(new Date())

        // Find existing entry for today or create new one
        const existingIndex = data.daily_messages.findIndex(entry => entry.date === today)

        if (existingIndex !== -1) {
        // Update existing entry
            data.daily_messages[existingIndex].count += messageCount
        } else {
        // Create new entry for today
            data.daily_messages.push({
                date: today,
                count: messageCount
            })
        }

        // Remove entries older than maxAgeDays
        const cutoffDate = this.formatDate(
            new Date(Date.now() - this.maxAgeDays * 24 * 60 * 60 * 1000)
        )

        data.daily_messages = data.daily_messages.filter(
            (entry) => entry.date >= cutoffDate
        )

        this.saveData(data)
    }

    addHourlyData (bytesReceived, bytesSent) {
        console.log('addHourlyData called with:', { bytesReceived, bytesSent })
        console.log('Will save to file:', this.filename)
        const data = this.loadData()
        const currentTime = this.formatDateTime(new Date())

        data.hourly.push({
            timestamp: currentTime,
            bytes_received: bytesReceived,
            bytes_sent: bytesSent
        })

        const cutoffTime = this.formatDateTime(
            new Date(Date.now() - 24 * 60 * 60 * 1000)
        )

        data.hourly = data.hourly.filter(
            (entry) => entry.timestamp >= cutoffTime
        )

        console.log('About to save data with', data.hourly.length, 'hourly entries')
        this.saveData(data)
        console.log('Data saved successfully')
    }

    getHourlyData () {
        const data = this.loadData()
        const hourlyData = data.hourly || []

        return {
            timestamps: hourlyData.map((entry) => entry.timestamp),
            bytes_received: hourlyData.map((entry) => entry.bytes_received),
            bytes_sent: hourlyData.map((entry) => entry.bytes_sent)
        }
    }

    getDailyMessages () {
        try {
            const data = this.loadData()
            if (!data.daily_messages || data.daily_messages.length === 0) {
                return { dates: [], counts: [] }
            }

            const dailyData = [...data.daily_messages].sort(
                (a, b) => a.date.localeCompare(b.date)
            ).slice(-7)

            return {
                dates: dailyData.map((entry) => entry.date),
                counts: dailyData.map((entry) => entry.count)
            }
        } catch (err) {
            console.error('Error getting daily messages:', err)
            return { dates: [], counts: [] }
        }
    }

    formatDate (date) {
        return date.toISOString().slice(0, 10)
    }

    formatDateTime (date) {
        return date.toISOString().slice(0, 16).replace('T', ' ')
    }
}

module.exports = HistoricalDataStorage
