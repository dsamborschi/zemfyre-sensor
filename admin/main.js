const {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  TreeView,
  TreeItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip
} = MaterialUI;

const API_BASE_URL = "http://localhost:53001"; 


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
  const slides = [
    {
      title: "Welcome to Zemfyre",
      content: ""
    },
    {
      title: "About Us",
      content: "Zemfyre is a leading provider of innovative patent-pending Industrial Ethernet Solutions for enabling secure IIoT Cloud connectivity and acceleration of Industry 4.0 adoption. Zemfyre uses the latest game-changing Single Pair Ethernet (SPE) standard to provide seamless secure Ethernet connectivity and power to Field level IIoT devices (sensors and actuators)."
    },
    {
      title: "Our Technology",
      content: "Zemfyre develops and manufactures innovative industrial communication solutions based on revolutionary Single Pair Ethernet (SPE) and Zemfyre’s patent-pending technology."
    },
    {
      title: "Let’s Talk",
      content: "Whether it’s about our products, partnerships, or design services, we’d love to hear from you. Visit zemfyre.com or email info@zemfyre.com for more information."
    }
  ];
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % slides.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [slides.length]);

  return (
    <Box
      height="100%"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      textAlign="left"
      sx={{ minHeight: 300 }}
    >
      <Typography variant="h3" gutterBottom sx={{ textAlign: 'left', width: '100%', maxWidth: 600 }}>
        {slides[index].title}
      </Typography>
      <Box maxWidth={600} width="100%" display="flex" flexDirection="column" alignItems="flex-start">
        <Typography variant="subtitle1" gutterBottom component="div" sx={{ textAlign: 'left', width: '100%' }}>
          {slides[index].content}
        </Typography>
      </Box>
    </Box>
  );
}

function App() {
  const [view, setView] = React.useState("home");
  const [kioskMode, setKioskMode] = React.useState(false);

  const grafanaURL =
    "http://localhost:53000/d/deqcaxn5g7vnkd/zus80lp-compact?orgId=1&refresh=auto&from=now-5m&to=now&kiosk";
  const noderedURL = "http://localhost:51880/";
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
            <Button color="inherit" onClick={() => setView("home")}>
              Home
            </Button>
            <Button color="inherit" onClick={() => setView("apps")}>
              Apps
            </Button>
            <Button color="inherit" onClick={() => setView("dashboard")}>
              Dashboards
            </Button>
            <Button color="inherit" onClick={() => setView("nodered")}>
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