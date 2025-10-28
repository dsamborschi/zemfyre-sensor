import React, { useEffect, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Plus, RefreshCw, Trash2, XCircle, Eye } from 'lucide-react';
import { buildApiUrl } from '@/config/api';
import AddJobModal from './jobs/AddJobModal';
import JobDetailsModal from './jobs/JobDetailsModal';

interface Job {
  id: number;
  job_id: string;
  job_name: string;
  status: string;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  execution_type: string;
  exit_code: number | null;
  reason: string | null;
  job_document?: any;
  template_id?: number;
  target_type?: string;
  target_devices?: string[];
}

interface JobsCardProps {
  deviceUuid: string;
}

export const JobsCard: React.FC<JobsCardProps> = ({ deviceUuid }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [cancelingJobId, setCancelingJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const fetchJobs = async () => {
    if (!deviceUuid) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(buildApiUrl(`/api/v1/devices/${deviceUuid}/jobs?limit=10`));
      
      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }
      
      const data = await response.json();
      setJobs(data.jobs || []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
      return;
    }

    setDeletingJobId(jobId);
    try {
      const response = await fetch(buildApiUrl(`/api/v1/jobs/${jobId}`), {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete job');
      }

      // Refresh the jobs list
      await fetchJobs();
    } catch (err) {
      console.error('Error deleting job:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete job');
    } finally {
      setDeletingJobId(null);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to cancel this job?')) {
      return;
    }

    setCancelingJobId(jobId);
    try {
      const response = await fetch(buildApiUrl(`/api/v1/jobs/${jobId}/cancel`), {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to cancel job');
      }

      // Refresh the jobs list
      await fetchJobs();
    } catch (err) {
      console.error('Error canceling job:', err);
      alert(err instanceof Error ? err.message : 'Failed to cancel job');
    } finally {
      setCancelingJobId(null);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [deviceUuid]);

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; label: string }> = {
      QUEUED: { color: 'bg-gray-100 text-gray-700 border-gray-300', label: 'Queued' },
      IN_PROGRESS: { color: 'bg-blue-100 text-blue-700 border-blue-300', label: 'In Progress' },
      SUCCEEDED: { color: 'bg-green-100 text-green-700 border-green-300', label: 'Succeeded' },
      FAILED: { color: 'bg-red-100 text-red-700 border-red-300', label: 'Failed' },
      TIMED_OUT: { color: 'bg-orange-100 text-orange-700 border-orange-300', label: 'Timed Out' },
      CANCELED: { color: 'bg-gray-100 text-gray-600 border-gray-300', label: 'Canceled' },
      REJECTED: { color: 'bg-red-100 text-red-600 border-red-300', label: 'Rejected' },
    };

    const config = statusConfig[status] || statusConfig.QUEUED;

    return (
      <Badge variant="outline" className={`${config.color} text-xs px-2 py-0.5`}>
        {config.label}
      </Badge>
    );
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const handleJobAdded = () => {
    setShowModal(false);
    fetchJobs(); // Refresh the list
  };

  const handleViewJob = (job: Job) => {
    setSelectedJob(job);
    setShowDetailsModal(true);
  };

  return (
    <>
      <Card className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg text-gray-900 font-medium mb-1">Jobs</h3>
            <p className="text-sm text-gray-600">
              Job executions on this device
              {lastRefresh && (
                <span className="text-xs text-gray-400 ml-2">
                  • Last updated {lastRefresh.toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchJobs}
              disabled={loading}
              title="Refresh jobs"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowModal(true)}
            >
              <Plus className="w-4 h-4 mr-1" /> Add Job
            </Button>
          </div>
        </div>

        {loading && jobs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">Loading jobs...</div>
        ) : error ? (
          <div className="text-center py-8 text-red-600">{error}</div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No jobs found. Click "Add Job" to create one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-0 font-medium text-gray-600">Job Name</th>
                  <th className="text-left py-2 px-4 font-medium text-gray-600">Status</th>
                  <th className="text-left py-2 px-4 font-medium text-gray-600 hidden md:table-cell">
                    Execution Type
                  </th>
                  <th className="text-left py-2 px-4 font-medium text-gray-600">Date</th>
                  <th className="text-right py-2 px-4 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="py-3 px-0 text-gray-900">
                      <div className="font-medium">{job.job_name}</div>
                      {job.reason && (
                        <div className="text-xs text-gray-500 mt-0.5 truncate max-w-[200px]">
                          {job.reason}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">{getStatusBadge(job.status)}</td>
                    <td className="py-3 px-4 text-gray-600 hidden md:table-cell capitalize">
                      {job.execution_type}
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {formatDate(job.completed_at || job.started_at || job.queued_at)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* View button - always visible */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewJob(job)}
                          className="text-blue-600 hover:text-blue-700 border-blue-300 hover:bg-blue-50 w-20"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        
                        {/* Cancel button - only for QUEUED jobs */}
                        {job.status === 'QUEUED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancelJob(job.job_id)}
                            disabled={cancelingJobId === job.job_id}
                            className="text-orange-600 hover:text-orange-700 border-orange-300 hover:bg-orange-50 w-20"
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Cancel
                          </Button>
                        )}
                        
                        {/* Delete button - for all completed states */}
                        {['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELED', 'REJECTED', 'QUEUED'].includes(job.status) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteJob(job.job_id)}
                            disabled={deletingJobId === job.job_id}
                            className="text-red-600 hover:text-red-700 border-red-300 hover:bg-red-50 w-20"
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AddJobModal
        open={showModal}
        onClose={() => setShowModal(false)}
        deviceUuid={deviceUuid}
        onJobAdded={handleJobAdded}
      />

      <JobDetailsModal
        open={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        job={selectedJob}
      />
    </>
  );
};

export default JobsCard;
