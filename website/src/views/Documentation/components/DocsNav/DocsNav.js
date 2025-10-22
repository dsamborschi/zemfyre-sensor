import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Collapse from '@mui/material/Collapse';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CloudIcon from '@mui/icons-material/Cloud';
import DevicesIcon from '@mui/icons-material/Devices';
import MemoryIcon from '@mui/icons-material/Memory';
import TimelineIcon from '@mui/icons-material/Timeline';
import SecurityIcon from '@mui/icons-material/Security';
import DeploymentIcon from '@mui/icons-material/CloudUpload';
import ApiIcon from '@mui/icons-material/Api';
import ArchitectureIcon from '@mui/icons-material/AccountTree';
import BugReportIcon from '@mui/icons-material/BugReport';

const categories = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    icon: RocketLaunchIcon,
    docs: [
      { id: 'overview', label: 'Platform Overview' },
      { id: 'quick-start', label: 'Quick Start Guide' },
      { id: 'installation', label: 'Installation' },
      { id: 'first-device', label: 'Add Your First Device' },
      { id: 'first-twin', label: 'Create Your First Twin' },
    ],
  },
  {
    id: 'digital-twin',
    label: 'Digital Twins',
    icon: CloudIcon,
    docs: [
      { id: 'digital-twin-overview', label: 'Digital Twin Overview' },
      { id: 'device-shadows', label: 'Device Shadows' },
      { id: 'shadow-api', label: 'Shadow API Reference' },
      { id: 'twin-relationships', label: 'Twin Relationships' },
      { id: 'twin-hierarchies', label: 'Building Hierarchies' },
      { id: 'shadow-mqtt', label: 'MQTT Topics' },
      { id: 'shadow-examples', label: 'Code Examples' },
    ],
  },
  {
    id: 'device-management',
    label: 'Device Management',
    icon: DevicesIcon,
    docs: [
      { id: 'provisioning', label: 'Device Provisioning' },
      { id: 'api-keys', label: 'API Key Management' },
      { id: 'remote-config', label: 'Remote Configuration' },
      { id: 'ota-updates', label: 'OTA Updates' },
      { id: 'job-engine', label: 'Job Engine' },
      { id: 'device-groups', label: 'Device Groups' },
      { id: 'health-monitoring', label: 'Health Monitoring' },
    ],
  },
  {
    id: 'edge-computing',
    label: 'Edge Computing',
    icon: MemoryIcon,
    docs: [
      { id: 'docker-stack', label: 'Docker Stack' },
      { id: 'mqtt-broker', label: 'MQTT Broker' },
      { id: 'influxdb', label: 'InfluxDB Setup' },
      { id: 'grafana', label: 'Grafana Dashboards' },
      { id: 'nodered', label: 'Node-RED Flows' },
      { id: 'ml-service', label: 'ML Service' },
      { id: 'multi-arch', label: 'Multi-Architecture' },
    ],
  },
  {
    id: 'data-analytics',
    label: 'Data & Analytics',
    icon: TimelineIcon,
    docs: [
      { id: 'influxdb-queries', label: 'InfluxDB Queries' },
      { id: 'grafana-dashboards', label: 'Custom Dashboards' },
      { id: 'ml-models', label: 'ML Models' },
      { id: 'data-export', label: 'Data Export' },
      { id: 'alerting', label: 'Alerting System' },
      { id: 'twin-analytics', label: 'Twin Analytics' },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    icon: SecurityIcon,
    docs: [
      { id: 'security-overview', label: 'Security Overview' },
      { id: 'authentication', label: 'Authentication' },
      { id: 'mqtt-tls', label: 'MQTT TLS/SSL' },
      { id: 'api-security', label: 'API Security' },
      { id: 'encryption', label: 'Encryption' },
      { id: 'audit-logs', label: 'Audit Logging' },
      { id: 'compliance', label: 'Compliance (GDPR)' },
    ],
  },
  {
    id: 'deployment',
    label: 'Deployment',
    icon: DeploymentIcon,
    docs: [
      { id: 'installation', label: 'Installation Script' },
      { id: 'ansible', label: 'Ansible Deployment' },
      { id: 'docker-compose', label: 'Docker Compose' },
      { id: 'cloud-deployment', label: 'Cloud Deployment' },
      { id: 'monitoring', label: 'Monitoring & Logging' },
      { id: 'backup-restore', label: 'Backup & Restore' },
    ],
  },
  {
    id: 'api-reference',
    label: 'API Reference',
    icon: ApiIcon,
    docs: [
      { id: 'api-overview', label: 'API Overview' },
      { id: 'device-api', label: 'Device API' },
      { id: 'shadow-api', label: 'Shadow API' },
      { id: 'provisioning-api', label: 'Provisioning API' },
      { id: 'job-api', label: 'Job API' },
      { id: 'mqtt-api', label: 'MQTT API' },
      { id: 'webhook-api', label: 'Webhook API' },
    ],
  },
  {
    id: 'architecture',
    label: 'Architecture',
    icon: ArchitectureIcon,
    docs: [
      { id: 'system-architecture', label: 'System Architecture' },
      { id: 'service-communication', label: 'Service Communication' },
      { id: 'database-schema', label: 'Database Schema' },
      { id: 'event-sourcing', label: 'Event Sourcing' },
      { id: 'mqtt-topics', label: 'MQTT Topic Structure' },
      { id: 'container-orchestration', label: 'Container Orchestration' },
    ],
  },
  {
    id: 'troubleshooting',
    label: 'Troubleshooting',
    icon: BugReportIcon,
    docs: [
      { id: 'common-issues', label: 'Common Issues' },
      { id: 'docker-issues', label: 'Docker Issues' },
      { id: 'mqtt-issues', label: 'MQTT Issues' },
      { id: 'network-issues', label: 'Network Issues' },
      { id: 'performance', label: 'Performance Tuning' },
      { id: 'logs', label: 'Reading Logs' },
    ],
  },
];

