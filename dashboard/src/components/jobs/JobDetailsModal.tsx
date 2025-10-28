import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

interface JobDetailsModalProps {
  open: boolean;
  onClose: () => void;
  job: {
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
  } | null;
}

export const JobDetailsModal: React.FC<JobDetailsModalProps> = ({ open, onClose, job }) => {
  if (!job) return null;

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
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Job Details: {job.job_name}
            {getStatusBadge(job.status)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Basic Information */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Job ID</label>
              <p className="text-sm text-gray-900 font-mono truncate">{job.job_id}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Template ID</label>
              <p className="text-sm text-gray-900">{job.template_id || 'N/A'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Execution Type</label>
              <p className="text-sm text-gray-900 capitalize">{job.execution_type}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Exit Code</label>
              <p className="text-sm text-gray-900">{job.exit_code !== null ? job.exit_code : 'N/A'}</p>
            </div>
          </div>

          {/* Timestamps */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Timeline</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Queued At:</span>
                <span className="text-sm text-gray-900">{formatDate(job.queued_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Started At:</span>
                <span className="text-sm text-gray-900">{formatDate(job.started_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Completed At:</span>
                <span className="text-sm text-gray-900">{formatDate(job.completed_at)}</span>
              </div>
            </div>
          </div>

          {/* Target Devices */}
          {job.target_devices && job.target_devices.length > 0 && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Target Devices</h4>
              <div className="bg-gray-50 rounded p-2">
                {job.target_devices.map((deviceId, index) => (
                  <p key={index} className="text-xs font-mono text-gray-700">{deviceId}</p>
                ))}
              </div>
            </div>
          )}

          {/* Reason (if failed) */}
          {job.reason && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Reason</h4>
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <p className="text-sm text-red-700">{job.reason}</p>
              </div>
            </div>
          )}

          {/* Job Document */}
          {job.job_document && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Job Document</h4>
              <div className="bg-gray-900 rounded p-4 overflow-x-auto">
                <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
                  {JSON.stringify(job.job_document, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default JobDetailsModal;
