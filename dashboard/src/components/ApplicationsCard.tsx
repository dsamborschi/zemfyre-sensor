import { useState } from "react";
import { Plus, CheckCircle2, XCircle, Clock, Play, Square, MoreVertical, Pen, RefreshCw, Trash2 } from "lucide-react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";

// Popular Docker images sorted alphabetically
const popularDockerImages = [
  { value: "nginx:latest", label: "nginx:latest - Web server" },
  { value: "nginx:alpine", label: "nginx:alpine - Lightweight web server" },
  { value: "postgres:16", label: "postgres:16 - PostgreSQL database" },
  { value: "postgres:14", label: "postgres:14 - PostgreSQL 14" },
  { value: "mysql:8", label: "mysql:8 - MySQL database" },
  { value: "redis:latest", label: "redis:latest - Redis cache" },
  { value: "redis:alpine", label: "redis:alpine - Lightweight Redis" },
  { value: "mongo:7", label: "mongo:7 - MongoDB database" },
  { value: "mongo:6", label: "mongo:6 - MongoDB 6" },
  { value: "node:20", label: "node:20 - Node.js runtime" },
  { value: "node:18-alpine", label: "node:18-alpine - Lightweight Node.js" },
  { value: "python:3.12", label: "python:3.12 - Python runtime" },
  { value: "python:3.11-slim", label: "python:3.11-slim - Lightweight Python" },
  { value: "traefik:latest", label: "traefik:latest - Reverse proxy" },
  { value: "caddy:latest", label: "caddy:latest - Web server with HTTPS" },
  { value: "rabbitmq:3-management", label: "rabbitmq:3-management - Message broker" },
  { value: "elasticsearch:8.11.0", label: "elasticsearch:8.11.0 - Search engine" },
  { value: "grafana/grafana:latest", label: "grafana/grafana:latest - Analytics" },
  { value: "prom/prometheus:latest", label: "prom/prometheus:latest - Monitoring" },
  { value: "jenkins/jenkins:lts", label: "jenkins/jenkins:lts - CI/CD" },
];

export interface Service {
  serviceId: number;
  serviceName: string;
  imageName: string;
  appId: number;
  appName: string;
  config: {
    image: string;
    ports?: string[];
    environment?: Record<string, string>;
    volumes?: string[];
    labels?: Record<string, string>;
    [key: string]: any;
  };
  status?: "running" | "stopped" | "syncing";
  uptime?: string;
}

export interface Application {
  id: string;
  appId: number;
  appName: string;
  name: string; // Alias for appName for backward compatibility
  image: string;
  status: "running" | "stopped" | "syncing";
  syncStatus: "synced" | "syncing" | "error" | "pending";
  port?: string;
  uptime?: string;
  services: Service[];
}

interface ApplicationsCardProps {
  deviceId: string;
  applications: Application[];
  onAddApplication: (app: Omit<Application, "id">) => void;
  onUpdateApplication?: (app: Application) => void;
  onRemoveApplication: (appId: string) => void;
  onToggleStatus: (appId: string) => void;
  onToggleServiceStatus?: (appId: string, serviceId: number, action: "start" | "stop") => void;
}

const statusColors = {
  running: "bg-green-100 text-green-700 border-green-200",
  stopped: "bg-gray-100 text-gray-700 border-gray-200",
  syncing: "bg-blue-100 text-blue-700 border-blue-200",
};

const syncStatusColors = {
  synced: "bg-green-100 text-green-700 border-green-200",
  syncing: "bg-blue-100 text-blue-700 border-blue-200",
  error: "bg-red-100 text-red-700 border-red-200",
  pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
};

const syncStatusIcons = {
  synced: CheckCircle2,
  syncing: Clock,
  error: XCircle,
  pending: Clock,
};

