import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';

const Topbar = ({ onSidebarOpen, colorInvert = false }) => {
  const theme = useTheme();
  const { mode } = theme.palette;

  const [activeLink, setActiveLink] = useState('');
  useEffect(() => {
    setActiveLink(window && window.location ? window.location.pathname : '');
  }, []);

  const isHomeActive = activeLink === '/';
  const isAboutActive = activeLink === '/about';
  const isDocsActive = activeLink === '/docs' || activeLink.startsWith('/docs');
  const isServicesActive = activeLink === '/services' || activeLink === '/pricing';

  return (
    <Box
      display={'flex'}
      justifyContent={'space-between'}
      alignItems={'center'}
      width={1}
    >
      <Box
        display={'flex'}
        component="a"
        href="/"
        title="Iotistic"
        width={{ xs: 100, md: 120 }}
      >
        <Box
          component={'img'}
          alt="Iotistic Logo"
          src={
            mode === 'light' && !colorInvert
              ? '/logo-light.svg'
              : '/logo-dark.svg'
          }
          height={1}
          width={1}
        />
      </Box>
      <Box sx={{ display: { xs: 'none', md: 'flex' } }} alignItems={'center'}>
        <Box>
          <Link
            underline="none"
            component="a"
            href="/"
            sx={{ 
              display: 'flex', 
              alignItems: 'center',
              cursor: 'pointer'
            }}
          >
            <Typography
              fontWeight={isHomeActive ? 700 : 400}
              color={colorInvert ? 'common.white' : 'text.primary'}
            >
              Home
            </Typography>
          </Link>
        </Box>
        <Box marginLeft={4}>
          <Link
            underline="none"
            component="a"
            href="/about"
            sx={{ 
              display: 'flex', 
              alignItems: 'center',
              cursor: 'pointer'
            }}
          >
            <Typography
              fontWeight={isAboutActive ? 700 : 400}
              color={colorInvert ? 'common.white' : 'text.primary'}
            >
              About
            </Typography>
          </Link>
        </Box>
       
        <Box marginLeft={4}>
          <Link
            underline="none"
            component="a"
            href="/services"
            sx={{ 
              display: 'flex', 
              alignItems: 'center',
              cursor: 'pointer'
            }}
          >
            <Typography
              fontWeight={isServicesActive ? 700 : 400}
              color={colorInvert ? 'common.white' : 'text.primary'}
            >
              Pricing
            </Typography>
          </Link>
        </Box>
        <Box marginLeft={4}>
          <Button
            variant="contained"
            color="primary"
            component="a"
            href="/start-demo"
            size="small"
          >
            Get Started
          </Button>
        </Box>
      </Box>
      <Box sx={{ display: { xs: 'block', md: 'none' } }} alignItems={'center'}>
        <Button
          onClick={() => onSidebarOpen()}
          aria-label="Menu"
          variant={'outlined'}
          sx={{
            borderRadius: 2,
            minWidth: 'auto',
            padding: 1,
            borderColor: alpha(theme.palette.divider, 0.2),
          }}
        >
          <MenuIcon />
        </Button>
      </Box>
    </Box>
  );
};

Topbar.propTypes = {
  onSidebarOpen: PropTypes.func,
  colorInvert: PropTypes.bool,
};

export default Topbar;
