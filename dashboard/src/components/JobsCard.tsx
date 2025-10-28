import React, { useEffect, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Plus, RefreshCw } from 'lucide-react';
import { buildApiUrl } from '@/config/api';
import { AddJobModal } from './jobs/AddJobModal';

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
}

interface JobsCardProps {
  deviceUuid: string;
}

export const JobsCard: React.FC<JobsCardProps> = ({ deviceUuid }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
      setJobs([]);
    } finally {
      setLoading(false);
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

  return (
    <>
      <Card className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg text-gray-900 font-medium mb-1">Jobs</h3>
            <p className="text-sm text-gray-600">Job executions on this device</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchJobs}
              disabled={loading}
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
    </>
  );
};

export default JobsCard;
