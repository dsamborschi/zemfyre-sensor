import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';

import Main from 'layouts/Main';
import Container from 'components/Container';
import { Hero, PricingCards, ProfessionalServices, SupportLevels, EnterpriseContact } from './components';

const Services = () => {
  const theme = useTheme();

  return (
    <Main>
      <Hero />
      <Container>
        <PricingCards />
      </Container>
      <Box bgcolor={theme.palette.alternate.main}>
        <Container>
          <ProfessionalServices />
        </Container>
      </Box>
      <Container>
        <SupportLevels />
      </Container>
      <Box bgcolor={theme.palette.alternate.main}>
        <Container>
          <EnterpriseContact />
        </Container>
      </Box>
    </Main>
  );
};

export default Services;
