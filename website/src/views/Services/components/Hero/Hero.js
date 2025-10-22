import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';

const Hero = () => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
        py: 8,
        color: 'white',
      }}
    >
      <Box textAlign="center" maxWidth={800} mx="auto" px={2}>
        <AttachMoneyIcon sx={{ fontSize: 60, mb: 2, opacity: 0.9 }} />
        <Typography variant="h2" fontWeight={700} gutterBottom>
          Services & Pricing
        </Typography>
        <Typography variant="h5" sx={{ mb: 4, opacity: 0.9 }}>
          Flexible packages for every scale - from startups to enterprise deployments
        </Typography>

        <Box display="flex" justifyContent="center" gap={4} mt={4} flexWrap="wrap">
          <Box>
            <Typography variant="h4" fontWeight={700}>
              $300-$1,500
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Per Month
            </Typography>
          </Box>
          <Box>
            <Typography variant="h4" fontWeight={700}>
              4 Plans
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Standard to Enterprise
            </Typography>
          </Box>
          <Box>
            <Typography variant="h4" fontWeight={700}>
              24/7
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Enterprise Support
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default Hero;
