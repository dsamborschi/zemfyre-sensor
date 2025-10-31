import { Server, User, LogIn, Settings, HelpCircle, LogOut, RefreshCw, XCircle } from "lucide-react";
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

interface HeaderProps {
  isAuthenticated?: boolean;
  onLogout?: () => void;
  userEmail?: string;
  userName?: string;
  deploymentStatus?: {
    needsDeployment: boolean;
    version: number;
    lastDeployedAt?: string;
    deployedBy?: string;
  };
  onDeploy?: () => void;
  onCancelDeploy?: () => void;
}

export function Header({  isAuthenticated = true, onLogout = () => {},userEmail = "john.doe@company.com",userName = "John Doe", deploymentStatus, onDeploy = () => {}, onCancelDeploy = () => {}}: HeaderProps) {
  // Debug logging
  console.log('Header deploymentStatus:', deploymentStatus);
  
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="px-4 md:px-6 py-3 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
            <Server className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-gray-900 leading-tight">Iotistic</h1>
            <p className="text-xs text-gray-600 hidden sm:block">Your Device Management Platform</p>
          </div>
        </div>

        {/* Right Side - Deploy Button + Profile/Login */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              {/* Deploy Button - Always visible, enabled when changes are pending */}
              <div className="flex items-center gap-2">
                <Button 
                  onClick={onDeploy}
                  size="lg"
                  disabled={!deploymentStatus?.needsDeployment}
                  style={{ 
                    backgroundColor: deploymentStatus?.needsDeployment ? '#ca8a04' : '#9ca3af',
                    color: 'white',
                    padding: '0.75rem 1.5rem',
                    fontSize: '1rem'
                  }}
                  className="font-semibold shadow-md"
                >
                  <RefreshCw className="w-6 h-6 mr-2" />
                  Publish v{deploymentStatus ? deploymentStatus.version + 1 : '...'}
                </Button>
                {deploymentStatus?.needsDeployment && (
                  <Button 
                    onClick={onCancelDeploy}
                    size="sm"
                    variant="outline"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                )}
              </div>

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
                    <span className="hidden md:inline text-gray-900">{userName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>{userName}</span>
                      <span className="text-gray-500">{userEmail}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => toast.info("Opening profile...")}>
                    <User className="w-4 h-4 mr-2" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toast.info("Opening settings...")}>
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
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
