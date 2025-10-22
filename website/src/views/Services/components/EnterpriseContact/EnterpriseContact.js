import React, { useState } from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import BusinessIcon from '@mui/icons-material/Business';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

const EnterpriseContact = () => {
  const theme = useTheme();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    plan: 'Enterprise',
    devices: '500+',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: Integrate with actual contact form API
    console.log('Form submitted:', formData);
    setSubmitted(true);
  };

  const enterpriseFeatures = [
    'Custom pricing for large deployments',
    'Dedicated account manager',
    'Custom SLA and support terms',
    'On-premise deployment options',
    'White-label customization',
    'Multi-site coordination',
    'Training and workshops',
    'Priority feature development',
  ];

  return (
    <Box py={8}>
      <Box textAlign="center" marginBottom={6}>
        <BusinessIcon sx={{ fontSize: 60, color: theme.palette.primary.main, mb: 2 }} />
        <Typography variant="h3" fontWeight={700} gutterBottom>
          Enterprise Solutions
        </Typography>
        <Typography variant="h6" color="text.secondary" maxWidth={700} mx="auto">
          Let's discuss your specific requirements and build a custom solution
        </Typography>
      </Box>

      <Grid container spacing={4}>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h5" fontWeight={700} gutterBottom>
                What's Included
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Enterprise plans are tailored to your exact needs. Common features include:
              </Typography>

              <Box>
                {enterpriseFeatures.map((feature, index) => (
                  <Box key={index} display="flex" alignItems="flex-start" mb={2}>
                    <CheckCircleIcon 
                      sx={{ 
                        color: theme.palette.success.main, 
                        mr: 2, 
                        mt: 0.5,
                        fontSize: 24,
                      }} 
                    />
                    <Typography variant="body1">
                      {feature}
                    </Typography>
                  </Box>
                ))}
              </Box>

              <Box
                mt={4}
                p={3}
                sx={{
                  bgcolor: theme.palette.primary.light,
                  borderRadius: 2,
                }}
              >
                <Typography variant="h6" fontWeight={700} gutterBottom>
                  Typical Use Cases
                </Typography>
                <Box component="ul" sx={{ pl: 3, mb: 0 }}>
                  <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                    <strong>Smart Buildings:</strong> 1,000+ devices across multiple properties
                  </Typography>
                  <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                    <strong>Manufacturing:</strong> Factory-wide sensor networks with digital twins
                  </Typography>
                  <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                    <strong>Energy Management:</strong> Multi-site energy monitoring and optimization
                  </Typography>
                  <Typography component="li" variant="body2">
                    <strong>Smart Cities:</strong> Municipal IoT infrastructure
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h5" fontWeight={700} gutterBottom>
                Contact Sales
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Fill out the form and our team will get back to you within 24 hours
              </Typography>

              {submitted ? (
                <Alert severity="success" sx={{ mb: 3 }}>
                  <Typography variant="body1" fontWeight={600}>
                    Thank you for your interest!
                  </Typography>
                  <Typography variant="body2">
                    Our team will contact you within 24 hours to discuss your requirements.
                  </Typography>
                </Alert>
              ) : (
                <Box component="form" onSubmit={handleSubmit}>
                  <TextField
                    fullWidth
                    label="Full Name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    sx={{ mb: 2 }}
                  />

                  <TextField
                    fullWidth
                    label="Work Email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    sx={{ mb: 2 }}
                  />

                  <TextField
                    fullWidth
                    label="Company"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                    required
                    sx={{ mb: 2 }}
                  />

                  <TextField
                    fullWidth
                    label="Phone Number"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    sx={{ mb: 2 }}
                  />

                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel>Interested Plan</InputLabel>
                    <Select
                      name="plan"
                      value={formData.plan}
                      onChange={handleChange}
                      label="Interested Plan"
                    >
                      <MenuItem value="Professional">Professional</MenuItem>
                      <MenuItem value="Business">Business</MenuItem>
                      <MenuItem value="Enterprise">Enterprise</MenuItem>
                      <MenuItem value="Custom">Custom Solution</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel>Expected Number of Devices</InputLabel>
                    <Select
                      name="devices"
                      value={formData.devices}
                      onChange={handleChange}
                      label="Expected Number of Devices"
                    >
                      <MenuItem value="1-10">1-10 devices</MenuItem>
                      <MenuItem value="10-50">10-50 devices</MenuItem>
                      <MenuItem value="50-100">50-100 devices</MenuItem>
                      <MenuItem value="100-500">100-500 devices</MenuItem>
                      <MenuItem value="500+">500+ devices</MenuItem>
                    </Select>
                  </FormControl>

                  <TextField
                    fullWidth
                    label="Tell us about your project"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    multiline
                    rows={4}
                    sx={{ mb: 3 }}
                  />

                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    size="large"
                    fullWidth
                  >
                    Request a Quote
                  </Button>

                  <Typography variant="caption" color="text.secondary" display="block" mt={2} textAlign="center">
                    By submitting this form, you agree to our privacy policy
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default EnterpriseContact;
