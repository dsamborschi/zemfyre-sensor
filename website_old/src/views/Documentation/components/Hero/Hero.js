import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/Search';
import MenuBookIcon from '@mui/icons-material/MenuBook';

const Hero = ({ searchQuery, onSearch }) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
        py: 8,
        color: 'white',
      }}
    >
      <Box textAlign="center" maxWidth={800} mx="auto" px={2}>
        <MenuBookIcon sx={{ fontSize: 60, mb: 2, opacity: 0.9 }} />
        <Typography variant="h2" fontWeight={700} gutterBottom>
          Documentation
        </Typography>
        <Typography variant="h5" sx={{ mb: 4, opacity: 0.9 }}>
          Complete guides, API references, and tutorials for the IoT platform
        </Typography>
        
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search documentation..."
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            sx: {
              bgcolor: 'white',
              borderRadius: 2,
            },
          }}
          sx={{
            maxWidth: 600,
            mx: 'auto',
          }}
        />

        <Box display="flex" justifyContent="center" gap={4} mt={4}>
          <Box>
            <Typography variant="h4" fontWeight={700}>
              300+
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Documentation Files
            </Typography>
          </Box>
          <Box>
            <Typography variant="h4" fontWeight={700}>
              10
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Categories
            </Typography>
          </Box>
          <Box>
            <Typography variant="h4" fontWeight={700}>
              100%
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Open Source
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default Hero;
