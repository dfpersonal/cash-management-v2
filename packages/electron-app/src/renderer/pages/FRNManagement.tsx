import React, { useState } from 'react';
import {
  Box,
  Paper,
  Tabs,
  Tab,
  Typography,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  Visibility as ViewIcon,
  AccountBalance as BankIcon,
} from '@mui/icons-material';

// Import tab components (to be created)
import FRNDashboardTab from '../components/frn/FRNDashboardTab';
import FRNManualOverridesTab from '../components/frn/FRNManualOverridesTab';
import FRNResearchQueueTab from '../components/frn/FRNResearchQueueTab';
import FRNLookupHelperTab from '../components/frn/FRNLookupHelperTab';
import FRNBOERegistryTab from '../components/frn/FRNBOERegistryTab';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`frn-tabpanel-${index}`}
      aria-labelledby={`frn-tab-${index}`}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
};

export const FRNManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'hidden' }}>
      <Typography variant="h4" gutterBottom>
        FRN Management
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Manage Firm Reference Numbers (FRNs) for FSCS protection tracking
      </Typography>

      <Paper elevation={1} sx={{ height: 'calc(100% - 100px)', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange} aria-label="FRN management tabs">
            <Tab 
              icon={<DashboardIcon />} 
              iconPosition="start" 
              label="Dashboard" 
              id="frn-tab-0"
              aria-controls="frn-tabpanel-0"
            />
            <Tab 
              icon={<EditIcon />} 
              iconPosition="start" 
              label="Manual Overrides" 
              id="frn-tab-1"
              aria-controls="frn-tabpanel-1"
            />
            <Tab 
              icon={<SearchIcon />} 
              iconPosition="start" 
              label="Research Queue" 
              id="frn-tab-2"
              aria-controls="frn-tabpanel-2"
            />
            <Tab 
              icon={<ViewIcon />} 
              iconPosition="start" 
              label="FRN Lookup Helper" 
              id="frn-tab-3"
              aria-controls="frn-tabpanel-3"
            />
            <Tab 
              icon={<BankIcon />} 
              iconPosition="start" 
              label="BoE Registry" 
              id="frn-tab-4"
              aria-controls="frn-tabpanel-4"
            />
          </Tabs>
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <TabPanel value={activeTab} index={0}>
            <FRNDashboardTab />
          </TabPanel>
          <TabPanel value={activeTab} index={1}>
            <FRNManualOverridesTab />
          </TabPanel>
          <TabPanel value={activeTab} index={2}>
            <FRNResearchQueueTab />
          </TabPanel>
          <TabPanel value={activeTab} index={3}>
            <FRNLookupHelperTab />
          </TabPanel>
          <TabPanel value={activeTab} index={4}>
            <FRNBOERegistryTab />
          </TabPanel>
        </Box>
      </Paper>
    </Box>
  );
};