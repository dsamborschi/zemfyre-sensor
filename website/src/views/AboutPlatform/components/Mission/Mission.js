import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';

const Mission = () => {
  const theme = useTheme();

  return (
    <Box>
      <Box marginBottom={4}>
        <Typography
          variant="h3"
          color="text.primary"
          align="center"
          gutterBottom
          sx={{ fontWeight: 700 }}
        >
          Our Mission
        </Typography>
        <Typography
          variant="h6"
          component="p"
          color="text.secondary"
          align="center"
          sx={{ fontWeight: 400, maxWidth: 700, mx: 'auto' }}
        >
          To democratize IoT infrastructure by providing enterprise-grade, open-source solutions that empower organizations to build smarter, more connected environments.
        </Typography>
      </Box>

      <Grid container spacing={4} sx={{ mt: 4 }}>
        <Grid item xs={12} md={6}>
          <Box>
            <Typography
              variant="h4"
              color="text.primary"
              gutterBottom
              sx={{ fontWeight: 700 }}
            >
              What We Do
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              Iotistic provides a complete IoT platform that combines hardware, software, and cloud services to enable digital transformation for buildings, facilities, and industrial assets.
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              Our platform integrates environmental sensors, edge computing, real-time data analytics, and visualization tools to give you complete visibility and control over your physical infrastructure.
            </Typography>
          </Box>
        </Grid>

        <Grid item xs={12} md={6}>
          <Box>
            <Typography
              variant="h4"
              color="text.primary"
              gutterBottom
              sx={{ fontWeight: 700 }}
            >
              Why Open Source
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              We believe that critical infrastructure technology should be transparent, secure, and community-driven. By making our platform open source, we enable:
            </Typography>
            <Box component="ul" sx={{ pl: 2 }}>
              <Typography component="li" variant="body1" color="text.secondary" sx={{ mb: 1 }}>
                Full transparency and security auditing
              </Typography>
              <Typography component="li" variant="body1" color="text.secondary" sx={{ mb: 1 }}>
                Community-driven innovation and improvements
              </Typography>
              <Typography component="li" variant="body1" color="text.secondary" sx={{ mb: 1 }}>
                Freedom from vendor lock-in
              </Typography>
              <Typography component="li" variant="body1" color="text.secondary">
                Customization for specific use cases
              </Typography>
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Mission;
