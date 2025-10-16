import { useState } from "react";
import { Power, RotateCw, Wrench, AlertTriangle, Terminal, Download } from "lucide-react";
import { Button } from "./ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Card } from "./ui/card";
import { Progress } from "./ui/progress";
import { toast } from "sonner@2.0.3";

interface DeviceActionsProps {
  deviceName: string;
  deviceId: string;
}

export function DeviceActions({ deviceName, deviceId }: DeviceActionsProps) {
  const [restartDialogOpen, setRestartDialogOpen] = useState(false);
  const [shutdownDialogOpen, setShutdownDialogOpen] = useState(false);
  const [diagnosticsDialogOpen, setDiagnosticsDialogOpen] = useState(false);
  const [diagnosticsProgress, setDiagnosticsProgress] = useState(0);
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);

  const handleRestart = () => {
    toast.success(`Restart command sent to ${deviceName}`, {
      description: "The device will restart in a few moments.",
    });
    setRestartDialogOpen(false);
  };

  const handleShutdown = () => {
    toast.success(`Shutdown command sent to ${deviceName}`, {
      description: "The device will shut down safely.",
    });
    setShutdownDialogOpen(false);
  };

  const handleRunDiagnostics = () => {
    setDiagnosticsRunning(true);
    setDiagnosticsProgress(0);
    
    // Simulate diagnostics progress
    const interval = setInterval(() => {
      setDiagnosticsProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setDiagnosticsRunning(false);
          toast.success("Diagnostics completed", {
            description: "All systems are functioning normally.",
          });
          return 100;
        }
        return prev + 10;
      });
    }, 300);
  };

  const diagnosticsTests = [
    { name: "CPU Health Check", status: diagnosticsProgress >= 20 ? "passed" : "pending" },
    { name: "Memory Test", status: diagnosticsProgress >= 40 ? "passed" : "pending" },
    { name: "Disk Performance", status: diagnosticsProgress >= 60 ? "passed" : "pending" },
    { name: "Network Connectivity", status: diagnosticsProgress >= 80 ? "passed" : "pending" },
    { name: "System Services", status: diagnosticsProgress >= 100 ? "passed" : "pending" },
  ];

  return (
    <>
      <div className="flex flex-wrap gap-2 md:gap-3">
        <Button
          variant="outline"
          onClick={() => setRestartDialogOpen(true)}
          className="flex items-center gap-2"
          size="sm"
        >
          <RotateCw className="w-4 h-4" />
          <span className="hidden sm:inline">Restart</span>
        </Button>

        <Button
          variant="outline"
          onClick={() => setShutdownDialogOpen(true)}
          className="flex items-center gap-2"
          size="sm"
        >
          <Power className="w-4 h-4" />
          <span className="hidden sm:inline">Shutdown</span>
        </Button>

        <Button
          variant="outline"
          onClick={() => setDiagnosticsDialogOpen(true)}
          className="flex items-center gap-2"
          size="sm"
        >
          <Wrench className="w-4 h-4" />
          <span className="hidden md:inline">Diagnostics</span>
        </Button>

        <Button
          variant="outline"
          className="flex items-center gap-2 hidden md:flex"
          onClick={() => toast.info("Opening terminal connection...")}
          size="sm"
        >
          <Terminal className="w-4 h-4" />
          Terminal
        </Button>

        <Button
          variant="outline"
          className="flex items-center gap-2 hidden lg:flex"
          onClick={() => toast.info("Generating system report...")}
          size="sm"
        >
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* Restart Confirmation Dialog */}
      <AlertDialog open={restartDialogOpen} onOpenChange={setRestartDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart Device?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restart <strong>{deviceName}</strong>? This will temporarily
              interrupt all running services and connections.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestart}>Restart</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Shutdown Confirmation Dialog */}
      <AlertDialog open={shutdownDialogOpen} onOpenChange={setShutdownDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Shutdown Device?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to shut down <strong>{deviceName}</strong>? You will need
              physical access to turn it back on.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleShutdown} className="bg-red-600 hover:bg-red-700">
              Shutdown
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diagnostics Dialog */}
      <Dialog open={diagnosticsDialogOpen} onOpenChange={setDiagnosticsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>System Diagnostics</DialogTitle>
            <DialogDescription>
              Running comprehensive diagnostics on {deviceName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!diagnosticsRunning && diagnosticsProgress === 0 && (
              <Button onClick={handleRunDiagnostics} className="w-full">
                <Wrench className="w-4 h-4 mr-2" />
                Start Diagnostics
              </Button>
            )}

            {(diagnosticsRunning || diagnosticsProgress > 0) && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Progress</span>
                    <span className="text-gray-900">{diagnosticsProgress}%</span>
                  </div>
                  <Progress value={diagnosticsProgress} className="h-2" />
                </div>

                <div className="space-y-2">
                  {diagnosticsTests.map((test, index) => (
                    <Card key={index} className="p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-700">{test.name}</span>
                        {test.status === "passed" ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            Passed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-100 text-gray-600">
                            Pending
                          </Badge>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>

                {diagnosticsProgress === 100 && (
                  <Button
                    onClick={() => {
                      setDiagnosticsDialogOpen(false);
                      setDiagnosticsProgress(0);
                    }}
                    className="w-full"
                  >
                    Close
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
