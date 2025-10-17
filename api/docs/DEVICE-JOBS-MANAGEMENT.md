# Device Jobs Management - Cloud Portal Guide

## Overview

The **Device Jobs** system allows you to remotely execute tasks on IoT devices from the cloud portal. It's inspired by AWS IoT Jobs and uses the same job document schema your agent already supports.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Cloud Portal/API                              │
│                                                                        │
│  Admin creates job → Job stored in database → Device polls for jobs  │
│                                                                        │
└──────────────────────────────────────────────────────────────────────┘
                                    ↓
                    ┌───────────────────────────────┐
                    │   PostgreSQL Database         │
                    ├───────────────────────────────┤
                    │  • job_templates              │
                    │  • job_executions             │
                    │  • device_job_status          │
                    │  • job_handlers               │
                    └───────────────────────────────┘
                                    ↓
                    ┌───────────────────────────────┐
                    │   Device Agent (Raspberry Pi) │
                    ├───────────────────────────────┤
                    │  1. Polls /jobs/next          │
                    │  2. Executes job              │
                    │  3. Reports status            │
                    └───────────────────────────────┘
```

## Key Concepts

### 1. **Job Templates** (Reusable Definitions)

Templates are pre-defined job configurations that can be reused across multiple executions.

**Example Template**:
```json
{
  "name": "restart-service",
  "category": "system",
  "job_document": {
    "version": "1.0",
    "includeStdOut": true,
    "steps": [
      {
        "name": "Restart Service",
        "type": "runCommand",
        "input": {
          "command": "systemctl,restart,{{SERVICE_NAME}}"
        },
        "runAsUser": "root"
      }
    ]
  }
}
```

### 2. **Job Executions** (Individual Job Instances)

When you execute a job, it creates a job execution record that tracks:
- Which devices should run the job
- Job status (QUEUED, IN_PROGRESS, SUCCEEDED, FAILED)
- Execution timeline
- Per-device results

### 3. **Device Job Status** (Per-Device Tracking)

Each device targeted by a job gets its own status record tracking:
- Execution status
- Start/end times
- Exit code, stdout, stderr
- Detailed execution results

### 4. **Job Handlers** (Custom Scripts)

Reusable bash/python/node scripts that can be referenced by jobs.

---

## Database Schema

### job_templates
```sql
- id (PK)
- name (unique)
- description
- category (system, maintenance, deployment, custom)
- job_document (JSONB) -- Full job definition
- created_by
- is_active
- created_at, updated_at
```

### job_executions
```sql
- id (PK)
- job_id (UUID, unique)
- template_id (FK, optional)
- job_name
- job_document (JSONB)
- target_type (device, group, all)
- target_devices (UUID[])
- target_filter (JSONB)
- execution_type (oneTime, recurring, continuous)
- status (QUEUED, IN_PROGRESS, SUCCEEDED, FAILED, CANCELED)
- total_devices, succeeded_devices, failed_devices
- queued_at, started_at, completed_at
- created_by
```

### device_job_status
```sql
- id (PK)
- job_id (FK)
- device_uuid (FK)
- status (QUEUED, IN_PROGRESS, SUCCEEDED, FAILED, etc.)
- execution_number, version_number
- queued_at, started_at, completed_at
- exit_code, stdout, stderr, reason
- executed_steps, failed_step
- status_details (JSONB)
```

### job_handlers
```sql
- id (PK)
- name (unique)
- description
- script_type (bash, python, node)
- script_content (TEXT) -- Full script code
- permissions (default: 700)
- default_args (JSONB)
- created_by
```

---

## API Endpoints

### Job Templates

#### List Templates
```bash
GET /api/v1/jobs/templates
GET /api/v1/jobs/templates?category=system
GET /api/v1/jobs/templates?active=true
```

#### Get Template
```bash
GET /api/v1/jobs/templates/:id
```

#### Create Template
```bash
POST /api/v1/jobs/templates
Content-Type: application/json

{
  "name": "update-config",
  "description": "Update device configuration",
  "category": "system",
  "job_document": {
    "version": "1.0",
    "steps": [...]
  },
  "created_by": "admin"
}
```

#### Update Template
```bash
PUT /api/v1/jobs/templates/:id
Content-Type: application/json

{
  "description": "Updated description",
  "is_active": false
}
```

#### Delete Template
```bash
DELETE /api/v1/jobs/templates/:id
```

---

### Job Executions

#### Execute Job (Single Device)
```bash
POST /api/v1/jobs/execute
Content-Type: application/json

{
  "job_name": "Restart nginx on Device A",
  "template_id": 1,
  "target_type": "device",
  "target_devices": ["8479359e-dbeb-4858-813c-e8a9008dde04"],
  "created_by": "admin"
}
```

#### Execute Job (All Devices)
```bash
POST /api/v1/jobs/execute
Content-Type: application/json

