import React, { useState } from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import useMediaQuery from '@mui/material/useMediaQuery';

import Main from 'layouts/Main';
import Container from 'components/Container';
import { Hero, DocsNav, DocsContent } from './components';

const Documentation = () => {
  const theme = useTheme();
  const isMd = useMediaQuery(theme.breakpoints.up('md'), {
    defaultMatches: true,
  });

  const [selectedCategory, setSelectedCategory] = useState('getting-started');
  const [selectedDoc, setSelectedDoc] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');

  // Handle navigation
  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    // Auto-select first doc in category
    const firstDoc = getFirstDocInCategory(category);
    if (firstDoc) {
      setSelectedDoc(firstDoc);
    }
  };

  const handleDocSelect = (docId) => {
    setSelectedDoc(docId);
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
  };

  const getFirstDocInCategory = (category) => {
    // Return first doc ID for each category
    const firstDocs = {
      'getting-started': 'overview',
      'digital-twin': 'digital-twin-overview',
      'device-management': 'provisioning',
      'edge-computing': 'docker-stack',
      'data-analytics': 'influxdb-queries',
      'security': 'security-overview',
      'deployment': 'installation',
      'api-reference': 'api-overview',
      'architecture': 'system-architecture',
      'troubleshooting': 'common-issues',
    };
    return firstDocs[category] || null;
  };

  return (
    <Main>
      <Hero 
        searchQuery={searchQuery}
        onSearch={handleSearch}
      />
      <Container>
        <Grid container spacing={4}>
          <Grid item xs={12} md={3}>
            <Box
              sx={{
                position: isMd ? 'sticky' : 'static',
                top: isMd ? 80 : 0,
                maxHeight: isMd ? 'calc(100vh - 100px)' : 'auto',
                overflowY: isMd ? 'auto' : 'visible',
              }}
            >
              <DocsNav
                selectedCategory={selectedCategory}
                selectedDoc={selectedDoc}
                onCategorySelect={handleCategorySelect}
                onDocSelect={handleDocSelect}
                searchQuery={searchQuery}
              />
            </Box>
          </Grid>
          <Grid item xs={12} md={9}>
            <DocsContent
              category={selectedCategory}
              docId={selectedDoc}
              searchQuery={searchQuery}
            />
          </Grid>
        </Grid>
      </Container>
    </Main>
  );
};

export default Documentation;
