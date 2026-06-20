function Settings() {
  const [piTime, setPiTime] = React.useState(null);
  const [browserNow, setBrowserNow] = React.useState(new Date());
  const [syncing, setSyncing] = React.useState(false);
  const [syncMsg, setSyncMsg] = React.useState(null);
  const lastAutoSync = React.useRef(0);

  const AUTO_SYNC_THRESHOLD_MS = 30000;
  const AUTO_SYNC_COOLDOWN_MS = 120000;

  const fetchPiTime = () => {
    fetch(`${API_BASE_URL}/system-time`)
      .then(res => res.json())
      .then(data => setPiTime(new Date(data.time)))
      .catch(() => {});
  };

  const doSync = (silent) => {
    if (syncing) return;
    setSyncing(true);
    if (!silent) setSyncMsg(null);
    fetch(`${API_BASE_URL}/sync-time`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp: new Date().toISOString() })
    })
      .then(res => res.json())
      .then(data => {
        setSyncing(false);
        lastAutoSync.current = Date.now();
        fetchPiTime();
        if (!silent) {
          const adj = data.differenceMs ? `${Math.abs(data.differenceMs / 1000).toFixed(1)}s` : '';
          setSyncMsg({ ok: !data.error, text: data.error || `Synced${adj ? ` (adjusted ${adj})` : ''}` });
          setTimeout(() => setSyncMsg(null), 5000);
        }
      })
      .catch(err => {
        setSyncing(false);
        if (!silent) setSyncMsg({ ok: false, text: err.message });
      });
  };

  React.useEffect(() => {
    fetchPiTime();
    const t = setInterval(fetchPiTime, 5000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    const t = setInterval(() => setBrowserNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    if (!piTime || syncing) return;
    const drift = Math.abs(piTime.getTime() - browserNow.getTime());
    if (drift < AUTO_SYNC_THRESHOLD_MS) return;
    if (Date.now() - lastAutoSync.current < AUTO_SYNC_COOLDOWN_MS) return;
    doSync(true);
  }, [piTime, browserNow]);

  const skewMs = piTime ? piTime.getTime() - browserNow.getTime() : null;
  const skewAbs = skewMs !== null ? Math.abs(skewMs) : null;
  const inSync = skewAbs !== null && skewAbs < 2000;

  const row = (label, value, valueColor) => (
    <Box display="flex" justifyContent="space-between" alignItems="center" py={1}
      sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={500} color={valueColor || 'text.primary'}>{value}</Typography>
    </Box>
  );

  return (
    <Box width="100%" textAlign="left" mt={2} maxWidth={520}>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 11, color: 'text.secondary' }}>
        System Time
      </Typography>
      <Paper variant="outlined" sx={{ p: 0, overflow: 'hidden' }}>
        <Box px={2.5} pt={0.5}>
          {row('Pi', piTime ? piTime.toLocaleString() : '—')}
          {row('Browser', browserNow.toLocaleString())}
          {row('Delta',
            skewMs === null ? '—' : inSync ? 'In sync' : `${(skewMs / 1000).toFixed(1)}s off`,
            inSync ? 'success.main' : skewAbs > 30000 ? 'error.main' : 'warning.main'
          )}
        </Box>
        <Box px={2.5} py={1.5} display="flex" alignItems="center" gap={2} bgcolor="action.hover">
          <Button variant="contained" size="small" onClick={() => doSync(false)} disabled={syncing}
            startIcon={syncing ? <CircularProgress size={13} /> : null}>
            {syncing ? 'Syncing…' : 'Sync Now'}
          </Button>
          {syncMsg && (
            <Typography variant="body2" color={syncMsg.ok ? 'success.main' : 'error.main'}>
              {syncMsg.ok ? '✔' : '✖'} {syncMsg.text}
            </Typography>
          )}
        </Box>
      </Paper>
    </Box>
  );
}

function CleanDatabase() {
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);

  const handleDelete = () => {
    setBusy(true);
    setResult(null);
    fetch(`${API_BASE_URL}/influxdb/delete-all`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        setResult(data.ok ? { ok: true, text: 'All data deleted.' } : { ok: false, text: data.error });
      })
      .catch(e => setResult({ ok: false, text: e.message }))
      .finally(() => { setBusy(false); setConfirm(false); });
  };

  return (
    <Box width="100%" textAlign="left" mt={3} maxWidth={520}>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 11, color: 'text.secondary' }}>
        Database
      </Typography>
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Permanently delete all measurements from the <strong>ZUS80LP</strong> bucket. This cannot be undone.
        </Typography>
        {!confirm ? (
          <Button variant="outlined" color="error" size="small" onClick={() => { setConfirm(true); setResult(null); }}>
            Clean Database
          </Button>
        ) : (
          <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
            <Typography variant="body2" color="error.main" fontWeight={500}>Delete all data?</Typography>
            <Button variant="contained" color="error" size="small" onClick={handleDelete} disabled={busy}
              startIcon={busy ? <CircularProgress size={13} /> : null}>
              {busy ? 'Deleting…' : 'Yes, delete all'}
            </Button>
            <Button variant="outlined" size="small" onClick={() => setConfirm(false)} disabled={busy}>Cancel</Button>
          </Box>
        )}
        {result && (
          <Typography variant="body2" color={result.ok ? 'success.main' : 'error.main'} mt={1.5}>
            {result.ok ? '✔' : '✖'} {result.text}
          </Typography>
        )}
      </Paper>
    </Box>
  );
}