{
  "job_name": "Health check all devices",
  "template_id": 3,
  "target_type": "all",
  "created_by": "admin"
}
```

#### Execute Job (Filtered Devices)
```bash
POST /api/v1/jobs/execute
Content-Type: application/json

{
  "job_name": "Update Raspberry Pi devices",
  "template_id": 2,
  "target_type": "group",
  "target_filter": {
    "device_type": "raspberry-pi"
  },
  "created_by": "admin"
}
```

#### Execute Custom Job (No Template)
```bash
POST /api/v1/jobs/execute
Content-Type: application/json

{
  "job_name": "Custom diagnostic",
  "job_document": {
    "version": "1.0",
    "includeStdOut": true,
    "steps": [
      {
        "name": "Check disk space",
        "type": "runCommand",
        "input": {
          "command": "df,-h"
        }
      }
    ]
  },
  "target_type": "device",
  "target_devices": ["8479359e-dbeb-4858-813c-e8a9008dde04"]
}
```

#### List Job Executions
```bash
GET /api/v1/jobs/executions
GET /api/v1/jobs/executions?status=IN_PROGRESS
GET /api/v1/jobs/executions?limit=20&offset=0
```

#### Get Job Execution Details
```bash
GET /api/v1/jobs/executions/:jobId
```

Response:
```json
{
  "job": {
    "job_id": "a1b2c3d4-...",
    "job_name": "Restart nginx",
    "status": "IN_PROGRESS",
    "total_devices": 5,
    "succeeded_devices": 3,
    "failed_devices": 1,
    "in_progress_devices": 1,
    "queued_at": "2025-10-17T18:00:00Z"
  },
  "device_statuses": [
    {
      "device_uuid": "8479359e-...",
      "device_name": "Device A",
      "status": "SUCCEEDED",
      "exit_code": 0,
      "stdout": "nginx restarted successfully",
      "completed_at": "2025-10-17T18:01:23Z"
    },
    {
      "device_uuid": "1234abcd-...",
      "device_name": "Device B",
      "status": "FAILED",
      "exit_code": 1,
      "stderr": "Permission denied",
      "failed_step": "Restart Service"
    }
  ]
}
```

#### Cancel Job
```bash
POST /api/v1/jobs/executions/:jobId/cancel
```

---

### Device-Specific Endpoints

#### Get Jobs for Device
```bash
GET /api/v1/devices/:uuid/jobs
GET /api/v1/devices/:uuid/jobs?status=QUEUED
GET /api/v1/devices/:uuid/jobs?limit=10
```

#### Get Next Pending Job (Polled by Device)
```bash
GET /api/v1/devices/:uuid/jobs/next
```

Response (if job available):
```json
{
  "jobId": "a1b2c3d4-...",
  "jobName": "Health check",
  "jobDocument": {
    "version": "1.0",
    "steps": [...]
  },
  "deviceUuid": "8479359e-...",
  "queuedAt": "2025-10-17T18:00:00Z"
}
```

Response (if no jobs):
```json
{
  "message": "No pending jobs"
}
```

#### Update Job Status (Reported by Device)
```bash
PATCH /api/v1/devices/:uuid/jobs/:jobId/status
Content-Type: application/json

{
  "status": "SUCCEEDED",
  "exit_code": 0,
  "stdout": "Job completed successfully\nAll steps executed",
  "executed_steps": 3
}
```

Or for failure:
```bash
PATCH /api/v1/devices/:uuid/jobs/:jobId/status
Content-Type: application/json

{
  "status": "FAILED",
  "exit_code": 1,
  "stderr": "Error: Permission denied",
  "reason": "Insufficient permissions to restart service",
  "executed_steps": 2,
  "failed_step": "Restart Service"
}
```

---

### Job Handlers

#### List Handlers
```bash
GET /api/v1/jobs/handlers
```

#### Create Handler
```bash
POST /api/v1/jobs/handlers
Content-Type: application/json

{
  "name": "backup-database",
  "description": "Backup PostgreSQL database",
  "script_type": "bash",
  "script_content": "#!/bin/bash\nDB_NAME=$2\npg_dump $DB_NAME > /backups/db-$(date +%Y%m%d).sql",
  "default_args": ["myapp"],
  "created_by": "admin"
}
```

---

## Device Agent Integration

### Current Agent Implementation

Your agent already has the Jobs feature at `agent/src/jobs/`. It uses MQTT topics from AWS IoT Jobs API. We need to adapt it to poll HTTP endpoints instead.

### Adapter Implementation

Create `agent/src/jobs/cloud-jobs-adapter.ts`:

```typescript
import axios from 'axios';
import { JobsFeature } from './jobs-feature';
import { JobDocument, JobStatus } from './types';

