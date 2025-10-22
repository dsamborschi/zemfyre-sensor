import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Container from 'components/Container';

const Hero = () => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        backgroundImage: `linear-gradient(to bottom, ${theme.palette.background.paper} 0%, ${theme.palette.alternate.main} 100%)`,
        paddingTop: 13,
        paddingBottom: 8,
      }}
    >
      <Container>
        <Box textAlign="center">
          <Typography
            variant="h2"
            color="text.primary"
            sx={{
              fontWeight: 700,
              background: `linear-gradient(180deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 2,
            }}
          >
            Your Complete IoT Platform
          </Typography>
          <Typography
            variant="h5"
            component="p"
            color="text.secondary"
            sx={{ fontWeight: 400, maxWidth: 800, mx: 'auto', mb: 4 }}
          >
            Everything you need to build, deploy, and manage digital twins for buildings, facilities, and industrial assets
          </Typography>
          
          <Grid container spacing={2} justifyContent="center" sx={{ mt: 4 }}>
            <Grid item xs={6} sm={3}>
              <Typography variant="h3" fontWeight={700} color="primary.main">
                6
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Core Capabilities
              </Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="h3" fontWeight={700} color="primary.main">
                50+
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Platform Features
              </Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="h3" fontWeight={700} color="primary.main">
                24/7
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Real-Time Operation
              </Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="h3" fontWeight={700} color="primary.main">
                100%
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Open Source
              </Typography>
            </Grid>
          </Grid>
        </Box>
      </Container>
    </Box>
  );
};

export default Hero;
