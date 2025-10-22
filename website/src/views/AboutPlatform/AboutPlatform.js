import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Main from 'layouts/Main';
import Container from 'components/Container';
import {
  Hero,
  Mission,
  Values,
  Team,
} from './components';

const AboutPlatform = () => {
  const theme = useTheme();

  return (
    <Main>
      <Hero />
      <Container>
        <Mission />
      </Container>
      <Box bgcolor={theme.palette.alternate.main}>
        <Container>
          <Values />
        </Container>
      </Box>
      <Container>
        <Team />
      </Container>
    </Main>
  );
};

export default AboutPlatform;
