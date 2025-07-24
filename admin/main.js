function Settings() {
  // Alert rules state
  const [alertRules, setAlertRules] = React.useState([]);
  const [alertRulesLoading, setAlertRulesLoading] = React.useState(false);
  const [alertRulesError, setAlertRulesError] = React.useState(null);
  const [thresholdEdits, setThresholdEdits] = React.useState({});
  const [thresholdStatus, setThresholdStatus] = React.useState({});

  // Fetch alert rules on mount
  React.useEffect(() => {
    setAlertRulesLoading(true);
    fetch(`${API_BASE_URL}/grafana/alert-rules`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch alert rules");
        return res.json();
      })
      .then(data => {
        setAlertRules(data);
        setAlertRulesLoading(false);
      })
      .catch(err => {
        setAlertRulesError(err.message);
        setAlertRulesLoading(false);
      });
  }, []);

  const handleThresholdEdit = (uid, value) => {
    setThresholdEdits(prev => ({ ...prev, [uid]: value }));
  };

  const handleThresholdUpdate = (uid) => {
    const new_threshold = thresholdEdits[uid];
    if (new_threshold === undefined || new_threshold === "") return;
    setThresholdStatus(prev => ({ ...prev, [uid]: "updating" }));
    fetch(`${API_BASE_URL}/grafana/update-alert-threshold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule_uid: uid, new_threshold })
    })
      .then(res => res.json())
      .then(data => {
        setThresholdStatus(prev => ({ ...prev, [uid]: data.error ? "error" : "success" }));
        if (!data.error) {
          setTimeout(() => setThresholdStatus(prev => ({ ...prev, [uid]: undefined })), 2000);
        }
      })
      .catch(() => setThresholdStatus(prev => ({ ...prev, [uid]: "error" })));
  };
  const [dashboards, setDashboards] = React.useState([]);
  const [dashboardsLoading, setDashboardsLoading] = React.useState(false);
  const [dashboardsError, setDashboardsError] = React.useState(null);
  const [selectedDashboard, setSelectedDashboard] = React.useState(null);
  const [variables, setVariables] = React.useState([]);
  const [variablesLoading, setVariablesLoading] = React.useState(false);
  const [variablesError, setVariablesError] = React.useState(null);
  const [varEdits, setVarEdits] = React.useState({});
  const [updateStatus, setUpdateStatus] = React.useState({});

  // Fetch dashboards on mount
  React.useEffect(() => {
    setDashboardsLoading(true);
    fetch(`${API_BASE_URL}/grafana/dashboards`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch dashboards");
        return res.json();
      })
      .then(data => {
        setDashboards(data);
        // Preselect ZUS80LP_compact dashboard if present
        const zusDashboard = data.find(d => {
          const title = (d.title || d.name || d.uri || "").toLowerCase();
          return title.includes("zus80lp_compact");
        });
        if (zusDashboard) {
          setSelectedDashboard(zusDashboard);
        }
        setDashboardsLoading(false);
      })
      .catch(err => {
        setDashboardsError(err.message);
        setDashboardsLoading(false);
      });
  }, []);

  // Fetch variables when dashboard selected
  React.useEffect(() => {
    if (!selectedDashboard) return;
    setVariablesLoading(true);
    setVariables([]);
    setVariablesError(null);
    fetch(`${API_BASE_URL}/grafana/dashboards/${selectedDashboard.uid}/variables`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch variables");
        return res.json();
      })
      .then(data => {
        setVariables(data);
        setVarEdits({});
        setVariablesLoading(false);
      })
      .catch(err => {
        setVariablesError(err.message);
        setVariablesLoading(false);
      });
  }, [selectedDashboard]);

  const handleVarEdit = (name, value) => {
    setVarEdits(prev => ({ ...prev, [name]: value }));
  };

  const handleVarUpdate = (name) => {
    const value = varEdits[name];
    if (!value) return;
    setUpdateStatus(prev => ({ ...prev, [name]: 'updating' }));
    fetch(`${API_BASE_URL}/grafana/dashboards/${selectedDashboard.uid}/variables/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    })
      .then(res => res.json())
      .then(data => {
        setUpdateStatus(prev => ({ ...prev, [name]: data.error ? 'error' : 'success' }));
        // Optionally refresh variables
        if (!data.error) {
          setTimeout(() => setUpdateStatus(prev => ({ ...prev, [name]: undefined })), 2000);
        }
      })
      .catch(() => setUpdateStatus(prev => ({ ...prev, [name]: 'error' })));
  };

  return (
    <Box width="100%" textAlign="left" mt={2}>
      <Typography variant="h5" gutterBottom>Grafana Variables</Typography>
      {dashboardsLoading && <Typography>Loading dashboards...</Typography>}
      {dashboardsError && <Typography color="error">{dashboardsError}</Typography>}
      <Box mb={2}>
        <Typography variant="subtitle1">Select Dashboard:</Typography>
        <Box sx={{ minWidth: 250, mt: 1, mb: 2 }}>
          <MaterialUI.FormControl fullWidth size="small">
            <MaterialUI.Select
              labelId="dashboard-select-label"
              value={selectedDashboard ? selectedDashboard.uid : ''}
              label="Dashboard"
              onChange={e => {
                const d = dashboards.find(d => d.uid === e.target.value);
                setSelectedDashboard(d || null);
              }}
            >
              <MaterialUI.MenuItem value="">-- Select --</MaterialUI.MenuItem>
              {dashboards.map(d => (
                <MaterialUI.MenuItem key={d.uid || d.id} value={d.uid}>{d.title || d.name || d.uri}</MaterialUI.MenuItem>
              ))}
            </MaterialUI.Select>
          </MaterialUI.FormControl>
        </Box>
      </Box>
      {variablesLoading && <Typography>Loading variables...</Typography>}
      {variablesError && <Typography color="error">{variablesError}</Typography>}
      {selectedDashboard && !variablesLoading && variables.length === 0 && (
        <Typography>No variables found for this dashboard.</Typography>
      )}
      {variables.length > 0 && (
        <Box component="form" autoComplete="off" onSubmit={e => e.preventDefault()}>
          <TableContainer component={Paper} sx={{ maxWidth: 600 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Variable</TableCell>
                  <TableCell>Current Value</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {variables.map(v => (
                  <TableRow key={v.name}>
                    <TableCell>{v.label}</TableCell>
                    <TableCell>
                      <MaterialUI.TextField
                        size="small"
                        value={varEdits[v.name] !== undefined ? varEdits[v.name] : (v.current?.value || '')}
                        onChange={e => handleVarEdit(v.name, e.target.value)}
                        variant="outlined"
                        sx={{ width: 120 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => handleVarUpdate(v.name)}
                        disabled={updateStatus[v.name] === 'updating'}
                      >
                        {updateStatus[v.name] === 'updating' ? 'Updating...' : 'Update'}
                      </Button>
                      {updateStatus[v.name] === 'success' && <span style={{ color: 'green', marginLeft: 8 }}>✔</span>}
                      {updateStatus[v.name] === 'error' && <span style={{ color: 'red', marginLeft: 8 }}>✖</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Alert Rules Section */}
      <Box mt={4}>
        <Typography variant="h5" gutterBottom>Grafana Alert Rules</Typography>
        {alertRulesLoading && <Typography>Loading alert rules...</Typography>}
        {alertRulesError && <Typography color="error">{alertRulesError}</Typography>}
        {(alertRules && alertRules.length > 0) ? (
          <TableContainer component={Paper} sx={{ maxWidth: 700 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Rule Name</TableCell>
                  <TableCell>Threshold</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {alertRules.map(rule => {
                  // Find threshold value from rule data (refId C)
                  let threshold = "";
                  if (rule.data) {
                    const cData = rule.data.find(d => d.refId === "C");
                    if (cData && cData.model && cData.model.conditions && cData.model.conditions[0] && cData.model.conditions[0].evaluator && Array.isArray(cData.model.conditions[0].evaluator.params)) {
                      threshold = cData.model.conditions[0].evaluator.params[0];
                    }
                  }
                  return (
                    <TableRow key={rule.uid}>
                      <TableCell>{rule.title || rule.name || rule.uid}</TableCell>
                      <TableCell>
                        <MaterialUI.TextField
                          size="small"
                          type="number"
                          value={thresholdEdits[rule.uid] !== undefined ? thresholdEdits[rule.uid] : threshold}
                          onChange={e => handleThresholdEdit(rule.uid, e.target.value)}
                          variant="outlined"
                          sx={{ width: 100 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => handleThresholdUpdate(rule.uid)}
                          disabled={thresholdStatus[rule.uid] === "updating"}
                        >
                          {thresholdStatus[rule.uid] === "updating" ? "Updating..." : "Update"}
                        </Button>
                        {thresholdStatus[rule.uid] === "success" && <span style={{ color: "green", marginLeft: 8 }}>✔</span>}
                        {thresholdStatus[rule.uid] === "error" && <span style={{ color: "red", marginLeft: 8 }}>✖</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          (!alertRulesLoading && alertRules && alertRules.length === 0) && (
            <Typography>No alert rules found.</Typography>
          )
        )}
      </Box>
    </Box>
  );
}
// VariablesSection: Settings page dashboard/variable management
const { AppBar, Toolbar, Typography, Button, Box, TreeView, TreeItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Tooltip, Menu, MenuItem, CircularProgress } = MaterialUI;

const API_BASE_URL = "http://localhost:53001";
const GRAFANA_API_URL = `${API_BASE_URL}/grafana/dashboards`;


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
  const [playing, setPlaying] = React.useState(true);

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
    if (!slides.length || !playing) return;
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [slides.length, playing]);

  React.useEffect(() => {
    if (!slides.length) return;
    const file = slides[index].file;
    if (!file) { setHtmlContent(""); return; }
    fetch('./public/' + file)
      .then(res => res.text())
      .then(html => {
        // Wrap images in a div and constrain their size
        // Replace <img ...> with <img ... class="slide-img" />
        const processed = html.replace(/<img([^>]*)>/g, '<img$1 class="slide-img" />');
        setHtmlContent(processed);
      })
      .catch(() => setHtmlContent("<div>Failed to load content.</div>"));
  }, [slides, index]);

  if (loading) return <Typography>Loading slides...</Typography>;
  if (error) return <Typography color="error">{error}</Typography>;
  if (!slides.length) return null;

  return (
    <Box
      height="90%"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      sx={{ minHeight: 300, position: 'relative' }}
    >
      {/* Slide image size override */}
      <style>{`
        .slide-img {
          max-width: 70%;
          width: auto;
          height: auto;
          display: block;
          margin: 16px auto; /* center horizontally */
        }
      `}</style>
      <Box width="100%" display="flex" flexDirection="column" alignItems="center">
        <Box width="100%" display="flex" alignItems="center" justifyContent="flex-start" mb={2}>
          <Typography variant="h3" gutterBottom sx={{ textAlign: 'left', width: '100%' }}>
            {slides[index].title}
          </Typography>
        </Box>
        <Typography variant="subtitle1" gutterBottom component="div" sx={{ textAlign: 'center', width: '100%' }}>
          <span dangerouslySetInnerHTML={{ __html: htmlContent }} />
        </Typography>
      </Box>
      {/* Play/Pause buttons in bottom right corner */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 24,
          right: 32,
          display: 'flex',
          alignItems: 'center',
          zIndex: 2,
          gap: '8px'
        }}
      >
        <Button
          variant="contained"
          size="small"
          onClick={() => setPlaying(false)}
          disabled={!playing}
          sx={{ minWidth: 36, marginRight: '5px'}}
        >
          &#10073;&#10073; Pause
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={() => setPlaying(true)}
          disabled={playing}
          sx={{ minWidth: 36  }}
        >
          &#9654; Play
        </Button>
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

  // Fetch dashboards from backend API (which proxies Grafana)
  React.useEffect(() => {
    setDashboardsLoading(true);
    fetch(GRAFANA_API_URL)
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
    ? `http://localhost:53000/d/${selectedDashboard.uid || selectedDashboard.id}/${selectedDashboard.slug || selectedDashboard.uri.replace('db/', '')}?orgId=1&refresh=auto&from=now-5m&to=now&kiosk`
    : "http://localhost:53000/d/deqcaxn5g7vnkd/zus80lp-compact?orgId=1&refresh=auto&from=now-5m&to=now&kiosk";
  const noderedURL = "http://localhost:51880";
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
  
            <Button 
              color="inherit" 
              onClick={() => setView("settings")}
              style={{ 
                backgroundColor: view === "settings" ? "rgba(255,255,255,0.1)" : "transparent",
                fontWeight: view === "settings" ? "bold" : "normal"
              }}
            >
              Settings
            </Button>
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

      <Box flexGrow={1} overflow="hidden" sx={{ background: '#fff' }}>
        {view === "home" && (
          <>
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
            <HomeSlides />
          </>
        )}

        {view === "settings" && !kioskMode && (
          <Box
            height="100%"
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="flex-start"
            textAlign="center"
            p={2}
            maxWidth={700}
            margin="auto"
          >
            <Typography variant="h3" gutterBottom>
              Settings
            </Typography>
            <Settings />
          </Box>
        )}

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