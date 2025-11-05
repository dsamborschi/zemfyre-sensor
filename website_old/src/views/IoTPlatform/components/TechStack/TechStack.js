import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Container from 'components/Container';

const technologies = [
  {
    name: 'Docker',
    description: 'Container orchestration',
    logo: 'https://www.docker.com/wp-content/uploads/2022/03/vertical-logo-monochromatic.png',
    category: 'Infrastructure',
  },
  {
    name: 'MQTT',
    description: 'Real-time messaging',
    logo: 'https://mqtt.org/assets/img/mqtt-logo-transp.svg',
    category: 'Communication',
  },
  {
    name: 'InfluxDB',
    description: 'Time-series database',
    logo: 'https://influxdata.github.io/branding/img/downloads/influxdata-logo--symbol--pool-alpha.png',
    category: 'Storage',
  },
  {
    name: 'Grafana',
    description: 'Analytics & monitoring',
    logo: 'https://grafana.com/static/img/menu/grafana2.svg',
    category: 'Visualization',
  },
  {
    name: 'Node-RED',
    description: 'Flow-based automation',
    logo: 'https://nodered.org/about/resources/media/node-red-icon-2.svg',
    category: 'Automation',
  },
  {
    name: 'TensorFlow',
    description: 'Machine learning',
    logo: 'https://www.tensorflow.org/images/tf_logo_social.png',
    category: 'ML/AI',
  },
  {
    name: 'PostgreSQL',
    description: 'Relational database',
    logo: 'https://www.postgresql.org/media/img/about/press/elephant.png',
    category: 'Storage',
  },
  {
    name: 'TypeScript',
    description: 'Type-safe development',
    logo: 'https://www.typescriptlang.org/icons/icon-512x512.png',
    category: 'Development',
  },
  {
    name: 'Raspberry Pi',
    description: 'Edge computing',
    logo: 'https://www.raspberrypi.com/app/uploads/2022/02/COLOUR-Raspberry-Pi-Symbol-Registered.png',
    category: 'Hardware',
  },
];

const TechStack = () => {
  const theme = useTheme();

  return (
    <Box sx={{ backgroundColor: theme.palette.alternate.main, py: 8 }}>
      <Container>
        <Box marginBottom={6}>
          <Typography
            variant="h3"
            color="text.primary"
            align="center"
            fontWeight={700}
            gutterBottom
          >
            Built on Proven Technology
          </Typography>
          <Typography
            variant="h6"
            component="p"
            color="text.secondary"
            align="center"
            sx={{ maxWidth: 800, mx: 'auto' }}
          >
            Industry-leading open-source technologies power the platform—battle-tested, scalable, and trusted by enterprises worldwide
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {technologies.map((tech, index) => (
            <Grid item xs={6} sm={4} md={3} key={index}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 2,
                  textAlign: 'center',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  },
                  transition: 'all 0.3s ease-in-out',
                  backgroundColor:
                    theme.palette.mode === 'dark'
                      ? theme.palette.background.paper
                      : 'white',
                }}
              >
                <CardContent>
                  <Box
                    sx={{
                      width: 60,
                      height: 60,
                      marginBottom: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mx: 'auto',
                    }}
                  >
                    <Box
                      component="img"
                      src={tech.logo}
                      alt={tech.name}
                      sx={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        filter:
                          theme.palette.mode === 'dark'
                            ? 'brightness(0.9)'
                            : 'none',
                      }}
                    />
                  </Box>
                  <Typography
                    variant="h6"
                    fontWeight={700}
                    gutterBottom
                    sx={{ fontSize: '1rem' }}
                  >
                    {tech.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    gutterBottom
                  >
                    {tech.description}
                  </Typography>
                  <Box
                    sx={{
                      display: 'inline-block',
                      px: 1.5,
                      py: 0.5,
                      borderRadius: 1,
                      bgcolor: theme.palette.primary.light,
                      color: theme.palette.primary.contrastText,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      mt: 1,
                    }}
                  >
                    {tech.category}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Box textAlign="center" marginTop={6}>
          <Typography variant="body1" color="text.secondary" paragraph>
            <strong>Multi-Architecture Support:</strong> Raspberry Pi 1-5 (ARMv6/7/8), x86_64, ARM64
          </Typography>
          <Typography variant="body2" color="text.secondary">
            All components run in Docker containers for consistent deployment across any platform
          </Typography>
        </Box>
      </Container>
    </Box>
  );
};

export default TechStack;
