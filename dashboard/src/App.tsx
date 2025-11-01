import { useState, useEffect, useRef, useMemo } from "react";
import { DeviceSidebar, Device } from "./components/DeviceSidebar";
import { AddEditDeviceDialog } from "./components/AddEditDeviceDialog";
import { SystemMetrics } from "./components/SystemMetrics";
import { MqttPage } from "./components/MqttPage";
import { JobsPage } from "./components/JobsPage";
import { ApplicationsPage } from "./components/ApplicationsPage";
import { TimelinePage } from "./components/TimelinePage";
import { UsagePage } from "./components/UsagePage";
import { AnalyticsPage } from "./components/AnalyticsPage";
import { SecurityPage } from "./components/SecurityPage";
import { Application } from "./components/ApplicationsCard";
import { Toaster } from "./components/ui/sonner";
import { Sheet, SheetContent } from "./components/ui/sheet";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Menu, Activity, BarChart3, Radio, CalendarClock, Clock, Package, TrendingUp, LineChart, Shield, Settings } from "lucide-react";
import { LoginPage } from "./components/LoginPage";
import { buildApiUrl } from "./config/api";
import { SensorHealthDashboard } from "./pages/SensorHealthDashboard";
import { SensorsPage } from "./pages/SensorsPage";
import HousekeeperPage from "./pages/HousekeeperPage";

import { toast } from "sonner";
import { Header } from "./components/Header";

// Initialize API traffic tracking
import "./lib/apiInterceptor";

