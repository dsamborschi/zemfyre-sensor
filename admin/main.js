// Assumes React, ReactDOM, and Material UI are loaded globally
const { Button, AppBar, Toolbar, Typography, Container, Box } = MaterialUI;

function App() {
  return (
    <React.Fragment>
      <AppBar position="static" color="primary">
        <Toolbar>
          <Typography variant="h6" style={{ flexGrow: 1 }}>
            Zemfyre Admin
          </Typography>
          <Button color="inherit" href="#dashboard">Dashboard</Button>
          <Button color="inherit" href="#demo">Demo</Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="sm">
        <Box mt={8} textAlign="center">
          <Typography variant="h3" gutterBottom>
            Welcome to Zemfyre Admin
          </Typography>
          <Typography variant="subtitle1" gutterBottom>
            Use the navigation above to access the Dashboard or Demo.
          </Typography>
        </Box>
      </Container>
    </React.Fragment>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));
