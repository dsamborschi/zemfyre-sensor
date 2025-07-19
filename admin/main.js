const { AppBar, Toolbar, Typography, Button, Box, TreeView, TreeItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Tooltip, Menu, MenuItem, CircularProgress } = MaterialUI;

const API_BASE_URL = "http://localhost:53001";
const GRAFANA_API_URL = "http://localhost/apps/grafana/api/search?type=dash-db"; 
const GRAFANA_API_TOKEN = process.env.GRAFANA_URL || 'http://localhost:3000';


function insertIntoTree(tree, topic, value) {
  const parts = topic.split("/");
  let current = tree;

  parts.forEach((part, idx) => {
    if (!current[part]) {
      current[part] = {};
    }
    if (idx === parts.length - 1) {
      current[part]._value = value.toString();
    }
    current = current[part];
  });
}

function renderTree(node, nodeIdPrefix = "") {
  return Object.entries(node)
    .filter(([key]) => key !== "_value")
    .map(([key, child]) => {
      const nodeId = `${nodeIdPrefix}/${key}`;
      const label =
        child._value !== undefined ? `${key}: ${child._value}` : key;

      return (
        <TreeItem key={nodeId} nodeId={nodeId} label={label}>
          {renderTree(child, nodeId)}
        </TreeItem>
      );
    });
}

function MqttTreeWithValues() {
  const [tree, setTree] = React.useState({});

  React.useEffect(() => {
    const client = mqtt.connect("mqtt://localhost:5883");

    client.on("connect", () => {
      console.log("Connected to MQTT broker");
      client.subscribe("#");
    });

    client.on("message", (topic, message) => {
      setTree(prevTree => {
        const newTree = JSON.parse(JSON.stringify(prevTree));
        insertIntoTree(newTree, topic, message);
        return newTree;
      });
    });

    return () => {
      client.end();
    };
  }, []);

  return (
    <Box
      sx={{
        border: "1px solid #ccc",
        borderRadius: 2,
        padding: 2,
        width: "100%",
        maxHeight: "80vh",
        overflow: "auto"
      }}
    >
      <Typography variant="h6" gutterBottom>
        MQTT Topic Tree
      </Typography>
        <TreeView
        defaultCollapseIcon="▼"
        defaultExpandIcon="▶"
        >
        {renderTree(tree)}
      </TreeView>
    </Box>
  );
}

