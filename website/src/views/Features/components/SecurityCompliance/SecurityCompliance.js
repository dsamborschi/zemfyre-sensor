import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SecurityIcon from '@mui/icons-material/Security';

const features = [
  {
    title: 'API Key Authentication',
    description: 'Secure device authentication with automated key generation and rotation',
  },
  {
    title: 'MQTT TLS/SSL',
    description: 'Encrypted communication between devices and broker',
  },
  {
    title: 'Nginx SSL Termination',
    description: 'HTTPS for all web interfaces and APIs with Let\'s Encrypt support',
  },
  {
    title: 'Role-Based Access',
    description: 'Granular permissions for users, devices, and API consumers',
  },
  {
    title: 'Network Isolation',
    description: 'Docker networks isolate services for defense in depth',
  },
  {
    title: 'Audit Logging',
    description: 'Complete audit trail via event sourcing for compliance',
  },
  {
    title: 'Data Encryption',
    description: 'At-rest encryption for databases and sensitive configuration',
  },
  {
    title: 'Firewall Configuration',
    description: 'Automated firewall rules for edge devices',
  },
  {
    title: 'Secure Updates',
    description: 'Signed container images with integrity verification',
  },
  {
    title: 'SSH Hardening',
    description: 'Key-based authentication, disabled password login',
  },
  {
    title: 'GDPR Compliance',
    description: 'Data retention policies and right-to-delete support',
  },
  {
    title: 'Vulnerability Scanning',
    description: 'Automated security scanning of container images',
  },
];

const SecurityCompliance = () => {
  const theme = useTheme();

  return (
    <Box py={8}>
      <Box textAlign="center" marginBottom={6}>
        <SecurityIcon sx={{ fontSize: 60, color: theme.palette.info.main, mb: 2 }} />
        <Typography variant="h3" fontWeight={700} gutterBottom>
          Security & Compliance
        </Typography>
        <Typography variant="h6" color="text.secondary" maxWidth={800} mx="auto">
          Enterprise-grade security with encryption, authentication, and comprehensive audit trails for compliance
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {features.map((feature, index) => (
          <Grid item xs={12} sm={6} md={4} key={index}>
            <Card
              sx={{
                height: '100%',
                '&:hover': {
                  boxShadow: 8,
                  transform: 'translateY(-4px)',
                },
                transition: 'all 0.3s ease-in-out',
              }}
            >
              <CardContent>
                <Box display="flex" alignItems="flex-start">
                  <CheckCircleIcon 
                    sx={{ 
                      color: theme.palette.success.main, 
                      mr: 2, 
                      mt: 0.5,
                      fontSize: 28,
                    }} 
                  />
                  <Box>
                    <Typography variant="h6" fontWeight={700} gutterBottom>
                      {feature.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {feature.description}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Box
        sx={{
          mt: 6,
          p: 4,
          borderRadius: 2,
          bgcolor: theme.palette.info.light,
          color: theme.palette.info.contrastText,
        }}
      >
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Security First Approach
        </Typography>
        <Typography variant="body1" paragraph>
          Built with security in mind from day one. All communication is encrypted, authentication 
          is required for every endpoint, and audit logs track every action for compliance. Regular 
          security updates via OTA keep systems protected.
        </Typography>
        <Typography variant="body1">
          <strong>Compliance:</strong> GDPR-ready with data retention policies. Complete audit 
          trails via event sourcing. SOC 2 compliance support with professional services.
        </Typography>
      </Box>
    </Box>
  );
};

export default SecurityCompliance;
