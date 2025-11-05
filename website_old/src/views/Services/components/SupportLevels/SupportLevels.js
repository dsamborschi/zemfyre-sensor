import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';

const supportFeatures = [
  {
    feature: 'Email Support',
    standard: '48h response',
    professional: '24h response',
    business: '12h response',
    enterprise: '4h response',
  },
  {
    feature: 'Phone Support',
    standard: false,
    professional: 'Business hours',
    business: 'Business hours',
    enterprise: '24/7',
  },
  {
    feature: 'Dedicated Support Engineer',
    standard: false,
    professional: false,
    business: true,
    enterprise: true,
  },
  {
    feature: 'Monthly Review Calls',
    standard: false,
    professional: true,
    business: true,
    enterprise: true,
  },
  {
    feature: 'Architecture Review',
    standard: false,
    professional: false,
    business: 'Quarterly',
    enterprise: 'Monthly',
  },
  {
    feature: 'Emergency Hotline',
    standard: false,
    professional: false,
    business: false,
    enterprise: true,
  },
  {
    feature: 'On-site Support',
    standard: false,
    professional: 'Add-on',
    business: 'Add-on',
    enterprise: true,
  },
  {
    feature: 'Custom SLA',
    standard: false,
    professional: false,
    business: '99.9%',
    enterprise: 'Custom',
  },
];

const SupportLevels = () => {
  const theme = useTheme();

  const renderCell = (value) => {
    if (typeof value === 'boolean') {
      return value ? (
        <CheckCircleIcon sx={{ color: theme.palette.success.main }} />
      ) : (
        <RemoveCircleIcon sx={{ color: theme.palette.text.disabled }} />
      );
    }
    return value;
  };

  return (
    <Box py={8}>
      <Box textAlign="center" marginBottom={6}>
        <Typography variant="h3" fontWeight={700} gutterBottom>
          Support Levels Comparison
        </Typography>
        <Typography variant="h6" color="text.secondary" maxWidth={700} mx="auto">
          Choose the support level that matches your operational requirements
        </Typography>
      </Box>

      <TableContainer 
        component={Paper} 
        sx={{ 
          boxShadow: 4,
          borderRadius: 2,
        }}
      >
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: theme.palette.alternate.main }}>
              <TableCell>
                <Typography variant="h6" fontWeight={700}>
                  Feature
                </Typography>
              </TableCell>
              <TableCell align="center">
                <Typography variant="h6" fontWeight={700}>
                  Standard
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  $300/mo
                </Typography>
              </TableCell>
              <TableCell align="center">
                <Typography variant="h6" fontWeight={700}>
                  Professional
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  $750/mo
                </Typography>
              </TableCell>
              <TableCell align="center">
                <Typography variant="h6" fontWeight={700}>
                  Business
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  $1,200/mo
                </Typography>
              </TableCell>
              <TableCell align="center">
                <Typography variant="h6" fontWeight={700}>
                  Enterprise
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  $1,500+/mo
                </Typography>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {supportFeatures.map((row, index) => (
              <TableRow
                key={index}
                sx={{
                  '&:nth-of-type(odd)': {
                    bgcolor: theme.palette.action.hover,
                  },
                }}
              >
                <TableCell component="th" scope="row">
                  <Typography variant="body1" fontWeight={600}>
                    {row.feature}
                  </Typography>
                </TableCell>
                <TableCell align="center">{renderCell(row.standard)}</TableCell>
                <TableCell align="center">{renderCell(row.professional)}</TableCell>
                <TableCell align="center">{renderCell(row.business)}</TableCell>
                <TableCell align="center">{renderCell(row.enterprise)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box
        mt={4}
        p={3}
        sx={{
          bgcolor: theme.palette.info.light,
          borderRadius: 2,
          border: `1px solid ${theme.palette.info.main}`,
        }}
      >
        <Typography variant="body1" fontWeight={600} gutterBottom>
          All Support Plans Include:
        </Typography>
        <Box component="ul" sx={{ pl: 3, mb: 0 }}>
          <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
            Access to documentation and knowledge base
          </Typography>
          <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
            Community forum support
          </Typography>
          <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
            Software updates and security patches
          </Typography>
          <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
            Bug fixes and hotfixes
          </Typography>
          <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
            Feature requests consideration
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default SupportLevels;
