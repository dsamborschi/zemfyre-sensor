import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { buildApiUrl } from '@/config/api';

interface JobTemplate {
  id: number;
  name: string;
  description: string;
  category: string;
}

interface AddJobModalProps {
  open: boolean;
  onClose: () => void;
  deviceUuid: string;
  onJobAdded: () => void;
}

export const AddJobModal: React.FC<AddJobModalProps> = ({
  open,
  onClose,
  deviceUuid,
  onJobAdded,
}) => {
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>('');
  const [executeTime, setExecuteTime] = useState<'now' | 'schedule'>('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  useEffect(() => {
    if (!open) return;

    const fetchTemplates = async () => {
      setLoadingTemplates(true);
      try {
        const response = await fetch(buildApiUrl('/api/v1/jobs/templates?active=true'));
        
        if (!response.ok) {
          throw new Error('Failed to fetch job templates');
        }
        
        const data = await response.json();
        setTemplates(data.templates || []);
      } catch (err) {
        console.error('Error fetching templates:', err);
        setError('Failed to load job templates');
      } finally {
        setLoadingTemplates(false);
      }
    };

    fetchTemplates();
    
    // Reset form when modal opens
    setTemplateId('');
    setExecuteTime('now');
    setScheduledFor('');
    setError('');
  }, [open]);

  const handleSave = async () => {
    if (!templateId) {
      setError('Please select a job template');
      return;
    }

    if (executeTime === 'schedule' && !scheduledFor) {
      setError('Please select a scheduled time');
      return;
    }

    setSaving(true);
    setError('');

    try {
      // Find the selected template
      const selectedTemplate = templates.find((t) => t.id === parseInt(templateId));
      if (!selectedTemplate) {
        throw new Error('Selected template not found');
      }

      const response = await fetch(buildApiUrl('/api/v1/jobs/execute'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_name: selectedTemplate.name,
          template_id: parseInt(templateId),
          target_type: 'device',
          target_devices: [deviceUuid],
          execution_type: executeTime === 'now' ? 'oneTime' : 'oneTime',
          schedule: executeTime === 'schedule' ? { scheduled_at: scheduledFor } : undefined,
          created_by: 'dashboard-user',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create job');
      }

      onJobAdded();
      onClose();
    } catch (err) {
      console.error('Error creating job:', err);
      setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Job</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Job Template Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Job Template *
            </label>
            {loadingTemplates ? (
              <div className="text-sm text-gray-500">Loading templates...</div>
            ) : (
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                disabled={saving}
              >
                <option value="">Select a template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} {template.description && `— ${template.description}`}
                  </option>
                ))}
              </select>
            )}
            {templateId && templates.find((t) => t.id === parseInt(templateId))?.description && (
              <p className="mt-1 text-xs text-gray-500">
                {templates.find((t) => t.id === parseInt(templateId))?.description}
              </p>
            )}
          </div>

          {/* Execution Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Execution Time *
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="executeTime"
                  value="now"
                  checked={executeTime === 'now'}
                  onChange={() => setExecuteTime('now')}
                  disabled={saving}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Execute Now</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="executeTime"
                  value="schedule"
                  checked={executeTime === 'schedule'}
                  onChange={() => setExecuteTime('schedule')}
                  disabled={saving}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Schedule</span>
              </label>
            </div>
            {executeTime === 'schedule' && (
              <input
                type="datetime-local"
                className="mt-3 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                disabled={saving}
                min={new Date().toISOString().slice(0, 16)}
              />
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !templateId || loadingTemplates}>
            {saving ? 'Creating...' : 'Create Job'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddJobModal;
