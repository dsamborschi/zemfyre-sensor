Invoke-RestMethod -Uri "http://localhost:4002/api/v1/jobs/execute" `
  -Method POST `
  -ContentType "application/json" `
  -Body (@{
    job_name = "Health check all devices"
    template_id= "3"
    target_type = "all"
  } | ConvertTo-Json -Depth 10)


  Invoke-RestMethod -Uri "http://localhost:4002/api/v1/jobs/execute" `
  -Method POST `
  -ContentType "application/json" `
  -Body (@{
    job_name = "Restart all devices"
    template_id= "1"
    target_type = "all"
  } | ConvertTo-Json -Depth 10)

  Invoke-RestMethod -Uri "http://localhost:4002/api/v1/jobs/execute" `
  -Method POST `
  -ContentType "application/json" `
  -Body (@{
    job_name = "Echo command on Windows"
    template_id= "6"
    target_type = "all"
  } | ConvertTo-Json -Depth 10)


  Invoke-RestMethod -Uri "http://localhost:4002/api/v1/jobs/schedules" `
  -Method POST `
  -ContentType "application/json" `
  -Body (@{
    job_name = "Hourly Health Check"
    job_document = @{
      version = "1.0"
      steps = @(
        @{
          name = "Check Device Health"
          type = "runCommand"
          input = @{ command = "uptime" }
        }
      )
    }
    target_type = "all"
    schedule_type = "cron"
    cron_expression = "0 * * * *"  # Every hour
    timeout_minutes = 5
  } | ConvertTo-Json -Depth 10)

  Invoke-RestMethod -Uri "http://localhost:4002/api/v1/jobs/scheduler/status"



