import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Container from 'components/Container';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import ArticleIcon from '@mui/icons-material/Article';
import PhoneIcon from '@mui/icons-material/Phone';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

const CallToAction = () => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
        color: 'white',
        py: 10,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background decoration */}
      <Box
        sx={{
          position: 'absolute',
          top: -100,
          right: -100,
          width: 400,
          height: 400,
          borderRadius: '50%',
          bgcolor: 'rgba(255, 255, 255, 0.05)',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: -150,
          left: -150,
          width: 500,
          height: 500,
          borderRadius: '50%',
          bgcolor: 'rgba(255, 255, 255, 0.05)',
        }}
      />

      <Container sx={{ position: 'relative', zIndex: 1 }}>
        <Box textAlign="center" marginBottom={6}>
          <Typography
            variant="h2"
            fontWeight={700}
            gutterBottom
            sx={{
              fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' },
            }}
          >
            Ready to Build Your Digital Twin?
          </Typography>
          <Typography
            variant="h5"
            sx={{
              maxWidth: 800,
              mx: 'auto',
              mb: 4,
              opacity: 0.9,
              fontSize: { xs: '1.1rem', sm: '1.25rem' },
            }}
          >
            Start monitoring, optimizing, and predicting your building or facility performance with enterprise IoT platform
          </Typography>
        </Box>

        <Grid container spacing={3} marginBottom={6}>
          <Grid item xs={12} sm={4}>
            <Box textAlign="center">
              <CheckCircleIcon sx={{ fontSize: 50, mb: 2, opacity: 0.9 }} />
              <Typography variant="h6" fontWeight={700} gutterBottom>
                Quick Setup
              </Typography>
              <Typography variant="body1" sx={{ opacity: 0.8 }}>
                Deploy in hours, not months
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Box textAlign="center">
              <CheckCircleIcon sx={{ fontSize: 50, mb: 2, opacity: 0.9 }} />
              <Typography variant="h6" fontWeight={700} gutterBottom>
                Flexible Pricing
              </Typography>
              <Typography variant="body1" sx={{ opacity: 0.8 }}>
                From $300/year to enterprise
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Box textAlign="center">
              <CheckCircleIcon sx={{ fontSize: 50, mb: 2, opacity: 0.9 }} />
              <Typography variant="h6" fontWeight={700} gutterBottom>
                Expert Support
              </Typography>
              <Typography variant="body1" sx={{ opacity: 0.8 }}>
                Professional services available
              </Typography>
            </Box>
          </Grid>
        </Grid>

        <Box
          display="flex"
          flexDirection={{ xs: 'column', sm: 'row' }}
          justifyContent="center"
          alignItems="center"
          gap={3}
        >
          <Button
            component={'a'}
            href="/contact"
            variant="contained"
            size="large"
            startIcon={<RocketLaunchIcon />}
            sx={{
              bgcolor: 'white',
              color: theme.palette.primary.main,
              px: 4,
              py: 1.5,
              fontSize: '1.1rem',
              fontWeight: 700,
              '&:hover': {
                bgcolor: 'rgba(255, 255, 255, 0.9)',
                transform: 'translateY(-2px)',
                boxShadow: 8,
              },
              transition: 'all 0.3s ease-in-out',
            }}
          >
            Request Demo
          </Button>

          <Button
            component={'a'}
            href="/features"
            variant="outlined"
            size="large"
            startIcon={<ArticleIcon />}
            sx={{
              borderColor: 'white',
              color: 'white',
              px: 4,
              py: 1.5,
              fontSize: '1.1rem',
              fontWeight: 700,
              '&:hover': {
                borderColor: 'white',
                bgcolor: 'rgba(255, 255, 255, 0.1)',
                transform: 'translateY(-2px)',
              },
              transition: 'all 0.3s ease-in-out',
            }}
          >
            View Documentation
          </Button>

          <Button
            component={'a'}
            href="/contact"
            variant="outlined"
            size="large"
            startIcon={<PhoneIcon />}
            sx={{
              borderColor: 'white',
              color: 'white',
              px: 4,
              py: 1.5,
              fontSize: '1.1rem',
              fontWeight: 700,
              '&:hover': {
                borderColor: 'white',
                bgcolor: 'rgba(255, 255, 255, 0.1)',
                transform: 'translateY(-2px)',
              },
              transition: 'all 0.3s ease-in-out',
            }}
          >
            Talk to Sales
          </Button>
        </Box>

        <Box textAlign="center" marginTop={6}>
          <Typography variant="body1" sx={{ opacity: 0.8 }}>
            Trusted by facilities worldwide • Open-source platform • Professional support available
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.7, mt: 2 }}>
            No credit card required for demo • 14-day trial available • Custom deployment options
          </Typography>
        </Box>
      </Container>
    </Box>
  );
};

export default CallToAction;
