import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DevicesIcon from '@mui/icons-material/Devices';

const features = [
  {
    title: 'Device Provisioning',
    description: 'Automated registration with API key generation and credential management',
  },
  {
    title: 'Device Shadows',
    description: 'AWS IoT-style state management for every device with desired/reported/delta',
  },
  {
    title: 'Digital Twin Integration',
    description: 'Every device automatically gets a digital twin in the cloud',
  },
  {
    title: 'Remote Configuration',
    description: 'Update device settings remotely without SSH or physical access',
  },
  {
    title: 'OTA Container Updates',
    description: 'Update services remotely with automatic rollback on failure',
  },
  {
    title: 'Job Engine',
    description: 'Schedule and execute jobs across devices - updates, scripts, maintenance',
  },
  {
    title: 'Event System',
    description: 'Real-time event sourcing with complete history and audit trail',
  },
  {
    title: 'Health Monitoring',
    description: 'CPU, memory, disk, network, and service health metrics',
  },
  {
    title: 'Device Groups',
    description: 'Organize devices by location, type, or custom tags',
  },
  {
    title: 'Bulk Operations',
    description: 'Execute jobs across thousands of devices simultaneously',
  },
  {
    title: 'API Key Rotation',
    description: 'Automated security key management and rotation',
  },
  {
    title: 'Device Relationships',
    description: 'Hierarchical relationships - buildings, floors, rooms, devices',
  },
];

const DeviceManagement = () => {
  const theme = useTheme();

  return (
    <Box py={8}>
      <Box textAlign="center" marginBottom={6}>
        <DevicesIcon sx={{ fontSize: 60, color: theme.palette.error.main, mb: 2 }} />
        <Typography variant="h3" fontWeight={700} gutterBottom>
          Device Management
        </Typography>
        <Typography variant="h6" color="text.secondary" maxWidth={800} mx="auto">
          Scale from 1 to unlimited devices with comprehensive provisioning, monitoring, and remote management
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {features.map((feature, index) => (
          <Grid item xs={12} sm={6} md={4} key={index}>
            <Card
              sx={{
                height: '100%',
                '&:hover': {
                  boxShadow: 8,
                  transform: 'translateY(-4px)',
                },
                transition: 'all 0.3s ease-in-out',
              }}
            >
              <CardContent>
                <Box display="flex" alignItems="flex-start">
                  <CheckCircleIcon 
                    sx={{ 
                      color: theme.palette.success.main, 
                      mr: 2, 
                      mt: 0.5,
                      fontSize: 28,
                    }} 
                  />
                  <Box>
                    <Typography variant="h6" fontWeight={700} gutterBottom>
                      {feature.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {feature.description}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Box
        sx={{
          mt: 6,
          p: 4,
          borderRadius: 2,
          bgcolor: theme.palette.error.light,
          color: theme.palette.error.contrastText,
        }}
      >
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Enterprise Device Management
        </Typography>
        <Typography variant="body1" paragraph>
          Inspired by Balena Supervisor and AWS IoT Core, our device management system provides 
          enterprise-grade features for fleets of any size. Automated provisioning reduces deployment 
          time from hours to minutes.
        </Typography>
        <Typography variant="body1">
          <strong>Scale:</strong> Tested with 1000+ devices per instance. Job engine handles 
          batch operations efficiently. Event sourcing provides complete audit trail for compliance.
        </Typography>
      </Box>
    </Box>
  );
};

export default DeviceManagement;
