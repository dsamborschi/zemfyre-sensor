import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from 'components/Container';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Main from 'layouts/Main';
import SignupForm from './components';

const StartDemo = () => {
  const theme = useTheme();

  return (
    <Main>
      <Box
        sx={{
          backgroundImage: `linear-gradient(to bottom, ${theme.palette.background.paper} 0%, ${theme.palette.alternate.main} 100%)`,
          paddingTop: 13,
          paddingBottom: 4,
        }}
      >
        <Container>
          <Box textAlign="center" mb={4}>
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
              Start Your Free Trial
            </Typography>
            <Typography
              variant="h5"
              component="p"
              color="text.secondary"
              sx={{ fontWeight: 400, maxWidth: 700, mx: 'auto' }}
            >
              Get started with Iotistic in minutes. No credit card required.
            </Typography>
          </Box>
        </Container>
      </Box>

      <Container maxWidth={600} sx={{ mt: -6 }}>
        <Box
          sx={{
            bgcolor: 'background.paper',
            borderRadius: 2,
            boxShadow: 4,
            p: { xs: 3, md: 5 },
          }}
        >
          <SignupForm />
        </Box>
      </Container>

      <Container sx={{ mt: 6, mb: 4 }}>
        <Grid container spacing={4}>
          <Grid item xs={12} md={4}>
            <Box textAlign="center">
              <Typography variant="h1" color="primary.main" fontWeight={700}>
                1
              </Typography>
              <Typography variant="h6" gutterBottom fontWeight={700}>
                Sign Up
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Create your account in seconds with just a few details
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} md={4}>
            <Box textAlign="center">
              <Typography variant="h1" color="primary.main" fontWeight={700}>
                2
              </Typography>
              <Typography variant="h6" gutterBottom fontWeight={700}>
                Deploy
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Your instance is automatically deployed to Kubernetes
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} md={4}>
            <Box textAlign="center">
              <Typography variant="h1" color="primary.main" fontWeight={700}>
                3
              </Typography>
              <Typography variant="h6" gutterBottom fontWeight={700}>
                Connect
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Start connecting your devices and monitoring in real-time
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Main>
  );
};

export default StartDemo;
