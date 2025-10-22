import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';

const features = [
  {
    title: 'Automated Installation',
    description: 'One-line installer for quick deployment on Raspberry Pi and x86',
  },
  {
    title: 'Ansible Playbooks',
    description: 'Infrastructure-as-code for repeatable deployments',
  },
  {
    title: 'Docker Compose',
    description: 'Simple service orchestration with docker-compose.yml',
  },
  {
    title: 'Multi-Architecture',
    description: 'Single platform works on Pi1-5, x86_64, ARM64 automatically',
  },
  {
    title: 'Cloud API Deployment',
    description: 'Deploy cloud platform to AWS, Azure, GCP, or on-premise',
  },
  {
    title: 'Monitoring & Logging',
    description: 'Built-in logging with optional centralized log aggregation',
  },
  {
    title: 'Health Checks',
    description: 'Automated health monitoring with alerting',
  },
  {
    title: 'Backup & Restore',
    description: 'Database backup scripts with automated scheduling',
  },
  {
    title: 'Rolling Updates',
    description: 'Zero-downtime updates with automatic rollback',
  },
  {
    title: 'Configuration Management',
    description: 'Environment variables and secrets management',
  },
  {
    title: 'CI/CD Integration',
    description: 'GitHub Actions workflows for automated testing and deployment',
  },
  {
    title: 'Documentation',
    description: 'Comprehensive docs for installation, configuration, and troubleshooting',
  },
];

const DeploymentOperations = () => {
  const theme = useTheme();

  return (
    <Box py={8}>
      <Box textAlign="center" marginBottom={6}>
        <RocketLaunchIcon sx={{ fontSize: 60, color: theme.palette.secondary.main, mb: 2 }} />
        <Typography variant="h3" fontWeight={700} gutterBottom>
          Deployment & Operations
        </Typography>
        <Typography variant="h6" color="text.secondary" maxWidth={800} mx="auto">
          Production-ready deployment with automated installation, monitoring, and operations
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
          bgcolor: theme.palette.secondary.light,
          color: theme.palette.secondary.contrastText,
        }}
      >
        <Typography variant="h5" fontWeight={700} gutterBottom>
          DevOps Ready
        </Typography>
        <Typography variant="body1" paragraph>
          Designed for production from day one. Automated installation gets you running in minutes. 
          Docker Compose simplifies service management. Ansible enables fleet-wide deployments. 
          Built-in monitoring and logging keep systems healthy.
        </Typography>
        <Typography variant="body1">
          <strong>Time to Deploy:</strong> 15 minutes for single device. 1 hour for 100 devices 
          via Ansible. Professional services available for custom deployments and integrations.
        </Typography>
      </Box>
    </Box>
  );
};

export default DeploymentOperations;
