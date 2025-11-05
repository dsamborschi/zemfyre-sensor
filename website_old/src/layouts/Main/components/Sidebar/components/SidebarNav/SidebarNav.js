import React from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';

import NavItem from './components/NavItem';

const SidebarNav = ({ pages }) => {
  const theme = useTheme();
  const { mode } = theme.palette;

  const {
    platform: platformPages,
    resources: resourcesPages,
    company: companyPages,
  } = pages;

  return (
    <Box>
      <Box width={1} paddingX={2} paddingY={1}>
        <Box
          display={'flex'}
          component="a"
          href="/"
          title="Iotistic"
          width={{ xs: 100, md: 120 }}
        >
          <Box
            component={'img'}
            src={
              mode === 'light'
                ? '/logo-light.svg'
                : '/logo-dark.svg'
            }
            height={1}
            width={1}
            alt="Iotistic Logo"
          />
        </Box>
      </Box>
      <Box paddingX={2} paddingY={2}>
        <Box>
          <NavItem title={'Platform'} items={platformPages} />
        </Box>
        <Box>
          <NavItem title={'Resources'} items={resourcesPages} />
        </Box>
        <Box>
          <NavItem title={'Company'} items={companyPages} />
        </Box>
        <Box marginTop={2}>
          <Button
            size={'large'}
            variant="contained"
            color="primary"
            fullWidth
            component="a"
            href="/services#contact"
          >
            Get Started
          </Button>
        </Box>
        <Box marginTop={1}>
          <Button
            size={'large'}
            variant="outlined"
            fullWidth
            component="a"
            href="/docs"
          >
            Documentation
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

SidebarNav.propTypes = {
  pages: PropTypes.object.isRequired,
};

export default SidebarNav;