export class CloudJobsAdapter {
  private deviceUuid: string;
  private apiUrl: string;
  private pollIntervalMs: number;
  private jobsFeature: JobsFeature;
  private polling: boolean = false;

  constructor(deviceUuid: string, apiUrl: string, jobsFeature: JobsFeature) {
    this.deviceUuid = deviceUuid;
    this.apiUrl = apiUrl;
    this.jobsFeature = jobsFeature;
    this.pollIntervalMs = 30000; // Poll every 30 seconds
  }

  async start(): Promise<void> {
    this.polling = true;
    this.pollForJobs();
  }

  async stop(): Promise<void> {
    this.polling = false;
  }

  private async pollForJobs(): Promise<void> {
    while (this.polling) {
      try {
        // Get next pending job
        const response = await axios.get(
          `${this.apiUrl}/api/v1/devices/${this.deviceUuid}/jobs/next`
        );

        if (response.data.jobId) {
          const { jobId, jobDocument } = response.data;
          console.log(`[CloudJobs] Received job: ${jobId}`);

          // Execute job
          await this.executeJob(jobId, jobDocument);
        }
      } catch (error) {
        console.error('[CloudJobs] Error polling for jobs:', error);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  private async executeJob(jobId: string, jobDocument: JobDocument): Promise<void> {
    try {
      // Report job started
      await this.updateJobStatus(jobId, 'IN_PROGRESS');

      // Execute using existing JobEngine
      const result = await this.jobsFeature.executeJobDocument(jobDocument);

      // Report result
      await this.updateJobStatus(jobId, result.success ? 'SUCCEEDED' : 'FAILED', {
        exit_code: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        reason: result.reason,
        executed_steps: result.executedSteps,
        failed_step: result.failedStep
      });
    } catch (error: any) {
      console.error(`[CloudJobs] Job ${jobId} failed:`, error);
      await this.updateJobStatus(jobId, 'FAILED', {
        reason: error.message
      });
    }
  }

  private async updateJobStatus(
    jobId: string,
    status: string,
    details?: any
  ): Promise<void> {
    try {
      await axios.patch(
        `${this.apiUrl}/api/v1/devices/${this.deviceUuid}/jobs/${jobId}/status`,
        {
          status,
          ...details
        }
      );
      console.log(`[CloudJobs] Updated job ${jobId} status: ${status}`);
    } catch (error) {
      console.error(`[CloudJobs] Failed to update job status:`, error);
    }
  }
}
```

---

## Dashboard/Portal UI Implementation

### Job Templates Page

**Features**:
- List all job templates
- Filter by category
- Create new template with visual editor
- Edit/delete existing templates
- Test template on single device before deploying

**UI Components**:
```tsx
// Job Template Editor
<JobTemplateEditor>
  <FormInput label="Template Name" />
  <FormSelect label="Category" options={['system', 'maintenance', 'deployment']} />
  <JsonEditor label="Job Document" />
  <Button onClick={saveTemplate}>Save Template</Button>
  <Button onClick={testTemplate}>Test on Device</Button>
</JobTemplateEditor>
```

### Job Executions Page

**Features**:
- Execute job from template or custom
- Select target devices (individual, group, all)
- View real-time job status
- See per-device results
- Cancel running jobs

**UI Components**:
```tsx
// Job Execution Dashboard
<JobExecutionDashboard>
  <JobList>
    {jobs.map(job => (
      <JobCard>
        <JobName>{job.job_name}</JobName>
        <JobStatus status={job.status} />
        <DeviceProgress>
          {job.succeeded_devices}/{job.total_devices} succeeded
        </DeviceProgress>
        <Button onClick={() => viewDetails(job.job_id)}>Details</Button>
        {job.status === 'IN_PROGRESS' && (
          <Button onClick={() => cancelJob(job.job_id)}>Cancel</Button>
        )}
      </JobCard>
    ))}
  </JobList>
</JobExecutionDashboard>
```

### Device Jobs View

**Features**:
- View job history for specific device
- See current job execution
- View job output (stdout/stderr)
- Retry failed jobs

**UI Components**:
```tsx
// Device Jobs Table
<DeviceJobsTable deviceUuid={uuid}>
  <Table>
    <thead>
      <tr>
        <th>Job Name</th>
        <th>Status</th>
        <th>Started</th>
        <th>Duration</th>
        <th>Result</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {jobs.map(job => (
        <tr>
          <td>{job.job_name}</td>
          <td><StatusBadge status={job.status} /></td>
          <td>{formatDate(job.started_at)}</td>
          <td>{calculateDuration(job)}</td>
          <td>
            <Button onClick={() => viewOutput(job)}>View Output</Button>
          </td>
          <td>
            {job.status === 'FAILED' && (
              <Button onClick={() => retryJob(job)}>Retry</Button>
            )}
          </td>
        </tr>
      ))}
    </tbody>
  </Table>
</DeviceJobsTable>
```

---

## Complete Workflow Example

### 1. Create a Job Template (Admin Portal)

```bash
POST /api/v1/jobs/templates
{
  "name": "update-nginx-config",
  "category": "deployment",
  "job_document": {
    "version": "1.0",
    "includeStdOut": true,
    "steps": [
      {
        "name": "Backup current config",
        "type": "runCommand",
        "input": {
          "command": "cp,/etc/nginx/nginx.conf,/etc/nginx/nginx.conf.backup"
        }
      },
      {
        "name": "Download new config",
        "type": "runHandler",
        "input": {
          "handler": "download-file",
          "args": [
            "https://config.example.com/nginx.conf",
            "/etc/nginx/nginx.conf"
          ]
        }
      },
      {
        "name": "Test config",
        "type": "runCommand",
        "input": {
          "command": "nginx,-t"
        },
        "runAsUser": "root"
      },
      {
        "name": "Reload nginx",
        "type": "runCommand",
        "input": {
          "command": "systemctl,reload,nginx"
        },
        "runAsUser": "root"
      }
    ]
  }
}
```

### 2. Execute Job on Multiple Devices

```bash
POST /api/v1/jobs/execute
{
  "job_name": "Update nginx config - Production",
  "template_id": 1,
  "target_type": "group",
  "target_filter": {
    "device_type": "raspberry-pi",
    "environment": "production"
  },
  "created_by": "john@example.com"
}
```

Response:
```json
{
  "job": {
    "job_id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
    "job_name": "Update nginx config - Production",
    "status": "QUEUED",
    "total_devices": 12,
    "queued_at": "2025-10-17T18:30:00Z"
  },
  "message": "Job created and queued for 12 device(s)"
}
```

### 3. Device Polls for Job

Device agent runs every 30 seconds:

```bash
GET /api/v1/devices/8479359e-dbeb-4858-813c-e8a9008dde04/jobs/next
```

Response:
```json
{
  "jobId": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "jobName": "Update nginx config - Production",
  "jobDocument": {
    "version": "1.0",
    "steps": [...]
  },
  "queuedAt": "2025-10-17T18:30:00Z"
}
```

### 4. Device Executes Job

Agent's `JobEngine` executes the job document step by step.

### 5. Device Reports Progress

```bash
PATCH /api/v1/devices/8479359e-dbeb-4858-813c-e8a9008dde04/jobs/a1b2c3d4.../status
{
  "status": "IN_PROGRESS",
  "executed_steps": 2,
  "stdout": "Config backed up\nNew config downloaded"
}
```

### 6. Device Reports Completion

```bash
PATCH /api/v1/devices/8479359e-dbeb-4858-813c-e8a9008dde04/jobs/a1b2c3d4.../status
{
  "status": "SUCCEEDED",
  "exit_code": 0,
  "executed_steps": 4,
  "stdout": "All steps completed successfully\nnginx reloaded"
}
```

### 7. View Results in Portal

```bash
GET /api/v1/jobs/executions/a1b2c3d4-5678-90ab-cdef-1234567890ab
```

Response shows 12/12 devices succeeded, job complete.

---

## Integration Checklist

- [ ] **Database**: Run migration `011_add_device_jobs.sql`
- [ ] **API**: Add routes from `device-jobs.ts` to Express app
- [ ] **Agent**: Implement `CloudJobsAdapter` for HTTP polling
- [ ] **Agent**: Add polling to supervisor startup
- [ ] **Portal**: Create Jobs templates page
- [ ] **Portal**: Create Job executions dashboard
- [ ] **Portal**: Add Jobs tab to device detail page
- [ ] **Testing**: Test single device job execution
- [ ] **Testing**: Test multi-device job execution
- [ ] **Testing**: Test job cancellation
- [ ] **Testing**: Test error handling and retries

---

## Benefits Over MQTT-Only Approach

1. **Simpler Architecture**: HTTP polling instead of MQTT topics
2. **Database-Backed**: Full audit trail and historical data
3. **Portal Integration**: Easy to build admin UI
4. **Flexible Targeting**: Device, group, or broadcast jobs
5. **Progress Tracking**: Real-time status updates per device
6. **Template Reuse**: Create once, execute many times
7. **Scalable**: PostgreSQL handles millions of job records

---

## Next Steps

See `DEVICE-JOBS-IMPLEMENTATION.md` for step-by-step integration guide.