export function ApplicationsCard({
  deviceId,
  applications,
  onAddApplication,
  onUpdateApplication = () => {},
  onRemoveApplication,
  onToggleStatus,
  onToggleServiceStatus = () => {},
}: ApplicationsCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [newApp, setNewApp] = useState({
    appId: "",
    appName: "",
  });

  // Service modal state
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteAppConfirmOpen, setDeleteAppConfirmOpen] = useState(false);
  const [appToDelete, setAppToDelete] = useState<Application | null>(null);
  const [useCustomImage, setUseCustomImage] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [selectedAppForService, setSelectedAppForService] = useState<Application | null>(null);
  const [newService, setNewService] = useState({
    serviceId: "",
    serviceName: "",
    imageName: "",
    ports: "",
    environment: "",
    volumes: "",
    labels: "",
  });

  const handleAddApplication = () => {
    if (!newApp.appName) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (editingApp) {
      // Update existing application
      const updatedApp = {
        ...editingApp,
        appName: newApp.appName,
        name: newApp.appName, // For backward compatibility
      };
      onUpdateApplication(updatedApp);
      toast.success("Application updated successfully");
    } else {
      // Generate a random app ID (4-digit number between 1000-9999)
      const randomAppId = Math.floor(1000 + Math.random() * 9000);

      onAddApplication({
        appId: randomAppId,
        appName: newApp.appName,
        name: newApp.appName, // For backward compatibility
        image: "", // Placeholder, actual images are defined in services
        status: "stopped",
        syncStatus: "pending",
        services: [], // Services will be added separately
        uptime: "0m",
      });
      toast.success("Application added successfully");
    }

    setNewApp({ appId: "", appName: "" });
    setEditingApp(null);
    setDialogOpen(false);
  };

  const openEditAppModal = (app: Application) => {
    setEditingApp(app);
    setNewApp({
      appId: app.appId.toString(),
      appName: app.appName,
    });
    setDialogOpen(true);
  };

  const openAddAppModal = () => {
    setEditingApp(null);
    setNewApp({ appId: "", appName: "" });
    setDialogOpen(true);
  };

  const openServiceModal = (app: Application, service?: Service) => {
    setSelectedAppForService(app);
    if (service) {
      setEditingService(service);
      setNewService({
        serviceId: service.serviceId.toString(),
        serviceName: service.serviceName,
        imageName: service.imageName,
        ports: service.config.ports?.join("\n") || "",
        environment: JSON.stringify(service.config.environment || {}, null, 2),
        volumes: service.config.volumes?.join("\n") || "",
        labels: JSON.stringify(service.config.labels || {}, null, 2),
      });
    } else {
      setEditingService(null);
      setNewService({
        serviceId: "",
        serviceName: "",
        imageName: "",
        ports: "",
        environment: "",
        volumes: "",
        labels: "",
      });
    }
    setServiceDialogOpen(true);
  };

  const handleSaveService = () => {
    // Validate required fields
    if (!selectedAppForService) {
      toast.error("No application selected");
      return;
    }
    
    if (!newService.serviceName) {
      toast.error("Service name is required");
      return;
    }
    
    if (!newService.imageName) {
      toast.error("Docker image is required");
      return;
    }

    try {
      const updatedApp = { ...selectedAppForService };
      
      // Auto-generate service ID if not editing
      const serviceId = editingService 
        ? editingService.serviceId 
        : (updatedApp.services.length > 0 
            ? Math.max(...updatedApp.services.map(s => s.serviceId)) + 1 
            : 1);
      
      const newServiceObj: Service = {
        serviceId: serviceId,
        serviceName: newService.serviceName,
        imageName: newService.imageName,
        appId: selectedAppForService.appId,
        appName: selectedAppForService.appName,
        config: {
          image: newService.imageName,
          ports: newService.ports ? newService.ports.split("\n").filter(p => p.trim()) : [],
          environment: newService.environment ? JSON.parse(newService.environment) : {},
          volumes: newService.volumes ? newService.volumes.split("\n").filter(v => v.trim()) : [],
          labels: newService.labels ? JSON.parse(newService.labels) : {},
        },
        status: "stopped",
        uptime: "0m",
      };

      if (editingService) {
        // Edit existing service
        const serviceIndex = updatedApp.services.findIndex(s => s.serviceId === editingService.serviceId);
        if (serviceIndex !== -1) {
          updatedApp.services[serviceIndex] = newServiceObj;
        }
      } else {
        // Add new service
        updatedApp.services.push(newServiceObj);
      }

      // Sort services alphabetically by serviceName
      updatedApp.services.sort((a, b) => a.serviceName.localeCompare(b.serviceName));

      // Use onUpdateApplication instead of onAddApplication
      onUpdateApplication(updatedApp);
      
      setServiceDialogOpen(false);
      setSelectedAppForService(null);
      setEditingService(null);
      setNewService({
        serviceId: "",
        serviceName: "",
        imageName: "",
        ports: "",
        environment: "",
        volumes: "",
        labels: "",
      });
      toast.success(editingService ? "Service updated successfully" : "Service added successfully");
    } catch (error) {
      console.error("Error saving service:", error);
      toast.error("Invalid JSON in environment or labels");
    }
  };

  const handleSyncApplication = (app: Application) => {
    // Update app to syncing status
    const updatedApp = { ...app, syncStatus: "syncing" as const };
    onUpdateApplication(updatedApp);
    toast.info(`Syncing ${app.appName || app.name} to device...`);

    // Simulate sync process (2 seconds)
    setTimeout(() => {
      const syncedApp = { ...app, syncStatus: "synced" as const };
      onUpdateApplication(syncedApp);
      toast.success(`${app.appName || app.name} synced successfully!`);
    }, 2000);
  };

  const handleDeleteService = () => {
    if (!selectedAppForService || !editingService) {
      return;
    }

    const updatedApp = { ...selectedAppForService };
    
    // Remove the service from the services array
    updatedApp.services = updatedApp.services.filter(s => s.serviceId !== editingService.serviceId);

    // Update the application
    onUpdateApplication(updatedApp);
    
    // Close dialogs and reset state
    setDeleteConfirmOpen(false);
    setServiceDialogOpen(false);
    setSelectedAppForService(null);
    setEditingService(null);
    setNewService({
      serviceId: "",
      serviceName: "",
      imageName: "",
      ports: "",
      environment: "",
      volumes: "",
      labels: "",
    });
    
    toast.success(`Service "${editingService.serviceName}" deleted successfully`);
  };

  const handleRemoveApplication = () => {
    if (!appToDelete) {
      return;
    }

    onRemoveApplication(appToDelete.id);
    setDeleteAppConfirmOpen(false);
    setAppToDelete(null);
    toast.success(`${appToDelete.appName || appToDelete.name} removed`);
  };

  return (
    <>
      <Card className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-gray-900 mb-1">Applications</h3>
            <p className="text-gray-600">Docker containers and services</p>
          </div>
          <Button onClick={openAddAppModal} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add App
          </Button>
        </div>

        {applications.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No applications deployed</p>
            <p className="text-sm mt-1">Click "Add App" to deploy a service</p>
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => {
              const SyncIcon = syncStatusIcons[app.syncStatus];
              return (
                <div
                  key={app.id}
                  className="border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {/* Application Header */}
                  <div className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-gray-900 truncate font-medium">{app.appName || app.name}</h4>
                        <div className="flex items-center gap-1">
                          <SyncIcon className={`w-3 h-3 ${
                            app.syncStatus === "synced" ? "text-green-600" :
                            app.syncStatus === "error" ? "text-red-600" :
                            app.syncStatus === "syncing" ? "text-blue-600" :
                            "text-yellow-600"
                          }`} />
                          <span className={`text-xs ${
                            app.syncStatus === "synced" ? "text-green-600" :
                            app.syncStatus === "error" ? "text-red-600" :
                            app.syncStatus === "syncing" ? "text-blue-600" :
                            "text-yellow-600"
                          }`}>
                            {app.syncStatus}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        <span>App ID: {app.appId}</span>
                        {app.services && app.services.length > 0 && (
                          <>
                            <span>•</span>
                            <span>{app.services.length} service{app.services.length !== 1 ? 's' : ''}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button 
                        onClick={() => handleSyncApplication(app)} 
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={app.syncStatus === "syncing"}
                      >
                        <RefreshCw className={`w-3 h-3 mr-1.5 ${app.syncStatus === "syncing" ? "animate-spin" : ""}`} />
                        Sync
                      </Button>

                      <Button 
                        onClick={() => openServiceModal(app)} 
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                      >
                        <Plus className="w-3 h-3 mr-1.5" />
                        Add Service
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-9 w-9">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => openEditAppModal(app)}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              toast.info(`Viewing logs for ${app.appName || app.name}`);
                            }}
                          >
                            View Logs
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              toast.info(`Restarting ${app.appName || app.name}`);
                            }}
                          >
                            Restart
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => {
                              setAppToDelete(app);
                              setDeleteAppConfirmOpen(true);
                            }}
                          >
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Services List */}
                  {app.services && app.services.length > 0 && (
                    <div className="border-t border-gray-200 bg-gray-50/50">
                      <div className="p-3 space-y-2">
                        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Services</h5>
                        {app.services.map((service, idx) => (
                          <div key={`${service.serviceId}-${idx}`} className="bg-white rounded p-2 border border-gray-100">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="font-medium text-gray-900 text-sm">{service.serviceName}</span>
                                  {service.status && (
                                    <Badge variant="outline" className={`text-xs ${statusColors[service.status]}`}>
                                      {service.status}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 truncate">{service.imageName || service.config.image}</div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    onToggleServiceStatus(app.id, service.serviceId, "start");
                                    toast.info(`Starting ${service.serviceName}`);
                                  }}
                                  disabled={service.status === "running" || service.status === "syncing"}
                                  className="h-7 text-xs border-green-200 hover:bg-green-50 hover:text-green-700 disabled:opacity-50"
                                >
                                  <Play className="w-3 h-3 mr-1.5" />
                                  Start
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    onToggleServiceStatus(app.id, service.serviceId, "stop");
                                    toast.info(`Stopping ${service.serviceName}`);
                                  }}
                                  disabled={service.status === "stopped" || service.status === "syncing" || !service.status}
                                  className="h-7 text-xs border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                                >
                                  <Square className="w-3 h-3 mr-1.5" />
                                  Stop
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openServiceModal(app, service)}
                                  className="h-7 text-xs"
                                >
                                  <Pen className="w-3 h-3 mr-1.5" />
                                  Edit
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Add/Edit Application Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          setEditingApp(null);
          setNewApp({ appId: "", appName: "" });
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingApp ? "Edit Application" : "Add Application"}</DialogTitle>
            <DialogDescription>
              {editingApp 
                ? "Update the application name" 
                : "Create a new application container. Services can be added to the application after creation."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="app-name">Application Name *</Label>
              <Input
                id="app-name"
                placeholder="web-server"
                value={newApp.appName}
                onChange={(e) => setNewApp({ ...newApp, appName: e.target.value })}
              />
              <p className="text-xs text-gray-500">Descriptive name for the application (e.g., web-server, database, api-gateway).{!editingApp && " An ID will be automatically assigned."}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDialogOpen(false);
              setEditingApp(null);
              setNewApp({ appId: "", appName: "" });
            }}>
              Cancel
            </Button>
            <Button onClick={handleAddApplication}>
              {editingApp ? "Update Application" : "Add Application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Service Dialog */}
      <Dialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingService ? "Edit Service" : "Add Service"}</DialogTitle>
            <DialogDescription>
              {editingService 
                ? "Update service configuration" 
                : `Add a new service to ${selectedAppForService?.appName || "application"}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="service-name">Service Name *</Label>
              <Input
                id="service-name"
                placeholder="nginx-web"
                value={newService.serviceName}
                onChange={(e) => setNewService({ ...newService, serviceName: e.target.value })}
              />
              <p className="text-xs text-gray-500">Descriptive service name</p>
            </div>

             <div className="space-y-2">
              <Label htmlFor="app-image">Docker Image *</Label>
              {!useCustomImage ? (
                <>
                  <Select
                    value={newService.imageName}
                    onValueChange={(value) => setNewService({ ...newService, imageName: value })}
                  >
                    <SelectTrigger id="app-image">
                      <SelectValue placeholder="Select a Docker image" />
                    </SelectTrigger>
                    <SelectContent>
                      {popularDockerImages.map((img) => (
                        <SelectItem key={img.value} value={img.value}>
                          {img.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setUseCustomImage(true)}
                    className="px-0 h-auto"
                  >
                    Or enter custom image
                  </Button>
                </>
              ) : (
                <>
                  <Input
                    id="app-image-custom"
                    placeholder="your-registry/image:tag"
                    value={newService.imageName}
                    onChange={(e) => setNewService({ ...newService, imageName: e.target.value })}
                  />
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setUseCustomImage(false)}
                    className="px-0 h-auto"
                  >
                    Choose from popular images
                  </Button>
                </>
              )}
            </div>


            <div className="space-y-2">
              <Label htmlFor="service-ports">Ports</Label>
              <Textarea
                id="service-ports"
                placeholder="8080:80&#10;8443:443"
                value={newService.ports}
                onChange={(e) => setNewService({ ...newService, ports: e.target.value })}
                rows={3}
              />
              <p className="text-xs text-gray-500">One port mapping per line (format: host:container)</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="service-environment">Environment Variables (JSON)</Label>
              <Textarea
                id="service-environment"
                placeholder='{\n  "NODE_ENV": "production",\n  "API_KEY": "secret"\n}'
                value={newService.environment}
                onChange={(e) => setNewService({ ...newService, environment: e.target.value })}
                rows={4}
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-500">JSON object with environment variables</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="service-volumes">Volumes</Label>
              <Textarea
                id="service-volumes"
                placeholder="/host/path:/container/path&#10;my-volume:/app/data"
                value={newService.volumes}
                onChange={(e) => setNewService({ ...newService, volumes: e.target.value })}
                rows={3}
              />
              <p className="text-xs text-gray-500">One volume mount per line</p>
            </div>

           
          </div>

          <DialogFooter className="gap-2">
            <div className="flex-1">
              {editingService && (
                <Button 
                  variant="destructive" 
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="mr-auto"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Service
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setServiceDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveService}>
                {editingService ? "Update Service" : "Add Service"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Service Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the service <strong>"{editingService?.serviceName}"</strong>? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteService}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Application Confirmation Dialog */}
      <AlertDialog open={deleteAppConfirmOpen} onOpenChange={setDeleteAppConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Application</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the application <strong>"{appToDelete?.appName || appToDelete?.name}"</strong>? 
              This will remove all associated services and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveApplication}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
