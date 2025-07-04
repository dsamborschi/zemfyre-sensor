const {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box
} = MaterialUI;

function App() {
  const [view, setView] = React.useState("home");

  const grafanaURL =
    "http://localhost:53000/d/deqcaxn5g7vnkd/zus80lp-compact?orgId=1&refresh=auto&from=now-5m&to=now&kiosk";

  return (
    <Box display="flex" flexDirection="column" height="100vh">
      {/* Sticky AppBar */}
      <AppBar position="static" color="primary">
        <Toolbar>
          <Typography variant="h6" style={{ flexGrow: 1 }}>
            Zemfyre Admin
          </Typography>
          <Button color="inherit" onClick={() => setView("dashboard")}>
            Dashboard
          </Button>
          <Button color="inherit" onClick={() => setView("demo")}>
            Demo
          </Button>
        </Toolbar>
      </AppBar>

      {/* Main Content Area */}
      <Box flexGrow={1} overflow="hidden">
        {view === "home" && (
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
              Use the navigation above to access the Dashboard or Demo.
            </Typography>
          </Box>
        )}

        {view === "dashboard" && (
          <Box height="100%">
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

        {view === "demo" && (
          <Box
            height="100%"
            display="flex"
            alignItems="center"
            justifyContent="center"
            textAlign="center"
          >
            <Typography variant="h4">Demo Section</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));