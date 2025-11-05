import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeveloperBoardIcon from '@mui/icons-material/DeveloperBoard';

const features = [
  {
    title: 'Docker Orchestration',
    description: 'Complete microservices stack running on edge devices with automatic updates',
  },
  {
    title: 'Multi-Architecture Support',
    description: 'Raspberry Pi 1-5 (ARMv6/7/ARM64), x86_64 - one platform, any hardware',
  },
  {
    title: 'Container Manager',
    description: 'Balena-style supervisor for lifecycle management, health checks, and recovery',
  },
  {
    title: 'MQTT Broker (Mosquitto)',
    description: 'Local message broker for real-time data streaming and pub/sub',
  },
  {
    title: 'Time-Series Database (InfluxDB)',
    description: 'High-performance storage for sensor data and metrics',
  },
  {
    title: 'Visualization (Grafana)',
    description: 'Real-time dashboards with alerting and custom panels',
  },
  {
    title: 'Automation Engine (Node-RED)',
    description: 'Flow-based programming for IoT workflows and ML integration',
  },
  {
    title: 'ML Service (TensorFlow)',
    description: 'On-device machine learning for anomaly detection and predictions',
  },
  {
    title: 'Reverse Proxy (Nginx)',
    description: 'SSL termination, load balancing, and API gateway',
  },
  {
    title: 'Local Data Buffering',
    description: 'Continues operation if cloud connection lost, auto-sync when restored',
  },
  {
    title: 'OTA Updates',
    description: 'Over-the-air container updates with rollback capability',
  },
  {
    title: 'Resource Management',
    description: 'CPU, memory, and storage monitoring with automatic optimization',
  },
];

const EdgeComputing = () => {
  const theme = useTheme();

  return (
    <Box py={8}>
      <Box textAlign="center" marginBottom={6}>
        <DeveloperBoardIcon sx={{ fontSize: 60, color: theme.palette.success.main, mb: 2 }} />
        <Typography variant="h3" fontWeight={700} gutterBottom>
          Edge Computing Platform
        </Typography>
        <Typography variant="h6" color="text.secondary" maxWidth={800} mx="auto">
          Powerful containerized services running directly on edge devices for low-latency processing and offline capability
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
          bgcolor: theme.palette.success.light,
          color: theme.palette.success.contrastText,
        }}
      >
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Why Edge Computing?
        </Typography>
        <Typography variant="body1" paragraph>
          Edge computing brings processing power closer to data sources, reducing latency from seconds 
          to milliseconds. Critical for real-time monitoring, predictive maintenance, and applications 
          that can't rely on constant cloud connectivity.
        </Typography>
        <Typography variant="body1">
          <strong>Stack Size:</strong> Complete platform runs on Raspberry Pi 4 with 4GB RAM. 
          Scales from single device prototypes to production deployments with thousands of edge nodes.
        </Typography>
      </Box>
    </Box>
  );
};

export default EdgeComputing;
