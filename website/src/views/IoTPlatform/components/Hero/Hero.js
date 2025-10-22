import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Container from 'components/Container';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';

const Hero = () => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        backgroundImage: `linear-gradient(to bottom, ${theme.palette.background.paper} 0%, ${theme.palette.alternate.main} 100%)`,
        paddingTop: 13,
        paddingBottom: 10,
      }}
    >
      <Container>
        <Grid container spacing={4}>
          <Grid item xs={12} md={6}>
            <Box marginBottom={2}>
              <Typography
                variant="h2"
                color="text.primary"
                sx={{
                  fontWeight: 700,
                  background: `linear-gradient(180deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Enterprise IoT Platform with Digital Twin Technology
              </Typography>
            </Box>
            <Box marginBottom={3}>
              <Typography
                variant="h5"
                component="p"
                color="text.secondary"
                sx={{ fontWeight: 400 }}
              >
                Create virtual replicas of your buildings, facilities, and assets with real-time monitoring, edge computing, and ML-powered predictive analytics
              </Typography>
            </Box>
            <Box
              display="flex"
              flexDirection={{ xs: 'column', sm: 'row' }}
              alignItems={{ xs: 'stretched', sm: 'flex-start' }}
              gap={2}
            >
              <Button
                component={'a'}
                variant="contained"
                color="primary"
                size="large"
                fullWidth={theme.breakpoints.down('sm')}
                href={'/start-demo'}
                startIcon={<RocketLaunchIcon />}
              >
                Request Demo
              </Button>
            </Box>
         
          </Grid>
          <Grid item xs={12} md={6}>
            <Box
              sx={{
                height: { xs: 300, md: 500 },
                width: '100%',
                borderRadius: 2,
                overflow: 'hidden',
                boxShadow: 4,
                position: 'relative',
              }}
            >
              {/* Placeholder for dashboard screenshot/video */}
              <Box
                component="img"
                loading="lazy"
                src={
                  'https://assets.maccarianagency.com/screenshots/dashboard.png'
                }
                alt="Iotistic IoT Dashboard"
                sx={{
                  objectFit: 'cover',
                  width: 1,
                  height: 1,
                  filter: theme.palette.mode === 'dark' ? 'brightness(0.7)' : 'none',
                }}
              />
              {/* Optional: Overlay with key metrics */}
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
                  padding: 3,
                }}
              >
                <Grid container spacing={2}>
                  <Grid item xs={4}>
                    <Typography variant="h4" color="common.white" fontWeight={700}>
                      Real-Time
                    </Typography>
                    <Typography variant="caption" color="common.white">
                      Twin Sync
                    </Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="h4" color="common.white" fontWeight={700}>
                      99.9%
                    </Typography>
                    <Typography variant="caption" color="common.white">
                      Uptime
                    </Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="h4" color="common.white" fontWeight={700}>
                      Unlimited
                    </Typography>
                    <Typography variant="caption" color="common.white">
                      Twins
                    </Typography>
                  </Grid>
                </Grid>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default Hero;