// Initial mock applications for each device

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  // Initialize selectedDeviceId from localStorage if available
  const [selectedDeviceId, setSelectedDeviceId] = useState(() => {
    return localStorage.getItem('selectedDeviceId') || "";
  });
  const [devices, setDevices] = useState<Device[]>([]);
  const devicesRef = useRef<Device[]>([]); // Ref to access devices without causing re-renders
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);
  const [cpuHistory, setCpuHistory] = useState<Array<{ time: string; value: number }>>([]);
  const [memoryHistory, setMemoryHistory] = useState<Array<{ time: string; used: number; available: number }>>([]);
  const [networkHistory, setNetworkHistory] = useState<Array<{ time: string; download: number; upload: number }>>([]);
  const [networkInterfaces, setNetworkInterfaces] = useState<any[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [applications, setApplications] = useState<Record<string, Application[]>>({});
  const [deploymentStatus, setDeploymentStatus] = useState<
    Record<string, { 
      needsDeployment: boolean;
      version: number;
      lastDeployedAt?: string;
      deployedBy?: string;
    }>
  >({});
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [currentView, setCurrentView] = useState<'metrics' | 'sensors' | 'mqtt' | 'jobs' | 'applications' | 'timeline' | 'usage' | 'analytics' | 'security' | 'settings'>('metrics');
  const [debugMode, setDebugMode] = useState(false);
  
  // Memoize selected device to prevent unnecessary re-renders
  const selectedDevice = useMemo(() => {
    return devices.find((d) => d.id === selectedDeviceId) || devices[0];
  }, [devices, selectedDeviceId]);
  
  const deviceApplications = applications[selectedDeviceId] || [];

  // Persist selectedDeviceId to localStorage whenever it changes
  useEffect(() => {
    if (selectedDeviceId) {
      localStorage.setItem('selectedDeviceId', selectedDeviceId);
    }
  }, [selectedDeviceId]);

  // Fetch devices from API
  useEffect(() => {
    let isFirstLoad = true;
    
    const fetchDevices = async () => {
      try {
        // Only show loading spinner on first load
        if (isFirstLoad) {
          setIsLoadingDevices(true);
          isFirstLoad = false;
        }
        
        const response = await fetch(buildApiUrl('/api/v1/devices'));
        
        if (!response.ok) {
          throw new Error(`Failed to fetch devices: ${response.statusText}`);
        }

        const data = await response.json();
        
        console.log('Devices API response:', data);
        
        // Transform API response to match Device interface
        // CRITICAL: Use stable UUID as ID instead of index to prevent React remounts
        const transformedDevices: Device[] = data.devices.map((apiDevice: any) => ({
          id: apiDevice.uuid, // Use stable UUID instead of index
          deviceUuid: apiDevice.uuid,
          name: apiDevice.device_name || 'Unnamed Device',
          type: apiDevice.device_type || 'gateway',
          status: apiDevice.provisioning_state === 'pending'
            ? 'pending'
            : (apiDevice.is_online ? 'online' : 'offline'),
          ipAddress: apiDevice.ip_address || 'N/A',
          macAddress: apiDevice.mac_address || 'N/A',
          lastSeen: formatLastSeen(apiDevice.last_connectivity_event),
          lastConnectivity: apiDevice.last_connectivity_event,
          cpu: Math.round(parseFloat(apiDevice.cpu_usage) || 0),
          memory: apiDevice.memory_usage && apiDevice.memory_total 
            ? Math.round((parseFloat(apiDevice.memory_usage) / parseFloat(apiDevice.memory_total) * 100)) 
            : 0,
          disk: apiDevice.storage_usage && apiDevice.storage_total 
            ? Math.round((parseFloat(apiDevice.storage_usage) / parseFloat(apiDevice.storage_total) * 100)) 
            : 0,
        }));

        // Only update state if devices actually changed (use callback for React optimization)
        setDevices((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(transformedDevices)) {
            devicesRef.current = transformedDevices; // Keep ref in sync
            return transformedDevices;
          }
          // No changes - return previous state to prevent re-render
          devicesRef.current = prev; // Ensure ref stays in sync
          return prev;
        });
        
        // Select first device if none selected (and update localStorage)
        if (!selectedDeviceId && transformedDevices.length > 0) {
          setSelectedDeviceId(transformedDevices[0].id);
        }
      } catch (error) {
        console.error('Error fetching devices:', error);
        // Set all devices to offline if API is unreachable
        setDevices((prev) => prev.map(device => ({ ...device, status: 'offline' })));
      } finally {
        setIsLoadingDevices(false);
      }
    };

    fetchDevices();
    
    // Refresh devices every 30 seconds
    const interval = setInterval(fetchDevices, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch applications for selected device
  useEffect(() => {
    const fetchApplications = async () => {
      if (!selectedDeviceId) return;
      
      const selectedDevice = devicesRef.current.find((d: any) => d.id === selectedDeviceId);
      if (!selectedDevice?.deviceUuid) return;

      try {
        const response = await fetch(buildApiUrl(`/api/v1/devices/${selectedDevice.deviceUuid}`));
        
        if (!response.ok) {
          console.error('Failed to fetch device state:', response.statusText);
          return;
        }

        const data = await response.json();

        console.log("Fetched device data:", data);
        
        // Capture deployment status
        if (data.target_state) {
          setDeploymentStatus(prev => ({
            ...prev,
            [selectedDeviceId]: {
              needsDeployment: data.target_state.needs_deployment || false,
              version: data.target_state.version || 1,
              lastDeployedAt: data.target_state.last_deployed_at,
              deployedBy: data.target_state.deployed_by,
            }
          }));
        }
        
        // Determine actual sync status by comparing target vs current state versions
        const targetVersion = data.target_state?.version || 1;
        const currentVersion = data.current_state?.version || 0;
        const needsDeployment = data.target_state?.needs_deployment || false;
        
        let actualSyncStatus: 'pending' | 'syncing' | 'synced' | 'error';
        if (needsDeployment) {
          // Changes saved but not deployed yet
          actualSyncStatus = 'pending';
        } else if (targetVersion > currentVersion) {
          // Deployed but device hasn't picked it up yet
          actualSyncStatus = 'syncing';
        } else if (targetVersion === currentVersion) {
          // Device has applied the changes
          actualSyncStatus = 'synced';
        } else {
          // Something wrong - current version is higher than target?
          actualSyncStatus = 'error';
        }
        
        // Show target_state when pending/syncing, current_state when synced
        // This displays what's configured vs what's actually running
        const showCurrentState = actualSyncStatus === 'synced' && data.current_state?.apps;
        const appsSource = showCurrentState ? data.current_state.apps : data.target_state?.apps;
        
        if (appsSource) {
          const transformedApps: Application[] = [];

          // For pending detection, get current_state services for comparison
          const currentAppsSource = data.current_state?.apps || {};


          Object.entries(appsSource).forEach(([appId, appData]: [string, any]) => {
            const services = appData.services || [];
            // For this app, get current_state services by serviceId
            const currentServicesMap: Record<string, any> = {};
            if (currentAppsSource[appId]?.services) {
              for (const s of currentAppsSource[appId].services) {
                currentServicesMap[s.serviceId] = s;
              }
            }
            // Determine app syncStatus for this app
            const appSyncStatus = actualSyncStatus;
            const transformedServices = services.map((service: any) => {
              // If app is pending and state/status differs from current_state, show pending
              let showPending = false;
              if (appSyncStatus === 'pending' && currentServicesMap[service.serviceId]) {
                const current = currentServicesMap[service.serviceId];
                if ((service.state && current.state && service.state !== current.state) ||
                    (service.status && current.status && service.status !== current.status)) {
                  showPending = true;
                }
              }
              return {
                serviceId: service.serviceId || 0,
                serviceName: service.serviceName || 'Unknown Service',
                imageName: service.imageName || 'unknown:latest',
                appId: parseInt(appId) || 0,
                appName: appData.appName || `App ${appId}`,
                config: {
                  image: service.imageName || 'unknown:latest',
                  ports: service.config?.ports || [],
                  environment: service.config?.environment || {},
                  volumes: service.config?.volumes || [],
                  labels: service.config?.labels || {},
                },
                status: showPending ? 'pending' : (service.status || service.state || 'stopped'),
                uptime: service.uptime || '0m',
                id: service.serviceId?.toString() || service.serviceName || `service-${Date.now()}`,
                name: service.serviceName || 'Unknown Service',
                image: service.imageName || 'unknown:latest',
                state: service.state || 'running',
                health: showCurrentState ? (service.health || 'unknown') : 'unknown',
              };
            });

            transformedApps.push({
              id: appId,
              appId: parseInt(appId) || 0,
              appName: appData.appName || `App ${appId}`,
              name: appData.appName || `App ${appId}`,
              image: transformedServices.length > 0 ? transformedServices[0].image : 'unknown:latest',
              status: 'stopped',
              syncStatus: appSyncStatus,
              services: transformedServices,
            });
          });

          setApplications(prev => ({
            ...prev,
            [selectedDeviceId]: transformedApps,
          }));

        } else {
          setApplications(prev => ({
            ...prev,
            [selectedDeviceId]: [],
          }));
        }
      } catch (error) {
        console.error('Error fetching applications:', error);
      }
    };


    fetchApplications();
    
    // Refresh applications every 10 seconds
    const interval = setInterval(fetchApplications, 10000);
    return () => clearInterval(interval);
  }, [selectedDeviceId]); // Only depend on selectedDeviceId, not devices array

  // Fetch historical metrics for telemetry charts
  useEffect(() => {
    // Clear metrics immediately on device change
    setCpuHistory([]);
    setMemoryHistory([]);
    setNetworkHistory([]);

    const fetchMetrics = async () => {
      if (!selectedDeviceId) return;
      const selectedDevice = devicesRef.current.find((d: any) => d.id === selectedDeviceId);
      if (!selectedDevice?.deviceUuid) return;

      try {
        const response = await fetch(buildApiUrl(`/api/v1/devices/${selectedDevice.deviceUuid}/metrics?limit=30`));
        if (!response.ok) {
          console.error('Failed to fetch device metrics:', response.statusText);
          return;
        }
        const data = await response.json();
        console.log('Historical metrics:', data);
        if (data.metrics && data.metrics.length > 0) {
          // Reverse to get chronological order (oldest first)
          const metricsData = data.metrics.reverse();
          // Update CPU history
          const cpuData = metricsData.map((m: any) => ({
            time: new Date(m.recorded_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            value: Math.round(parseFloat(m.cpu_usage) || 0)
          }));
          setCpuHistory(cpuData);
          // Update Memory history
          const memData = metricsData.map((m: any) => ({
            time: new Date(m.recorded_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            used: Math.round((parseFloat(m.memory_usage) || 0) / 1024 / 1024),
            available: Math.round(((parseFloat(m.memory_total) || 0) - (parseFloat(m.memory_usage) || 0)) / 1024 / 1024)
          }));
          setMemoryHistory(memData);
          // Network history - for now just use placeholder data since network metrics aren't stored yet
          setNetworkHistory(metricsData.map((m: any) => ({
            time: new Date(m.recorded_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            rx: 0,
            tx: 0
          })));
        }
      } catch (error) {
        console.error('Error fetching metrics:', error);
      }
    };

    fetchMetrics();
    // Refresh metrics every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [selectedDeviceId]);

  // Fetch network interfaces when device changes
  useEffect(() => {
    if (!selectedDeviceId) {
      setNetworkInterfaces([]);
      return;
    }

    const fetchNetworkInterfaces = async () => {
      try {
        const selectedDevice = devicesRef.current.find((d: any) => d.id === selectedDeviceId);
        if (!selectedDevice?.deviceUuid) {
          setNetworkInterfaces([]);
          return;
        }

        const response = await fetch(
          buildApiUrl(`/api/v1/devices/${selectedDevice.deviceUuid}/network-interfaces`)
        );

        if (!response.ok) {
          console.warn(`Failed to fetch network interfaces: ${response.statusText}`);
          setNetworkInterfaces([]);
          return;
        }

        const data = await response.json();

        console.log("Fetched network interfaces:", data);
        
        // Transform API format to dashboard format
        const interfaces = (data.interfaces || []).map((iface: any) => ({
          id: iface.name || iface.id,
          name: iface.name || iface.id,
          type: iface.type || 'ethernet',
          ipAddress: iface.ip4 || iface.ipAddress,
          status: iface.status || (iface.operstate === 'up' ? 'connected' : 'disconnected'),
          speed: iface.speed,
          signal: iface.signalLevel,
          mac: iface.mac,
          default: iface.default,
        }));

        setNetworkInterfaces(interfaces);
      } catch (error) {
        console.error('Error fetching network interfaces:', error);
        setNetworkInterfaces([]);
      }
    };

    fetchNetworkInterfaces();
    
    // Refresh network interfaces every 30 seconds
    const interval = setInterval(fetchNetworkInterfaces, 30000);
    return () => clearInterval(interval);
  }, [selectedDeviceId]);

  // Helper function to format last seen time
  const formatLastSeen = (timestamp: string | null): string => {
    if (!timestamp) return 'Never';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };


    const handleAddDevice = () => {
    setEditingDevice(null);
    setDeviceDialogOpen(true);
  };

  const handleEditDevice = (device: Device) => {
    setEditingDevice(device);
    setDeviceDialogOpen(true);
  };

  const handleSaveDevice = async (deviceData: Omit<Device, "id"> & { id?: string }) => {
    if (deviceData.id) {
      // Edit existing device - persist changes to API
      try {
        toast.loading('Updating device...', { id: 'update-device' });
        const response = await fetch(buildApiUrl(`/api/v1/devices/${deviceData.id}`), {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deviceName: deviceData.name,
            deviceType: deviceData.type,
            ipAddress: deviceData.ipAddress,
            macAddress: deviceData.macAddress
          })
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to update device');
        }
        const result = await response.json();
        setDevices(prev =>
          prev.map(d => (d.id === deviceData.id ? { ...d, ...deviceData } : d))
        );
        toast.success('Device updated successfully', { id: 'update-device' });
      } catch (error: any) {
        console.error('Error updating device:', error);
        toast.error(`Failed to update device: ${error.message}`, { id: 'update-device' });
      }
    } else {
      // Add new device - register via API
      try {
        toast.loading('Registering device...', { id: 'register-device' });

        const response = await fetch(buildApiUrl('/api/v1/devices'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deviceName: deviceData.name,
            deviceType: deviceData.type,
            ipAddress: deviceData.ipAddress,
            macAddress: deviceData.macAddress
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to register device');
        }

        const result = await response.json();
        toast.success('Device registered successfully! Waiting for agent to connect.', { id: 'register-device' });

        // Add device to local state with offline status
        const newDevice: Device = {
          id: result.device.uuid,
          deviceUuid: result.device.uuid,
          name: result.device.deviceName,
          type: result.device.deviceType,
          ipAddress: result.device.ipAddress || 'N/A',
          macAddress: result.device.macAddress || 'N/A',
          status: 'offline', // Will be offline until agent connects
          lastSeen: 'Never',
          cpu: 0,
          memory: 0,
          disk: 0,
        };
        
        setDevices(prev => [...prev, newDevice]);
        setSelectedDeviceId(newDevice.id);

        // Refresh devices list after a short delay
        setTimeout(() => {
          setDevices(prev => [...prev]);
        }, 2000);

      } catch (error: any) {
        console.error('Error registering device:', error);
        toast.error(`Failed to register device: ${error.message}`, { id: 'register-device' });
      }
    }
  };

  const handleLogin = (email: string, password: string) => {
    // In a real app, you would validate credentials with a backend
    // For demo purposes, we accept any login
    setIsAuthenticated(true);
    setUserEmail(email);
    // Extract name from email or use a default
    const name = email.split('@')[0].split('.').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    setUserName(name || "User");
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserEmail("");
    setUserName("");
  };

  const handleSelectDevice = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setSidebarOpen(false); // Close sidebar on mobile after selection
  };

  const handleAddApplication = async (app: Omit<Application, "id">) => {
    try {
      const selectedDevice = devices.find(d => d.id === selectedDeviceId);
      if (!selectedDevice?.deviceUuid) {
        toast.error('No device selected');
        return;
      }

      // Ensure appId is a number
      const numericAppId = typeof app.appId === 'number' ? app.appId : parseInt(String(app.appId));
      
      console.log('📦 Adding application:', {
        appId: app.appId,
        appIdType: typeof app.appId,
        numericAppId: numericAppId,
        numericType: typeof numericAppId,
        appName: app.appName,
        servicesCount: app.services?.length || 0
      });

      const payload = {
        appId: numericAppId,
        appName: app.appName,
        services: app.services.map(service => ({
          serviceName: service.serviceName,
          image: service.imageName,
          ports: service.config?.ports || [],
          environment: service.config?.environment || {},
          volumes: service.config?.volumes || [],
        }))
      };

      console.log('📤 Sending payload:', JSON.stringify(payload, null, 2));

      // Create application with services via API
      const response = await fetch(
        buildApiUrl(`/api/v1/devices/${selectedDevice.deviceUuid}/apps`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to deploy application');
      }

      const result = await response.json();
      toast.success(`Application "${app.appName}" deployed successfully!`);
      
      // Refresh applications to show the newly deployed app
      setTimeout(() => {
        // Trigger re-fetch by updating devices array reference
        setDevices(prev => [...prev]);
      }, 1000);

    } catch (error: any) {
      console.error('Error deploying application:', error);
      toast.error(`Failed to deploy application: ${error.message}`);
    }
  };

  const handleUpdateApplication = async (updatedApp: Application) => {
    try {
      const selectedDevice = devices.find(d => d.id === selectedDeviceId);
      if (!selectedDevice?.deviceUuid) {
        toast.error('No device selected');
        return;
      }

      // Use PATCH to update existing application
      const response = await fetch(
        buildApiUrl(`/api/v1/devices/${selectedDevice.deviceUuid}/apps/${updatedApp.appId}`),
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            appName: updatedApp.appName, // Include app name
            services: updatedApp.services.map(service => ({
              serviceName: service.serviceName,
              image: service.imageName,
              ports: service.config?.ports || [],
              environment: service.config?.environment || {},
              volumes: service.config?.volumes || [],
            }))
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update application');
      }

      toast.success(`Application "${updatedApp.appName}" saved (ready to deploy)`);
      
      // Mark as needs deployment
      setDeploymentStatus(prev => ({
        ...prev,
        [selectedDeviceId]: {
          ...prev[selectedDeviceId],
          needsDeployment: true,
        }
      }));
      
      // Update local state
      setApplications(prev => ({
        ...prev,
        [selectedDeviceId]: (prev[selectedDeviceId] || []).map(app =>
          app.id === updatedApp.id ? updatedApp : app
        ),
      }));
    } catch (error: any) {
      console.error('Error updating application:', error);
      toast.error(`Failed to update application: ${error.message}`);
    }
  };

  const handleDeployChanges = async () => {
    try {
      if (!selectedDeviceId) {
        toast.error('No device selected');
        return;
      }

      const selectedDevice = devices.find(d => d.id === selectedDeviceId);
      if (!selectedDevice?.deviceUuid) {
        toast.error('Device not found');
        return;
      }

      const deployStatus = deploymentStatus[selectedDeviceId];
      if (!deployStatus?.needsDeployment) {
        toast.info('No changes to deploy');
        return;
      }

      toast.loading('Deploying changes...', { id: 'deploy' });

      const response = await fetch(
        buildApiUrl(`/api/v1/devices/${selectedDevice.deviceUuid}/deploy`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deployedBy: 'dashboard'
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to deploy changes');
      }

      const data = await response.json();

      toast.success(`Deployed version ${data.version} successfully!`, { id: 'deploy' });
      
      // Update deployment status
      setDeploymentStatus(prev => ({
        ...prev,
        [selectedDeviceId]: {
          needsDeployment: false,
          version: data.version,
          lastDeployedAt: data.deployedAt,
          deployedBy: data.deployedBy,
        }
      }));
    } catch (error: any) {
      console.error('Error deploying changes:', error);
      toast.error(`Failed to deploy: ${error.message}`, { id: 'deploy' });
    }
  };

  const handleCancelDeploy = async () => {
    try {
      if (!selectedDeviceId) {
        toast.error('No device selected');
        return;
      }

      const selectedDevice = devices.find((d: any) => d.id === selectedDeviceId);
      if (!selectedDevice?.deviceUuid) {
        toast.error('Device not found');
        return;
      }

      const deployStatus = deploymentStatus[selectedDeviceId];
      if (!deployStatus?.needsDeployment) {
        toast.info('No pending changes to cancel');
        return;
      }

      toast.loading('Canceling pending changes...', { id: 'cancel' });

      const response = await fetch(
        buildApiUrl(`/api/v1/devices/${selectedDevice.deviceUuid}/deploy/cancel`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to cancel deployment');
      }

      toast.success('Pending changes canceled successfully', { id: 'cancel' });
      
      // Update deployment status
      setDeploymentStatus((prev: any) => ({
        ...prev,
        [selectedDeviceId]: {
          ...prev[selectedDeviceId],
          needsDeployment: false,
        }
      }));

      // Refetch applications to show reverted state
      setTimeout(() => {
        setDevices((prev: any) => [...prev]);
      }, 500);

    } catch (error: any) {
      console.error('Error canceling deployment:', error);
      toast.error(`Failed to cancel: ${error.message}`, { id: 'cancel' });
    }
  };

  const handleRemoveApplication = async (appId: string) => {
    try {
      const selectedDevice = devices.find(d => d.id === selectedDeviceId);
      if (!selectedDevice?.deviceUuid) {
        toast.error('No device selected');
        return;
      }

      // Call API to remove application
      const response = await fetch(
        buildApiUrl(`/api/v1/devices/${selectedDevice.deviceUuid}/apps/${appId}`),
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to remove application');
      }

      const result = await response.json();
      toast.success(`Application "${result.appName}" removed successfully!`);
      
      // Update local state
      setApplications(prev => ({
        ...prev,
        [selectedDeviceId]: (prev[selectedDeviceId] || []).filter(app => app.id !== appId),
      }));

    } catch (error: any) {
      console.error('Error removing application:', error);
      toast.error(`Failed to remove application: ${error.message}`);
    }
  };

  const handleToggleAppStatus = (appId: string) => {
    setApplications(prev => ({
      ...prev,
      [selectedDeviceId]: (prev[selectedDeviceId] || []).map(app =>
        app.id === appId
          ? {
              ...app,
              status: app.status === "running" ? "stopped" : "running",
              uptime: app.status === "running" ? "0m" : app.uptime,
            }
          : app
      ),
    }));
  };

  const handleToggleServiceStatus = async (appId: string, serviceId: number, action: "start" | "pause" | "stop") => {
    if (!selectedDeviceId) return;

    const selectedDevice = devices.find(d => d.id === selectedDeviceId);
    if (!selectedDevice) return;

    // Find the app and service
    const apps = applications[selectedDeviceId] || [];
    const app = apps.find(a => a.id === appId);
    if (!app || !app.services) return;

    try {
      // Map action to state field for agent
      const stateMap = {
        "start": "running",
        "pause": "paused",
        "stop": "stopped"
      };

      // Prepare services array with updated state field
      const updatedServices = app.services.map(s => {
        const serviceState = s.serviceId === serviceId 
          ? stateMap[action]
          : (s.state || "running"); // Preserve existing state or default to running

        return {
          serviceName: s.serviceName,
          image: s.imageName,
          ports: s.config?.ports || [],
          environment: s.config?.environment || {},
          volumes: s.config?.volumes || [],
          state: serviceState // Include the state field
        };
      });

      // Update target state via API
      const response = await fetch(
        buildApiUrl(`/api/v1/devices/${selectedDevice.deviceUuid}/apps/${appId}`),
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            appName: app.name,
            services: updatedServices
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Failed to ${action} service`);
      }

      const actionText = action === "start" ? "started" : action === "pause" ? "paused" : "stopped";
      const statusMap: Record<string, "running" | "stopped" | "paused"> = {
        "start": "running",
        "pause": "paused",
        "stop": "stopped"
      };
      
  toast.info(`Service will be marked as ${actionText}. Changes will take effect after deployment.`);
      
      // Update local service status immediately for better UX
      setApplications(prev => ({
        ...prev,
        [selectedDeviceId]: (prev[selectedDeviceId] || []).map(a => 
          a.id === appId 
            ? {
                ...a,
                services: a.services.map(s => 
                  s.serviceId === serviceId
                    ? { ...s, status: action === "start" || action === "pause" ? "pending" : statusMap[action], state: stateMap[action] as "running" | "stopped" | "paused" }
                    : s
                )
              }
            : a
        )
      }));
      
      // Mark as needs deployment
      setDeploymentStatus((prev: any) => ({
        ...prev,
        [selectedDeviceId]: {
          ...prev[selectedDeviceId],
          needsDeployment: true,
        }
      }));

    } catch (error: any) {
      console.error(`Error updating service state:`, error);
      toast.error(`Failed to ${action} service`);
    }
  };

  // No history initialization - charts will populate only with real data from API updates
  // History arrays start empty and fill as new data arrives from device metrics

  // Disabled mock simulation - using real data from API only
  // Real device metrics are fetched every 30 seconds from /api/v1/devices

  // Show login page if not authenticated
  // if (!isAuthenticated) {
  //   return (
  //     <>
  //       <LoginPage onLogin={handleLogin} />
  //       <Toaster />
  //     </>
  //   );
  // }

  return (

    <div className="flex flex-col h-screen overflow-hidden">

           {/* Header */}
      <Header 
        isAuthenticated={isAuthenticated}
        onLogout={handleLogout}
        userEmail={userEmail}
        userName={userName}
        deploymentStatus={(() => {
          const status = selectedDeviceId ? deploymentStatus[selectedDeviceId] : undefined;
          console.log('App.tsx - selectedDeviceId:', selectedDeviceId);
          console.log('App.tsx - deploymentStatus object:', deploymentStatus);
          console.log('App.tsx - passing to Header:', status);
          return status;
        })()}
        onDeploy={handleDeployChanges}
        onCancelDeploy={handleCancelDeploy}
      />

      <div className="flex flex-1 overflow-hidden">
                {/* Desktop Sidebar - Hidden on mobile, positioned on right */}
        <div className="hidden lg:block">
          <DeviceSidebar
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={handleSelectDevice}
            onAddDevice={handleAddDevice}
            onEditDevice={handleEditDevice}
          />
        </div>
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {isLoadingDevices ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading devices...</p>
              </div>
            </div>
          ) : devices.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md px-4">
                <p className="text-xl font-semibold text-foreground mb-2">No Devices Found</p>
                <p className="text-muted-foreground mb-4">Get started by provisioning your first device.</p>
                <Button onClick={handleAddDevice}>Add Device</Button>
              </div>
            </div>
          ) : !selectedDevice ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-600">Select a device from the sidebar</p>
            </div>
          ) : (
            <>
          {/* Mobile Header with Menu Button - Sticky at top */}
          <div className="lg:hidden bg-card border-b border-border p-4 flex items-center gap-3 sticky top-0 z-10">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-foreground">{selectedDevice.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className={
                    selectedDevice.status === "online"
                      ? "bg-green-100 text-green-700 border-green-200 text-xs"
                      : selectedDevice.status === "warning"
                      ? "bg-yellow-100 text-yellow-700 border-yellow-200 text-xs"
                      : "bg-gray-100 text-gray-700 border-gray-200 text-xs"
                  }
                >
                  {selectedDevice.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{selectedDevice.ipAddress}</span>
              </div>
            </div>
          </div>

          {/* View Toggle Buttons */}
          <div className="bg-card border-b border-border px-6 py-3 flex gap-2">
            <Button
              variant={currentView === 'metrics' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('metrics')}
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              System Metrics
            </Button>
            <Button
              variant={currentView === 'sensors' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('sensors')}
            >
              <Activity className="w-4 h-4 mr-2" />
              Sensor Monitor
            </Button>
            <Button
              variant={currentView === 'mqtt' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('mqtt')}
            >
              <Radio className="w-4 h-4 mr-2" />
              MQTT
            </Button>
            <Button
              variant={currentView === 'jobs' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('jobs')}
            >
              <CalendarClock className="w-4 h-4 mr-2" />
              Jobs
            </Button>
            <Button
              variant={currentView === 'applications' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('applications')}
            >
              <Package className="w-4 h-4 mr-2" />
              Applications
            </Button>
            <Button
              variant={currentView === 'timeline' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('timeline')}
            >
              <Clock className="w-4 h-4 mr-2" />
              Timeline
            </Button>
            <Button
              variant={currentView === 'usage' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('usage')}
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              API Usage
            </Button>
            <Button
              variant={currentView === 'analytics' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('analytics')}
            >
              <LineChart className="w-4 h-4 mr-2" />
              Traffic Monitor
            </Button>
            <Button
              variant={currentView === 'security' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('security')}
            >
              <Shield className="w-4 h-4 mr-2" />
              Security
            </Button>
            <Button
              variant={currentView === 'settings' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('settings')}
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>

          {/* Conditional Content */}
          {currentView === 'metrics' && (
            <SystemMetrics
              device={selectedDevice}
              cpuHistory={cpuHistory}
              memoryHistory={memoryHistory}
              networkHistory={networkHistory}
              networkInterfaces={networkInterfaces}
            />
          )}
          {currentView === 'applications' && (
            <ApplicationsPage
              device={selectedDevice}
              applications={deviceApplications}
              onAddApplication={handleAddApplication}
              onUpdateApplication={handleUpdateApplication}
              onRemoveApplication={handleRemoveApplication}
              onToggleAppStatus={handleToggleAppStatus}
              onToggleServiceStatus={handleToggleServiceStatus}
              deploymentStatus={deploymentStatus[selectedDeviceId]}
              setDeploymentStatus={setDeploymentStatus}
            />
          )}
          {currentView === 'sensors' && (
            debugMode 
              ? <SensorHealthDashboard deviceUuid={selectedDevice.deviceUuid} />
              : <SensorsPage 
                  deviceUuid={selectedDevice.deviceUuid}
                  deviceStatus={selectedDevice.status}
                  debugMode={debugMode}
                  onDebugModeChange={setDebugMode}
                />
          )}
          {currentView === 'mqtt' && (
            <MqttPage device={selectedDevice} />
          )}
          {currentView === 'jobs' && (
            <JobsPage device={selectedDevice} />
          )}
          {currentView === 'timeline' && (
            <TimelinePage device={selectedDevice} />
          )}
          {currentView === 'usage' && (
            <UsagePage />
          )}
          {currentView === 'analytics' && (
            <AnalyticsPage device={selectedDevice} />
          )}
          {currentView === 'security' && (
            <div className="flex-1 bg-background overflow-auto p-6">
              <SecurityPage />
            </div>
          )}
          {currentView === 'settings' && (
            <HousekeeperPage />
          )}
            </>
          )}
      </div>



        {/* Mobile Drawer - Opens from right */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="right" className="p-0 w-80">
            <DeviceSidebar
              devices={devices}
              selectedDeviceId={selectedDeviceId}
              onSelectDevice={handleSelectDevice}
              onAddDevice={handleAddDevice}
              onEditDevice={handleEditDevice}
            />
          </SheetContent>
        </Sheet>
      </div>

       {/* Add/Edit Device Dialog */}
      <AddEditDeviceDialog
        open={deviceDialogOpen}
        onOpenChange={setDeviceDialogOpen}
        device={editingDevice}
        onSave={handleSaveDevice}
      />

      <Toaster />
    </div>
  );
}
