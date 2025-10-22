import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Avatar from '@mui/material/Avatar';

// Icons
import DeveloperBoardIcon from '@mui/icons-material/DeveloperBoard';
import TimelineIcon from '@mui/icons-material/Timeline';
import CloudIcon from '@mui/icons-material/Cloud';
import PsychologyIcon from '@mui/icons-material/Psychology';
import DevicesIcon from '@mui/icons-material/Devices';
import CodeIcon from '@mui/icons-material/Code';

const features = [
  {
    icon: <CloudIcon />,
    title: 'Digital Twin Technology',
    subtitle: 'Create virtual replicas of buildings, facilities, and assets - real-time sync between physical and digital with device shadows and state management',
    color: '#0066CC',
  },
  {
    icon: <DeveloperBoardIcon />,
    title: 'Edge Computing',
    subtitle: 'Powerful containerized services running on edge devices - Docker orchestration for reliability and scalability',
    color: '#00CC66',
  },
  {
    icon: <TimelineIcon />,
    title: 'Real-time Monitoring',
    subtitle: 'MQTT + InfluxDB + Grafana stack - stream, store, and visualize data in real-time with digital twin dashboards',
    color: '#FF9900',
  },
  {
    icon: <PsychologyIcon />,
    title: 'Machine Learning',
    subtitle: 'Predictive analytics and anomaly detection - custom ML models on digital twin data with Node-RED automation',
    color: '#9C27B0',
  },
  {
    icon: <DevicesIcon />,
    title: 'Multi-Device Management',
    subtitle: 'Scale to unlimited devices and twins - AWS IoT-style shadows, provisioning, OTA updates, and hierarchical relationships',
    color: '#F44336',
  },
  {
    icon: <CodeIcon />,
    title: 'Open Source',
    subtitle: 'Customizable, extensible platform - full access to source code with professional support. Build your own digital twin applications',
    color: '#2196F3',
  },
];

const Features = () => {
  const theme = useTheme();

  return (
    <Box>
      <Box marginBottom={4}>
        <Typography
          variant="h3"
          color="text.primary"
          align="center"
          fontWeight={700}
          gutterBottom
        >
            Your Complete IoT Platform
        </Typography>
        <Typography
          variant="h6"
          component="p"
          color="text.secondary"
          align="center"
        >
          Everything you need for smart buildings, industrial IoT, and connected infrastructure
        </Typography>
      </Box>
      <Grid container spacing={4}>
        {features.map((item, i) => (
          <Grid item xs={12} sm={6} md={4} key={i}>
            <Card
              sx={{
                height: '100%',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: 8,
                },
                transition: 'all 0.3s ease-in-out',
              }}
            >
              <CardContent>
                <Box display="flex" flexDirection="column" alignItems="center">
                  <Avatar
                    sx={{
                      width: 60,
                      height: 60,
                      marginBottom: 2,
                      bgcolor: item.color,
                      fontSize: 30,
                    }}
                  >
                    {item.icon}
                  </Avatar>
                  <Typography
                    variant="h5"
                    fontWeight={700}
                    align="center"
                    gutterBottom
                  >
                    {item.title}
                  </Typography>
                  <Typography
                    variant="body1"
                    color="text.secondary"
                    align="center"
                  >
                    {item.subtitle}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default Features;
