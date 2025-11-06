import { useState, useEffect } from 'react';
import { Tag, Plus, Edit2, Trash2, Check, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  getTagDefinitions,
  createTagDefinition,
  updateTagDefinition,
  deleteTagDefinition,
  type TagDefinition
} from '@/services/deviceTags';

export default function TagDefinitionsPage() {
  const [definitions, setDefinitions] = useState<TagDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState<TagDefinition | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [formKey, setFormKey] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAllowedValues, setFormAllowedValues] = useState('');
  const [formIsRequired, setFormIsRequired] = useState(false);
  
  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<TagDefinition | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadDefinitions();
  }, []);

  const loadDefinitions = async () => {
    setLoading(true);
    setError(null);
    try {
      const defs = await getTagDefinitions();
      setDefinitions(defs);
    } catch (err: any) {
      console.error('Error loading tag definitions:', err);
      setError(err.message || 'Failed to load tag definitions');
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingDefinition(null);
    setFormKey('');
    setFormDescription('');
    setFormAllowedValues('');
    setFormIsRequired(false);
    setIsDialogOpen(true);
  };

  const openEditDialog = (definition: TagDefinition) => {
    setEditingDefinition(definition);
    setFormKey(definition.key);
    setFormDescription(definition.description || '');
    setFormAllowedValues(definition.allowedValues?.join(', ') || '');
    setFormIsRequired(definition.isRequired);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formKey.trim()) {
      toast.error('Tag key is required');
      return;
    }

    // Validate key format
    const keyRegex = /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/;
    if (!keyRegex.test(formKey)) {
      toast.error('Tag key must be lowercase alphanumeric with dashes/underscores');
      return;
    }

    setSaving(true);
    try {
      const allowedValues = formAllowedValues
        ? formAllowedValues.split(',').map(v => v.trim()).filter(v => v.length > 0)
        : undefined;

      if (editingDefinition) {
        // Update existing
        await updateTagDefinition(
          formKey,
          formDescription || undefined,
          allowedValues,
          formIsRequired
        );
        toast.success('Tag definition updated successfully');
      } else {
        // Create new
        await createTagDefinition(
          formKey,
          formDescription || undefined,
          allowedValues,
          formIsRequired
        );
        toast.success('Tag definition created successfully');
      }

      setIsDialogOpen(false);
      loadDefinitions();
    } catch (err: any) {
      console.error('Error saving tag definition:', err);
      toast.error(err.message || 'Failed to save tag definition');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (definition: TagDefinition) => {
    setDeleting(true);
    try {
      await deleteTagDefinition(definition.key);
      toast.success('Tag definition deleted successfully');
      setDeleteConfirm(null);
      loadDefinitions();
    } catch (err: any) {
      console.error('Error deleting tag definition:', err);
      toast.error(err.message || 'Failed to delete tag definition');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 bg-background overflow-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-background overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Tag className="w-8 h-8" />
              Tag Definitions
            </h1>
            <p className="text-muted-foreground mt-1">
              Define allowed tag keys and their constraints
            </p>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Add Tag Definition
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Defined Tag Keys</CardTitle>
            <CardDescription>
              Tag keys that can be used across all devices
            </CardDescription>
          </CardHeader>
          <CardContent>
            {definitions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Tag className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">No tag definitions yet</p>
                <p className="text-sm">Create your first tag definition to get started</p>
              </div>
            ) : (
              <div className="space-y-4">
                {definitions.map((def) => (
                  <div
                    key={def.id}
                    className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <code className="text-sm font-mono font-medium bg-muted px-2 py-1 rounded">
                          {def.key}
                        </code>
                        {def.isRequired && (
                          <Badge variant="default" className="text-xs">
                            Required
                          </Badge>
                        )}
                      </div>
                      {def.description && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {def.description}
                        </p>
                      )}
                      {def.allowedValues && def.allowedValues.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          <span className="text-xs text-muted-foreground mr-2">Allowed values:</span>
                          {def.allowedValues.map((value) => (
                            <Badge key={value} variant="outline" className="text-xs">
                              {value}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(def)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirm(def)}
                        className="hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Note:</strong> Once a tag key is defined, users will only be able to select from
            predefined keys when tagging devices. This ensures consistency across your device fleet.
          </AlertDescription>
        </Alert>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingDefinition ? 'Edit Tag Definition' : 'Create Tag Definition'}
            </DialogTitle>
            <DialogDescription>
              Define a tag key that can be used across all devices
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="key">Tag Key *</Label>
              <Input
                id="key"
                placeholder="e.g., environment"
                value={formKey}
                onChange={(e) => setFormKey(e.target.value.toLowerCase())}
                disabled={!!editingDefinition || saving}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Lowercase alphanumeric with dashes/underscores
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="e.g., Deployment environment for this device"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                disabled={saving}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="allowedValues">Allowed Values (optional)</Label>
              <Input
                id="allowedValues"
                placeholder="e.g., development, staging, production"
                value={formAllowedValues}
                onChange={(e) => setFormAllowedValues(e.target.value)}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list. Leave empty to allow any value.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isRequired"
                checked={formIsRequired}
                onChange={(e) => setFormIsRequired(e.target.checked)}
                disabled={saving}
                className="w-4 h-4 rounded border-gray-300"
              />
              <Label htmlFor="isRequired" className="cursor-pointer">
                Required tag (all devices must have this tag)
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formKey.trim()}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  {editingDefinition ? 'Update' : 'Create'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Tag Definition</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the tag definition <strong>{deleteConfirm?.key}</strong>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
