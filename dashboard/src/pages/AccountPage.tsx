import { useState, useEffect } from 'react';
import { 
  Shield, 
  CreditCard, 
  Users, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { buildApiUrl } from '@/config/api';

interface LicenseFeatures {
  maxDevices: number;
  dataRetentionDays: number;
  canExportData: boolean;
  hasAdvancedAlerts: boolean;
  hasApiAccess: boolean;
  hasMqttAccess: boolean;
  hasCustomBranding: boolean;
  hasDedicatedPrometheus?: boolean;
  prometheusRetentionDays?: number;
  prometheusStorageGb?: number;
}

interface LicenseLimits {
  maxUsers: number;
  maxAlertRules: number;
  maxDashboards: number;
}

interface LicenseData {
  customer: {
    id: string;
    name: string;
  };
  plan: string;
  subscription: {
    status: string;
    currentPeriodEndsAt: string;
  };
  trial: {
    isActive: boolean;
    expiresAt: string;
    daysRemaining: number;
  } | null;
  features: LicenseFeatures;
  limits: LicenseLimits;
  usage: {
    devices: {
      current: number;
      max: number;
      percentUsed: number;
    };
  };
  upgradeUrl: string;
}

export default function AccountPage() {
  const [licenseData, setLicenseData] = useState<LicenseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadLicenseData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(buildApiUrl('/api/v1/license'));
      
      if (!response.ok) {
        throw new Error('Failed to load license information');
      }
      
      const data = await response.json();
      setLicenseData(data);
      setLastRefresh(new Date());
    } catch (err: any) {
      console.error('Error loading license data:', err);
      setError(err.message || 'Failed to load license information');
      toast.error('Failed to load license information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLicenseData();
    
    // Refresh every 5 minutes
    const interval = setInterval(loadLicenseData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPlanBadgeVariant = (plan: string) => {
    switch (plan.toLowerCase()) {
      case 'enterprise':
        return 'default';
      case 'professional':
        return 'secondary';
      case 'starter':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return <Badge className="bg-green-100 text-green-700 border-green-200">Active</Badge>;
      case 'trialing':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Trial</Badge>;
      case 'past_due':
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Past Due</Badge>;
      case 'canceled':
        return <Badge className="bg-red-100 text-red-700 border-red-200">Canceled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex-1 bg-background overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading license information...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !licenseData) {
    return (
      <div className="flex-1 bg-background overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error || 'Failed to load license information'}
            </AlertDescription>
          </Alert>
          <Button onClick={loadLicenseData} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-background overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Account & License</h1>
            <p className="text-muted-foreground mt-1">
              View your subscription, plan features, and account information
            </p>
          </div>
          <Button onClick={loadLicenseData} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Last Updated */}
        {lastRefresh && (
          <p className="text-sm text-muted-foreground">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        )}

        {/* Trial Warning */}
        {licenseData.trial?.isActive && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                Your trial expires in <strong>{licenseData.trial.daysRemaining} days</strong> on{' '}
                {formatDate(licenseData.trial.expiresAt)}
              </span>
              <Button size="sm" asChild>
                <a href={licenseData.upgradeUrl} target="_blank" rel="noopener noreferrer">
                  Upgrade Now
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Subscription Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <Badge variant={getPlanBadgeVariant(licenseData.plan)} className="text-lg px-3 py-1">
                  {licenseData.plan.charAt(0).toUpperCase() + licenseData.plan.slice(1)}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {licenseData.subscription.status === 'active' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                {getStatusBadge(licenseData.subscription.status)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Renewal Date
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-medium">
                  {new Date(licenseData.subscription.currentPeriodEndsAt).toLocaleDateString()}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Customer Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Customer Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Customer Name</span>
              <span className="font-medium">{licenseData.customer.name}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Customer ID</span>
              <span className="font-mono text-sm">{licenseData.customer.id}</span>
            </div>
          </CardContent>
        </Card>

        {/* Usage Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Usage & Limits
            </CardTitle>
            <CardDescription>Current usage against your plan limits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Devices */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Devices</span>
                <span className="text-muted-foreground">
                  {licenseData.usage.devices.current} / {licenseData.usage.devices.max}
                </span>
              </div>
              <Progress 
                value={licenseData.usage.devices.percentUsed} 
                className={licenseData.usage.devices.percentUsed >= 90 ? 'bg-red-100' : ''}
              />
              {licenseData.usage.devices.percentUsed >= 90 && (
                <p className="text-xs text-red-600">
                  You're approaching your device limit. Consider upgrading your plan.
                </p>
              )}
            </div>

            {/* Other Limits */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Max Users</p>
                <p className="text-2xl font-bold">{licenseData.limits.maxUsers}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Alert Rules</p>
                <p className="text-2xl font-bold">{licenseData.limits.maxAlertRules}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Dashboards</p>
                <p className="text-2xl font-bold">{licenseData.limits.maxDashboards}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Plan Features
            </CardTitle>
            <CardDescription>Features included in your current plan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FeatureItem
                label="Max Devices"
                value={licenseData.features.maxDevices.toString()}
                enabled={true}
              />
              <FeatureItem
                label="Data Retention"
                value={`${licenseData.features.dataRetentionDays} days`}
                enabled={true}
              />
              <FeatureItem
                label="Data Export"
                value={licenseData.features.canExportData ? 'Enabled' : 'Disabled'}
                enabled={licenseData.features.canExportData}
              />
              <FeatureItem
                label="Advanced Alerts"
                value={licenseData.features.hasAdvancedAlerts ? 'Enabled' : 'Disabled'}
                enabled={licenseData.features.hasAdvancedAlerts}
              />
              <FeatureItem
                label="API Access"
                value={licenseData.features.hasApiAccess ? 'Enabled' : 'Disabled'}
                enabled={licenseData.features.hasApiAccess}
              />
              <FeatureItem
                label="MQTT Access"
                value={licenseData.features.hasMqttAccess ? 'Enabled' : 'Disabled'}
                enabled={licenseData.features.hasMqttAccess}
              />
              <FeatureItem
                label="Custom Branding"
                value={licenseData.features.hasCustomBranding ? 'Enabled' : 'Disabled'}
                enabled={licenseData.features.hasCustomBranding}
              />
              {licenseData.features.hasDedicatedPrometheus && (
                <>
                  <FeatureItem
                    label="Dedicated Prometheus"
                    value="Enabled"
                    enabled={true}
                  />
                  <FeatureItem
                    label="Prometheus Retention"
                    value={`${licenseData.features.prometheusRetentionDays} days`}
                    enabled={true}
                  />
                  <FeatureItem
                    label="Prometheus Storage"
                    value={`${licenseData.features.prometheusStorageGb} GB`}
                    enabled={true}
                  />
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Manage Subscription
            </CardTitle>
            <CardDescription>
              Upgrade your plan or manage billing settings
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-4">
            <Button asChild>
              <a href={licenseData.upgradeUrl} target="_blank" rel="noopener noreferrer">
                Upgrade Plan
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={licenseData.upgradeUrl} target="_blank" rel="noopener noreferrer">
                Manage Billing
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface FeatureItemProps {
  label: string;
  value: string;
  enabled: boolean;
}

function FeatureItem({ label, value, enabled }: FeatureItemProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{value}</span>
        {enabled ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <XCircle className="h-4 w-4 text-gray-400" />
        )}
      </div>
    </div>
  );
}
