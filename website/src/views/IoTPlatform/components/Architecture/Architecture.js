import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Container from 'components/Container';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SensorsIcon from '@mui/icons-material/Sensors';
import DeveloperBoardIcon from '@mui/icons-material/DeveloperBoard';
import CloudIcon from '@mui/icons-material/Cloud';
import DashboardIcon from '@mui/icons-material/Dashboard';

const architectureLayers = [
  {
    icon: <SensorsIcon sx={{ fontSize: 40 }} />,
    title: 'Physical Assets',
    description: 'Buildings, facilities, equipment, and IoT devices with sensors',
    examples: ['HVAC Systems', 'Temperature Sensors', 'Equipment', 'Facilities'],
    color: '#4CAF50',
  },
  {
    icon: <DeveloperBoardIcon sx={{ fontSize: 40 }} />,
    title: 'Edge Computing',
    description: 'Containerized services running on local hardware',
    examples: ['Docker Stack', 'Data Processing', 'Local ML', 'MQTT Broker'],
    color: '#2196F3',
  },
  {
    icon: <CloudIcon sx={{ fontSize: 40 }} />,
    title: 'Cloud Platform',
    description: 'Centralized management and digital twin storage',
    examples: ['Digital Twin State', 'Device Management', 'Jobs & Events', 'API Gateway'],
    color: '#FF9800',
  },
  {
    icon: <DashboardIcon sx={{ fontSize: 40 }} />,
    title: 'Visualization',
    description: 'Real-time dashboards and analytics interfaces',
    examples: ['Grafana Dashboards', '3D Twin View', 'Admin Panel', 'Alerts'],
    color: '#9C27B0',
  },
];

const Architecture = () => {
  const theme = useTheme();

  return (
    <Box sx={{ py: 8 }}>
      <Container>
        <Box marginBottom={6}>
          <Typography
            variant="h3"
            color="text.primary"
            align="center"
            fontWeight={700}
            gutterBottom
          >
            System Architecture
          </Typography>
          <Typography
            variant="h6"
            component="p"
            color="text.secondary"
            align="center"
            sx={{ maxWidth: 800, mx: 'auto' }}
          >
            Four-layer architecture from physical assets to digital twins—designed for reliability, scalability, and real-time performance
          </Typography>
        </Box>

        <Grid container spacing={4} alignItems="center">
          {architectureLayers.map((layer, index) => (
            <React.Fragment key={index}>
              <Grid item xs={12} md={6} lg={3}>
                <Card
                  sx={{
                    height: '100%',
                    border: `3px solid ${layer.color}`,
                    '&:hover': {
                      transform: 'scale(1.05)',
                      boxShadow: 8,
                    },
                    transition: 'all 0.3s ease-in-out',
                  }}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Box
                      sx={{
                        width: 70,
                        height: 70,
                        borderRadius: '50%',
                        bgcolor: layer.color,
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mb: 2,
                      }}
                    >
                      {layer.icon}
                    </Box>
                    
                    <Typography
                      variant="h5"
                      fontWeight={700}
                      gutterBottom
                      sx={{ color: layer.color }}
                    >
                      {layer.title}
                    </Typography>
                    
                    <Typography
                      variant="body1"
                      color="text.secondary"
                      paragraph
                      sx={{ minHeight: 60 }}
                    >
                      {layer.description}
                    </Typography>
                    
                    <Box sx={{ mt: 2 }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                        gutterBottom
                        fontWeight={700}
                      >
                        Components:
                      </Typography>
                      {layer.examples.map((example, idx) => (
                        <Typography
                          key={idx}
                          variant="body2"
                          color="text.secondary"
                          sx={{ 
                            pl: 2, 
                            py: 0.5,
                            '&:before': {
                              content: '"• "',
                              color: layer.color,
                              fontWeight: 700,
                            }
                          }}
                        >
                          {example}
                        </Typography>
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              {/* Arrow between cards (except after last card) */}
              {index < architectureLayers.length - 1 && (
                <Grid 
                  item 
                  xs={12} 
                  md={12} 
                  lg={'auto'}
                  sx={{ 
                    display: { xs: 'none', lg: 'flex' },
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <ArrowForwardIcon 
                    sx={{ 
                      fontSize: 40, 
                      color: theme.palette.primary.main,
                      opacity: 0.6,
                    }} 
                  />
                </Grid>
              )}
            </React.Fragment>
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
          <Typography variant="h6" fontWeight={700} gutterBottom align="center">
            Data Flow: Physical → Digital Twin → Analytics → Action
          </Typography>
          <Typography variant="body1" align="center">
            Sensors capture real-world data → Edge processes and streams → Cloud creates digital twin → 
            ML predicts issues → Automated actions via job engine
          </Typography>
        </Box>

        <Box textAlign="center" marginTop={4}>
          <Typography variant="body2" color="text.secondary">
            <strong>Redundancy Built-In:</strong> Edge continues operating if cloud connection lost • 
            Local data buffering • Automatic reconnection and sync
          </Typography>
        </Box>
      </Container>
    </Box>
  );
};

export default Architecture;
