import React from 'react';
import { Box, Container, Typography, Breadcrumbs, Link } from '@mui/material';
import { Home as HomeIcon, Storage as DataIcon } from '@mui/icons-material';
import { ScraperDashboard } from '../components/scraper/ScraperDashboard';

export const DataCollection: React.FC = () => {
  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* Breadcrumb Navigation */}
      <Box sx={{ mb: 3 }}>
        <Breadcrumbs aria-label="breadcrumb">
          <Link
            underline="hover"
            sx={{ display: 'flex', alignItems: 'center' }}
            color="inherit"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              // Navigate to home/dashboard
            }}
          >
            <HomeIcon sx={{ mr: 0.5 }} fontSize="inherit" />
            Dashboard
          </Link>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <DataIcon sx={{ mr: 0.5 }} fontSize="inherit" />
            <Typography color="text.primary">Data Collection</Typography>
          </Box>
        </Breadcrumbs>
      </Box>

      {/* Main Content */}
      <ScraperDashboard />
      
      {/* Footer Info */}
      <Box sx={{ mt: 4, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
        <Typography variant="body2" color="text.secondary" align="center">
          Data collection runs automated scrapers to gather the latest rates and account information from financial platforms.
          All scrapers preserve existing CLI functionality while providing a modern UI interface.
        </Typography>
      </Box>
    </Container>
  );
};