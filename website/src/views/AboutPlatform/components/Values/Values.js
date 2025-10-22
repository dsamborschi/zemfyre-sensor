import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CodeIcon from '@mui/icons-material/Code';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import PeopleIcon from '@mui/icons-material/People';

const Values = () => {
  const theme = useTheme();

  const values = [
    {
      icon: <CodeIcon sx={{ fontSize: 50, color: theme.palette.primary.main }} />,
      title: 'Innovation First',
      description: 'We push the boundaries of what\'s possible in IoT, constantly exploring new technologies and approaches to solve complex challenges.'
    },
    {
      icon: <SecurityIcon sx={{ fontSize: 50, color: theme.palette.primary.main }} />,
      title: 'Security & Privacy',
      description: 'We prioritize data security and user privacy in every aspect of our platform, from edge devices to cloud infrastructure.'
    },
    {
      icon: <SpeedIcon sx={{ fontSize: 50, color: theme.palette.primary.main }} />,
      title: 'Performance',
      description: 'We optimize for real-time performance and reliability, ensuring your IoT infrastructure operates seamlessly 24/7.'
    },
    {
      icon: <PeopleIcon sx={{ fontSize: 50, color: theme.palette.primary.main }} />,
      title: 'Community Driven',
      description: 'We build together with our community, valuing contributions, feedback, and collaboration from developers worldwide.'
    }
  ];

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
          Our Values
        </Typography>
        <Typography
          variant="h6"
          component="p"
          color="text.secondary"
          align="center"
          sx={{ fontWeight: 400, maxWidth: 700, mx: 'auto' }}
        >
          The principles that guide everything we do
        </Typography>
      </Box>

      <Grid container spacing={4} sx={{ mt: 2 }}>
        {values.map((value, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 2,
                boxShadow: 3,
                transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: 6,
                },
              }}
            >
              <CardContent sx={{ textAlign: 'center', p: 3 }}>
                <Box sx={{ mb: 2 }}>
                  {value.icon}
                </Box>
                <Typography
                  variant="h5"
                  component="div"
                  gutterBottom
                  sx={{ fontWeight: 700 }}
                >
                  {value.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {value.description}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default Values;
