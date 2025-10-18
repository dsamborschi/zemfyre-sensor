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