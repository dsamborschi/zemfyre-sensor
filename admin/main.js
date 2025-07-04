const {
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Box
} = MaterialUI;

function App() {
  const [view, setView] = React.useState("home");
  const [kioskMode, setKioskMode] = React.useState(false);

  const grafanaURL =
    "http://localhost:53000/d/deqcaxn5g7vnkd/zus80lp-compact?orgId=1&refresh=auto&from=now-5m&to=now&kiosk";

  const noderedURL = "http://localhost:51880/";

  return (
    <Box display="flex" flexDirection="column" height="100vh">
      {/* Conditionally Render AppBar */}
      {!kioskMode && (
        <AppBar position="static" style={{ backgroundColor: '#0A2239' }}>
          <Toolbar>
            <Box sx={{ flexGrow: 1 }}>
              <img src="./public/images/logo.svg" alt="Zemfyre Logo" style={{ height: 40 }} />
            </Box>
            <Button color="inherit" onClick={() => setView("home")}>
              Home
            </Button>
            <Button color="inherit" onClick={() => setView("dashboard")}>
              Dashboards
            </Button>
             <Button color="inherit" onClick={() => setView("nodered")}>
              Node-Red
            </Button>
            <Button color="inherit" onClick={() => setView("settings")}>
              Settings
            </Button>
            <Button color="inherit" onClick={() => setKioskMode(true)}>
              Kiosk Mode
            </Button>
          </Toolbar>
        </AppBar>
      )}

      {/* Main Content Area */}
      <Box flexGrow={1} overflow="hidden">
        {view === "home" && !kioskMode && (
          <Box
            height="100%"
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            textAlign="center"
          >
            <Typography variant="h3" gutterBottom>
              Welcome to Zemfyre
            </Typography>
            <Typography variant="subtitle1" gutterBottom>
              Industrial Ethernet Solutions
            </Typography>
          </Box>
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
                  zIndex: 10
                }}
                onClick={() => setKioskMode(false)}
              >
                Exit Kiosk
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

        {view === "nodered" && !kioskMode && (
         <Box height="100%" position="relative">
            {kioskMode && (
              <Button
                variant="contained"
                size="small"
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  zIndex: 10
                }}
                onClick={() => setKioskMode(false)}
              >
                Exit Kiosk
              </Button>
            )}
            <iframe
              src={noderedURL}
              title="Grafana Dashboard"
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
