/**
 * Security Page - MQTT Users & ACLs Management
 * 
 * Provides interface to:
 * - View all MQTT users
 * - Create/edit/delete MQTT users
 * - Manage ACL rules per user (topic-level access control)
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Shield, 
  UserPlus, 
  Trash2, 
  Edit, 
  Plus,
  Lock,
  Unlock,
  Key,
  AlertTriangle
} from "lucide-react";
import { buildApiUrl } from "@/config/api";
import { toast } from "sonner";

interface MqttAcl {
  id: number;
  topic: string;
  access: number; // 1=read, 2=write, 3=read+write
  priority: number;
  created_at: string;
}

interface MqttUser {
  id: number;
  username: string;
  is_superuser: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  acls: MqttAcl[];
}

export function SecurityPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<MqttUser[]>([]);
  const [loading, setLoading] = useState(true);
  
  // User dialog state
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<MqttUser | null>(null);
  const [userFormData, setUserFormData] = useState({
    username: '',
    password: '',
    is_superuser: false,
    is_active: true
  });
  
  // ACL dialog state
  const [aclDialogOpen, setAclDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [editingAcl, setEditingAcl] = useState<MqttAcl | null>(null);
  const [aclFormData, setAclFormData] = useState({
    topic: '',
    access: 1,
    priority: 0
  });
  
  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'user' | 'acl', id: number } | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/v1/auth/mqtt-users'), {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      } else {
        console.error('Failed to fetch MQTT users:', response.status);
        toast({
          title: "Error",
          description: "Failed to fetch MQTT users",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Failed to fetch MQTT users:', error);
      toast({
        title: "Error",
        description: "Network error while fetching users",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setUserFormData({
      username: '',
      password: '',
      is_superuser: false,
      is_active: true
    });
    setUserDialogOpen(true);
  };

  const handleEditUser = (user: MqttUser) => {
    setEditingUser(user);
    setUserFormData({
      username: user.username,
      password: '', // Don't show existing password
      is_superuser: user.is_superuser,
      is_active: user.is_active
    });
    setUserDialogOpen(true);
  };

  const handleSaveUser = async () => {
    try {
      const url = editingUser 
        ? buildApiUrl(`/api/v1/auth/mqtt-users/${editingUser.id}`)
        : buildApiUrl('/api/v1/auth/mqtt-users');
      
      const method = editingUser ? 'PUT' : 'POST';
      
      const body: any = {
        is_superuser: userFormData.is_superuser,
        is_active: userFormData.is_active
      };
      
      if (!editingUser) {
        body.username = userFormData.username;
        body.password = userFormData.password;
      } else if (userFormData.password) {
        // Only include password if it was changed
        body.password = userFormData.password;
      }
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      
      if (response.ok) {
        toast({
          title: "Success",
          description: `MQTT user ${editingUser ? 'updated' : 'created'} successfully`
        });
        setUserDialogOpen(false);
        fetchUsers();
      } else {
        const data = await response.json();
        toast({
          title: "Error",
          description: data.message || `Failed to ${editingUser ? 'update' : 'create'} user`,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Save user error:', error);
      toast({
        title: "Error",
        description: "Network error while saving user",
        variant: "destructive"
      });
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget || deleteTarget.type !== 'user') return;
    
    try {
      const response = await fetch(
        buildApiUrl(`/api/v1/auth/mqtt-users/${deleteTarget.id}`),
        {
          method: 'DELETE',
          credentials: 'include'
        }
      );
      
      if (response.ok) {
        toast({
          title: "Success",
          description: "MQTT user deleted successfully"
        });
        fetchUsers();
      } else {
        toast({
          title: "Error",
          description: "Failed to delete user",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Delete user error:', error);
      toast({
        title: "Error",
        description: "Network error while deleting user",
        variant: "destructive"
      });
    } finally {
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  const handleAddAcl = (userId: number) => {
    setSelectedUserId(userId);
    setEditingAcl(null);
    setAclFormData({
      topic: '',
      access: 1,
      priority: 0
    });
    setAclDialogOpen(true);
  };

  const handleEditAcl = (userId: number, acl: MqttAcl) => {
    setSelectedUserId(userId);
    setEditingAcl(acl);
    setAclFormData({
      topic: acl.topic,
      access: acl.access,
      priority: acl.priority
    });
    setAclDialogOpen(true);
  };

  const handleSaveAcl = async () => {
    if (!selectedUserId) return;
    
    try {
      const url = editingAcl
        ? buildApiUrl(`/api/v1/auth/mqtt-acls/${editingAcl.id}`)
        : buildApiUrl(`/api/v1/auth/mqtt-users/${selectedUserId}/acls`);
      
      const method = editingAcl ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(aclFormData)
      });
      
      if (response.ok) {
        toast({
          title: "Success",
          description: `ACL rule ${editingAcl ? 'updated' : 'created'} successfully`
        });
        setAclDialogOpen(false);
        fetchUsers();
      } else {
        const data = await response.json();
        toast({
          title: "Error",
          description: data.message || `Failed to ${editingAcl ? 'update' : 'create'} ACL rule`,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Save ACL error:', error);
      toast({
        title: "Error",
        description: "Network error while saving ACL rule",
        variant: "destructive"
      });
    }
  };

  const handleDeleteAcl = async () => {
    if (!deleteTarget || deleteTarget.type !== 'acl') return;
    
    try {
      const response = await fetch(
        buildApiUrl(`/api/v1/auth/mqtt-acls/${deleteTarget.id}`),
        {
          method: 'DELETE',
          credentials: 'include'
        }
      );
      
      if (response.ok) {
        toast({
          title: "Success",
          description: "ACL rule deleted successfully"
        });
        fetchUsers();
      } else {
        toast({
          title: "Error",
          description: "Failed to delete ACL rule",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Delete ACL error:', error);
      toast({
        title: "Error",
        description: "Network error while deleting ACL rule",
        variant: "destructive"
      });
    } finally {
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  const getAccessLabel = (access: number) => {
    switch (access) {
      case 1: return 'Read (Subscribe)';
      case 2: return 'Write (Publish)';
      case 3: return 'Read + Write';
      default: return 'Unknown';
    }
  };

  const getAccessBadgeVariant = (access: number): "default" | "secondary" | "destructive" | "outline" => {
    switch (access) {
      case 1: return 'secondary';
      case 2: return 'default';
      case 3: return 'destructive';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading MQTT users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Security & Access Control
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage MQTT users and their topic-level access permissions
          </p>
        </div>
        <Button onClick={handleAddUser}>
          <UserPlus className="w-4 h-4 mr-2" />
          Add MQTT User
        </Button>
      </div>

      {/* Users List */}
      {users.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 mb-4">No MQTT users configured</p>
            <Button onClick={handleAddUser}>
              <UserPlus className="w-4 h-4 mr-2" />
              Add Your First User
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {users.map((user) => (
            <Card key={user.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${user.is_active ? 'bg-green-100' : 'bg-gray-100'}`}>
                      {user.is_active ? (
                        <Unlock className="w-5 h-5 text-green-600" />
                      ) : (
                        <Lock className="w-5 h-5 text-gray-600" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {user.username}
                        {user.is_superuser && (
                          <Badge variant="destructive" className="text-xs">
                            <Key className="w-3 h-3 mr-1" />
                            Superuser
                          </Badge>
                        )}
                        {!user.is_active && (
                          <Badge variant="outline" className="text-xs">
                            Inactive
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        Created {new Date(user.created_at).toLocaleDateString()} · 
                        {user.acls.length} ACL {user.acls.length === 1 ? 'rule' : 'rules'}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditUser(user)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDeleteTarget({ type: 'user', id: user.id });
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {user.is_superuser ? (
                  <div className="flex items-center gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-yellow-600" />
                    <p className="text-sm text-yellow-800">
                      This user has superuser privileges and bypasses all ACL checks
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-medium text-gray-700">ACL Rules</h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddAcl(user.id)}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Rule
                      </Button>
                    </div>
                    
                    {user.acls.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No ACL rules defined. Click "Add Rule" to create one.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {user.acls.map((acl) => (
                          <div
                            key={acl.id}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <code className="text-sm font-mono bg-white px-2 py-1 rounded border">
                                {acl.topic}
                              </code>
                              <Badge variant={getAccessBadgeVariant(acl.access)}>
                                {getAccessLabel(acl.access)}
                              </Badge>
                              {acl.priority !== 0 && (
                                <span className="text-xs text-gray-500">
                                  Priority: {acl.priority}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditAcl(user.id, acl)}
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setDeleteTarget({ type: 'acl', id: acl.id });
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="w-3 h-3 text-red-600" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* User Dialog */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingUser ? 'Edit MQTT User' : 'Add MQTT User'}
            </DialogTitle>
            <DialogDescription>
              {editingUser 
                ? 'Update user credentials and permissions' 
                : 'Create a new MQTT user with authentication credentials'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={userFormData.username}
                onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                disabled={!!editingUser}
                placeholder="mqtt-user"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">
                Password {editingUser && '(leave blank to keep current)'}
              </Label>
              <Input
                id="password"
                type="password"
                value={userFormData.password}
                onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                placeholder={editingUser ? '••••••••' : 'Enter password'}
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="is_superuser"
                checked={userFormData.is_superuser}
                onCheckedChange={(checked) => 
                  setUserFormData({ ...userFormData, is_superuser: checked })
                }
              />
              <Label htmlFor="is_superuser" className="cursor-pointer">
                Superuser (bypass all ACL checks)
              </Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={userFormData.is_active}
                onCheckedChange={(checked) => 
                  setUserFormData({ ...userFormData, is_active: checked })
                }
              />
              <Label htmlFor="is_active" className="cursor-pointer">
                Active
              </Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveUser}>
              {editingUser ? 'Save Changes' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ACL Dialog */}
      <Dialog open={aclDialogOpen} onOpenChange={setAclDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAcl ? 'Edit ACL Rule' : 'Add ACL Rule'}
            </DialogTitle>
            <DialogDescription>
              Define topic access permissions. Use + for single-level wildcard, # for multi-level.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="topic">Topic Pattern</Label>
              <Input
                id="topic"
                value={aclFormData.topic}
                onChange={(e) => setAclFormData({ ...aclFormData, topic: e.target.value })}
                placeholder="sensor/+/temperature or devices/#"
              />
              <p className="text-xs text-gray-500">
                Examples: sensor/temperature, devices/+/data, home/#
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="access">Access Level</Label>
              <Select
                value={aclFormData.access.toString()}
                onValueChange={(value) => 
                  setAclFormData({ ...aclFormData, access: parseInt(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Read (Subscribe only)</SelectItem>
                  <SelectItem value="2">Write (Publish only)</SelectItem>
                  <SelectItem value="3">Read + Write (Full access)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="priority">Priority (higher = more important)</Label>
              <Input
                id="priority"
                type="number"
                value={aclFormData.priority}
                onChange={(e) => 
                  setAclFormData({ ...aclFormData, priority: parseInt(e.target.value) || 0 })
                }
                placeholder="0"
              />
              <p className="text-xs text-gray-500">
                Higher priority rules override lower ones in case of conflicts
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAclDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAcl}>
              {editingAcl ? 'Save Changes' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'user' 
                ? 'This will permanently delete the MQTT user and all their ACL rules. This action cannot be undone.'
                : 'This will permanently delete this ACL rule. This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteTarget?.type === 'user' ? handleDeleteUser : handleDeleteAcl}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