function Diagnostics() {
  const [services, setServices] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [lastUpdated, setLastUpdated] = React.useState(null);

  const fetchDiagnostics2 = () => {
    fetch(`${API_BASE_URL}/diagnostics`)
      .then(res => res.json())
      .then(data => { setServices(data); setLoading(false); setLastUpdated(new Date()); })
      .catch(() => setLoading(false));
  };

  React.useEffect(() => {
    fetchDiagnostics2();
    const t = setInterval(fetchDiagnostics2, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <Box width="100%" textAlign="left" mt={3} maxWidth={520}>
      <Box display="flex" justifyContent="space-between" alignItems="baseline" mb={0.5}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 11, color: 'text.secondary' }}>
          Diagnostics
        </Typography>
        {lastUpdated && (
          <Typography variant="caption" color="text.disabled">
            Updated {lastUpdated.toLocaleTimeString()}
          </Typography>
        )}
      </Box>
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        {loading ? (
          <Box p={2.5}><CircularProgress size={20} /></Box>
        ) : (
          services.map((svc, i) => (
            <Box key={svc.name} display="flex" alignItems="center" gap={2} px={2.5} py={1.25}
              sx={{ borderBottom: i < services.length - 1 ? '1px solid' : 'none', borderColor: 'divider' }}>
              <Typography variant="body2" color="text.primary" sx={{ width: 100, flexShrink: 0 }}>{svc.name}</Typography>
              <Box display="flex" alignItems="center" gap={1} sx={{ width: 110, flexShrink: 0 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: svc.ok ? 'success.main' : 'error.main', flexShrink: 0 }} />
                <Typography variant="body2" fontWeight={600} color={svc.ok ? 'success.main' : 'error.main'}>
                  {svc.ok ? 'Online' : 'Offline'}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.disabled" sx={{ flex: 1 }}>
                {svc.detail}
              </Typography>
            </Box>
          ))
        )}
      </Paper>
    </Box>
  );
}

// VariablesSection: Settings page dashboard/variable management
const { AppBar, Toolbar, Typography, Button, Box, TreeView, TreeItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Tooltip, Menu, MenuItem, CircularProgress } = MaterialUI;

// Always target the API on the same host that serves the admin UI.
const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:53001`;
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
    }, 8000);
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
      {/* Play/Pause buttons in bottom right corner (commented out for kiosk mode) */}
      {/**
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
          &#10073;&#10073;
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={() => setPlaying(true)}
          disabled={playing}
          sx={{ minWidth: 36  }}
        >
          &#9654; 
        </Button>
      </Box>
      */}
    </Box>
  );
}

function App() {
  const [view, setView] = React.useState("dashboard");

  // Sync Pi system clock to browser time on load
  React.useEffect(() => {
    fetch(`${API_BASE_URL}/sync-time`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp: new Date().toISOString() })
    }).catch(err => console.warn('Time sync failed:', err));
  }, []);

  // Grafana dashboards state
  const [dashboards, setDashboards] = React.useState([]);
  const [dashboardsLoading, setDashboardsLoading] = React.useState(false);
  const [dashboardsError, setDashboardsError] = React.useState(null);
  const [selectedDashboard, setSelectedDashboard] = React.useState(null);
  const [dashboardMenuAnchor, setDashboardMenuAnchor] = React.useState(null);

  // Fetch dashboards from backend API (which proxies Grafana) - COMMENTED OUT
  /*
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
  */

  // Compute Grafana iframe URL (use dynamic hostname like API_BASE_URL)
  const grafanaBaseURL = `${window.location.protocol}//${window.location.hostname}:53000`;
  const grafanaURL = selectedDashboard
    ? `${grafanaBaseURL}/d/${selectedDashboard.uid || selectedDashboard.id}/${selectedDashboard.slug || selectedDashboard.uri.replace('db/', '')}?orgId=1&refresh=1s&from=now-5m&to=now`
    : `${grafanaBaseURL}/d/deqcaxn5g7vnkd/zus80lp-compact?orgId=1&refresh=1s&from=now-5m&to=now`;
  const noderedURL = `${window.location.protocol}//${window.location.hostname}:51880`;

  return (
    <Box display="flex" flexDirection="column" height="100vh">
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
              onClick={() => setView("dashboard")}
              style={{
                backgroundColor: view === "dashboard" ? "rgba(255,255,255,0.1)" : "transparent",
                fontWeight: view === "dashboard" ? "bold" : "normal"
              }}
            >
              Dashboard
            </Button>
            {/* Dashboards dropdown commented out
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
            */}
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
          </Toolbar>
        </AppBar>

      <Box flexGrow={1} overflow="hidden" sx={{ background: '#fff' }}>
        {view === "home" && (
          <HomeSlides />
        )}

        {view === "settings" && (
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
            <CleanDatabase />
            <Diagnostics />
          </Box>
        )}

        {view === "mqtt" && (
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
      </Box>
    </Box>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));