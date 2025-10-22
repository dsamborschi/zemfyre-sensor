import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Container from 'components/Container';
import ApartmentIcon from '@mui/icons-material/Apartment';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import StorageIcon from '@mui/icons-material/Storage';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import BoltIcon from '@mui/icons-material/Bolt';
import SchoolIcon from '@mui/icons-material/School';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

const useCases = [
  {
    icon: <ApartmentIcon sx={{ fontSize: 50 }} />,
    title: 'Smart Buildings',
    subtitle: 'Digital twins for intelligent facility management',
    benefits: [
      'Real-time HVAC optimization',
      'Energy consumption tracking',
      'Occupancy and space utilization',
      'Predictive maintenance alerts',
      'BIM integration support',
    ],
    metrics: {
      savings: '30% energy savings',
      roi: 'ROI in 12-18 months',
      uptime: '99.5% system uptime',
    },
    color: '#1976D2',
  },
  {
    icon: <PrecisionManufacturingIcon sx={{ fontSize: 50 }} />,
    title: 'Manufacturing',
    subtitle: 'Production line digital twins and IIoT monitoring',
    benefits: [
      'Equipment performance tracking',
      'Quality control automation',
      'Predictive failure detection',
      'Production optimization',
      'Supply chain integration',
    ],
    metrics: {
      savings: '25% downtime reduction',
      roi: 'ROI in 6-12 months',
      uptime: '40% faster issue resolution',
    },
    color: '#D32F2F',
  },
  {
    icon: <StorageIcon sx={{ fontSize: 50 }} />,
    title: 'Data Centers',
    subtitle: 'Infrastructure monitoring and capacity planning',
    benefits: [
      'Server rack digital twins',
      'Power and cooling optimization',
      'Capacity planning analytics',
      'Environmental monitoring',
      'PUE optimization',
    ],
    metrics: {
      savings: '20% power reduction',
      roi: 'ROI in 8-14 months',
      uptime: '99.99% availability',
    },
    color: '#7B1FA2',
  },
  {
    icon: <LocalHospitalIcon sx={{ fontSize: 50 }} />,
    title: 'Healthcare',
    subtitle: 'Patient environment and equipment monitoring',
    benefits: [
      'Climate control for patient comfort',
      'Medical equipment tracking',
      'Cold chain monitoring',
      'Air quality assurance',
      'Regulatory compliance',
    ],
    metrics: {
      savings: 'HIPAA compliant',
      roi: 'Improved patient outcomes',
      uptime: '24/7 monitoring',
    },
    color: '#388E3C',
  },
  {
    icon: <BoltIcon sx={{ fontSize: 50 }} />,
    title: 'Energy & Utilities',
    subtitle: 'Smart grid and distribution monitoring',
    benefits: [
      'Grid performance monitoring',
      'Renewable energy integration',
      'Load forecasting',
      'Outage detection',
      'Asset management',
    ],
    metrics: {
      savings: '15% efficiency gains',
      roi: 'ROI in 18-24 months',
      uptime: 'Real-time grid visibility',
    },
    color: '#F57C00',
  },
  {
    icon: <SchoolIcon sx={{ fontSize: 50 }} />,
    title: 'Smart Campuses',
    subtitle: 'Multi-building digital twin management',
    benefits: [
      'Campus-wide energy optimization',
      'Building performance comparison',
      'Centralized facility management',
      'Student safety monitoring',
      'Sustainability reporting',
    ],
    metrics: {
      savings: '35% operational efficiency',
      roi: 'ROI in 14-20 months',
      uptime: 'Multi-site management',
    },
    color: '#0097A7',
  },
];

const UseCases = () => {
  const theme = useTheme();

  return (
    <Box sx={{ backgroundColor: theme.palette.alternate.main, py: 8 }}>
      <Container maxWidth="lg">
        <Box marginBottom={6}>
          <Typography
            variant="h3"
            color="text.primary"
            align="center"
            fontWeight={700}
            gutterBottom
          >
            Industry Applications
          </Typography>
          <Typography
            variant="h6"
            component="p"
            color="text.secondary"
            align="center"
            sx={{ maxWidth: 800, mx: 'auto' }}
          >
            Proven digital twin solutions across industries—from smart buildings to manufacturing, healthcare to energy management
          </Typography>
        </Box>

        <Grid container spacing={4}>
          {useCases.map((useCase, index) => (
            <Grid item xs={12} md={6} key={index}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  '&:hover': {
                    transform: 'translateY(-8px)',
                    boxShadow: 8,
                  },
                  transition: 'all 0.3s ease-in-out',
                  borderTop: `4px solid ${useCase.color}`,
                }}
              >
                <CardContent sx={{ flexGrow: 1, p: 3 }}>
                  <Box display="flex" alignItems="flex-start" marginBottom={2}>
                    <Box
                      sx={{
                        width: 70,
                        height: 70,
                        borderRadius: 2,
                        bgcolor: useCase.color,
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mr: 2,
                        flexShrink: 0,
                      }}
                    >
                      {useCase.icon}
                    </Box>
                    <Box>
                      <Typography variant="h5" fontWeight={700} gutterBottom>
                        {useCase.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {useCase.subtitle}
                      </Typography>
                    </Box>
                  </Box>

                  <Box marginBottom={3}>
                    <Typography
                      variant="subtitle2"
                      color="text.secondary"
                      gutterBottom
                      fontWeight={700}
                    >
                      Key Benefits:
                    </Typography>
                    {useCase.benefits.map((benefit, idx) => (
                      <Typography
                        key={idx}
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          pl: 2,
                          py: 0.5,
                          '&:before': {
                            content: '"✓ "',
                            color: useCase.color,
                            fontWeight: 700,
                            mr: 1,
                          },
                        }}
                      >
                        {benefit}
                      </Typography>
                    ))}
                  </Box>

                  <Box
                    sx={{
                      display: 'flex',
                      gap: 2,
                      flexWrap: 'wrap',
                      p: 2,
                      borderRadius: 1,
                      bgcolor:
                        theme.palette.mode === 'dark'
                          ? theme.palette.background.default
                          : theme.palette.grey[100],
                    }}
                  >
                    {Object.entries(useCase.metrics).map(([key, value]) => (
                      <Box key={key} sx={{ flex: '1 1 auto', minWidth: 100 }}>
                        <Typography
                          variant="h6"
                          fontWeight={700}
                          sx={{ color: useCase.color }}
                        >
                          {value}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {key.toUpperCase()}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Box textAlign="center" marginTop={6}>
          <Button
            variant="contained"
            color="primary"
            size="large"
            endIcon={<ArrowForwardIcon />}
            href="/contact"
          >
            Discuss Your Use Case
          </Button>
        </Box>
      </Container>
    </Box>
  );
};

export default UseCases;
