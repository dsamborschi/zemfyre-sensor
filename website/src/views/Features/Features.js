import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Main from 'layouts/Main';
import Container from 'components/Container';
import {
  Hero,
  DigitalTwinPlatform,
  EdgeComputing,
  DeviceManagement,
  DataAnalytics,
  SecurityCompliance,
  DeploymentOperations,
} from './components';

const Features = () => {
  const theme = useTheme();

  return (
    <Main>
      <Hero />
      <Container>
        <DigitalTwinPlatform />
      </Container>
      <Box bgcolor={theme.palette.alternate.main}>
        <Container>
          <EdgeComputing />
        </Container>
      </Box>
      <Container>
        <DeviceManagement />
      </Container>
      <Box bgcolor={theme.palette.alternate.main}>
        <Container>
          <DataAnalytics />
        </Container>
      </Box>
      <Container>
        <SecurityCompliance />
      </Container>
      <Box bgcolor={theme.palette.alternate.main}>
        <Container>
          <DeploymentOperations />
        </Container>
      </Box>
    </Main>
  );
};

export default Features;
