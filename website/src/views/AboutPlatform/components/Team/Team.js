import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';

const Team = () => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
        borderRadius: 2,
        p: { xs: 4, md: 6 },
        textAlign: 'center',
        color: 'white',
      }}
    >
      <Typography
        variant="h3"
        gutterBottom
        sx={{ fontWeight: 700, color: 'white' }}
      >
        Join Our Team
      </Typography>
      <Typography
        variant="h6"
        component="p"
        sx={{ fontWeight: 400, maxWidth: 600, mx: 'auto', mb: 4, color: 'rgba(255,255,255,0.9)' }}
      >
        We're always looking for talented individuals who are passionate about IoT, open source, and building the future of connected infrastructure.
      </Typography>
      <Button
        variant="contained"
        size="large"
        href="/services#contact"
        sx={{
          bgcolor: 'white',
          color: theme.palette.primary.main,
          fontWeight: 700,
          px: 4,
          py: 1.5,
          '&:hover': {
            bgcolor: 'rgba(255,255,255,0.9)',
          },
        }}
      >
        Get in Touch
      </Button>
    </Box>
  );
};

export default Team;
