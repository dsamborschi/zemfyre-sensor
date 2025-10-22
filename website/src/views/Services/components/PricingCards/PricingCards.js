import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import CheckIcon from '@mui/icons-material/Check';
import StarIcon from '@mui/icons-material/Star';

const pricingTiers = [
  {
    name: 'Standard',
    price: '$300',
    period: '/month',
    description: 'Perfect for small deployments and proof-of-concept projects',
    features: [
      'Up to 10 devices',
      'Digital Twin platform',
      'Edge computing stack',
      'MQTT, InfluxDB, Grafana',
      'Node-RED automation',
      'Community support',
      '30-day data retention',
      'Email support (48h response)',
    ],
    buttonText: 'Get Started',
    buttonVariant: 'outlined',
    popular: false,
  },
  {
    name: 'Professional',
    price: '$750',
    period: '/month',
    description: 'For production deployments with professional support',
    features: [
      'Up to 100 devices',
      'All Standard features',
      'ML service with TensorFlow',
      'Custom Grafana dashboards',
      'API access and webhooks',
      'Priority email support (24h)',
      '90-day data retention',
      'Monthly review calls',
      'Custom integrations',
    ],
    buttonText: 'Start Free Trial',
    buttonVariant: 'contained',
    popular: true,
  },
  {
    name: 'Business',
    price: '$1,200',
    period: '/month',
    description: 'For businesses requiring high availability and SLA',
    features: [
      'Up to 500 devices',
      'All Professional features',
      'High availability setup',
      'Backup and disaster recovery',
      'Phone + email support (12h)',
      '180-day data retention',
      'Quarterly architecture review',
      'Custom ML model training',
      'Dedicated support engineer',
      '99.9% uptime SLA',
    ],
    buttonText: 'Contact Sales',
    buttonVariant: 'outlined',
    popular: false,
  },
  {
    name: 'Enterprise',
    price: '$1,500+',
    period: '/month',
    description: 'Custom solutions for large-scale deployments',
    features: [
      'Unlimited devices',
      'All Business features',
      'Multi-site deployment',
      'Custom architecture design',
      'White-label options',
      '24/7 phone + email support',
      'Custom data retention',
      'Dedicated DevOps engineer',
      'On-premise deployment option',
      'Custom SLA negotiation',
      'Training and workshops',
    ],
    buttonText: 'Contact Sales',
    buttonVariant: 'contained',
    popular: false,
  },
];

const PricingCards = () => {
  const theme = useTheme();

  return (
    <Box py={8}>
      <Box textAlign="center" marginBottom={6}>
        <Typography variant="h3" fontWeight={700} gutterBottom>
          Choose Your Plan
        </Typography>
        <Typography variant="h6" color="text.secondary" maxWidth={700} mx="auto">
          All plans include the complete IoT platform with digital twin technology. 
          Scale as you grow.
        </Typography>
      </Box>

      <Grid container spacing={4}>
        {pricingTiers.map((tier, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                border: tier.popular ? `2px solid ${theme.palette.primary.main}` : 'none',
                boxShadow: tier.popular ? 8 : 2,
                '&:hover': {
                  boxShadow: 12,
                  transform: 'translateY(-8px)',
                },
                transition: 'all 0.3s ease-in-out',
              }}
            >
              {tier.popular && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: -12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    bgcolor: theme.palette.primary.main,
                    color: 'white',
                    px: 3,
                    py: 0.5,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                  }}
                >
                  <StarIcon fontSize="small" />
                  <Typography variant="caption" fontWeight={700}>
                    MOST POPULAR
                  </Typography>
                </Box>
              )}

              <CardContent sx={{ flexGrow: 1, pt: tier.popular ? 4 : 2 }}>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  {tier.name}
                </Typography>
                
                <Box display="flex" alignItems="baseline" mb={2}>
                  <Typography variant="h3" fontWeight={700} color="primary">
                    {tier.price}
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    {tier.period}
                  </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" paragraph>
                  {tier.description}
                </Typography>

                <Divider sx={{ my: 2 }} />

                <Box>
                  {tier.features.map((feature, i) => (
                    <Box key={i} display="flex" alignItems="flex-start" mb={1.5}>
                      <CheckIcon 
                        sx={{ 
                          color: theme.palette.success.main, 
                          mr: 1, 
                          fontSize: 20,
                          mt: 0.3,
                        }} 
                      />
                      <Typography variant="body2">
                        {feature}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </CardContent>

              <CardActions sx={{ p: 2, pt: 0 }}>
                <Button
                  variant={tier.buttonVariant}
                  color="primary"
                  size="large"
                  fullWidth
                  href={tier.popular ? '/contact' : '/contact'}
                >
                  {tier.buttonText}
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Box textAlign="center" mt={6}>
        <Typography variant="body2" color="text.secondary">
          All plans include free updates and security patches. Custom pricing available for 
          academic institutions and non-profits.
        </Typography>
      </Box>
    </Box>
  );
};

export default PricingCards;
