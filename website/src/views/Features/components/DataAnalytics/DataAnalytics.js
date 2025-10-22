import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TimelineIcon from '@mui/icons-material/Timeline';

const features = [
  {
    title: 'Real-Time Streaming',
    description: 'MQTT-based data streaming with millisecond latency to digital twins',
  },
  {
    title: 'Time-Series Storage',
    description: 'InfluxDB for efficient storage of sensor data and metrics',
  },
  {
    title: 'Historical Analysis',
    description: 'Query years of data with InfluxQL for trend analysis',
  },
  {
    title: 'Machine Learning',
    description: 'TensorFlow-powered anomaly detection and predictive models',
  },
  {
    title: 'Custom Dashboards',
    description: 'Grafana with custom panels, variables, and templating',
  },
  {
    title: 'Twin Analytics',
    description: 'Analyze digital twin state changes and performance over time',
  },
  {
    title: 'Data Export',
    description: 'CSV, JSON, and API access for external analysis tools',
  },
  {
    title: 'Alert System',
    description: 'Threshold-based alerts with email, webhook, and Slack integration',
  },
  {
    title: 'Twin Comparison',
    description: 'Compare multiple digital twins for benchmarking and optimization',
  },
  {
    title: 'Node-RED Integration',
    description: 'Flow-based automation triggered by data patterns',
  },
  {
    title: 'Custom ML Models',
    description: 'Train models on twin data for facility-specific predictions',
  },
  {
    title: 'Data Retention',
    description: 'Configurable retention policies from days to years',
  },
];

const DataAnalytics = () => {
  const theme = useTheme();

  return (
    <Box py={8}>
      <Box textAlign="center" marginBottom={6}>
        <TimelineIcon sx={{ fontSize: 60, color: theme.palette.warning.main, mb: 2 }} />
        <Typography variant="h3" fontWeight={700} gutterBottom>
          Data & Analytics
        </Typography>
        <Typography variant="h6" color="text.secondary" maxWidth={800} mx="auto">
          Real-time data streaming, historical analysis, and ML-powered predictions on your digital twin data
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
          bgcolor: theme.palette.warning.light,
          color: theme.palette.warning.contrastText,
        }}
      >
        <Typography variant="h5" fontWeight={700} gutterBottom>
          From Data to Insights
        </Typography>
        <Typography variant="body1" paragraph>
          The platform collects millions of data points daily, stores them efficiently in InfluxDB, 
          and makes them accessible through Grafana dashboards and REST APIs. Machine learning models 
          run on edge devices for real-time predictions.
        </Typography>
        <Typography variant="body1">
          <strong>Performance:</strong> InfluxDB handles 100k+ writes/second. Grafana renders 
          dashboards with sub-second query times. ML inference runs in milliseconds on Raspberry Pi 4.
        </Typography>
      </Box>
    </Box>
  );
};

export default DataAnalytics;