const DocsNav = ({ 
  selectedCategory, 
  selectedDoc, 
  onCategorySelect, 
  onDocSelect,
  searchQuery 
}) => {
  const theme = useTheme();
  const [openCategories, setOpenCategories] = React.useState([selectedCategory]);

  const handleCategoryClick = (categoryId) => {
    if (openCategories.includes(categoryId)) {
      setOpenCategories(openCategories.filter(id => id !== categoryId));
    } else {
      setOpenCategories([...openCategories, categoryId]);
    }
    onCategorySelect(categoryId);
  };

  // Filter categories and docs based on search
  const filteredCategories = searchQuery
    ? categories.map(cat => ({
        ...cat,
        docs: cat.docs.filter(doc => 
          doc.label.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter(cat => cat.docs.length > 0)
    : categories;

  return (
    <Box
      sx={{
        bgcolor: theme.palette.alternate.main,
        borderRadius: 2,
        p: 2,
      }}
    >
      <Typography variant="h6" fontWeight={700} gutterBottom>
        Documentation
      </Typography>
      
      <List component="nav" disablePadding>
        {filteredCategories.map((category) => {
          const Icon = category.icon;
          const isOpen = openCategories.includes(category.id);
          const isSelected = selectedCategory === category.id;
          
          return (
            <Box key={category.id}>
              <ListItem disablePadding>
                <ListItemButton
                  onClick={() => handleCategoryClick(category.id)}
                  selected={isSelected}
                  sx={{
                    borderRadius: 1,
                    mb: 0.5,
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <Icon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText 
                    primary={category.label}
                    primaryTypographyProps={{
                      fontWeight: isSelected ? 700 : 500,
                      fontSize: '0.9rem',
                    }}
                  />
                  {isOpen ? <ExpandLess /> : <ExpandMore />}
                </ListItemButton>
              </ListItem>
              
              <Collapse in={isOpen} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {category.docs.map((doc) => (
                    <ListItem key={doc.id} disablePadding>
                      <ListItemButton
                        onClick={() => onDocSelect(doc.id)}
                        selected={selectedDoc === doc.id}
                        sx={{
                          pl: 6,
                          borderRadius: 1,
                          mb: 0.5,
                        }}
                      >
                        <ListItemText 
                          primary={doc.label}
                          primaryTypographyProps={{
                            fontSize: '0.85rem',
                            fontWeight: selectedDoc === doc.id ? 600 : 400,
                          }}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </Collapse>
            </Box>
          );
        })}
      </List>
    </Box>
  );
};

export default DocsNav;
