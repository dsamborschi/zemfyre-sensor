import React, { useState } from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';

const SignupForm = () => {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    company_name: '',
    full_name: ''
  });
  const [responseData, setResponseData] = useState(null);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const apiUrl = process.env.REACT_APP_BILLING_API_URL || 'http://localhost:3100';
      
      const response = await fetch(`${apiUrl}/api/customers/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Signup failed');
      }

      setResponseData(data);
      setSuccess(true);
      
      setFormData({
        email: '',
        password: '',
        company_name: '',
        full_name: ''
      });
    } catch (err) {
      setError(err.message || 'Failed to create account. Please try again.');
      console.error('Signup error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (success && responseData) {
    return (
      <Box>
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <CheckCircleIcon 
            sx={{ 
              fontSize: 80, 
              color: theme.palette.success.main,
              mb: 2 
            }} 
          />
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
            Welcome to Iotistic! 🎉
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            Your account has been created successfully!
          </Typography>
        </Box>

        <Alert severity="success" sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            🎁 Your 14-day trial has started!
          </Typography>
        </Alert>

        <Box sx={{ bgcolor: 'background.paper', p: 3, borderRadius: 2, mb: 3, border: 1, borderColor: 'divider' }}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
            Account Details
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary">
                <strong>Customer ID:</strong> {responseData.customer.customer_id}
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary">
                <strong>Email:</strong> {responseData.customer.email}
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary">
                <strong>Company:</strong> {responseData.customer.company_name}
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary">
                <strong>Plan:</strong> {responseData.subscription.plan} (Trial)
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary">
                <strong>Trial Ends:</strong> {new Date(responseData.subscription.trial_ends_at).toLocaleDateString()}
              </Typography>
            </Grid>
            {responseData.deployment && (
              <>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Instance URL:</strong>{' '}
                    <a href={responseData.deployment.instance_url} target="_blank" rel="noopener noreferrer">
                      {responseData.deployment.instance_url}
                    </a>
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Deployment Status:</strong> {responseData.deployment.status}
                  </Typography>
                </Grid>
              </>
            )}
          </Grid>
        </Box>

        <Box sx={{ bgcolor: 'info.light', p: 3, borderRadius: 2, mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>
            📧 Check Your Email
          </Typography>
          <Typography variant="body2">
            We've sent details to <strong>{responseData.customer.email}</strong> with your next steps.
          </Typography>
        </Box>

        <Box sx={{ textAlign: 'center' }}>
          <Button
            variant="outlined"
            size="large"
            onClick={() => {
              setSuccess(false);
              setResponseData(null);
            }}
          >
            Create Another Account
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box component="form" onSubmit={handleSubmit}>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Company Name"
            name="company_name"
            value={formData.company_name}
            onChange={handleChange}
            required
            disabled={loading}
            placeholder="Your Company Inc."
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Full Name"
            name="full_name"
            value={formData.full_name}
            onChange={handleChange}
            disabled={loading}
            placeholder="John Doe"
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            type="email"
            label="Email Address"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            disabled={loading}
            placeholder="you@company.com"
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            type="password"
            label="Password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            disabled={loading}
            helperText="Minimum 8 characters"
            placeholder="••••••••"
          />
        </Grid>

        <Grid item xs={12}>
          <Box 
            sx={{ 
              bgcolor: 'success.light', 
              p: 2, 
              borderRadius: 1,
              border: `1px solid ${theme.palette.success.main}`
            }}
          >
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>
              ✨ What You Get (Free 14-Day Trial):
            </Typography>
            <Box component="ul" sx={{ pl: 2, mb: 0 }}>
              <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                ✓ Up to 10 IoT devices
              </Typography>
              <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                ✓ Real-time monitoring dashboard
              </Typography>
              <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                ✓ 30 days data retention
              </Typography>
              <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                ✓ Email support
              </Typography>
              <Typography component="li" variant="body2">
                ✓ No credit card required
              </Typography>
            </Box>
          </Box>
        </Grid>

        <Grid item xs={12}>
          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} /> : <RocketLaunchIcon />}
            sx={{ py: 1.5 }}
          >
            {loading ? 'Creating Your Account...' : 'Start Free Trial'}
          </Button>
        </Grid>

        <Grid item xs={12}>
          <Typography variant="caption" color="text.secondary" align="center" display="block">
            By signing up, you agree to our Terms of Service and Privacy Policy.
            No credit card required for trial.
          </Typography>
        </Grid>
      </Grid>
    </Box>
  );
};

export default SignupForm;
