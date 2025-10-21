const { captureCheckIn, captureException } = require('@sentry/node')
const { scheduleTask } = require('cronosjs')

/**
 * House-keeper component
 *
 * Runs regular maintenance tasks to keep things clean and tidy
 */
function createHousekeeper(app) {
    const tasks = {}
    const delayedStartupTasks = []

    function reportTask(name, schedule) {
        try {
            return captureCheckIn({
                monitorSlug: name,
                status: 'in_progress'
            },
            {
                schedule: {
                    type: 'crontab',
                    value: schedule
                },
                checkinMargin: 5,
                maxRuntime: 5,
                timezone: 'Etc/UTC'
            })
        } catch (error) {
            console.log('Failed to report to Sentry', error)
        }
    }

    function reportTaskComplete(checkInId, name) {
        if (!checkInId) return
        try {
            captureCheckIn({
                checkInId,
                monitorSlug: name,
                status: 'ok'
            })
        } catch (error) {
            console.log('Failed to report task complete to Sentry', error)
        }
    }

    function reportTaskFailure(checkInId, name, errorMessage) {
        if (checkInId) {
            try {
                captureCheckIn({
                    checkInId,
                    monitorSlug: name,
                    status: 'error',
                    errorMessage
                })
            } catch (error) {
                console.log('Failed to report task failure to Sentry', error)
            }
        }

        try {
            captureException(new Error(errorMessage))
        } catch (error) {
            console.log('Failed to report task failure exception to Sentry', error)
        }
    }

    async function runTask(task) {
        console.log(`Running task '${task.name}'`)
        const checkInId = reportTask(task.name, task.schedule)

        return task.run(app)
            .then(() => reportTaskComplete(checkInId, task.name))
            .catch(err => {
                const msg = `Error running task '${task.name}': ${err.toString()}`
                console.error(msg)
                reportTaskFailure(checkInId, task.name, msg)
            })
            .finally(() => {
                console.log(`Completed task '${task.name}'`)
            })
    }

    async function registerTask(task) {
        if (app.config?.housekeeper === false) return

        tasks[task.name] = task

        if (task.schedule) {
            task.job = scheduleTask(task.schedule, () => runTask(task))
        }
    }

    async function initialize() {
        await registerTask(require('./tasks/expireTokens'))
        // await registerTask(require('./tasks/telemetryMetrics'))

        for (const task of Object.values(tasks)) {
            if (task.startup === true) {
                await runTask(task)
            } else if (typeof task.startup === 'number') {
                delayedStartupTasks.push(setTimeout(() => runTask(task), task.startup))
            }
        }
    }

    async function shutdown() {
        for (const task of Object.values(tasks)) {
            if (task.job) {
                task.job.stop()
                delete task.job
            }
        }
        delayedStartupTasks.forEach(clearTimeout)
    }

    return {
        initialize,
        shutdown,
        registerTask
    }
}

module.exports = createHousekeeper
