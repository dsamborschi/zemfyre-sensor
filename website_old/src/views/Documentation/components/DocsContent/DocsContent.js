import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import GitHubIcon from '@mui/icons-material/GitHub';
import LinkIcon from '@mui/icons-material/Link';

// Documentation content database
import { documentContent } from './documentContent';

const DocsContent = ({ category, docId, searchQuery }) => {
  const theme = useTheme();
  
  const content = documentContent[docId] || {
    title: 'Documentation Not Found',
    description: 'This documentation page is being prepared.',
    sections: [],
    tags: [],
  };

  // Highlight search terms
  const highlightText = (text) => {
    if (!searchQuery) return text;
    const regex = new RegExp(`(${searchQuery})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  };

  return (
    <Box>
      {/* Header */}
      <Box mb={4}>
        <Typography variant="h3" fontWeight={700} gutterBottom>
          {content.title}
        </Typography>
        <Typography variant="h6" color="text.secondary" paragraph>
          {content.description}
        </Typography>
        
        {content.tags && content.tags.length > 0 && (
          <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
            {content.tags.map((tag, index) => (
              <Chip key={index} label={tag} size="small" />
            ))}
          </Box>
        )}

        {content.githubPath && (
          <Box display="flex" gap={2} mt={2}>
            <Button
              variant="outlined"
              startIcon={<GitHubIcon />}
              size="small"
              href={`https://github.com/dsamborschi/Iotistic-sensor/tree/master/${content.githubPath}`}
              target="_blank"
            >
              View on GitHub
            </Button>
            {content.relatedLinks && content.relatedLinks.length > 0 && (
              content.relatedLinks.map((link, index) => (
                <Button
                  key={index}
                  variant="text"
                  startIcon={<LinkIcon />}
                  size="small"
                  href={link.url}
                >
                  {link.label}
                </Button>
              ))
            )}
          </Box>
        )}
      </Box>

      <Divider sx={{ mb: 4 }} />

      {/* Content Sections */}
      {content.sections && content.sections.map((section, index) => (
        <Box key={index} mb={4}>
          {section.type === 'heading' && (
            <Typography variant="h4" fontWeight={700} gutterBottom>
              {section.content}
            </Typography>
          )}

          {section.type === 'text' && (
            <Typography variant="body1" paragraph>
              {section.content}
            </Typography>
          )}

          {section.type === 'alert' && (
            <Alert severity={section.severity || 'info'} sx={{ mb: 2 }}>
              {section.content}
            </Alert>
          )}

          {section.type === 'code' && (
            <Card sx={{ mb: 2, bgcolor: theme.palette.alternate.dark }}>
              <CardContent>
                <Typography
                  component="pre"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    overflow: 'auto',
                    m: 0,
                  }}
                >
                  {section.content}
                </Typography>
              </CardContent>
            </Card>
          )}

          {section.type === 'list' && (
            <Box component="ul" sx={{ pl: 3 }}>
              {section.items.map((item, i) => (
                <Typography component="li" key={i} variant="body1" paragraph>
                  {item}
                </Typography>
              ))}
            </Box>
          )}

          {section.type === 'table' && (
            <Card sx={{ mb: 2 }}>
              <Box sx={{ overflowX: 'auto' }}>
                <Box
                  component="table"
                  sx={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    '& th': {
                      bgcolor: theme.palette.alternate.main,
                      fontWeight: 700,
                      p: 2,
                      textAlign: 'left',
                      borderBottom: `2px solid ${theme.palette.divider}`,
                    },
                    '& td': {
                      p: 2,
                      borderBottom: `1px solid ${theme.palette.divider}`,
                    },
                  }}
                >
                  <thead>
                    <tr>
                      {section.headers.map((header, i) => (
                        <th key={i}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </Box>
              </Box>
            </Card>
          )}
        </Box>
      ))}

      {/* Next Steps */}
      {content.nextSteps && (
        <Box mt={6}>
          <Divider sx={{ mb: 3 }} />
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Next Steps
          </Typography>
          <Box display="flex" flexDirection="column" gap={2}>
            {content.nextSteps.map((step, index) => (
              <Button
                key={index}
                variant="outlined"
                fullWidth
                sx={{ justifyContent: 'flex-start' }}
                href={step.url}
              >
                {step.label}
              </Button>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default DocsContent;
