import { useState, useEffect } from "react";
import { Copy, Check, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "sonner";
import { Device } from "./DeviceSidebar";
import { buildApiUrl } from "../config/api";

interface AddEditDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device?: Device | null;
  onSave: (device: Omit<Device, "id"> & { id?: string; provisioningKeyId?: string }) => void;
}

const deviceGroups = [
  { value: "server", label: "Server" },
  { value: "desktop", label: "Desktop" },
  { value: "laptop", label: "Laptop" },
  { value: "mobile", label: "Mobile Device" },
];

// Helper function to generate UUID v4
const generateUuid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export function AddEditDeviceDialog({
  open,
  onOpenChange,
  device,
  onSave,
}: AddEditDeviceDialogProps) {
  const isEditMode = !!device;
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [provisioningKey, setProvisioningKey] = useState("");
  const [provisioningKeyId, setProvisioningKeyId] = useState<string | null>(null);
  const [isLoadingKey, setIsLoadingKey] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "server" as "desktop" | "laptop" | "mobile" | "server",
    description: "",
    ipAddress: "",
    macAddress: "",
    lastSeen: "Never",
    status: "offline" as "online" | "offline" | "warning",
    cpu: 0,
    memory: 0,
    disk: 0,
  });

  // Install command
  const installCommand = `bash <(curl -H 'Cache-Control: no-cache' -sL --proto '=https' https://apps.iotistic.ca/install-agent)`;

  // Fetch provisioning key from API
  const fetchProvisioningKey = async (isRegenerate = false) => {
    setIsLoadingKey(true);
    try {
      const response = await fetch(buildApiUrl('/api/v1/provisioning-keys/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fleetId: 'default-fleet',
          newKey: isRegenerate,
          previousKeyId: isRegenerate ? provisioningKeyId : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate provisioning key');
      }

      const data = await response.json();
      setProvisioningKey(data.key);
      setProvisioningKeyId(data.id);
      
      if (isRegenerate) {
        toast.success("New provisioning key generated and old key invalidated");
      }
    } catch (error: any) {
      console.error('Error generating provisioning key:', error);
      toast.error(error.message || 'Failed to generate provisioning key');
    } finally {
      setIsLoadingKey(false);
    }
  };

  useEffect(() => {
    if (device) {
      setFormData({
        name: device.name,
        type: device.type,
        description: "",
        ipAddress: device.ipAddress,
        macAddress: "00:1B:44:11:3A:B7", // Default, would come from device in real scenario
        lastSeen: device.lastSeen,
        status: device.status,
        cpu: device.cpu,
        memory: device.memory,
        disk: device.disk,
      });
    } else {
      setFormData({
        name: "",
        type: "server",
        description: "",
        ipAddress: "",
        macAddress: "",
        lastSeen: "Never",
        status: "offline",
        cpu: 0,
        memory: 0,
        disk: 0,
      });
      // Generate new provisioning key from API when opening for new device
      if (open && !provisioningKey) {
        fetchProvisioningKey(false);
      }
    }
  }, [device, open]);

  const handleSave = () => {
    if (!formData.name || !formData.ipAddress || !formData.macAddress) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Validate IP address format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(formData.ipAddress)) {
      toast.error("Please enter a valid IP address");
      return;
    }

    // Validate MAC address format
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    if (!macRegex.test(formData.macAddress)) {
      toast.error("Please enter a valid MAC address (e.g., 00:1B:44:11:3A:B7)");
      return;
    }

    onSave({
      ...(device?.id ? { id: device.id } : {}),
      deviceUuid: device?.deviceUuid || generateUuid(),
      name: formData.name,
      type: formData.type,
      ipAddress: formData.ipAddress,
      macAddress: formData.macAddress,
      lastSeen: formData.lastSeen,
      status: formData.status,
      cpu: formData.cpu,
      memory: formData.memory,
      disk: formData.disk,
    });

    // Note: Don't show success toast here - let the parent handle it since it's async now
    onOpenChange(false);
  };

  const copyInstallCommand = () => {
    navigator.clipboard.writeText(installCommand);
    setCopiedCommand(true);
    toast.success("Install command copied to clipboard");
    setTimeout(() => setCopiedCommand(false), 2000);
  };

  const copyProvisioningKey = () => {
    navigator.clipboard.writeText(provisioningKey);
    setCopiedKey(true);
    toast.success("Provisioning key copied to clipboard");
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const regenerateProvisioningKey = async () => {
    await fetchProvisioningKey(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Device" : "Add New Device"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update device information and settings"
              : "Configure a new device to add to your management dashboard"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="device-group">Device Group *</Label>
              <Select
                value={formData.type}
                onValueChange={(value: any) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger id="device-group">
                  <SelectValue placeholder="Select device type" />
                </SelectTrigger>
                <SelectContent>
                  {deviceGroups.map((group) => (
                    <SelectItem key={group.value} value={group.value}>
                      {group.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="device-name">Device Name *</Label>
              <Input
                id="device-name"
                placeholder="Production Server 01"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Enter device description (optional)"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>
          {isEditMode && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ip-address">IP Address *</Label>
              <Input
                id="ip-address"
                placeholder="192.168.1.10"
                value={formData.ipAddress}
                onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mac-address">MAC Address *</Label>
              <Input
                id="mac-address"
                placeholder="00:1B:44:11:3A:B7"
                value={formData.macAddress}
                onChange={(e) => setFormData({ ...formData, macAddress: e.target.value })}
              />
            </div>
          </div>
          )}
    

          {!isEditMode && (
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <div className="space-y-2">
                <Label htmlFor="provisioning-key" className="text-sm font-semibold text-gray-900">Provisioning Key</Label>
                <div className="relative">
                  <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-md px-3 py-2.5">
                    <code className="flex-1 font-mono text-xs text-gray-900 select-all break-all leading-relaxed">
                      {isLoadingKey ? "Generating..." : (provisioningKey || "Loading...")}
                    </code>
                    <div className="flex gap-1 ml-2 flex-shrink-0">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 hover:bg-gray-200"
                        onClick={copyProvisioningKey}
                        disabled={isLoadingKey || !provisioningKey}
                      >
                        {copiedKey ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-600" />}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 hover:bg-gray-200"
                        onClick={regenerateProvisioningKey}
                        disabled={isLoadingKey}
                      >
                        <RefreshCw className={`w-4 h-4 text-gray-600 ${isLoadingKey ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Use this key during device provisioning. You can regenerate it if needed.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="install-command" className="text-sm font-semibold text-gray-900">Install Command</Label>
                <div className="relative bg-black border border-gray-700 rounded-md px-4 py-3" style={{ backgroundColor: '#0d1117' }}>
                  <code className="block font-mono text-sm whitespace-pre-wrap break-all select-all pr-10" style={{ color: '#00ff41' }}>
                    {installCommand}
                  </code>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="absolute top-2 right-2 h-8 w-8 hover:bg-gray-800/50"
                    style={{ color: '#00ff41' }}
                    onClick={copyInstallCommand}
                  >
                    {copiedCommand ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Run this command on the device to install the agent and connect it to Iotistic
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            {isEditMode ? "Update Device" : "Add Device"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
