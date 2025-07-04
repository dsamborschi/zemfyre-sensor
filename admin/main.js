const {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Box
} = MaterialUI;

function App() {
  const [view, setView] = React.useState("home");

  const grafanaURL = "http://localhost:53000/d/deqcaxn5g7vnkd/zus80lp-compact?orgId=1&refresh=auto&from=now-5m&to=now&kiosk";

  return (
    <React.Fragment>
      {/* Sticky AppBar */}
      <AppBar position="sticky" color="primary">
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
      <Container maxWidth="lg">
        {view === "home" && (
          <Box mt={8} textAlign="center">
            <Typography variant="h3" gutterBottom>
              Welcome to Zemfyre
            </Typography>
            <Typography variant="subtitle1" gutterBottom>
              Use the navigation above to access the Dashboard or Demo.
            </Typography>
          </Box>
        )}

        {view === "dashboard" && (
          <Box mt={4} style={{ height: "80vh" }}>
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
          <Box mt={4} textAlign="center">
            <Typography variant="h4">Demo Section</Typography>
            {/* Demo content goes here */}
          </Box>
        )}
      </Container>
    </React.Fragment>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));