function ContainersTable() {
  const [containers, setContainers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [restartingId, setRestartingId] = React.useState(null);

  const fetchContainers = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/containers`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch containers");
        return res.json();
      })
      .then(data => {
        setContainers(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  React.useEffect(() => {
    fetchContainers();
  }, []);

  const handleRestart = async (id) => {
    // Optimistically set state to 'restarting' for immediate feedback
    setContainers(prev => prev.map(c =>
      c.id === id ? { ...c, state: "restarting", status: "Restarting..." } : c
    ));
    setRestartingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/containers/${id}/restart`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to restart container");
      // Fetch only the updated container info
      const updatedRes = await fetch(`${API_BASE_URL}/containers`);
      if (!updatedRes.ok) throw new Error("Failed to fetch containers");
      const updatedContainers = await updatedRes.json();
      setContainers(prev => prev.map(c =>
        c.id === id ? updatedContainers.find(u => u.id === id) || c : c
      ));
    } catch (err) {
      alert("Restart failed: " + err.message);
    } finally {
      setRestartingId(null);
    }
  };

  if (loading) return <Typography>Loading containers...</Typography>;
  if (error) return <Typography color="error">{error}</Typography>;

  return (
    <TableContainer component={Paper} sx={{ maxWidth: 900, margin: 'auto', mt: 2 }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Names</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>State</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="center">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {containers.map(c => (
            <TableRow key={c.id}>
              <TableCell>{c.names.join(", ")}</TableCell>
              <TableCell>{c.image}</TableCell>
              <TableCell>{c.state}</TableCell>
              <TableCell>{c.status}</TableCell>
              <TableCell align="center">
                <Tooltip title="Restart Container">
                  <IconButton
                    color="primary"
                    onClick={() => handleRestart(c.id)}
                    disabled={restartingId === c.id}
                    size="small"
                  >
                    <i className="fas fa-sync" style={{ fontSize: 18 }}></i>
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function HomeSlides() {
  const [slides, setSlides] = React.useState([]);
  const [index, setIndex] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [htmlContent, setHtmlContent] = React.useState("");

  React.useEffect(() => {
    fetch('./public/slides.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load slides');
        return res.json();
      })
      .then(data => {
        setSlides(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    if (!slides.length) return;
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % slides.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [slides.length]);

  React.useEffect(() => {
    if (!slides.length) return;
    const file = slides[index].file;
    if (!file) { setHtmlContent(""); return; }
    fetch('./public/' + file)
      .then(res => res.text())
      .then(setHtmlContent)
      .catch(() => setHtmlContent("<div>Failed to load content.</div>"));
  }, [slides, index]);

  if (loading) return <Typography>Loading slides...</Typography>;
  if (error) return <Typography color="error">{error}</Typography>;
  if (!slides.length) return null;

  return (
    <Box
      height="100%"
      display="flex"
      flexDirection="column"
      alignItems="center" // center the block horizontally
      justifyContent="center"
      sx={{ minHeight: 300 }}
    >
      <Box maxWidth={600} width="100%" display="flex" flexDirection="column" alignItems="flex-start">
        <Typography variant="h3" gutterBottom sx={{ textAlign: 'left', width: '100%' }}>
          {slides[index].title}
        </Typography>
        <Typography variant="subtitle1" gutterBottom component="div" sx={{ textAlign: 'left', width: '100%' }}>
          <span dangerouslySetInnerHTML={{ __html: htmlContent }} />
        </Typography>
      </Box>
    </Box>
  );
}

function App() {
  const [view, setView] = React.useState("dashboard");
  const [kioskMode, setKioskMode] = React.useState(false);
  // Grafana dashboards state
  const [dashboards, setDashboards] = React.useState([]);
  const [dashboardsLoading, setDashboardsLoading] = React.useState(false);
  const [dashboardsError, setDashboardsError] = React.useState(null);
  const [selectedDashboard, setSelectedDashboard] = React.useState(null);
  const [dashboardMenuAnchor, setDashboardMenuAnchor] = React.useState(null);

  // Fetch dashboards from Grafana API
  React.useEffect(() => {
    setDashboardsLoading(true);
    fetch(GRAFANA_API_URL, {
      headers: {
        "Authorization": `Bearer ${GRAFANA_API_TOKEN}`
      }
    })
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch dashboards");
        return res.json();
      })
      .then(data => {
        setDashboards(data);
        setDashboardsLoading(false);
      })
      .catch(err => {
        setDashboardsError(err.message);
        setDashboardsLoading(false);
      });
  }, []);

  // Compute Grafana iframe URL
  const grafanaURL = selectedDashboard
    ? `http://localhost/apps/grafana/d/${selectedDashboard.uid || selectedDashboard.id}/${selectedDashboard.slug || selectedDashboard.uri.replace('db/', '')}?orgId=1&refresh=auto&from=now-5m&to=now&kiosk`
    : "http://localhost/apps/grafana/d/deqcaxn5g7vnkd/zus80lp-compact?orgId=1&refresh=auto&from=now-5m&to=now&kiosk";
  const noderedURL = "http://localhost/apps/nodered/";
  const appsURL = "http://localhost:59000/#!/3/docker/containers";

  return (
    <Box display="flex" flexDirection="column" height="100vh">
      {!kioskMode && (
        <AppBar position="static" style={{ backgroundColor: "#0A2239" }}>
          <Toolbar>
            <Box sx={{ flexGrow: 1 }}>
              <img
                src="./public/images/logo.svg"
                alt="Zemfyre"
                style={{ height: 40 }}
              />
            </Box>
            <Button 
              color="inherit" 
              onClick={() => setView("home")}
              style={{ 
                backgroundColor: view === "home" ? "rgba(255,255,255,0.1)" : "transparent",
                fontWeight: view === "home" ? "bold" : "normal"
              }}
            >
              Home
            </Button>
            <Button 
              color="inherit" 
              onClick={() => setView("apps")}
              style={{ 
                backgroundColor: view === "apps" ? "rgba(255,255,255,0.1)" : "transparent",
                fontWeight: view === "apps" ? "bold" : "normal"
              }}
            >
              Apps
            </Button>
            {/* Dashboards dropdown */}
            <Button
              color="inherit"
              onClick={e => setDashboardMenuAnchor(e.currentTarget)}
              style={{
                backgroundColor: view === "dashboard" ? "rgba(255,255,255,0.1)" : "transparent",
                fontWeight: view === "dashboard" ? "bold" : "normal"
              }}
            >
              Dashboards
            </Button>
            <Menu
              anchorEl={dashboardMenuAnchor}
              open={Boolean(dashboardMenuAnchor)}
              onClose={() => setDashboardMenuAnchor(null)}
            >
              {dashboardsLoading && (
                <MenuItem><CircularProgress size={20} /> Loading...</MenuItem>
              )}
              {dashboardsError && (
                <MenuItem disabled>Error: {dashboardsError}</MenuItem>
              )}
              {dashboards && dashboards.length > 0 && dashboards.map(d => (
                <MenuItem
                  key={d.uid || d.id || d.uri}
                  onClick={() => {
                    setSelectedDashboard(d);
                    setDashboardMenuAnchor(null);
                    setView("dashboard");
                  }}
                >
                  {d.title || d.name || d.uri}
                </MenuItem>
              ))}
              {(!dashboardsLoading && dashboards && dashboards.length === 0) && (
                <MenuItem disabled>No dashboards found</MenuItem>
              )}
            </Menu>
            <Button 
              color="inherit" 
              onClick={() => setView("nodered")}
              style={{ 
                backgroundColor: view === "nodered" ? "rgba(255,255,255,0.1)" : "transparent",
                fontWeight: view === "nodered" ? "bold" : "normal"
              }}
            >
              Node-Red
            </Button>
            {/* <Button color="inherit" onClick={() => setView("mqtt")}>
              MQTT
            </Button> */}
            {/* <Button color="inherit" onClick={() => setView("settings")}>
              Settings
            </Button> */}
            <Button color="inherit" onClick={() => setKioskMode(true)} style={{ minWidth: 40, padding: 0 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="5" width="18" height="14" rx="2" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="2"/>
                <rect x="7" y="9" width="10" height="6" rx="1" fill="currentColor"/>
                <rect x="10" y="17" width="4" height="2" rx="1" fill="currentColor"/>
              </svg>
            </Button>
          </Toolbar>
        </AppBar>
      )}

      <Box flexGrow={1} overflow="hidden">
        {view === "home" && !kioskMode && (
          <HomeSlides />
        )}

        {view === "settings" && !kioskMode && (
          <Box
            height="100%"
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            textAlign="center"
          >
            <Typography variant="h3" gutterBottom>
              Settings
            </Typography>
          </Box>
        )}

        {/* {view === "apps" && !kioskMode && (
          <Box
            height="100%"
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            textAlign="center"
            p={2}
          >
    
            <ContainersTable />
          </Box>
        )} */}

        {view === "mqtt" && !kioskMode && (
          <Box
            height="100%"
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="flex-start"
            p={2}
          >
            <MqttTreeWithValues />
          </Box>
        )}

        {view === "dashboard" && (
          <Box height="100%" position="relative">
            {kioskMode && (
              <Button
                variant="contained"
                size="small"
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  zIndex: 10,
                  minWidth: 36,
                  padding: 4
                }}
                onClick={() => setKioskMode(false)}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="5" width="14" height="10" rx="2" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M7 13L13 7M13 13L7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </Button>
            )}
            <iframe
              src={grafanaURL}
              title="Grafana Dashboard"
              width="100%"
              height="100%"
              frameBorder="0"
              style={{ border: 0 }}
            ></iframe>
          </Box>
        )}

         {view === "nodered" && (
          <Box height="100%" position="relative">
            {kioskMode && (
              <Button
                variant="contained"
                size="small"
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  zIndex: 10,
                  minWidth: 36,
                  padding: 4
                }}
                onClick={() => setKioskMode(false)}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="5" width="14" height="10" rx="2" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M7 13L13 7M13 13L7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </Button>
            )}
            <iframe
              src={noderedURL}
              title="Node-Red"
              width="100%"
              height="100%"
              frameBorder="0"
              style={{ border: 0 }}
            ></iframe>
          </Box>
        )}
         {view === "apps" && (
          <Box height="100%" position="relative">
            {kioskMode && (
              <Button
                variant="contained"
                size="small"
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  zIndex: 10,
                  minWidth: 36,
                  padding: 4
                }}
                onClick={() => setKioskMode(false)}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="5" width="14" height="10" rx="2" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M7 13L13 7M13 13L7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </Button>
            )}
            <iframe
              src={appsURL}
              title="Apps"
              width="100%"
              height="100%"
              frameBorder="0"
              style={{ border: 0 }}
            ></iframe>
          </Box>
        )}
      </Box>
    </Box>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));