import { Server, User, LogIn, Settings, HelpCircle, LogOut, RefreshCw, XCircle, Save } from "lucide-react";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { toast } from "sonner";
import { ThemeToggle } from "./theme-toggle";
import { useDeviceState } from "../contexts/DeviceStateContext";

interface HeaderProps {
  isAuthenticated?: boolean;
  onLogout?: () => void;
  userEmail?: string;
  userName?: string;
  deviceUuid?: string; // Device UUID for deployment operations
  onAccountClick?: () => void; // Callback for opening account page
}

export function Header({
  isAuthenticated = true,
  onLogout = () => {},
  userEmail = "john.doe@company.com",
  userName = "John Doe",
  deviceUuid,
  onAccountClick = () => {}
}: HeaderProps) {
  // Get deployment status and functions from context
  const { syncTargetState, cancelDeployment, hasPendingChanges, saveTargetState, getDeviceState } = useDeviceState();
  
  const needsDeployment = deviceUuid ? hasPendingChanges(deviceUuid) : false;
  const deviceState = deviceUuid ? getDeviceState(deviceUuid) : null;
  const hasUnsavedChanges = deviceState?.isDirty || false;
  
  const handleDeploy = async () => {
    if (!deviceUuid) {
      toast.error("No device selected");
      return;
    }
    
    try {
      // If there are unsaved changes, save them first
      if (hasUnsavedChanges) {
        toast.info("Saving changes...");
        await saveTargetState(deviceUuid);
      }
      
      // Then deploy
      await syncTargetState(deviceUuid, 'dashboard');
      toast.success("Deployment successful");
    } catch (error) {
      toast.error("Deployment failed");
      console.error("Deployment error:", error);
    }
  };
  
  const handleCancelDeploy = async () => {
    if (!deviceUuid) {
      toast.error("No device selected");
      return;
    }
    
    try {
      await cancelDeployment(deviceUuid);
      toast.success("Deployment cancelled");
    } catch (error) {
      toast.error("Failed to cancel deployment");
      console.error("Cancel deployment error:", error);
    }
  };
  
  const handleSaveDraft = async () => {
    if (!deviceUuid) {
      toast.error("No device selected");
      return;
    }
    
    try {
      await saveTargetState(deviceUuid);
      toast.success("Changes saved as draft");
    } catch (error) {
      toast.error("Failed to save draft");
      console.error("Save draft error:", error);
    }
  };
  
  return (
    <header className="bg-card border-b border-border sticky top-0 z-50">
      <div className="px-4 md:px-6 py-3 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
            <Server className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-foreground leading-tight">Iotistic</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">Your Device Management Platform</p>
          </div>
        </div>

        {/* Right Side - Deploy Button + Profile/Login */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              {/* Save Draft + Deploy Buttons */}
              <div className="flex items-center gap-2">
                {hasUnsavedChanges && (
                  <Button 
                    onClick={handleSaveDraft}
                    size="lg"
                    variant="outline"
                    className="border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 font-semibold shadow-md"
                    style={{ 
                      padding: '0.75rem 1.5rem',
                      fontSize: '1rem'
                    }}
                  >
                    <Save className="w-5 h-5 mr-2" />
                    Save Draft
                  </Button>
                )}
                <Button 
                  onClick={handleDeploy}
                  size="lg"
                  disabled={!needsDeployment}
                  style={{ 
                    backgroundColor: needsDeployment ? '#ca8a04' : '#9ca3af',
                    color: 'white',
                    padding: '0.75rem 1.5rem',
                    fontSize: '1rem'
                  }}
                  className="font-semibold shadow-md"
                >
                  <RefreshCw className="w-6 h-6 mr-2" />
                  Sync
                </Button>
                {needsDeployment && (
                  <Button 
                    onClick={handleCancelDeploy}
                    size="sm"
                    variant="outline"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                )}
              </div>

              <ThemeToggle />

              <Button
                variant="ghost"
                size="icon"
                className="hidden md:flex"
                onClick={() => toast.info("Help & Documentation")}
              >
                <HelpCircle className="w-5 h-5" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 px-2">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop" />
                      <AvatarFallback>{userName.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                    </Avatar>
                    <span className="hidden md:inline text-foreground">{userName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>{userName}</span>
                      <span className="text-muted-foreground">{userEmail}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => toast.info("Opening profile...")}>
                    <User className="w-4 h-4 mr-2" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onAccountClick}>
                    <Settings className="w-4 h-4 mr-2" />
                    Account & License
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toast.info("Opening help...")}>
                    <HelpCircle className="w-4 h-4 mr-2" />
                    Help & Support
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => {
                      onLogout();
                      toast.success("Logged out successfully");
                    }}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button onClick={() => toast.info("Login functionality")}>
              <LogIn className="w-4 h-4 mr-2" />
              Log in
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
