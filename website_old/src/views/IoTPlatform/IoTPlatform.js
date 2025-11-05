import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Main from 'layouts/Main';
import Container from 'components/Container';
import {
  Hero,
  Features,
  Architecture,
  UseCases,
  TechStack,
  CallToAction,
} from './components';

const IoTPlatform = () => {
  const theme = useTheme();

  return (
    <Main>
      <Hero />
      <Container>
        <Features />
      </Container>
      <Box bgcolor={theme.palette.alternate.main}>
        
      </Box>
     
      <Box bgcolor={theme.palette.alternate.main}>
        <Container>
          <UseCases />
        </Container>
      </Box>
      <Container>
        <CallToAction />
      </Container>
    </Main>
  );
};

export default IoTPlatform;
