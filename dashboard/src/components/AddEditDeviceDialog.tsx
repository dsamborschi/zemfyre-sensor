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
import { toast } from "sonner@2.0.3";
import { Device } from "./DeviceSidebar";

interface AddEditDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device?: Device | null;
  onSave: (device: Omit<Device, "id"> & { id?: string }) => void;
}

const deviceGroups = [
  { value: "server", label: "Server" },
  { value: "desktop", label: "Desktop" },
  { value: "laptop", label: "Laptop" },
  { value: "mobile", label: "Mobile Device" },
];

// Helper function to generate provisioning key
const generateProvisioningKey = () => {
  return `PROV-${Math.random().toString(36).substring(2, 15).toUpperCase()}-${Math.random().toString(36).substring(2, 15).toUpperCase()}`;
};

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
  const [provisioningKey, setProvisioningKey] = useState(generateProvisioningKey());
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
      // Generate new provisioning key when opening for new device
      setProvisioningKey(generateProvisioningKey());
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
      lastSeen: formData.lastSeen,
      status: formData.status,
      cpu: formData.cpu,
      memory: formData.memory,
      disk: formData.disk,
    });

    toast.success(isEditMode ? "Device updated successfully" : "Device added successfully");
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

  const regenerateProvisioningKey = () => {
    setProvisioningKey(generateProvisioningKey());
    toast.success("New provisioning key generated");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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

          <div className="space-y-2">
            <Label htmlFor="last-seen">Last Seen</Label>
            <Input
              id="last-seen"
              value={formData.lastSeen}
              onChange={(e) => setFormData({ ...formData, lastSeen: e.target.value })}
              disabled={!isEditMode}
              className={!isEditMode ? "bg-gray-50" : ""}
            />
            <p className="text-gray-600">
              {isEditMode ? "Update when the device was last active" : "Will be set automatically when device connects"}
            </p>
          </div>

          {!isEditMode && (
            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <Label htmlFor="provisioning-key">Provisioning Key</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="provisioning-key"
                      value={provisioningKey}
                      readOnly
                      className="font-mono pr-20"
                    />
                    <div className="absolute top-1/2 -translate-y-1/2 right-2 flex gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={copyProvisioningKey}
                      >
                        {copiedKey ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={regenerateProvisioningKey}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <p className="text-gray-600">
                  Use this key during device provisioning. You can regenerate it if needed.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="install-command">Install Command</Label>
                <div className="relative">
                  <Textarea
                    id="install-command"
                    value={installCommand}
                    readOnly
                    rows={2}
                    className="font-mono text-sm bg-gray-900 text-green-400 pr-12 resize-none"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="absolute top-2 right-2 text-green-400 hover:text-green-300 hover:bg-gray-800"
                    onClick={copyInstallCommand}
                  >
                    {copiedCommand ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-gray-600">
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
