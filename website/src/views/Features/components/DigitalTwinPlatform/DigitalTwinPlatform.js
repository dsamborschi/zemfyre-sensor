import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloudIcon from '@mui/icons-material/Cloud';

const features = [
  {
    title: 'Virtual Asset Replicas',
    description: 'Create digital representations of buildings, facilities, equipment, and infrastructure',
  },
  {
    title: 'Device Shadow System',
    description: 'AWS IoT-style state management with desired, reported, and delta states',
  },
  {
    title: 'Real-Time Synchronization',
    description: 'Millisecond-latency data streaming from physical assets to digital twins',
  },
  {
    title: 'Twin Relationships',
    description: 'Hierarchical structures - campus → building → floor → room → device',
  },
  {
    title: 'Historical Playback',
    description: 'Time-travel through twin state history for analysis and compliance',
  },
  {
    title: 'State Management',
    description: 'Comprehensive event sourcing with complete audit trail',
  },
  {
    title: 'Twin Telemetry',
    description: 'Real-time metrics and KPIs for every digital twin',
  },
  {
    title: 'BIM Integration Ready',
    description: 'Import Building Information Models and link to twin data (enterprise)',
  },
  {
    title: '3D Visualization',
    description: 'Optional 3D building models with live data overlay (enterprise)',
  },
  {
    title: 'Twin Analytics',
    description: 'Compare performance across multiple twins for benchmarking',
  },
  {
    title: 'Predictive Twins',
    description: 'ML-powered predictions based on historical twin data',
  },
  {
    title: 'Twin APIs',
    description: 'Comprehensive REST APIs for twin creation, updates, and queries',
  },
];

const DigitalTwinPlatform = () => {
  const theme = useTheme();

  return (
    <Box py={8}>
      <Box textAlign="center" marginBottom={6}>
        <CloudIcon sx={{ fontSize: 60, color: theme.palette.primary.main, mb: 2 }} />
        <Typography variant="h3" fontWeight={700} gutterBottom>
          Digital Twin Technology
        </Typography>
        <Typography variant="h6" color="text.secondary" maxWidth={800} mx="auto">
          Virtual replicas of physical assets with real-time state synchronization, historical data, and predictive analytics
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
          bgcolor: theme.palette.primary.light,
          color: theme.palette.primary.contrastText,
        }}
      >
        <Typography variant="h5" fontWeight={700} gutterBottom>
          What is a Digital Twin?
        </Typography>
        <Typography variant="body1" paragraph>
          A digital twin is a virtual replica of a physical asset that mirrors its state in real-time. 
          Our implementation uses <strong>Device Shadow</strong> technology (AWS IoT-style) to maintain 
          desired and reported states, automatically calculating deltas and triggering synchronization.
        </Typography>
        <Typography variant="body1">
          <strong>Use Cases:</strong> Smart buildings track HVAC systems, occupancy, and energy consumption. 
          Manufacturing facilities monitor production lines and equipment health. Data centers optimize 
          power and cooling based on digital twin analytics.
        </Typography>
      </Box>
    </Box>
  );
};

export default DigitalTwinPlatform;
